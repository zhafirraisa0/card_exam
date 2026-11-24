import { uid, normalizeKey } from '../utils/helpers.js';

async function compressedPhotoUrl(file) {
  let bitmap; let objectUrl;
  try {
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file);
    else {
      objectUrl = URL.createObjectURL(file);
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Foto tidak dapat dibaca.')); image.src = objectUrl;
      });
    }
    const width = bitmap.width; const height = bitmap.height;
    if (!width || !height) throw new Error('Ukuran foto tidak valid.');
    const scale = Math.min(1, 960 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    bitmap?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Photo Matching Per Folder:
 * Foto dicocokkan lebih dulu melalui referensi nama file Excel, lalu ID siswa.
 */
export const PhotoService = {
  resolveStudentPhoto(folder, student, header = '') {
    if (!folder || !student) return null;
    if (header) {
      const reference = String(student.fields?.[header] ?? '').split(/[\\/]/).pop().replace(/[?#].*$/, '').replace(/\.[^.]+$/, '');
      const key = normalizeKey(reference);
      if (key) {
        const referenced = (folder.photos || []).find(photo => normalizeKey(photo.baseName || String(photo.fileName || '').replace(/\.[^.]+$/, '')) === key);
        if (referenced) return referenced;
      }
    }
    return (folder.photos || []).find(photo => photo.photoId === student.photoId) || null;
  },

  readPhotoFiles(fileList, { onProgress } = {}) {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const tasks = Array.from(fileList || [])
      .filter(file => allowed.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name));
    const output = new Array(tasks.length); let cursor = 0; let completed = 0;
    const worker = async () => {
      while (cursor < tasks.length) {
        const index = cursor++; const file = tasks[index];
        try {
          if (file.size > 15 * 1024 * 1024) throw new Error('Foto lebih besar dari 15 MB.');
          output[index] = { photoId: uid('pho'), fileName: file.name, baseName: file.name.replace(/\.[^.]+$/, ''), size: file.size, dataUrl: await compressedPhotoUrl(file), matchedStudentId: null };
        } catch (error) { output[index] = null; console.warn(`Foto ${file.name} gagal diproses:`, error); }
        completed++; onProgress?.(completed, tasks.length);
      }
    };
    return Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker)).then(() => output.filter(Boolean));
  },

  autoMatchFolderPhotos(folder) {
    if (!folder || !folder.students?.length || !folder.photos?.length) {
      return { matchedCount: 0, ambiguous: [], unmatchedPhotos: folder?.photos || [] };
    }
    const headers = folder.excelMeta?.columns?.map(c => c.originalHeader) || Object.keys(folder.students[0].fields || {});
    const pickHeaders = (regex) => headers.filter(h => regex.test(h));
    const fileRefKey = value => normalizeKey(String(value ?? '').split(/[\\/]/).pop().replace(/[?#].*$/, '').replace(/\.[^.]+$/, ''));

    const priorityGroups = [
      pickHeaders(/(foto|photo|gambar|image|pas ?foto)/i),
      pickHeaders(/^nis$/i),
      pickHeaders(/nisn/i),
      pickHeaders(/(no.*peserta|nomor.*peserta|no.*induk|peserta)/i),
      pickHeaders(/(nama)/i)
    ];

    let matchedCount = 0;
    const ambiguous = [];

    folder.photos.forEach(photo => {
      if (photo.matchedStudentId && folder.students.some(s => s.studentId === photo.matchedStudentId)) {
        matchedCount++;
        return;
      }
      const key = normalizeKey(photo.baseName);
      if (!key) return;

      for (const groupHeaders of priorityGroups) {
        if (!groupHeaders.length) continue;
        const candidates = folder.students.filter(stu => (!stu.photoId || stu.photoId === photo.photoId) && groupHeaders.some(h => fileRefKey(stu.fields[h]) === key));
        if (candidates.length === 1) {
          const target = candidates[0];
          target.photoId = photo.photoId;
          photo.matchedStudentId = target.studentId;
          matchedCount++;
          return;
        }
        if (candidates.length > 1) {
          ambiguous.push({ photo, candidates });
          return;
        }
      }
    });

    const unmatchedPhotos = folder.photos.filter(p => !p.matchedStudentId);
    return { matchedCount, ambiguous, unmatchedPhotos };
  }
};
