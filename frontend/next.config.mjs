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
  outputFileTracingRoot: path.join(__dirname, "../"),
  transpilePackages: ["@bunker/contracts"],
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
