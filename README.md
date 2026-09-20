<p align="center">
  <img src="./public/brand/anonresume-lockup.png" alt="AnonResume" width="360" />
</p>

<p align="center">
  <strong>让每段经历，以专业方式被看见。</strong>
</p>

<p align="center">
  简体中文 · <a href="./README.en.md">English</a>
</p>

> [!IMPORTANT]
> 当前所有版本均为尝鲜测试版本，尚未完全稳定，仍可能存在较多问题。正式版本预计随 v2 发布，敬请期待。

<p align="center">
  <a href="./LICENSE"><img alt="AGPL-3.0-or-later" src="https://img.shields.io/badge/license-AGPL--3.0--or--later-d63b72" /></a>
  <img alt="Bun 1.3+" src="https://img.shields.io/badge/Bun-1.3+-14151a?logo=bun" />
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-14151a?logo=next.js" />
  <img alt="PostgreSQL 14+" src="https://img.shields.io/badge/PostgreSQL-14+-4169e1?logo=postgresql&logoColor=white" />
</p>

<p align="center">
  <a href="https://anonresume.zqdesigned.city">在线体验</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能亮点">功能亮点</a> ·
  <a href="#参与贡献">参与贡献</a>
</p>

AnonResume 是一款开源的在线简历编辑器。你可以像编辑文档一样整理经历，实时查看最终排版，从模板开始创作或导入已有 Markdown 内容，也可以让 AI 助手协助起草和优化内容，最后将简历发布为公开链接或导出为 PDF。

编辑器、预览、公开页面和 PDF 使用同一套渲染能力，尽可能减少“编辑时正常，导出后变样”的意外。项目支持自行部署，数据和运行环境由部署者掌控。

![AnonResume 编辑器界面](./public/marketing/editor-modular-16x9-v2-2048.webp)

## 功能亮点

|  |  |
| --- | --- |
| **边写边看最终效果**<br />在 A4 画布中实时编辑和预览，分页变化立即可见。 | **从不同风格开始创作**<br />内置多种排版差异明确的模板，内容不变也能快速尝试新风格。 |
| **内容与样式都能细调**<br />调整区块、分栏、字体、颜色、间距和图标，也可以为局部文字或单个标题单独设置样式。 | **导入已有 Markdown 简历**<br />把已有内容带入编辑器继续完善，并支持针对木及简历格式的解析。 |
| **放心修改与恢复**<br />自动保留有限数量的历史版本，并直接在简历画面中查看差异后恢复。 | **分享与 PDF 导出**<br />发布只读简历链接，或通过带排队状态、取消和重试能力的任务系统导出 PDF。 |
| **AI 编辑助手**<br />在可调整宽度的侧栏中流式对话，让 AI 理解、起草和优化简历，并在确认前预览修改效果。 | **灵活的模型服务**<br />部署者可以提供平台模型，用户也可以连接自己的兼容服务；支持多模型、工具调用能力与额度管理。 |
| **完整的账号与管理能力**<br />支持邮箱验证、角色权限、全局公告、审计记录、账号停用与安全审批。 | **独立的管理身份保护**<br />管理模式使用单独会话和虚拟 MFA 验证，超管账号仅用于管理。 |

编辑器针对桌面端的精细操作设计。移动端仍可进入工作台，完成预览、发布和下载等适合小屏幕的操作。

## 快速开始

### 环境要求

