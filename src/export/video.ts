import { framesOf, type Frame } from '../domain/frames';
import { HOLD_MS, playbackLength, poseAt } from '../domain/playback';
import { refreshPaths } from '../domain/regenerate';
import type { Play } from '../domain/types';
import { playToSvg } from './render';
import { boardView } from './view';

/*
 * A running play, as a video a coach can drop into the team chat.
 *
 * Every frame is drawn by the exporter — the same components as the board,
 * the card and the printed sheet — and posed by `poseAt`, the same function
 * the board's own playback runs on. So the video cannot show a play moving
 * differently from the way it moves on the screen, and it cannot draw a play
 * differently from the way it prints.
 *
 * Recorded off a canvas with MediaRecorder: nothing to download and no encoder
 * to ship. Chrome on Android writes WebM, which every chat app takes; anything
 * that can write MP4 does.
 */

export const VIDEO_FPS = 24;
/** A beat on the set before anybody moves, so the eye finds the formation. */
const LEAD_MS = 600;

/** Each frame of the video, as an SVG, in order. Pure, so it can be tested. */
export function videoFrames(play: Play, fps = VIDEO_FPS): string[] {
  const frames: Frame[] = framesOf(play).map((f) => ({
    ...f,
    assignments: refreshPaths(f.assignments, f.players),
  }));
  const view = boardView(play);
  // The last step's hold is kept, so the video ends on where everybody got to.
  const total = LEAD_MS + playbackLength(frames) - HOLD_MS / 2;
  const count = Math.ceil((total / 1000) * fps);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const ms = Math.max(0, (i * 1000) / fps - LEAD_MS);
    const pose = poseAt(frames, ms);
    const step = frames[pose.step];
    const posed: Play = {
      ...play,
      players: pose.players,
      assignments: step.assignments,
      annotations: step.annotations,
      ballCarrierId: pose.holder ?? undefined,
      frames: undefined,
    };
    out.push(playToSvg(posed, { view, ball: pose.ball, fadeLines: true }));
  }
  return out;
}

/** The container this device can write, best first. */
function pickType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of [
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

export function canRecordVideo(): boolean {
  return pickType() !== null && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

async function decode(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return img;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Record the play. Every frame is decoded before recording starts, so a slow
 * phone takes longer to get going rather than recording a stutter.
 */
export async function playToVideo(
  play: Play,
  widthPx = 720,
  onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const type = pickType();
  if (!type) throw new Error('This browser cannot record video.');
  const view = boardView(play);
  const width = Math.round(widthPx / 2) * 2;
  const height = Math.round((width * view.h) / view.w / 2) * 2;

  const svgs = videoFrames(play);
  const images: HTMLImageElement[] = [];
  for (const [i, svg] of svgs.entries()) {
    images.push(await decode(svg));
    onProgress?.((i / svgs.length) * 0.5);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(images[0], 0, 0, width, height);

  const stream = canvas.captureStream(VIDEO_FPS);
  const recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  const began = performance.now();
  for (const [i, img] of images.entries()) {
    ctx.drawImage(img, 0, 0, width, height);
    onProgress?.(0.5 + (i / images.length) * 0.5);
    // Paced against the clock rather than frame to frame, so a late frame is
    // caught up on instead of stretching the whole video.
    await wait(Math.max(0, began + ((i + 1) * 1000) / VIDEO_FPS - performance.now()));
  }
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  return { blob: new Blob(chunks, { type: type.mime.split(';')[0] }), ext: type.ext };
}
