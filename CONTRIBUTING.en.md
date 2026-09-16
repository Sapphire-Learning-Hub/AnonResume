# Contributing to AnonResume

[简体中文](./CONTRIBUTING.md)

Thank you for contributing to AnonResume. This guide defines the official
workflow for internal collaborators and external contributors. `main` is the
only long-lived branch and must remain testable, buildable, and releasable.

## Before You Start

- Use the matching GitHub Issue template for bug reports and feature proposals.
- Small, well-scoped fixes may go directly to a Pull Request. Discuss large
  features, cross-cutting changes, and breaking changes in an Issue first.
- GitHub Issues and Pull Requests are the source of truth for scope, design
  decisions, review conclusions, and verification evidence. Record important
  decisions from chat in the corresponding Issue or Pull Request.
- Read [`AGENTS.md`](./AGENTS.md) for architecture, security, testing, and
  styling constraints.

## Create a Branch

Create a short-lived branch from the latest `main`:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/short-description
```

Choose the prefix that matches the change:

| Prefix | Purpose |
| --- | --- |
| `feat/` | Add a user capability |
| `fix/` | Fix a defect |
| `docs/` | Improve documentation |
| `refactor/` | Restructure code without changing product behavior |
| `test/` | Improve tests |
| `chore/` | Tooling, dependency, or maintenance work |
| `release/` | One-time release preparation, such as `release/v1.2.0` |

Use lowercase kebab-case branch names. Keep each branch focused on one
independently reviewable goal. Split independent work into separate Pull
Requests instead of expanding an existing branch indefinitely.

Rebase when synchronizing with the mainline; do not merge `main` into a task
branch:

```sh
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Use `--force-with-lease` only on your own unmerged branch. Coordinate before
rewriting the history of a shared branch.

## Develop and Verify

The project uses Bun. Install dependencies and start the development server:

```sh
bun install --frozen-lockfile
bun run dev
```

Choose tests according to regression risk. Before opening a Pull Request, run
at least:

```sh
bun run check
bun run build
```

Use narrower tests while iterating when appropriate, but do not treat a partial
run as the final result. If a required command cannot run, explain why in the
Pull Request.

Database changes must include the Drizzle schema, migration, compatible
application code, and relevant tests. Document every new environment variable
in `.env.example` with a safe placeholder and its purpose.

## Commit Messages

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional-scope>): <description>
```

Examples:

```text
feat(editor): add reusable experience block
fix(auth): preserve recovery login access
docs: clarify local PDF worker setup
```

Use a standard lowercase type, an imperative description, and no trailing
period. Mark breaking changes with `!` and add a `BREAKING CHANGE:` footer.
Pull Request titles follow the same format because the title becomes the commit
on `main` after a Squash merge.

## Open a Pull Request

Every Pull Request must:

- Explain the problem, scope, and user- or maintainer-visible outcome.
- Link the relevant Issue, or provide the context directly for a small change.
- List the verification commands actually run and their results.
- Include screenshots or recordings for visual changes.
- Explain migrations and compatibility impact for database or configuration changes.
- Exclude credentials, real user data, private addresses, and unrelated changes.
- Stay current with `main` and resolve every review discussion.

Draft Pull Requests are useful for early discussion but cannot be merged.
Priority changes review order only; it does not bypass branches, CI, review, or
the Pull Request process.

## Review and Merge

Every Pull Request must meet all of these conditions:

- All required CI checks pass.
- At least one non-author approves it.
- All review discussions are resolved.
- The branch is current with `main`.

The repository uses Squash merge only. Do not use merge commits or rebase
merge. Delete the source branch after merging. Revert through a new Revert Pull
Request; never rewrite `main`, move a published tag, or delete an existing
Release.

## Releases

Create a one-time `release/vX.Y.Z` branch from the latest `main`, then use a
normal Pull Request to update the version and approved bilingual Release notes.
The release Pull Request follows the same CI, non-author approval, and Squash
merge requirements.

After the release Pull Request is merged, a maintainer creates and verifies a
signed tag on the corresponding `main` commit, pushes the tag, and publishes the
GitHub Release. Fixes to a published version require a new version; never
rewrite an existing tag or Release.

A GitHub Release and a production deployment are separate operations.
Publishing does not imply deployment, and production is changed only with
explicit authorization.

## Security and Privacy

Never include database URLs, SMTP credentials, tokens, private keys, production
addresses, or real user data in an Issue, Pull Request, commit, screenshot, or
log. Do not open a public Issue for a vulnerability; use
[GitHub private vulnerability reporting](https://github.com/Sapphire-Learning-Hub/AnonResume/security/advisories/new).
