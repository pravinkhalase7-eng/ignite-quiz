import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function readDocument(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return readPdf(file);
  if (name.endsWith('.docx')) return readDocx(file);
  if (name.endsWith('.doc')) {
    throw new Error('Older .doc files are not supported. Save the document as .docx or PDF and upload that.');
  }
  throw new Error('Upload a PDF or Word (.docx) file.');
}

async function readPdf(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let currentY: number | null = null;
    let buffer = '';

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      if (currentY !== null && Math.abs(y - currentY) > 2) {
        lines.push(buffer.trim());
        buffer = '';
      }
      currentY = y;
      buffer += `${item.str} `;
    }
    if (buffer.trim()) lines.push(buffer.trim());
    pages.push(lines.join('\n'));
  }

  return pages.join('\n');
}

async function readDocx(file: File) {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}
