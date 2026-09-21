---
name: anonresume-deploy
description: Use when deploying or upgrading AnonResume in a self-hosted Docker Compose or systemd environment, including configuration migrations and deployment recovery.
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
- Treat systemd credentials as write-only operational state. Inspect only
  credential identifiers from unit properties; never read, print, download,
  diff, or pass credential values to another process.
- Run migrations, configuration import, secret re-encryption, and configuration
  diagnosis only through preconfigured systemd oneshot units that receive the
  same credentials. Never use shell exports or credential values in SSH
  commands.
- Do not overwrite a dirty local or server worktree. Stop and report the
  unexpected files.
- Do not run destructive Git commands or automatically reverse database
  migrations.

## Choose the deployment mode

Determine whether the installation already uses Docker Compose or systemd.
Preserve that mode unless the user explicitly requests a migration; do not
silently convert an existing host. Docker deployments use immutable published
images and named volumes. systemd deployments use an exact Git commit and the
credential workflow below.

## Docker Compose workflow

1. Resolve an exact release tag. Verify both the core and PDF image manifests,
   their recorded digests, and the required host architecture before changing
   the installation. Never deploy `latest` or a floating major/minor tag.
2. Keep operator values in the ignored `compose.env`. Never print, commit, or
   copy its contents into chat. Back up PostgreSQL and the
   `deployment-secrets` volume before an upgrade; loss of the configuration
   master key can make encrypted configuration unrecoverable.
3. Pull and start the release with:

   ```sh
   docker compose --env-file compose.env pull
   docker compose --env-file compose.env up -d --wait
   ```

   The migration service is a required one-shot dependency. Stop if it fails;
   never start the application against a partially migrated database.
4. Verify `docker compose ps`, `/api/health/live`, `/api/health/ready`, sanitized
   Web and worker logs, and fresh stable worker heartbeats. Read the readiness
   `setupRequired` field and `/api/setup/status` to distinguish a fresh setup,
   completed instance, and authorized administrator recovery. The default stack
   runs one AI Worker and one PDF Worker. Every extra replica requires a unique
   `ANONRESUME_INSTANCE_ID`.
5. On a fresh or recovery instance, tell the operator to retrieve the delimited
   setup code directly from the Web container startup log and complete `/setup`.
   Never paste, quote, summarize, or copy the code into tool output, task
   updates, reports, shell history, or chat. SMTP is not required. After the
   operator completes setup, restart Web once and verify readiness reports
   `setupRequired: false` and no new setup-code log line is emitted.
6. Roll back application images only after proving the previous release is
   compatible with the migrated schema. Never roll back the schema
   automatically.

If the default registry is unavailable, an operator-configured registry mirror
is an acceptable transport fallback. Authenticate interactively or with
`--password-stdin` into Docker's credential store. Never put registry
credentials in repository files, Compose values, command arguments, copied
logs, or chat. Mirror path conventions are registry-specific; verify the
resolved image digest still matches the approved release.

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
| `AI_WORKER_SERVICE` | Existing systemd AI worker unit |
| `AUTH_MIGRATION_UNIT` | Existing credential-bearing Better Auth migration oneshot unit |
| `DATABASE_MIGRATION_UNIT` | Existing credential-bearing Drizzle migration oneshot unit |
| `CONFIG_IMPORT_UNIT` | Existing credential-bearing legacy configuration import oneshot unit |
| `CONFIG_REENCRYPT_UNIT` | Existing credential-bearing secret re-encryption oneshot unit |
| `CONFIG_DOCTOR_UNIT` | Existing credential-bearing configuration diagnosis oneshot unit |

Do not guess missing inputs. Ask for the non-secret identifier or ask the user
to configure it outside the repository.

## systemd credential mode

Prefer `LoadCredentialEncrypted` when `systemd-creds` is available. Do not
upgrade systemd in isolation during an application deployment; an operating
system upgrade is a separate maintenance operation.

1. Check `systemd-creds has-tpm2`. Use TPM-backed encryption only when support
   is complete and the operator accepts its recovery requirements. Otherwise
   use a systemd host key and report that an unencrypted root filesystem does
   not provide hardware-backed protection against disk theft.
2. Generate encrypted files with the credential name embedded in each file.
   If `systemd-creds setup` creates the host key after PID 1 started, run
   `systemctl daemon-reexec` before testing encrypted credentials.
