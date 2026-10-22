# Personal Templates

Personal templates are private document snapshots stored in PostgreSQL. They
require no new environment variables, workers, or external services. Built-in
templates remain bundled with the application.

## Upgrade

Back up PostgreSQL before upgrading. Apply the checked-in application migration
with `bun run db:migrate` before starting the new version. Migration 0045 adds
`resume_templates` and `resume_template_operations`; it does not rewrite existing
resumes. Docker Compose and systemd deployments continue to use their normal
migration procedure.

Backups must include both tables. Operation records contain request hashes and
result references, not another copy of a document; retain them with their account
to prevent a repeated request from creating or overwriting data again.

## Data Lifecycle

Templates do not depend on the source resume's lifetime. Moving a resume to
Trash or purging it does not remove templates. Creating a resume copies the
template into a new unpublished record, without publication identity, history,
AI reports, or running tasks.

Account Excel exports include personal templates. Account merging transfers
templates without deduplicating names and removes the secondary account's
operation records. Deletion cooling periods block template mutations while
allowing the existing account export. At the end of the cooling period,
templates and operation records are cleared in the account's existing business
data cleanup transaction; the identity retains logical-deletion behavior.

## Recovery and Rollback

Deleting or replacing a template has no template-history recovery mechanism.
Existing resumes remain independent. Use a database backup for operational
recovery rather than reconstructing templates from request logs.

If rolling back application code, retain the new tables and backup. Older
versions do not expose personal templates and cannot manage their account
lifecycle. Avoid account merges or deletion finalization on an older version
until a compatible version is restored. Do not drop the tables or reverse a
published migration to make older code run.

Unsupported or damaged template documents cannot be previewed or instantiated;
they are not silently replaced with blank resumes. Other templates remain
available, and the owner can still rename or delete the affected entry. Future
resume schema migrations must include personal template documents.
