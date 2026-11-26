import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages would serve the project from /<repo>/.
  base: process.env.GITHUB_ACTIONS ? "/eggscape/" : "/",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2600,
    rollupOptions: {
      output: {
        manualChunks: {
          playcanvas: ["playcanvas"],
          rapier: ["@dimforge/rapier3d-compat"],
        },
      },
    },
  },
});
