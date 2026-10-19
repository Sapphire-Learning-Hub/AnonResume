# 日志与指标可观测性

AnonResume 的 Web、PDF Worker、AI Worker、迁移和维护进程会向标准输出写入单行结构化日志。生产环境默认使用 ECS JSON，开发环境默认使用便于阅读的单行格式。应用不依赖 Elasticsearch、Logstash 或 Kibana；采集端不可用时，业务进程仍应继续运行。

本文说明日志契约、本地 ELK 环境、OpenTelemetry 指标和可选链路追踪，以及接入企业现有可观测平台时必须遵守的安全边界。日志写入标准输出，指标和追踪通过 OTLP/HTTP 主动发送；外部设施不可用不会阻止业务服务运行。

## 故障诊断

无需安装外部平台即可使用诊断编号排障。HTTP 响应中的 `x-diagnostic-id` 与日志 `diagnostic.id` 对应；AI/PDF 任务会持久保留发起操作的编号，状态查询不会以轮询请求编号覆盖它。旧任务使用任务 UUID。编号不是授权凭据，不存在凭编号读取日志的公开接口。

排障时收集诊断编号、发生时间、构建版本，在 stdout、journal 或 ELK 按 `diagnostic.id` 查找，并结合 `transaction.id`、`request.id`、`service.node.name` 和进程会话关联。异常包含固定错误分类、安全 cause 和相对代码位置，不包含原始正文或绝对目录。

### 中台内置诊断

进入管理模式后的“故障诊断”（`/app/manage/diagnostics`）可直接查询故障，不要求安装任何外部观测组件。支持按诊断、请求、任务 UUID 检索，以及时间、来源、错误分类、服务、实例和构建筛选；详情展示脱敏错误码、原因链、代码位置和已采集关键阶段。

查询要求有效管理会话及独立的 `diagnostics.read` 权限。系统运维员、平台配置管理员预设具有该权限，超级管理员沿用全权限规则；普通用户和未进入管理模式的委派管理员无法访问接口。迁移会为已有系统角色补齐权限并使相关旧管理会话失效，需要重新进入管理模式。

管理界面收到受保护接口的 401 会跳转现有登录入口，避免停留在失效的管理布局；超级管理员的基础账号会话仍有效时，该入口展示管理 MFA 验证。403 不触发重新登录，敏感操作的 428 继续使用既有 MFA 复核流程。认证恢复不自动重放修改请求。

配置中心“可观测性”可热更新内置保存开关、保留天数（默认七天，范围一至三十天）和故障发生记录容量（默认 50,000，上限 100,000）。`.env.example` 的 `DIAGNOSTICS_*` 变量只用于初次配置导入，不持续覆盖配置中心。关闭内置保存后，未过期记录仍可查询，stdout 日志继续输出。

正常成功请求的阶段仅短期保留在内存；后台任务的交接和阶段有短期数据库暂存，成功任务在安全清理窗口后删除，故障才长期保留。单操作最多 256 阶段和 64 KiB 内存载荷。数据库写入使用独立有界连接与异步队列，不阻断业务；达到限制或写入失败时可能丢弃记录。跨进程交接、进程强杀、旧 Worker、异步延迟均可能造成缺口，时间线不保证全量链路。不同主机时钟偏移也会影响绝对时间排序。

浏览器声明与服务端事实明确区分；接收端 202 仅确认进入日志通道，不保证数据库持久化。内置查询不会读取任意日志文件、SQL 原文、简历正文或 AI 提示词，也不提供在线私有源码映射下载。历史未采集日志不会自动回填。

若数据库、Web 或管理认证整体不可用，中台也可能不可用，应使用服务器 stdout / journal 排查。中台的本地采集健康仅描述当前 Web 实例，不能代表所有 Worker 或其他副本健康；未找到记录也不表示从未发生故障。OTLP 是否启用及其采样率不影响内置故障采集。

浏览器仅上报自有应用的代码位置、构建号和安全错误类型，默认开启，可在配置中心热关闭；不采集表单、DOM、操作轨迹或会话回放。接收端独立限流和去重，不查询登录或数据库。浏览器本地事件编号只有在服务端明确确认后才显示为诊断编号；断网时会标明未确认送达。Next.js 的渲染错误指纹只能辅助按构建与时间匹配，不能当成精确请求编号。

### 可选追踪

