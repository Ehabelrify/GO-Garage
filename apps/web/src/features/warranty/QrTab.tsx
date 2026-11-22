import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Printer, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { WarrantyRecord } from "@garage/domain";
import { ConfirmDialog, DataTable, DetailDrawer, EmptyState, FilterBar, Notice, SendToCustomer, type Column } from "../../shared/components";
import { WarrantyVerificationCard } from "./PublicWarrantyVerificationPage";
import { startWarrantyPrint } from "./warranty-print";
import { forgetLiveToken, rememberLiveToken } from "./warranty-card";
import { policyDisplayName, verificationReady } from "./warranty-logic";
import { CustomerLink, VehicleLink, type WarrantyScope } from "./warranty-scope";
import { VerificationSettings } from "./VerificationSettings";

type Action = { kind: "replace" | "revoke"; record: WarrantyRecord };

export function QrTab({ scope }: { scope: WarrantyScope }) {
  const { t, lang, state, store, notify, warranties } = scope;
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const ready = verificationReady(state.warrantyVerificationSettings);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [live, setLive] = useState<{ warrantyId: string; token: string } | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setLive(null); setOpenId(null); }, [scope.userId, state.currentBranch]);

  // Opening a warranty that already has an active code re-reads it (the server recomputes it from its secret), so the QR is
  // visible and printable at any time, including for seeded data. A code made before this existed cannot be recovered: say so.
  const [recoverFailed, setRecoverFailed] = useState<string | null>(null);
  useEffect(() => {
    setRecoverFailed(null);
    const target = openId ? warranties.find((item) => item.id === openId) : null;
    if (!target || !target.verificationTokenActive || target.status === "void" || live?.warrantyId === target.id) return;
    let alive = true;
    void store.readWarrantyVerificationToken(target.id).then((result) => {
      if (!alive) return;
      if (result.ok) { rememberLiveToken(target.id, result.token); setLive({ warrantyId: target.id, token: result.token }); }
      else setRecoverFailed(result.error);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, warranties.find((item) => item.id === openId)?.verificationTokenActive]);

  const rows = warranties.filter((record) => {
    const needle = query.trim().toLowerCase();
    return !needle || `${scope.customerName(record.customerId)} ${scope.vehicleOf(record.customerId, record.vehicleId)?.plate ?? ""} ${record.policyName}`.toLowerCase().includes(needle);
  });
  const record = warranties.find((item) => item.id === openId) ?? null;
  const liveCode = record && live?.warrantyId === record.id ? live : null;

  const create = async (target: WarrantyRecord) => {
    setBusyId(target.id); setError("");
    const result = await store.createWarrantyVerificationToken(target.id);
    setBusyId(null);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    rememberLiveToken(target.id, result.token);
    setLive({ warrantyId: target.id, token: result.token });
    setOpenId(target.id);
  };
  const revoke = async (target: WarrantyRecord) => {
    setBusyId(target.id); setError("");
    const result = await store.revokeWarrantyVerificationToken(target.id);
    setBusyId(null);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    forgetLiveToken(target.id);
    if (live?.warrantyId === target.id) setLive(null);
    notify(t("QR code revoked.", "أُلغي رمز QR."));
  };
  const print = async (target: WarrantyRecord) => {
    setPrinting(true); setError("");
    const result = await store.recordWarrantyVerificationPrint(target.id);
    setPrinting(false);
    if (!result.ok) { setError(scope.error(result.error)); return; }
    cleanup.current = startWarrantyPrint("qr");
  };
  const confirm = async () => {
    if (!action) return;
    const current = action;
    setAction(null);
    if (current.kind === "replace") await create(current.record); else await revoke(current.record);
  };

  const settings = state.warrantyVerificationSettings;
  const preview = (target: WarrantyRecord) => {
    const approved = settings?.approvedFields ?? [];
    const service = state.services.find((item) => item.id === target.serviceId);
    const branch = state.branches.find((item) => item.id === target.branchId);
    return {
      verified: true as const, status: target.status,
      ...(approved.includes("service") ? { serviceName: { en: service?.name ?? "—", ar: service?.nameAr ?? service?.name ?? "—" } } : {}),
      ...(approved.includes("branch") ? { branchName: { en: branch?.name ?? "—", ar: branch?.nameAr ?? branch?.name ?? "—" } } : {}),
      ...(approved.includes("startDate") ? { startDate: target.startDate } : {}),
      ...(approved.includes("expiresOn") && target.expiresOn ? { expiresOn: target.expiresOn } : {}),
      ...(approved.includes("coverage") ? { coverage: target.coverageKind === "lifetime"
        ? { kind: "lifetime" as const, ...(target.lifetimeDefinition ? { publicWording: target.lifetimeDefinition.publicWording } : {}) }
        : { kind: "fixed" as const } } : {}),
    };
  };

  const columns: Column<WarrantyRecord>[] = [
    { key: "customer", header: t("Customer", "العميل"), primary: true, render: (r) => <CustomerLink scope={scope} customerId={r.customerId} /> },
    { key: "vehicle", header: t("Vehicle", "المركبة"), render: (r) => <VehicleLink scope={scope} customerId={r.customerId} vehicleId={r.vehicleId} /> },
    { key: "policy", header: t("Coverage", "التغطية"), render: (r) => policyDisplayName(r.policyName) },
    { key: "code", header: t("QR code", "رمز QR"), render: (r) => r.verificationTokenActive ? t("Active", "فعال") : t("None", "لا يوجد") },
    { key: "actions", header: "", hideOnCard: true, render: (r) => ready && scope.canIssue ? <button className="btn btn-sm" type="button" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}><QrCode size={14} />{t("Open", "فتح")}</button> : null },
  ];

  return <>
    {!ready && <Notice tone="info">{scope.isOwner
      ? t("Enable public verification below to prepare QR cards.", "فعّل التحقق العام أدناه لتجهيز كروت QR.")
      : t("Public verification is off. Ask the Owner to enable it.", "التحقق العام متوقف. اطلب من المالك تفعيله.")}</Notice>}
    {!ready && scope.isOwner && <VerificationSettings scope={scope} />}
    {ready && <>
      <FilterBar lang={lang} resultCount={rows.length} search={{ value: query, onChange: setQuery, placeholder: t("Customer, plate or policy…", "العميل أو اللوحة أو السياسة…") }}
        onClear={query ? () => setQuery("") : undefined} />
      {error && !record && <div className="form-error" role="alert">{error}</div>}
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} lang={lang} caption={t("Customer QR cards", "كروت QR للعملاء")}
        loading={store.status === "loading" && state.warranties.length === 0} onRowClick={scope.canIssue ? (r) => setOpenId(r.id) : undefined}
        empty={<EmptyState title={query ? t("No matches", "لا توجد نتائج") : t("No coverage to prepare", "لا توجد تغطية للتجهيز")}
          action={query ? <button className="btn" type="button" onClick={() => setQuery("")}>{t("Clear filters", "مسح التصفية")}</button> : undefined} />} />
    </>}

    {record && <DetailDrawer open onClose={() => { setOpenId(null); setError(""); }} lang={lang} wide
      title={t("Customer QR card", "كارت QR للعميل")} subtitle={`${scope.customerName(record.customerId)} · ${policyDisplayName(record.policyName)}`}
      footer={<>
        {scope.isOwner && record.verificationTokenActive && <button className="btn btn-danger" type="button" disabled={busyId === record.id} onClick={() => setAction({ kind: "revoke", record })}>{t("Revoke", "إلغاء الرمز")}</button>}
        {scope.canIssue && <button className="btn btn-primary" type="button" disabled={busyId === record.id || !ready}
          onClick={() => record.verificationTokenActive ? setAction({ kind: "replace", record }) : void create(record)}>
          <QrCode size={15} />{busyId === record.id ? t("Preparing…", "جارٍ التجهيز…") : record.verificationTokenActive ? t("Replace code", "استبدال الرمز") : t("Prepare QR card", "تجهيز كارت QR")}</button>}
        {liveCode && <button className="btn" type="button" disabled={printing} onClick={() => void print(record)}><Printer size={15} aria-hidden="true" />{printing ? t("Logging…", "جارٍ التسجيل…") : t("Print", "طباعة")}</button>}
        {record.status === "active" && <SendToCustomer lang={lang} documentKind="warranty-card" documentId={record.id} verificationToken={liveCode?.token} />}
      </>}>
      <p className="form-hint">{liveCode
        ? t("Print the card now, or open it again any time to reprint the same code.", "اطبع الكارت الآن، أو افتحه في أي وقت لإعادة طباعة نفس الرمز.")
        : record.verificationTokenActive
          ? recoverFailed === "TOKEN_NOT_RECOVERABLE"
            ? t("This code was created before codes could be shown again. Replace it to print a new card.", "أُنشئ هذا الرمز قبل إمكانية عرضه مجدداً. استبدله لطباعة كارت جديد.")
            : recoverFailed
              ? t("The code could not be loaded. Try again.", "تعذر تحميل الرمز. حاول مجدداً.")
              : t("Loading the code…", "جارٍ تحميل الرمز…")
          : t("No active code yet.", "لا يوجد رمز فعال بعد.")}</p>
      <div className={`w-verify-print-area${liveCode ? "" : " preview-only"}`}>
        <div className="w-verify-print-card">
          {liveCode && <div className="w-verify-qr">
            <QRCodeSVG value={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/warranty/verify/${encodeURIComponent(liveCode.token)}`} size={150} level="H" includeMargin />
            <small>{t("Scan to verify", "امسح للتحقق")}</small>
          </div>}
          <WarrantyVerificationCard data={preview(record)} lang={lang} />
        </div>
      </div>
      <p className="form-hint"><BadgeCheck size={13} /> {t("This is what the customer sees.", "هذا ما يراه العميل.")}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
    </DetailDrawer>}

    <ConfirmDialog open={action !== null} lang={lang} danger
      title={action?.kind === "revoke" ? t("Revoke this QR code?", "إلغاء رمز QR؟") : t("Replace this QR code?", "استبدال رمز QR؟")}
      body={action?.kind === "revoke" ? t("Printed copies stop working.", "تتوقف النسخ المطبوعة عن العمل.") : t("The previous printed card stops working.", "يتوقف الكارت المطبوع السابق عن العمل.")}
      confirmLabel={action?.kind === "revoke" ? t("Revoke", "إلغاء الرمز") : t("Replace", "استبدال")}
      onCancel={() => setAction(null)} onConfirm={() => void confirm()} />
  </>;
}
