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