配置中心的可观测性分组提供追踪开关、OTLP `/v1/traces` 端点、敏感请求头、采样率和导出超时。默认关闭，采样率 0.1，超时 5000ms；启用时必须配置有效端点。仅内网目标允许 HTTP，其他目标要求 HTTPS；禁止 URL 凭据和查询参数。保存草稿可以分步进行，发布时联动校验；更改追踪配置后需重启 Web、PDF Worker 和 AI Worker。

指标与追踪各自独立。初次导入可使用 `.env.example` 中的 `OTEL_TRACES_*`、`OTEL_EXPORTER_OTLP_TRACES_*`，不支持任意自动埋点环境设置。公网 `traceparent`、`tracestate`、`baggage` 不参与应用追踪，也不向第三方 AI 请求注入追踪头。只有已验证的内部任务上下文可以延续父链路。导出前统一剥离未知属性、事件、自由文本、原始 URL 和 SQL，队列和退出等待均有上限。

### 私有源码映射

使用 `bun run build` 构建。包装器生成独立构建号，将浏览器和服务端分块映射及资源 SHA-256 清单转存到 `.anonresume/diagnostics/<buildId>/`，然后从部署静态目录及 standalone 静态副本删除映射。服务端自身的非公开映射可供 Next.js 运行时继续使用。直接执行 `next build` 默认不生成生产浏览器映射。不要手动设置内部构建标志，也不要部署未完成包装器处理的构建产物。

私有目录需受限保存，按对应版本的部署保留期清理，不上传公共 Release、附件或公共缓存。Docker 运行镜像包含本次构建的非公开归档，服务用户可直接读取，不需要另装外部平台；不能通过 HTTP 暴露该目录。自定义构建的运行镜像也应按包含源码的制品管理。跨版本保留时，可在受保护环境中导出同一次构建的 `diagnostics-artifacts` 目标至持久私有目录，不能发布该目标镜像；必须核对清单构建号与实际部署 `.next/BUILD_ID` 一致，不能用另一次重建的归档替代。

应用默认从工作目录下 `.anonresume/diagnostics` 读取归档，也可设置部署环境变量 `ANONRESUME_DIAGNOSTICS_ARTIFACTS_DIR=/var/lib/anonresume/private-diagnostics`。这是受信任的本地文件路径，不属于平台配置中心：浏览器及管理员输入都不能指定映射下载 URL 或任意文件。Compose 可将宿主目录只读挂载至 Web/Worker 的相同路径；systemd 应授予服务用户该目录的只读权限。归档目录直接包含多个 `<buildId>/manifest.json`，发布时追加，不能覆盖旧构建。至少保留故障保存期以及仍可能使用旧页面的客户端所需构建；资源来自同一次构建，不能事后重新构建替代。

故障异步入库前自动解析；中台查看旧记录时也会尝试补解析并保存。详情同时显示还原源码位置、原始运行位置、映射构建及结果状态。只保存相对文件名和坐标，不返回源码正文、绝对目录或映射文件。已成功保存的位置不依赖后续归档存在；缺少、损坏、不匹配或没有对应映射时保留故障并明确说明。查询接口仍要求 `diagnostics.read`。映射匹配只证明坐标可在该构建中解析，不证明浏览器声明的异常真实发生。

直接用 Bun 执行的 Worker 通常已有 `src/` 或 `scripts/` 原生源码位置，界面会标注未经过映射，并结合提交标识排查；生产 Web 编译分块按独立构建号解析。Next.js 已还原的原生位置也不会再次当作压缩分块解析。真正运行时生成且没有 source map 的代码无法可靠还原。读取与缓存有容量限制（清单 16 MiB、单映射 32 MiB、缓存映射输入合计 64 MiB），超限视为不可用，不尝试网络获取。映射仅用于诊断辅助，不保证完整堆栈或全链路现场恢复。

离线定位（资源摘要可从私有 manifest 查得，须与实际部署资源校验一致）：

```sh
bun run diagnostics:symbolicate --manifest /private/build/manifest.json --build BUILD_ID --asset /_next/static/chunks/ASSET.js --digest SHA256 --line 1 --column 100
```

工具只接受本地私有 manifest，校验构建号、资源摘要、映射摘要和路径边界，只输出相对文件位置，不输出源码内容。没有匹配映射时保留代码位置与错误指纹，不能猜测还原结果。

## 日志配置

以下环境变量只控制进程输出，不包含任何采集端凭据：

