---
name: anonresume-release
description: Use when preparing, reviewing, tagging, or publishing an AnonResume version and its bilingual, user-facing GitHub Release notes. Do not use for production deployment alone.
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
   changed file through `HEAD`. Build two inventories: user-perceivable product
   changes, and operator-only upgrade requirements. Do not treat commits as
   release-note entries one-for-one.
3. Choose the requested SemVer version. If none was supplied and the correct
   increment is ambiguous, ask the user instead of guessing.
4. Follow the repository's existing version source. Currently the root version
   is in `package.json`, while `bun.lock` does not duplicate it. Do not create a
   changelog or release-notes file unless the repository adopts that convention.
5. Run `bun run check` and `bun run build`. If a full test run fails outside the
   changed area, diagnose and rerun that exact test, then rerun the complete gate.
   Do not publish from partial verification.

## Draft user-centered public notes

Match the latest maintained GitHub Release format and use the tag-to-HEAD diff
only as evidence. Release notes describe the product experience, not the work
performed to implement it.

### Inclusion gate

Before keeping an item, answer all three questions:

1. Which user notices it: resume author, public viewer, administrator, or
   self-hosting operator?
2. In which visible task or screen do they notice it?
3. What can they now do, understand, or complete that was previously missing,
   confusing, slow, or broken?

If the answers are not concrete, omit the item from public notes. Administrator
workflows count as user experience; invisible server behavior does not.

Include new user capabilities, visible interaction or wording improvements,
fixed task failures, accessibility improvements, and performance or reliability
changes users can actually feel. Exclude internal refactors, tests, CI, tooling,
implementation-only dependency updates, file moves, database or API mechanics,
runtime metadata, monitoring, debugging history, and verification statistics.

### Writing rules

- Lead with the user outcome and name the scenario. Prefer “修复副本简历发布失败，
  同名简历现在可以正常发布” over “修复 `resumes_slug_key` 唯一约束冲突”.
- Describe clearer behavior, not plumbing. Prefer “登录失败时会提示具体原因”
  over “根据后端错误码映射认证消息”.
- Describe felt performance. Prefer “字体市场会先展示页面和加载状态，切换更
  顺畅” over “为字体资源增加客户端懒加载”.
- Merge commits that produce one experience into one item. Do not expose commit
  boundaries, filenames, endpoints, schema names, or implementation chronology.
- Group by user journey such as “简历编辑”“发布与导出”“登录与管理安全”, not
  by frontend/backend/database. Order groups and bullets by user impact.
- Keep each bullet to one outcome. Avoid promotional filler and claims not
  demonstrated by the diff.
- Write natural Chinese first. The English version must preserve the same scope
  and meaning, but should read naturally rather than translate word-for-word.

The default body contains a short Chinese summary, grouped Chinese changes, a
collapsed `<details>` English version with matching items, and a compare link.
Add an upgrade section only when self-hosting operators must take action, such as
running a migration, changing configuration, or accepting a compatibility break;
keep those instructions out of the product-change groups. Omit the section when
no action is required.

Report tests, builds, and release verification separately to the user, never in
the public notes. Show the complete bilingual draft and stop for approval before
any external mutation.

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
