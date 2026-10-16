import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  // Dev-only: allow `next dev` HMR/resources to be reached from other devices on
  // the LAN (e.g. testing on a phone/tablet). Ignored by the static export build,
  // so it has no effect on the deployed artifact. Add your machine's LAN IPs here.
  allowedDevOrigins: ["192.168.29.123", "192.168.1.*", "192.168.0.*", "192.168.29.*"],
};

export default nextConfig;