- [Bun](https://bun.sh/) 1.3 或更高版本
- [PostgreSQL](https://www.postgresql.org/) 14 或更高版本
- 用于 PDF 导出的 Chromium 运行环境

### 本地运行

```bash
git clone https://github.com/Sapphire-Learning-Hub/AnonResume.git
cd AnonResume
bun install
cp .env.example .env.local
```

编辑 `.env.local`，至少配置 `DATABASE_URL`、`BETTER_AUTH_URL`、`BETTER_AUTH_SECRET` 和 `CONFIG_MASTER_KEY`。随后初始化数据库并安装 PDF 导出所需的浏览器：

```bash
bun run auth:migrate
bun run db:migrate
bunx playwright install chromium
```

启动 Web 应用：

```bash
bun run dev
```

如需使用 PDF 导出，请在另一个终端启动 Worker：

```bash
bun run worker:pdf
```

AI 功能默认关闭。通过管理后台启用平台模型或用户自带模型后，还需要启动独立的 AI Worker。它负责执行模型调用、自动恢复异常中断的生成任务并清理过期审计数据：

```bash
bun run worker:ai
```

默认开发地址为 <http://localhost:3000>。

## 配置说明

[`.env.example`](./.env.example) 只列出部署信任根，而不是全部运行配置。长期保留的必需项是数据库连接、公开地址、认证密钥和配置主密钥；生产环境建议通过 systemd Credentials 等主机级凭据机制提供，不要把真实值写入仓库文件。数据库 schema、旧主密钥、首次超管邮箱和旧版加密密钥仅在对应场景下使用。

SMTP、GitHub OAuth、管理会话、PDF 队列、简历历史、AI 开关、可信模型端点、额度和 Worker 周期等运行配置统一在管理后台的“平台配置”中维护。配置支持草稿、发布、历史记录和回滚；敏感值加密保存且不会回显。热更新项发布后直接生效，需要重启的项目会明确标出受影响的服务。

全新实例会创建安全默认配置。已有实例升级时，可以一次性导入旧环境变量：

```bash
bun run config:import-env --dry-run
bun run config:import-env --apply
bun run config:doctor
```

导入和服务状态验证完成后，再在后续维护窗口移除旧运行变量。更换配置主密钥或迁移旧版 MFA、AI 密钥时，请按 [`.env.example`](./.env.example) 的兼容窗口说明使用 `config:reencrypt-secrets`，不要直接修改数据库密文。

引导凭据缺失或格式错误时，实例会显示配置错误页并暂停普通请求；已发布配置无法安全读取时，实例会进入管理恢复模式，允许有权限的管理员检查历史并准备回滚。

数据库结构只通过 Better Auth 与 Drizzle 迁移更新，应用请求不会在运行时创建或修复表结构。

## 生产部署

安装锁定依赖并完成生产构建：

```bash
bun install --frozen-lockfile
bun run build
```

在启动新版本前应用迁移：

```bash
bun run auth:migrate
bun run db:migrate
```

首次安装或从旧环境变量配置升级时，先按上一节导入并检查运行配置。首次创建超管还需要在提供一次性 `ANONRESUME_SUPER_ADMIN_EMAIL` 后显式执行：

```bash
bun run admin:bootstrap
```

生产环境必须先配置可用的 SMTP，才能发送超管激活邮件。正常的 `bun run start` 不会自动创建或修改超管身份。

分别运行 Web 服务、PDF Worker 和 AI Worker：

```bash
bun run start
bun run worker:pdf
bun run worker:ai
```

三个进程需要连接同一个 PostgreSQL 数据库，使用一致的部署信任根，并从数据库读取已发布的平台配置。PDF Worker 可以运行多个进程，但 PDF 最大并发数通过 PostgreSQL 在全局范围内限制，而不是每个 Worker 单独计算。AI Worker 使用 PostgreSQL 持久化任务和检查点，并通过数据库锁协调执行与维护，不依赖单独的 Redis 或定时任务服务；`bun run ai:maintenance` 仅保留用于运维诊断，不应作为生产正确性的前提。

生产环境应使用权限受限的专用数据库账号，并备份简历与历史版本数据。PDF 导出任务包含临时队列和下载数据，通常不需要长期备份。

## 管理与安全

- 系统通过显式引导命令创建唯一的待激活超管；检测到多个超管会阻止管理服务继续运行，并提供 CLI 修复工具。
- 超管账号不具备普通简历功能。普通用户可以拥有一个或多个管理角色，并在进入管理模式时进行额外 MFA 验证。
- 支持虚拟 MFA 设备、一次性恢复码、多设备绑定、重新认证和普通管理员 MFA 重置审批。
- 管理端提供用户、简历、导出队列、角色权限、公告、AI 模型与额度、平台配置、系统状态、安全审批和审计管理。
- 平台配置具有独立权限、敏感操作再认证、加密存储、版本历史和恢复流程。
- 审计记录保留操作类型、资源标识、结果和变更详情，并在可用时同时展示可读值与原始值。

如果唯一超管同时丢失 MFA 设备和恢复码，请在服务器上使用 `bun run admin:reset-mfa`，不要通过数据库手工绕过安全流程。

## 技术栈

AnonResume 使用 Next.js 16、React 19、TypeScript、Ant Design、Tiptap、Zustand、Better Auth、Drizzle ORM、PostgreSQL 与 Playwright 构建，并使用 Bun 管理依赖和运行脚本。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `bun run dev` | 启动开发服务器 |
| `bun run worker:pdf` | 启动 PDF 导出 Worker |
| `bun run worker:ai` | 启动 AI 生成 Worker |
| `bun run check` | 运行 ESLint、样式规则、类型检查和完整测试 |
| `bun run build` | 创建生产构建 |
| `bun run auth:migrate` | 应用 Better Auth 数据库迁移 |
| `bun run db:migrate` | 应用项目数据库迁移 |
| `bun run config:import-env` | 预览或执行旧环境变量配置导入 |
| `bun run config:doctor` | 检查引导凭据、配置版本和服务加载状态 |
| `bun run config:reencrypt-secrets` | 迁移旧版密文或轮换配置主密钥 |
| `bun run admin:bootstrap` | 显式创建唯一的待激活超管 |
| `bun run admin:doctor` | 检查管理系统状态 |
| `bun run admin:repair-super-admin` | 修复多超管异常状态 |
| `bun run admin:reset-mfa` | 通过 CLI 重置超管 MFA |

提交公开版本前请至少运行：

```bash
bun run check
bun run build
```

## 参与贡献

欢迎提交错误报告、功能建议和代码改进。请阅读[贡献指南](./CONTRIBUTING.md)，
了解分支、提交、Pull Request、评审、合并和发布流程。

安全漏洞请通过 [GitHub 私密漏洞报告](https://github.com/Sapphire-Learning-Hub/AnonResume/security/advisories/new)
提交，不要创建公开 Issue。

## 许可证与品牌

源代码使用 [GNU Affero General Public License v3.0 or later](./LICENSE) 许可。分发修改版本或通过网络向用户提供修改后的服务时，请遵守 AGPL 的相应义务。

项目内字体、图标及其他第三方资源保留各自的许可，详见 [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES)。AnonResume 的 Logo 与品牌素材受单独的 [`BRAND-NOTICE.md`](./BRAND-NOTICE.md) 约束，不属于源代码许可证的授权范围。

---

<p align="center">
  如果 AnonResume 对你有帮助，欢迎 Star、反馈问题或参与改进。
</p>
