import { escapeHtml } from '../utils/helpers.js';

export function openPhotoCropModal(student, photoObj, onSave) {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot || !student || !photoObj) return;
  const crop = { ...(student.crop || { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 }) };

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-box">
        <div class="panel-header">
          <h3 class="panel-title">Penyesuaian & Crop Foto Siswa</h3>
          <button type="button" class="btn btn-outline btn-sm" id="close-crop-modal">Tutup</button>
        </div>
        <div style="display:flex;justify-content:center;margin:16px 0;">
          <div style="width:150px;height:200px;border:2px solid #1d4ed8;border-radius:8px;overflow:hidden;background:#f1f5f9;">
            <img id="crop-preview-img" src="${photoObj.dataUrl}" alt="${escapeHtml(photoObj.fileName)}"
              style="width:100%;height:100%;object-fit:cover;transform:scale(${crop.zoom}) translate(${crop.offsetX}px,${crop.offsetY}px) rotate(${crop.rotation}deg);" />
          </div>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Zoom (<span id="lbl-zoom">${crop.zoom}</span>x)</label>
            <input type="range" id="inp-zoom" min="0.8" max="2.5" step="0.05" value="${crop.zoom}" />
          </div>
          <div class="form-group">
            <label class="form-label">Rotasi (<span id="lbl-rot">${crop.rotation}</span>°)</label>
            <input type="range" id="inp-rot" min="-180" max="180" step="5" value="${crop.rotation}" />
          </div>
          <div class="form-group">
            <label class="form-label">Geser Horizontal X</label>
            <input type="range" id="inp-ox" min="-60" max="60" step="2" value="${crop.offsetX}" />
          </div>
          <div class="form-group">
            <label class="form-label">Geser Vertikal Y</label>
            <input type="range" id="inp-oy" min="-60" max="60" step="2" value="${crop.offsetY}" />
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
          <button type="button" class="btn btn-primary" id="btn-save-crop">Simpan Posisi Foto</button>
        </div>
      </div>
    </div>
  `;

  const imgEl = document.getElementById('crop-preview-img');
  const sync = () => {
    document.getElementById('lbl-zoom').textContent = crop.zoom;
    document.getElementById('lbl-rot').textContent = crop.rotation;
    imgEl.style.transform = `scale(${crop.zoom}) translate(${crop.offsetX}px,${crop.offsetY}px) rotate(${crop.rotation}deg)`;
  };
  document.getElementById('inp-zoom').oninput = e => { crop.zoom = Number(e.target.value); sync(); };
  document.getElementById('inp-rot').oninput = e => { crop.rotation = Number(e.target.value); sync(); };
  document.getElementById('inp-ox').oninput = e => { crop.offsetX = Number(e.target.value); sync(); };
  document.getElementById('inp-oy').oninput = e => { crop.offsetY = Number(e.target.value); sync(); };
  document.getElementById('close-crop-modal').onclick = () => { modalRoot.innerHTML = ''; };
  document.getElementById('btn-save-crop').onclick = () => {
    student.crop = crop;
    modalRoot.innerHTML = '';
    onSave();
  };
}
