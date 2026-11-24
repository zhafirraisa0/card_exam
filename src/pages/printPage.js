import { escapeHtml, showToast, uid } from '../utils/helpers.js';
import { FolderService } from '../services/folderService.js';
import { CardService } from '../services/cardService.js';
import { PdfService } from '../services/pdfService.js';
import { StorageService } from '../services/storageService.js';
import { BindingService } from '../services/bindingService.js';
import { PrintAssetService } from '../services/printAssetService.js';

export function getPrintSheetSize(config) {
  let width = config.paperSize === 'Custom' ? Number(config.customPaperW) : config.paperSize === 'F4' ? 215 : config.paperSize === 'A5' ? 148 : 210;
  let height = config.paperSize === 'Custom' ? Number(config.customPaperH) : config.paperSize === 'F4' ? 330 : config.paperSize === 'A5' ? 210 : 297;
  if (!Number.isFinite(width) || width < 80) width = 210;
  if (!Number.isFinite(height) || height < 100) height = 297;
  if (config.orientation === 'landscape' && height > width) [width, height] = [height, width];
  if (config.orientation !== 'landscape' && width > height) [width, height] = [height, width];
  return { width, height };
}

export function getEffectivePrintLayout(config, template) {
  const sheet = getPrintSheetSize(config);
  const marginMm = Math.min(30, Math.max(0, Number(config.marginMm) || 0));
  const gapMm = Math.min(15, Math.max(0, Number(config.gapMm) || 0));
  const availableW = sheet.width - marginMm * 2;
  const availableH = sheet.height - marginMm * 2;
  let cardW = Math.max(10, Number(config.cardW) || Number(template.widthMm));
  let cardH = Math.max(10, Number(config.cardH) || Number(template.heightMm));
  let cols; let rows; let gridValuesValid = true;

  if (config.autoCapacity !== false) {
    cols = Math.min(20, Math.max(1, Math.floor((availableW + gapMm + 0.0001) / (cardW + gapMm))));
    rows = Math.min(30, Math.max(1, Math.floor((availableH + gapMm + 0.0001) / (cardH + gapMm))));
  } else {
    const rawCols = Number(config.cols) || 1; const rawRows = Number(config.rows) || 1;
    gridValuesValid = Number.isInteger(rawCols) && rawCols >= 1 && rawCols <= 20 && Number.isInteger(rawRows) && rawRows >= 1 && rawRows <= 30;
    cols = Math.min(20, Math.max(1, Math.floor(rawCols)));
    rows = Math.min(30, Math.max(1, Math.floor(rawRows)));
    if (config.fitCards !== false) {
      const maxW = (availableW - gapMm * (cols - 1)) / cols;
      const maxH = (availableH - gapMm * (rows - 1)) / rows;
      const scale = Math.min(maxW / Number(template.widthMm), maxH / Number(template.heightMm));
      if (Number.isFinite(scale) && scale > 0) {
        cardW = Number(template.widthMm) * scale;
        cardH = Number(template.heightMm) * scale;
      }
    }
  }

  const capacity = cols * rows;
  const usedW = cols * cardW + (cols - 1) * gapMm;
  const usedH = rows * cardH + (rows - 1) * gapMm;
  return { ...sheet, marginMm, gapMm, cardW, cardH, cols, rows, capacity, usedW, usedH, availableW, availableH, fits: gridValuesValid && usedW <= availableW + 0.01 && usedH <= availableH + 0.01 };
}

export function printGridFits(config, template) {
  return getEffectivePrintLayout(config, template).fits;
}

