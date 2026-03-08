import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "mo-tshirt.mu" }],
        destination: "https://www.mo-tshirt.mu/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
  eslint: {
    // Allow production builds to successfully complete even if
    // there are ESLint errors. This matches Vercel behavior we want
    // while we iterate on lint fixes.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Do not fail the build on type errors. Useful while migrating.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
