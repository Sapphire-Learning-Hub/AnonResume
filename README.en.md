<p align="center">
  <img src="./public/brand/anonresume-lockup.png" alt="AnonResume" width="360" />
</p>

<p align="center">
  <strong>Present every experience with clarity and confidence.</strong>
</p>

<p align="center">
  <a href="./README.md">简体中文</a> · English
</p>

> [!IMPORTANT]
> All current releases are early-access builds and are not yet fully stable. You may still encounter significant issues. The first stable release is planned for v2. Stay tuned.

<p align="center">
  <a href="./LICENSE"><img alt="AGPL-3.0-or-later" src="https://img.shields.io/badge/license-AGPL--3.0--or--later-d63b72" /></a>
  <img alt="Bun 1.3+" src="https://img.shields.io/badge/Bun-1.3+-14151a?logo=bun" />
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-14151a?logo=next.js" />
  <img alt="PostgreSQL 14+" src="https://img.shields.io/badge/PostgreSQL-14+-4169e1?logo=postgresql&logoColor=white" />
</p>

<p align="center">
  <a href="https://anonresume.zqdesigned.city">Live Demo</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#highlights">Highlights</a> ·
  <a href="#contributing">Contributing</a>
</p>

AnonResume is an open-source resume editor for the web. Organize your experience as naturally as editing a document, see the final layout while you write, start from a template or import existing Markdown, collaborate with an AI assistant to draft and improve content, and publish your resume as a public link or PDF.

The editor, preview, public page, and PDF output share the same rendering foundation. This keeps the result you export close to what you saw while editing. AnonResume can also be self-hosted, giving operators control over application data and infrastructure.

![The AnonResume editor](./public/marketing/editor-modular-16x9-v2-2048.webp)

## Highlights

|  |  |
| --- | --- |
| **See the final result as you write**<br />Edit on an A4 canvas with live preview and immediate pagination feedback. | **Start with a genuinely different layout**<br />Choose from templates with distinct structures, then try another look without rewriting your content. |
| **Fine-tune content and presentation**<br />Adjust sections, columns, fonts, colors, spacing, and icons, including local text colors and per-section title styles. | **Bring an existing Markdown resume**<br />Import Markdown and continue editing, with an additional parser for resumes exported by Mujicv. |
| **Edit without fear**<br />Keep a bounded version history, inspect changes directly on the rendered resume, and restore the version you need. | **Share and export**<br />Publish a read-only resume link or export through a PDF queue with visible progress, cancellation, and retry support. |
| **AI editing assistant**<br />Chat through a resizable streaming sidebar, let AI understand, draft, and improve the resume, and preview every change before applying it. | **Flexible model services**<br />Operators can provide platform models while users may connect compatible personal services, with multi-model, tool-calling, and quota controls. |
| **Accounts and administration included**<br />Use email verification, role-based permissions, global announcements, audit records, account suspension, and security approvals. | **Separate protection for management access**<br />Management mode uses an isolated session and virtual MFA, while the super-admin identity is management-only. |

The editor is optimized for precise desktop interaction. Mobile users can still access the workbench for supported tasks such as previewing, publishing, and downloading resumes.

## Quick Start

### Requirements

