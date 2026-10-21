import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: process.env.SHOWCASE_BASE ?? "/",
  publicDir: fileURLToPath(new URL("../../packages/showcase/dist/site", import.meta.url))
});