function renderPrintControls(state, folder, template, layout, bindingIssues, { assetOnly = false } = {}) {
  const config = state.printConfig;
  const studentCount = folder.students?.length || 0;
  const assetCount = folder.printAssets?.length || 0;
  const imageCount = (folder.printAssets || []).filter(file => String(file.mimeType || '').startsWith('image/')).length;
  const assetMode = assetOnly || (folder.printSource === 'assets' && assetCount > 0);
  const totalPages = Math.ceil((assetMode ? imageCount : studentCount) / layout.capacity);
  const canPrint = layout.fits && (assetMode ? imageCount > 0 || (assetCount > 0 && imageCount === 0) : studentCount > 0 && bindingIssues.length === 0);
  const custom = config.paperSize === 'Custom';
  const autoCapacity = config.autoCapacity !== false;
  const fitCards = config.fitCards !== false;
  return `<section class="page-intro print-page-heading"><div><span class="eyebrow">PRODUKSI KARTU</span><h1>Cetak kartu</h1><p>${escapeHtml(folder.level)} / ${escapeHtml(folder.className)}${assetOnly ? ' / file kartu siap cetak' : ` / ${studentCount} peserta`}</p></div></section>
    ${bindingIssues.length ? `<div class="import-status is-error print-binding-warning">${bindingIssues.map(issue => escapeHtml(issue.message)).join(' ')} Periksa desain dan kolom Excel sebelum mencetak.</div>` : ''}
    <section class="panel print-settings print-essentials">
      <div class="print-controls-heading"><div><h2 class="panel-title">Kertas dan kapasitas</h2><p class="muted-copy" style="margin:4px 0 0">Pengaturan kertas, margin, jarak, ukuran kartu, dan kapasitas sama untuk semua kelas.</p></div><div class="print-actions"><button type="button" class="btn btn-outline" id="btn-export-print-config">Ekspor konfigurasi</button>${assetMode ? '' : `<button type="button" class="btn btn-outline" id="btn-download-pdf" ${canPrint ? '' : 'disabled'}>Unduh PDF</button>`}<button type="button" class="btn btn-primary print-action-button" id="btn-browser-print" ${canPrint ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/></svg><span>Cetak kartu</span></button></div></div>
      <div class="print-library-selectors"><div class="form-group"><label class="form-label" for="prt-class">Pilih kelas</label><select class="select" id="prt-class">${state.folders.map(item => `<option value="${escapeHtml(item.folderId)}" ${item.folderId === folder.folderId ? 'selected' : ''}>${escapeHtml(item.level)} · ${escapeHtml(item.className)}</option>`).join('')}</select></div>${renderPrintExamSelector(state, folder)}<div class="form-group"><label class="form-label" for="prt-template">Desain kartu tersimpan</label><div class="print-template-picker"><select class="select" id="prt-template">${state.templates.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === template.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select><button type="button" class="btn btn-outline btn-sm" id="btn-delete-print-template" ${state.templates.length <= 1 ? 'disabled' : ''}>Hapus desain</button></div></div>${!assetOnly && studentCount && assetCount ? `<div class="form-group"><label class="form-label" for="prt-print-source">Sumber kartu</label><select class="select" id="prt-print-source"><option value="students" ${folder.printSource !== 'assets' ? 'selected' : ''}>Data siswa (${studentCount})</option><option value="assets" ${folder.printSource === 'assets' ? 'selected' : ''}>Folder kartu siap cetak (${assetCount})</option></select></div>` : ''}</div>
      <div class="print-settings-grid">
        <div class="form-group"><label class="form-label" for="prt-paper">Ukuran kertas</label><select class="select" id="prt-paper"><option value="A4" ${config.paperSize === 'A4' ? 'selected' : ''}>A4 · 210 × 297 mm</option><option value="F4" ${config.paperSize === 'F4' ? 'selected' : ''}>F4 · 215 × 330 mm</option><option value="A5" ${config.paperSize === 'A5' ? 'selected' : ''}>A5 · 148 × 210 mm</option><option value="Custom" ${custom ? 'selected' : ''}>Ukuran kustom</option></select></div>
        ${custom ? `<div class="form-group"><label class="form-label" for="prt-custom-w">Lebar kertas (mm)</label><input type="number" min="80" max="500" id="prt-custom-w" class="input" value="${config.customPaperW}"/></div><div class="form-group"><label class="form-label" for="prt-custom-h">Tinggi kertas (mm)</label><input type="number" min="100" max="500" id="prt-custom-h" class="input" value="${config.customPaperH}"/></div>` : ''}
        <div class="form-group"><label class="form-label" for="prt-orientation">Orientasi</label><select class="select" id="prt-orientation"><option value="portrait" ${config.orientation !== 'landscape' ? 'selected' : ''}>Potret</option><option value="landscape" ${config.orientation === 'landscape' ? 'selected' : ''}>Lanskap</option></select></div>
        <div class="form-group"><label class="form-label" for="prt-margin">Margin (mm)</label><input type="number" class="input" id="prt-margin" min="0" max="30" step="1" value="${layout.marginMm}"/></div>
        <div class="form-group"><label class="form-label" for="prt-gap">Jarak antar kartu (mm)</label><input type="number" class="input" id="prt-gap" min="0" max="15" step="0.5" value="${layout.gapMm}"/></div>
        <div class="form-group"><label class="form-label" for="prt-card-w">Lebar kartu (mm)</label><input type="number" class="input" id="prt-card-w" min="10" max="210" step="0.1" value="${layout.cardW.toFixed(2)}" ${!autoCapacity && fitCards ? 'disabled' : ''}/></div>
        <div class="form-group"><label class="form-label" for="prt-card-h">Tinggi kartu (mm)</label><input type="number" class="input" id="prt-card-h" min="10" max="330" step="0.1" value="${layout.cardH.toFixed(2)}" ${!autoCapacity && fitCards ? 'disabled' : ''}/></div>
        <div class="form-group"><label class="form-label" for="prt-cols">Kolom</label><input type="number" class="input" id="prt-cols" min="1" max="20" step="1" value="${layout.cols}" ${autoCapacity ? 'disabled' : ''}/></div>
        <div class="form-group"><label class="form-label" for="prt-rows">Baris</label><input type="number" class="input" id="prt-rows" min="1" max="30" step="1" value="${layout.rows}" ${autoCapacity ? 'disabled' : ''}/></div>
      </div>
      <div class="print-check-options"><label class="check"><input type="checkbox" id="prt-auto-capacity" ${autoCapacity ? 'checked' : ''}/> Kapasitas otomatis</label><label class="check"><input type="checkbox" id="prt-fit-cards" ${fitCards ? 'checked' : ''}/> Sesuaikan ukuran kartu otomatis dengan baris/kolom</label></div>
      <div class="print-summary ${layout.fits ? '' : 'is-error'}" role="status">${layout.fits ? `${layout.width} × ${layout.height} mm · ${layout.cols} kolom × ${layout.rows} baris · ${layout.capacity} kartu/lembar · ${totalPages} lembar · kartu ${layout.cardW.toFixed(2)} × ${layout.cardH.toFixed(2)} mm.` : `Susunan ${layout.usedW.toFixed(1)} × ${layout.usedH.toFixed(1)} mm melebihi area kertas ${layout.availableW.toFixed(1)} × ${layout.availableH.toFixed(1)} mm. Kurangi baris, kolom, ukuran kartu, atau margin.`}</div>
      <div class="print-config-note">Ekspor konfigurasi menyimpan ukuran kertas, orientasi, margin, jarak, ukuran kartu, dan mode kapasitas ke berkas JSON. Data siswa dan foto tidak ikut disimpan.</div>
    </section>`;
}

