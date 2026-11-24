import { escapeHtml } from '../utils/helpers.js';
import { FolderService } from '../services/folderService.js';
import { CardService } from '../services/cardService.js';

export function renderValidationPage(state) {
  const folder = FolderService.getActiveFolder(state);
  const checks = CardService.runPreGenerationValidation(state, folder);
  const hasError = checks.some(c => c.level === 'error');

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Pre-Generation Validation</h3>
          <div style="font-size:12.5px;color:#64748b;">Pemeriksaan otomatis integritas sumber Excel, binding variabel, dan kelengkapan foto sebelum pencetakan massal.</div>
        </div>
        <button type="button" class="btn btn-primary" data-goto="print" ${hasError ? 'disabled' : ''}>Lanjut ke Cetak & PDF</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${checks.map(c => {
          const badgeCls = c.level === 'valid' ? 'badge-green' : c.level === 'info' ? 'badge-blue' : c.level === 'warning' ? 'badge-amber' : 'badge-red';
          return `
            <div style="padding:12px 14px;border:1px solid #dbe3ef;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div>
                <div style="font-weight:700;color:#0f2347;">${escapeHtml(c.title)}</div>
                <div style="font-size:13px;color:#475569;">${escapeHtml(c.detail)}</div>
              </div>
              <span class="badge ${badgeCls}">${c.level.toUpperCase()}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
