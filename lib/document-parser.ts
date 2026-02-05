import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

// Handle both CJS and ESM default exports
const pdf = typeof pdfParse === 'function' ? pdfParse : (pdfParse as any).default || pdfParse;
import * as XLSX from 'xlsx';

export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      const pdfData = await pdf(buffer);
      return pdfData.text;

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword':
      const docResult = await mammoth.extractRawText({ buffer });
      return docResult.value;

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel':
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let text = '';
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        text += `\n--- Sheet: ${sheetName} ---\n`;
        text += XLSX.utils.sheet_to_csv(sheet);
      }
      return text;

    case 'text/plain':
      return buffer.toString('utf-8');

    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}