export function renderPrintPage(state) {
  const folder = FolderService.getActiveFolder(state);
  if (!folder) return `<div class="panel"><div class="empty-state"><strong>Pilih atau buat ruang kelas terlebih dahulu.</strong><p>Data siswa dan desain kartu dikelola per kelas.</p><button type="button" class="btn btn-primary" data-goto="folders">Pilih kelas</button></div></div>`;
  if (!folder.students?.length) return renderEmptyPrintClass(state, folder);
  const template = state.templates.find(item => item.id === (folder.templateId || state.activeTemplateId)) || state.templates[0];
  if (BindingService.autoBindTemplate(template, folder.excelMeta)) StorageService.save(state);
  const bindingIssues = BindingService.validateTemplateBindings(template, folder.excelMeta);
  const layout = getEffectivePrintLayout(state.printConfig, template);
  const perPage = layout.capacity;
  const pages = [];
  for (let index = 0; index < folder.students.length; index += perPage) pages.push(folder.students.slice(index, index + perPage));
  let style = document.getElementById('dynamic-print-page-size');
  if (!style) { style = document.createElement('style'); style.id = 'dynamic-print-page-size'; document.head.append(style); }
  style.textContent = `@page { size: ${layout.width}mm ${layout.height}mm; margin: 0; }`;
  const sx = layout.cardW / template.widthMm; const sy = layout.cardH / template.heightMm;
  return `<div class="print-page print-workspace">
    <aside class="print-control-rail">${renderPrintControls(state, folder, template, layout, bindingIssues)}${renderReadyCardPanel(folder, template)}${renderReadyFolderPanel(folder)}</aside>
    <section class="print-preview-column"><header class="print-preview-heading"><div><span class="eyebrow">PRATINJAU LANGSUNG</span><h2>${escapeHtml(template.name)}</h2><p>${layout.capacity} kartu per lembar / ${pages.length} lembar</p></div><span class="print-preview-size">${layout.width} x ${layout.height} mm</span></header>
    <div id="print-output-area" class="print-output-area" style="--print-width:${layout.width}mm;--print-height:${layout.height}mm">${pages.map((students, pageIndex) => `<section class="print-sheet" data-sheet-index="${pageIndex}" data-last-sheet="${pageIndex === pages.length - 1 ? 'true' : 'false'}" style="--sheet-width:${layout.width}mm;--sheet-height:${layout.height}mm;--sheet-padding:${layout.marginMm}mm;--card-width:${layout.cardW}mm;--card-height:${layout.cardH}mm;--grid-gap:${layout.gapMm}mm;grid-template-columns:repeat(${layout.cols}, ${layout.cardW}mm);">${students.map(student => `<div class="print-card" style="width:${layout.cardW}mm;height:${layout.cardH}mm;overflow:hidden"><div class="print-card-scaled" style="width:${template.widthMm}mm;height:${template.heightMm}mm;transform:scale(${sx},${sy});transform-origin:top left">${CardService.renderCardHtml(state, folder, student, template)}</div></div>`).join('')}</section>`).join('')}</div></section>
  </div>`;
}

function renderReadyCardPanel(folder, template) {
  const matched = folder.students?.filter(student => student.photoId).length || 0;
  return `<section class="panel print-ready-card"><div class="print-ready-mark" aria-hidden="true">&#10003;</div><div class="print-ready-copy"><span class="eyebrow">KARTU SIAP DICETAK</span><h2>${escapeHtml(template.name)}</h2><p>${folder.students.length} peserta / ${matched} foto terpasang / ${folder.students.length - matched} tanpa foto</p></div><div class="print-ready-actions"><button type="button" class="btn btn-outline btn-sm" data-goto="templates">Edit template</button><button type="button" class="text-button" data-goto="photos">Kelola foto</button></div></section>`;
}

function renderReadyFolderPanel(folder) {
  return `<section class="print-ready-assets print-ready-assets-rail"><div class="print-ready-assets-heading"><div><span class="eyebrow">OPSIONAL · KARTU JADI</span><h2>Folder kartu siap cetak</h2><p>Gunakan file PDF/gambar yang sudah didesain. Bisa dipakai bersama data Excel atau sendiri.</p></div></div><label class="file-drop print-ready-folder-drop" for="prt-ready-folder"><span class="file-drop-icon">Folder</span><strong>Pilih folder kartu siap cetak</strong><span>PDF, JPG, PNG, WebP · maksimum 50 MB per file</span><input type="file" id="prt-ready-folder" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" webkitdirectory directory multiple /></label><div class="import-status" id="prt-ready-status" role="status" aria-live="polite">${folder.printAssets?.length || 0} file tersimpan untuk ${escapeHtml(folder.level)} / ${escapeHtml(folder.className)}.</div>${renderReadyAssetList(folder)}</section>`;
}

function renderPrintExamSelector(state, folder) {
  if (!state.exams?.length) return `<div class="print-exam-empty"><span class="form-label">Kegiatan ujian</span><span>Belum ada kegiatan ujian yang dapat dihubungkan.</span><button type="button" class="text-button" data-goto="exams">Buat kegiatan ujian</button></div>`;
  return `<div class="form-group"><label class="form-label" for="prt-exam">Kegiatan ujian untuk kartu ini</label><select class="select" id="prt-exam"><option value="">Tanpa kegiatan ujian</option>${state.exams.map(exam => `<option value="${escapeHtml(exam.id)}" ${folder.examId === exam.id ? 'selected' : ''}>${escapeHtml(exam.name)}</option>`).join('')}</select></div>`;
}

