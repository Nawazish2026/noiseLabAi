import fs from 'fs/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Polyfill browser globals required by pdfjs-dist / pdf-parse v2 in Node.js
class DOMMatrixPolyfill {
  constructor(init) {
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
    this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
    this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
    this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
    this.is2D = true;
    this.isIdentity = true;
    if (Array.isArray(init)) {
      if (init.length >= 6) {
        this.a = this.m11 = init[0];
        this.b = this.m12 = init[1];
        this.c = this.m21 = init[2];
        this.d = this.m22 = init[3];
        this.e = this.m41 = init[4];
        this.f = this.m42 = init[5];
      }
    }
  }
  multiply() { return new DOMMatrixPolyfill(); }
  translate() { return new DOMMatrixPolyfill(); }
  scale() { return new DOMMatrixPolyfill(); }
  inverse() { return new DOMMatrixPolyfill(); }
  transformPoint(p) { return p; }
}

function ensureNodePolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = DOMMatrixPolyfill;
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {};
  }
}

/**
 * Extracts raw textual content from a PDF document buffer or file path.
 * 
 * @param {string | Buffer} input - File path string or raw file Buffer
 * @returns {Promise<{ text: string, numPages: number, info: any }>}
 */
export async function extractTextFromPdf(input) {
  try {
    ensureNodePolyfills();

    // Lazy-load pdf-parse at call time, not import time
    const { PDFParse } = require('pdf-parse');

    let dataBuffer;
    if (typeof input === 'string') {
      dataBuffer = await fs.readFile(input);
    } else {
      dataBuffer = input;
    }

    const parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();

    return {
      text: data.text || '',
      numPages: data.total || 1,
      info: {}
    };
  } catch (error) {
    console.error(`[PDF Parser] Failed to parse PDF: ${error.message}`);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}
