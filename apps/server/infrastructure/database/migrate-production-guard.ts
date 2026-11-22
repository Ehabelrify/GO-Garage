/** Pure argument and environment checks for the production migration runner (P2T-014). No I/O. */
export interface ProductionMigrationPlan { target: string; dryRun: boolean; databaseName: string }

export function databaseNameFromUrl(url: string): string {
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")); } catch { return ""; }
}

export function parseTarget(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") return argv[i + 1]?.startsWith("--") ? undefined : argv[i + 1];
    if (arg.startsWith("--target=")) return arg.slice("--target=".length) || undefined;
  }
  return undefined;
}

export function planProductionMigration(env: Record<string, string | undefined>, argv: readonly string[]): { ok: true; plan: ProductionMigrationPlan } | { ok: false; error: string } {
  if (env.GARAGE_ALLOW_PRODUCTION_MIGRATION !== "yes") return { ok: false, error: "Set GARAGE_ALLOW_PRODUCTION_MIGRATION=yes to run production migrations." };
  if (!env.DATABASE_URL) return { ok: false, error: "DATABASE_URL is required." };
  const databaseName = databaseNameFromUrl(env.DATABASE_URL);
  if (!databaseName) return { ok: false, error: "DATABASE_URL has no database name." };
  const target = parseTarget(argv);
  if (!target) return { ok: false, error: "Pass --target <database name> to confirm which database to migrate." };
  if (target !== databaseName) return { ok: false, error: `--target "${target}" does not match the connected database "${databaseName}". Nothing was run.` };
  return { ok: true, plan: { target, dryRun: argv.includes("--dry-run"), databaseName } };
}
