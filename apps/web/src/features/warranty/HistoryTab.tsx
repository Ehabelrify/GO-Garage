import { useMemo, useState } from "react";
import { DataTable, DateText, EmptyState, FilterBar, type Column } from "../../shared/components";
import type { WarrantyAuditEvent } from "@garage/domain";
import { auditActionLabel } from "./warranty-copy";
import { visibleAuditEvents } from "./warranty-logic";
import type { WarrantyScope } from "./warranty-scope";

export function HistoryTab({ scope }: { scope: WarrantyScope }) {
  const { t, lang, state, warranties, claims } = scope;
  const [query, setQuery] = useState("");
  const events = useMemo(() => {
    const warrantyIds = new Set(warranties.map((record) => record.id));
    const claimIds = new Set(claims.map((claim) => claim.id));
    return visibleAuditEvents(state.warrantyAuditEvents, warrantyIds, claimIds, scope.isOwner);
  }, [state.warrantyAuditEvents, warranties, claims, scope.isOwner]);
  const rows = events.filter((event) => !query.trim() || `${auditActionLabel(event.action, lang)} ${event.details} ${event.actorLabel}`.toLowerCase().includes(query.trim().toLowerCase()));
  const kind = (event: WarrantyAuditEvent) => event.entityType === "policy" ? t("Policy", "السياسة") : event.entityType === "warranty" ? t("Warranty", "الضمان") : t("Claim", "المطالبة");

  const columns: Column<WarrantyAuditEvent>[] = [
    { key: "when", header: t("When", "الوقت"), sortable: true, sortValue: (e) => e.occurredAt, render: (e) => <DateText value={e.occurredAt} lang={lang} /> },
    { key: "action", header: t("Action", "الإجراء"), primary: true, render: (e) => <>{auditActionLabel(e.action, lang)}{e.policyVersion ? ` · v${e.policyVersion}` : ""}</> },
    { key: "kind", header: t("On", "على"), render: kind },
    { key: "by", header: t("By", "بواسطة"), render: (e) => e.actorLabel },
    { key: "details", header: t("Details", "التفاصيل"), render: (e) => e.details },
  ];
  return <>
    <FilterBar lang={lang} resultCount={rows.length} search={{ value: query, onChange: setQuery, placeholder: t("Search history…", "ابحث في السجل…") }} onClear={query ? () => setQuery("") : undefined} />
    <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} lang={lang} caption={t("Warranty history", "سجل الضمان")}
      initialSort={{ key: "when", direction: "desc" }}
      empty={<EmptyState variant={query ? "no-results" : "no-data"} title={query ? t("No matches", "لا توجد نتائج") : t("No history yet", "لا يوجد سجل بعد")} />} />
  </>;
}
