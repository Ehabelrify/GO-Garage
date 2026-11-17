// The operator must approve the specific disposable target for this hook.
// Example identity: db.example.internal:5432/garage_disposable
const fail = () => {
  console.error("Post-merge migration blocked: explicit disposable database approval and matching target identity are required.");
  process.exit(1);
};

if (process.env.GARAGE_POST_MERGE_DISPOSABLE_DATABASE !== "yes") fail();

let target;
try {
  target = new URL(process.env.DATABASE_URL ?? "");
} catch {
  fail();
}

if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") fail();
if (!target.hostname || !target.pathname || target.pathname === "/") fail();

let database;
try {
  database = decodeURIComponent(target.pathname.slice(1));
} catch {
  fail();
}
if (!database || database.includes("/") || database.includes("\\")) fail();
const identity = `${target.hostname.toLowerCase()}:${target.port || "5432"}/${database}`;
const approved = process.env.GARAGE_POST_MERGE_APPROVED_DATABASE_ID;
if (!approved || approved !== identity) fail();
