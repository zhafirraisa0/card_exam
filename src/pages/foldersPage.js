import { escapeHtml, showToast } from '../utils/helpers.js';
import { FolderService } from '../services/folderService.js';
import { StorageService } from '../services/storageService.js';
import { PrintAssetService } from '../services/printAssetService.js';

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };
export function displayLevel(level = '') {
  const value = String(level).trim();
  const match = value.match(/(?:kelas\s*)?(XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I|1[0-2]|[1-9])\b/i);
  if (!match) return value || 'Tingkat lainnya';
  const token = match[1].toUpperCase();
  return `Kelas ${/^\d+$/.test(token) ? Number(token) : ROMAN[token]}`;
}
const folderStats = folders => ({
  classes: folders.length,
  students: folders.reduce((sum, folder) => sum + (folder.students?.length || 0), 0),
  photos: folders.reduce((sum, folder) => sum + (folder.students || []).filter(student => student.photoId).length, 0)
});

function renderGradeCard(level, folders) {
  const stats = folderStats(folders);
  return `<article class="grade-card-shell"><button type="button" class="grade-card" data-grade="${escapeHtml(level)}"><span class="grade-card-kicker">TINGKAT</span><span class="grade-card-title">${escapeHtml(level)}</span><span class="grade-card-meta">${stats.classes} rombel</span><span class="grade-card-link">Lihat kelas <span aria-hidden="true">&#8594;</span></span></button><button type="button" class="text-button danger-link grade-card-delete" data-del-level="${escapeHtml(level)}" aria-label="Hapus ${escapeHtml(level)}">Hapus tingkat</button></article>`;
}

export function renderFoldersPage(state) {
  const grouped = new Map();
  state.folders.forEach(folder => {
    const level = displayLevel(folder.level);
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level).push(folder);
  });
  const levels = [...new Set([...(state.classLevels || []).map(displayLevel), ...grouped.keys()])].sort((a, b) => {
    const na = Number(a.match(/\d+/)?.[0]); const nb = Number(b.match(/\d+/)?.[0]);
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b, 'id');
  });
  const selectedLevel = state.folderLevelView || '';

  if (!selectedLevel) return `
    <section class="page-intro"><div><span class="eyebrow">RUANG KELAS</span><h1>Data & folder kelas</h1><p>Pilih tingkat untuk melihat rombongan belajar. Data, Excel, dan foto tersimpan terpisah untuk setiap kelas.</p></div><span class="intro-count">${state.folders.length} kelas terdaftar</span></section>
    ${levels.length ? `<div class="grade-grid">${levels.map(level => renderGradeCard(level, grouped.get(level) || [])).join('')}</div>` : `<div class="directory-empty"><strong>Belum ada tingkatan.</strong><p>Tambahkan tingkat sesuai struktur sekolah, misalnya Kelas 7, Kelas 10, atau tingkat lainnya.</p></div>`}
    <details class="panel add-class-panel" open><summary>Tambah tingkat</summary><form id="form-add-level" class="add-class-form"><label class="form-group"><span class="form-label">Tingkat sekolah</span><input class="input" id="fld-level" placeholder="Contoh: Kelas 7 atau Kelas 10" required></label><button type="submit" class="btn btn-primary">Buat tingkat</button></form></details>`;

  const currentFolders = grouped.get(selectedLevel) || [];
  const stats = folderStats(currentFolders);
  return `
    <section class="page-intro"><div><button type="button" class="text-button" id="btn-back-grades">← Semua tingkat</button><span class="eyebrow">${stats.classes} ROMBEL · ${stats.students} SISWA</span><h1>${escapeHtml(selectedLevel)}</h1><p>Pilih rombongan belajar untuk mengelola data siswa, foto, dan kartu ujian.</p></div><span class="intro-count">${stats.photos}/${stats.students} foto cocok</span></section>
    <div class="class-grid">${currentFolders.map(folder => `<article class="class-card ${folder.folderId === state.activeFolderId ? 'is-active' : ''}"><div class="class-card-top"><span class="class-card-icon">${escapeHtml(folder.className.slice(0, 1).toUpperCase())}</span>${folder.folderId === state.activeFolderId ? '<span class="badge badge-green">Kelas aktif</span>' : ''}</div><h2>${escapeHtml(folder.className)}</h2><p>${escapeHtml(folder.excelMeta?.fileName || 'Belum ada data Excel')}</p><div class="class-card-stats"><span>${(folder.students || []).length} siswa</span><span>${(folder.students || []).filter(student => student.photoId).length} foto</span></div><div class="class-card-actions"><button type="button" class="btn btn-primary btn-sm" data-open-folder="${folder.folderId}" data-open-route="students">Data siswa</button><button type="button" class="btn btn-outline btn-sm" data-open-folder="${folder.folderId}" data-open-route="photos">Foto</button><button type="button" class="btn btn-outline btn-sm" data-open-folder="${folder.folderId}" data-open-route="print">Cetak</button></div><button type="button" class="text-button danger-link" data-del-folder="${folder.folderId}">Hapus kelas</button></article>`).join('')}
      <article class="class-card class-card-add"><span class="add-class-plus">+</span><h2>Tambah rombel</h2><p>Buat kelas lain di ${escapeHtml(selectedLevel)}.</p><form id="form-add-folder"><input type="hidden" id="fld-level" value="${escapeHtml(selectedLevel)}"><label class="form-group"><span class="form-label">Nama kelas</span><input class="input" id="fld-class" placeholder="Contoh: 8A" required></label><button type="submit" class="btn btn-outline">Tambah kelas</button></form></article>
    </div>`;
}

