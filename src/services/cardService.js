import { BindingService } from './bindingService.js';
import { PhotoService } from './photoService.js';
import { escapeHtml } from '../utils/helpers.js';

export const CardService = {
  runPreGenerationValidation(state, folder) {
    const checks = [];
    if (!folder) {
      checks.push({ level: 'error', title: 'Folder Kelas Belum Dipilih', detail: 'Buat atau pilih folder kelas terlebih dahulu.' });
      return checks;
    }
    if (!folder.excelMeta || !folder.students?.length) {
      checks.push({ level: 'error', title: 'Data Excel Kosong', detail: `Kelas ${folder.className} belum memiliki data siswa dari Excel.` });
    } else {
      checks.push({ level: 'valid', title: 'Sumber Excel Tersedia', detail: `${folder.excelMeta.fileName} (${folder.students.length} siswa, sheet "${folder.excelMeta.worksheet}").` });
    }

    const template = state.templates.find(t => t.id === (folder.templateId || state.activeTemplateId));
    if (!template) {
      checks.push({ level: 'error', title: 'Template Tidak Ditemukan', detail: 'Pilih template kartu sebelum mencetak.' });
    } else {
      BindingService.autoBindTemplate(template, folder.excelMeta);
      const bindingIssues = BindingService.validateTemplateBindings(template, folder.excelMeta);
      if (bindingIssues.length) {
        bindingIssues.forEach(iss => checks.push({ level: 'error', title: 'Binding Variabel Bermasalah', detail: iss.message }));
      } else {
        checks.push({ level: 'valid', title: 'Semua Binding Variabel Valid', detail: `Seluruh elemen dinamis cocok dengan kolom Excel ${folder.className}.` });
      }
    }

    const missingPhotos = (folder.students || []).filter(s => !s.photoId).length;
    if (missingPhotos > 0) {
      checks.push({ level: 'info', title: 'Foto peserta opsional', detail: `${missingPhotos} siswa tidak memiliki foto. Kartu tetap dapat dicetak.` });
    } else if (folder.students?.length) {
      checks.push({ level: 'valid', title: 'Seluruh Foto Siswa Lengkap', detail: '100% siswa sudah memiliki foto terpasang.' });
    }

    return checks;
  },

  renderCardHtml(state, folder, student, template) {
    BindingService.autoBindTemplate(template, folder.excelMeta);
    const pxPerMm = 3.7795275591;
    const wPx = Math.round(template.widthMm * pxPerMm);
    const hPx = Math.round(template.heightMm * pxPerMm);
    const schoolLogo = state.schoolProfile?.logoDataUrl || '';
    const exam = (state.exams || []).find(item => item.id === folder.examId);
    const cardStudent = { ...student, examFields: BindingService.getExamFields(exam) };

    const elementsHtml = (template.elements || []).map(el => {
      const styleBase = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;box-sizing:border-box;transform:rotate(${el.rotation || 0}deg);overflow:hidden;`;
      if (el.kind === 'photo') {
        const photoObj = PhotoService.resolveStudentPhoto(folder, student, el.header);
        if (photoObj) {
          const c = student.crop || { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 };
          return `<div data-element-id="${escapeHtml(el.id)}" style="${styleBase}border:1px solid #cbd5e1;background:#f8fafc;">
            <img src="${photoObj.dataUrl}" alt="Foto" style="width:100%;height:100%;object-fit:cover;transform:scale(${c.zoom}) translate(${c.offsetX}px,${c.offsetY}px) rotate(${c.rotation}deg);" />
          </div>`;
        }
        return '';
      }
      if (el.kind === 'logo') {
        return schoolLogo
          ? `<div data-element-id="${escapeHtml(el.id)}" style="${styleBase}"><img src="${schoolLogo}" alt="Logo" style="width:100%;height:100%;object-fit:contain;" /></div>`
          : `<div style="${styleBase}border:1px dashed #cbd5e1;display:grid;place-items:center;font-size:8px;color:#94a3b8;">LOGO</div>`;
      }
      if (el.kind === 'qr') {
        const value = BindingService.resolveElementValue({ ...el, kind: 'dynamic' }, cardStudent, folder.excelMeta, '');
        return `<div data-element-id="${escapeHtml(el.id)}" class="card-qr" data-qr-value="${escapeHtml(value)}" aria-label="Kode QR peserta" style="${styleBase}display:grid;place-items:center;background:#fff;padding:2px;"></div>`;
      }
      const textVal = BindingService.resolveElementValue(el, cardStudent, folder.excelMeta, '-');
      return `<div data-element-id="${escapeHtml(el.id)}" style="${styleBase}padding:2px 4px;font-size:${el.fontSize || 11}px;font-weight:${el.fontWeight || '500'};color:${el.color || '#0f172a'};text-align:${el.align || 'left'};line-height:1.25;white-space:nowrap;text-overflow:ellipsis;">${escapeHtml(textVal)}</div>`;
    }).join('');

    const bgStyle = template.bgImage
      ? `background-image:url('${template.bgImage}');background-size:cover;background-position:center;`
      : `background:${template.bgColor || '#ffffff'};border-top:4px solid ${template.accentColor || '#0f2347'};`;

    return `<div class="generated-exam-card" style="width:${template.widthMm}mm;height:${template.heightMm}mm;position:relative;border:0.3mm solid #cbd5e1;box-sizing:border-box;overflow:hidden;${bgStyle}">
      <div style="width:${wPx}px;height:${hPx}px;position:relative;">${elementsHtml}</div>
    </div>`;
  }
};
