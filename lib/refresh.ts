// Trigger a full page reload shortly after a successful mutation. The small
// delay lets the success toast paint before navigation tears the page down.
export function refreshAfterSuccess(delayMs: number = 400): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.location.reload();
  }, delayMs);
}