export function bindFoldersEvents(state, rerender) {
  document.querySelectorAll('[data-grade]').forEach(button => {
    button.onclick = () => { state.folderLevelView = button.dataset.grade; rerender(); };
  });
  document.getElementById('btn-back-grades')?.addEventListener('click', () => { state.folderLevelView = ''; rerender(); });

  document.querySelectorAll('[data-del-level]').forEach(button => {
    button.addEventListener('click', () => {
      const level = button.dataset.delLevel;
      const folders = state.folders.filter(folder => displayLevel(folder.level) === level);
      const students = folders.reduce((count, folder) => count + (folder.students?.length || 0), 0);
      const photos = folders.reduce((count, folder) => count + (folder.photos?.length || 0), 0);
      const detail = folders.length
        ? `Tingkat ${level} memiliki ${folders.length} rombel, ${students} siswa, dan ${photos} foto. Menghapus tingkat akan menghapus seluruh rombel beserta data siswa, Excel, dan foto di dalamnya.`
        : `Hapus tingkat kosong ${level}?`;
      if (!confirm(`${detail}\n\nTindakan ini tidak dapat dibatalkan.`)) return;
      const previousFolders = state.folders; const previousLevels = state.classLevels; const previousActiveFolderId = state.activeFolderId; const previousLevelView = state.folderLevelView;
      const deletedFolderIds = folders.map(item => item.folderId);
      const removed = FolderService.deleteLevel(state, level);
      state.folderLevelView = '';
      if (!StorageService.save(state)) {
        state.folders = previousFolders; state.classLevels = previousLevels; state.activeFolderId = previousActiveFolderId; state.folderLevelView = previousLevelView;
        return showToast('Perubahan gagal disimpan, jadi penghapusan dibatalkan. Periksa ruang penyimpanan browser.', 'error');
      }
      Promise.all(deletedFolderIds.map(id => PrintAssetService.deleteFolder(id).catch(error => console.error('Clean ready-card files:', error))));
      showToast(`${level} dan ${removed.classCount} rombel berhasil dihapus.`, 'success');
      rerender();
    });
  });

  const levelForm = document.getElementById('form-add-level');
  levelForm?.addEventListener('submit', event => {
    event.preventDefault();
    const raw = document.getElementById('fld-level').value.trim();
    const level = displayLevel(raw);
    if (!level || level === 'Tingkat lainnya') return showToast('Isi nama tingkat yang valid.', 'error');
    const existing = new Set([...(state.classLevels || []).map(displayLevel), ...state.folders.map(folder => displayLevel(folder.level))]);
    if (existing.has(level)) return showToast(`${level} sudah tersedia. Buka tingkat tersebut untuk menambahkan rombel.`, 'error');
    state.classLevels ||= [];
    state.classLevels.push(level);
    state.folderLevelView = '';
    StorageService.save(state);
    showToast(`${level} berhasil dibuat.`, 'success');
    rerender();
  });

  const form = document.getElementById('form-add-folder');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const level = document.getElementById('fld-level').value.trim();
      const className = document.getElementById('fld-class').value.trim();
      FolderService.createFolder(state, { level, className });
      state.folderLevelView = displayLevel(level);
      StorageService.save(state);
      showToast(`${className} berhasil ditambahkan ke ${state.folderLevelView}.`, 'success');
      rerender();
    } catch (error) { showToast(error.message || 'Gagal membuat kelas.', 'error'); }
  });

  document.querySelectorAll('[data-open-folder]').forEach(button => {
    button.onclick = () => {
      state.activeFolderId = button.dataset.openFolder;
      state.activeRoute = button.dataset.openRoute || 'students';
      StorageService.save(state);
      rerender();
    };
  });
  document.querySelectorAll('[data-del-folder]').forEach(button => {
    button.onclick = async () => {
      const folderId = button.dataset.delFolder;
      if (!confirm('Hapus kelas ini beserta data siswa dan foto yang tersimpan di dalamnya?')) return;
      FolderService.deleteFolder(state, folderId);
      if (!StorageService.save(state)) return showToast('Kelas tidak jadi dihapus karena perubahan gagal disimpan.', 'error');
      await PrintAssetService.deleteFolder(folderId).catch(error => console.error('Clean ready-card files:', error));
      rerender();
    };
  });
}