function renderReadyPrintSettings(state) {
  const config = state.printConfig; const template = state.templates.find(item => item.id === state.activeTemplateId) || state.templates[0];
  const layout = getEffectivePrintLayout(config, template);
  return `<details class="panel print-ready-layout"><summary><strong>Pengaturan kertas dan susunan</strong><span>${layout.width} x ${layout.height} mm ? ${layout.cols} kolom ? ${layout.rows} baris</span></summary><div class="print-ready-settings-body"><div class="print-settings-grid"><div class="form-group"><label class="form-label" for="prt-paper">Ukuran kertas</label><select class="select" id="prt-paper"><option value="A4" ${config.paperSize === 'A4' ? 'selected' : ''}>A4</option><option value="F4" ${config.paperSize === 'F4' ? 'selected' : ''}>F4</option><option value="A5" ${config.paperSize === 'A5' ? 'selected' : ''}>A5</option><option value="Custom" ${config.paperSize === 'Custom' ? 'selected' : ''}>Kustom</option></select></div><div class="form-group"><label class="form-label" for="prt-orientation">Orientasi</label><select class="select" id="prt-orientation"><option value="portrait" ${config.orientation !== 'landscape' ? 'selected' : ''}>Potret</option><option value="landscape" ${config.orientation === 'landscape' ? 'selected' : ''}>Lanskap</option></select></div><div class="form-group"><label class="form-label" for="prt-margin">Margin (mm)</label><input class="input" id="prt-margin" type="number" min="0" max="30" value="${layout.marginMm}"/></div><div class="form-group"><label class="form-label" for="prt-gap">Jarak kartu (mm)</label><input class="input" id="prt-gap" type="number" min="0" max="15" step="0.5" value="${layout.gapMm}"/></div><div class="form-group"><label class="form-label" for="prt-card-w">Lebar kartu (mm)</label><input class="input" id="prt-card-w" type="number" min="10" max="210" step="0.1" value="${layout.cardW.toFixed(2)}" ${config.autoCapacity === false && config.fitCards !== false ? 'disabled' : ''}/></div><div class="form-group"><label class="form-label" for="prt-card-h">Tinggi kartu (mm)</label><input class="input" id="prt-card-h" type="number" min="10" max="330" step="0.1" value="${layout.cardH.toFixed(2)}" ${config.autoCapacity === false && config.fitCards !== false ? 'disabled' : ''}/></div><div class="form-group"><label class="form-label" for="prt-cols">Kolom</label><input class="input" id="prt-cols" type="number" min="1" max="20" value="${layout.cols}" ${config.autoCapacity !== false ? 'disabled' : ''}/></div><div class="form-group"><label class="form-label" for="prt-rows">Baris</label><input class="input" id="prt-rows" type="number" min="1" max="30" value="${layout.rows}" ${config.autoCapacity !== false ? 'disabled' : ''}/></div></div><div class="print-check-options"><label class="check"><input type="checkbox" id="prt-auto-capacity" ${config.autoCapacity !== false ? 'checked' : ''}/> Kapasitas otomatis</label><label class="check"><input type="checkbox" id="prt-fit-cards" ${config.fitCards !== false ? 'checked' : ''}/> Sesuaikan ukuran kartu</label></div><div class="print-summary ${layout.fits ? '' : 'is-error'}">${layout.cols} kolom × ${layout.rows} baris · ${layout.capacity} kartu/lembar · ${layout.cardW.toFixed(2)} × ${layout.cardH.toFixed(2)} mm</div></div></div></details>`;
}

function renderEmptyDesignEditor(state, folder) {
  return `<section class="panel print-empty-design"><div class="print-ready-assets-heading"><div><span class="eyebrow">DESAIN KARTU KELAS</span><h2>Edit desain kapan saja</h2><p>Editor tersedia meskipun kelas belum memiliki Excel. Desain dan ukuran kertas tetap memakai pengaturan yang sama.</p></div></div><button type="button" class="btn btn-primary" data-goto="templates">Buka halaman edit kartu</button><p class="print-design-note">Pilih template pada panel kertas di atas. Folder kartu jadi dan desain template sama-sama dapat digunakan secara terpisah.</p></section>`;
}

function renderReadyAssetList(folder) {
  const files = [...(folder.printAssets || [])].sort((a, b) => a.fileName.localeCompare(b.fileName, 'id', { numeric: true, sensitivity: 'base' }));
  if (!files.length) return '<div class="print-ready-empty">Belum ada file kartu siap cetak pada kelas ini.</div>';
  const imageCount = files.filter(file => String(file.mimeType || '').startsWith('image/')).length;
  return `<div class="print-ready-batch"><div><strong>${files.length} file kartu tersimpan</strong><span>${imageCount ? `${imageCount} gambar siap dicetak melalui tombol Cetak kartu di atas` : 'PDF dibuka dalam pratinjau website untuk dicetak'} · khusus kelas ${escapeHtml(folder.className)}</span></div><div class="print-ready-batch-actions"><button type="button" class="btn btn-outline btn-sm" data-deduplicate-ready-files>Hapus duplikat</button><button type="button" class="btn btn-danger btn-sm" data-clear-ready-files>Hapus semua</button></div></div><details class="print-ready-details"><summary>Kelola file <span>${files.length}</span></summary><div class="print-ready-file-list">${files.map(file => `<article class="print-ready-file"><span class="print-ready-file-icon">${String(file.mimeType || '').includes('pdf') ? 'PDF' : 'IMG'}</span><div class="print-ready-file-meta"><strong>${escapeHtml(file.fileName)}</strong><small>${(Number(file.size || 0) / 1024 / 1024).toFixed(2)} MB</small></div>${String(file.mimeType || '').startsWith('image/') ? `<button type="button" class="btn btn-outline btn-sm" data-edit-ready-image="${escapeHtml(file.id)}">Edit</button>` : ''}<button type="button" class="btn btn-primary btn-sm" data-open-ready-file="${escapeHtml(file.id)}">${String(file.mimeType || '').startsWith('image/') ? 'Pratinjau' : 'Pratinjau / cetak'}</button><button type="button" class="btn btn-outline btn-sm" data-remove-ready-file="${escapeHtml(file.id)}">Hapus</button></article>`).join('')}</div></details>`;
}

