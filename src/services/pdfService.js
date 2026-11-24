import { BindingService } from './bindingService.js';

const pxToMm = value => Number(value || 0) * 25.4 / 96;
const hexRgb = value => {
  const hex = String(value || '#000000').replace('#', '');
  const full = hex.length === 3 ? [...hex].map(char => char + char).join('') : hex;
  const number = Number.parseInt(full, 16);
  return Number.isFinite(number) ? [(number >> 16) & 255, (number >> 8) & 255, number & 255] : [0, 0, 0];
};
const imageFormat = data => /^data:image\/jpe?g/i.test(data || '') ? 'JPEG' : 'PNG';

async function waitForImage(img) {
  if (img.complete) {
    if (!img.naturalWidth) throw new Error('Ada gambar yang gagal dimuat untuk PDF.');
    return;
  }
  await new Promise((resolve, reject) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', () => reject(new Error('Ada gambar yang gagal dimuat untuk PDF.')), { once: true });
  });
}

async function addContainedImage(doc, dataUrl, x, y, w, h) {
  const image = new Image();
  image.src = dataUrl;
  await waitForImage(image);
  const ratio = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const drawW = image.naturalWidth * ratio;
  const drawH = image.naturalHeight * ratio;
  doc.addImage(dataUrl, imageFormat(dataUrl), x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH, undefined, 'NONE');
}

