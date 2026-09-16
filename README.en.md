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

AnonResume is an open-source resume editor for the web. Organize your experience as naturally as editing a document, see the final layout while you write, start from a template or import existing Markdown, and publish your resume as a public link or PDF.

The editor, preview, public page, and PDF output share the same rendering foundation. This keeps the result you export close to what you saw while editing. AnonResume can also be self-hosted, giving operators control over application data and infrastructure.

![The AnonResume editor](./public/marketing/editor-modular-16x9-v2-2048.webp)

## Highlights

|  |  |
| --- | --- |
| **See the final result as you write**<br />Edit on an A4 canvas with live preview and immediate pagination feedback. | **Start with a genuinely different layout**<br />Choose from templates with distinct structures, then try another look without rewriting your content. |
| **Fine-tune content and presentation**<br />Adjust sections, columns, fonts, colors, spacing, and icons, including local text colors and per-section title styles. | **Bring an existing Markdown resume**<br />Import Markdown and continue editing, with an additional parser for resumes exported by Mujicv. |
| **Edit without fear**<br />Keep a bounded version history, inspect changes directly on the rendered resume, and restore the version you need. | **Share and export**<br />Publish a read-only resume link or export through a PDF queue with visible progress, cancellation, and retry support. |
| **Accounts and administration included**<br />Use email verification, role-based permissions, audit records, account suspension, and security approvals. | **Separate protection for management access**<br />Management mode uses an isolated session and virtual MFA, while the super-admin identity is management-only. |

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

Edit `.env.local` and provide at least a working PostgreSQL connection, Better Auth URL, and secret. Then initialize the database and install the browser used for PDF export:

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

The development server is available at <http://localhost:3000> by default.

## Configuration

[`.env.example`](./.env.example) is the source of truth for configuration names, safe placeholders, and behavior. Production must explicitly provide every setting marked as required, while optional settings may be omitted. A missing required value, malformed value, or internally inconsistent configuration places the instance in global maintenance mode: pages show a configuration error and operations return HTTP 503 until the deployment is fixed.

Pay particular attention to the following settings:

- `BETTER_AUTH_URL` must be the final public HTTPS origin.
- SMTP powers email verification and administrator activation. Development also sends real email whenever SMTP is fully configured.
- `PDF_EXPORT_*` controls concurrency, global queue capacity, per-user limits, retries, leases, and result retention.
- Anonymous PDF export is disabled by default. Enabling it without an external abuse-control layer is not recommended.
- `RESUME_VERSION_HISTORY_LIMIT` controls how many snapshots each resume retains.
- `ANONRESUME_SUPER_ADMIN_EMAIL` and `ADMIN_*` configure the unique super-admin identity, management sessions, and MFA protection.
- GitHub OAuth is optional. Its client ID and secret must either both be configured or both be omitted.

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

Run the web application and PDF worker as separate services:

```bash
bun run start
bun run worker:pdf
```

Both processes must use the same PostgreSQL database and application configuration. Multiple PDF workers are supported, but `PDF_EXPORT_MAX_CONCURRENCY` is enforced globally through PostgreSQL rather than independently by each worker.

Production deployments should use a dedicated least-privileged database role and back up resume and version-history data. PDF export jobs contain temporary queue and download data and usually do not require long-term backups.

## Administration and Security

- The first startup can create one pending super-admin identity. Detecting multiple super-admins blocks management startup and provides a CLI repair path.
- The super-admin cannot use regular resume features. Regular users may hold multiple management roles and complete an additional MFA challenge before entering management mode.
- Virtual MFA devices, one-time recovery codes, multiple devices, reauthentication, and approval-based MFA resets for regular administrators are supported.
- The management console covers users, resumes, exports, roles, system status, security approvals, and audit records.
- Audit events retain the operation, resource identifiers, outcome, and change details, showing readable values alongside raw values when possible.

If the only super-admin loses both MFA devices and recovery codes, use `bun run admin:reset-mfa` on the server instead of bypassing the security flow in the database.

## Technology

AnonResume is built with Next.js 16, React 19, TypeScript, Ant Design, Tiptap, Zustand, Better Auth, Drizzle ORM, PostgreSQL, Playwright, and Bun.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run worker:pdf` | Start the PDF export worker |
| `bun run check` | Run ESLint, style rules, type checks, and the full test suite |
| `bun run build` | Create a production build |
| `bun run auth:migrate` | Apply Better Auth database migrations |
| `bun run db:migrate` | Apply application database migrations |
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
