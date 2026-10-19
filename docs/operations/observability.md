# 日志与指标可观测性

AnonResume 的 Web、PDF Worker、AI Worker、迁移和维护进程会向标准输出写入单行结构化日志。生产环境默认使用 ECS JSON，开发环境默认使用便于阅读的单行格式。应用不依赖 Elasticsearch、Logstash 或 Kibana；采集端不可用时，业务进程仍应继续运行。

本文说明日志契约、本地 ELK 环境、OpenTelemetry 指标，以及接入企业现有可观测平台时必须遵守的安全边界。日志和指标是两条互相独立的链路：日志写入标准输出，指标通过 OTLP/HTTP 主动发送；任一外部设施不可用都不会阻止业务服务运行。链路追踪不在当前阶段范围内。

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
