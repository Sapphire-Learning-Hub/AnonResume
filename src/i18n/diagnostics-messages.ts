import type { AppLocale } from "./messages";

const zh = {
  mappedFrames: "源码位置", generatedFrames: "原始运行位置", mappingBuild: "映射构建",
  "mapping.mapped": "已还原源码", "mapping.source": "原生源码位置（未经过映射）", "mapping.missing_artifact": "缺少该构建的私有映射", "mapping.invalid_artifact": "映射无效或校验失败", "mapping.asset_missing": "该构建未归档此分块", "mapping.unmapped": "此位置没有源码映射",
  title: "故障诊断", search: "诊断编号、请求编号或任务编号", query: "查询", refresh: "刷新", retry: "重试",
  attempt: "上游尝试次数", timeoutPhase: "超时阶段", "timeout.connection": "连接", "timeout.first_chunk": "首段响应", "timeout.stream_idle": "流式响应空闲", "timeout.total": "总时限",
  reauthenticate: "管理会话已失效，请重新进入管理模式", enterManagement: "进入管理模式", forbidden: "当前管理账号没有诊断查询权限",
  "stage.app.pdf.render": "浏览器渲染 PDF", "stage.app.pdf.save": "保存 PDF 产物",
  loading: "正在加载诊断记录", failed: "诊断记录暂时无法加载", detailFailed: "详情暂时无法加载", missing: "未找到记录，可能已过期或未能保存",
  empty: "没有符合条件的故障记录", allSources: "全部来源", allCategories: "全部分类", allRoles: "全部服务", days: "最近天数",
  instance: "实例", build: "构建", time: "发生时间", source: "来源", category: "原因分类", reason: "故障原因", count: "同类次数", first: "同类首次发生", last: "同类最近发生",
  detail: "查看详情", next: "下一页", previous: "上一页", identifier: "诊断编号", request: "请求编号", task: "任务编号",
  error: "错误类型 / 代码", release: "发行版本", environment: "环境", role: "服务", frames: "代码位置", causes: "原因链", timeline: "关键阶段", parent: "父阶段",
  client: "以下信息由浏览器声明，尚未验证；不能视为精确的服务端链路关联。", clientBuild: "浏览器声明构建", digest: "框架摘要参考",
  incomplete: "此处只展示已采集的关键阶段，完整性未知；未出现的阶段不代表未执行。跨实例排序不保证精确因果或耗时关系。",
  truncated: "记录已触及采集上限，部分阶段被截断。", disabled: "内置故障保存已关闭；已有未过期记录仍可查询，服务器日志继续输出。",
  degraded: "当前 Web 实例的诊断采集存在丢弃或存储失败。其他实例的状态未知，请按需检查服务器日志。",
  retention: "仅查询保留期内的故障。采集为异步写入，旧版本或未送达的数据无法补回。", invalid: "请填写有效的 UUID 编号",
  "source.http": "HTTP 请求", "source.framework": "页面 / 框架", "source.browser": "浏览器上报", "source.ai": "AI 任务", "source.pdf": "PDF 任务", "source.runtime": "运行时",
  "category.timeout": "响应超时", "category.network": "依赖网络故障", "category.database": "数据库故障", "category.authentication": "上游认证失败", "category.protocol": "响应协议异常", "category.application": "应用异常",
  "outcome.running": "执行中 / 未收到结束记录", "outcome.success": "完成", "outcome.failure": "失败", "outcome.cancelled": "取消",
  "stage.app.http.request": "处理请求", "stage.app.ai.execute": "执行 AI 任务", "stage.app.pdf.execute": "执行 PDF 任务", "stage.app.ai.review.round": "AI 审查轮次", "stage.app.ai.provider.round": "AI 上游轮次", "stage.app.email.send": "发送邮件", "stage.task.queued": "任务交接 / 认领", "stage.task.finished": "任务结束", "stage.app.operation": "应用阶段", fault: "记录故障",
};
const en: Record<keyof typeof zh, string> = {
  mappedFrames: "Source locations", generatedFrames: "Original runtime locations", mappingBuild: "Mapping build",
  "mapping.mapped": "Source resolved", "mapping.source": "Native source position (not symbolicated)", "mapping.missing_artifact": "Private artifacts missing for this build", "mapping.invalid_artifact": "Invalid artifact or integrity check failed", "mapping.asset_missing": "Chunk not archived in this build", "mapping.unmapped": "No source mapping at this position",
  title: "Fault diagnostics", search: "Diagnostic, request or task ID", query: "Search", refresh: "Refresh", retry: "Retry",
  attempt: "Upstream attempts", timeoutPhase: "Timeout phase", "timeout.connection": "Connection", "timeout.first_chunk": "First chunk", "timeout.stream_idle": "Stream idle", "timeout.total": "Total deadline",
  reauthenticate: "Management session expired; enter management mode again", enterManagement: "Enter management mode", forbidden: "This administrator cannot read diagnostics",
  "stage.app.pdf.render": "Render PDF in browser", "stage.app.pdf.save": "Save PDF artifact",
  loading: "Loading diagnostics", failed: "Diagnostics could not be loaded", detailFailed: "Details could not be loaded", missing: "Record not found; it may have expired or could not be saved",
  empty: "No matching fault records", allSources: "All sources", allCategories: "All categories", allRoles: "All services", days: "Recent days",
  instance: "Instance", build: "Build", time: "Occurred", source: "Source", category: "Cause category", reason: "Fault cause", count: "Similar occurrences", first: "First similar occurrence", last: "Latest similar occurrence",
  detail: "View details", next: "Next", previous: "Previous", identifier: "Diagnostic ID", request: "Request ID", task: "Task ID",
  error: "Error type / code", release: "Release", environment: "Environment", role: "Service", frames: "Code locations", causes: "Causes", timeline: "Key stages", parent: "Parent stage",
  client: "The following browser claims are unverified and do not establish an exact server-side trace relationship.", clientBuild: "Claimed browser build", digest: "Framework digest reference",
  incomplete: "Only captured key stages are shown; completeness is unknown. Missing stages may still have executed. Cross-instance ordering does not establish exact causality or duration.",
  truncated: "The capture limit was reached; some stages were truncated.", disabled: "Built-in storage is disabled. Unexpired records remain available and server logs continue.",
  degraded: "This Web instance has dropped diagnostics or encountered storage failures. Other instances have unknown health; check server logs as needed.",
  retention: "Only unexpired faults are queried. Writes are asynchronous; older or undelivered records cannot be recovered.", invalid: "Enter a valid UUID",
  "source.http": "HTTP request", "source.framework": "Page / framework", "source.browser": "Browser report", "source.ai": "AI task", "source.pdf": "PDF task", "source.runtime": "Runtime",
  "category.timeout": "Response timeout", "category.network": "Dependency network failure", "category.database": "Database failure", "category.authentication": "Upstream authentication failure", "category.protocol": "Invalid response protocol", "category.application": "Application error",
  "outcome.running": "Running / no completion received", "outcome.success": "Complete", "outcome.failure": "Failed", "outcome.cancelled": "Cancelled",
  "stage.app.http.request": "Handle request", "stage.app.ai.execute": "Execute AI task", "stage.app.pdf.execute": "Execute PDF task", "stage.app.ai.review.round": "AI review round", "stage.app.ai.provider.round": "AI provider round", "stage.app.email.send": "Send email", "stage.task.queued": "Task handoff / claim", "stage.task.finished": "Task finished", "stage.app.operation": "Application stage", fault: "Fault recorded",
};
export type DiagnosticMessageKey = keyof typeof zh;
export function createDiagnosticTranslator(locale: AppLocale) {
  const messages = locale === "zh-CN" ? zh : en;
  return (key: DiagnosticMessageKey) => messages[key];
}
