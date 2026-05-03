// Trigger the browser's print dialog with a single element scoped as the
// "print area". Combined with the @media print rules in globals.css, this
// produces a clean PDF (Save as PDF) of just that element. We toggle a class
// on the element and the document title so the saved file name is nice.
export function exportElementToPdf(elementId: string, filename?: string) {
  if (typeof window === "undefined") return;
  const el = document.getElementById(elementId);
  if (!el) {
    window.print();
    return;
  }

  el.classList.add("print-area");
  document.body.classList.add("printing");
  const originalTitle = document.title;
  if (filename) document.title = filename;

  const cleanup = () => {
    el.classList.remove("print-area");
    document.body.classList.remove("printing");
    document.title = originalTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  window.print();

  // Some browsers (older Safari) don't fire afterprint reliably; fall back
  // to a short timeout so the page doesn't get stuck in print state.
  setTimeout(cleanup, 1500);
}