function renderEmptyPrintClass(state, folder) {
  const template = state.templates.find(item => item.id === (folder.templateId || state.activeTemplateId)) || state.templates[0];
  const layout = getEffectivePrintLayout(state.printConfig, template);
  const imageFiles = (folder.printAssets || []).filter(file => String(file.mimeType || '').startsWith('image/'));
  const pdfCount = (folder.printAssets || []).filter(file => String(file.mimeType || '').includes('pdf')).length;
  const previewStyle = `--preview-cols:${layout.cols};--preview-rows:${layout.rows};--preview-margin-x:${layout.marginMm / layout.width * 100}%;--preview-margin-y:${layout.marginMm / layout.height * 100}%;--preview-gap-x:${layout.gapMm / layout.width * 100}%;--preview-gap-y:${layout.gapMm / layout.height * 100}%;--preview-card-ratio:${layout.cardW}/${layout.cardH}`;
  const previewCards = Array.from({ length: layout.capacity }, (_, index) => `<div class="print-ready-preview-card" data-ready-preview-index="${index}">${index < imageFiles.length ? '<span>Memuat kartu…</span>' : ''}</div>`).join('');
  return `<div class="print-page print-workspace print-assets-workspace">
    <aside class="print-control-rail">${renderPrintControls(state, folder, template, layout, [], { assetOnly: true })}${renderReadyFolderPanel(folder)}
      ${renderEmptyDesignEditor(state, folder)}<div class="print-empty-student-note"><strong>Excel juga opsional.</strong><p>Impor data siswa bila ingin membuat kartu dari variabel. Untuk kartu jadi, pilih folder di atas.</p><button type="button" class="btn btn-outline" data-goto="students">Buka Data Siswa</button></div>
    </aside>
    <section class="print-preview-column"><header class="print-preview-heading"><div><span class="eyebrow">PRATINJAU KERTAS LANGSUNG</span><h2>${escapeHtml(folder.level)} / ${escapeHtml(folder.className)}</h2><p>${imageFiles.length} gambar kartu · ${pdfCount} PDF dibuka untuk dicetak terpisah · ${layout.capacity} slot per lembar</p></div><span class="print-preview-size">${layout.width} × ${layout.height} mm</span></header><div id="print-output-area" class="print-output-area print-ready-output" style="--print-width:${layout.width}mm;--print-height:${layout.height}mm"><section class="print-ready-sheet" style="aspect-ratio:${layout.width} / ${layout.height};${previewStyle}"><div class="print-ready-paper-grid">${previewCards}</div></section><p class="print-ready-preview-note">${imageFiles.length ? `Pratinjau lembar 1 dari ${Math.max(1, Math.ceil(imageFiles.length / layout.capacity))}.` : 'Kertas pratinjau tersedia. Unggah gambar kartu jadi atau gunakan desain kartu untuk melihat isi.'} ${pdfCount ? `${pdfCount} file PDF dicetak terpisah dari daftar file.` : ''}</p></div></section>
  </div>`;
}

let readyPreviewUrls = [];
async function hydrateReadyPaperPreview(folder, state) {
  readyPreviewUrls.forEach(url => URL.revokeObjectURL(url)); readyPreviewUrls = [];
  const grid = document.querySelector('.print-ready-paper-grid');
  if (!grid) return;
  const template = state.templates.find(item => item.id === (folder.templateId || state.activeTemplateId)) || state.templates[0];
  const layout = getEffectivePrintLayout(state.printConfig, template);
  const images = (folder.printAssets || []).filter(file => String(file.mimeType || '').startsWith('image/')).slice(0, layout.capacity);
  await Promise.all(images.map(async (file, index) => {
    const target = grid.querySelector(`[data-ready-preview-index="${index}"]`);
    if (!target) return;
    const record = await PrintAssetService.getFile(file.id).catch(() => null);
    if (!record) { target.textContent = 'File tidak tersedia'; return; }
    const url = URL.createObjectURL(record.blob); readyPreviewUrls.push(url);
    const image = document.createElement('img'); image.src = url; image.alt = file.fileName; image.draggable = false;
    target.replaceChildren(image);
  }));
}

async function printReadyAssetsOnCurrentPage(folder, state, template) {
  const images = (folder.printAssets || []).filter(file => String(file.mimeType || '').startsWith('image/'));
  if (!images.length) {
    const pdf = (folder.printAssets || []).find(file => String(file.mimeType || '').includes('pdf'));
    if (!pdf) throw new Error('Folder kartu ini belum memiliki gambar atau PDF yang dapat dicetak.');
    openReadyAssetPreview(await PrintAssetService.getFile(pdf.id));
    return;
  }
  const records = await Promise.all(images.map(file => PrintAssetService.getFile(file.id)));
  if (records.some(record => !record)) throw new Error('Ada file kartu yang tidak ditemukan di penyimpanan browser.');
  const layout = getEffectivePrintLayout(state.printConfig, template);
  if (!layout.fits) throw new Error('Susunan kartu melebihi area kertas. Kurangi margin atau kapasitas baris/kolom.');
  const output = document.getElementById('print-output-area');
  if (!output) throw new Error('Area cetak kartu tidak ditemukan pada halaman ini.');
  const originalMarkup = output.innerHTML; const urls = [];
  try {
    const cards = records.map((record, index) => {
      const url = URL.createObjectURL(record.blob); urls.push(url);
      return `<div class="print-card" style="width:${layout.cardW}mm;height:${layout.cardH}mm;overflow:hidden"><img src="${url}" alt="${escapeHtml(images[index].fileName)}" style="display:block;width:100%;height:100%;object-fit:contain" /></div>`;
    });
    const pages = [];
    for (let start = 0; start < cards.length; start += layout.capacity) {
      const pageIndex = pages.length;
      pages.push(`<section class="print-sheet" data-sheet-index="${pageIndex}" data-last-sheet="${start + layout.capacity >= cards.length}" style="--sheet-width:${layout.width}mm;--sheet-height:${layout.height}mm;--sheet-padding:${layout.marginMm}mm;--card-width:${layout.cardW}mm;--card-height:${layout.cardH}mm;--grid-gap:${layout.gapMm}mm;grid-template-columns:repeat(${layout.cols},${layout.cardW}mm)">${cards.slice(start, start + layout.capacity).join('')}</section>`);
    }
    output.innerHTML = pages.join('');
    let pageStyle = document.getElementById('dynamic-print-page-size');
    if (!pageStyle) { pageStyle = document.createElement('style'); pageStyle.id = 'dynamic-print-page-size'; document.head.append(pageStyle); }
    pageStyle.textContent = `@page { size: ${layout.width}mm ${layout.height}mm; margin: 0; }`;
    await Promise.all(Array.from(output.querySelectorAll('img')).map(image => image.decode()));
    if (document.fonts?.ready) await document.fonts.ready;
    let restored = false;
    const restore = () => {
      if (restored) return; restored = true;
      output.innerHTML = originalMarkup;
      urls.forEach(url => URL.revokeObjectURL(url));
      if (!folder.students?.length) hydrateReadyPaperPreview(folder, state);
      fitPrintPreview();
    };
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
    setTimeout(restore, 60 * 1000);
  } catch (error) {
    output.innerHTML = originalMarkup;
    urls.forEach(url => URL.revokeObjectURL(url));
    throw error;
  }
}

