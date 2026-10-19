export class DiagnosticIntakeBudget {
  private windowStart = 0;
  private requests = 0;
  private events = 0;
  private tokens = 30;
  private lastRefill = 0;
  private cache = new Map<
    string,
    { at: number; fingerprint: string; diagnosticId: string }
  >();

  admit(count: number, now = Date.now()) {
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.requests = 0;
      this.events = 0;
    }
    this.tokens = Math.min(
      30,
      this.tokens + Math.max(0, now - this.lastRefill) / 500,
    );
    this.lastRefill = now;
    this.requests++;
    if (this.requests > 120) return false;
    return this.admitEvents(count);
  }
  admitEvents(count: number) {
    if (this.events + count > 120 || this.tokens < count) return false;
    this.events += count;
    this.tokens -= count;
    return true;
  }
  accept(eventId: string, fingerprint: string, now = Date.now()) {
    for (const [key, value] of this.cache)
      if (now - value.at >= 60_000) this.cache.delete(key);
    const existing = this.cache.get(eventId);
    if (existing)
      return existing.fingerprint === fingerprint
        ? { diagnosticId: existing.diagnosticId, duplicate: true }
        : null;
    if (this.cache.size >= 1024)
      this.cache.delete(this.cache.keys().next().value!);
    const diagnosticId = crypto.randomUUID();
    this.cache.set(eventId, { at: now, fingerprint, diagnosticId });
    return { diagnosticId, duplicate: false };
  }
}
