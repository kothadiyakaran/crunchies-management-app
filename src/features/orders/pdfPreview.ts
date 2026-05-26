// Lazy-loads pdfjs-dist only when the bill preview opens, so the ~1 MB chunk
// never hits app startup — the same pattern used for jspdf in loadJsPDF().

/** Dynamically imports pdfjs-dist and configures its worker. Use this at the
 *  call site (e.g. when the preview modal opens) so Vite splits pdfjs into its
 *  own chunk that is fetched on demand. */
export async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Rasterises the first page of a PDF blob onto a canvas, sized to fit
 *  `cssWidth` CSS pixels (device-pixel-ratio–aware, capped at 2×). */
export async function renderPdfFirstPage(
  blob: Blob,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<void> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth / page.getViewport({ scale: 1 }).width) * dpr });

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${Math.round(viewport.height / dpr)}px`;

  await page.render({ canvas, viewport }).promise;
}