function openReadyAssetPreview(record) {
  if (!record) throw new Error('File kartu tidak ditemukan.');
  const root = document.getElementById('modal-root');
  if (!root) throw new Error('Panel pratinjau file tidak tersedia.');
  const url = URL.createObjectURL(record.blob);
  const isPdf = String(record.mimeType || '').includes('pdf');
  root.innerHTML = `<div class="modal-backdrop ready-asset-modal"><section class="modal-box"><header class="ready-asset-modal-heading"><h2>${escapeHtml(record.fileName)}</h2><button type="button" class="btn btn-outline btn-sm" data-close-ready-preview>Tutup</button></header><div class="ready-asset-modal-content">${isPdf ? `<iframe title="Pratinjau ${escapeHtml(record.fileName)}" src="${url}"></iframe>` : `<img src="${url}" alt="${escapeHtml(record.fileName)}"/>`}</div><footer class="ready-asset-modal-actions"><button type="button" class="btn btn-primary" data-print-ready-preview> Cetak file</button></footer></section></div>`;
  root.querySelector('[data-close-ready-preview]')?.addEventListener('click', () => { root.replaceChildren(); URL.revokeObjectURL(url); });
  root.querySelector('[data-print-ready-preview]')?.addEventListener('click', () => {
    const frame = root.querySelector('iframe');
    if (frame?.contentWindow) frame.contentWindow.print();
    else printReadyImageFile(record, url);
  });
}

