import { pathToFileURL } from "node:url";

// The operator must approve the specific disposable target for this hook.
// Example identity: db.example.internal:5432/garage_disposable
export function checkPostMergeMigrationTarget(environment = process.env) {
  const approval = environment.GARAGE_POST_MERGE_DISPOSABLE_DATABASE;
  const approvedIdentity = environment.GARAGE_POST_MERGE_APPROVED_DATABASE_ID;
  const hasApproval = typeof approval === "string" && approval.trim().length > 0;
  const hasApprovedIdentity = typeof approvedIdentity === "string" && approvedIdentity.trim().length > 0;

  if (!hasApproval && !hasApprovedIdentity) return { decision: "skip" };
  if (approval !== "yes" || !hasApprovedIdentity) return { decision: "reject" };

  let target;
  try {
    target = new URL(environment.DATABASE_URL ?? "");
  } catch {
    return { decision: "reject" };
  }

  if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") {
    return { decision: "reject" };
  }
  if (!target.hostname || !target.pathname || target.pathname === "/") {
    return { decision: "reject" };
  }

  let database;
  try {
    database = decodeURIComponent(target.pathname.slice(1));
  } catch {
    return { decision: "reject" };
  }
  if (!database || database.includes("/") || database.includes("\\")) {
    return { decision: "reject" };
  }

  const identity = `${target.hostname.toLowerCase()}:${target.port || "5432"}/${database}`;
  return approvedIdentity === identity
    ? { decision: "approved" }
    : { decision: "reject" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkPostMergeMigrationTarget();
  if (result.decision === "skip") {
    process.stdout.write("skip\n");
  } else if (result.decision === "approved") {
    process.stdout.write("approved\n");
  } else {
    console.error("Post-merge migration blocked: disposable approval or exact target identity is invalid.");
    process.exitCode = 1;
  }
}
