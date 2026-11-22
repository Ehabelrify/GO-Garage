import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activeFilterCount } from "./components/FilterBar";
import { DataTable, nextSort, sortRows, type Column } from "./components/DataTable";
import { Field } from "./components/Form";
import { nextTabIndex } from "./components/TabBar";
import { isModalOpen, isSearchShortcut } from "./components/GlobalSearch";
import { Money } from "./components/Money";
import { RecordRef } from "./components/RecordRef";
import { EmptyState } from "./components/EmptyState";
import { resolveStatus, statusRegistry, type StatusDomain } from "./components/StatusBadge";
import { formatMoney, majorToMinor, minorToMajor } from "./format";
import { nextTrapIndex } from "./hooks";
import { defaultRecordRoutes, recordTypes } from "./record-types";
import { groupSearchResults, normalise360, normaliseSearchResults } from "./search";

type Row = { id: string; name: string; qty: number | null };
const rows: Row[] = [{ id: "1", name: "b", qty: 5 }, { id: "2", name: "a", qty: null }, { id: "3", name: "c", qty: 1 }];
const columns: Column<Row>[] = [
  { key: "name", header: "Name", render: (r) => r.name, sortable: true },
  { key: "qty", header: "Qty", render: (r) => String(r.qty), sortable: true, numeric: true },
];

describe("DataTable", () => {
  it("sorts text and numbers, nulls last, and cycles asc/desc/off", () => {
    expect(sortRows(rows, columns[0], "asc", "en").map((r) => r.id)).toEqual(["2", "1", "3"]);
    expect(sortRows(rows, columns[0], "desc", "en").map((r) => r.id)).toEqual(["3", "1", "2"]);
    expect(sortRows(rows, columns[1], "asc", "en").map((r) => r.id)).toEqual(["3", "1", "2"]);
    expect(sortRows(rows, columns[1], "desc", "en").map((r) => r.id)).toEqual(["1", "3", "2"]);
    expect(nextSort(null, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextSort({ key: "name", direction: "asc" }, "name")).toEqual({ key: "name", direction: "desc" });
    expect(nextSort({ key: "name", direction: "desc" }, "name")).toBeNull();
  });
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(DataTable as unknown as ComponentType<Record<string, unknown>>, { columns, rows, rowKey: (r: Row) => r.id, lang: "en", caption: "Things", ...props }));
  it("renders rows with aria-sort headers and a mobile card list", () => {
    const html = render({ onRowClick: () => undefined });
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain('class="data-cards"');
    expect(html).toContain('tabindex="0"');
  });
  it("renders loading, error and empty states instead of rows", () => {
    expect(render({ loading: true })).toContain('aria-busy="true"');
    const error = render({ error: "Boom", onRetry: () => undefined });
    expect(error).toContain('role="alert"');
    expect(error).toContain("Retry");
    expect(render({ rows: [], empty: createElement(EmptyState, { title: "Nothing yet" }) })).toContain("Nothing yet");
  });
  it("uses Arabic labels for the error retry", () => {
    expect(render({ lang: "ar", error: "x", onRetry: () => undefined })).toContain("إعادة المحاولة");
  });
});

describe("Field", () => {
  it("wires label, hint, error and required to the control", () => {
    const html = renderToStaticMarkup(createElement(Field, { label: "Phone", required: true, error: "Required", hint: "Digits", children: createElement("input", { className: "field-input" }) }));
    const id = /<input[^>]*\sid="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("required");
    expect(html).toMatch(/aria-describedby="[^"]+-error"/);
    expect(html).not.toMatch(/aria-describedby="[^"]*-hint/);
    expect(html).not.toContain("Digits");
  });
  it("shows the hint when there is no error", () => {
    const html = renderToStaticMarkup(createElement(Field, { label: "Phone", hint: "Digits", children: createElement("input") }));
    expect(html).toContain("Digits");
    expect(html).toMatch(/aria-describedby="[^"]+-hint"/);
  });
});

describe("StatusBadge registry", () => {
  it("has English and Arabic labels and a tone for every domain entry", () => {
    for (const domain of Object.keys(statusRegistry) as StatusDomain[]) {
      for (const [key, entry] of Object.entries(statusRegistry[domain])) {
        expect(entry.en, `${domain}.${key}`).toBeTruthy();
        expect(entry.ar, `${domain}.${key}`).toMatch(/[؀-ۿ]/);
        expect(["neutral", "info", "success", "warning", "danger"]).toContain(entry.tone);
      }
    }
  });
  it("resolves by domain, falls back to a humanised neutral label", () => {
    expect(resolveStatus("under-review", "en", "claim")).toEqual({ label: "Under review", tone: "info" });
    expect(resolveStatus("on-hold", "ar", "decision").label).toBe("غير متاح بعد");
    expect(resolveStatus("weird-state", "en")).toEqual({ label: "Weird state", tone: "neutral" });
  });
  it("uses one Arabic register for job stages (DESIGN_SYSTEM section 7)", () => {
    expect(resolveStatus("no-show", "ar", "job").label).toBe("لم يحضر");
    expect(resolveStatus("booked", "ar", "job").label).toBe("محجوزة");
  });
});

