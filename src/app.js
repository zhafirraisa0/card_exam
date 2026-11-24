import { StorageService } from './services/storageService.js';
import { CloudService } from './services/cloudService.js';
import { renderSidebar, renderTopbar } from './components/navbar.js';
import { renderAuthPage, bindAuthEvents } from './pages/authPage.js';
import { renderDashboardPage } from './pages/dashboardPage.js';
import { renderExamsPage, bindExamsEvents } from './pages/examsPage.js';
import { renderFoldersPage, bindFoldersEvents } from './pages/foldersPage.js';
import { renderStudentsPage, bindStudentsEvents } from './pages/studentsPage.js';
import { renderPhotosPage, bindPhotosEvents } from './pages/photosPage.js';
import { renderTemplatesPage, bindTemplatesEvents } from './pages/templatesPage.js';
import { renderValidationPage } from './pages/validationPage.js';
import { renderPrintPage, bindPrintEvents } from './pages/printPage.js';
import { renderSettingsPage, bindSettingsEvents } from './pages/settingsPage.js';

const state = StorageService.load();
// Kredit footer dapat diganti di sini: nama yang tampil pada bagian bawah setiap halaman.
const FOOTER_CREDIT = 'Zhafir Raisa Adhitia Lukieto';
// Temporary local testing switch. Set false to restore Supabase login.
const DEV_BYPASS_AUTH = true;
state.devBypassAuth = DEV_BYPASS_AUTH;
if (DEV_BYPASS_AUTH) {
  state.schoolProfile ||= { schoolName: 'Mode Tes Lokal', schoolId: '', logoDataUrl: '' };
  state.schoolProfile.schoolId = '';
  state.schoolProfile.schoolSlug = '';
  state.isAuthenticated = true;
  state.cloudStatus = 'Mode tes lokal';
} else {
  state.isAuthenticated = false;
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;

  if (!state.schoolProfile || !state.isAuthenticated) {
    root.innerHTML = renderAuthPage(state, render);
    bindAuthEvents(state, render);
    return;
  }

  let pageHtml = '';
  switch (state.activeRoute) {
    case 'exams': pageHtml = renderExamsPage(state); break;
    case 'folders': pageHtml = renderFoldersPage(state); break;
    case 'students': pageHtml = renderStudentsPage(state); break;
    case 'photos': pageHtml = renderPhotosPage(state); break;
    case 'templates': pageHtml = renderTemplatesPage(state); break;
    case 'validation': pageHtml = renderValidationPage(state); break;
    case 'print': pageHtml = renderPrintPage(state); break;
    case 'settings': pageHtml = renderSettingsPage(state); break;
    default: pageHtml = renderDashboardPage(state); break;
  }

  root.innerHTML = `
    <div class="app-shell">
      ${renderSidebar(state)}
      <div class="main-area">
        ${renderTopbar(state)}
        <main class="content-body">${pageHtml}</main>
        <footer class="app-footer"><span>ExamCard <span aria-hidden="true">·</span> Sistem Kartu Ujian</span><span>Dikembangkan oleh <strong>${FOOTER_CREDIT}</strong></span></footer>
      </div>
    </div>
  `;
  hydrateQrCodes(root);

  document.querySelectorAll('[data-route]').forEach(btn => {
    btn.onclick = () => {
      state.activeRoute = btn.getAttribute('data-route');
      StorageService.save(state);
      render();
    };
  });

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.onclick = () => {
      state.activeRoute = btn.getAttribute('data-goto');
      StorageService.save(state);
      render();
    };
  });

  document.querySelectorAll('[data-grade-overview]').forEach(btn => {
    btn.onclick = () => {
      state.folderLevelView = btn.getAttribute('data-grade-overview');
      state.activeRoute = 'folders';
      StorageService.save(state);
      render();
    };
  });

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      try { await (await import('./services/cloudService.js')).CloudService.signOut(); }
      catch (error) { console.error(error); }
      state.isAuthenticated = false;
      render();
    };
  }

  if (state.activeRoute === 'exams') bindExamsEvents(state, render);
  if (state.activeRoute === 'folders') bindFoldersEvents(state, render);
  if (state.activeRoute === 'students') bindStudentsEvents(state, render);
  if (state.activeRoute === 'photos') bindPhotosEvents(state, render);
  if (state.activeRoute === 'templates') bindTemplatesEvents(state, render);
  if (state.activeRoute === 'print') bindPrintEvents(state, render);
  if (state.activeRoute === 'settings') bindSettingsEvents(state, render);
}

function hydrateQrCodes(root) {
  const qrNodes = root.querySelectorAll('[data-qr-value]');
  qrNodes.forEach(node => {
    if (node.dataset.qrReady || !node.dataset.qrValue) return;
    if (typeof QRCode === 'undefined') { node.textContent = 'QR library belum dimuat'; return; }
    try {
      const side = Math.max(48, Math.floor(Math.min(node.clientWidth || 80, node.clientHeight || 80)));
      new QRCode(node, { text: node.dataset.qrValue, width: side, height: side, colorDark: '#111827', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
      node.dataset.qrReady = 'true';
    } catch (error) { node.textContent = 'QR tidak valid'; console.error('QR generation:', error); }
  });
}

if (DEV_BYPASS_AUTH) {
  render();
} else {
document.getElementById('app').innerHTML = '<div class="auth-wrapper"><div class="auth-card">Connecting to secure workspace…</div></div>';
StorageService.initialize(state).then(async () => {
  if (state.isAuthenticated) {
    state.operatorLogs = await CloudService.recentLogs().catch(() => []);
    await CloudService.subscribeWorkspace(payload => {
      if (state.cloudStatus === 'Menyimpan...') return;
      const activeRoute = state.activeRoute; const operatorName = state.operatorName; const schoolProfile = state.schoolProfile;
      Object.assign(state, { ...payload, activeRoute, operatorName, schoolProfile, isAuthenticated: true, cloudStatus: 'Tersinkronisasi' });
      render();
    });
  }
}).catch(error => { console.error('Workspace initialization:', error); state.cloudStatus = 'Cloud tidak tersedia'; }).finally(render);
}
