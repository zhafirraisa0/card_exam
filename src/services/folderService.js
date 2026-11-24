import { uid } from '../utils/helpers.js';

/**
 * Folder Management Per Kelas (Isolasi class_id & folder_id).
 */
export const FolderService = {
  clearFolderData(state, folderId) {
    const folder = state.folders.find(item => item.folderId === folderId);
    if (!folder) throw new Error('Folder kelas tidak ditemukan.');
    (folder.photos || []).forEach(photo => {
      if (photo.dataUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.dataUrl);
    });
    folder.students = [];
    folder.photos = [];
    folder.excelMeta = null;
    folder.generatedCards = [];
    return folder;
  },

  createFolder(state, { level = 'IX', className, examId = null }) {
    const cleanClass = String(className || '').trim();
    if (!cleanClass) throw new Error('Nama kelas wajib diisi.');
    const cleanLevel = String(level || 'Umum').trim();
    const toLevelKey = value => {
      const text = String(value || '').trim().toUpperCase().replace(/^KELAS\s+/, '');
      const roman = { I:'1',II:'2',III:'3',IV:'4',V:'5',VI:'6',VII:'7',VIII:'8',IX:'9',X:'10',XI:'11',XII:'12' };
      return roman[text] || text.replace(/^0+/, '');
    };
    const duplicate = state.folders.some(folder => toLevelKey(folder.level) === toLevelKey(cleanLevel) && folder.className.trim().toLocaleLowerCase('id-ID') === cleanClass.toLocaleLowerCase('id-ID'));
    if (duplicate) throw new Error(`${cleanClass} sudah terdaftar pada tingkat ${cleanLevel}.`);
    const folder = {
      folderId: uid('fld'),
      classId: uid('cls'),
      examId: examId || state.activeExamId || null,
      level: cleanLevel,
      className: cleanClass,
      excelMeta: null,
      students: [],
      photos: [],
      printAssets: [],
      templateId: state.activeTemplateId,
      generatedCards: [],
      createdAt: new Date().toISOString()
    };
    state.folders.push(folder);
    state.activeFolderId = folder.folderId;
    return folder;
  },

  getActiveFolder(state) {
    return state.folders.find(f => f.folderId === state.activeFolderId) || state.folders[0] || null;
  },

  renameFolder(state, folderId, newName) {
    const f = state.folders.find(item => item.folderId === folderId);
    if (!f) throw new Error('Folder kelas tidak ditemukan.');
    const clean = String(newName || '').trim();
    if (!clean) throw new Error('Nama baru tidak boleh kosong.');
    f.className = clean;
    return f;
  },

  deleteFolder(state, folderId) {
    const idx = state.folders.findIndex(item => item.folderId === folderId);
    if (idx === -1) return false;
    (state.folders[idx].photos || []).forEach(p => {
      if (p.dataUrl && p.dataUrl.startsWith('blob:')) URL.revokeObjectURL(p.dataUrl);
    });
    state.folders.splice(idx, 1);
    if (state.activeFolderId === folderId) {
      state.activeFolderId = state.folders[0]?.folderId || null;
    }
    return true;
  },

  deleteLevel(state, level) {
    const roman = { I:'1', II:'2', III:'3', IV:'4', V:'5', VI:'6', VII:'7', VIII:'8', IX:'9', X:'10', XI:'11', XII:'12' };
    const keyOf = value => {
      const token = String(value || '').trim().toUpperCase().replace(/^KELAS\s*/, '');
      return roman[token] || token.replace(/^0+/, '') || '0';
    };
    const target = keyOf(level);
    const removedFolders = state.folders.filter(folder => keyOf(folder.level) === target);
    removedFolders.forEach(folder => (folder.photos || []).forEach(photo => {
      if (photo.dataUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.dataUrl);
    }));
    state.folders = state.folders.filter(folder => keyOf(folder.level) !== target);
    state.classLevels = (state.classLevels || []).filter(item => keyOf(item) !== target);
    if (removedFolders.some(folder => folder.folderId === state.activeFolderId)) {
      state.activeFolderId = state.folders[0]?.folderId || null;
    }
    return {
      classCount: removedFolders.length,
      studentCount: removedFolders.reduce((count, folder) => count + (folder.students?.length || 0), 0),
      photoCount: removedFolders.reduce((count, folder) => count + (folder.photos?.length || 0), 0)
    };
  }
};
