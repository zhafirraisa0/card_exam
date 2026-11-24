import { escapeHtml, uid, showToast } from '../utils/helpers.js';
import { FolderService } from '../services/folderService.js';
import { StorageService } from '../services/storageService.js';
import { renderCardEditorWorkbench } from '../components/cardEditor.js';
import { BindingService } from '../services/bindingService.js';

function makeVariableElement(header, x = 30, y = 30, label = header) {
  const isPhoto = BindingService.isPhotoHeader(label);
  return {
    id: uid('el'), kind: isPhoto ? 'photo' : 'dynamic', header, label,
    text: isPhoto ? 'FOTO' : undefined, x, y, w: isPhoto ? 66 : 180, h: isPhoto ? 84 : 20,
    fontSize: isPhoto ? 10 : 11, fontWeight: '600', color: '#0f172a', align: isPhoto ? 'center' : 'left',
    locked: false, rotation: 0
  };
}

export const editorState = {
  selectedElementId: null,
  previewStudentIndex: 0,
  zoom: 1.25,
  snapToGrid: true
};

export function renderTemplatesPage(state) {
  const folder = FolderService.getActiveFolder(state);
  const template = state.templates.find(t => t.id === (folder?.templateId || state.activeTemplateId)) || state.templates[0];
  if (folder && BindingService.autoBindTemplate(template, folder.excelMeta)) StorageService.save(state);
  if (!editorState.selectedElementId && template.elements.length) {
    editorState.selectedElementId = template.elements[0].id;
  }

  return `
    <div class="templates-editor-page">
      <section class="page-intro editor-page-intro"><div><span class="eyebrow">DESAIN KARTU</span><h1>Edit kartu</h1><p>${escapeHtml(folder?.level || '')}${folder?.className ? ` / ${escapeHtml(folder.className)}` : ''} · Perubahan desain langsung terlihat di pratinjau.</p></div></section>
      <div class="panel editor-template-settings">
        <div class="panel-header">
          <h3 class="panel-title">Template & Ukuran Kartu Ujian</h3>
          <button type="button" class="btn btn-outline btn-sm" id="btn-dup-template">+ Duplikat Template</button>
        </div>
        <div class="grid-4">
          <div class="form-group">
            <label class="form-label">Pilih Template</label>
            <select class="select" id="sel-active-template">
              ${state.templates.map(t => `<option value="${t.id}" ${t.id === template.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Preset Ukuran (mm)</label>
            <select class="select" id="sel-card-preset">
              <option value="85.6x54" ${template.widthMm === 85.6 && template.heightMm === 54 ? 'selected' : ''}>ID-1 / CR80 (85.6 × 54 mm)</option>
              <option value="90x55" ${template.widthMm === 90 && template.heightMm === 55 ? 'selected' : ''}>90 × 55 mm</option>
              <option value="90x60" ${template.widthMm === 90 && template.heightMm === 60 ? 'selected' : ''}>90 × 60 mm</option>
              <option value="54x85.6" ${template.widthMm === 54 && template.heightMm === 85.6 ? 'selected' : ''}>Portrait ID-1 (54 × 85.6 mm)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Upload Desain Background (PNG/JPG)</label>
            <input type="file" class="input" id="inp-template-bg" accept="image/png,image/jpeg,image/webp" />
          </div>
          <div class="form-group">
            <label class="form-label">Warna Aksen Header</label>
            <input type="color" class="input" id="inp-tpl-accent" value="${template.accentColor || '#0f2347'}" style="height:38px;padding:2px;" />
          </div>
        </div>
      </div>

      ${renderCardEditorWorkbench(state, folder, template, editorState)}
    </div>
  `;
}

export function bindTemplatesEvents(state, rerender) {
  const folder = FolderService.getActiveFolder(state);
  const template = state.templates.find(t => t.id === (folder?.templateId || state.activeTemplateId)) || state.templates[0];
  const selectedEl = template.elements.find(e => e.id === editorState.selectedElementId);

  const selTpl = document.getElementById('sel-active-template');
  if (selTpl) {
    selTpl.onchange = () => {
      state.activeTemplateId = selTpl.value;
      if (folder) folder.templateId = selTpl.value;
      editorState.selectedElementId = null;
      StorageService.save(state);
      rerender();
    };
  }

  const btnDup = document.getElementById('btn-dup-template');
  if (btnDup) {
    btnDup.onclick = () => {
      const copy = JSON.parse(JSON.stringify(template));
      copy.id = uid('tpl');
      copy.name = `${template.name} (Salinan)`;
      state.templates.push(copy);
      state.activeTemplateId = copy.id;
      if (folder) folder.templateId = copy.id;
      StorageService.save(state);
      showToast('Template berhasil diduplikasi.', 'success');
      rerender();
    };
  }

  const selPreset = document.getElementById('sel-card-preset');
  if (selPreset) {
    selPreset.onchange = () => {
      const [w, h] = selPreset.value.split('x').map(Number);
      template.widthMm = w;
      template.heightMm = h;
      StorageService.save(state);
      rerender();
    };
  }

  const inpBg = document.getElementById('inp-template-bg');
  if (inpBg) {
    inpBg.onchange = (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        template.bgImage = reader.result;
        StorageService.save(state);
        rerender();
      };
      reader.readAsDataURL(file);
    };
  }

  const inpAccent = document.getElementById('inp-tpl-accent');
  if (inpAccent) {
    inpAccent.onchange = () => {
      template.accentColor = inpAccent.value;
      StorageService.save(state);
      rerender();
    };
  }

  // Drag variable from left panel onto card surface
  document.querySelectorAll('[data-drag-var]').forEach(chip => {
    chip.ondragstart = (e) => {
      e.dataTransfer.setData('text/plain', chip.getAttribute('data-drag-var'));
      e.dataTransfer.setData('text/x-secg-label', chip.getAttribute('data-var-label') || chip.getAttribute('data-drag-var'));
    };
    chip.onclick = () => {
      const header = chip.getAttribute('data-drag-var');
      const newEl = makeVariableElement(header, 30, 30, chip.getAttribute('data-var-label') || header);
      template.elements.push(newEl);
      editorState.selectedElementId = newEl.id;
      StorageService.save(state);
      rerender();
    };
  });

  const surface = document.getElementById('card-drop-surface');
  if (surface) {
    surface.ondragover = (e) => e.preventDefault();
    surface.ondrop = (e) => {
      e.preventDefault();
      const header = e.dataTransfer.getData('text/plain');
      if (!header) return;
      const label = e.dataTransfer.getData('text/x-secg-label') || header;
      const rect = surface.getBoundingClientRect();
      const x = Math.max(0, Math.round((e.clientX - rect.left) / editorState.zoom));
      const y = Math.max(0, Math.round((e.clientY - rect.top) / editorState.zoom));
      const newEl = makeVariableElement(header, x, y, label);
      template.elements.push(newEl);
      editorState.selectedElementId = newEl.id;
      StorageService.save(state);
      rerender();
    };
  }

  // Pointer drag for existing elements on canvas
  document.querySelectorAll('.card-el').forEach(domEl => {
    domEl.onpointerdown = (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      e.preventDefault();
      const id = domEl.getAttribute('data-el-id');
      editorState.selectedElementId = id;
      const item = template.elements.find(x => x.id === id);
      if (!item || item.locked) { rerender(); return; }

      const startX = e.clientX;
      const startY = e.clientY;
      const origX = item.x;
      const origY = item.y;

      const onMove = (mv) => {
        let nx = origX + (mv.clientX - startX) / editorState.zoom;
        let ny = origY + (mv.clientY - startY) / editorState.zoom;
        if (editorState.snapToGrid) {
          nx = Math.round(nx / 5) * 5;
          ny = Math.round(ny / 5) * 5;
        }
        item.x = Math.max(0, nx);
        item.y = Math.max(0, ny);
        domEl.style.left = `${item.x * editorState.zoom}px`;
        domEl.style.top = `${item.y * editorState.zoom}px`;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        StorageService.save(state);
        rerender();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  });

  const addItem = (item) => {
    template.elements.push(item);
    editorState.selectedElementId = item.id;
    StorageService.save(state);
    rerender();
  };
  const btnStatic = document.getElementById('btn-add-static');
  if (btnStatic) btnStatic.onclick = () => addItem({ id: uid('el'), kind: 'static', text: 'TEKS STATIS', x: 20, y: 20, w: 160, h: 20, fontSize: 11, fontWeight: '700', color: '#0f2347', align: 'left', locked: false, rotation: 0 });
  const btnPhoto = document.getElementById('btn-add-photo');
  if (btnPhoto) btnPhoto.onclick = () => addItem({ id: uid('el'), kind: 'photo', text: 'FOTO', x: 20, y: 45, w: 66, h: 84, fontSize: 10, fontWeight: '600', color: '#475569', align: 'center', locked: false, rotation: 0 });
  const btnLogo = document.getElementById('btn-add-logo');
  if (btnLogo) btnLogo.onclick = () => addItem({ id: uid('el'), kind: 'logo', text: 'LOGO', x: 250, y: 12, w: 36, h: 36, fontSize: 10, fontWeight: '600', color: '#475569', align: 'center', locked: false, rotation: 0 });
  const btnQr = document.getElementById('btn-add-qr');
  if (btnQr) btnQr.onclick = () => addItem({ id: uid('el'), kind: 'qr', header: '', label: 'QR Peserta', x: 250, y: 58, w: 52, h: 52, fontSize: 8, fontWeight: '500', color: '#0f172a', align: 'center', locked: false, rotation: 0 });

  const selStu = document.getElementById('sel-preview-student');
  if (selStu) selStu.onchange = () => { editorState.previewStudentIndex = Number(selStu.value); rerender(); };
  const chkGrid = document.getElementById('chk-snap-grid');
  if (chkGrid) chkGrid.onchange = () => { editorState.snapToGrid = chkGrid.checked; rerender(); };
  const btnZIn = document.getElementById('btn-zoom-in');
  if (btnZIn) btnZIn.onclick = () => { editorState.zoom = Math.min(2.2, Number((editorState.zoom + 0.15).toFixed(2))); rerender(); };
  const btnZOut = document.getElementById('btn-zoom-out');
  if (btnZOut) btnZOut.onclick = () => { editorState.zoom = Math.max(0.7, Number((editorState.zoom - 0.15).toFixed(2))); rerender(); };

  if (selectedEl) {
    const bindInput = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.onchange = () => { fn(el.value); StorageService.save(state); rerender(); };
    };
    bindInput('insp-binding-header', v => { selectedEl.header = v; selectedEl.autoBound = false; });
    bindInput('insp-photo-header', v => { selectedEl.header = v || ''; });
    bindInput('insp-static-text', v => { selectedEl.text = v; });
    bindInput('insp-x', v => { selectedEl.x = Number(v); });
    bindInput('insp-y', v => { selectedEl.y = Number(v); });
    bindInput('insp-w', v => { selectedEl.w = Math.max(10, Number(v)); });
    bindInput('insp-h', v => { selectedEl.h = Math.max(10, Number(v)); });
    bindInput('insp-fs', v => { selectedEl.fontSize = Math.max(6, Number(v)); });
    bindInput('insp-color', v => { selectedEl.color = v; });

    const btnLock = document.getElementById('btn-el-lock');
    if (btnLock) btnLock.onclick = () => { selectedEl.locked = !selectedEl.locked; StorageService.save(state); rerender(); };
    const btnDupEl = document.getElementById('btn-el-dup');
    if (btnDupEl) btnDupEl.onclick = () => {
      const copy = { ...selectedEl, id: uid('el'), x: selectedEl.x + 12, y: selectedEl.y + 12 };
      template.elements.push(copy);
      editorState.selectedElementId = copy.id;
      StorageService.save(state);
      rerender();
    };
    const btnDelEl = document.getElementById('btn-el-del');
    if (btnDelEl) btnDelEl.onclick = () => {
      template.elements = template.elements.filter(x => x.id !== selectedEl.id);
      editorState.selectedElementId = template.elements[0]?.id || null;
      StorageService.save(state);
      rerender();
    };
  }
}
