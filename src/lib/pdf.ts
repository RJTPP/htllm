/**
 * PDF text extraction — stub for Phase 3.x.
 *
 * The full implementation will lazy-load pdfjs-dist via a dynamic import()
 * so the ~2MB parser only ships when a user actually drops a PDF. For now,
 * ingest.ts catches this and surfaces a friendly "PDF support coming soon"
 * to the UI.
 */

export class UnsupportedPdfError extends Error {
  constructor() {
    super('PDF support is not yet enabled in this build.');
    this.name = 'UnsupportedPdfError';
  }
}

export async function extractPdfText(_file: File): Promise<string> {
  throw new UnsupportedPdfError();
}
