import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  base: process.env.SHOWCASE_BASE ?? "/",
  publicDir: fileURLToPath(new URL("../../packages/showcase/dist/site", import.meta.url))
});
