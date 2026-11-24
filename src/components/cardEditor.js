import { escapeHtml, uid } from '../utils/helpers.js';
import { BindingService } from '../services/bindingService.js';
import { PhotoService } from '../services/photoService.js';

export function renderCardEditorWorkbench(state, folder, template, editorState) {
  const exam = (state.exams || []).find(item => item.id === folder?.examId);
  const variables = [...BindingService.getAvailableVariables(folder?.excelMeta), ...BindingService.getExamVariables(exam)];
  if (!variables.some(variable => BindingService.isPhotoHeader(variable.originalHeader))) {
    variables.push({ variableId: 'system_student_photo', originalHeader: 'Foto Siswa', token: '{{Foto Siswa}}', isPhotoVariable: true });
  }
  const students = folder?.students || [];
  const rawPreviewStudent = students[editorState.previewStudentIndex] || students[0] || null;
  const previewStudent = rawPreviewStudent ? { ...rawPreviewStudent, examFields: BindingService.getExamFields(exam) } : null;
  const selectedEl = (template.elements || []).find(e => e.id === editorState.selectedElementId) || template.elements[0] || null;

  const pxPerMm = 3.7795275591;
  const wPx = Math.round(template.widthMm * pxPerMm * editorState.zoom);
  const hPx = Math.round(template.heightMm * pxPerMm * editorState.zoom);

  return `
    <div class="editor-workbench">
      <!-- PANEL KIRI: VARIABEL EXCEL DINAMIS & ELEMEN -->
      <div class="panel">
        <div class="panel-header"><h4 class="panel-title">Variabel Excel & Elemen</h4></div>
        <p style="font-size:12px;color:#64748b;margin-top:0;">Seret variabel Excel, foto siswa, atau kegiatan ujian ke kanvas kartu:</p>
        <div style="margin-bottom:14px;">
          ${variables.length ? variables.map(v => `
            <div class="var-chip" draggable="true" data-drag-var="${escapeHtml(v.bindingKey || v.originalHeader)}" data-var-label="${escapeHtml(v.originalHeader)}">
              <span>{{${escapeHtml(v.originalHeader)}}}</span>
              <span class="badge ${v.isPhotoVariable ? 'badge-green' : v.source === 'exam' ? 'badge-amber' : 'badge-blue'}">${v.isPhotoVariable ? 'Foto opsional' : v.source === 'exam' ? 'Kegiatan ujian' : 'Excel'}</span>
            </div>
          `).join('') : `<div class="empty-state" style="padding:14px;font-size:12px;">Belum ada file Excel di kelas ini. Impor Excel terlebih dahulu agar variabel muncul otomatis.</div>`}
        </div>
        ${!folder?.excelMeta ? '<div class="empty-state" style="padding:10px;font-size:11px;margin:0 0 12px;">Variabel siswa muncul setelah Excel diimpor. Foto dan kegiatan ujian dapat dipakai terpisah.</div>' : ''}
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button type="button" class="btn btn-outline btn-sm" id="btn-add-static">+ Teks Statis</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-add-photo">+ Kotak Foto Siswa</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-add-logo">+ Logo Sekolah</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-add-qr">+ QR Peserta</button>
        </div>
      </div>

      <!-- PANEL TENGAH: KANVAS KARTU -->
      <div class="panel">
        <div class="panel-header">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <label style="font-size:12px;font-weight:600;">Preview Siswa:</label>
            <select class="select" id="sel-preview-student" style="width:auto;min-width:190px;">
              ${students.length ? students.map((s, i) => {
                const firstVal = Object.values(s.fields || {})[0] || `Siswa #${i + 1}`;
                return `<option value="${i}" ${i === editorState.previewStudentIndex ? 'selected' : ''}>${escapeHtml(firstVal)}</option>`;
              }).join('') : '<option value="0">Belum ada data siswa</option>'}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:12px;"><input type="checkbox" id="chk-snap-grid" ${editorState.snapToGrid ? 'checked' : ''} /> Grid</label>
            <button type="button" class="btn btn-outline btn-sm" id="btn-zoom-out">-</button>
            <span class="mono" style="font-size:12px;">${Math.round(editorState.zoom * 100)}%</span>
            <button type="button" class="btn btn-outline btn-sm" id="btn-zoom-in">+</button>
          </div>
        </div>

        <div class="canvas-stage">
          <div id="card-drop-surface" class="card-surface ${editorState.snapToGrid ? 'grid-on' : ''}"
               style="width:${wPx}px;height:${hPx}px;${template.bgImage ? `background-image:url('${template.bgImage}');background-size:cover;background-position:center;` : `background:${template.bgColor || '#fff'};border-top:4px solid ${template.accentColor || '#0f2347'};`}">
            ${(template.elements || []).map(el => {
              const isSel = selectedEl && selectedEl.id === el.id;
              let inner = '';
              if (el.kind === 'photo') {
                const p = PhotoService.resolveStudentPhoto(folder, previewStudent, el.header);
                const crop = previewStudent?.crop || { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 };
                inner = p ? `<img draggable="false" src="${p.dataUrl}" style="width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none;transform:scale(${crop.zoom}) translate(${crop.offsetX}px,${crop.offsetY}px) rotate(${crop.rotation}deg);" />` : `<div style="width:100%;height:100%;border:1px dashed #64748b;display:grid;place-items:center;font-size:10px;pointer-events:none;">FOTO</div>`;
              } else if (el.kind === 'logo') {
                const logo = state.schoolProfile?.logoDataUrl;
                inner = logo ? `<img src="${logo}" style="width:100%;height:100%;object-fit:contain;" />` : `<div style="width:100%;height:100%;border:1px dashed #94a3b8;display:grid;place-items:center;font-size:9px;">LOGO</div>`;
              } else if (el.kind === 'qr') {
                const value = BindingService.resolveElementValue({ ...el, kind: 'dynamic' }, previewStudent, folder?.excelMeta, '');
                inner = `<div class="card-qr qr-editor-preview" data-qr-value="${escapeHtml(value)}" style="width:100%;height:100%;display:grid;place-items:center;background:#fff;padding:2px;">${value ? '' : 'PILIH KOLOM'}</div>`;
              } else {
                inner = escapeHtml(BindingService.resolveElementValue(el, previewStudent, folder?.excelMeta, '-'));
              }
              return `<div class="card-el ${el.kind === 'qr' ? 'qr-el' : ''} ${isSel ? 'selected' : ''} ${el.locked ? 'locked' : ''}"
                data-el-id="${el.id}"
                style="left:${el.x * editorState.zoom}px;top:${el.y * editorState.zoom}px;width:${el.w * editorState.zoom}px;height:${el.h * editorState.zoom}px;padding:${['photo','logo','qr'].includes(el.kind) ? '0' : '2px 4px'};font-size:${(el.fontSize || 11) * editorState.zoom}px;font-weight:${el.fontWeight || '500'};color:${el.color || '#0f172a'};text-align:${el.align || 'left'};line-height:1.25;white-space:nowrap;text-overflow:ellipsis;transform:rotate(${el.rotation || 0}deg);">
                ${inner}
              </div>`;
            }).join('')}
          </div>
          <div style="margin-top:10px;font-size:12px;color:#475569;">Ukuran Fisik: <strong>${template.widthMm} × ${template.heightMm} mm</strong></div>
        </div>
      </div>

      <!-- PANEL KANAN: INSPECTOR PRESISI & VARIABLE BINDING -->
      <div class="panel">
        <div class="panel-header"><h4 class="panel-title">Inspector Elemen & Binding</h4></div>
        ${selectedEl ? `
          <div class="form-group">
            <label class="form-label">Tipe Elemen</label>
            <div class="badge badge-blue">${selectedEl.kind.toUpperCase()}</div>
          </div>
          ${selectedEl.kind === 'dynamic' || selectedEl.kind === 'qr' ? `
            <div class="form-group">
                <label class="form-label">${selectedEl.kind === 'qr' ? 'Isi QR dari kolom Excel' : 'Sumber Kolom Excel'}</label>
              <select class="select" id="insp-binding-header">
                <option value="">-- Pilih Kolom Excel --</option>
                ${variables.map(v => `<option value="${escapeHtml(v.bindingKey || v.originalHeader)}" ${selectedEl.header === (v.bindingKey || v.originalHeader) ? 'selected' : ''}>${escapeHtml(v.originalHeader)}</option>`).join('')}
              </select>
            </div>
          ` : ''}
          ${selectedEl.kind === 'photo' ? `
            <div class="form-group"><label class="form-label">Kolom referensi foto (opsional)</label><select class="select" id="insp-photo-header"><option value="">Gunakan foto yang dipasangkan</option>${variables.filter(v => v.source !== 'exam').map(v => `<option value="${escapeHtml(v.bindingKey || v.originalHeader)}" ${selectedEl.header === (v.bindingKey || v.originalHeader) ? 'selected' : ''}>${escapeHtml(v.originalHeader)}</option>`).join('')}</select><small class="muted-copy">Jika kolom ini berisi nama file foto, kartu akan mencari foto dengan nama yang sama.</small></div>
          ` : ''}
          ${selectedEl.kind === 'static' ? `
            <div class="form-group">
              <label class="form-label">Isi Teks Statis</label>
              <input class="input" id="insp-static-text" value="${escapeHtml(selectedEl.text || '')}" />
            </div>
          ` : ''}
          <div class="grid-2">
            <div class="form-group"><label class="form-label">Posisi X</label><input type="number" class="input" id="insp-x" value="${Math.round(selectedEl.x)}" /></div>
            <div class="form-group"><label class="form-label">Posisi Y</label><input type="number" class="input" id="insp-y" value="${Math.round(selectedEl.y)}" /></div>
            <div class="form-group"><label class="form-label">Lebar</label><input type="number" class="input" id="insp-w" value="${Math.round(selectedEl.w)}" /></div>
            <div class="form-group"><label class="form-label">Tinggi</label><input type="number" class="input" id="insp-h" value="${Math.round(selectedEl.h)}" /></div>
            <div class="form-group"><label class="form-label">Ukuran Font</label><input type="number" class="input" id="insp-fs" value="${selectedEl.fontSize || 11}" /></div>
            <div class="form-group"><label class="form-label">Warna</label><input type="color" class="input" id="insp-color" value="${selectedEl.color || '#0f172a'}" style="height:36px;padding:2px;" /></div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            <button type="button" class="btn btn-outline btn-sm" id="btn-el-lock">${selectedEl.locked ? 'Buka Kunci' : 'Kunci'}</button>
            <button type="button" class="btn btn-outline btn-sm" id="btn-el-dup">Duplikat</button>
            <button type="button" class="btn btn-danger btn-sm" id="btn-el-del">Hapus</button>
          </div>
        ` : `<div style="font-size:12.5px;color:#64748b;">Klik salah satu elemen di kanvas untuk mengatur posisi presisi dan sumber datanya.</div>`}
      </div>
    </div>
  `;
}
