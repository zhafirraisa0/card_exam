import { uid } from '../utils/helpers.js';

const DB_NAME = 'secg-ready-card-files';
const STORE_NAME = 'files';

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Penyimpanan file siap cetak tidak didukung browser ini.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Penyimpanan lokal file siap cetak tidak dapat dibuka.'));
  });
}

async function runTransaction(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let result;
    try { result = callback(store); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = () => { db.close(); reject(new Error('Gagal menyimpan atau membaca file siap cetak.')); };
    tx.onabort = () => { db.close(); reject(new Error('Transaksi file siap cetak dibatalkan.')); };
  });
}

function getAllFiles(folderId) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly'); const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []).filter(file => file.folderId === folderId));
    request.onerror = () => reject(new Error('Daftar file kartu tidak dapat dibaca.'));
    tx.oncomplete = () => db.close(); tx.onerror = () => { db.close(); reject(new Error('Daftar file kartu tidak dapat dibaca.')); };
  }));
}

async function hashBlob(blob) {
  const bytes = await blob.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261; const data = new Uint8Array(bytes);
  for (const value of data) hash = Math.imul(hash ^ value, 16777619);
  return `fnv-${(hash >>> 0).toString(16)}-${data.length}`;
}

function normalizedPath(path, fileName) {
  const parts = String(path || fileName || '').replace(/\\/g, '/').split('/').filter(Boolean);
  return (parts.length > 1 ? parts.slice(1).join('/') : (parts[0] || fileName)).toLocaleLowerCase('id-ID');
}

const isSupported = file => /\.(pdf|jpe?g|png|webp)$/i.test(file.name || '') &&
  (file.type === 'application/pdf' || /^image\/(jpeg|png|webp)$/i.test(file.type) || /\.(pdf|jpe?g|png|webp)$/i.test(file.name || ''));

export const PrintAssetService = {
  isSupported,
  async addFiles(folderId, files, { onProgress } = {}) {
    const input = Array.from(files || []);
    if (!input.length) return { files: [], duplicateCount: 0 };
    const unsupported = input.filter(file => !isSupported(file));
    if (unsupported.length) throw new Error(`Folder berisi format yang tidak didukung: ${unsupported.slice(0, 3).map(file => file.name).join(', ')}. Gunakan PDF, JPG, PNG, atau WebP.`);
    const tooLarge = input.find(file => file.size > 50 * 1024 * 1024);
    if (tooLarge) throw new Error(`${tooLarge.name} melebihi batas 50 MB per file.`);
    const existing = await getAllFiles(folderId); const known = new Set(); const knownContent = new Set();
    const records = []; let duplicateCount = 0; let completed = 0; const totalWork = existing.length + input.length;
    for (const record of existing) {
      const contentKey = `${record.size}|${await hashBlob(record.blob)}`;
      knownContent.add(contentKey);
      known.add(record.fingerprint || `${normalizedPath(record.relativePath, record.fileName)}|${contentKey}`);
      completed++; onProgress?.(completed, totalWork);
    }
    for (const file of input) {
      const relativePath = file.webkitRelativePath || file.name;
      const contentKey = `${file.size}|${await hashBlob(file)}`;
      const fileFingerprint = `${normalizedPath(relativePath, file.name)}|${contentKey}`;
      if (known.has(fileFingerprint) || knownContent.has(contentKey)) { duplicateCount++; completed++; onProgress?.(completed, totalWork); continue; }
      known.add(fileFingerprint); knownContent.add(contentKey);
      const extension = file.name.split('.').pop().toLowerCase();
      const inferredType = extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
      records.push({ id: uid('cardfile'), folderId, fileName: file.name, relativePath, fingerprint: fileFingerprint, mimeType: file.type?.startsWith('image/') || file.type === 'application/pdf' ? file.type : inferredType, size: file.size, blob: file, addedAt: new Date().toISOString() });
      completed++; onProgress?.(completed, totalWork);
    }
    if (!records.length) return { files: [], duplicateCount };
    await runTransaction('readwrite', store => records.forEach(record => store.put(record)));
    return { files: records.map(({ blob, ...metadata }) => metadata), duplicateCount };
  },
  async findDuplicates(folderId) {
    const records = (await getAllFiles(folderId)).sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
    const seen = new Set(); const duplicateIds = [];
    for (const record of records) {
      const key = `${record.size}|${await hashBlob(record.blob)}`;
      if (seen.has(key)) duplicateIds.push(record.id); else seen.add(key);
    }
    return duplicateIds;
  },
  async getFile(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(new Error('File siap cetak tidak dapat dibuka.'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(new Error('File siap cetak tidak dapat dibuka.')); };
    });
  },
  async deleteFile(id) { await runTransaction('readwrite', store => store.delete(id)); },
  async deleteFiles(ids) { await runTransaction('readwrite', store => ids.forEach(id => store.delete(id))); },
  async deleteFolder(folderId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite'); const store = tx.objectStore(STORE_NAME); const request = store.openCursor();
      request.onsuccess = () => { const cursor = request.result; if (!cursor) return; if (cursor.value.folderId === folderId) cursor.delete(); cursor.continue(); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(new Error('File siap cetak kelas gagal dibersihkan.')); };
    });
  }
};
