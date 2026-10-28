import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: fileURLToPath(new URL("./devtools.html", import.meta.url)),
        panel: fileURLToPath(new URL("./panel.html", import.meta.url)),
        "page-errors-main": fileURLToPath(new URL("./src/content/page-errors-main.ts", import.meta.url)),
        "error-bridge": fileURLToPath(new URL("./src/content/error-bridge.ts", import.meta.url)),
        background: fileURLToPath(new URL("./src/background/service-worker.ts", import.meta.url)),
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});
