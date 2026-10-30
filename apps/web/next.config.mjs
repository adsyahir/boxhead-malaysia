/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@kampung/game-core"],
  reactStrictMode: true,
  // Static export: Cloudflare serves `out/` from its edge. Dynamic parts (leaderboard API,
  // online rooms) are a separate Worker, so the UI needs no Node runtime.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
