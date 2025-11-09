import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "webview"),
  build: {
    outDir: path.resolve(__dirname, "dist/webview"),
    emptyOutDir: true,
    target: "es2020",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "webview/index.html")
      },
      output: {
        entryFileNames: "assets/main.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});