| 变量 | 可选值 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `ANONRESUME_LOG_LEVEL` | `debug`、`info`、`warn`、`error` | 生产 `info`，开发 `debug` | 最低输出级别 |
| `ANONRESUME_LOG_FORMAT` | `json`、`pretty` | 生产 `json`，开发 `pretty` | 输出格式；采集环境必须使用 `json` |
| `ANONRESUME_LOG_ENVIRONMENT` | 安全的环境名称 | `NODE_ENV` | 写入 `service.environment`，例如 `production` 或 `staging` |

生产采集必须保持 `ANONRESUME_LOG_FORMAT=json`。`pretty` 仅供开发终端阅读，不属于稳定的机器解析接口。

一条完整的 HTTP 访问事件示例：

```json
{"@timestamp":"2026-10-18T08:00:00.000Z","ecs.version":"8.17.0","event.action":"http_request_completed","event.dataset":"anonresume.http","event.duration":24500000,"event.outcome":"success","http.request.method":"GET","http.response.status_code":200,"log.level":"info","message":"HTTP request completed","request.id":"8bc491eb-bcec-47dc-844c-8b0b89b8e8f2","service.deployment.id":"example","service.environment":"production","service.name":"anonresume-web","service.node.name":"web-1","service.session.id":"0a16a969-42bb-44d4-b7f5-d25285062c78","service.version":"v2.0.0","url.path":"/api/resumes/[id]"}
```

示例使用虚构标识，不对应真实实例或用户。

### 稳定字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `@timestamp` | date | 事件时间，UTC ISO 8601 |
| `ecs.version` | keyword | 当前输出遵循的 ECS 版本 |
| `log.level` | keyword | 日志级别 |
| `message` | text | 面向操作员的安全摘要，不包含原始异常或业务正文 |
| `service.name` | keyword | `anonresume-web`、`anonresume-pdf-worker` 等进程角色 |
| `service.version` | keyword | 构建标签 |
| `service.environment` | keyword | 部署环境 |
| `service.node.name` | keyword | 实例标识 |
| `service.deployment.id` | keyword | 部署标识 |
| `service.session.id` | keyword | 本次进程会话标识，重启后变化 |
| `event.dataset` | keyword | 事件所属数据集 |
| `event.action` | keyword | 稳定的机器可读动作名 |
| `event.outcome` | keyword | `success`、`failure` 或 `unknown` |
| `event.duration` | long | 耗时，单位为纳秒 |
| `request.id` | keyword | AnonResume 为本次请求生成的 UUID |
| `http.request.id` | keyword | 经过校验后保留的上游请求 ID，可选 |
| `http.request.method` | keyword | HTTP 方法 |
| `http.response.status_code` | integer | HTTP 状态码 |
| `url.path` | keyword | 路由模式，不包含查询参数 |
| `transaction.id` | keyword | 后台任务或跨阶段操作的关联标识，可选 |
| `diagnostic.id` | keyword | 本次操作的服务端诊断 UUID，任务跨进程保持不变 |
| `trace.id` / `span.id` | keyword | 有效追踪上下文中的标准标识，可选 |
| `service.build.id` / `service.commit.id` | keyword | 构建标识及源码提交；Worker 无独立构建标识时使用提交 |
| `client.event.id` / `client.build.id` | keyword | 浏览器声明的事件与构建标识，不可信输入 |
| `next.error.digest` | keyword | Next.js 渲染错误指纹，不等同诊断编号 |

响应头 `x-request-id` 与事件中的 `request.id` 一致。外部网关传入的安全请求 ID 不会替代应用 ID，而是作为 `http.request.id` 保留。

兼容性以 AnonResume 发行版本为边界：补充可选字段和新 `event.action` 属于兼容变化；删除、改名或改变字段类型只在明确记录的破坏性版本中进行。采集规则应忽略未知字段，不应依赖 `message` 文案。

## 数据保护边界

结构化日志不会主动记录请求或响应正文、Cookie、认证头、邮箱、密码、验证码、恢复码、密钥、AI 提示词、简历正文或带查询参数的 URL。异常日志使用安全错误类型、固定摘要和摘要指纹，不输出原始异常消息。

少数只能由本机操作员读取的内容，例如首次初始化码和本地邮件验证码，会写为：

```json
{"event.dataset":"anonresume.local","labels.centralize":false}
```

`labels.centralize=false` 是强制隔离标记。任何 Filebeat、Elastic Agent、Logstash、Fluent Bit 或其他集中采集规则都必须在持久化和转发前丢弃这些事件。本仓库的本地 Logstash 管道已经执行该规则。不要为了调试而移除它，也不要将原始容器日志或 journal 无筛选地复制到集中存储。