export const PdfService = {
  async exportProjectZip(state) {
    if (typeof JSZip === 'undefined') throw new Error('Pustaka JSZip belum termuat.');
    const zip = new JSZip();
    const safeProject = {
      exportedAt: new Date().toISOString(),
      schoolName: state.schoolProfile?.schoolName || '',
      templates: state.templates,
      printConfig: state.printConfig,
      exams: state.exams,
      folders: state.folders.map(f => ({
        folderId: f.folderId,
        classId: f.classId,
        level: f.level,
        className: f.className,
        excelMeta: f.excelMeta,
        studentCount: (f.students || []).length
      }))
    };
    zip.file('project-metadata.json', JSON.stringify(safeProject, null, 2));
    return await zip.generateAsync({ type: 'blob' });
  },

  async exportCardsPdf(state, folder, students, template, layout = null) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('Pustaka jsPDF belum termuat.');
    }
    const { jsPDF } = window.jspdf;
    const cards = Array.from(document.querySelectorAll('#print-output-area .generated-exam-card'));
    if (cards.length !== students.length) throw new Error('Pratinjau cetak belum siap; buka kembali halaman cetak.');
    await Promise.all(Array.from(document.querySelectorAll('#print-output-area img')).map(waitForImage));
    if (document.fonts?.ready) await document.fonts.ready;
    const cfg = state.printConfig;
    const format = layout ? [layout.width, layout.height] : cfg.paperSize === 'Custom' ? [Number(cfg.customPaperW), Number(cfg.customPaperH)] : cfg.paperSize === 'F4' ? [215, 330] : cfg.paperSize.toLowerCase();
    const isLandscape = Number(format[0]) > Number(format[1]);
    const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format });
    if (!students?.length) throw new Error('Tidak ada data siswa untuk dibuatkan PDF.');

    const cols = Math.max(1, Number(layout?.cols ?? cfg.cols) || 2);
    const rows = Math.max(1, Number(layout?.rows ?? cfg.rows) || 5);
    const perPage = cols * rows;
    const margin = Number.isFinite(Number(layout?.marginMm ?? cfg.marginMm)) ? Number(layout?.marginMm ?? cfg.marginMm) : 10;
    const gap = Number.isFinite(Number(layout?.gapMm ?? cfg.gapMm)) ? Number(layout?.gapMm ?? cfg.gapMm) : 1;
    const cardW = Number(layout?.cardW ?? cfg.cardW ?? template.widthMm);
    const cardH = Number(layout?.cardH ?? cfg.cardH ?? template.heightMm);
    const scaleX = cardW / Number(template.widthMm);
    const scaleY = cardH / Number(template.heightMm);
    const exam = (state.exams || []).find(item => item.id === folder.examId);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    if (cols * cardW + (cols - 1) * gap + margin * 2 > pageWidth + 0.01 || rows * cardH + (rows - 1) * gap + margin * 2 > pageHeight + 0.01) {
      throw new Error('Susunan kartu melebihi ukuran kertas. Kurangi jumlah baris/kolom atau ukuran kartu.');
    }

    for (let idx = 0; idx < students.length; idx++) {
      if (idx > 0 && idx % perPage === 0) doc.addPage();
      const slot = idx % perPage;
      const c = slot % cols;
      const r = Math.floor(slot / cols);
      const pageStart = Math.floor(idx / perPage) * perPage;
      const pageCount = Math.min(perPage, students.length - pageStart);
      const pageRows = Math.ceil(pageCount / cols);
      const availableW = pageWidth - margin * 2;
      const availableH = pageHeight - margin * 2;
      const fullGridW = cols * cardW + (cols - 1) * gap;
      const visibleGridH = pageRows * cardH + (pageRows - 1) * gap;
      const fullGridX = margin + (availableW - fullGridW) / 2;
      const gridY = margin + (availableH - visibleGridH) / 2;
      const finalRowCount = pageCount - (pageRows - 1) * cols;
      const isPartialLastRow = r === pageRows - 1 && finalRowCount < cols;
      const lastRowW = finalRowCount * cardW + (finalRowCount - 1) * gap;
      const x = isPartialLastRow
        ? margin + (availableW - lastRowW) / 2 + c * (cardW + gap)
        : fullGridX + c * (cardW + gap);
      const y = gridY + r * (cardH + gap);

      const node = cards[idx];
      if (template.bgImage) doc.addImage(template.bgImage, imageFormat(template.bgImage), x, y, cardW, cardH, undefined, 'NONE');
      else {
        doc.setFillColor(...hexRgb(template.bgColor || '#ffffff'));
        doc.rect(x, y, cardW, cardH, 'F');
        doc.setFillColor(...hexRgb(template.accentColor || '#0f2347'));
        doc.rect(x, y, cardW, pxToMm(4) * scaleY, 'F');
      }
      doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.rect(x, y, cardW, cardH, 'S');

      for (const element of template.elements || []) {
        const ex = x + pxToMm(element.x) * scaleX; const ey = y + pxToMm(element.y) * scaleY;
        const ew = pxToMm(element.w) * scaleX; const eh = pxToMm(element.h) * scaleY;
        const elementNode = Array.from(node.querySelectorAll('[data-element-id]')).find(item => item.dataset.elementId === element.id);
        if (element.kind === 'photo' || element.kind === 'logo') {
          const image = elementNode?.querySelector('img');
          if (image?.src) {
            await waitForImage(image);
            if (element.kind === 'photo' && typeof window.html2canvas === 'function') {
              const imageCanvas = await window.html2canvas(elementNode, { scale: 5, backgroundColor: null, useCORS: true, logging: false });
              doc.addImage(imageCanvas.toDataURL('image/png'), 'PNG', ex, ey, ew, eh, undefined, 'NONE');
            } else await addContainedImage(doc, image.src, ex, ey, ew, eh);
          }
          continue;
        }
        if (element.kind === 'qr') {
          const qr = elementNode?.querySelector('canvas, img');
          const data = qr?.tagName === 'CANVAS' ? qr.toDataURL('image/png') : qr?.src;
          if (data) doc.addImage(data, imageFormat(data), ex, ey, ew, eh, undefined, 'NONE');
          continue;
        }

        const pdfStudent = { ...students[idx], examFields: BindingService.getExamFields(exam) };
        const text = element.kind === 'static'
          ? String(element.text || '')
          : String(BindingService.resolveElementValue(element, pdfStudent, folder.excelMeta, '-') ?? '-');
        if (!text) continue;
        const fontSizePt = Math.max(5, Number(element.fontSize || 11) * 0.75 * scaleY);
        doc.setFont('helvetica', Number.parseInt(element.fontWeight, 10) >= 600 ? 'bold' : 'normal');
        doc.setFontSize(fontSizePt);
        doc.setTextColor(...hexRgb(element.color || '#0f172a'));
        const padX = pxToMm(4) * scaleX; const maxWidth = Math.max(1, ew - padX * 2);
        let fittedText = text;
        while (fittedText.length > 1 && doc.getTextWidth(fittedText) > maxWidth) fittedText = `${fittedText.slice(0, -2)}…`;
        const align = element.align === 'center' || element.align === 'right' ? element.align : 'left';
        const textX = align === 'center' ? ex + ew / 2 : align === 'right' ? ex + ew - padX : ex + padX;
        const baseline = ey + pxToMm(Number(element.fontSize || 11) + 3) * scaleY;
        doc.text(fittedText, textX, baseline, { align, angle: Number(element.rotation || 0), maxWidth });
      }
    }

    doc.save(`kartu_ujian_${(folder.className || 'kelas').replace(/\s+/g, '_')}.pdf`);
  }
};
