import { describe, expect, it } from "vitest";
import { BOM, buildCsv, csvFilename, escapeCsvCell, moneyCsv, neutraliseFormula, tableToCsv, toLatinDigits } from "./csv";
import {
  applicableFilters, defaultView, deleteView, loadViews, parseViews, persistViews, renameView, saveView, setDefaultView, urlHasListState,
  viewsStorageKey, MAX_VIEWS, type ViewSnapshot,
} from "./saved-views";
import {
  pageSelectionState, pruneSelection, runBulk, selectedRows, summariseOutcomes, toggleKey, togglePage,
} from "./selection";
import {
  createSequenceMatcher, detectPlatform, goBindings, isTypingTarget, modLabel, nextRowIndex, normaliseKey, shortcutCatalogue,
} from "./shortcuts";
import { canExportLists } from "./viewer";

describe("selection", () => {
  it("toggles keys without mutating the input", () => {
    const start = new Set(["a"]);
    const next = toggleKey(start, "b");
    expect([...start]).toEqual(["a"]);
    expect([...next].sort()).toEqual(["a", "b"]);
    expect([...toggleKey(next, "a")]).toEqual(["b"]);
  });
  it("reports none, some and all for the page and toggles it", () => {
    const page = ["a", "b", "c"];
    expect(pageSelectionState(new Set(), page)).toBe("none");
    expect(pageSelectionState(new Set(["a"]), page)).toBe("some");
    expect(pageSelectionState(new Set(page), page)).toBe("all");
    expect(pageSelectionState(new Set(["a"]), [])).toBe("none");
    expect([...togglePage(new Set(["a"]), page)].sort()).toEqual(page);
    expect([...togglePage(new Set([...page, "z"]), page)]).toEqual(["z"]);
  });
  it("prunes keys that are no longer present and keeps the same set when nothing changed", () => {
    const set = new Set(["a", "b"]);
    expect(pruneSelection(set, ["a", "b", "c"])).toBe(set);
    expect([...pruneSelection(set, ["b"])]).toEqual(["b"]);
  });
  it("returns selected rows in display order", () => {
    const rows = [{ id: "1" }, { id: "2" }, { id: "3" }];
    expect(selectedRows(rows, (row) => row.id, new Set(["3", "1"])).map((row) => row.id)).toEqual(["1", "3"]);
  });
  it("runs a bulk action per item, never throws, and summarises failures", async () => {
    const outcomes = await runBulk(["a", "b", "c"], (id) => id, async (id) => {
      if (id === "b") return { ok: false, error: "BOOKING_NOT_PENDING" };
      if (id === "c") throw new Error("network");
      return { ok: true };
    });
    expect(outcomes.map((item) => item.ok)).toEqual([true, false, false]);
    expect(summariseOutcomes(outcomes)).toEqual({ total: 3, done: 1, failed: 2, failedKeys: ["b", "c"] });
  });
});

