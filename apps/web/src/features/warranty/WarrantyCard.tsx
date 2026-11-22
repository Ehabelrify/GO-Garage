import { useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { WarrantyRecord } from "@garage/domain";
import { DetailDrawer, Notice, Plate, SendToCustomer } from "../../shared/components";
import { buildWarrantyCard, cardLabels, liveToken, type CardVariant, type WarrantyCardModel } from "./warranty-card";
import { verificationReady } from "./warranty-logic";
import { usePrintRequest } from "./warranty-print-request";
import type { WarrantyScope } from "./warranty-scope";
import "./warranty-card.css";

/** One printable card: a front and a back page. Pure presentation of a WarrantyCardModel (no store access). */
export function WarrantyCardSheet({ model, variant }: { model: WarrantyCardModel; variant: CardVariant }) {
  const l = model.labels;
  const dir = model.lang === "ar" ? "rtl" : "ltr";
  return <div className={`wc-pair wc-${variant}`} dir={dir} lang={model.lang}>
    <article className="wc-face wc-front" aria-label={l.title}>
      <header className="wc-head">
        <div className="wc-brand">
          <span className="wc-logo" aria-hidden="true">{model.business.name.slice(0, 2)}</span>
          <span><strong>{model.business.name}</strong><small>{model.business.subtitle}</small></span>
        </div>
        <div className="wc-title"><strong>{l.title}</strong><small>{l.number} <bdi className="mono">{model.number}</bdi></small></div>
      </header>
      <div className="wc-body">
        <dl className="wc-facts">
          <div><dt>{l.customer}</dt><dd>{model.customerName}</dd></div>
          <div><dt>{l.vehicle}</dt><dd><Plate value={model.plate} />{model.vehicleDescription && <span className="wc-sub">{model.vehicleDescription}</span>}</dd></div>
          <div className="wc-wide"><dt>{l.coverage}</dt><dd>{model.product}<span className="wc-sub">{model.serviceLabel}</span></dd></div>
        </dl>
        <div className="wc-qr">
          {model.qr.state === "live"
            ? <><QRCodeSVG value={model.qr.url} size={96} level="M" marginSize={0} /><small>{l.scan}</small></>
            : <span className="wc-qr-off">{model.qrNote}</span>}
        </div>
      </div>
      <div className="wc-term" data-kind={model.coverageKind}>
        <strong>{model.termHeading}</strong>
        {model.termDetail && <span>{model.termDetail}</span>}
      </div>
      <footer className="wc-foot"><span>{l.branch}: {model.branch}</span><span>{l.issued}: {model.issueDate}</span></footer>
      {model.void && <span className="wc-void">VOID</span>}
    </article>
    <article className="wc-face wc-back" aria-label={l.backTitle}>
      <h3>{l.backTitle}</h3>
      <ol>{l.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <p className="wc-placeholder">{l.placeholder}</p>
      <footer className="wc-foot"><span>{model.business.name}</span><span><bdi className="mono">{model.number}</bdi></span></footer>
    </article>
  </div>;
}

const PREVIEW_LIMIT = 4;

/** Print preview for one or many warranties. Printing a live QR card writes the print/reprint audit event first. */
export function WarrantyCardDrawer({ scope, records, onClose }: { scope: WarrantyScope; records: WarrantyRecord[]; onClose: () => void }) {
  const { t, lang, state, store } = scope;
  const [variant, setVariant] = useState<CardVariant>("card");
  const [printing, requestPrint] = usePrintRequest();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enabled = verificationReady(state.warrantyVerificationSettings);
  const models = records.map((record) => {
    const vehicle = scope.vehicleOf(record.customerId, record.vehicleId);
    return {
      record,
      model: buildWarrantyCard({
        record, lang, customerName: scope.customerName(record.customerId), plate: vehicle?.plate ?? "—", vehicleDescription: vehicle?.makeModel,
        serviceLabel: scope.serviceName(record.serviceId), branchLabel: scope.branchName(record.branchId),
        verificationEnabled: enabled, token: liveToken(record.id), origin: window.location.origin, basePath: import.meta.env.BASE_URL,
      }),
    };
  });
  const live = models.filter((item) => item.model.qr.state === "live");
  const noQr = models.length - live.length;

  const print = async () => {
    setBusy(true); setError("");
    for (const item of live) {
      const result = await store.recordWarrantyVerificationPrint(item.record.id);
      if (!result.ok) { setBusy(false); setError(scope.error(result.error)); return; }
    }
    setBusy(false);
    requestPrint();
  };

  return <DetailDrawer open onClose={onClose} lang={lang} wide
    title={records.length === 1 ? t("Warranty card", "بطاقة الضمان") : t("Warranty cards", "بطاقات الضمان")}
    subtitle={records.length === 1 ? scope.customerName(records[0].customerId) : t(`${records.length} cards`, `${records.length} بطاقة`)}
    footer={<>{records.length === 1 && records[0].status === "active" && <SendToCustomer lang={lang} documentKind="warranty-card" documentId={records[0].id} verificationToken={liveToken(records[0].id)} />}<button className="btn btn-primary w-nowrap" type="button" disabled={busy || printing || !models.length} onClick={() => void print()}>
      <Printer size={15} aria-hidden="true" />{busy ? t("Logging…", "جارٍ التسجيل…") : live.length ? t("Print or reprint", "طباعة أو إعادة طباعة") : t("Print", "طباعة")}</button></>}>
    <div className="wc-variants" role="group" aria-label={t("Card size", "حجم البطاقة")}>
      <button type="button" className={`btn btn-sm${variant === "card" ? " btn-primary" : ""}`} aria-pressed={variant === "card"} onClick={() => setVariant("card")}>{t("Card 85.6 x 54 mm", "بطاقة 85.6 × 54 مم")}</button>
      <button type="button" className={`btn btn-sm${variant === "a5" ? " btn-primary" : ""}`} aria-pressed={variant === "a5"} onClick={() => setVariant("a5")}>{t("A5 certificate", "شهادة A5")}</button>
    </div>
    {!enabled && <Notice tone="info">{t("Public verification is off, so cards print without a live QR.", "التحقق العام متوقف، فتُطبع البطاقات بدون رمز QR فعال.")}</Notice>}
    {enabled && noQr > 0 && <Notice tone="info">{t(
      `${noQr} of ${models.length} print without a QR: the code is only shown right after it is prepared in the QR cards tab.`,
      `${noQr} من ${models.length} تُطبع بدون QR: يظهر الرمز فقط بعد تجهيزه في تبويب كروت QR.`)}</Notice>}
    {live.length > 0 && <p className="form-hint">{t("Printing a QR card is logged as print or reprint.", "تُسجَّل طباعة كارت QR كطباعة أو إعادة طباعة.")}</p>}
    <div className="wc-preview">
      {models.slice(0, PREVIEW_LIMIT).map(({ record, model }) => <WarrantyCardSheet key={record.id} model={model} variant={variant} />)}
    </div>
    {models.length > PREVIEW_LIMIT && <p className="form-hint">{t(`+${models.length - PREVIEW_LIMIT} more print too.`, `+${models.length - PREVIEW_LIMIT} أخرى ستُطبع أيضاً.`)}</p>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {printing && createPortal(
      <div className="doc-print-host wc-print-host" data-variant={variant} aria-hidden="true">
        {models.map(({ record, model }) => <WarrantyCardSheet key={record.id} model={model} variant={variant} />)}
      </div>, document.body)}
  </DetailDrawer>;
}

export { cardLabels };
