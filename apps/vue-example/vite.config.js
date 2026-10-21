import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  base: process.env.SHOWCASE_BASE ?? "/",
  publicDir: fileURLToPath(
    new URL("../../packages/showcase/dist/site", import.meta.url),
  ),
});