- [Bun](https://bun.sh/) 1.3 or later
- [PostgreSQL](https://www.postgresql.org/) 14 or later
- A Chromium runtime for PDF export

### Run Locally

```bash
git clone https://github.com/Sapphire-Learning-Hub/AnonResume.git
cd AnonResume
bun install
cp .env.example .env.local
```

Edit `.env.local` and configure at least `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and `CONFIG_MASTER_KEY`. Then initialize the database and install the browser used for PDF export:

```bash
bun run auth:migrate
bun run db:migrate
bunx playwright install chromium
```

Start the web application:

```bash
bun run dev
```

To enable PDF export, start the worker in another terminal:

```bash
bun run worker:pdf
```

AI features are disabled by default. After enabling platform models or bring-your-own-model access in the management console, start the dedicated AI worker as well. It executes model requests, automatically recovers interrupted generation runs, and removes expired audit evidence:

```bash
bun run worker:ai
```

The development server is available at <http://localhost:3000> by default.

## Configuration

[`.env.example`](./.env.example) lists deployment trust roots, not every runtime setting. The long-lived required values are the database connection, public origin, authentication secret, and configuration master key. Production should supply them through host-level credential facilities such as systemd Credentials instead of storing real values in repository files. The database schema, previous master key, initial super-admin email, and legacy encryption keys are used only for their documented scenarios.

Runtime settings such as SMTP, GitHub OAuth, management sessions, PDF queues, resume history, AI switches, trusted model endpoints, quotas, and worker cadence are maintained in the management console under Platform Configuration. Configuration supports drafts, publishing, history, and rollback. Sensitive values are encrypted and never returned in plaintext. Hot settings apply after publishing, while restart-bound changes identify the affected services.

New instances create security-safe defaults. Existing installations can import legacy environment settings once:

```bash
bun run config:import-env --dry-run
bun run config:import-env --apply
bun run config:doctor
```

Remove legacy runtime variables in a later maintenance window only after the import and service state have been verified. When rotating the configuration master key or migrating legacy MFA and AI secrets, follow the compatibility-window instructions in [`.env.example`](./.env.example) and use `config:reencrypt-secrets` instead of editing ciphertext directly.

Missing or malformed bootstrap credentials show the configuration error page and pause ordinary requests. If a published configuration cannot be read safely, the instance enters management recovery mode so authorized administrators can inspect history and prepare a rollback.

Database structures are changed only through Better Auth and Drizzle migrations. Runtime requests never create or repair application tables.

## Production Deployment

Install locked dependencies and create the production build:

```bash
bun install --frozen-lockfile
bun run build
```

Apply migrations before starting the new release:

```bash
bun run auth:migrate
bun run db:migrate
```

For a first installation or an upgrade from environment-backed settings, import and inspect runtime configuration as described above. Creating the first super-admin also requires explicitly running the following command after providing the one-time `ANONRESUME_SUPER_ADMIN_EMAIL` input:

```bash
bun run admin:bootstrap
```

Production must have working SMTP settings before it can deliver the super-admin activation email. A normal `bun run start` never creates or modifies the super-admin identity automatically.

Run the web application, PDF worker, and AI worker as separate services:

```bash
bun run start
bun run worker:pdf
bun run worker:ai
```

All three processes must use the same PostgreSQL database and deployment trust roots, and they read the published platform configuration from the database. Multiple PDF workers are supported, but the PDF concurrency limit is enforced globally through PostgreSQL rather than independently by each worker. AI workers persist jobs and checkpoints in PostgreSQL and coordinate execution and maintenance through database locks, requiring neither Redis nor an external scheduler. `bun run ai:maintenance` remains available for operator diagnostics, but production correctness must not depend on scheduling it.

Production deployments should use a dedicated least-privileged database role and back up resume and version-history data. PDF export jobs contain temporary queue and download data and usually do not require long-term backups.

## Administration and Security

- An explicit bootstrap command creates the single pending super-admin identity. Detecting multiple super-admins blocks management startup and provides a CLI repair path.
- The super-admin cannot use regular resume features. Regular users may hold multiple management roles and complete an additional MFA challenge before entering management mode.
- Virtual MFA devices, one-time recovery codes, multiple devices, reauthentication, and approval-based MFA resets for regular administrators are supported.
- The management console covers users, resumes, exports, roles, announcements, AI models and quotas, platform configuration, system status, security approvals, and audit records.
- Platform configuration has dedicated permissions, reauthentication for sensitive operations, encrypted storage, version history, and recovery workflows.
- Audit events retain the operation, resource identifiers, outcome, and change details, showing readable values alongside raw values when possible.

If the only super-admin loses both MFA devices and recovery codes, use `bun run admin:reset-mfa` on the server instead of bypassing the security flow in the database.

## Technology

AnonResume is built with Next.js 16, React 19, TypeScript, Ant Design, Tiptap, Zustand, Better Auth, Drizzle ORM, PostgreSQL, Playwright, and Bun.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run worker:pdf` | Start the PDF export worker |
| `bun run worker:ai` | Start the AI generation worker |
| `bun run check` | Run ESLint, style rules, type checks, and the full test suite |
| `bun run build` | Create a production build |
| `bun run auth:migrate` | Apply Better Auth database migrations |
| `bun run db:migrate` | Apply application database migrations |
| `bun run config:import-env` | Preview or apply a legacy environment configuration import |
| `bun run config:doctor` | Inspect bootstrap credentials, configuration revisions, and service state |
| `bun run config:reencrypt-secrets` | Migrate legacy ciphertext or rotate the configuration master key |
| `bun run admin:bootstrap` | Explicitly create the unique pending super-admin identity |
| `bun run admin:doctor` | Inspect management-system health |
| `bun run admin:repair-super-admin` | Repair an invalid multiple-super-admin state |
| `bun run admin:reset-mfa` | Reset super-admin MFA through the CLI |

Before publishing a release, run at least:

```bash
bun run check
bun run build
```

## Contributing

Bug reports, feature proposals, and code contributions are welcome. Read the
[contribution guide](./CONTRIBUTING.en.md) for the branch, commit, Pull Request,
review, merge, and release workflow.

Report vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/Sapphire-Learning-Hub/AnonResume/security/advisories/new)
instead of opening a public Issue.

## License and Brand

The source code is licensed under the [GNU Affero General Public License v3.0 or later](./LICENSE). If you distribute a modified version or provide a modified service over a network, make sure you comply with the corresponding AGPL obligations.

Bundled fonts, icons, and other third-party assets retain their own licenses; see [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES). The AnonResume logo and brand assets are governed separately by [`BRAND-NOTICE.md`](./BRAND-NOTICE.md) and are not licensed as part of the source code.

---

<p align="center">
  If AnonResume is useful to you, consider starring the repository, reporting an issue, or contributing an improvement.
</p>
