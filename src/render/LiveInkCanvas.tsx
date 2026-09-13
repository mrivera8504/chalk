import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface InkPoint {
  /** Client coordinates. Converted to yards only when the stroke is committed. */
  x: number;
  y: number;
}

export interface InkHandle {
  /** Repaint the in-progress stroke. Called at pointer rate, not React's. */
  draw(points: InkPoint[], predicted?: InkPoint[]): void;
  clear(): void;
}

/**
 * The in-progress stroke only. React cannot reconcile at the rate a pen
 * reports, so the live stroke is painted imperatively here and handed to the
 * SVG layer on release, at which point this clears.
 */
export const LiveInkCanvas = forwardRef<InkHandle, { color?: string }>(function LiveInkCanvas(
  { color = 'var(--ink-route)' },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ink = useRef('#7fd4ff');

  // Resolve the token once: canvas takes no CSS custom properties.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const name = color.match(/var\((--[\w-]+)\)/)?.[1];
    ink.current = name
      ? getComputedStyle(el).getPropertyValue(name).trim() || '#7fd4ff'
      : color;
  }, [color]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;

    const fit = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      el.width = Math.round(r.width * dpr);
      el.height = Math.round(r.height * dpr);
      const g = el.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineCap = 'round';
      g.lineJoin = 'round';
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    draw(points, predicted) {
      const el = canvas.current;
      const g = el?.getContext('2d');
      if (!el || !g || points.length < 2) return;

      const r = el.getBoundingClientRect();
      g.clearRect(0, 0, el.width, el.height);
      g.strokeStyle = ink.current;
      g.lineWidth = 2.4;

      g.beginPath();
      g.moveTo(points[0].x - r.left, points[0].y - r.top);
      for (let i = 1; i < points.length; i++) g.lineTo(points[i].x - r.left, points[i].y - r.top);
      g.stroke();

      // The predicted tail is a guess at where the pen is heading. It hides the
      // last few milliseconds of latency and is never committed to the stroke.
      if (predicted?.length) {
        g.globalAlpha = 0.35;
        g.beginPath();
        const last = points[points.length - 1];
        g.moveTo(last.x - r.left, last.y - r.top);
        for (const p of predicted) g.lineTo(p.x - r.left, p.y - r.top);
        g.stroke();
        g.globalAlpha = 1;
      }
    },
    clear() {
      const el = canvas.current;
      const g = el?.getContext('2d');
      if (el && g) g.clearRect(0, 0, el.width, el.height);
    },
  }));

  return <canvas ref={canvas} className="ink" />;
});
