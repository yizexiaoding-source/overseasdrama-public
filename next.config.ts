import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The project uses Vinext for local builds; Vercel's Next.js detector still
  // runs its typecheck during the platform build. Keep deployment behavior
  // aligned with Vinext while allowing its generated route adapters to build.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
