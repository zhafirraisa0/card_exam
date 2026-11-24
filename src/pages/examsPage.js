import { escapeHtml, uid, showToast } from '../utils/helpers.js';
import { StorageService } from '../services/storageService.js';

export function renderExamsPage(state) {
  return `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><h3 class="panel-title">Tambah Kegiatan Ujian Baru</h3></div>
        <form id="form-add-exam">
          <div class="form-group">
            <label class="form-label">Nama Kegiatan Ujian *</label>
            <input class="input" id="ex-name" placeholder="Contoh: Penilaian Sumatif Akhir Semester Ganjil" required />
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Jenis Ujian</label>
              <select class="select" id="ex-type">
                <option>Ujian CBT</option>
                <option>Ujian Sumatif Semester Ganjil</option>
                <option>Ujian Sumatif Semester Genap</option>
                <option>Ujian Tengah Semester</option>
                <option>Ujian Akhir Sekolah</option>
                <option>Ujian Praktik</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Tahun Pelajaran</label>
              <input class="input" id="ex-year" value="2026/2027" />
            </div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Semester</label>
              <select class="select" id="ex-sem"><option>Ganjil</option><option>Genap</option></select>
            </div>
            <div class="form-group">
              <label class="form-label">Tanggal Pelaksanaan</label>
              <input type="date" class="input" id="ex-date" />
            </div>
          </div>
          <button type="submit" class="btn btn-primary">Simpan Kegiatan Ujian</button>
        </form>
      </div>

      <div class="panel">
        <div class="panel-header"><h3 class="panel-title">Daftar Kegiatan (${state.exams.length})</h3></div>
        ${state.exams.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Kegiatan</th><th>Jenis</th><th>Tahun</th><th>Aksi</th></tr></thead>
              <tbody>
                ${state.exams.map(ex => `
                  <tr>
                    <td><strong>${escapeHtml(ex.name)}</strong><div style="font-size:11.5px;color:#64748b;">${escapeHtml(ex.examDate || '')}</div></td>
                    <td>${escapeHtml(ex.type)}</td>
                    <td>${escapeHtml(ex.academicYear)} (${escapeHtml(ex.semester)})</td>
                    <td><button type="button" class="btn btn-danger btn-sm" data-del-exam="${ex.id}">Hapus</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="empty-state">Belum ada kegiatan ujian. Silakan buat melalui formulir di samping.</div>`}
      </div>
    </div>
  `;
}

export function bindExamsEvents(state, rerender) {
  const form = document.getElementById('form-add-exam');
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const exam = {
        id: uid('exm'),
        name: document.getElementById('ex-name').value.trim(),
        type: document.getElementById('ex-type').value,
        academicYear: document.getElementById('ex-year').value.trim(),
        semester: document.getElementById('ex-sem').value,
        examDate: document.getElementById('ex-date').value
      };
      state.exams.push(exam);
      state.activeExamId = exam.id;
      StorageService.save(state);
      showToast('Kegiatan ujian berhasil ditambahkan.', 'success');
      rerender();
    };
  }
  document.querySelectorAll('[data-del-exam]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-del-exam');
      if (confirm('Hapus kegiatan ujian ini?')) {
        state.exams = state.exams.filter(x => x.id !== id);
        state.folders.forEach(folder => { if (folder.examId === id) folder.examId = null; });
        if (state.activeExamId === id) state.activeExamId = state.exams[0]?.id || null;
        StorageService.save(state);
        rerender();
      }
    };
  });
}