describe("money", () => {
  it("converts minor units and never prints them", () => {
    expect(minorToMajor(125000)).toBe(1250);
    expect(formatMoney(125000, "EGP", "en")).toMatch(/^EGP\s?1,250$/);
    expect(formatMoney(125050, "EGP", "en")).toContain("1,250.50");
    expect(formatMoney(null)).toBe("—");
    expect(renderToStaticMarkup(createElement(Money, { minor: 5000, lang: "en" }))).not.toContain("5000");
  });
  it("parses typed major amounts", () => {
    expect(majorToMinor("1,250.50")).toBe(125050);
    expect(majorToMinor("abc")).toBeNull();
  });
});

describe("RecordRef", () => {
  it("never renders the raw id and has a route for every type", () => {
    const html = renderToStaticMarkup(createElement(RecordRef, { type: "vehicle", id: "veh_8f3a", label: "ABC 1234" }));
    expect(html).toContain("ABC 1234");
    expect(html).not.toContain("veh_8f3a");
    expect(renderToStaticMarkup(createElement(RecordRef, { type: "quote", id: "q_9z" }))).not.toContain("q_9z");
    for (const type of recordTypes) expect(defaultRecordRoutes[type]("x y")).toMatch(/^\/workspace\/.*x%20y/);
  });
});

describe("focus trap and tabs", () => {
  it("wraps Tab at both ends only", () => {
    expect(nextTrapIndex(3, 2, false)).toBe(0);
    expect(nextTrapIndex(3, 0, true)).toBe(2);
    expect(nextTrapIndex(3, 1, false)).toBeNull();
    expect(nextTrapIndex(3, -1, false)).toBe(0);
    expect(nextTrapIndex(0, -1, false)).toBeNull();
  });
  it("moves tabs with arrows, mirrored in RTL", () => {
    expect(nextTabIndex(3, 0, "ArrowRight", false)).toBe(1);
    expect(nextTabIndex(3, 0, "ArrowRight", true)).toBe(2);
    expect(nextTabIndex(3, 2, "Home", false)).toBe(0);
    expect(nextTabIndex(3, 0, "a", false)).toBeNull();
  });
});

describe("search", () => {
  it("detects the / and Ctrl+K shortcuts but not while typing", () => {
    expect(isSearchShortcut({ key: "k", ctrlKey: true, metaKey: false, target: { tagName: "INPUT" } })).toBe(true);
    expect(isSearchShortcut({ key: "/", ctrlKey: false, metaKey: false, target: { tagName: "DIV" } })).toBe(true);
    expect(isSearchShortcut({ key: "/", ctrlKey: false, metaKey: false, target: { tagName: "INPUT" } })).toBe(false);
  });
  it("reports an open modal so global shortcuts do not steal focus (P2T-028)", () => {
    expect(isModalOpen({ querySelector: (selector: string) => (selector === '[aria-modal="true"]' ? {} : null) })).toBe(true);
    expect(isModalOpen({ querySelector: () => null })).toBe(false);
    expect(isModalOpen(undefined)).toBe(false);
  });
  it("normalises results, dropping malformed and unsafe routes, and groups by type", () => {
    const results = normaliseSearchResults({ results: [
      { type: "quote", id: "q1", title: "Q-100", route: "/workspace/quotes?record=q1" },
      { type: "customer", id: "c1", title: "Mariam", subtitle: "0100", route: "/workspace/customers" },
      { type: "customer", id: "c2", title: "Evil", route: "https://evil.example" },
      { type: "nope", id: "x", title: "x", route: "/x" },
      { type: "vehicle", id: "v1", route: "/v" },
    ] });
    expect(results.map((r) => r.id)).toEqual(["q1", "c1"]);
    expect(groupSearchResults(results).map((g) => g.type)).toEqual(["customer", "quote"]);
    expect(normaliseSearchResults(null)).toEqual([]);
    expect(normaliseSearchResults({ results: "bad" })).toEqual([]);
  });
  it("reads 360 payloads in either shape and ignores unknown sections", () => {
    const a = normalise360({ customer: { name: "Mariam" }, bookings: [{ id: "b1", title: "Tint" }, { title: "no id" }], mystery: [{ id: "z" }] });
    expect(a?.title).toBe("Mariam");
    expect(a?.sections.map((s) => [s.type, s.items.map((i) => i.id)])).toEqual([["booking", ["b1"]]]);
    const b = normalise360({ sections: [{ type: "warranty", items: [{ id: "w1", plate: "ABC 123", status: "active" }] }] });
    expect(b?.sections[0].items[0]).toMatchObject({ id: "w1", title: "ABC 123", badge: "active" });
    expect(normalise360(null)).toBeNull();
  });
});

describe("filters", () => {
  it("counts only active search and filters", () => {
    const filter = { key: "s", label: "Status", value: "all", options: [], onChange: () => undefined };
    expect(activeFilterCount(undefined, [filter])).toBe(0);
    expect(activeFilterCount({ value: " x ", onChange: () => undefined, placeholder: "" }, [{ ...filter, value: "open" }])).toBe(2);
  });
});
