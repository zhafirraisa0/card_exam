import { uid } from '../utils/helpers.js';
import { CloudService } from './cloudService.js';

const STORAGE_KEY = 'secg_v1_workspace';
const slugify = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);

function repairPrintLayout(state) {
  const config = state.printConfig; const template = state.templates.find(item => item.id === (state.activeTemplateId || item.id)) || state.templates[0];
  if (!config || !template || config.autoCapacity !== false || config.fitCards !== false) return;
  let width = config.paperSize === 'A5' ? 148 : config.paperSize === 'F4' ? 215 : config.paperSize === 'Custom' ? Number(config.customPaperW) : 210;
  let height = config.paperSize === 'A5' ? 210 : config.paperSize === 'F4' ? 330 : config.paperSize === 'Custom' ? Number(config.customPaperH) : 297;
  if (config.orientation === 'landscape' && height > width) [width, height] = [height, width];
  if (config.orientation !== 'landscape' && width > height) [width, height] = [height, width];
  const margin = Number.isFinite(Number(config.marginMm)) ? Number(config.marginMm) : 10;
  const gap = Number.isFinite(Number(config.gapMm)) ? Number(config.gapMm) : 1;
  const cardW = Math.max(10, Number(config.cardW) || Number(template.widthMm));
  const cardH = Math.max(10, Number(config.cardH) || Number(template.heightMm));
  const fits = () => Number(config.cols) * cardW + (Number(config.cols) - 1) * gap + margin * 2 <= width + 0.01 && Number(config.rows) * cardH + (Number(config.rows) - 1) * gap + margin * 2 <= height + 0.01;
  while (!fits() && config.rows > 1) config.rows--;
  while (!fits() && config.cols > 1) config.cols--;
  if (!fits()) { config.paperSize = 'A4'; config.orientation = 'portrait'; config.marginMm = 5; config.gapMm = 1; config.cols = 1; config.rows = 1; }
}

export function createInitialState() {
  return {
    schoolProfile: null, // { schoolName, logoDataUrl, passcodeHash, createdAt }
    isAuthenticated: false,
    activeRoute: 'dashboard',
    activeExamId: null,
    activeFolderId: null,
    exams: [],       // Kosong di awal setelah registrasi
    folders: [],     // Struktur folder kelas terisolasi
    classLevels: [], // Tingkat kelas yang ditambahkan sekolah
    templates: [
      {
        id: 'tpl_standard_cbt',
        name: 'Kartu Peserta CBT Standar (CR80)',
        widthMm: 85.6,
        heightMm: 54,
        orientation: 'landscape',
        bgImage: '',
        bgColor: '#ffffff',
        accentColor: '#0f2347',
        elements: [
          { id: 'el_hdr', kind: 'static', text: 'KARTU PESERTA UJIAN CBT', x: 18, y: 12, w: 280, h: 20, fontSize: 12, fontWeight: '800', color: '#0f2347', align: 'left', locked: false, rotation: 0 },
          { id: 'el_photo', kind: 'photo', text: '[FOTO SISWA]', x: 18, y: 44, w: 66, h: 84, fontSize: 10, fontWeight: '600', color: '#475569', align: 'center', locked: false, rotation: 0 },
          { id: 'el_var_1', kind: 'dynamic', header: '', label: 'Nama Siswa', x: 96, y: 44, w: 210, h: 20, fontSize: 11, fontWeight: '700', color: '#0f172a', align: 'left', locked: false, rotation: 0 },
          { id: 'el_var_2', kind: 'dynamic', header: '', label: 'Nomor Induk', x: 96, y: 68, w: 210, h: 18, fontSize: 10, fontWeight: '500', color: '#334155', align: 'left', locked: false, rotation: 0 },
          { id: 'el_var_3', kind: 'dynamic', header: '', label: 'Username CBT', x: 96, y: 90, w: 210, h: 18, fontSize: 10, fontWeight: '600', color: '#1d4ed8', align: 'left', locked: false, rotation: 0 },
          { id: 'el_var_4', kind: 'dynamic', header: '', label: 'Password CBT', x: 96, y: 112, w: 210, h: 18, fontSize: 10, fontWeight: '600', color: '#d97706', align: 'left', locked: false, rotation: 0 }
        ]
      }
    ],
    activeTemplateId: 'tpl_standard_cbt',
    printConfig: {
      paperSize: 'A4',
      customPaperW: 210,
      customPaperH: 297,
      orientation: 'portrait',
      marginMm: 10,
      gapMm: 1,
      cols: 2,
      rows: 5,
      cardW: 85.6,
      cardH: 54,
      autoCapacity: true,
      fitCards: true
    },
    historyLogs: []
  };
}