describe("csv", () => {
  it("neutralises spreadsheet formulas", () => {
    for (const bad of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tx", "\rx"]) expect(neutraliseFormula(bad)).toBe(`'${bad}`);
    expect(neutraliseFormula("Hello")).toBe("Hello");
    expect(escapeCsvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
  });
  it("quotes commas, quotes and newlines and keeps numbers as plain numbers", () => {
    expect(escapeCsvCell("a,b")).toBe("\"a,b\"");
    expect(escapeCsvCell("say \"hi\"")).toBe("\"say \"\"hi\"\"\"");
    expect(escapeCsvCell("line\nbreak")).toBe("\"line\nbreak\"");
    expect(escapeCsvCell(-12.5)).toBe("-12.5");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(Number.NaN)).toBe("");
  });
  it("converts Arabic-Indic digits to Latin digits", () => {
    expect(toLatinDigits("١٢٣ ۴۵")).toBe("123 45");
    expect(escapeCsvCell("١٢٣")).toBe("123");
  });
  it("starts with a BOM and uses CRLF", () => {
    const csv = buildCsv(["A", "B"], [["x", 1]]);
    expect(csv.codePointAt(0)).toBe(0xfeff);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.slice(1)).toBe("A,B\r\nx,1\r\n");
  });
  it("writes money as a plain number with a separate currency column and skips columns without a csv cell", () => {
    expect(moneyCsv(125050, "EGP")).toEqual({ amount: 1250.5, currency: "EGP" });
    expect(moneyCsv(null, "EGP")).toEqual({ amount: null, currency: "" });
    type Row = { name: string; total: number | null; cur: string };
    const out = tableToCsv<Row>([
      { header: "Name", csv: (row) => row.name },
      { header: "Actions" },
      { header: "Total", csvMoney: (row) => (row.total === null ? null : { minor: row.total, currency: row.cur }) },
    ], [{ name: "Ali", total: 9900, cur: "SAR" }, { name: "=bad", total: null, cur: "EGP" }], "Currency");
    expect(out.slice(1)).toBe("Name,Total,Total Currency\r\nAli,99,SAR\r\n'=bad,,\r\n");
  });
  it("builds a safe dated filename", () => {
    expect(csvFilename("Follow ups!", new Date("2026-11-22T10:00:00Z"))).toBe("follow-ups-2026-11-22.csv");
    expect(csvFilename("***", new Date("2026-11-22T10:00:00Z"))).toBe("export-2026-11-22.csv");
  });
  it("hides export from technicians and from no viewer", () => {
    expect(canExportLists(null)).toBe(false);
    expect(canExportLists({ userId: "u", role: "technician", isDemo: false })).toBe(false);
    expect(canExportLists({ userId: "u", role: "receptionist", isDemo: false })).toBe(true);
  });
});

describe("saved views", () => {
  const snap: ViewSnapshot = { search: "ali", filters: { status: "pending" }, sort: { key: "when", direction: "desc" }, pageSize: 50 };
  const memory = () => { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }; };

  it("keys storage per user and list", () => {
    expect(viewsStorageKey("u1", "bookings")).not.toBe(viewsStorageKey("u2", "bookings"));
    expect(viewsStorageKey("u1", "bookings")).not.toBe(viewsStorageKey("u1", "quotes"));
  });
  it("saves, replaces by name, renames, deletes and sets one default", () => {
    let views = saveView([], "  Pending  today ", snap, () => "1").views;
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe("Pending today");
    views = saveView(views, "pending TODAY", { ...snap, search: "x" }, () => "2").views;
    expect(views).toHaveLength(1);
    expect(views[0].search).toBe("x");
    views = saveView(views, "Other", snap, () => "3").views;
    expect(saveView(views, "  ", snap).error).toBe("EMPTY_NAME");
    expect(renameView(views, "3", "pending today").error).toBe("DUPLICATE_NAME");
    expect(renameView(views, "3", "Renamed").views.find((view) => view.id === "3")?.name).toBe("Renamed");
    views = setDefaultView(views, "1");
    views = setDefaultView(views, "3");
    expect(views.filter((view) => view.isDefault).map((view) => view.id)).toEqual(["3"]);
    expect(defaultView(views)?.id).toBe("3");
    expect(defaultView(setDefaultView(views, "3"))).toBeUndefined();
    expect(deleteView(views, "1").map((view) => view.id)).toEqual(["3"]);
  });
  it("caps the number of views", () => {
    let views: ReturnType<typeof saveView>["views"] = [];
    for (let index = 0; index < MAX_VIEWS; index += 1) views = saveView(views, `v${index}`, snap, () => `id${index}`).views;
    expect(saveView(views, "one more", snap).error).toBe("TOO_MANY");
  });
  it("round-trips through storage and survives malformed data or a failing store", () => {
    const store = memory();
    const views = saveView([], "A", snap, () => "1").views;
    expect(persistViews(store, "u1", "bookings", views)).toBe(true);
    expect(loadViews(store, "u1", "bookings")).toEqual(views);
    expect(loadViews(store, "u2", "bookings")).toEqual([]);
    expect(parseViews("{not json")).toEqual([]);
    expect(parseViews(JSON.stringify({ views: [{ id: 1 }, { id: "x", name: "ok", filters: { a: 3, b: "c" }, sort: { key: "k", direction: "up" } }] }))).toEqual([
      { id: "x", name: "ok", search: "", filters: { b: "c" }, sort: null, pageSize: null, isDefault: undefined },
    ]);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadViews(broken, "u1", "bookings")).toEqual([]);
    expect(persistViews(broken, "u1", "bookings", views)).toBe(false);
    expect(persistViews(null, "u1", "bookings", views)).toBe(false);
    expect(loadViews(store, "", "bookings")).toEqual([]);
  });
  it("applies only filters the page can express and respects URL state", () => {
    expect(applicableFilters({ status: "pending", range: "gone", old: "x" }, { status: ["all", "pending"], range: ["all", "today"] })).toEqual({ status: "pending" });
    expect(urlHasListState("?tab=followups&record=abc")).toBe(false);
    expect(urlHasListState("?status=pending")).toBe(true);
    expect(urlHasListState("")).toBe(false);
  });
});

