import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";

// Stamp the build with the current git short SHA. Falls back to "DEV"
// when not in a git checkout (e.g. some Docker build contexts).
let buildHash = "DEV";
try {
  buildHash = execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim() || "DEV";
} catch {
  /* ignore */
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_BUILD__: JSON.stringify(buildHash),
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3062",
    },
  },
  resolve: {
    alias: { "@": "/src" },
  },
});