function printReadyImageFile(record, url) {
  const frame = document.createElement('iframe'); frame.className = 'ready-asset-print-frame';
  frame.title = `Cetak ${record.fileName}`; document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}html,body{width:100%;height:100%;margin:0;display:grid;place-items:center}img{max-width:100%;max-height:100%;object-fit:contain}@media print{img{width:100%;height:100%}}</style></head><body><img src="${url}" alt=""></body></html>`); doc.close();
  frame.onload = () => frame.contentWindow?.print();
  window.addEventListener('afterprint', () => frame.remove(), { once: true });
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Gambar gagal dibuka untuk editor desain.'));
    reader.readAsDataURL(blob);
  });
}

function downloadPrintConfig(state, layout) {
  const payload = {
    format: 'examcard-print-config', version: 1,
    school: state.schoolProfile?.schoolName || '',
    settings: {
      paperSize: state.printConfig.paperSize, customPaperW: state.printConfig.customPaperW, customPaperH: state.printConfig.customPaperH,
      orientation: state.printConfig.orientation, marginMm: layout.marginMm, gapMm: layout.gapMm,
      cardW: layout.cardW, cardH: layout.cardH, autoCapacity: state.printConfig.autoCapacity !== false,
      fitCards: state.printConfig.fitCards !== false, cols: layout.cols, rows: layout.rows
    }
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'konfigurasi-cetak-kartu.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bindPrintEvents(state, rerender) {
  fitPrintPreview();
  if (!fitPrintPreview.bound) { window.addEventListener('resize', fitPrintPreview); fitPrintPreview.bound = true; }
  document.getElementById('prt-class')?.addEventListener('change', event => {
    state.activeFolderId = event.target.value; StorageService.save(state); rerender();
  });
  const folder = FolderService.getActiveFolder(state); if (!folder) return;
  if (!folder.students?.length) hydrateReadyPaperPreview(folder, state);
  document.getElementById('prt-exam')?.addEventListener('change', event => {
    folder.examId = event.target.value || null; StorageService.save(state); rerender();
  });
  document.getElementById('prt-print-source')?.addEventListener('change', event => {
    folder.printSource = event.target.value; StorageService.save(state); rerender();
  });
  document.getElementById('prt-ready-folder')?.addEventListener('change', async event => {
    const selectedFiles = Array.from(event.target.files || []); event.target.value = '';
    const files = selectedFiles.filter(PrintAssetService.isSupported);
    if (!files.length) return showToast('Pilih folder yang berisi PDF, JPG, PNG, atau WebP.', 'error');
    const picker = event.currentTarget; picker.disabled = true;
    const status = document.getElementById('prt-ready-status');
    if (status) { status.className = 'import-status is-loading'; status.textContent = `Menyimpan ${files.length} file kartu siap cetak...`; }
    const previous = folder.printAssets || []; let stored = []; let duplicateCount = 0;
    try {
      const result = await PrintAssetService.addFiles(folder.folderId, files, { onProgress: (done, total) => {
        if (status) status.textContent = `Memeriksa file ${done} dari ${total} untuk mencegah unggahan ganda...`;
      } });
      stored = result.files; duplicateCount = result.duplicateCount;
      if (!stored.length) {
        if (status) { status.className = 'import-status'; status.textContent = `${duplicateCount} file duplikat dilewati. Tidak ada salinan baru yang disimpan.`; }
        showToast(`${duplicateCount} file yang sama sudah tersimpan; unggahan ulang dilewati.`, 'info'); return;
      }
      folder.printAssets = [...previous, ...stored];
      if (!StorageService.save(state)) throw new Error('Penyimpanan browser penuh. Hapus beberapa file lalu coba kembali.');
      const skipped = selectedFiles.length - files.length;
      showToast(`${stored.length} file baru disimpan${duplicateCount ? `; ${duplicateCount} duplikat dilewati` : ''}${skipped ? `; ${skipped} file format lain dilewati` : ''}.`, 'success'); rerender();
    } catch (error) {
      folder.printAssets = previous;
      await Promise.all(stored.map(item => PrintAssetService.deleteFile(item.id).catch(() => {})));
      if (status) { status.className = 'import-status is-error'; status.textContent = error.message; }
      showToast(error.message || 'File kartu gagal disimpan.', 'error');
    } finally { picker.disabled = false; }
  });
  document.querySelector('[data-deduplicate-ready-files]')?.addEventListener('click', async () => {
    try {
      const duplicates = await PrintAssetService.findDuplicates(folder.folderId);
      if (!duplicates.length) return showToast('Tidak ditemukan file duplikat di kelas ini.', 'info');
      if (!confirm(`Hapus ${duplicates.length} salinan file duplikat dari kelas ${folder.className}? Satu salinan tiap file akan tetap disimpan.`)) return;
      const previous = folder.printAssets || []; const duplicateSet = new Set(duplicates);
      folder.printAssets = previous.filter(item => !duplicateSet.has(item.id));
      if (!StorageService.save(state)) { folder.printAssets = previous; return showToast('Penghapusan duplikat dibatalkan karena perubahan gagal disimpan.', 'error'); }
      await PrintAssetService.deleteFiles(duplicates);
      showToast(`${duplicates.length} file duplikat dihapus.`, 'success'); rerender();
    } catch (error) { showToast(error.message || 'File duplikat gagal diperiksa.', 'error'); }
  });
  document.querySelector('[data-clear-ready-files]')?.addEventListener('click', async () => {
    const previous = folder.printAssets || [];
    if (!previous.length || !confirm(`Hapus semua ${previous.length} file siap cetak dari kelas ${folder.className}? Tindakan ini tidak dapat dibatalkan.`)) return;
    folder.printAssets = [];
    if (!StorageService.save(state)) { folder.printAssets = previous; return showToast('File tidak dihapus karena perubahan gagal disimpan.', 'error'); }
    await PrintAssetService.deleteFolder(folder.folderId).catch(error => console.error('Clear ready files:', error));
    showToast(`${previous.length} file siap cetak dihapus dari kelas ${folder.className}.`, 'success'); rerender();
  });
  document.querySelectorAll('[data-edit-ready-image]').forEach(button => button.addEventListener('click', async () => {
    const source = await PrintAssetService.getFile(button.dataset.editReadyImage).catch(error => { showToast(error.message, 'error'); return null; });
    if (!source) return;
    const sourceTemplate = state.templates.find(item => item.id === (folder.templateId || state.activeTemplateId)) || state.templates[0];
    const previousTemplates = state.templates;
    const originalFolderTemplate = folder.templateId; const originalActiveTemplate = state.activeTemplateId;
    try {
      const imageData = await readBlobAsDataUrl(source.blob);
      const template = { ...JSON.parse(JSON.stringify(sourceTemplate)), id: uid('tpl'), name: `${source.fileName.replace(/\.[^.]+$/, '')} (Desain)`, bgImage: imageData, elements: [] };
      state.templates.push(template); folder.templateId = template.id; state.activeTemplateId = template.id;
      if (!StorageService.save(state)) throw new Error('Desain gagal disimpan. Gambar mungkin terlalu besar untuk penyimpanan browser.');
      state.activeRoute = 'templates';
      showToast('Desain dibuat dari gambar. Tambahkan elemen teks/foto di editor; tulisan yang sudah menyatu di gambar tetap menjadi bagian latar.', 'success');
      rerender();
    } catch (error) {
      state.templates = previousTemplates;
      folder.templateId = originalFolderTemplate; state.activeTemplateId = originalActiveTemplate;
      showToast(error.message || 'Gambar gagal dibuka di editor.', 'error');
    }
  }));
  document.querySelectorAll('[data-open-ready-file]').forEach(button => button.addEventListener('click', async () => {
    try {
      const record = await PrintAssetService.getFile(button.dataset.openReadyFile);
      if (!record) throw new Error('File tidak ditemukan di penyimpanan browser ini.');
      openReadyAssetPreview(record);
    } catch (error) { showToast(error.message || 'File kartu gagal dibuka.', 'error'); }
  }));
  document.querySelectorAll('[data-remove-ready-file]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.removeReadyFile;
    const asset = (folder.printAssets || []).find(item => item.id === id);
    if (!asset || !confirm(`Hapus file siap cetak "${asset.fileName}" dari kelas ${folder.className}?`)) return;
    const previous = folder.printAssets;
    folder.printAssets = previous.filter(item => item.id !== id);
    if (!StorageService.save(state)) { folder.printAssets = previous; return showToast('File tidak jadi dihapus karena perubahan gagal disimpan.', 'error'); }
    await PrintAssetService.deleteFile(id).catch(error => console.error('Delete print file:', error));
    showToast('File siap cetak dihapus.', 'success'); rerender();
  }));
  const template = state.templates.find(item => item.id === (folder.templateId || state.activeTemplateId)) || state.templates[0];
  document.getElementById('prt-template')?.addEventListener('change', event => {
    folder.templateId = event.target.value; state.activeTemplateId = event.target.value; StorageService.save(state); rerender();
  });
  document.getElementById('btn-delete-print-template')?.addEventListener('click', () => {
    if (state.templates.length <= 1) return showToast('Simpan setidaknya satu desain kartu.', 'error');
    const affected = state.folders.filter(item => item.templateId === template.id).length;
    if (!confirm(`Hapus desain "${template.name}" dari daftar desain tersimpan? ${affected} kelas yang memakai desain ini akan dialihkan ke desain cadangan. Tindakan ini tidak dapat dibatalkan.`)) return;
    const fallback = state.templates.find(item => item.id !== template.id);
    const previousTemplates = state.templates; const previousActiveTemplateId = state.activeTemplateId;
    const previousAssignments = state.folders.map(item => [item, item.templateId]);
    state.templates = state.templates.filter(item => item.id !== template.id);
    state.folders.forEach(item => { if (item.templateId === template.id) item.templateId = fallback.id; });
    if (state.activeTemplateId === template.id) state.activeTemplateId = fallback.id;
    if (!StorageService.save(state)) {
      state.templates = previousTemplates; state.activeTemplateId = previousActiveTemplateId;
      previousAssignments.forEach(([item, templateId]) => { item.templateId = templateId; });
      return showToast('Desain gagal dihapus karena perubahan tidak dapat disimpan.', 'error');
    }
    showToast('Desain kartu dihapus dari daftar tersimpan.', 'success'); rerender();
  });
  const syncPrint = () => {
    const next = { ...state.printConfig,
      paperSize: document.getElementById('prt-paper').value,
      orientation: document.getElementById('prt-orientation').value,
      marginMm: Number(document.getElementById('prt-margin').value),
      gapMm: Number(document.getElementById('prt-gap').value),
      cardW: Number(document.getElementById('prt-card-w').value),
      cardH: Number(document.getElementById('prt-card-h').value),
      cols: Number(document.getElementById('prt-cols').value) || state.printConfig.cols,
      rows: Number(document.getElementById('prt-rows').value) || state.printConfig.rows,
      autoCapacity: document.getElementById('prt-auto-capacity').checked,
      fitCards: document.getElementById('prt-fit-cards').checked
    };
    if (next.paperSize === 'Custom') {
      next.customPaperW = Number(document.getElementById('prt-custom-w')?.value || next.customPaperW);
      next.customPaperH = Number(document.getElementById('prt-custom-h')?.value || next.customPaperH);
    }
    if (next.paperSize === 'Custom' && (!Number.isFinite(next.customPaperW) || next.customPaperW < 80 || next.customPaperW > 500 || !Number.isFinite(next.customPaperH) || next.customPaperH < 100 || next.customPaperH > 500)) { showToast('Ukuran kertas kustom harus 80–500 mm lebar dan 100–500 mm tinggi.', 'error'); rerender(); return; }
    if (!next.autoCapacity && (!Number.isInteger(next.cols) || next.cols < 1 || next.cols > 20 || !Number.isInteger(next.rows) || next.rows < 1 || next.rows > 30)) { showToast('Kolom harus 1–20 dan baris harus 1–30.', 'error'); rerender(); return; }
    if (![next.marginMm, next.gapMm, next.cardW, next.cardH].every(Number.isFinite) || next.marginMm < 0 || next.marginMm > 30 || next.gapMm < 0 || next.gapMm > 15 || next.cardW < 10 || next.cardW > 210 || next.cardH < 10 || next.cardH > 330) { showToast('Periksa kembali margin, jarak, serta ukuran kartu.', 'error'); rerender(); return; }
    const layout = getEffectivePrintLayout(next, template);
    next.cols = layout.cols; next.rows = layout.rows; next.cardW = layout.cardW; next.cardH = layout.cardH;
    state.printConfig = next; StorageService.save(state); rerender();
  };
  ['prt-paper', 'prt-orientation', 'prt-margin', 'prt-gap', 'prt-card-w', 'prt-card-h', 'prt-cols', 'prt-rows', 'prt-auto-capacity', 'prt-fit-cards', 'prt-custom-w', 'prt-custom-h'].forEach(id => document.getElementById(id)?.addEventListener('change', syncPrint));
  document.getElementById('btn-export-print-config')?.addEventListener('click', () => downloadPrintConfig(state, getEffectivePrintLayout(state.printConfig, template)));
  document.getElementById('btn-download-pdf')?.addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = 'Menyiapkan PDF…';
    try { await PdfService.exportCardsPdf(state, folder, folder.students, template, getEffectivePrintLayout(state.printConfig, template)); showToast('PDF kartu berhasil dibuat.', 'success'); }
    catch (error) { showToast(error.message || 'Gagal membuat PDF.', 'error'); }
    finally { button.disabled = false; button.textContent = 'Unduh PDF'; }
  });
  document.getElementById('btn-browser-print')?.addEventListener('click', async event => {
    const button = event.currentTarget; const label = button.querySelector('span'); button.disabled = true; if (label) label.textContent = 'Menyiapkan…';
    try {
      if (!folder.students?.length || (folder.printSource === 'assets' && folder.printAssets?.length)) {
        await printReadyAssetsOnCurrentPage(folder, state, template);
        return;
      }
      const stage = document.getElementById('print-output-area'); if (!stage) throw new Error('Pratinjau cetak tidak ditemukan.');
      await Promise.all(Array.from(stage.querySelectorAll('img')).map(image => {
        if (image.complete) return image.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error('Ada foto atau gambar template yang gagal dimuat.'));
        return new Promise((resolve, reject) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', () => reject(new Error('Ada foto atau gambar template yang gagal dimuat.')), { once: true }); });
      }));
      if (document.fonts?.ready) await document.fonts.ready;
      window.print();
    } catch (error) { showToast(error.message || 'Gagal menyiapkan dokumen cetak.', 'error'); }
    finally { button.disabled = false; if (label) label.textContent = 'Cetak kartu'; }
  });

}


export function fitPrintPreview() {
  const preview = document.querySelector('.print-preview-column');
  const output = document.getElementById('print-output-area');
  const sheet = output?.querySelector('.print-sheet, .print-ready-sheet');
  if (!preview || !output || !sheet) return;
  output.querySelectorAll('.print-sheet, .print-ready-sheet').forEach(page => { page.style.zoom = '1'; });
  const availableW = Math.max(1, preview.clientWidth - 20);
  // Use the available column width as the limit. Let the sheet scroll vertically
  // instead of shrinking it to fit the viewport height; print output stays 1:1.
  const scale = Math.min(1.25, availableW / sheet.offsetWidth);
  output.style.zoom = '';
  output.querySelectorAll('.print-sheet, .print-ready-sheet').forEach(page => { page.style.zoom = String(Math.max(0.25, scale)); });
}
