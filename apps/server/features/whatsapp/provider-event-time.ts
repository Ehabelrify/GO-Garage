export function parseProviderEventTime(value: unknown, now = new Date()): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const occurredAt = new Date(value);
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > now.getTime()) return null;
  return occurredAt;
}
