import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// This file is ESM, so `__dirname` does not exist here.
const projectDir = dirname(fileURLToPath(import.meta.url));

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

if (process.env.NODE_ENV === "production" && !backendUrl) {
  console.warn(
    "NEXT_PUBLIC_BACKEND_URL is not set; realtime actions will show an unavailable state.",
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // output: "standalone",
  // The workspace root, so tracing follows the linked @bunker/* packages.
  outputFileTracingRoot: join(projectDir, ".."),
  transpilePackages: ["@bunker/contracts"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
