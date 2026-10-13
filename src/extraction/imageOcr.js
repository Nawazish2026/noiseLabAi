import { createWorker } from 'tesseract.js';

/**
 * Perform optical character recognition on an image buffer or file path.
 * 
 * @param {string | Buffer} input - File path or image Buffer
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function extractTextFromImage(input) {
  let worker = null;
  try {
    worker = await createWorker('eng');
    const ret = await worker.recognize(input);
    const text = ret.data.text || '';
    const confidence = ret.data.confidence || 0;
    await worker.terminate();

    return {
      text,
      confidence
    };
  } catch (error) {
    if (worker) {
      try {
        await worker.terminate();
      } catch (_) {}
    }
    console.error(`[OCR Engine] Image recognition error: ${error.message}`);
    throw new Error(`Image OCR extraction failed: ${error.message}`);
  }
}
