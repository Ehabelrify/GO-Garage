import { useState } from "react";
import { ArrowLeft, CarFront, FileText, Pencil, Plus, Sparkles } from "lucide-react";
import { formatPlateDisplay, type GarageState, type Locale } from "@garage/domain";
import { Link } from "wouter";
import { DetailDrawer, EmptyState, Notice, PageHeader, RecordRef, Skeleton } from "../../shared/components";
import { hasCapability } from "../../shared/capabilities";
import { useGarageStore } from "../../shared/store";
import { customerDisplay } from "../../shared/ui";
import { CustomerForm, writeErrorMessage } from "./CustomerForm";
import { addVehicle, updateCustomer } from "./customers-api";
import { vehicleLabel } from "./customers-logic";
import { CreateQuote } from "../quotes/CreateQuote";
import { RequestForm } from "../special-requests/RequestForm";
import { useRecord360 } from "./use-record360";
import { ContactFacts, PlateChips, SectionsView } from "./Record360View";
import "./customers.css";

interface DetailProps { lang: Locale; state: GarageState; id: string; canEdit: boolean; notify: (message: string) => void }

const listPath = "/workspace/customers";

function Back({ lang }: { lang: Locale }) {
  return <Link className="btn btn-quiet" href={listPath}><ArrowLeft size={16} aria-hidden="true" />{lang === "ar" ? "العملاء" : "Customers"}</Link>;
}

/** `back` is only true when the page header does not already carry the back link (no duplicate). */
function LoadState({ result, lang, reload, back }: { result: ReturnType<typeof useRecord360>["state"]; lang: Locale; reload: () => void; back: boolean }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  if (result.status === "loading") return <Skeleton rows={5} label={t("Loading", "جارٍ التحميل")} />;
  if (result.status === "ready") return null;
  const action = <>{result.status === "error" && !result.forbidden && <button type="button" className="btn cust-nowrap" onClick={reload}>{t("Retry", "إعادة المحاولة")}</button>}{back && <Back lang={lang} />}</>;
  if (result.status === "missing") return <EmptyState title={t("Record not found", "السجل غير موجود")} text={t("It may have been removed or belongs to another branch.", "ربما حُذف أو يتبع فرعاً آخر.")} action={action} />;
  return <EmptyState variant="error" title={result.forbidden ? t("Not available for your role", "غير متاح لصلاحيتك") : t("Could not load this record", "تعذر تحميل السجل")} action={action} />;
}

