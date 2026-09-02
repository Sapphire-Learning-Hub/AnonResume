# AnonResume

AnonResume is a multi-user, structured resume editor with shared web, public,
print, and PDF rendering. It uses PostgreSQL for authentication, resume data,
and version snapshots.

## License and brand

The source code is licensed under [AGPL-3.0-or-later](./LICENSE). Bundled
fonts, icons, and other external assets retain their own licenses; see
[`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES). The character-inspired logo is
declared separately in [`BRAND-NOTICE.md`](./BRAND-NOTICE.md) and is not covered
by the source code license.

Set `NEXT_PUBLIC_SOURCE_CODE_URL` when deploying to expose the public source
repository from Settings > About. If it is not set, the app shows a local
configuration notice instead of inventing an external repository URL.

## Requirements

- Bun 1.3+
- PostgreSQL 14+
- A Chromium runtime for PDF export

## Local setup

1. Install dependencies with `bun install`.
2. Create a database and a least-privileged PostgreSQL user for the app.
3. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`,
   `BETTER_AUTH_URL`, and `BETTER_AUTH_SECRET`.
4. Initialize Better Auth tables with `bun run auth:migrate`.
5. Apply the resume schema with `bun run db:migrate`.
6. Install the PDF browser once with `bunx playwright install chromium`.
7. Start the web app with `bun run dev`.
8. In a separate process, start the export queue with `bun run worker:pdf`.

Database DDL is applied only by Drizzle migrations. Web requests and repository
operations never create or alter tables at runtime.

## Production deployment

1. Set the environment variables from `.env.example` in the deployment
   platform. Do not use the development fallback secret in production.
2. Set `BETTER_AUTH_URL` to the final HTTPS origin, without a trailing path.
3. Run `bun install --frozen-lockfile`, `bun run auth:migrate`, and
   `bun run db:migrate` against the production database during deployment.
4. Run `bunx playwright install chromium` in the build image if PDF export is
   enabled. The runtime must include the system libraries required by Chromium.
5. Build with `bun run build` and serve the web process with `bun run start`.
6. Run one or more dedicated `bun run worker:pdf` processes against the same
   database and public `BETTER_AUTH_URL`.

Every uncommented variable in `.env.example` is required in production.
AnonResume validates these settings for every request. If a required value is
missing, malformed, or internally inconsistent, page requests show the instance
configuration error screen and all API, mutation, and Server Function requests
return HTTP 503 until an administrator fixes the deployment. Optional settings
such as GitHub OAuth must be either omitted completely or configured as a
complete pair.

`PDF_EXPORT_MAX_CONCURRENCY` is enforced globally through PostgreSQL, not per
worker process. `PDF_EXPORT_QUEUE_LIMIT` bounds all active work and
`PDF_EXPORT_MAX_ACTIVE_PER_USER` limits queued or running jobs owned by one
authenticated user. Leases and `PDF_EXPORT_MAX_ATTEMPTS` recover jobs after
worker crashes. Completed PDF bytes are retained for
`PDF_EXPORT_RESULT_TTL_MS` milliseconds, while `PDF_EXPORT_FORCE_EXPIRY_MS`
sets an absolute lifetime for every job, including queued and running jobs.

Anonymous PDF export is disabled by default. It can be enabled with
`PDF_EXPORT_ALLOW_ANONYMOUS=true`, but this is not recommended because
unauthenticated callers can consume shared queue and Chromium capacity. Keep
the default unless the deployment adds an external abuse-control layer.

`RESUME_VERSION_HISTORY_LIMIT` controls the maximum snapshots retained per
resume and defaults to `5`. Snapshot creation and pruning are serialized per
resume so concurrent saves cannot bypass the configured limit.

Use a dedicated database role with access only to the configured database and
schema. Back up `resumes` and `resume_versions`; the latter contains the restore
history users rely on. `pdf_export_jobs` contains temporary queue and download
data and does not need long-term backup retention.

## Verification

Run the following before a release:

```sh
bun run check
bun run build
```

The unit suite includes a source-level guard that rejects low-specificity
`antd-style` classes attached directly to Ant Design components.

## Project structure

- `src/app/` owns routes, server boundaries, and API handlers.
- `src/components/` contains reusable UI grouped by product surface.
- `src/domain/` contains framework-independent resume schemas, block-tree
  operations, presets, pagination, and rendering contracts.
- `src/stores/` coordinates editor state, history, and document mutations.
- `src/lib/` contains persistence and external-system adapters.
- `tests/unit/` mirrors production modules for behavioral tests.
- `tests/architecture/` enforces source boundaries and repository conventions.
- `tests/scripts/` covers release and tooling scripts.

Production modules must not import from `tests/`, and tests must not be placed
under `src/` or `scripts/`. New resume block creation should go through the
typed catalog in `src/domain/resume/block-presets.ts`; recursive tree traversal
belongs in `src/domain/resume/block-tree.ts` rather than UI components.
