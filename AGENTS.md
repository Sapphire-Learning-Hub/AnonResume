<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AnonResume Agent Guide

## Product and stack

AnonResume is a multi-user structured resume editor. The editor, preview,
public resume, print view, and PDF export share the same document model and
rendering contract. Changes that make one surface look correct while another
surface diverges are regressions.

- Use Bun for dependency management and scripts. Do not introduce npm, pnpm,
  or Yarn lockfiles.
- The application uses Next.js 16 App Router, React 19, TypeScript, Ant Design,
  `antd-style`, Zustand, Drizzle ORM, Better Auth, PostgreSQL, Tiptap, and
  Playwright.
- Import project modules through the `@/` alias when crossing directories.
- Keep TypeScript strict. Do not hide errors with `any`, broad casts, or
  unchecked JSON access when a schema or typed boundary can express the data.

## Before changing code

1. Inspect the relevant implementation, nearby tests, and current working-tree
   changes before deciding how to modify a flow.
2. For any Next.js behavior, read the relevant guide under
   `node_modules/next/dist/docs/` first. Do not rely on older Next.js API
   knowledge.
3. Reproduce bugs with a focused test where practical. For behavior changes,
   add or update the test first and observe the expected failure.
4. Preserve unrelated user changes. Never use destructive Git commands to
   clean the workspace or rewrite files you do not understand.

## Architecture boundaries

- `src/app/` owns routes, layouts, server components, route handlers, and
  server/client composition. Keep route files thin and delegate reusable work.
- `src/components/` owns reusable UI grouped by product surface. Components
  must not query PostgreSQL directly.
- `src/domain/resume/` owns the resume schema, block catalog, block-tree
  operations, imports, pagination inputs, and framework-independent document
  behavior. Keep React, Next.js, and database concerns out of this layer.
- `src/stores/` owns editor runtime state, history, selection, and document
  transactions. Document mutations should go through store actions rather than
  ad hoc component state.
- `src/lib/` owns persistence repositories and external-system adapters such as
  authentication, email, and PDF export.
- `src/db/` owns Drizzle schema definitions and database construction. Runtime
  application code must not create or alter tables.
- `src/theme/`, `src/styles/`, and `src/i18n/` are shared infrastructure. Add
  user-visible text to both supported locales instead of embedding strings in
  components.
- `tests/unit/` mirrors production behavior, `tests/integration/` covers
  subsystem boundaries, and `tests/architecture/` enforces repository rules.
  Do not place tests under `src/` or import test utilities into production code.

Use the typed block catalog in `src/domain/resume/block-presets.ts` for block
creation. Put recursive tree traversal and structural cleanup in
`src/domain/resume/block-tree.ts`, not in UI components. Pagination is derived
presentation state and must not be stored on list items or other resume content
nodes.

## Product invariants

### Rendering and pagination

- The canvas is WYSIWYG. Editor-only borders, drag handles, selection chrome,
  and warnings must be overlays or otherwise layout-neutral; enabling an
  editing mode must not change document dimensions or pagination.
- Reuse the shared resume renderer for editor, preview, public, print, PDF, and
  visual diff surfaces. Do not maintain parallel markup for the same document.
- Pagination must tolerate empty, oversized, nested, and partially editable
  blocks. It must terminate deterministically and avoid blank-page loops.
- Empty structural containers that users cannot reuse should be normalized out
  of the document instead of remaining as inaccessible layout nodes.
- Content data and pagination decisions are separate models. Do not add page
  numbers, split markers, or measurement artifacts to the persisted resume.

### Editor behavior

- Preserve valid rich-text structure and marks when saving partial edits.
  Links may contain non-HTTP schemes such as `mailto:` or app deep links; do
  not impose URL-format restrictions beyond safe rendering.
- Array items that represent free-form content must remain rich-text capable.
  Do not collapse them back to plain strings merely because the first UI only
  needs simple text.
- Drag behavior must respect parent/child hierarchy and multi-column layout.
  Handles for different levels must remain distinguishable and usable without
  changing the document flow.
- The editor is desktop-specialized. Viewport-based mobile access must stay
  blocked at the editor boundary; do not attempt to expose a degraded mobile
  editor. Mobile users operate resumes from the workbench and supported
  preview/publish/export flows.

### UI and styling

- Preserve the established Ant Design and `antd-style` visual system. Prefer
  shared components and theme tokens over one-off CSS.
