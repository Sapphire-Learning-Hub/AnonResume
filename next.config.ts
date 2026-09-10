import type { NextConfig } from "next";

import { resolveReleaseMetadata } from "./src/lib/release-metadata";

const release = resolveReleaseMetadata();

const nextConfig: NextConfig = {
  env: {
    ANONRESUME_BUILD_COMMIT: release.commit ?? "",
    ANONRESUME_BUILD_TAG: release.tag,
  },
  reactCompiler: true,
};

export default nextConfig;
