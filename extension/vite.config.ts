import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "webview"),
  plugins: [react()],
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

