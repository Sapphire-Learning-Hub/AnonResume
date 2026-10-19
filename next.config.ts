import createMDX from "@next/mdx";
import type { NextConfig } from "next";

import { resolveReleaseMetadata } from "./src/lib/runtime/release-metadata";

const release = resolveReleaseMetadata();

const nextConfig: NextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: process.env.ANONRESUME_PRIVATE_MAP_BUILD === "1",
  experimental: { serverSourceMaps: process.env.ANONRESUME_PRIVATE_MAP_BUILD === "1" },
  generateBuildId: async () => process.env.ANONRESUME_BUILD_ID ?? crypto.randomUUID(),
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  headers() {
    return [
      {
        source: "/app/:path*",
        headers: [
          {
            key: "Accept-CH",
            value: "Sec-CH-UA-Platform-Version, Sec-CH-UA-Model",
          },
        ],
      },
    ];
  },
  env: {
    ANONRESUME_BUILD_ID: process.env.ANONRESUME_BUILD_ID ?? "development",
    ANONRESUME_BUILD_COMMIT: release.commit ?? "",
    ANONRESUME_BUILD_TAG: release.tag,
  },
  reactCompiler: true,
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