export function CustomerDetail({ lang, state, id, canEdit, notify }: DetailProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const store = useGarageStore();
  const { state: result, reload } = useRecord360("customer", id);
  const [drawer, setDrawer] = useState<"edit" | "vehicle" | "request" | "quote" | null>(null);
  const canQuote = canEdit && hasCapability(store.actor, "quotes.manage");

  const known = state.customers.find((item) => item.id === id);
  if (result.status !== "ready") return <>
    <PageHeader title={known ? customerDisplay(known.name, lang) : t("Customer", "العميل")} eyebrow={known ? t("Customer", "العميل") : undefined} actions={<Back lang={lang} />} />
    <LoadState result={result} lang={lang} reload={reload} back={false} />
  </>;

  const { customer, vehicles, vehiclesCount } = result.data;
  if (!customer) return <LoadState result={{ status: "missing" }} lang={lang} reload={reload} back />;
  const local = known;
  const shownVehicles = vehicles.length ? vehicles : (local?.vehicles ?? []).map((vehicle) => ({ id: vehicle.id, plate: vehicle.plate, make: vehicle.makeModel, model: "" }));

  const after = async (outcome: Awaited<ReturnType<typeof updateCustomer>>, done: string): Promise<string | null> => {
    if (!outcome.ok) return writeErrorMessage(outcome.error, lang, outcome.unsupported);
    setDrawer(null);
    notify(done);
    await store.refresh();
    reload();
    return null;
  };

  return <>
    <PageHeader
      title={customerDisplay(customer.name, lang)}
      eyebrow={t("Customer", "العميل")}
      meta={<span>{t(`${vehiclesCount} vehicles`, `${vehiclesCount} مركبة`)}</span>}
      actions={<>
        <Back lang={lang} />
        {canQuote && <button type="button" className="btn cust-nowrap" onClick={() => setDrawer("quote")}><FileText size={16} aria-hidden="true" />{t("Create quote", "إنشاء عرض سعر")}</button>}
        {canEdit && <button type="button" className="btn cust-nowrap" onClick={() => setDrawer("request")}><Sparkles size={16} aria-hidden="true" />{t("New special request", "طلب خاص جديد")}</button>}
        {canEdit && <button type="button" className="btn cust-nowrap" onClick={() => setDrawer("vehicle")}><Plus size={16} aria-hidden="true" />{t("Add vehicle", "إضافة مركبة")}</button>}
        {canEdit && <button type="button" className="btn btn-primary cust-nowrap" onClick={() => setDrawer("edit")}><Pencil size={16} aria-hidden="true" />{t("Edit", "تعديل")}</button>}
      </>}
    />
    {customer.archived && <Notice tone="info">{t("This customer is archived.", "هذا العميل مؤرشف.")}</Notice>}
    <div className="cust-head-card">
      <ContactFacts phone={customer.phone} language={customer.language ?? local?.language} lang={lang} consent={customer.consent} />
      <div>
        <PlateChips vehicles={shownVehicles} lang={lang} />
        {vehiclesCount > shownVehicles.length && <p className="cust-section-note">{t(`Showing ${shownVehicles.length} of ${vehiclesCount} vehicles`, `عرض ${shownVehicles.length} من ${vehiclesCount} مركبة`)}</p>}
      </div>
    </div>
    <SectionsView data={result.data} state={state} lang={lang} />

    <DetailDrawer open={drawer === "edit"} onClose={() => setDrawer(null)} lang={lang} title={t("Edit customer", "تعديل العميل")}>
      <CustomerForm lang={lang} mode="edit" initial={{ name: customer.name, phone: customer.phone ?? local?.phone ?? "", language: (customer.language ?? local?.language ?? lang) as Locale }}
        onCancel={() => setDrawer(null)}
        onSubmit={async (values) => after(await updateCustomer(customer.id, { name: values.name.trim(), phone: values.phone.trim(), language: values.language }), t("Customer updated.", "تم تحديث العميل."))} />
    </DetailDrawer>
    <DetailDrawer open={drawer === "request"} onClose={() => setDrawer(null)} lang={lang} title={t("New special request", "طلب خاص جديد")}>
      <RequestForm lang={lang} customerId={customer.id} vehicleId={vehicles.length === 1 ? vehicles[0].id : undefined} onCancel={() => setDrawer(null)}
        onCreated={() => { setDrawer(null); notify(t("Request created.", "تم إنشاء الطلب.")); reload(); }} />
    </DetailDrawer>
    {drawer === "quote" && <CreateQuote lang={lang} customerId={customer.id} onClose={() => setDrawer(null)}
      onSaved={() => { setDrawer(null); notify(t("Quote saved.", "تم حفظ عرض السعر.")); reload(); }} />}
    <DetailDrawer open={drawer === "vehicle"} onClose={() => setDrawer(null)} lang={lang} title={t("Add vehicle", "إضافة مركبة")}>
      <CustomerForm lang={lang} mode="vehicle" onCancel={() => setDrawer(null)}
        onSubmit={async (values) => after(await addVehicle(customer.id, { plate: values.plate.trim(), makeModel: values.makeModel.trim() }), t("Vehicle added.", "تمت إضافة المركبة."))} />
    </DetailDrawer>
  </>;
}

export function VehicleDetail({ lang, state, id, canEdit, notify }: DetailProps) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [quoting, setQuoting] = useState(false);
  const canQuote = canEdit && hasCapability(useGarageStore().actor, "quotes.manage");
  const { state: result, reload } = useRecord360("vehicle", id);
  const knownPlate = state.customers.flatMap((item) => item.vehicles).find((item) => item.id === id)?.plate;
  if (result.status !== "ready") return <>
    <PageHeader title={knownPlate ? formatPlateDisplay(knownPlate) : t("Vehicle", "المركبة")} eyebrow={knownPlate ? t("Vehicle", "المركبة") : undefined} actions={<Back lang={lang} />} />
    <LoadState result={result} lang={lang} reload={reload} back={false} />
  </>;
  const { vehicle, customer } = result.data;
  if (!vehicle) return <LoadState result={{ status: "missing" }} lang={lang} reload={reload} back />;
  return <>
    <PageHeader
      eyebrow={t("Vehicle", "المركبة")}
      title={formatPlateDisplay(vehicle.plate)}
      subtitle={[vehicleLabel(vehicle), vehicle.color].filter(Boolean).join(" · ") || undefined}
      actions={<>
        <Back lang={lang} />
        {canQuote && customer && <button type="button" className="btn btn-primary cust-nowrap" onClick={() => setQuoting(true)}><FileText size={16} aria-hidden="true" />{t("Create quote", "إنشاء عرض سعر")}</button>}
      </>}
    />
    <div className="cust-head-card">
      {customer
        ? <p className="cust-facts">
            <span className="cust-fact"><CarFront size={15} aria-hidden="true" />{t("Owner", "المالك")}: <RecordRef type="customer" id={customer.id} label={customerDisplay(customer.name, lang)} mode="link" /></span>
          </p>
        : null}
      {customer && <ContactFacts phone={customer.phone} lang={lang} />}
    </div>
    <SectionsView data={result.data} state={state} lang={lang} />
    {quoting && customer && <CreateQuote lang={lang} customerId={customer.id} vehicleId={vehicle.id} onClose={() => setQuoting(false)}
      onSaved={() => { setQuoting(false); notify(t("Quote saved.", "تم حفظ عرض السعر.")); reload(); }} />}
  </>;
}
