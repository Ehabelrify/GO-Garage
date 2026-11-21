import { useCallback } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { formatMoney } from "../format";
import { documentLabels, type DocumentModel } from "./document-model";
import "./print.css";

const money = (minor: number | null | undefined, currency: string, lang: DocumentModel["lang"]) => formatMoney(minor, currency, lang);
const qty = (value: number, lang: DocumentModel["lang"]) => new Intl.NumberFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { maximumFractionDigits: 2 }).format(value);

/** Prints the PrintHost on the page: marks the body while the dialog is open, then clears it (afterprint plus a timeout fallback). */
export function printDocument() {
  const body = document.body;
  body.classList.add("printing-document");
  const done = () => { body.classList.remove("printing-document"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.setTimeout(done, 60_000);
  try { window.print(); } catch (error) { done(); throw error; }
}

/** Renders the sheet into a body-level host that is only visible when printing. Mount it next to a PrintButton. */
export function PrintHost({ model }: { model: DocumentModel }) {
  return createPortal(<div className="doc-print-host" aria-hidden="true"><DocumentSheet model={model} /></div>, document.body);
}

/** Browser print (choose "Save as PDF" in the dialog). Pair with a mounted PrintHost. */
export function PrintButton({ lang, label, disabled }: { lang: DocumentModel["lang"]; label?: string; disabled?: boolean }) {
  const onClick = useCallback(() => printDocument(), []);
  return <button type="button" className="btn btn-sm no-print" disabled={disabled} onClick={onClick}>
    <Printer size={14} aria-hidden="true" />{label ?? documentLabels[lang].print}
  </button>;
}

/**
 * Generic printable A4 document. Config-driven: pass a DocumentModel; swap this component (or its CSS)
 * when the owner's confirmed template arrives. Print through PrintHost + PrintButton.
 */
export function DocumentSheet({ model, className }: { model: DocumentModel; className?: string }) {
  const l = documentLabels[model.lang];
  const { lang } = model;
  const hasDiscount = model.lines.some((line) => (line.discountMinor ?? 0) > 0);
  const hasTax = model.lines.some((line) => (line.taxMinor ?? 0) > 0);
  return <article className={`doc-sheet${className ? ` ${className}` : ""}`} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
    <header className="doc-header">
      <div className="doc-business">
        {model.business.logoUrl ? <img className="doc-logo" src={model.business.logoUrl} alt="" /> : <div className="doc-logo-placeholder" aria-hidden="true">{model.business.name.slice(0, 2)}</div>}
        <div><strong>{model.business.name}</strong>{model.business.subtitle && <small>{model.business.subtitle}</small>}</div>
      </div>
      <div className="doc-title-block">
        <h2>{model.title}</h2>
        {model.number && <p><span>{l.number}</span> <bdi className="mono">{model.number}</bdi></p>}
        {model.statusLabel && <span className="doc-stamp">{model.statusLabel}</span>}
      </div>
    </header>

    <dl className="doc-meta">
      <div><dt>{l.branch}</dt><dd>{model.branch}</dd></div>
      <div><dt>{l.issued}</dt><dd>{model.issueDate ?? "—"}</dd></div>
      {model.validUntil !== undefined && <div><dt>{l.validUntil}</dt><dd>{model.validUntil ?? "—"}</dd></div>}
    </dl>

    <section className="doc-parties">
      <div><small>{model.customer.label}</small><strong>{model.customer.name}</strong>{model.customer.lines?.map((line) => <span key={line}>{line}</span>)}</div>
      {model.vehicle && <div><small>{model.vehicle.label}</small><strong><bdi className="mono">{model.vehicle.plate}</bdi></strong>{model.vehicle.description && <span>{model.vehicle.description}</span>}</div>}
    </section>

    <table className="doc-table">
      <thead><tr>
        <th>{l.item}</th><th className="num">{l.qty}</th><th className="num">{l.unit}</th>
        {hasDiscount && <th className="num">{l.discount}</th>}{hasTax && <th className="num">{l.tax}</th>}
        <th className="num">{l.amount}</th>
      </tr></thead>
      <tbody>{model.lines.map((line, index) => <tr key={index}>
        <td>{line.description}{line.detail && <small>{line.detail}</small>}</td>
        <td className="num">{qty(line.quantity, lang)}</td>
        <td className="num">{money(line.unitMinor, line.currency, lang)}</td>
        {hasDiscount && <td className="num">{money(line.discountMinor ?? 0, line.currency, lang)}</td>}
        {hasTax && <td className="num">{money(line.taxMinor ?? 0, line.currency, lang)}</td>}
        <td className="num">{money(line.amountMinor, line.currency, lang)}</td>
      </tr>)}</tbody>
    </table>

    <section className="doc-totals">
      {model.totals.map((total) => <dl key={total.currency} className="doc-total-block" aria-label={total.currency}>
        <div><dt>{l.subtotal}</dt><dd>{money(total.subtotalMinor, total.currency, lang)}</dd></div>
        {total.discountMinor > 0 && <div><dt>{l.discount}</dt><dd>{money(-total.discountMinor, total.currency, lang)}</dd></div>}
        <div><dt>{l.tax}</dt><dd>{money(total.taxMinor, total.currency, lang)}</dd></div>
        <div className="doc-grand"><dt>{l.total} · {total.currency}</dt><dd>{money(total.totalMinor, total.currency, lang)}</dd></div>
        {total.paidMinor !== undefined && <div><dt>{l.paid}</dt><dd>{money(total.paidMinor, total.currency, lang)}</dd></div>}
        {total.balanceMinor !== undefined && <div><dt>{l.balance}</dt><dd>{money(total.balanceMinor, total.currency, lang)}</dd></div>}
      </dl>)}
    </section>

    {(model.notes || model.terms) && <section className="doc-notes">
      {model.notes && <div><small>{l.notes}</small><p>{model.notes}</p></div>}
      {model.terms && <div><small>{l.terms}</small><p>{model.terms}</p></div>}
    </section>}
    {model.disclaimer && <p className="doc-disclaimer">{model.disclaimer}</p>}

    <footer className="doc-footer">
      <div className="doc-signatures">{(model.signatures ?? [{ label: l.signature }]).map((signature) => <div key={signature.label}><span /><small>{signature.label}</small></div>)}</div>
      {model.footer && <p>{model.footer}</p>}
    </footer>
  </article>;
}