日志访问权限应按生产数据管理：限制 Kibana 数据视图、导出、快照和集群管理权限，记录查询审计，并由部署方制定保留周期。本地样例使用七天 ILM，只用于开发，不代表生产合规要求。

## 本地 ELK

本地栈固定使用 Elasticsearch、Logstash 和 Kibana `8.19.23`，仅绑定 `127.0.0.1`。它与业务 Compose 完全分离，不启动 AnonResume 或 PostgreSQL。

启动并初始化：

```bash
docker compose -f docker/observability/compose.yaml up -d --wait
./docker/observability/bootstrap.sh
./docker/observability/smoke.sh --collector-only
```

浏览器打开 <http://127.0.0.1:5601>，在 Discover 中选择 `AnonResume logs`。本地管道创建以下数据流：

- `logs-anonresume.application-development`：有效应用事件。
- `logs-anonresume.dead_letter-development`：无法解析的输入；只保留固定诊断字段，不保留原始 GELF 内容。

使用源码构建并将业务容器接入本地 Logstash：

```bash
export ANONRESUME_VERSION=development
export BETTER_AUTH_URL=https://localhost:3000
export ANONRESUME_BUILD_COMMIT="$(git rev-parse HEAD)"
export ANONRESUME_BUILD_TAG=development

docker compose \
  -f compose.yaml \
  -f compose.build.yaml \
  -f compose.observability.yaml \
  up -d --build --wait
```

Docker Desktop 默认使用 `udp://host.docker.internal:12201`。Linux Docker Engine 的日志驱动运行在宿主机侧，必要时在启动业务 Compose 前设置：

```bash
export ANONRESUME_GELF_ADDRESS=udp://127.0.0.1:12201
```

`compose.observability.yaml` 只覆盖 `web`、`ai-worker`、`pdf-worker` 和 `migrate` 的日志驱动。普通 `docker compose up` 不依赖 ELK，也不会启用 GELF。

如已有权限为 `0600` 的本地测试账号 Cookie jar 和一份可丢弃简历，可执行应用级验收：

```bash
ANONRESUME_SMOKE_COOKIE_FILE=/absolute/path/to/cookies.txt \
ANONRESUME_SMOKE_RESUME_ID=resume-disposable \
ANONRESUME_SMOKE_APP_URL=http://127.0.0.1:3000 \
./docker/observability/smoke.sh --application
```

该模式会发起公开状态请求、未认证受保护请求和认证 PDF 导出，验证请求 ID 可在 Elasticsearch 中检索；它还会短暂停止 PostgreSQL 验证 readiness 降级与恢复，并短暂停止 Logstash 确认采集失败不影响业务请求。只对本地一次性环境和可丢弃简历执行，不要指向共享或生产数据库。

停止业务服务不会删除日志数据：

```bash
docker compose \
  -f compose.yaml \
  -f compose.build.yaml \
  -f compose.observability.yaml \
  down
```

停止 ELK，保留 Elasticsearch 卷：

```bash
docker compose -f docker/observability/compose.yaml down
```

仅在确认不再需要本地日志后删除观测卷：

```bash
docker compose -f docker/observability/compose.yaml down -v
```

## OpenTelemetry 指标

AnonResume 的 Web、PDF Worker 和 AI Worker 可以将运行指标通过 OTLP/HTTP protobuf 发送到 OpenTelemetry Collector。Collector、Prometheus 和 Grafana 均属于外部设施：应用只负责产生指标，不查询 Prometheus，不在管理中台复制一套监控界面，也不保存监控历史。

数据链路如下：

```text
Web / PDF Worker / AI Worker
  -> OTLP/HTTP /v1/metrics
  -> OpenTelemetry Collector
  -> Prometheus
  -> Grafana / 企业告警平台
```

Collector 故障、网络中断或 Prometheus 不可用时，应用继续处理请求和任务。指标会按导出周期尝试发送，但这不是业务数据的可靠消息队列，不承诺在长时间观测平台故障后补齐全部历史样本。

### 平台配置

