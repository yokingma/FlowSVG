import { afterEach, expect, it, vi } from "vitest";
import { exportPng, PngExportError, type PngExportOptions } from "../export.js";
import type { DiagramDocument } from "../index.js";
const input: DiagramDocument = { version: 1, viewport: { width: 80, height: 40 }, nodes: [], edges: [], scenes: [] };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("rejects malformed PNG options, documents, times and dimensions before allocating browser resources", async () => {
  const createElement = vi.fn(); vi.stubGlobal("document", { createElement });
  const invalid = [null, [], { width: 0 }, { width: -1 }, { width: NaN }, { width: Infinity }, { timeMs: -1 }, { timeMs: 1 }, { timeMs: NaN }, { background: "white" }, { theme: "auto" }, { reducedMotion: 1 }, { signal: {} }];
  for (const options of invalid) await expect(exportPng(input, options as unknown as PngExportOptions)).rejects.toMatchObject({ code: "options" });
  for (const width of [8193, 8001]) await expect(exportPng(input, { width })).rejects.toMatchObject({ code: "limit" });
  await expect(exportPng({ ...input, version: 99 } as unknown as DiagramDocument)).rejects.toBeInstanceOf(PngExportError);
  await expect(exportPng({ ...input, version: 99 } as unknown as DiagramDocument)).rejects.toMatchObject({ code: "document" });
  expect(createElement).not.toHaveBeenCalled();
});

function installBrowser() {
  const painted: { width: number; height: number; svg: string }[] = [];
  const canvases: { width: number; height: number }[] = [];
  const images: { src: string }[] = [];
  const blobs = new Map<string, Blob>();
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const encode = vi.fn((callback: BlobCallback) => callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
  vi.stubGlobal("document", { createElement: () => { const canvas = { width: 0, height: 0, getContext: () => context, toBlob: encode }; canvases.push(canvas); return canvas; }, fonts: { load: vi.fn(async () => []), ready: Promise.resolve() } });
  vi.stubGlobal("Image", class { src = ""; constructor() { images.push(this); } async decode() { const canvas = canvases.at(-1)!; painted.push({ width: canvas.width, height: canvas.height, svg: await blobs.get(this.src)!.text() }); } });
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => { const url = `blob:${blobs.size}`; blobs.set(url, blob as Blob); return url; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => { blobs.delete(url); });
  return { painted, canvases, images, blobs, context, encode };
}
it("returns single-frame bytes at rounded camera dimensions and preserves its initial snapshot", async () => {
  const services = installBrowser();
  const mutable = structuredClone(input);
  const options: PngExportOptions = { width: 121.4, background: "transparent", theme: "dark" };
  const pending = exportPng(mutable, options);
  mutable.viewport.width = 10; options.width = 5; options.background = "theme";
  expect(await pending).toEqual(new Uint8Array([137, 80, 78, 71]));
  expect(services.painted).toHaveLength(1);
  expect(services.painted[0]).toMatchObject({ width: 121, height: 61 });
  expect(services.painted[0]!.svg).toContain('viewBox="0 0 80 40"');
  expect(services.painted[0]!.svg).not.toContain('<rect x="0" y="0"');
  expect(services.context.fillRect).not.toHaveBeenCalled();
  expect(services.blobs.size).toBe(0);
  expect(services.images.every((image) => image.src === "")).toBe(true);
  expect(services.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
});
it("classifies unavailable canvas context services and releases the allocated canvas", async () => {
  const services = installBrowser();
  const canvas = { width: 0, height: 0, getContext() { throw new Error("Canvas disabled by browser"); } };
  vi.stubGlobal("document", { createElement: () => canvas });
  await expect(exportPng(input)).rejects.toMatchObject({ code: "environment" });
  expect(canvas).toMatchObject({ width: 0, height: 0 });
  expect(services.blobs.size).toBe(0);
});
it.each(["fonts", "decode", "encode"] as const)("cancels while %s is pending, releases resources and allows retry", async (phase) => {
  const services = installBrowser();
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, "addEventListener");
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  let reached: () => void = () => {};
  const waiting = new Promise<void>((resolve) => { reached = resolve; });
  if (phase === "fonts") vi.mocked(document.fonts.load).mockImplementation(() => { reached(); return new Promise(() => {}); });
  if (phase === "decode") vi.stubGlobal("Image", class { src = ""; constructor() { services.images.push(this); } decode() { reached(); return new Promise<void>(() => {}); } });
  if (phase === "encode") services.encode.mockImplementation(() => { reached(); });
  const pending = exportPng(input, { signal: controller.signal });
  await waiting;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  expect(services.blobs.size).toBe(0);
  expect(services.images.every((image) => image.src === "")).toBe(true);
  expect(services.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  expect(add.mock.calls.length).toBe(remove.mock.calls.length);
  installBrowser();
  expect((await exportPng(input)).length).toBeGreaterThan(0);
});
it.each(["environment", "rasterization", "encoding"] as const)("classifies %s errors and releases task resources", async (code) => {
  const services = installBrowser();
  if (code === "environment") vi.mocked(document.fonts.load).mockRejectedValue(new Error("Font service unavailable"));
  if (code === "rasterization") services.context.drawImage.mockImplementation(() => { throw new Error("SVG blocked"); });
  if (code === "encoding") services.encode.mockImplementation((callback) => callback(null));
  await expect(exportPng(input)).rejects.toMatchObject({ code });
  expect(services.blobs.size).toBe(0);
  expect(services.images.every((image) => image.src === "")).toBe(true);
  expect(services.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
});
it("accepts the rounded limits and one-pixel minimum but rejects arithmetic and fitted-camera overflow", async () => {
  const services = installBrowser();
  await exportPng({ ...input, viewport: { width: 8192, height: 1 } }, { width: 8192.49 });
  await exportPng({ ...input, viewport: { width: 8000, height: 4000 } });
  await exportPng(input, { width: 0.1 });
  expect(services.painted.map(({ width, height }) => [width, height])).toEqual([[8192, 1], [8000, 4000], [1, 1]]);
  const prior = services.canvases.length;
  await expect(exportPng({ ...input, viewport: { width: 8192, height: 1 } }, { width: 8192.5 })).rejects.toMatchObject({ code: "limit" });
  await expect(exportPng({ ...input, viewport: { width: Number.MIN_VALUE, height: 1 } })).rejects.toMatchObject({ code: "limit" });
  await expect(exportPng({ ...input, viewport: { width: 80, height: 40, fitHeight: { padding: 0 } }, nodes: [{ id: "a", kind: "rect", x: 1, y: 1, width: 10, height: 9000 }] })).rejects.toMatchObject({ code: "limit" });
  expect(services.canvases).toHaveLength(prior);
});
it("rejects already cancelled tasks without allocating resources", async () => {
  const services = installBrowser(); const controller = new AbortController(); controller.abort();
  await expect(exportPng(input, { signal: controller.signal })).rejects.toMatchObject({ code: "cancelled" });
  expect(services.canvases).toHaveLength(0);
});
