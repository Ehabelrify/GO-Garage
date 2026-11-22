/**
 * The unified, read-only audit timeline: one UNION ALL over the append-only audit and event tables.
 * Every arm yields the same twelve columns so the outer query can filter, order and page them as one stream.
 * `$1` is always the execution environment id (only the money arms use it).
 *
 * Columns: uid, occurred_at, kind, action, actor_id, entity_type, entity_id, branch_id, detail, before_value, after_value, extra.
 * Not included on purpose: system-generated simulated reminders, promotion allocation internals and warranty
 * termination rows (the termination is already audited as a warranty event). Staff invitations, permission edits, customer
 * create/edit and reminder-rule changes come from staff_customer_audit_events (migration 0039).
 */
export const auditKinds = [
  "settings", "policy", "catalogue", "quote", "warranty", "whatsapp", "job", "owner-record", "availability", "invoice",
  "special-request", "benefit", "transport", "reservation", "customer-merge", "money", "consent", "staff-access", "customer", "reminder",
] as const;
export type AuditKind = (typeof auditKinds)[number];

interface ArmInput {
  from: string;
  uid: string;
  at: string;
  kind: AuditKind;
  action: string;
  actor?: string;
  entityType: string;
  entityId: string;
  branch?: string;
  detail?: string;
  before?: string;
  after?: string;
  extra?: string;
  where?: string;
}

function arm(f: ArmInput): string {
  return `SELECT (${f.uid})::text AS uid, ${f.at} AS occurred_at, '${f.kind}'::text AS kind, (${f.action})::text AS action, `
    + `(${f.actor ?? "NULL"})::text AS actor_id, (${f.entityType})::text AS entity_type, (${f.entityId})::text AS entity_id, `
    + `(${f.branch ?? "NULL"})::text AS branch_id, (${f.detail ?? "''"})::text AS detail, (${f.before ?? "NULL"})::text AS before_value, `
    + `(${f.after ?? "NULL"})::text AS after_value, (${f.extra ?? "NULL"})::jsonb AS extra FROM ${f.from}${f.where ? ` WHERE ${f.where}` : ""}`;
}

