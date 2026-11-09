import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Path the app is served under, e.g. "/grades_calculator/" on GitHub Pages. Defaults to the site root.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // A new version activates on the next load; data is saved instantly, so nothing is lost.
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Grades Calculator · Calculadora de Notas",
        short_name: "Grades",
        description: "Work out the grades you need to pass. Calcula las notas que necesitas para aprobar.",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f5f6fa",
        theme_color: "#3b5bdb",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: `${base}index.html`,
        // Never serve the sync API from the cache.
        navigateFallbackDenylist: [/\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    proxy: { "/api": process.env.API_PROXY ?? "http://localhost:3000" },
  },
});
