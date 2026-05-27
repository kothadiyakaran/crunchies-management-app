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
 *  `cssWidth` CSS pixels (device-pixel-ratio–aware, capped at 2×).
 *
 *  Pass an `AbortSignal` to cancel an in-progress render (e.g. when the
 *  preview modal unmounts). Cancellation resolves quietly — callers don't
 *  need to distinguish cancelled from success. */
export async function renderPdfFirstPage(
  blob: Blob,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;

  const pdfjs = await loadPdfJs();
  if (signal?.aborted) return;

  const data = new Uint8Array(await blob.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });

  // Hold refs so the abort handler can tear both tasks down synchronously.
  // renderCompleted flips true once drawImage finishes — at that point the
  // render pipeline is done and destroy()/cancel() would only cause pdfjs to
  // log InvalidStateError from its own worker teardown path, so we skip them.
  let renderTask: { cancel(): void; promise: Promise<void> } | null = null;
  let renderCompleted = false;

  function onAbort() {
    if (renderCompleted) return;
    renderTask?.cancel();
    loadingTask.destroy().catch(() => {}); // teardown rejection is not actionable
  }
  signal?.addEventListener('abort', onAbort);

  try {
    const pdf = await loadingTask.promise;
    if (signal?.aborted) return;

    const page = await pdf.getPage(1);
    if (signal?.aborted) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / page.getViewport({ scale: 1 }).width) * dpr });

    // Render into a detached off-document canvas so pdfjs never holds a
    // reference to the mounted canvas element.
    const offscreen = document.createElement('canvas');
    offscreen.width = viewport.width;
    offscreen.height = viewport.height;

    // Assign before awaiting so the abort handler can cancel an in-progress render.
    renderTask = page.render({ canvas: offscreen, viewport });
    await renderTask.promise;

    if (signal?.aborted) return;

    // Copy result to the visible canvas only after render completes cleanly.
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
    canvas.getContext('2d')?.drawImage(offscreen, 0, 0);
    renderCompleted = true;
  } catch (e) {
    // Swallow cancellation — caller treats abort as a quiet no-op.
    if (
      (e as { name?: string })?.name === 'RenderingCancelledException' ||
      signal?.aborted
    ) {
      return;
    }
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