export const auditArms: Array<{ table: string; sql: string }> = [
  { table: "setting_audit_events", sql: arm({
    from: "setting_audit_events e", uid: "'setting:'||e.id", at: "e.created_at", kind: "settings", action: "'setting-changed'", actor: "e.actor_user_id",
    entityType: "'setting'", entityId: "e.setting_id", branch: "CASE WHEN e.scope_key='business' THEN NULL ELSE e.scope_key END",
    before: "e.old_value", after: "e.new_value", extra: "jsonb_build_object('scope',e.scope_key,'version',e.version)",
  }) },
  { table: "warranty_verification_settings_audit", sql: arm({
    from: "warranty_verification_settings_audit e", uid: "'verification:'||e.id", at: "e.created_at", kind: "settings", action: "'verification-'||e.action",
    actor: "e.actor_user_id", entityType: "'setting'", entityId: "'warranty-verification'", detail: "array_to_string(e.approved_fields, ', ')",
    after: "CASE WHEN e.enabled THEN 'on' ELSE 'off' END",
  }) },
  { table: "commercial_policy_audit", sql: arm({
    from: "commercial_policy_audit e LEFT JOIN commercial_policy_versions v ON v.policy_id=e.policy_id AND v.version=e.version",
    uid: "'policy:'||e.id", at: "e.occurred_at", kind: "policy", action: "e.action", actor: "e.actor_id", entityType: "'commercial-policy'",
    entityId: "e.policy_id", branch: "v.branch_id", detail: "COALESCE(e.reason,'')", extra: "jsonb_build_object('version',e.version)",
  }) },
  { table: "catalogue_audit", sql: arm({
    from: "catalogue_audit e", uid: "'catalogue:'||e.id", at: "e.occurred_at", kind: "catalogue", action: "e.action", actor: "e.actor_id",
    entityType: "CASE WHEN e.entity_kind='package' THEN 'catalogue-package' ELSE 'catalogue-grade' END", entityId: "e.entity_id",
    detail: "e.reason", extra: "jsonb_build_object('version',e.version)",
  }) },
  { table: "quote_audit", sql: arm({
    from: "quote_audit e LEFT JOIN quote_heads h ON h.id=e.quote_id", uid: "'quote:'||e.id", at: "e.occurred_at", kind: "quote", action: "e.action",
    actor: "e.actor_id", entityType: "'quote'", entityId: "e.quote_id", branch: "h.branch_id", detail: "COALESCE(e.reason,'')",
    extra: "jsonb_build_object('revision',e.revision)",
  }) },
  { table: "quote_acceptance_events", sql: arm({
    from: "quote_acceptance_events e LEFT JOIN quote_heads h ON h.id=e.quote_id", uid: "'quote-acceptance:'||e.id", at: "e.occurred_at", kind: "quote",
    action: "'acceptance-recorded'", actor: "e.actor_id", entityType: "'quote'", entityId: "e.quote_id", branch: "h.branch_id", detail: "e.method",
    extra: "jsonb_build_object('revision',e.revision)",
  }) },
  { table: "warranty_audit_events", sql: arm({
    from: "warranty_audit_events e LEFT JOIN warranty_claims c ON c.id=e.claim_id LEFT JOIN warranties w ON w.id=COALESCE(e.warranty_id,c.warranty_id)",
    uid: "'warranty:'||e.id", at: "e.created_at", kind: "warranty", action: "e.action", actor: "e.actor_user_id",
    entityType: "CASE WHEN e.claim_id IS NOT NULL THEN 'claim' WHEN e.warranty_id IS NOT NULL THEN 'warranty' ELSE 'warranty-policy' END",
    entityId: "COALESCE(e.claim_id,e.warranty_id,e.policy_id)", branch: "w.branch_id", detail: "e.details",
  }) },
  { table: "warranty_qr_print_events", sql: arm({
    from: "warranty_qr_print_events e LEFT JOIN warranties w ON w.id=e.warranty_id", uid: "'warranty-qr:'||e.id", at: "e.created_at", kind: "warranty",
    action: "'qr-'||e.action", actor: "e.actor_user_id", entityType: "'warranty'", entityId: "e.warranty_id", branch: "w.branch_id",
  }) },
  { table: "whatsapp_conversation_events", sql: arm({
    from: "whatsapp_conversation_events e LEFT JOIN whatsapp_conversations c ON c.id=e.conversation_id", uid: "'whatsapp:'||e.id", at: "e.created_at",
    kind: "whatsapp", action: "e.event_type", actor: "e.actor_user_id", entityType: "'conversation'", entityId: "e.conversation_id", branch: "c.branch_id",
    detail: "e.details",
  }) },
  { table: "job_events", sql: arm({
    from: "job_events e LEFT JOIN jobs j ON j.id=e.job_id", uid: "'job-event:'||e.id", at: "e.created_at", kind: "job",
    action: "CASE WHEN e.from_stage IS NULL THEN 'job-opened' WHEN e.to_stage=e.from_stage THEN 'job-updated' ELSE 'stage-'||e.to_stage END",
    actor: "e.actor_user_id", entityType: "'job'", entityId: "e.job_id", branch: "j.branch_id", detail: "e.note", before: "e.from_stage", after: "e.to_stage",
  }) },
  { table: "job_audit_events", sql: arm({
    from: "job_audit_events e LEFT JOIN jobs j ON j.id=e.job_id", uid: "'job-audit:'||e.id", at: "e.created_at", kind: "job", action: "e.action",
    actor: "e.actor_user_id", entityType: "'job'", entityId: "e.job_id", branch: "j.branch_id", detail: "e.details",
  }) },
  { table: "owner_record_audit", sql: arm({
    from: "owner_record_audit e", uid: "'owner-record:'||e.id", at: "e.occurred_at", kind: "owner-record", action: "e.action", actor: "e.actor_id",
    entityType: "e.entity_kind", entityId: "e.entity_id", detail: "e.reason",
    where: "e.action NOT IN ('merged','merge-undone')",
  }) },
  { table: "branch_availability_audit", sql: arm({
    from: "branch_availability_audit e", uid: "'availability:'||e.id", at: "e.occurred_at", kind: "availability", action: "e.action", actor: "e.actor_id",
    entityType: "'branch'", entityId: "e.branch_id", branch: "e.branch_id", detail: "e.reason", extra: "jsonb_build_object('version',e.version)",
  }) },
  { table: "invoice_events", sql: arm({
    from: "invoice_events e LEFT JOIN invoices i ON i.id=e.invoice_id", uid: "'invoice:'||e.invoice_id||':'||e.seq", at: "e.occurred_at", kind: "invoice",
    action: "e.action", actor: "e.actor_id", entityType: "'invoice'", entityId: "e.invoice_id", branch: "i.branch_id", detail: "e.reason",
    before: "e.from_status", after: "e.to_status",
  }) },
  { table: "special_request_events", sql: arm({
    from: "special_request_events e LEFT JOIN special_requests r ON r.id=e.request_id", uid: "'special-request:'||e.request_id||':'||e.seq",
    at: "e.occurred_at", kind: "special-request", action: "e.action", actor: "e.actor_id", entityType: "'special-request'", entityId: "e.request_id",
    branch: "r.branch_id", detail: "e.reason", before: "e.from_status", after: "e.to_status",
  }) },
  { table: "benefit_audit", sql: arm({
    from: "benefit_audit e", uid: "'benefit:'||e.id", at: "e.occurred_at", kind: "benefit", action: "e.action", actor: "e.actor_id",
    entityType: "'benefit'", entityId: "e.entitlement_id",
  }) },
  { table: "transport_events", sql: arm({
    from: "transport_events e LEFT JOIN transport_requests r ON r.id=e.transport_id", uid: "'transport:'||e.id", at: "e.occurred_at", kind: "transport",
    action: "'status-'||e.to_status", actor: "e.actor_id", entityType: "'transport'", entityId: "e.transport_id", branch: "r.branch_id",
    detail: "COALESCE(e.reason,'')", before: "e.from_status", after: "e.to_status",
  }) },
  { table: "promotion_reservation_events", sql: arm({
    from: "promotion_reservation_events e LEFT JOIN promotion_reservations r ON r.id=e.reservation_id", uid: "'reservation:'||e.id", at: "e.occurred_at",
    kind: "reservation", action: "e.action", actor: "e.actor_id", entityType: "'reservation'", entityId: "e.reservation_id", branch: "r.branch_id",
    detail: "COALESCE(e.reason,'')",
  }) },
  { table: "customer_merges", sql: arm({
    from: "customer_merges m", uid: "'merge:'||m.id", at: "m.merged_at", kind: "customer-merge", action: "'customers-merged'", actor: "m.merged_by",
    entityType: "'customer'", entityId: "m.survivor_id", detail: "m.reason", extra: "m.counts",
  }) },
  { table: "customer_merges", sql: arm({
    from: "customer_merges m", uid: "'merge-undo:'||m.id", at: "m.undone_at", kind: "customer-merge", action: "'merge-undone'", actor: "m.undone_by",
    entityType: "'customer'", entityId: "m.survivor_id", detail: "COALESCE(m.undo_reason,'')", where: "m.undone_at IS NOT NULL",
  }) },
  { table: "operational_money_events", sql: arm({
    from: "operational_money_events e", uid: "'money:'||e.id", at: "e.created_at", kind: "money", action: "e.kind||'-recorded'", actor: "e.recorded_by",
    entityType: "'money-event'", entityId: "e.id", branch: "e.branch_id", detail: "e.reason",
    extra: "jsonb_build_object('amountMinor',e.amount_minor,'currency',e.currency,'moneyKind',e.kind,'effectiveAt',e.effective_at)", where: "e.environment_id=$1",
  }) },
  { table: "operational_money_event_reversals", sql: arm({
    from: "operational_money_event_reversals r JOIN operational_money_events e ON e.id=r.event_id", uid: "'money-reversal:'||r.id", at: "r.reversed_at",
    kind: "money", action: "'money-reversed'", actor: "r.reversed_by", entityType: "'money-event'", entityId: "e.id", branch: "e.branch_id", detail: "r.reason",
    extra: "jsonb_build_object('amountMinor',e.amount_minor,'currency',e.currency,'moneyKind',e.kind)", where: "e.environment_id=$1",
  }) },
  { table: "messaging_customer_consent_events", sql: arm({
    from: "messaging_customer_consent_events e", uid: "'consent:'||e.id", at: "e.occurred_at", kind: "consent", action: "'consent-'||e.action", actor: "e.actor_user_id",
    entityType: "'customer'", entityId: "e.customer_id", detail: "e.purpose||COALESCE(' - '||e.reason,'')",
  }) },
  { table: "messaging_inbox_access_audit", sql: arm({
    from: "messaging_inbox_access_audit e", uid: "'inbox-access:'||e.id", at: "e.occurred_at", kind: "staff-access", action: "'inbox-'||e.action",
    actor: "e.actor_user_id", entityType: "'staff'", entityId: "e.staff_user_id",
  }) },
  { table: "staff_customer_audit_events", sql: arm({
    from: "staff_customer_audit_events e", uid: "'staff-audit:'||e.id", at: "e.created_at", kind: "staff-access", action: "e.action", actor: "e.actor_user_id",
    entityType: "'staff'", entityId: "e.entity_id", branch: "e.branch_id", detail: "e.summary", where: "e.entity_kind='staff'",
  }) },
  { table: "staff_customer_audit_events", sql: arm({
    from: "staff_customer_audit_events e", uid: "'customer-audit:'||e.id", at: "e.created_at", kind: "customer", action: "e.action", actor: "e.actor_user_id",
    entityType: "'customer'", entityId: "e.entity_id", branch: "e.branch_id", detail: "e.summary", where: "e.entity_kind='customer'",
  }) },
  { table: "staff_customer_audit_events", sql: arm({
    from: "staff_customer_audit_events e", uid: "'reminder-rule-audit:'||e.id", at: "e.created_at", kind: "reminder", action: "e.action", actor: "e.actor_user_id",
    entityType: "'reminder-rule'", entityId: "e.entity_id", branch: "e.branch_id", detail: "e.summary", where: "e.entity_kind='reminder-rule'",
  }) },
];

/** The unified timeline as a derived table body (alias it `u`). */
export const auditUnionSql = auditArms.map((item) => item.sql).join("\nUNION ALL\n");