- App chrome must use active theme tokens. Do not hard-code the default pink or
  blue into backgrounds, borders, focus states, or selected states. Resume
  document colors stored in document settings are separate from the app theme.
- Express conditional styling with `data-*` or `aria-*` state on a stable base
  class. Do not concatenate generated style classes conditionally; the
  `check:styles` architecture rule rejects this pattern.
- Do not attach low-specificity generated styles to Ant Design components in a
  way that loses to library defaults. Follow nearby `&&` specificity patterns
  and verify initial render as well as client navigation.
- Avoid layout or typography flashes during hydration and route transitions.
  Theme, locale, fonts, sidebar width, and page metadata need a stable initial
  value shared by server and client.
- Fixed headers and sidebars should remain outside the intended scroll
  container. Put visual padding inside the scrolling content so scrollbars stay
  flush with container edges.
- Use purpose-built SVG icons for controls. Do not use emoji as product icons.
- Keep controls consistent: avoid mixing fully rounded outer controls with
  square or small-radius selected segments unless the design explicitly calls
  for it.

## Data, authentication, and security

- Every private resume read or mutation must authenticate the request and
  constrain the database operation by the authenticated user's ID. Knowing a
  resume ID is never authorization.
- Public slug routes are read-only unless a separate authenticated operation is
  explicitly designed. Never expose drafts through public endpoints.
- Validate untrusted request bodies at the route boundary and return deliberate
  status codes. Do not trust client-supplied owner IDs, versions, queue states,
  or publication state.
- Email/password accounts require email verification. Preserve generic auth
  errors where a more specific response would enable account enumeration.
- PDF export is a bounded PostgreSQL-backed queue. Respect the global,
  per-user, retry, lease, retention, and forced-expiry environment limits.
  Anonymous export remains disabled by default and must not be silently
  enabled.
- Resume history retention is controlled by
  `RESUME_VERSION_HISTORY_LIMIT`; snapshot creation and pruning must remain
  concurrency-safe.
- Never commit credentials, tokens, private URLs, production data, or populated
  `.env.local` values. If a new environment variable is introduced, document a
  safe placeholder and behavior in `.env.example`.

## Database changes

- Change application tables through the Drizzle schema and checked-in
  migrations. Generate migrations with `bun run db:generate` and apply them
  with `bun run db:migrate`.
- Better Auth schema changes use `bun run auth:migrate`.
- Do not add runtime DDL, automatic table repair, or silent schema fallbacks to
  repositories and request handlers.
- Treat migrations and application compatibility as one change: update schema,
  repository queries, tests, and deployment configuration together.

## Assets and licensing

- Only add bundled fonts whose redistribution and commercial use are verified.
  Add the corresponding license file under `public/font-licenses/` and update
  third-party notices when the asset set changes.
- Brand assets under `public/brand/` are governed by `BRAND-NOTICE.md`, not the
  source-code license. Preserve the separate mark, wordmark, and lockup use
  cases.
- Prefer local, versioned assets for stable rendering. Email images require an
  absolute public URL and must include useful fallback text.

## Verification

Use the narrowest relevant test while iterating, then run the repository gates
before claiming completion:

```sh
bun run check
bun run build
```

`bun run check` runs ESLint, style-architecture checks, TypeScript, and the full
Vitest suite. A change is not complete when only a targeted test passes. Run
`bun run build` for all release work and for changes
to routes, server/client boundaries, configuration, authentication, email,
database access, or asset loading.

If a full-suite test fails outside the modified area, rerun that exact test to
diagnose whether it is deterministic, then rerun the complete gate. Do not
report a green result from a partial rerun after a full-suite failure.

Useful commands:

```sh
bun run dev
bun run test -- path/to/test.ts
bun run lint
bun run check:styles
bunx tsc --noEmit
bun run worker:pdf
```

Report verification commands and their final outcome. If a required command
cannot run, state that explicitly rather than inferring success.

## Commits

- Every commit message must strictly follow the Conventional Commits
  specification: `<type>(<optional-scope>): <description>`.
- Use a standard lowercase type such as `feat`, `fix`, `refactor`, `test`,
  `docs`, `build`, `ci`, `chore`, `perf`, `style`, or `revert`.
- Keep the description imperative, concise, and free of a trailing period.
- Mark breaking changes with `!` before the colon and explain them in a
  `BREAKING CHANGE:` footer when applicable.
