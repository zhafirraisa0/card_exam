/**
 * Dynamic Variable Binding Service:
 * Menghasilkan daftar variabel murni berdasarkan kolom Excel aktif
 * dan memvalidasi apakah sumber file/sheet/kolom masih cocok.
 */
export const BindingService = {
  getExamVariables(exam) {
    if (!exam) return [];
    return [
      ['@exam:name', 'Nama Kegiatan Ujian'], ['@exam:type', 'Jenis Ujian'],
      ['@exam:year', 'Tahun Pelajaran'], ['@exam:semester', 'Semester Ujian'], ['@exam:date', 'Tanggal Ujian']
    ].map(([bindingKey, originalHeader]) => ({ variableId: bindingKey, bindingKey, originalHeader, source: 'exam' }));
  },
  getExamFields(exam) {
    if (!exam) return {};
    return {
      '@exam:name': exam.name || '', '@exam:type': exam.type || '', '@exam:year': exam.academicYear || '',
      '@exam:semester': exam.semester || '', '@exam:date': exam.examDate || ''
    };
  },

  isPhotoHeader(header) {
    const value = String(header || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return /(^| )(foto|photo|gambar|image|pas foto)( |$)/.test(value);
  },

  getAvailableVariables(excelMeta) {
    if (!excelMeta || !Array.isArray(excelMeta.columns)) return [];
    return excelMeta.columns.map(col => ({
      variableId: col.variableId,
      sourceFile: excelMeta.fileName,
      worksheet: excelMeta.worksheet,
      originalHeader: col.originalHeader,
      columnIndex: col.columnIndex,
      token: `{{${col.originalHeader}}}`
    }));
  },

  autoBindTemplate(template, excelMeta) {
    const headers = (excelMeta?.columns || []).map(column => column.originalHeader).filter(Boolean);
    if (!template?.elements?.length || !headers.length) return 0;
    const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normalized = headers.map(header => ({ header, value: norm(header) }));
    let changed = 0;
    for (const element of template.elements) {
      if (!['dynamic', 'qr'].includes(element.kind)) continue;
      if (String(element.header || '').startsWith('@exam:')) continue;
      if (headers.includes(element.header) && !element.autoBound) continue;
      const label = norm(element.label || element.header);
      const find = patterns => normalized.find(item => patterns.some(pattern => pattern.test(item.value)))?.header;
      let target = normalized.find(item => item.value === label)?.header;
      if (!target && /\b(nama|name)\b/.test(label)) target = find([/\bnama\b/, /\bname\b/]) || headers[0];
      if (!target && /(nisn|nis|induk|nomor|peserta|id siswa)/.test(label)) target = find([/^nis$/, /nisn/, /nomor .*peserta/, /no .*peserta/, /nomor .*induk/, /no .*induk/, /id .*siswa/]);
      if (!target && /(username|user name|akun|login)/.test(label)) target = find([/username/, /user name/, /akun/, /login/]);
      if (!target && /(password|kata sandi|sandi|passcode)/.test(label)) target = find([/password/, /kata sandi/, /sandi/, /passcode/]);
      if (!target && element.kind === 'qr') target = find([/^nis$/, /nisn/, /nomor .*peserta/, /no .*peserta/, /id .*siswa/]);
      if (!target) {
        const tokens = label.split(' ').filter(token => token.length > 2);
        const scored = normalized.map(item => ({ ...item, score: tokens.filter(token => item.value.includes(token)).length })).sort((a, b) => b.score - a.score);
        if (scored[0]?.score) target = scored[0].header;
      }
      if (target && (element.header !== target || !element.autoBound)) {
        element.header = target;
        element.autoBound = true;
        changed++;
      }
    }
    return changed;
  },

  resolveElementValue(element, student, excelMeta, emptyPlaceholder = '') {
    if (!element) return '';
    if (element.kind === 'static') return element.text || '';
    if (element.kind === 'dynamic') {
      if (!element.header) return `[Belum Terhubung]`;
      if (String(element.header).startsWith('@exam:')) {
        const value = student?.examFields?.[element.header];
        return value === '' || value === null || value === undefined ? emptyPlaceholder : String(value);
      }
      if (!student || !student.fields) return `{{${element.header}}}`;
      if (!Object.prototype.hasOwnProperty.call(student.fields, element.header)) {
        return `[Kolom Hilang: ${element.header}]`;
      }
      const val = student.fields[element.header];
      return val === '' || val === null || val === undefined ? emptyPlaceholder : String(val);
    }
    return '';
  },

  validateTemplateBindings(template, excelMeta) {
    const issues = [];
    const availableHeaders = new Set((excelMeta?.columns || []).map(c => c.originalHeader));

    (template?.elements || []).forEach(el => {
      if (el.kind === 'dynamic' || el.kind === 'qr') {
        if (String(el.header || '').startsWith('@exam:')) return;
        if (!el.header) {
          issues.push({ level: 'error', elementId: el.id, message: `Elemen "${el.label || el.kind}" belum dihubungkan ke kolom Excel.` });
        } else if (!availableHeaders.has(el.header)) {
          issues.push({ level: 'error', elementId: el.id, message: `Kolom sumber "${el.header}" tidak ditemukan pada Excel kelas ini.` });
        }
      }
    });
    return issues;
  }
};
