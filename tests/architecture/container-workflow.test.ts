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
  expect(workflow).toContain("ANONRESUME_VERSION: ${{ github.ref_name }}");
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

it("does not upgrade the base distribution during every image build", async () => {
  const dockerfile = await readFile(
    path.join(process.cwd(), "Dockerfile"),
    "utf8",
  );

  expect(dockerfile).not.toContain("apt-get upgrade");
});
