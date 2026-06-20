import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": "http://localhost:3001"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
