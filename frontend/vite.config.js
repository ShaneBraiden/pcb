import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api and /api/ws to the FastAPI backend during dev so the frontend
// can use relative URLs ("/api/...") in both dev and prod.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api/ws": {
        target: "ws://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
