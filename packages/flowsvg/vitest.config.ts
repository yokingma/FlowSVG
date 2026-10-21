import { defineConfig } from "vitest/config";

// Offline integration files rebuild the shared dist directory. Run files sequentially so builds cannot delete each other's assets.
export default defineConfig({ test: { fileParallelism: false } });
