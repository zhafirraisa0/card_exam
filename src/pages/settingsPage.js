import { escapeHtml, showToast } from '../utils/helpers.js';
import { LogoBackgroundRemover } from '../utils/logoRemover.js';
import { StorageService } from '../services/storageService.js';
import { PdfService } from '../services/pdfService.js';

export function renderSettingsPage(state) {
  const sp = state.schoolProfile || { schoolName: '', logoDataUrl: '' };
  return `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><h3 class="panel-title">Identitas & Logo Sekolah</h3></div>
        <div class="form-group">
          <label class="form-label">Nama Sekolah</label>
          <input class="input" id="set-school-name" value="${escapeHtml(sp.schoolName)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Ganti / Unggah Logo Sekolah (Otomatis Hapus Latar)</label>
          <input type="file" class="input" id="set-logo-file" accept="image/png,image/jpeg,image/webp" />
        </div>
        ${sp.logoDataUrl ? `<div class="checkerboard" style="width:84px;height:84px;border-radius:8px;border:1px solid #cbd5e1;display:grid;place-items:center;margin-bottom:12px;"><img src="${sp.logoDataUrl}" style="max-width:74px;max-height:74px;object-fit:contain;" /></div>` : ''}
        <button type="button" class="btn btn-primary" id="btn-save-school-settings">Simpan Identitas Sekolah</button>
      </div>

      <div class="panel">
        <div class="panel-header"><h3 class="panel-title">Keamanan Sesi & Backup Proyek</h3></div>
        <p style="font-size:13px;color:#475569;">Hapus seluruh data siswa dan foto sementara dari memori browser setelah pencetakan selesai untuk menjaga kerahasiaan akun CBT.</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button type="button" class="btn btn-royal" id="btn-export-project-zip">Backup Metadata Proyek (.ZIP)</button>
          <button type="button" class="btn btn-danger" id="btn-wipe-session">Hapus Seluruh Data Siswa & Foto Sesi</button>
        </div>
      </div>
    </div>
  `;
}

export function bindSettingsEvents(state, rerender) {
  const logoInp = document.getElementById('set-logo-file');
  if (logoInp) {
    logoInp.onchange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const { img } = await LogoBackgroundRemover.loadImageFromFile(file);
        state.schoolProfile.logoDataUrl = LogoBackgroundRemover.removeBackground(img, { tolerance: 36 });
        StorageService.save(state);
        showToast('Logo baru diperbarui dengan latar transparan otomatis.', 'success');
        rerender();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  const btnSave = document.getElementById('btn-save-school-settings');
  if (btnSave) {
    btnSave.onclick = () => {
      const name = document.getElementById('set-school-name').value.trim();
      if (!name) return showToast('Nama sekolah tidak boleh kosong.', 'error');
      state.schoolProfile.schoolName = name;
      StorageService.save(state);
      showToast('Identitas sekolah disimpan.', 'success');
      rerender();
    };
  }

  const btnZip = document.getElementById('btn-export-project-zip');
  if (btnZip) {
    btnZip.onclick = async () => {
      try {
        const blob = await PdfService.exportProjectZip(state);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'school-exam-card-backup.zip';
        a.click();
        showToast('Backup proyek ZIP diunduh.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  const btnWipe = document.getElementById('btn-wipe-session');
  if (btnWipe) {
    btnWipe.onclick = () => {
      if (confirm('Hapus seluruh data siswa dan foto sementara dari browser?')) {
        StorageService.wipeSessionData(state);
        showToast('Data siswa dan foto sesi telah dibersihkan.', 'success');
        rerender();
      }
    };
  }
}