指标默认关闭。拥有平台配置权限的管理员在“平台配置”的“可观测性”分组维护以下项目：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| 启用 OpenTelemetry 指标 | 关闭 | 所有指标的总开关 |
| OTLP 指标端点 | 空 | 必须是以 `/v1/metrics` 结尾的信号专用 URL |
| OTLP 请求头 | 空 | 可选的 Collector 认证请求头，按敏感配置加密且不回显 |
| 指标导出间隔 | 60000 毫秒 | 允许 5000 至 300000 毫秒 |
| 指标导出超时 | 10000 毫秒 | 允许 1000 至 30000 毫秒，且不得大于导出间隔 |

草稿允许暂时缺少关联值，便于分步填写；发布时由服务端执行完整联动校验。开启指标但缺少端点、端点携带用户名密码或查询参数、路径不是 `/v1/metrics`、请求头包含危险字段，或超时大于导出间隔时，发布会被拒绝，当前生效版本不会改变。

这些项目均需要重启 Web、PDF Worker 和 AI Worker 才能生效。发布后使用“系统状态”中的受控重启，或按部署方式依次优雅重启三个进程。禁用指标后重启，不会创建 SDK 导出器、采样定时器或指标网络连接。

标准 OpenTelemetry 环境变量只作为旧配置或自动化初始化的一次性导入来源：

```bash
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=https://collector.example.com/v1/metrics
export OTEL_EXPORTER_OTLP_METRICS_HEADERS='authorization=Bearer replace_me'
export OTEL_METRIC_EXPORT_INTERVAL=60000
export OTEL_EXPORTER_OTLP_METRICS_TIMEOUT=10000

bun run config:import-env --dry-run
bun run config:import-env --apply --replace-active
```

`--replace-active` 是对已有配置版本的显式替换确认；新实例首次导入通常不需要它。导入会生成审计配置版本，之后环境变量不再覆盖管理中心中的生效值。不要把真实认证头写入仓库文件、镜像层或共享命令记录。

### 本地 Collector、Prometheus 与 Grafana

仓库提供可选的本地指标栈，固定版本并只绑定 `127.0.0.1`：

```bash
bun run metrics:up
bun run metrics:smoke -- --infrastructure-only
```

本机直接运行 AnonResume 时，将 OTLP 指标端点设置为：

```text
http://127.0.0.1:4318/v1/metrics
```

业务服务也通过 Compose 运行时，可以把本地指标文件作为同一项目的附加文件启动：

```bash
docker compose \
  -f compose.yaml \
  -f compose.build.yaml \
  -f compose.metrics.yaml \
  up -d --build --wait
```

此时应用容器中的端点应设置为：

```text
http://otel-collector:4318/v1/metrics
```

发布配置并重启三个服务后，等待至少一个导出周期，再执行：

```bash
bun run metrics:smoke
```

Prometheus 位于 <http://127.0.0.1:9090>，Grafana 位于 <http://127.0.0.1:3001>。Grafana 会自动加载 `AnonResume overview` 看板，展示实例存活、运行时配置健康状态、HTTP 吞吐与错误率、P95/P99 延迟、队列深度与最老等待时间、各 Worker 实例的任务吞吐、成功率和耗时、数据库连接池、进程资源、事件循环延迟、心跳以及 Collector 收发状态。看板支持按环境、服务角色和实例逐级筛选。示例告警规则会识别停止上报的 Worker 实例，但不会配置通知渠道。

停止并保留数据：

```bash
bun run metrics:down
```

确认不再需要本地指标历史后，可以显式删除卷：

```bash
docker compose -f compose.metrics.yaml down -v
```

### 接入企业可观测平台

生产环境通常将应用指向企业统一管理的 OpenTelemetry Collector 或兼容 OTLP/HTTP 的网关。建议使用 HTTPS、短生命周期认证凭据、独立租户和网络访问控制。TLS 证书、Collector 队列与重试、Prometheus 或其他时序数据库、长期保留、Grafana 权限、告警通知和灾备均由外部平台负责，不应把 Prometheus 或 Grafana 凭据交给 AnonResume。

所有指标带有 `service.namespace`、`service.name`、`service.version`、`service.instance.id`、部署环境和部署 ID。业务属性只允许固定路由模式和有限枚举，不包含用户 ID、邮箱、简历 ID、任务 ID、请求 ID、完整 URL、异常文本、模型名称或简历内容。

AI 任务的吞吐、耗时、等待和活动数量额外携带 `ai.task.type`，取值为 `conversation` 或 `resume_review`，可区分编辑助手与质量审查的负载。该属性不包含审查报告、职位描述或评分原文。

