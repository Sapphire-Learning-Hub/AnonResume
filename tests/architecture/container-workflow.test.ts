import { readFile } from "node:fs/promises";
import path from "node:path";

it("keeps one-time setup codes out of CI failure logs", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/container.yml"),
    "utf8",
  );

  expect(workflow).toContain(
    "logs --no-color postgres migrate ai-worker pdf-worker",
  );
  expect(workflow).not.toMatch(/logs --no-color\s*(?:\n|$)/);
});

it("keeps optional peer tooling out of runtime images", async () => {
  const dockerfile = await readFile(
    path.join(process.cwd(), "Dockerfile"),
    "utf8",
  );

  expect(dockerfile).toContain(
    "bun install --frozen-lockfile --production --omit=peer",
  );
});

it("keeps container dependency downloads independent from lockfile registry URLs", async () => {
  const dockerfile = await readFile(
    path.join(process.cwd(), "Dockerfile"),
    "utf8",
  );

  expect(dockerfile).toContain(
    "ARG BUN_INSTALL_REGISTRY=https://registry.npmjs.org",
  );
  expect(
    dockerfile.match(/--registry=\$\{BUN_INSTALL_REGISTRY\}/g),
  ).toHaveLength(2);
});

it("publishes release images on native architecture runners", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/container.yml"),
    "utf8",
  );

  expect(workflow).toContain("runner: ubuntu-24.04");
  expect(workflow).toContain("runner: ubuntu-24.04-arm");
  expect(workflow).toContain("platform: linux/amd64");
  expect(workflow).toContain("platform: linux/arm64");
  expect(workflow).not.toContain("docker/setup-qemu-action");
});

it("reuses one native builder per architecture for both images", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/container.yml"),
    "utf8",
  );

  expect(workflow).toContain(
    "name: build release images (${{ matrix.arch }})",
  );
  expect(workflow).toContain("id: build-core");
  expect(workflow).toContain("id: build-pdf");
  expect(workflow).not.toContain("matrix.target");
});

it("keeps release caches bounded and architecture scoped", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/container.yml"),
    "utf8",
  );

  expect(workflow).toContain(
    "cache-to: type=gha,mode=min,scope=release-${{ matrix.arch }}",
  );
  expect(workflow).not.toMatch(/cache-to: type=gha,mode=max/);
});

it("tests published tag artifacts instead of rebuilding them", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/container.yml"),
    "utf8",
  );

  expect(workflow).toContain("if: github.event_name == 'pull_request'");
  expect(workflow).toContain("name: verify published images");
  expect(workflow).toContain("needs: merge");
  expect(workflow).toContain(
    "ANONRESUME_VERSION: ${{ github.event_name == 'workflow_dispatch' && inputs.release_tag || github.ref_name }}",
  );
});

it("scans platform digests before publishing release manifests", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/container.yml"),
    "utf8",
  );

  expect(workflow).toContain(
    "image-ref: ghcr.io/sapphire-learning-hub/anonresume@${{ steps.build-core.outputs.digest }}",
  );
  expect(workflow).toContain(
    "image-ref: ghcr.io/sapphire-learning-hub/anonresume-pdf@${{ steps.build-pdf.outputs.digest }}",
  );
});

it("selects the matrix platform when scanning release image digests", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/container.yml"),
    "utf8",
  );

  expect(workflow).toContain("TRIVY_PLATFORM: ${{ matrix.platform }}");
});

it("preflights both release image architectures without publishing them", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/container.yml"),
    "utf8",
  );
  const preflight = workflow.slice(
    workflow.indexOf("  release-preflight:"),
    workflow.indexOf("  build:"),
  );

  expect(preflight).toContain(
    "name: preflight release images (${{ matrix.arch }})",
  );
  expect(preflight).toContain(
    "github.event_name == 'pull_request' && startsWith(github.head_ref, 'release/v')",
  );
  expect(preflight).toContain("tags: anonresume-release-preflight-core:${{ matrix.arch }}");
  expect(preflight).toContain("tags: anonresume-release-preflight-pdf:${{ matrix.arch }}");
  expect(preflight).toContain("image-ref: anonresume-release-preflight-core:${{ matrix.arch }}");
  expect(preflight).toContain("image-ref: anonresume-release-preflight-pdf:${{ matrix.arch }}");
  expect(preflight.match(/push: false/g)).toHaveLength(2);
  expect(preflight.match(/load: true/g)).toHaveLength(2);
  expect(preflight).not.toContain("docker/login-action");
});

it("recovers a failed release from its immutable tag source", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/container.yml"),
    "utf8",
  );

  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).toContain("release_tag:");
  expect(workflow).toContain("ref: ${{ env.RELEASE_SOURCE_REF }}");
  expect(workflow).toContain(
    "github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/tags/v')",
  );
  expect(workflow).toContain(
    "ANONRESUME_VERSION: ${{ github.event_name == 'workflow_dispatch' && inputs.release_tag || github.ref_name }}",
  );
});

it("does not upgrade the base distribution during every image build", async () => {
  const dockerfile = await readFile(
    path.join(process.cwd(), "Dockerfile"),
    "utf8",
  );

  expect(dockerfile).not.toContain("apt-get upgrade");
});

it("keeps the optional ELK stack isolated and locally bound", async () => {
  const baseCompose = await readFile(
    path.join(process.cwd(), "compose.yaml"),
    "utf8",
  );
  const observability = await readFile(
    path.join(process.cwd(), "docker/observability/compose.yaml"),
    "utf8",
  );
  const overlay = await readFile(
    path.join(process.cwd(), "compose.observability.yaml"),
    "utf8",
  );

  expect(baseCompose).not.toContain("elasticsearch");
  expect(baseCompose).not.toContain("logstash");
  expect(baseCompose).not.toContain("kibana");
  expect(observability).toContain("elasticsearch:8.19.23");
  expect(observability).toContain("logstash:8.19.23");
  expect(observability).toContain("kibana:8.19.23");
  expect(observability.match(/127\.0\.0\.1:/g)).toHaveLength(3);
  expect(observability.match(/mem_limit:/g)).toHaveLength(3);

  expect(overlay).toMatch(/^services:/);
  expect(overlay.match(/driver: gelf/g)).toHaveLength(4);
  expect(overlay).toContain("web:");
  expect(overlay).toContain("ai-worker:");
  expect(overlay).toContain("pdf-worker:");
  expect(overlay).toContain("migrate:");
  expect(overlay).not.toMatch(/\b(?:image|build|depends_on|ports|volumes):/);
});
