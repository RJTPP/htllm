export class UnsupportedPdfError extends Error {
  constructor(message = 'This PDF has no extractable text. Scanned PDFs require OCR, which is not supported.') {
    super(message);
    this.name = 'UnsupportedPdfError';
  }
}

export interface ExtractedPdf {
  text: string;
  pages: { page: number; start: number; end: number }[];
}
export async function extractPdf(file: File, opts: { signal?: AbortSignal; onProgress?: (page: number, total: number) => void } = {}): Promise<ExtractedPdf> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  opts.signal?.throwIfAborted();
  const data = new Uint8Array(await file.arrayBuffer());
  opts.signal?.throwIfAborted();
  const task = pdfjs.getDocument({ data });
  const abort = () => { void task.destroy().catch(() => {}); };
  opts.signal?.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await task.promise;
    const result: ExtractedPdf = { text: '', pages: [] };
    for (let page = 1; page <= pdf.numPages; page++) {
      opts.signal?.throwIfAborted();
      const p = await pdf.getPage(page);
      const content = await p.getTextContent();
      opts.signal?.throwIfAborted();
      const text = content.items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      const start = result.text.length;
      result.text += text + '\n\n';
      result.pages.push({ page, start, end: result.text.length });
      p.cleanup();
      opts.onProgress?.(page, pdf.numPages);
    }
    opts.signal?.throwIfAborted();
    if (!result.text.trim()) throw new UnsupportedPdfError();
    return result;
  } catch (error) {
    opts.signal?.throwIfAborted();
    if (error instanceof UnsupportedPdfError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') throw new UnsupportedPdfError('Encrypted PDFs are unsupported. Import an unencrypted copy.');
    throw new UnsupportedPdfError('The PDF could not be read. It may be damaged or unsupported.');
  } finally {
    opts.signal?.removeEventListener('abort', abort);
    await task.destroy();
  }
}
export async function extractPdfText(file: File): Promise<string> { return (await extractPdf(file)).text; }