AI 和 PDF 队列是全局队列，每个副本都可能观察到相同数量。查询队列深度和最老等待时间时，应按部署与任务类型使用 `max` 聚合，不要跨副本求和。任务计数器、任务耗时、进程资源、连接池、事件循环和心跳应保留 `service.name` 与 `service.instance.id`，以便定位单个异常副本；只有查看部署总体吞吐时才跨实例求和。

`service.instance.id` 来自 `ANONRESUME_INSTANCE_ID`。默认 Compose 编排已为每个服务配置稳定标识；扩容 Worker 或在同一主机运行多个相同角色的进程时，必须为每个副本提供唯一且重启后不变的值。复用实例 ID 会让指标时间序列、心跳和受控重启状态互相覆盖。

删除或重命名指标、改变单位、直方图语义或属性含义属于可观测契约变化；采集平台应允许新增时间序列和标签值，但不要依赖 Grafana 面板标题或描述文案。

## 接入现有企业日志平台

AnonResume 只负责将 ECS JSON 写入标准输出。企业采集组件负责缓冲与重试、TLS、Elasticsearch 凭据、索引或数据流命名、保留策略、告警和灾备。不要把 Elasticsearch 凭据传给应用进程。

### Docker 标准输出

已有 Docker 或 Kubernetes 采集器可以读取容器标准输出并解析根级 JSON。生产中优先沿用现有采集链路；本仓库的 GELF overlay 是本地开发工具，不是必须采用的生产拓扑。

采集规则必须：

1. 在转发前丢弃 `labels.centralize == false`。
2. 将无法解析的行发送到受限死信流，且不保留原始行。
3. 保持数值和布尔字段类型，不把整个事件二次包装成字符串。
4. 使用 `service.environment`、`service.name` 和 `event.dataset` 路由，而不是解析 `message`。

### systemd journal

源码或 systemd 部署保持 `ANONRESUME_LOG_FORMAT=json`，由 journald 保存标准输出。采集器应分别标注 Web、PDF Worker 和 AI Worker 单元，并在解析后执行本地事件丢弃规则。查看本机日志示例：

```bash
journalctl -u anonresume-web.service -o cat --no-pager
journalctl -u anonresume-pdf-worker.service -o cat --no-pager
journalctl -u anonresume-ai-worker.service -o cat --no-pager
```

这些命令可能包含本地敏感事件，只能在受保护终端运行，不要将输出附加到工单。

### Filebeat 或 Elastic Agent

下面的片段仅展示解析与丢弃原则，路径、输入类型和输出由企业平台维护：

```yaml
processors:
  - decode_json_fields:
      fields: [message]
      target: ""
      overwrite_keys: true
      add_error_key: true
  - drop_event:
      when:
        equals:
          labels.centralize: false
```

在上线前用真实采集器验证字段类型、长日志截断、重启期间缓冲和死信处理。采集器或 Elasticsearch 故障不得成为 Web、PDF Worker 或 AI Worker 的可用性依赖。

## 排障

- `docker compose -f docker/observability/compose.yaml ps`：确认三个服务均为 `healthy`。
- `docker compose -f docker/observability/compose.yaml logs logstash`：检查 GELF 监听、管道重载和 Elasticsearch 输出错误。
- `curl http://127.0.0.1:9200/_data_stream?pretty`：确认两个 AnonResume 数据流及 ILM 状态。
- 业务响应的 `x-request-id` 在 Kibana 中无结果时，先检查对应服务是否使用 JSON 输出，再检查 GELF 地址和 `labels.centralize`。
- Logstash 恢复后只接收新 UDP 事件；本地 GELF 不承诺补发停机期间日志。需要交付保证的生产环境应使用企业现有的磁盘缓冲或代理采集方案。
- `docker compose -f compose.metrics.yaml ps`：确认 Collector、Prometheus 和 Grafana 均为 `healthy`。
- `bun run metrics:smoke -- --infrastructure-only`：只验证指标基础设施和 Prometheus 抓取目标，不要求应用已导出指标。
- `bun run metrics:smoke`：验证至少一个 AnonResume 服务已产生指标。没有数据时确认平台配置已发布、三个进程已重启、端点在对应网络中可访问，并等待完整导出周期。
- Prometheus 的 `anonresume` 目标正常但无应用序列时，查看 Collector 日志中的 OTLP 接收或导出错误；不要在日志中打印 OTLP 认证请求头。
- 多副本队列数异常偏大时，确认查询使用 `max by (job_type, queue_state)`，而不是对副本求和。
