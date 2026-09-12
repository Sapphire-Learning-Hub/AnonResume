---
name: anonresume-release
description: Use when preparing, reviewing, tagging, or publishing an AnonResume version and its bilingual GitHub Release notes. Do not use for production deployment alone.
---

# Release AnonResume

Prepare and publish an auditable release from the current repository. A release
and a production deployment are separate operations.

## Hard boundaries

- Before committing a version bump, creating or pushing a tag, pushing release
  commits, or publishing a GitHub Release, present the final public Release text
  and obtain the user's explicit approval.
- A request to move quickly or to "handle the wording" does not waive the text
  approval gate. If the user gives deterministic edits and explicitly says to
  continue afterward, those edits plus that instruction count as approval.
- Do not deploy after publishing unless the user separately requests deployment.
  Use `anonresume-deploy` for that operation.
- Never replace, move, or delete an existing remote tag or Release. Stop on a
  collision, a dirty worktree with unexplained changes, or a local/remote hash
  mismatch.

## Prepare the candidate

1. Inspect the worktree, branch, remotes, package version, local and remote tags,
   and the latest published GitHub Release.
2. Use the previous release tag as the comparison base. Review every commit and
   changed file through `HEAD`; identify migrations, environment changes,
   breaking behavior, dependency changes, and operational requirements.
3. Choose the requested SemVer version. If none was supplied and the correct
   increment is ambiguous, ask the user instead of guessing.
4. Follow the repository's existing version source. Currently the root version
   is in `package.json`, while `bun.lock` does not duplicate it. Do not create a
   changelog or release-notes file unless the repository adopts that convention.
5. Run `bun run check` and `bun run build`. If a full test run fails outside the
   changed area, diagnose and rerun that exact test, then rerun the complete gate.
   Do not publish from partial verification.

## Draft the public notes

Match the latest maintained GitHub Release format, while deriving claims from the
actual tag-to-HEAD diff. The default body contains:

1. A short Chinese summary and grouped, user-facing changes.
2. An upgrade section that states only real migrations, configuration changes,
   compatibility constraints, and restart steps.
3. An English summary in a collapsed `<details>` block, synchronized with the
   Chinese content.
4. A repository compare link from the previous tag to the proposed tag.

Keep public notes focused on product outcomes. Default to omitting test counts,
internal architecture, debugging incidents, credentials, private infrastructure,
and an internal verification section. Report verification separately to the
user. Show the complete draft and stop for approval before external mutations.

## Publish the approved release

After approval, apply any unambiguous requested wording changes and use that exact
content for the Release:

1. Confirm the working tree contains only the expected version preparation.
2. Commit with `chore(release): prepare vX.Y.Z`.
3. Create a signed annotated tag with
   `git tag -s vX.Y.Z -m "AnonResume vX.Y.Z"`, then verify it with
   `git tag -v vX.Y.Z`.
4. Push the current upstream branch, then the tag. Verify the dereferenced remote
   tag and upstream branch resolve to the release commit.
5. Publish with `gh release create vX.Y.Z --verify-tag`, the title
   `AnonResume vX.Y.Z`, and the approved notes.
6. Read the Release back with `gh release view` and verify its title, tag, public
   status, body, and URL. Confirm the worktree is clean.

Report the release commit, signed tag verification, push results, public Release
URL, local verification outcome, and any residual risk. Do not claim deployment.
