// Builds report.md from the report object produced by run.mjs.
const esc = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const clip = (value, n = 160) => { const s = esc(value); return s.length > n ? `${s.slice(0, n - 1)}...` : s; };

export function buildMarkdown(report) {
  const { rows, flows, meta } = report;
  const count = (status) => rows.filter((r) => r.status === status).length;
  const lines = [];
  lines.push("# Visual checks report", "");
  lines.push(`Generated ${meta.finishedAt} against \`${meta.baseUrl}\` (dataset ${meta.fixedNow ?? "real clock"}). Duration ${Math.round(meta.durationMs / 1000)} s.`, "");
  lines.push(`**Pages:** ${rows.length} total, ${count("FAIL")} FAIL, ${count("WARN")} WARN, ${count("PASS")} PASS. **Flows:** ${flows.filter((f) => f.status === "PASS").length} pass, ${flows.filter((f) => f.status === "FAIL").length} fail, ${flows.filter((f) => f.status === "SKIP").length} skipped.`, "");
  lines.push("Fail rules: API 5xx, uncaught page error, navigation/render failure, horizontal overflow at 360 px. Everything else (console errors, API 4xx, other-width overflow, axe) is a warning.", "");

  // API failures first: this is the first real execution of the new SQL.
  const api = new Map();
  const collect = (source, where) => {
    for (const f of source.apiFailures ?? []) {
      const key = `${f.status} ${f.method} ${f.path}`;
      const entry = api.get(key) ?? { ...f, count: 0, where: new Set() };
      entry.count += 1;
      entry.where.add(where);
      api.set(key, entry);
    }
  };
  for (const r of rows) collect(r, `${r.role}/${r.page}`);
  for (const f of flows) collect(f, `flow:${f.name}`);
  const apiList = [...api.values()].sort((a, b) => b.status - a.status || b.count - a.count);
  lines.push("## API failures (HTTP 4xx/5xx from /api)", "");
  if (apiList.length === 0) lines.push("None.", "");
  else {
    lines.push("| Status | Request | Count | Seen on | Response snippet |", "|---|---|---|---|---|");
    for (const e of apiList) {
      lines.push(`| ${e.status >= 500 ? `**${e.status}**` : e.status} | ${esc(e.method)} \`${esc(e.path)}\` | ${e.count} | ${clip([...e.where].slice(0, 4).join(", "), 120)} | ${clip(e.body, 140)} |`);
    }
    lines.push("");
  }

  lines.push("## Flows", "");
  lines.push("| Flow | Variant | Status | Detail |", "|---|---|---|---|");
  for (const f of flows) lines.push(`| ${esc(f.name)} | ${esc(f.variant)} | ${f.status} | ${clip(f.detail, 200)} |`);
  lines.push("");

  lines.push("## Pages (role x locale x width x page)", "");
  lines.push("| Role | Locale | Width | Page | Status | Overflow | Console errors | API failures | Axe (rules/nodes) | Screenshot |", "|---|---|---|---|---|---|---|---|---|---|");
  const order = { FAIL: 0, WARN: 1, PASS: 2 };
  const sorted = [...rows].sort((a, b) => order[a.status] - order[b.status] || a.role.localeCompare(b.role) || a.locale.localeCompare(b.locale) || a.width - b.width || a.page.localeCompare(b.page));
  for (const r of sorted) {
    const axe = r.axe ? `${r.axe.violations}/${r.axe.nodes}` : "n/a";
    lines.push(`| ${r.role} | ${r.locale} | ${r.width} | ${esc(r.page)} | ${r.status} | ${r.overflow ? "YES" : "no"} | ${r.consoleErrors.length} | ${r.apiFailures.length} | ${axe} | \`${esc(r.screenshot ?? "")}\` |`);
  }
  lines.push("");

  const detail = sorted.filter((r) => r.status !== "PASS");
  if (detail.length) {
    lines.push("## Details for FAIL and WARN rows", "");
    for (const r of detail.slice(0, 80)) {
      lines.push(`### ${r.status}: ${r.role} / ${r.locale} / ${r.width}px / ${r.page}`);
      for (const reason of r.reasons) lines.push(`- ${clip(reason, 300)}`);
      for (const e of r.pageErrors.slice(0, 3)) lines.push(`- page error: ${clip(e, 300)}`);
      for (const e of r.consoleErrors.slice(0, 3)) lines.push(`- console: ${clip(e, 300)}`);
      for (const e of r.apiFailures.slice(0, 5)) lines.push(`- API ${e.status} ${esc(e.method)} ${esc(e.path)} ${clip(e.body, 160)}`);
      for (const e of r.failedRequests.slice(0, 3)) lines.push(`- request failed: ${clip(e, 200)}`);
      if (r.overflow) lines.push(`- overflow: scrollWidth ${r.overflow.scrollWidth} > ${r.overflow.innerWidth}; offenders: ${clip(r.overflow.offenders.join(", "), 300)}`);
      if (r.axe?.top?.length) lines.push(`- axe: ${clip(r.axe.top.join(", "), 300)}`);
      for (const sample of r.axe?.samples ?? []) lines.push(`  - ${clip(sample, 300)}`);
      lines.push("");
    }
    if (detail.length > 80) lines.push(`(${detail.length - 80} more rows in report.json)`, "");
  }
  return lines.join("\n");
}
