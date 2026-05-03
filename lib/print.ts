// Generate a PDF of a specific DOM element and open it in a new browser tab.
// Uses html2canvas to rasterise the element, then jsPDF to package it as an
// A4 PDF (multi-page if the content is taller than one page). The libs are
// dynamically imported so they don't bloat the initial page bundle.
export async function exportElementToPdf(
  elementId: string,
  filename = "report"
) {
  if (typeof window === "undefined") return;
  const el = document.getElementById(elementId);
  if (!el) return;

  // Switch to a print-friendly light palette + hide .no-print before capture.
  document.body.classList.add("pdf-export-mode");
  // Wait one frame so the new computed styles are applied before snapshot.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve())
  );

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const canvas = await html2canvas(el, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      // Capture the full scrollable height, not just what's visible.
      height: el.scrollHeight,
      windowHeight: el.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    } else {
      // Multi-page: render the same image, shifted up each page so a
      // different vertical slice shows through the page-sized viewport.
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }

    const safeName = filename.replace(/[^\w\-.]+/g, "_") || "report";
    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);

    // Open in a new tab. If popup blockers prevent this, fall back to a
    // direct download so the user still gets the file.
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    // Keep the URL alive long enough for the new tab to load it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    console.error("[print] PDF export failed:", err);
  } finally {
    document.body.classList.remove("pdf-export-mode");
  }
}
