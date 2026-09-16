# 参与 AnonResume 开发

[English](./CONTRIBUTING.en.md)

感谢你参与 AnonResume。本文是项目协作流程的正式说明，适用于内部协作者和外部
贡献者。`main` 是唯一长期分支，并应始终保持可测试、可构建和可发布。

## 开始之前

- 错误报告和功能建议请先使用对应的 GitHub Issue 模板。
- 小型、范围明确的修复可以直接发起 Pull Request；较大功能、跨模块改动和破坏性
  变更应先在 Issue 中确认需求与方案。
- GitHub Issue 和 Pull Request 是范围、设计决策、评审结论和验证结果的事实来源。
  聊天中的关键决定应回填到对应 Issue 或 Pull Request。
- 阅读 [`AGENTS.md`](./AGENTS.md) 中的架构、安全、测试和样式约束。

## 创建分支

从最新的 `main` 创建一个短生命周期分支：

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/short-description
```

按改动类型选择分支前缀：

| 前缀 | 用途 |
| --- | --- |
| `feat/` | 新增用户能力 |
| `fix/` | 修复缺陷 |
| `docs/` | 文档改进 |
| `refactor/` | 不改变产品行为的重构 |
| `test/` | 测试改进 |
| `chore/` | 工具、依赖或维护任务 |
| `release/` | 一次性版本准备，例如 `release/v1.2.0` |

分支名使用小写短横线。一个分支只解决一个可独立评审的问题；发现独立目标时拆分
Pull Request，不要持续扩大原有范围。

需要同步主线时使用 rebase，不要把 `main` merge 进任务分支：

```sh
git fetch origin
git rebase origin/main
git push --force-with-lease
```

只对自己尚未合并的分支使用 `--force-with-lease`。共享分支重写历史前必须先与其他
参与者协调。

## 开发与验证

项目使用 Bun。安装依赖并启动开发环境：

```sh
bun install --frozen-lockfile
bun run dev
```

按回归风险选择测试。提交 Pull Request 前至少运行：

```sh
bun run check
bun run build
```

如果改动只需要更窄的验证，可以在开发过程中先运行目标测试，但最终结果不能只依赖
局部测试。无法运行必需命令时，应在 Pull Request 中明确说明原因。

数据库变更必须同时包含 Drizzle schema、迁移、兼容的应用代码和相关测试。新增环境
变量必须在 `.env.example` 中提供安全占位值和用途说明。

## 提交信息

所有提交使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```text
<type>(<optional-scope>): <description>
```

例如：

```text
feat(editor): add reusable experience block
fix(auth): preserve recovery login access
docs: clarify local PDF worker setup
```

使用小写标准类型，描述采用祈使语气且不加句号。破坏性变更使用 `!`，并在提交正文
中加入 `BREAKING CHANGE:` 说明。Pull Request 标题也必须符合此格式，因为 Squash
merge 后它会成为 `main` 上的最终提交信息。

## 发起 Pull Request

Pull Request 必须：

- 说明要解决的问题、改动范围和用户或维护者可感知的结果。
- 关联相关 Issue；没有 Issue 的小改动应在正文中直接说明背景。
- 列出实际执行的验证命令和结果。
- 视觉改动提供截图或录屏。
- 数据库、配置或兼容性改动说明迁移方式和影响。
- 不包含凭据、真实用户数据、私有地址或无关改动。
- 与最新 `main` 保持同步，并解决全部评审讨论。

草稿 Pull Request 可以用于提前讨论，但不能合并。高优先级只改变评审顺序，不跳过
分支、CI、评审或 Pull Request。

## 评审与合并

每个 Pull Request 必须满足以下条件：

- 所有必需 CI 成功。
- 至少一名非作者批准。
- 所有评审讨论已解决。
- 分支基于最新 `main`。

仓库只使用 Squash merge，不使用普通 merge commit 或 rebase merge。合并后删除来源
分支。需要撤销改动时创建新的 Revert Pull Request；禁止重写 `main`、移动已发布
Tag 或删除既有 Release。

## 版本发布

版本发布从最新 `main` 创建一次性的 `release/vX.Y.Z` 分支，并通过普通 Pull
Request 更新版本号和已确认的中英文 Release 文案。发布 Pull Request 同样需要 CI、
非作者批准和 Squash merge。

发布 Pull Request 合并后，由维护者在对应的 `main` 提交上创建并验证签名 Tag，推送
Tag 并发布 GitHub Release。已发布版本的修复必须产生新版本，不能改写已有 Tag 或
Release。

GitHub Release 与生产部署是两项独立操作。发布完成不代表已部署；生产部署只有在
获得明确授权后才执行。

## 安全与隐私

不要在 Issue、Pull Request、提交、截图或日志中包含数据库地址、SMTP 凭据、令牌、
私钥、生产环境地址或真实用户数据。发现安全漏洞时不要提交公开 Issue，请使用
[GitHub 私密漏洞报告](https://github.com/Sapphire-Learning-Hub/AnonResume/security/advisories/new)。
