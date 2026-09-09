---
name: anonresume-deploy
description: Use when releasing AnonResume from this repository to its existing self-hosted production environment, including Git transfer fallback, migrations, systemd restarts, and health verification.
---

# Deploy AnonResume

Deploy one verified Git commit without embedding production credentials or
instance-specific addresses in the repository.

## Safety boundaries

- Mutate production only after the user explicitly requests a deployment.
- Deploy an exact commit that exists in the configured upstream repository.
- Never put passwords, tokens, private keys, SMTP credentials, database URLs,
  server addresses, or private origins in this skill, Git, command arguments,
  copied logs, or chat responses.
- Use a preconfigured SSH alias backed by an SSH key, agent, OS credential
  store, or interactive prompt. Do not use `sshpass`, inline passwords, or
  generated key files.
- Treat the server's environment files as write-only operational state. Verify
  that they exist and contain required variable names without printing,
  downloading, or diffing their values.
- Do not overwrite a dirty local or server worktree. Stop and report the
  unexpected files.
- Do not run destructive Git commands or automatically reverse database
  migrations.

## Runtime inputs

Obtain these values from the user's approved deployment context or existing
SSH configuration. Keep them in the current process or shell session, not in a
tracked file:

| Input | Meaning |
| --- | --- |
| `DEPLOY_SSH_ALIAS` | Preconfigured SSH host alias |
| `DEPLOY_PATH` | Absolute repository path on the server |
| `RELEASE_REF` | Upstream branch or tag to deploy |
| `TARGET_COMMIT` | Exact full commit hash resolved locally |
| `PUBLIC_ORIGIN` | Public HTTPS origin used for health checks |
| `WEB_SERVICE` | Existing systemd Web unit |
| `PDF_WORKER_SERVICE` | Existing systemd PDF worker unit |

Do not guess missing inputs. Ask for the non-secret identifier or ask the user
to configure it outside the repository.

## Deployment workflow

### 1. Verify the release locally

1. Inspect `git status --short`, the current branch, remotes, and the proposed
   diff. Preserve unrelated changes.
2. Run `bun run check` and `bun run build`. Do not deploy when either exits
   nonzero.
3. Resolve the immutable target with `git rev-parse "$RELEASE_REF^{commit}"`.
4. Confirm that the target is available from the configured upstream. Push it
   only when the user requested or already approved publishing the commit.
5. Record the short target hash for status updates without exposing deployment
   configuration.

### 2. Preflight the server

Use SSH to inspect, without mutation:

- `git status --porcelain`
- `git rev-parse HEAD`
- `systemctl is-active "$WEB_SERVICE"`
- `systemctl is-active "$PDF_WORKER_SERVICE"`
- presence of the server environment file
- available disk space sufficient for dependencies and a Next.js build

Save the current full hash as `PREVIOUS_COMMIT`. Require a clean worktree and
verify that `PREVIOUS_COMMIT` is an ancestor of `TARGET_COMMIT`; otherwise stop
instead of forcing history.

Also inspect the existing Web and PDF Worker service definitions to identify
their configured environment files. Do not print the files or their values.
The deployment must use the environment files already referenced by the
services; do not create replacement files or change service definitions as
part of an ordinary release.

### 3. Transfer the commit

Prefer a bounded `git fetch` from the configured remote. Verify the fetched
hash equals `TARGET_COMMIT` before checking it out in detached mode.

If the server cannot reach the Git remote, stop the hanging fetch and use an
incremental Git bundle from the trusted local checkout:

```sh
git bundle create "$LOCAL_BUNDLE" "$RELEASE_REF" "^$PREVIOUS_COMMIT"
git bundle verify "$LOCAL_BUNDLE"
scp "$LOCAL_BUNDLE" "$DEPLOY_SSH_ALIAS:$REMOTE_BUNDLE"
```

On the server, fetch `RELEASE_REF` from the bundle, verify `FETCH_HEAD` equals
`TARGET_COMMIT`, then run `git checkout --detach FETCH_HEAD`. A bundle is only
a transport fallback; never copy a working tree or build output over the
server checkout. Remove local and remote temporary bundles after verification.

### 4. Verify target-version environment configuration

Before installing dependencies or starting the production build, determine
the required environment variable names for `TARGET_COMMIT`. Inspect the
target version's `.env.example`, environment schema/validation, build-time
configuration, and service-specific startup configuration. Include variables
required by both the Web service and the PDF Worker, and distinguish required
variables from documented optional variables.

Create a names-only manifest in the current process or an untracked temporary
file. Never include values, secrets, or the contents of an environment file in
the manifest, logs, Git, command arguments, or chat responses. On the server,
compare the manifest with the variable names present in each existing service
environment file, without printing values. A variable that is required by the
target version but absent from its environment file is a hard stop.

If a required variable is missing, do not install, build, migrate, or restart.
Ask the operator to configure it through the existing server secret or
environment management process, then repeat the names-only preflight. Do not
invent values, copy local development values, or modify production
environment files without explicit operational authorization. If the target
version changes which service consumes a variable, verify the correct service
environment file separately.

Only continue once all required target-version variables are present for the
services that need them. This check must happen before the production build so
build-time configuration failures are caught before any service interruption.

### 5. Build before interrupting services

From `DEPLOY_PATH`, run:

```sh
bun install --frozen-lockfile
bun run build
```

Keep the currently running processes alive while these commands execute. If
installation or build fails, do not restart services. Restore the checkout to
`PREVIOUS_COMMIT`, report the failure, and leave the running version in place.

### 6. Apply migrations

After a successful build and immediately before restart, run the repository's
required forward migrations:

```sh
bun run auth:migrate
bun run db:migrate
```

For a migration that removes or rewrites data, require a confirmed backup and
an explicit user decision before continuing. If migration fails, do not
restart. Do not attempt automatic schema rollback.

### 7. Restart runtime services

Restart the Web and PDF Worker units together, then wait briefly for startup:

```sh
systemctl restart "$WEB_SERVICE" "$PDF_WORKER_SERVICE"
systemctl is-active "$WEB_SERVICE" "$PDF_WORKER_SERVICE"
```

Both units must report `active`. Use the existing service definitions; do not
replace systemd units or change network exposure as part of an ordinary
release.

### 8. Verify the deployment

Verify all of the following with fresh output:

- `git rev-parse HEAD` exactly equals `TARGET_COMMIT`.
- The local application endpoint responds with an expected `2xx` or deliberate
  authentication redirect.
- Following redirects from `PUBLIC_ORIGIN` reaches an expected page with a
  successful final response.
- Recent Web and PDF Worker journals contain startup messages and no new
  configuration, database, schema, or runtime errors.
- The server worktree remains clean.

When an authenticated editor regression was changed, perform the narrowest
available authenticated smoke check as well. An anonymous login-page response
does not prove editor behavior.

## Failure handling

If service startup or health verification fails after restart:

1. Capture concise, sanitized service status and recent journal evidence.
2. If no incompatible migration was applied, check out `PREVIOUS_COMMIT`, run
   the locked install and build, then restart both services once.
3. Stop after one rollback attempt. If it fails, report the outage and the
   exact non-secret failure evidence; do not keep cycling services.
4. If a migration was applied, do not assume the previous application remains
   schema-compatible. Keep the failing version stopped or running according to
   the safest observed state and request an explicit recovery decision.

## Completion report

Report only the deployed commit, push status when relevant, build result,
migration result, service states, public HTTP result, and any remaining risk.
Never include credentials, private connection details, environment values, or
unsanitized logs.
