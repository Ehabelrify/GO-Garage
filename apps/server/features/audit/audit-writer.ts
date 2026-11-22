import { randomUUID } from "node:crypto";

interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}

export interface JobAuditEventInput {
  jobId: string;
  action: string;
  /** A safe change summary. Never secrets or private evidence. Truncated to 500 characters. */
  details: string;
  actorUserId: string;
}

/**
 * Appends one row to job_audit_events. Pass the transaction client so the audit row commits or rolls back with the
 * mutation it describes. This is the only existing audit table that fits (job-scoped, free-text action). Staff and
 * customer events have no suitable table yet (see P2T-008), so they are deliberately not written here.
 */
export async function recordAuditEvent(client: Queryable, input: JobAuditEventInput): Promise<void> {
  await client.query(
    "INSERT INTO job_audit_events (id, job_id, action, details, actor_user_id) VALUES ($1,$2,$3,$4,$5)",
    [`job-audit-${randomUUID()}`, input.jobId, input.action, input.details.slice(0, 500), input.actorUserId],
  );
}
