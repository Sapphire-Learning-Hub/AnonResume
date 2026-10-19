export type DiagnosticDelivery =
  | { status: "pending" | "unconfirmed" }
  | { status: "accepted"; diagnosticId: string };
const states = new Map<string, DiagnosticDelivery>();
const listeners = new Set<() => void>();
export function setDiagnosticDelivery(id: string, value: DiagnosticDelivery) {
  if (states.size >= 128 && !states.has(id))
    states.delete(states.keys().next().value!);
  states.set(id, value);
  for (const listener of listeners) listener();
}
export function getDiagnosticDelivery(id: string) {
  return states.get(id);
}
export function subscribeDiagnosticState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
