import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Scenario config is read from disk at runtime, so ship it with the server functions.
  outputFileTracingIncludes: { "/api/**/*": ["./scenarios/**/*"] },
  turbopack: {
    // A stray lockfile in a parent folder otherwise makes Next guess the wrong root.
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