describe("shortcuts", () => {
  it("reads letters from the physical key so an Arabic layout still works, and ignores modifier combos", () => {
    expect(normaliseKey({ key: "ش", code: "KeyA" })).toBe("a");
    expect(normaliseKey({ key: "G", code: "KeyG", shiftKey: true })).toBe("g");
    expect(normaliseKey({ key: "?", code: "Slash", shiftKey: true })).toBe("?");
    expect(normaliseKey({ key: "k", code: "KeyK", ctrlKey: true })).toBeNull();
    expect(normaliseKey({ key: "Enter", code: "Enter" })).toBe("Enter");
  });
  it("ignores typing targets", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", getAttribute: (name) => (name === "role" ? "combobox" : null) })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
  it("matches G then a letter within the timeout only", () => {
    const matcher = createSequenceMatcher({ o: "overview", b: "bookings" }, "g", 1000);
    expect(matcher.feed("b", 0)).toBeNull();
    expect(matcher.feed("g", 100)).toBeNull();
    expect(matcher.pending()).toBe(true);
    expect(matcher.feed("b", 600)).toBe("bookings");
    expect(matcher.pending()).toBe(false);
    matcher.feed("g", 2000);
    expect(matcher.feed("o", 3500)).toBeNull();
    matcher.feed("g", 4000);
    expect(matcher.feed("z", 4100)).toBeNull();
    expect(matcher.feed("o", 4200)).toBeNull();
    matcher.feed("g", 5000);
    matcher.reset();
    expect(matcher.feed("o", 5100)).toBeNull();
  });
  it("only binds pages the role can open", () => {
    expect(goBindings(["whatsapp", "customers", "bookings", "quotes", "warranties"])).toEqual({ i: "whatsapp", c: "customers", b: "bookings", q: "quotes", r: "warranties" });
    expect(goBindings(["workshop"])).toEqual({ w: "workshop" });
    const technician = shortcutCatalogue(["workshop"], false).map((item) => item.id);
    expect(technician).toContain("go-workshop");
    expect(technician).not.toContain("go-finance");
    expect(technician).not.toContain("intake");
  });
  it("labels the platform modifier and moves the row index within bounds", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)", "MacIntel")).toBe("mac");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0)", "Win32")).toBe("other");
    expect(modLabel("other")).toBe("Ctrl");
    expect(modLabel("mac")).toBe(String.fromCodePoint(0x2318));
    expect(nextRowIndex(5, -1, 1)).toBe(0);
    expect(nextRowIndex(5, -1, -1)).toBe(4);
    expect(nextRowIndex(5, 4, 1)).toBe(4);
    expect(nextRowIndex(5, 0, -1)).toBe(0);
    expect(nextRowIndex(0, -1, 1)).toBe(-1);
  });
});
