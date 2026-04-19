const PDF_HEADER = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const LINE_HEIGHT = 12;

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function chunkLines(lines: string[]) {
  const availableHeight = PAGE_HEIGHT - PAGE_MARGIN * 2;
  const linesPerPage = Math.max(1, Math.floor(availableHeight / LINE_HEIGHT));
  const chunks: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    chunks.push(lines.slice(index, index + linesPerPage));
  }

  return chunks.length > 0 ? chunks : [['No data']];
}

function buildContentStream(lines: string[]) {
  const yStart = PAGE_HEIGHT - PAGE_MARGIN;
  const commands: string[] = ['BT', '/F1 10 Tf', String(PAGE_MARGIN) + ' ' + String(yStart) + ' Td'];

  lines.forEach((line, index) => {
    if (index > 0) {
      commands.push('0 -' + String(LINE_HEIGHT) + ' Td');
    }

    commands.push('(' + escapePdfText(line) + ') Tj');
  });

  commands.push('ET');

  return commands.join('\n') + '\n';
}

function renderPdf(objects: string[]) {
  let offset = Buffer.byteLength(PDF_HEADER, 'utf8');
  const offsets: number[] = [0];
  const bodyParts: string[] = [];

  objects.forEach((objectBody, index) => {
    const objectNumber = index + 1;
    const serialized =
      String(objectNumber) +
      ' 0 obj\n' +
      objectBody +
      '\nendobj\n';
    offsets.push(offset);
    bodyParts.push(serialized);
    offset += Buffer.byteLength(serialized, 'utf8');
  });

  const xrefOffset = offset;
  const xrefEntries = offsets
    .map((entryOffset, index) => {
      const generation = index === 0 ? '65535' : '00000';
      const marker = index === 0 ? 'f' : 'n';
      return entryOffset.toString().padStart(10, '0') + ' ' + generation + ' ' + marker + ' ';
    })
    .join('\n');

  const xref = 'xref\n0 ' + String(offsets.length) + '\n' + xrefEntries + '\n';
  const trailer =
    'trailer\n<< /Size ' +
    String(offsets.length) +
    ' /Root 1 0 R >>\nstartxref\n' +
    String(xrefOffset) +
    '\n%%EOF\n';

  return Buffer.from(PDF_HEADER + bodyParts.join('') + xref + trailer, 'utf8');
}

export function createSimplePdf(lines: string[]) {
  const pageChunks = chunkLines(lines);
  const objects: string[] = [];

  // 1: catalog, 2: pages, 3: font
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const pageObjectIds: number[] = [];

  for (const pageLines of pageChunks) {
    const contentStream = buildContentStream(pageLines);
    const contentObjectId = objects.length + 1;
    objects.push(
      '<< /Length ' +
        String(Buffer.byteLength(contentStream, 'utf8')) +
        ' >>\nstream\n' +
        contentStream +
        'endstream',
    );

    const pageObjectId = objects.length + 1;
    pageObjectIds.push(pageObjectId);
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
        String(PAGE_WIDTH) +
        ' ' +
        String(PAGE_HEIGHT) +
        '] /Resources << /Font << /F1 3 0 R >> >> /Contents ' +
        String(contentObjectId) +
        ' 0 R >>',
    );
  }

  objects[1] =
    '<< /Type /Pages /Count ' +
    String(pageObjectIds.length) +
    ' /Kids [' +
    pageObjectIds.map((id) => String(id) + ' 0 R').join(' ') +
    '] >>';

  return renderPdf(objects);
}
