/** @type {import('next').NextConfig} */
const { PrismaPlugin } = require("@prisma/nextjs-monorepo-workaround-plugin");

const nextConfig = {
  reactStrictMode: true,
  // Prisma NICHT ins Next-Server-Bundle einbauen — sonst verliert Netlify die
  // Engine-Binary. Stattdessen bleibt es ein normaler require() aus
  // node_modules zur Laufzeit.
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...(config.plugins || []), new PrismaPlugin()];
    }
    return config;
  },
};

// PWA-Konfiguration.
// WICHTIG: API-Calls (/api/*) NIEMALS cachen – wir würden dem User sonst
// offline veraltete Chat-Antworten präsentieren. Auch der SSE-Stream selbst
// darf nicht durch einen SW abgefangen werden.
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  // In der Entwicklung PWA komplett aus, damit HMR nicht mit dem SW kollidiert.
  disable: process.env.NODE_ENV === "development",
  // Alles unter /api/ wird vom SW ignoriert (Bypass zur Netzwerk-Schicht).
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    {
      // Statische Next-Assets aggressiv cachen (immutable Hashes im Namen).
      urlPattern: /^\/_next\/static\/.*/,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      // Icons, manifest.
      urlPattern: /^\/(icons\/.*|manifest\.json|favicon\.ico|apple-touch-icon\.png)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "app-shell",
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      // App-Shell / Seiten – Stale-While-Revalidate, damit offline
      // die letzte funktionierende Version erscheint.
      urlPattern: ({ url, request }) =>
        request.destination === "document" && !url.pathname.startsWith("/api/"),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "pages",
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
    {
      // API-Calls: hart bypass. NetworkOnly + kein Cache-Namespace.
      urlPattern: /^\/api\/.*/,
      handler: "NetworkOnly",
      options: {
        // Explizit KEINE expiration/cache-config – Requests laufen direkt
        // durch. Zusätzlich Streaming (SSE) belassen wir dem Netzwerk.
      },
    },
  ],
});

module.exports = withPWA(nextConfig);
