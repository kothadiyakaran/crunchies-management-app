// pdfjs-dist is a browser library — importing it under jsdom fails because
// jsdom lacks DOMMatrix. The real rendering proof is the Task B2 browser smoke.
// Here we only assert the module's export shape, which is safe to check without
// triggering the dynamic import.
import { describe, it, expect } from 'vitest';
import * as pdfPreview from './pdfPreview';

describe('pdfPreview exports', () => {
  it('exports loadPdfJs as a function', () => {
    expect(typeof pdfPreview.loadPdfJs).toBe('function');
  });

  it('exports renderPdfFirstPage as a function', () => {
    expect(typeof pdfPreview.renderPdfFirstPage).toBe('function');
  });
});
