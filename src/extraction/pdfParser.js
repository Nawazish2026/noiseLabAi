import fs from 'fs/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// NOTE: pdf-parse is lazy-loaded inside extractTextFromPdf() to avoid
// crashing Vercel serverless cold-starts (pdf-parse v2 references DOMMatrix,
// a browser-only global that does not exist in Node.js).

/**
 * Extracts raw textual content from a PDF document buffer or file path.
 * 
 * @param {string | Buffer} input - File path string or raw file Buffer
 * @returns {Promise<{ text: string, numPages: number, info: any }>}
 */
export async function extractTextFromPdf(input) {
  try {
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
