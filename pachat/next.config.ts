import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the framework cache model simple for a heavily dynamic, session-based app.
  cacheComponents: false,
  // The SQLite driver is the Node built-in `node:sqlite`; keep it out of the bundle.
  serverExternalPackages: [],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
