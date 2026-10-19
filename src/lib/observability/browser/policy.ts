// Shared by instrumentation and route bundles; never initializes config or queries DB.
const state = globalThis as typeof globalThis & {
  __anonresumeClientErrors?: boolean;
};
export function setClientErrorPolicy(enabled: boolean) {
  state.__anonresumeClientErrors = enabled;
}
export function readClientErrorPolicy() {
  return state.__anonresumeClientErrors;
}
