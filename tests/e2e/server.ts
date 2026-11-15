import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;

/** The app itself, served the way `npm run dev` serves it. */
export async function setup() {
  server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
  await server.listen();
  process.env.CHALK_URL = 'http://localhost:5199/';
}

export async function teardown() {
  await server?.close();
}
