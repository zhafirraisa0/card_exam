import { escapeHtml, showToast } from '../utils/helpers.js';
import { FolderService } from '../services/folderService.js';
import { ExcelService } from '../services/excelService.js';
import { PhotoService } from '../services/photoService.js';
import { StorageService } from '../services/storageService.js';
import { CloudService } from '../services/cloudService.js';
import { BindingService } from '../services/bindingService.js';

let tempWorkbook = null;

export function renderStudentsPage(state) {
  const folder = FolderService.getActiveFolder(state);
  if (!folder) return `<div class="panel"><div class="empty-state"><strong>Buat atau pilih kelas terlebih dahulu.</strong><p>Data siswa selalu diimpor ke rombongan belajar yang dipilih.</p><button type="button" class="btn btn-primary" data-goto="folders">Pilih tingkat & kelas</button></div></div>`;
  const headers = folder.excelMeta?.columns?.map(column => column.originalHeader) || [];
  const total = folder.students?.length || 0;
  const hasClassData = total > 0 || Boolean(folder.excelMeta) || Boolean(folder.photos?.length);
  return `<div>
    <section class="page-intro"><div><span class="eyebrow">DATA SISWA · ${escapeHtml(folder.level)}</span><h1>${escapeHtml(folder.className)}</h1><p>Unggah Excel untuk mengisi daftar siswa. Kolom Excel dapat digunakan sebagai variabel pada desain kartu.</p></div><span class="intro-count">${total} siswa</span></section>
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><div><h2 class="panel-title">Impor data dari Excel</h2><div style="font-size:12.5px;color:#64748b">File diproses di browser ini. Format yang didukung: XLSX, XLS, dan CSV. Gambar yang ditempel pada baris siswa di XLSX ikut diimpor; nama file pada kolom Foto dapat dicocokkan dengan unggahan folder.</div></div><button type="button" class="btn btn-danger btn-sm" id="btn-clear-class-data" ${hasClassData ? '' : 'disabled'}>Hapus data kelas ini</button>
        <select class="select" id="sel-student-folder" aria-label="Pilih kelas" style="width:auto;min-width:190px">${state.folders.map(item => `<option value="${item.folderId}" ${item.folderId === folder.folderId ? 'selected' : ''}>${escapeHtml(item.level)} · ${escapeHtml(item.className)}</option>`).join('')}</select>
      </div>
      <div class="grid-3">
        <div class="form-group"><label class="form-label" for="inp-excel-file">1 · Pilih berkas (maks. 25 MB)</label><label class="file-drop" for="inp-excel-file"><span class="file-drop-icon">↑</span><strong>Pilih file dari komputer</strong><span>XLSX · XLS · CSV</span><input type="file" id="inp-excel-file" accept=".xlsx,.xls,.csv" /></label></div>
        <div class="form-group"><label class="form-label" for="sel-excel-sheet">2 · Worksheet</label><select class="select" id="sel-excel-sheet" ${!tempWorkbook ? 'disabled' : ''}>${tempWorkbook ? tempWorkbook.sheetNames.map(sheet => `<option value="${escapeHtml(sheet)}">${escapeHtml(sheet)}</option>`).join('') : `<option>${escapeHtml(folder.excelMeta?.worksheet || 'Pilih file Excel dahulu')}</option>`}</select></div>
        <div class="form-group"><label class="form-label" for="inp-header-row">3 · Baris judul kolom</label><div style="display:flex;gap:8px"><input type="number" class="input" id="inp-header-row" min="1" value="${folder.excelMeta?.headerRowNumber || 1}"/><button type="button" class="btn btn-primary" id="btn-apply-sheet" ${!tempWorkbook ? 'disabled' : ''}>Terapkan</button></div></div>
      </div>
      <div id="excel-import-status" class="import-status" role="status" aria-live="polite">Pilih kelas yang benar sebelum mengimpor data.</div>
      ${headers.length ? `<div class="variable-list"><strong>${headers.length} kolom tersedia untuk desain kartu</strong><div>${headers.map(header => `<span class="badge badge-blue">{{${escapeHtml(header)}}}</span>`).join('')}</div></div>` : ''}
    </div>
    <div class="panel"><div class="panel-header"><h2 class="panel-title">Daftar siswa <span class="count-muted">${total}</span></h2><input type="search" class="input" id="inp-search-student" placeholder="Cari nama atau data siswa…" style="max-width:280px" ${!total ? 'disabled' : ''}/></div>
      ${total ? `<div class="table-wrap"><table><thead><tr><th>No.</th>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}<th>Foto</th></tr></thead><tbody id="tbody-students">${folder.students.map((student, index) => `<tr data-search="${escapeHtml(Object.values(student.fields || {}).join(' ').toLowerCase())}"><td>${index + 1}</td>${headers.map(header => `<td>${escapeHtml(student.fields?.[header] ?? '')}</td>`).join('')}<td>${student.photoId ? '<span class="badge badge-green">Terpasang</span>' : '<span class="badge badge-amber">Belum ada</span>'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><strong>Belum ada data di kelas ini.</strong><p>Impor daftar siswa dengan memilih berkas Excel di atas.</p></div>`}
    </div>
  </div>`;
}

export function bindStudentsEvents(state, rerender) {
  const status = () => document.getElementById('excel-import-status');
  const picker = document.getElementById('inp-excel-file');
  const sheetSelect = document.getElementById('sel-excel-sheet');
  const applyButton = document.getElementById('btn-apply-sheet');
  document.getElementById('sel-student-folder')?.addEventListener('change', event => {
    state.activeFolderId = event.target.value;
    tempWorkbook = null;
    StorageService.save(state);
    rerender();
  });

  document.getElementById('btn-clear-class-data')?.addEventListener('click', () => {
    const folder = FolderService.getActiveFolder(state);
    if (!folder || !confirm(`Hapus data Excel, ${folder.students?.length || 0} siswa, dan seluruh foto dari ${folder.level} ${folder.className}? Tingkat dan rombel tetap disimpan.`)) return;
    FolderService.clearFolderData(state, folder.folderId);
    tempWorkbook = null;
    const saved = StorageService.save(state);
    if (!saved) return showToast('Data sudah dikosongkan, tetapi browser gagal menyimpan perubahan.', 'error');
    showToast(`Data pada ${folder.className} berhasil dihapus. Rombel tetap tersedia.`, 'success');
    rerender();
  });

  const applyExtraction = async () => {
    const folder = FolderService.getActiveFolder(state);
    if (!tempWorkbook || !folder) return;
    try {
      const headerRow = Number(document.getElementById('inp-header-row')?.value || 1);
      if (!Number.isInteger(headerRow) || headerRow < 1) throw new Error('Baris judul kolom harus berupa angka minimal 1.');
      const selectedSheet = sheetSelect?.value || tempWorkbook.sheetNames[0];
      const extracted = ExcelService.extractSheetData(tempWorkbook, selectedSheet, headerRow);
      const embedded = await ExcelService.extractEmbeddedPhotos(tempWorkbook, selectedSheet);
      let embeddedPhotos = [];
      if (embedded.length) {
        const prepared = await PhotoService.readPhotoFiles(embedded.map(item => item.file));
        const byName = new Map(embedded.map(item => [item.file.name, item.rowNumber]));
        embeddedPhotos = prepared.map(photo => ({ ...photo, source: 'excel-embedded', rowNumber: byName.get(photo.fileName) })).filter(photo => photo.rowNumber);
      }
      const previousMeta = folder.excelMeta; const previousStudents = folder.students; const previousPhotos = folder.photos || [];
      const previousPhotoMatches = (folder.photos || []).map(photo => [photo, photo.matchedStudentId]);
      folder.excelMeta = extracted;
      folder.students = extracted.students;
      folder.photos = [...previousPhotos.filter(photo => photo.source !== 'excel-embedded'), ...embeddedPhotos];
      const activeTemplate = state.templates.find(item => item.id === (folder.templateId || state.activeTemplateId));
      if (activeTemplate) BindingService.autoBindTemplate(activeTemplate, folder.excelMeta);
      if (folder.photos?.length) PhotoService.autoMatchFolderPhotos(folder);
      for (const photo of embeddedPhotos) {
        const student = folder.students.find(item => item.rowNumber === photo.rowNumber);
        if (student && !student.photoId) { student.photoId = photo.photoId; photo.matchedStudentId = student.studentId; }
      }
      const saved = StorageService.save(state);
      if (!saved) {
        folder.excelMeta = previousMeta; folder.students = previousStudents; folder.photos = previousPhotos;
        previousPhotoMatches.forEach(([photo, studentId]) => { photo.matchedStudentId = studentId; });
        throw new Error('Browser gagal menyimpan data. Kurangi ukuran Excel atau periksa ruang penyimpanan browser.');
      }
      if (!state.devBypassAuth) CloudService.log(state.operatorName, 'Impor data siswa', `Mengimpor ${extracted.students.length} data siswa Kelas ${folder.className}`).catch(error => console.error('Activity log:', error));
      showToast(`${extracted.students.length} siswa${embeddedPhotos.length ? ` dan ${embeddedPhotos.length} foto dari Excel` : ''} berhasil dimuat ke ${folder.className}.`, 'success');
      rerender();
    } catch (error) {
      const message = error.message || 'Data Excel tidak dapat digunakan.';
      if (status()) { status().className = 'import-status is-error'; status().textContent = message; }
      showToast(message, 'error');
    }
  };

  picker?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const drop = picker.closest('.file-drop');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Ukuran file melebihi batas 25 MB.');
      if (status()) { status().className = 'import-status is-loading'; status().textContent = `Membaca ${file.name}…`; }
      drop?.classList.add('is-loading');
      if (!/\.csv$/i.test(file.name) && typeof XLSX === 'undefined') throw new Error('Pustaka pembaca XLSX tidak termuat. Periksa koneksi internet, lalu muat ulang halaman. File CSV tetap dapat dibuka tanpa pustaka eksternal.');
      const buffer = await file.arrayBuffer();
      tempWorkbook = ExcelService.parseWorkbookBuffer(buffer, file.name);
      if (sheetSelect) sheetSelect.innerHTML = tempWorkbook.sheetNames.map(sheet => `<option value="${escapeHtml(sheet)}">${escapeHtml(sheet)}</option>`).join('');
      if (applyButton) applyButton.disabled = false;
      if (status()) { status().className = 'import-status'; status().textContent = `${file.name} · ${tempWorkbook.sheetNames.length} worksheet ditemukan. Pilih worksheet dan baris judul, lalu tekan Terapkan.`; }
      applyExtraction();
    } catch (error) {
      tempWorkbook = null;
      if (applyButton) applyButton.disabled = true;
      if (status()) { status().className = 'import-status is-error'; status().textContent = error.message || 'Gagal membaca file Excel.'; }
      showToast(error.message || 'Gagal membaca file Excel.', 'error');
    } finally {
      picker.value = '';
      drop?.classList.remove('is-loading');
    }
  });
  applyButton?.addEventListener('click', applyExtraction);
  document.getElementById('inp-search-student')?.addEventListener('input', event => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll('#tbody-students tr').forEach(row => { row.hidden = !(row.dataset.search || '').includes(query); });
  });
}
