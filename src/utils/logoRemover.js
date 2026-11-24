/**
 * Penghapus latar belakang logo otomatis berbasis Edge-Connected Flood-Fill + Feathering.
 * Mempertahankan bagian dalam emblem/teks yang memiliki warna terang agar tidak ikut terhapus.
 */
export const LogoBackgroundRemover = {
  loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('File harus berupa gambar (PNG, JPG, JPEG, WEBP).'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ img, originalDataUrl: reader.result });
        img.onerror = () => reject(new Error('Gagal memuat gambar logo.'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Gagal membaca berkas dari perangkat.'));
      reader.readAsDataURL(file);
    });
  },

  removeBackground(img, options = {}) {
    const tolerance = Number(options.tolerance ?? 36);
    const feather = Number(options.feather ?? 14);
    const maxDim = 2048;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Sample 4 corners to estimate outer background RGB
    const corners = [
      0,
      (w - 1) * 4,
      ((h - 1) * w) * 4,
      ((h - 1) * w + (w - 1)) * 4
    ];
    let bgR = 0, bgG = 0, bgB = 0, count = 0;
    for (const idx of corners) {
      if (data[idx + 3] > 200) {
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        count++;
      }
    }
    if (count === 0) return canvas.toDataURL('image/png');
    bgR /= count; bgG /= count; bgB /= count;

    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0, tail = 0;

    const colorDist = (pIdx) => {
      const dr = data[pIdx] - bgR;
      const dg = data[pIdx + 1] - bgG;
      const db = data[pIdx + 2] - bgB;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    const enqueue = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const pos = y * w + x;
      if (visited[pos]) return;
      const pIdx = pos * 4;
      if (colorDist(pIdx) <= tolerance + feather) {
        visited[pos] = 1;
        queue[tail++] = pos;
      }
    };

    for (let x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h - 1); }
    for (let y = 0; y < h; y++) { enqueue(0, y); enqueue(w - 1, y); }

    while (head < tail) {
      const pos = queue[head++];
      const pIdx = pos * 4;
      const dist = colorDist(pIdx);
      if (dist <= tolerance) {
        data[pIdx + 3] = 0;
      } else if (dist <= tolerance + feather) {
        const ratio = (dist - tolerance) / Math.max(1, feather);
        data[pIdx + 3] = Math.round(data[pIdx + 3] * ratio);
      }
      const x = pos % w;
      const y = (pos - x) / w;
      if (dist <= tolerance) {
        enqueue(x + 1, y);
        enqueue(x - 1, y);
        enqueue(x, y + 1);
        enqueue(x, y - 1);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }
};
