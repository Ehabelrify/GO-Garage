// Derives the workspace routes each role can see from apps/web/src/app/navigation.ts.
// Parsed with regexes (not imported) so this runs without compiling TypeScript or installing the web app's icon packages.
import { readFileSync } from "node:fs";

export const DEMO_ACCOUNTS = {
  owner: "demo-owner",
  "branch-manager": "demo-manager",
  receptionist: "demo-reception",
  technician: "demo-technician",
};

const quotedList = (text) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

export function parseNavigation(file) {
  const src = readFileSync(file, "utf8");

  const roleSets = {};
  for (const m of src.matchAll(/const (\w+): GarageRole\[\] = \[([^\]]*)\];/g)) roleSets[m[1]] = quotedList(m[2]);
  const resolveRoles = (expr) => {
    const trimmed = expr.trim();
    if (trimmed.startsWith("[")) return quotedList(trimmed);
    return roleSets[trimmed] ?? [];
  };

  const items = [...src.matchAll(/\{ id: "(\w+)", path: "([^"]+)",[^\n]*?roles: (\[[^\]]*\]|\w+) \}/g)]
    .map((m) => ({ id: m[1], path: m[2], roles: resolveRoles(m[3]) }));

  const aliases = [...src.matchAll(/\{ id: "(\w+)", parent: "(\w+)", tab: "(\w+)",[^\n]*?roles: (\[[^\]]*\]|\w+) \}/g)]
    .map((m) => ({ id: m[1], parent: m[2], tab: m[3], roles: resolveRoles(m[4]) }));

  const redirectedMatch = src.match(/redirectedAliases[^=]*=\s*new Set<PageId>\(\[([^\]]*)\]\)/);
  const redirected = new Set(redirectedMatch ? quotedList(redirectedMatch[1]) : []);

  const block = src.match(/const primaryNavigationByRole[^=]*=\s*\{([\s\S]*?)\n\};/);
  const primary = {};
  if (block) {
    for (const m of block[1].matchAll(/^\s*"?([\w-]+)"?:\s*\[([^\]]*)\],?\s*$/gm)) primary[m[1]] = quotedList(m[2]);
  }

  if (items.length === 0 || Object.keys(primary).length === 0) {
    throw new Error(`Could not derive navigation from ${file} (items=${items.length}, roles=${Object.keys(primary).length}). Update scripts/visual/routes.mjs.`);
  }
  return { items, aliases, redirected, primary };
}

/** Pages to visit for a role: its menu entries plus the tab deep links of merged pages it may open. */
export function routesForRole(nav, role) {
  const ids = nav.primary[role] ?? [];
  const pages = [];
  for (const id of ids) {
    const item = nav.items.find((entry) => entry.id === id);
    if (item) pages.push({ id: item.id, path: item.path });
  }
  for (const alias of nav.aliases) {
    if (!nav.redirected.has(alias.id) || !alias.roles.includes(role) || !ids.includes(alias.parent)) continue;
    const parent = nav.items.find((entry) => entry.id === alias.parent);
    if (parent) pages.push({ id: `${alias.parent}-${alias.tab}`, path: `${parent.path}?tab=${alias.tab}` });
  }
  return pages;
}
