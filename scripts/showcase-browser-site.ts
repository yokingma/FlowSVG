/** Build real Vite apps and expose only their static output to browser acceptance. */
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json"
};

/** Temporary outputs, static origin and real browser owned by one acceptance suite. */
export interface ShowcaseSite {
  root: string;
  origin: string;
  browser: Browser;
  page: Page;
  close(): Promise<void>;
}

/** Build acceptance, formal and empty inputs separately to detect stale selected content. Never install a browser. */
export async function startShowcaseSite(packageName: string): Promise<ShowcaseSite> {
  const root = await mkdtemp(join(tmpdir(), `${packageName}-showcase-`));
  let server: Server | undefined;
  let browser: Browser | undefined;
  const close = async (): Promise<void> => {
    await browser?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((done) => server!.close(() => done()));
    }
    await rm(root, { recursive: true, force: true });
  };
  try {
    buildSite(packageName, root, "acceptance", "dist/acceptance.js");
    buildSite(packageName, root, "formal", "dist/formal.js");
    buildSite(packageName, root, "empty", "dist/acceptance-empty.js");
    server = createServer((request, response) => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      const target = resolve(root, `.${path.endsWith("/") ? `${path}index.html` : path}`);
      if (!target.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
      void readFile(target).then((content) => {
        response.setHeader("Content-Type", MIME_TYPES[extname(target)] ?? "application/octet-stream");
        response.end(content);
      }, () => { response.writeHead(404).end(); });
    });
    await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Static server has no TCP address");
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ executablePath: process.env.FLOWSVG_CHROMIUM_PATH });
    const page = await browser.newPage({ acceptDownloads: true });
    return { root, origin, browser, page, close };
  } catch (error) {
    await close();
    throw error;
  }
}

function buildSite(packageName: string, root: string, profile: string, source: string): void {
  execFileSync("pnpm", ["--filter", packageName, "build", "--outDir", join(root, profile), "--emptyOutDir"], {
    cwd: REPO_ROOT,
    env: { ...process.env, SHOWCASE_SOURCE: source, SHOWCASE_BASE: `/${profile}/` },
    stdio: "pipe"
  });
}
