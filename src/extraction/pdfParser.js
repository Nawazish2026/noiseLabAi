import fs from 'fs/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

/**
 * Extracts raw textual content from a PDF document buffer or file path.
 * 
 * @param {string | Buffer} input - File path string or raw file Buffer
 * @returns {Promise<{ text: string, numPages: number, info: any }>}
 */
export async function extractTextFromPdf(input) {
  try {
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
