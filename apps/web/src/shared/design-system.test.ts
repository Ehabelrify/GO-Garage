import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Amount, Delta } from "./components/Amount";
import { Phone } from "./components/Phone";
import { Plate } from "./components/Plate";
import { DateText } from "./components/DateText";
import { DataTable, pageWindow, type Column } from "./components/DataTable";
import { formatAmount, formatDelta, formatPhone, MINUS } from "./format";
import { dateLabel } from "./ui";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

describe("formatAmount", () => {
  it("uses 2 decimals in table use, never mixing whole and fractional", () => {
    expect(formatAmount(125000, { variant: "table" })?.text).toBe("EGP 1,250.00");
    expect(formatAmount(125050, { variant: "table" })?.text).toBe("EGP 1,250.50");
  });
  it("shows whole EGP on KPI tiles and compacts large values with the full value kept", () => {
    expect(formatAmount(125050, { variant: "kpi" })?.text).toBe("EGP 1,251");
    const big = formatAmount(1180527040, { variant: "kpi" });
    expect(big?.text).toBe("EGP 11.8M");
    expect(big?.compact).toBe(true);
    expect(big?.full).toBe("EGP 11,805,270.40");
    expect(formatAmount(29347000, { variant: "kpi" })?.text).toBe("EGP 293K");
  });
  it("full precision never compacts and keeps fractions", () => {
    expect(formatAmount(1180527040, { variant: "kpi", fullPrecision: true })?.text).toBe("EGP 11,805,270.40");
  });
  it("puts the real minus before the number and the Arabic currency after it", () => {
    expect(formatAmount(-21922480, { variant: "table", lang: "ar" })?.text).toBe(`${MINUS}219,224.80 ج.م.`);
    expect(formatAmount(-100, { variant: "table" })?.negative).toBe(true);
    expect(formatAmount(-0.2, { variant: "table" })?.negative).toBe(false);
    expect(formatAmount(null)).toBeNull();
  });
});

describe("Amount", () => {
  it("renders an isolated LTR tabular span with title and aria-label for compact values", () => {
    const out = html(createElement(Amount, { minor: 1180527040, lang: "en", variant: "kpi" }));
    expect(out).toContain('dir="ltr"');
    expect(out).toContain('data-variant="kpi"');
    expect(out).toContain('title="EGP 11,805,270.40"');
    expect(out).toContain('aria-label="EGP 11,805,270.40"');
    expect(out).toContain("11.8M");
  });
  it("renders a dash for missing amounts and marks negatives", () => {
    expect(html(createElement(Amount, { minor: null, lang: "en" }))).toContain("—");
    expect(html(createElement(Amount, { minor: -5000, lang: "ar" }))).toContain("amount negative");
  });
});

describe("Delta", () => {
  it("keeps sign, number and percent in one LTR isolate", () => {
    expect(formatDelta(-42.8, { unit: "percent" })?.text).toBe(`${MINUS}42.8%`);
    expect(formatDelta(12.44, { unit: "percent" })?.text).toBe("+12.4%");
    expect(formatDelta(0)?.direction).toBe("flat");
    const out = html(createElement(Delta, { value: -42.8, lang: "ar" }));
    expect(out).toContain('dir="ltr"');
    expect(out).toContain(`${MINUS}42.8%`);
  });
  it("uses inverse colouring for liabilities", () => {
    expect(html(createElement(Delta, { value: 10, lang: "en" }))).toContain('data-tone="good"');
    expect(html(createElement(Delta, { value: 10, lang: "en", inverse: true }))).toContain('data-tone="bad"');
    expect(html(createElement(Delta, { value: -10, lang: "en", inverse: true }))).toContain('data-tone="good"');
  });
});

describe("Phone", () => {
  it("formats Egyptian numbers with +20 first and isolates direction", () => {
    expect(formatPhone("01220001046")).toBe("+20 122 000 1046");
    expect(formatPhone("+201220001046")).toBe("+20 122 000 1046");
    expect(formatPhone("")).toBe("");
    const out = html(createElement(Phone, { value: "01220001046" }));
    expect(out).toContain('dir="ltr"');
    expect(out).toContain("+20 122 000 1046");
  });
  it("renders tel and wa.me links on request", () => {
    expect(html(createElement(Phone, { value: "01220001046", link: true }))).toContain('href="tel:+201220001046"');
    expect(html(createElement(Phone, { value: "01220001046", whatsapp: true }))).toContain('href="https://wa.me/201220001046"');
  });
});

describe("Plate", () => {
  it("renders one chip with Latin digits and a script-aware direction", () => {
    const arabic = html(createElement(Plate, { value: "ابج١٢٣٤" }));
    expect(arabic).toContain("plate");
    expect(arabic).toContain("1234");
    expect(arabic).toContain('dir="rtl"');
    const latin = html(createElement(Plate, { value: "abc 123" }));
    expect(latin).toContain("ABC 123");
    expect(latin).toContain('dir="ltr"');
    expect(html(createElement(Plate, { value: "" }))).toContain("—");
  });
});

describe("dateLabel and DateText", () => {
  it("always uses Latin digits and a year, in both locales", () => {
    expect(dateLabel("2026-11-22", "en")).toMatch(/^22 Nov 2026$/);
    expect(dateLabel("2026-11-22", "ar")).toMatch(/2026/);
    expect(dateLabel("2026-11-22", "ar")).not.toMatch(/[٠-٩]/);
    expect(dateLabel("", "en")).toBe("—");
  });
  it("DateText isolates direction and appends a time when given", () => {
    const out = html(createElement(DateText, { value: "2026-11-22T10:30", lang: "en" }));
    expect(out).toContain('dir="ltr"');
    expect(out).toContain("22 Nov 2026 10:30");
  });
});

describe("DataTable paging", () => {
  type Row = { id: string };
  const columns: Column<Row>[] = [{ key: "id", header: "Id", render: (r) => r.id }];
  const many: Row[] = Array.from({ length: 60 }, (_, i) => ({ id: `r${i + 1}` }));
  const render = (props: Record<string, unknown>) =>
    html(createElement(DataTable as never, { columns, rows: many, rowKey: (r: Row) => r.id, lang: "en", caption: "Rows", ...props }));
  it("computes windows and clamps pages", () => {
    expect(pageWindow(60, 0, 25)).toEqual({ page: 0, pages: 3, start: 1, end: 25 });
    expect(pageWindow(60, 9, 25)).toEqual({ page: 2, pages: 3, start: 51, end: 60 });
    expect(pageWindow(0, 0, 25)).toEqual({ page: 0, pages: 1, start: 0, end: 0 });
  });
  it("pages by default (25) with a Showing x-y of n footer", () => {
    const out = render({});
    expect(out).toContain("Showing 1-25 of 60");
    expect(out).toContain("r25");
    expect(out).not.toContain(">r26<");
  });
  it("can disable paging", () => {
    const out = render({ paging: false });
    expect(out).toContain(">r60<");
    expect(out).not.toContain("Showing");
  });
});

describe("type scale guard", () => {
  it("shared styles use no raw font-size below 12px (only the 11px nav token)", () => {
    const dir = join(__dirname, "styles");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".css"))) {
      readFileSync(join(dir, file), "utf8").split("\n").forEach((line, index) => {
        for (const match of line.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
          const value = Number(match[1]);
          const isToken = /^\s*--fs-/.test(line);
          if (value < 12 && !isToken) offenders.push(`${file}:${index + 1} ${match[0]}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