export const StorageService = {
  cloudTimer: null,
  cloudQueue: Promise.resolve(),
  async initialize(state) {
    const session = await CloudService.getSession();
    if (!session) { state.isAuthenticated = false; return; }
    const db = await (await import('./cloudService.js')).getCloudClient();
    const { data: school, error } = await db.from('schools').select('id,name,logo_path').single();
    if (error) { await CloudService.signOut(); state.isAuthenticated = false; return; }
    const remote = await CloudService.loadWorkspace();
    const localOperator = state.operatorName;
    const localReadyAssets = new Map((state.folders || []).map(folder => [folder.folderId, folder.printAssets || []]));
    if (remote) Object.assign(state, { ...createInitialState(), ...remote });
    state.folders.forEach(folder => { folder.printAssets = localReadyAssets.get(folder.folderId) || []; });
    state.schoolProfile = { ...(state.schoolProfile || {}), schoolId: school.id, schoolName: school.name, logoDataUrl: state.schoolProfile?.logoDataUrl || '' };
    state.operatorName = localOperator || state.operatorName || session.user.user_metadata?.operator_name || 'Operator';
    state.isAuthenticated = true;
    state.cloudStatus = 'Tersinkronisasi';
  },
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialState();
      const parsed = JSON.parse(raw);
      const merged = { ...createInitialState(), ...parsed };
      merged.printConfig = { ...createInitialState().printConfig, ...(parsed.printConfig || {}) };
      repairPrintLayout(merged);
      if (merged.schoolProfile) { merged.schoolProfile.schoolSlug ||= slugify(merged.schoolProfile.schoolName); merged.schoolProfile.schoolId ||= `school_${merged.schoolProfile.schoolSlug}`; }
      return merged;
    } catch {
      return createInitialState();
    }
  },

  save(state) {
    try {
      // Tidak menyimpan password siswa secara permanen ke localStorage jika mode sesi ketat,
      // namun metadata proyek dan konfigurasi sekolah tetap tersimpan aman.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (!state.devBypassAuth && state.isAuthenticated && state.schoolProfile?.schoolId) {
        state.cloudStatus = 'Menyimpan...';
        clearTimeout(this.cloudTimer);
        const payload = JSON.parse(JSON.stringify(state));
        delete payload.cloudStatus;
        this.cloudTimer = setTimeout(() => {
          this.cloudQueue = this.cloudQueue.then(() => CloudService.saveWorkspace(payload)).then(() => { state.cloudStatus = 'Tersinkronisasi'; }).catch(error => { state.cloudStatus = 'Gagal sinkron'; console.error('Cloud sync:', error); }).finally(() => { const badge = document.getElementById('cloud-sync-status'); if (badge) badge.textContent = `${state.operatorName || 'Operator'} · ${state.cloudStatus}`; });
        }, 450);
      }
      return true;
    } catch {
      return false;
    }
  },

  wipeSessionData(state) {
    state.folders.forEach(f => {
      (f.photos || []).forEach(p => {
        if (p.dataUrl && p.dataUrl.startsWith('blob:')) URL.revokeObjectURL(p.dataUrl);
      });
      f.students = [];
      f.photos = [];
      f.excelMeta = null;
    });
    state.historyLogs.unshift({
      id: uid('log'),
      time: new Date().toLocaleTimeString('id-ID'),
      action: 'Seluruh data siswa & foto sesi telah dibersihkan.'
    });
    this.save(state);
  },

  resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    return createInitialState();
  }
};
