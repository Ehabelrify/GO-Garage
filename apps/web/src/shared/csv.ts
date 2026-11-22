import { minorToMajor } from "./format";

/** CSV export helpers. Spreadsheet-safe: formula-injection guard, Latin digits, BOM so Excel reads Arabic as UTF-8. */
export type CsvValue = string | number | null | undefined;

/** Built from a code point on purpose: a literal byte-order mark in source trips the invisible-character scanner. */
export const BOM = String.fromCodePoint(0xfeff);

const arabicIndic = /[٠-٩]/g;
const easternArabicIndic = /[۰-۹]/g;

export function toLatinDigits(value: string): string {
  return value
    .replace(arabicIndic, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(easternArabicIndic, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/** A text cell starting with = + - @ tab or CR is read as a formula by spreadsheets: prefix an apostrophe. */
export function neutraliseFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = neutraliseFormula(toLatinDigits(value));
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [headers, ...rows].map((line) => line.map(escapeCsvCell).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

/** Money as a plain major-unit number (never a formatted string); the currency goes in its own column. */
export function moneyCsv(minor: number | null | undefined, currency: string): { amount: number | null; currency: string } {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return { amount: null, currency: "" };
  return { amount: Number(minorToMajor(minor, currency).toFixed(2)), currency };
}

export interface CsvColumn<Row> {
  header: string;
  csv?: (row: Row) => CsvValue;
  csvMoney?: (row: Row) => { minor: number; currency: string } | null | undefined;
}

export function hasCsvColumns<Row>(columns: readonly CsvColumn<Row>[]): boolean {
  return columns.some((column) => column.csv || column.csvMoney);
}

/** Expands list columns into CSV headers and rows. Columns with neither `csv` nor `csvMoney` are skipped. */
export function tableToCsv<Row>(columns: readonly CsvColumn<Row>[], rows: readonly Row[], currencyHeader: string): string {
  const used = columns.filter((column) => column.csv || column.csvMoney);
  const headers = used.flatMap((column) => column.csvMoney ? [column.header, `${column.header} ${currencyHeader}`] : [column.header]);
  const body = rows.map((row) => used.flatMap((column): CsvValue[] => {
    if (column.csvMoney) {
      const money = column.csvMoney(row);
      const cell = money ? moneyCsv(money.minor, money.currency) : { amount: null, currency: "" };
      return [cell.amount, cell.currency];
    }
    return [column.csv!(row)];
  }));
  return buildCsv(headers, body);
}

export function csvFilename(base: string, now: Date = new Date()): string {
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  return `${safe}-${now.toISOString().slice(0, 10)}.csv`;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
