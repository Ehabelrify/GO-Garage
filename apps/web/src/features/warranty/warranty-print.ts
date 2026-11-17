type PrintKind = "invoice" | "qr";

let activeCleanup: (() => void) | null = null;

export function startWarrantyPrint(kind: PrintKind, target?: HTMLElement): () => void {
  activeCleanup?.();

  const className = kind === "invoice" ? "printing-warranty-invoice" : "printing-warranty-qr";
  document.body.classList.remove("printing-warranty-invoice", "printing-warranty-qr");
  document.body.classList.add(className);
  if (target) target.dataset.warrantyPrintTarget = "true";

  let fallback: number;
  let focusCleanup: number | undefined;
  const cleanup = () => {
    if (activeCleanup !== cleanup) return;
    activeCleanup = null;
    window.removeEventListener("afterprint", cleanup);
    window.removeEventListener("focus", onFocus);
    window.clearTimeout(fallback);
    if (focusCleanup !== undefined) window.clearTimeout(focusCleanup);
    document.body.classList.remove(className);
    if (target) delete target.dataset.warrantyPrintTarget;
  };
  const onFocus = () => {
    // Some browsers return from a cancelled print dialog without afterprint.
    focusCleanup = window.setTimeout(cleanup, 0);
  };
  activeCleanup = cleanup;
  window.addEventListener("afterprint", cleanup);
  window.addEventListener("focus", onFocus);
  fallback = window.setTimeout(cleanup, 60_000);
  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}
