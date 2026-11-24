import { escapeHtml } from '../utils/helpers.js';
import { displayLevel } from './foldersPage.js';

export function renderDashboardPage(state) {
  const schoolName = state.schoolProfile?.schoolName || 'Sekolah';
  const levelSet = new Set();
  (state.classLevels || []).forEach(level => levelSet.add(displayLevel(level)));
  (state.folders || []).forEach(folder => levelSet.add(displayLevel(folder.level)));
  const levels = [...levelSet].sort((a, b) => Number(a.match(/\d+/)?.[0] || 99) - Number(b.match(/\d+/)?.[0] || 99));
  const gradeCards = levels.map(level => {
    const rombelCount = (state.folders || []).filter(folder => displayLevel(folder.level) === level).length;
    return `<button type="button" class="home-grade-card" data-grade-overview="${escapeHtml(level)}"><span>${escapeHtml(level)}</span><strong>${rombelCount} rombel</strong><small>${rombelCount ? 'Buka ruang kelas' : 'Tambahkan rombel'} <span aria-hidden="true">→</span></small></button>`;
  }).join('');

  return `<div class="dashboard-page">
    <section class="dashboard-welcome"><div class="welcome-copy"><span class="eyebrow">PUSAT PERSIAPAN UJIAN</span><h1>${escapeHtml(schoolName)}</h1><p>Kelola data peserta, desain kartu, dan produksi kartu ujian dalam satu alur.</p></div><div class="welcome-actions"><button type="button" class="btn btn-primary" data-goto="folders">Kelola tingkat & kelas</button><button type="button" class="btn btn-soft" data-goto="${state.folders?.length ? 'students' : 'folders'}">${state.folders?.length ? 'Impor Excel' : 'Mulai siapkan kelas'}</button></div></section>
    <section class="home-grade-section"><div class="section-heading"><div><span class="eyebrow">STRUKTUR SEKOLAH</span><h2>Tingkatan kelas</h2></div><button type="button" class="text-button" data-goto="folders">Kelola tingkatan →</button></div>${levels.length ? `<div class="home-grade-grid">${gradeCards}</div>` : `<div class="directory-empty"><strong>Belum ada tingkatan yang dibuat.</strong><p>Buat tingkat sesuai jenjang sekolah untuk mulai menyiapkan ruang kelas.</p><button type="button" class="btn btn-primary btn-sm" data-goto="folders">Buat tingkat pertama</button></div>`}</section>
    <section class="dashboard-section exam-directory"><div class="section-heading"><div><span class="eyebrow">JADWAL</span><h2>Kegiatan ujian</h2></div><button type="button" class="text-button" data-goto="exams">Kelola →</button></div>
      ${state.exams?.length ? `<div class="exam-list">${state.exams.map((exam, index) => `<article class="exam-row"><span class="exam-index">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(exam.name)}</strong><small>${escapeHtml(exam.academicYear)} · ${escapeHtml(exam.semester)}</small></div><time>${escapeHtml(exam.examDate || 'Tanggal belum ditentukan')}</time></article>`).join('')}</div>` : `<div class="directory-empty"><strong>Belum ada kegiatan ujian.</strong><p>Tambahkan ujian CBT, tes tulis, atau kegiatan lain.</p><button type="button" class="btn btn-soft btn-sm" data-goto="exams">Tambah kegiatan</button></div>`}
    </section>
    ${!state.devBypassAuth ? `<section class="panel activity-panel"><div class="section-heading"><div><span class="eyebrow">LOG WORKSPACE</span><h2>Aktivitas operator</h2></div><span class="badge badge-green">Cloud</span></div>${state.operatorLogs?.length ? `<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Operator</th><th>Aktivitas</th><th>Rincian</th></tr></thead><tbody>${state.operatorLogs.map(log => `<tr><td>${escapeHtml(new Date(log.created_at).toLocaleString('id-ID'))}</td><td>${escapeHtml(log.operator_name)}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.detail)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="directory-empty">Aktivitas workspace akan tampil di sini.</div>'}</section>` : ''}
  </div>`;
}
