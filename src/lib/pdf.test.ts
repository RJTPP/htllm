import { beforeEach, expect, it, vi } from 'vitest';
import { extractPdf } from './pdf';
const mock = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: mock.getDocument }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/fixture-worker.mjs' }));
const file = { arrayBuffer: async () => new ArrayBuffer(0) } as File;
beforeEach(() => { mock.getDocument.mockReset(); });
it.each(['PasswordException', 'InvalidPDFException'])('reports %s clearly and releases its worker', async (name) => {
  const destroy = vi.fn(async () => {});
  mock.getDocument.mockImplementation(() => ({ promise: Promise.reject(Object.assign(new Error('parser failure'), { name })), destroy }));
  await expect(extractPdf(file)).rejects.toThrow(name === 'PasswordException' ? 'Encrypted' : 'could not be read');
  expect(destroy).toHaveBeenCalledOnce();
});
it('cancelling during file read never creates a parser task', async () => {
  const controller = new AbortController();
  const input = { arrayBuffer: async () => { controller.abort(); return new ArrayBuffer(0); } } as File;
  await expect(extractPdf(input, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(mock.getDocument).not.toHaveBeenCalled();
});
it('cancelling the final page does not return a successful extraction', async () => {
  const controller = new AbortController(); const destroy = vi.fn(async () => {});
  mock.getDocument.mockReturnValue({ destroy, promise: Promise.resolve({ numPages: 1, getPage: async () => ({ cleanup: () => {}, getTextContent: async () => ({ items: [{ str: 'evidence', hasEOL: false }] }) }) }) });
  await expect(extractPdf(file, { signal: controller.signal, onProgress: () => controller.abort() })).rejects.toMatchObject({ name: 'AbortError' });
  expect(destroy).toHaveBeenCalled();
});
