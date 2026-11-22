/** P2T-009: cancelled and no-show REQUIRE a reason (min 3 chars after trim). Other stages ignore it. */
export function parseCancellationReason(nextStage: string, reason: unknown): { ok: true; reason: string | null } | { ok: false } {
  if (!["cancelled", "no-show"].includes(nextStage)) return { ok: true, reason: null };
  const text = typeof reason === "string" ? reason.trim() : "";
  return text.length < 3 ? { ok: false } : { ok: true, reason: text.slice(0, 500) };
}
