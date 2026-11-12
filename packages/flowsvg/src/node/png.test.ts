import type { Browser } from "playwright-core";
import { expect, it, vi } from "vitest";
import { exportPng } from "../node.js";
vi.mock("node:fs/promises", async (loadOriginal) => {
  const original = await loadOriginal<typeof import("node:fs/promises")>();
  return { ...original, readFile: vi.fn(async () => "") };
});
const input = { version: 1, viewport: { width: 80, height: 40 }, nodes: [], edges: [], scenes: [] };
it("rejects malformed runtime emphasis as options before acquiring a Node PNG browser", async () => {
  const newContext = vi.fn();
  const browser = { newContext } as unknown as Browser;
  for (const emphasis of [null, [], { fill: "red" }, { markerText: null }, { unknown: "#fff" }]) {
    await expect(exportPng(input, { browser, emphasis } as unknown as Parameters<typeof exportPng>[1])).rejects.toMatchObject({ code: "options", message: expect.stringContaining("options.emphasis") });
  }
  expect(newContext).not.toHaveBeenCalled();
});
it("rejects invalid PNG requests before acquiring caller browser resources", async () => {
  const newContext = vi.fn();
  const browser = { newContext } as unknown as Browser;
  for (const options of [{ width: 0 }, { width: 9000 }, { timeMs: 1 }, { background: "invalid" }]) {
    await expect(exportPng(input, { ...options, browser } as Parameters<typeof exportPng>[1])).rejects.toHaveProperty("code");
  }
  await expect(exportPng(input, { browser, executablePath: "/unused" })).rejects.toMatchObject({ code: "options" });
  await expect(exportPng({ ...input, version: 2 }, { browser })).rejects.toMatchObject({ code: "document" });
  expect(newContext).not.toHaveBeenCalled();
});
it("classifies cleanup failures instead of exposing an untyped bridge error", async () => {
  const context = { async newPage() { throw new Error("page failed"); }, async close() { throw new Error("context close failed"); } };
  const browser = { async newContext() { return context; } } as unknown as Browser;
  await expect(exportPng(input, { browser })).rejects.toMatchObject({ name: "PngExportError", code: "environment" });
});
