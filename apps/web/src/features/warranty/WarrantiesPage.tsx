import { useEffect, useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { EmptyState, PageHeader, TabBar, TabPanel, useUrlState } from "../../shared/components";
import type { PageProps } from "../../shared/ui";
import { ClaimForm } from "./ClaimForm";
import { ClaimsTab } from "./ClaimsTab";
import { CoverageTab } from "./CoverageTab";
import { HistoryTab } from "./HistoryTab";
import { InvoicesTab } from "./InvoicesTab";
import { IssueCoverage } from "./IssueCoverage";
import { QrTab } from "./QrTab";
import { useWarrantyScope } from "./warranty-scope";
import "./warranty.css";

const tabIds = ["coverage", "claims", "invoices", "qr", "history"] as const;
type Tab = (typeof tabIds)[number];

export function WarrantiesPage(props: PageProps) {
  const { t } = props;
  const scope = useWarrantyScope(props);
  const [rawTab, setRawTab] = useUrlState("tab", "coverage");
  const [, setRecord] = useUrlState("record", "");
  const [issuing, setIssuing] = useState(false);
  const [claimFor, setClaimFor] = useState<string | null>(null);

  const visible: Tab[] = [...tabIds];
  const tab: Tab = (visible as string[]).includes(rawTab) ? (rawTab as Tab) : "coverage";
  const changeTab = (next: string) => { setRecord(""); setRawTab(next); };

  useEffect(() => { setIssuing(false); setClaimFor(null); }, [scope.userId, scope.dataset]);

  if (scope.store.actor?.role === "technician") {
    return <EmptyState variant="no-data" title={t("Warranty is not available for your role", "الضمان غير متاح لدورك")} />;
  }

  const openClaims = scope.claims.filter((claim) => claim.status === "open" || claim.status === "under-review").length;
  const tabs = [
    { id: "coverage", label: t("Coverage", "التغطية"), count: scope.warranties.length },
    { id: "claims", label: t("Claims", "المطالبات"), count: openClaims },
    { id: "invoices", label: t("Invoices", "الفواتير"), count: scope.state.warrantyInvoiceDrafts.filter((invoice) => scope.warranties.some((r) => r.id === invoice.warrantyId)).length },
    { id: "qr", label: t("QR cards", "كروت QR") },
    { id: "history", label: t("History", "السجل") },
  ];

  return <div className="warranty-page">
    <PageHeader title={t("Warranties", "الضمانات")}
      actions={<>
        <button className="btn" type="button" onClick={() => setClaimFor("")}><ClipboardCheck size={15} />{t("Open claim", "فتح مطالبة")}</button>
        {scope.canIssue && <button className="btn btn-primary" type="button" onClick={() => setIssuing(true)}><Plus size={15} />{t("Issue coverage", "إصدار تغطية")}</button>}
      </>} />
    <TabBar tabs={tabs} value={tab} onChange={changeTab} ariaLabel={t("Warranty sections", "أقسام الضمان")} idPrefix="warranty" />
    <TabPanel idPrefix="warranty" id="coverage" active={tab === "coverage"}>
      <CoverageTab scope={scope} onIssue={() => setIssuing(true)} onNewClaim={(id) => setClaimFor(id)}
        onOpenClaim={(id) => { setRawTab("claims"); setRecord(id); }} />
    </TabPanel>
    <TabPanel idPrefix="warranty" id="claims" active={tab === "claims"}><ClaimsTab scope={scope} onNewClaim={() => setClaimFor("")} /></TabPanel>
    <TabPanel idPrefix="warranty" id="invoices" active={tab === "invoices"}><InvoicesTab scope={scope} /></TabPanel>
    <TabPanel idPrefix="warranty" id="qr" active={tab === "qr"}><QrTab scope={scope} /></TabPanel>
    <TabPanel idPrefix="warranty" id="history" active={tab === "history"}><HistoryTab scope={scope} /></TabPanel>

    {scope.canIssue && <IssueCoverage scope={scope} open={issuing} onClose={() => setIssuing(false)} />}
    <ClaimForm scope={scope} open={claimFor !== null} warrantyId={claimFor ?? ""} onClose={() => setClaimFor(null)}
      onDone={() => { setClaimFor(null); setRecord(""); setRawTab("claims"); }} />
  </div>;
}
