import { uid } from '../utils/helpers.js';

function parseCsv(text) {
  const sample = (text.split(/\r?\n/, 1)[0] || '').replace(/^\uFEFF/, '');
  const candidates = [',', ';', '\t'];
  let delimiter = ',';
  let best = -1;
  for (const candidate of candidates) {
    let quoted = false; let count = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === '"') quoted = !quoted;
      else if (sample[i] === candidate && !quoted) count++;
    }
    if (count > best) { best = count; delimiter = candidate; }
  }
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell.length || row.length || !rows.length) { row.push(cell); rows.push(row); }
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  return rows;
}

function decodeCsv(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

/**
 * Excel Import Engine:
 * - Mendukung .xlsx, .xls, .csv
 * - Membaca multi-worksheet & pengaturan baris header (1-indexed)
 * - Mempertahankan nama header asli & angka nol di depan (NISN/kode peserta)
 */
export const ExcelService = {
  parseWorkbookBuffer(arrayBuffer, fileName) {
    if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) throw new Error('File Excel kosong atau tidak dapat dibaca.');
    if (!/\.(xlsx|xls|csv)$/i.test(fileName || '')) throw new Error('Pilih file .xlsx, .xls, atau .csv.');
    if (/\.csv$/i.test(fileName)) {
      return { fileId: uid('xls'), fileName, sheetNames: ['CSV'], matrix: parseCsv(decodeCsv(arrayBuffer)) };
    }
    if (typeof XLSX === 'undefined') throw new Error('Pustaka pembaca Excel tidak termuat. Periksa koneksi internet, lalu muat ulang halaman.');
    let workbook;
    try {
      workbook = XLSX.read(arrayBuffer, { type: 'array', raw: false, cellDates: true });
    } catch (error) {
      throw new Error(`File Excel tidak dapat dibuka. Pastikan file tidak rusak atau terkunci. (${error.message || 'Format tidak dikenal'})`);
    }
    if (!workbook.SheetNames?.length) throw new Error('File ini tidak memiliki worksheet yang bisa dibaca.');
    return {
      fileId: uid('xls'),
      fileName,
      sourceBuffer: arrayBuffer,
      sheetNames: workbook.SheetNames || [],
      workbook
    };
  },

  extractSheetData(parsedWorkbook, sheetName, headerRowNumber = 1) {
    const targetSheet = sheetName || parsedWorkbook.sheetNames[0];
    let matrix;
    if (parsedWorkbook.matrix && targetSheet === 'CSV') matrix = parsedWorkbook.matrix;
    else {
      const ws = parsedWorkbook.workbook?.Sheets?.[targetSheet];
      if (!ws) throw new Error(`Worksheet "${targetSheet}" tidak ditemukan.`);
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true });
    }

    const headerIdx = Math.max(0, Number(headerRowNumber) - 1);
    const rawHeaders = matrix[headerIdx] || [];
    if (!rawHeaders.some(cell => String(cell ?? '').trim())) throw new Error(`Judul kolom tidak ditemukan di baris ${headerIdx + 1}. Ubah baris judul kolom lalu coba lagi.`);
    const seen = new Map();
    const duplicateHeaders = [];
    let unnamedCount = 0;

    const columns = rawHeaders.map((cell, index) => {
      const original = String(cell ?? '').trim();
      if (!original) {
        unnamedCount++;
        return {
          variableId: `excel_col_${String(index + 1).padStart(3, '0')}`,
          originalHeader: `Kolom_${index + 1}`,
          columnIndex: index,
          isUnnamed: true,
          isDuplicate: false
        };
      }
      const count = (seen.get(original) || 0) + 1;
      seen.set(original, count);
      const isDuplicate = count > 1;
      if (isDuplicate) duplicateHeaders.push(original);
      return {
        variableId: `excel_col_${String(index + 1).padStart(3, '0')}`,
        originalHeader: isDuplicate ? `${original} (${count})` : original,
        rawHeader: original,
        columnIndex: index,
        isUnnamed: false,
        isDuplicate
      };
    });

    const students = [];
    let emptyRowCount = 0;

    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const isEmpty = columns.every(col => String(row[col.columnIndex] ?? '').trim() === '');
      if (isEmpty) {
        emptyRowCount++;
        continue;
      }
      const record = {};
      columns.forEach(col => {
        const val = row[col.columnIndex];
        record[col.originalHeader] = val === undefined || val === null ? '' : String(val).trim();
      });
      students.push({
        studentId: uid('stu'),
        rowNumber: r + 1,
        fields: record,
        photoId: null,
        crop: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 }
      });
    }
    if (!students.length) throw new Error(`Tidak ada data siswa setelah judul kolom pada worksheet "${targetSheet}".`);

    return {
      fileId: parsedWorkbook.fileId,
      fileName: parsedWorkbook.fileName,
      worksheet: targetSheet,
      headerRowNumber: headerIdx + 1,
      totalRows: matrix.length,
      emptyRowCount,
      duplicateHeaders,
      unnamedCount,
      columns,
      students
    };
  },
  async extractEmbeddedPhotos(parsedWorkbook, sheetName) {
    if (!/\.xlsx$/i.test(parsedWorkbook?.fileName || '') || typeof JSZip === 'undefined' || typeof DOMParser === 'undefined') return [];
    const zip = await JSZip.loadAsync(parsedWorkbook.sourceBuffer);
    const readXml = async path => {
      const file = zip.file(path);
      return file ? new DOMParser().parseFromString(await file.async('text'), 'application/xml') : null;
    };
    const workbookXml = await readXml('xl/workbook.xml');
    const workbookRels = await readXml('xl/_rels/workbook.xml.rels');
    if (!workbookXml || !workbookRels) return [];
    const sheet = [...workbookXml.getElementsByTagNameNS('*', 'sheet')].find(node => node.getAttribute('name') === sheetName);
    const relationId = sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const sheetTarget = [...workbookRels.getElementsByTagNameNS('*', 'Relationship')].find(node => node.getAttribute('Id') === relationId)?.getAttribute('Target');
    if (!sheetTarget) return [];
    const resolve = (base, target) => {
      const parts = (target.startsWith('/') ? target.slice(1) : `${base}/${target}`).split('/'); const out = [];
      for (const part of parts) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
      return out.join('/');
    };
    const sheetPath = resolve('xl', sheetTarget);
    const slash = sheetPath.lastIndexOf('/'); const base = sheetPath.slice(0, slash);
    const relPath = `${base}/_rels/${sheetPath.slice(slash + 1)}.rels`;
    const sheetXml = await readXml(sheetPath); const sheetRels = await readXml(relPath);
    const drawingId = sheetXml?.getElementsByTagNameNS('*', 'drawing')[0]?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const drawingTarget = [...(sheetRels?.getElementsByTagNameNS('*', 'Relationship') || [])].find(node => node.getAttribute('Id') === drawingId)?.getAttribute('Target');
    if (!drawingTarget) return [];
    const drawingPath = resolve(base, drawingTarget); const drawingBase = drawingPath.slice(0, drawingPath.lastIndexOf('/'));
    const drawingXml = await readXml(drawingPath);
    const drawingRelPath = `${drawingBase}/_rels/${drawingPath.slice(drawingPath.lastIndexOf('/') + 1)}.rels`;
    const drawingRels = await readXml(drawingRelPath);
    if (!drawingXml || !drawingRels) return [];
    const relationships = new Map([...drawingRels.getElementsByTagNameNS('*', 'Relationship')].map(node => [node.getAttribute('Id'), node.getAttribute('Target')]));
    const photos = [];
    const anchors = [...drawingXml.getElementsByTagNameNS('*', 'twoCellAnchor'), ...drawingXml.getElementsByTagNameNS('*', 'oneCellAnchor')];
    for (const anchor of anchors) {
      const rowNode = anchor.getElementsByTagNameNS('*', 'from')[0]?.getElementsByTagNameNS('*', 'row')[0];
      const rowNumber = Number(rowNode?.textContent) + 1;
      const embedId = anchor.getElementsByTagNameNS('*', 'blip')[0]?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
      const imageTarget = relationships.get(embedId);
      if (!Number.isInteger(rowNumber) || rowNumber < 1 || !imageTarget) continue;
      const imagePath = resolve(drawingBase, imageTarget); const image = zip.file(imagePath);
      if (!image || !/\.(jpe?g|png|webp)$/i.test(imagePath)) continue;
      const blob = await image.async('blob');
      photos.push({ rowNumber, fileName: `excel-row-${rowNumber}${imagePath.match(/\.[^.]+$/)?.[0] || '.jpg'}`, file: new File([blob], `excel-row-${rowNumber}${imagePath.match(/\.[^.]+$/)?.[0] || '.jpg'}`, { type: blob.type || (imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg') }) });
    }
    return photos;
  }
};