3. Switch one credential-bearing maintenance unit as a canary, then one
   worker, before restarting all runtime services. Confirm the expected names
   exist under each unit's runtime credentials directory without reading their
   contents.
4. Credential list resets and replacements must sort after every existing
   credential drop-in. Inspect the merged `systemctl cat` order; a file such as
   `credentials.conf` sorts after `90-*.conf`, so use a later name or update the
   original drop-in.
5. Remove plaintext credential sources only after a restart succeeds without
   them and the configuration doctor passes. Keep an immediate encrypted-file
   recovery path for the host key.

When `systemd-creds` or `LoadCredentialEncrypted` is unavailable, use
`LoadCredential` as the compatibility mode. Store sources in a root-owned
`0700` directory with individual files at `0600`, never in command arguments,
`Environment=`, or `SetCredential=`. Report that this protects process and log
boundaries but not secrets at rest, and recommend a supported operating system
upgrade. Apply the same canary, runtime-directory, doctor, and restart checks
before considering either mode complete.

## systemd deployment workflow

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
- `systemctl is-active "$AI_WORKER_SERVICE"`
- configured credential identifiers on every runtime and maintenance unit
- available disk space sufficient for dependencies and a Next.js build

Save the current full hash as `PREVIOUS_COMMIT`. Require a clean worktree and
verify that `PREVIOUS_COMMIT` is an ancestor of `TARGET_COMMIT`; otherwise stop
instead of forcing history.

Inspect unit properties with `systemctl show`, including `LoadCredential`,
`LoadCredentialEncrypted`, `SetCredential`, and `SetCredentialEncrypted`.
Compare only the credential identifier before any source separator. Do not
open credential files or include their source paths in logs or reports.

When the target commit introduces `worker:ai` and `AI_WORKER_SERVICE` does not
yet exist, stop the ordinary release workflow. Installing a new systemd unit
is an infrastructure change and requires explicit operator authorization. The
new unit must use the same deployment user, working directory, Bun executable,
and credential set as the existing workers; its command is
`bun run worker:ai`, it must restart after failures, and it must not expose a
network port. After installation, run `systemctl daemon-reload`, enable the
unit for boot, and repeat the complete preflight before deploying.

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

### 4. Verify target-version credentials

Before installing dependencies or starting the production build, inspect the
target version's bootstrap provider and verify these credential identifiers:

```text
anonresume.database-url
anonresume.application-origin
anonresume.auth-secret
anonresume.config-master-key
anonresume.config-master-key-previous     optional during rotation
anonresume.database-schema               optional
anonresume.legacy-admin-mfa-key           migration window only
anonresume.legacy-ai-credentials-key      migration window only
anonresume.super-admin-email              deprecated bootstrap compatibility only
```

The first four identifiers are required by Web, PDF Worker, AI Worker, and
credential-bearing maintenance units. Optional and migration-only identifiers
must be present only while their documented operation requires them. If a
required identifier is absent, stop before install, build, migration, or
restart and ask the operator to provision it through the server's credential
management process.

Do not copy development values, recreate production secrets, or edit unit
definitions during an ordinary release. Unit changes and credential
installation require explicit operator authorization followed by a complete
preflight rerun.

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

After a successful build and immediately before restart, start the existing
credential-bearing oneshot units for the repository's forward migrations:

```sh
systemctl start "$AUTH_MIGRATION_UNIT"
systemctl start "$DATABASE_MIGRATION_UNIT"
systemctl show "$AUTH_MIGRATION_UNIT" "$DATABASE_MIGRATION_UNIT" -p Result -p ExecMainStatus
```

Do not run these Bun commands directly over SSH: their database credential must
come from the oneshot unit. Require `Result=success` and `ExecMainStatus=0`.
For a migration that removes or rewrites data, require a confirmed backup and
an explicit user decision before continuing. If migration fails, do not
restart. Do not attempt automatic schema rollback.

### 7. Restart runtime services

Restart the Web, PDF Worker, and AI Worker units together, then wait briefly
for startup:

```sh
systemctl restart "$WEB_SERVICE" "$PDF_WORKER_SERVICE" "$AI_WORKER_SERVICE"
systemctl is-active "$WEB_SERVICE" "$PDF_WORKER_SERVICE" "$AI_WORKER_SERVICE"
```

All three units must report `active`. Use the existing service definitions;
do not replace systemd units or change network exposure as part of an ordinary
release.

