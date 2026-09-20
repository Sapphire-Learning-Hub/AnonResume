export type ConfigConsumer = "web" | "pdf-worker" | "ai-worker";
export type ConfigApplyMode = "hot" | "restart";
export type ConfigGroup =
  | "general"
  | "email"
  | "security"
  | "pdf"
  | "resume"
  | "ai";

export interface ConfigDefinition<T> {
  applyMode: ConfigApplyMode;
  consumers: readonly ConfigConsumer[];
  defaultValue: T;
  environmentKey?: string;
  group: ConfigGroup;
  public: boolean;
  sensitive: boolean;
}
