# 日志与 ELK 可观测性

AnonResume 的 Web、PDF Worker、AI Worker、迁移和维护进程会向标准输出写入单行结构化日志。生产环境默认使用 ECS JSON，开发环境默认使用便于阅读的单行格式。应用不依赖 Elasticsearch、Logstash 或 Kibana；采集端不可用时，业务进程仍应继续运行。

本文说明日志契约、本地 ELK 环境，以及接入企业现有日志平台时必须遵守的安全边界。指标和链路追踪不在当前阶段范围内。

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
