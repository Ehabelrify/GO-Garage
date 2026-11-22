/** P2T-009: validates the optional workshop cancellation reason (min 3 chars after trim). Absent means "not supplied". */
export function parseCancellationReason(nextStage: string, reason: unknown): { ok: true; reason: string | null } | { ok: false } {
  if (!["cancelled", "no-show"].includes(nextStage) || reason === undefined) return { ok: true, reason: null };
  const text = typeof reason === "string" ? reason.trim() : "";
  return text.length < 3 ? { ok: false } : { ok: true, reason: text.slice(0, 500) };
}