### 8. Verify the deployment

Verify all of the following with fresh output:

- `git rev-parse HEAD` exactly equals `TARGET_COMMIT`.
- The local application endpoint responds with an expected `2xx` or deliberate
  authentication redirect.
- Following redirects from `PUBLIC_ORIGIN` reaches an expected page with a
  successful final response.
- Recent Web, PDF Worker, and AI Worker journals contain startup messages and
  no new configuration, database, schema, or runtime errors.
- Readiness returns HTTP `200`; inspect its non-secret `setupRequired` value.
  For a fresh or authorized recovery instance, direct the operator to retrieve
  the setup code from the Web journal and complete `/setup` without copying the
  code into Codex output. For a completed instance, restart Web and verify the
  new journal segment contains no setup-code line.
- A fresh `ai-runtime` heartbeat exists for the deployed release after the
  AI Worker starts. Do not infer AI Worker health from systemd state alone.
- The credential-bearing doctor oneshot runs `bun run config:doctor --json`.
  Exit `0` is healthy, exit `2` is a warning requiring review, and exit `1` is
  a deployment failure. Read only its redacted structured report.
- The server worktree remains clean.

When an authenticated editor regression was changed, perform the narrowest
available authenticated smoke check as well. An anonymous login-page response
does not prove editor behavior.

## Configuration compatibility release

For the first deployment that moves an existing installation from environment
settings and legacy encryption keys, use this order without skipping steps:

1. Create and verify a production backup.
2. Install the strongest supported systemd credential mode described above
   and verify names without reading values.
3. Deploy the dual-read application while retaining the old environment file.
4. Run schema migrations through credential-bearing oneshot units.
5. Run `config:import-env --dry-run`, review the names-only plan, then run
   `config:import-env --apply` through its authorized oneshot unit.
6. Restart Web, PDF Worker, and AI Worker together and verify loaded revisions.
7. Stop AI Worker, run `config:reencrypt-secrets --dry-run`, then apply through
   its authorized oneshot unit with `--worker-stopped`.
8. Restart AI Worker and verify a fresh heartbeat.
9. Run `config:doctor --json` through its authorized oneshot unit and resolve
   every error; review warnings explicitly.
10. Retain legacy credentials and the encrypted backup for one stability
    window. Remove legacy credentials and the old environment file only in a
    later deployment with explicit operator approval.

If any required oneshot context is absent, stop. Never emulate it by placing
credential values in command arguments, SSH input, temporary shell files, or
exported environment variables.

## Super-admin recovery

`setup-deactivate` is a root-trust recovery operation, not a routine deployment
step. It freezes every management route, revokes all management sessions and
the target super-admin's product sessions, and remains active until `/setup`
completes. Run it only after the user explicitly authorizes this exact recovery
and confirms a current PostgreSQL plus deployment-secrets backup.

- For Compose, run the image's `setup-deactivate` entrypoint with a meaningful
  `--reason` and exact `--confirm <deployment-id>`, then restart only Web so it
  issues a recovery code.
- For systemd, run `bun run deploy:setup-deactivate` only through a dedicated
  credential-bearing oneshot unit with the same trust roots as Web. Do not put
  credentials in SSH commands or environment exports. Restart Web after the
  oneshot succeeds.
- Never read or reproduce the recovery code in task output. The operator reads
  it directly from the protected Web startup log and completes `/setup`.
- Verify ordinary product routes remain available, management routes are
  blocked before completion, and readiness stays HTTP `200` with
  `setupRequired: true`. After completion, verify management sign-in, a fresh
  Web restart without a setup-code line, and `setupRequired: false`.
- There is no casual cancellation. Do not modify setup state directly in the
  database. Use the existing integrity repair workflow if multiple active
  super-admins cause the command to refuse.

## Failure handling

If service startup or health verification fails after restart:

1. Capture concise, sanitized service status and recent journal evidence.
2. If no incompatible migration was applied, check out `PREVIOUS_COMMIT`, run
   the locked install and build, then restart all services that exist in that
   version once. If the previous version predates the AI Worker, stop and
   disable only the newly introduced AI Worker unit after the Web and PDF
   services are healthy.
   If it predates the durable AI run queue, first verify that no `queued` AI
   runs remain. Drain them with the current AI Worker before rollback; never
   strand encrypted execution payloads for a version that cannot claim them.
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
