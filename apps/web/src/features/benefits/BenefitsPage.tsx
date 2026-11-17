import { useEffect, useState } from "react";
import type { BenefitEntitlement } from "@garage/domain";
import { benefitApi } from "../../shared/store";
import { BenefitDetail } from "./BenefitDetail";

export function BenefitsPage({ lang }: { lang: "ar" | "en" }) {
  const t = (en: string, ar: string) => lang === "ar" ? ar : en;
  const [items, setItems] = useState<BenefitEntitlement[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function refresh() { setItems(await benefitApi.list()); }
  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : String(error))); }, []);
  return <div dir={lang === "ar" ? "rtl" : "ltr"}>
    <h1>{t("Benefits and aftercare", "المنافع وخدمات ما بعد البيع")}</h1>
    <p>{t("Entitlements are created only from accepted quote bindings and keep their exact approved policy version.", "تُنشأ الاستحقاقات فقط من روابط عرض سعر مقبول وتحتفظ بإصدار السياسة المعتمد بدقة.")}</p>
    <section className="panel section-gap">
      <h2>{t("Benefit entitlements", "استحقاقات المنافع")}</h2>
      {items.length === 0 && <p>{t("No benefit entitlements are available.", "لا توجد استحقاقات منافع متاحة.")}</p>}
      {items.map((item) => <button className="btn" type="button" key={item.id} onClick={() => setSelected(item.id)}>{item.benefit.id} · {item.customerId} · {item.vehicleId} · {item.status}</button>)}
    </section>
    {selected && <BenefitDetail key={selected} id={selected} lang={lang} onChanged={() => void refresh()} />}
    {message && <p role="status">{message}</p>}
  </div>;
}
