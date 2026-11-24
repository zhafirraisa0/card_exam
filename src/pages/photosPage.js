import { escapeHtml, showToast } from '../utils/helpers.js';
import { FolderService } from '../services/folderService.js';
import { PhotoService } from '../services/photoService.js';
import { StorageService } from '../services/storageService.js';
import { openPhotoCropModal } from '../components/photoCropper.js';

export function renderPhotosPage(state) {
  const folder = FolderService.getActiveFolder(state);
  if (!folder) return `<div class="panel"><div class="empty-state">Pilih tingkat dan kelas terlebih dahulu untuk mengelola foto siswa.<button type="button" class="btn btn-primary" data-goto="folders">Pilih kelas</button></div></div>`;
  const students = folder.students || []; const photos = folder.photos || [];
  const matched = students.filter(student => student.photoId).length;
  return `<div><section class="page-intro"><div><span class="eyebrow">FOTO PESERTA · ${escapeHtml(folder.level)}</span><h1>${escapeHtml(folder.className)}</h1><p>Unggah foto massal; nama berkas berbasis NIS atau NISN akan dipasangkan otomatis. Foto dioptimalkan sebelum disimpan.</p></div><span class="intro-count">${matched}/${students.length} foto cocok</span></section>
    <div class="panel" style="margin-bottom:16px"><div class="panel-header"><div><h2 class="panel-title">Unggah foto siswa</h2><p class="muted-copy" style="margin:4px 0 0">JPG, PNG, WebP · maksimal 15 MB per foto · unggah banyak berkas sekaligus</p></div><button type="button" class="btn btn-outline btn-sm" id="btn-run-automatch">Cocokkan ulang</button></div>
      <div class="photo-upload-options"><label class="file-drop photo-file-drop is-recommended" for="inp-photo-folder"><span class="file-drop-icon">Folder</span><strong>Pilih folder foto <span class="recommended-label">Disarankan</span></strong><span>Nama berkas dicocokkan dengan NIS/NISN atau kolom Foto di Excel</span><input type="file" id="inp-photo-folder" accept="image/jpeg,image/png,image/webp" webkitdirectory directory multiple /></label><label class="file-drop photo-file-drop" for="inp-batch-photos"><span class="file-drop-icon">↑</span><strong>Pilih foto satuan</strong><span>${students.length ? `${photos.length} foto tersimpan di kelas ini` : 'Impor data siswa terlebih dahulu agar foto dapat dipasangkan'}</span><input type="file" id="inp-batch-photos" accept="image/jpeg,image/png,image/webp" multiple /></label></div><div id="photo-upload-status" class="import-status" role="status" aria-live="polite">${students.length ? 'Nama foto seperti 001234.jpg akan dicocokkan ke kolom NIS/NISN.' : 'Foto dapat diunggah sekarang dan dicocokkan setelah data siswa diimpor.'}</div>
    </div>
    <div class="panel"><div class="panel-header"><h2 class="panel-title">Pasangan foto <span class="count-muted">${students.length} siswa · ${photos.length} file</span></h2></div>
      ${students.length ? `<div class="table-wrap"><table><thead><tr><th>Nama / nomor siswa</th><th>Foto terpasang</th><th>Pasangkan manual</th><th>Crop</th></tr></thead><tbody>${students.map(student=>{const fields=Object.values(student.fields||{});const photo=photos.find(item=>item.photoId===student.photoId);return `<tr><td><strong>${escapeHtml(fields[0]||student.studentId)}</strong><div class="mono" style="font-size:11px;color:#74827b">${escapeHtml(fields[1]||'')}</div></td><td>${photo?`<div style="display:flex;align-items:center;gap:8px"><img src="${photo.dataUrl}" alt="Foto ${escapeHtml(fields[0]||'siswa')}" style="width:36px;height:46px;object-fit:cover;border-radius:6px;border:1px solid #dbe3df"><span style="font-size:12px">${escapeHtml(photo.fileName)}</span></div>`:'<span class="badge badge-amber">Belum ada</span>'}</td><td><select class="select" data-manual-photo="${student.studentId}" style="max-width:220px"><option value="">— Pilih foto —</option>${photos.map(item=>`<option value="${item.photoId}" ${student.photoId===item.photoId?'selected':''}>${escapeHtml(item.fileName)}</option>`).join('')}</select></td><td><button type="button" class="btn btn-outline btn-sm" data-crop-stu="${student.studentId}" ${photo?'':'disabled'}>Atur crop</button></td></tr>`}).join('')}</tbody></table></div>`:`<div class="empty-state">Belum ada data siswa di kelas ini. <button type="button" class="btn btn-outline btn-sm" data-goto="students">Impor data Excel</button></div>`}
    </div></div>`;
}

export function bindPhotosEvents(state, rerender) {
  const folder = FolderService.getActiveFolder(state); if (!folder) return;
  document.querySelectorAll('#inp-batch-photos, #inp-photo-folder').forEach(input => input.addEventListener('change', async event => {
    const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length) return;
    const status = document.getElementById('photo-upload-status'); const drop = input.closest('.file-drop');
    const oldPhotos = folder.photos || []; const oldMatches = (folder.students || []).map(student=>[student,student.photoId]);
    input.disabled = true; drop?.classList.add('is-loading');
    if (status) { status.className='import-status is-loading'; status.textContent=`Menyiapkan ${files.length} foto…`; }
    try {
      const loaded = await PhotoService.readPhotoFiles(files,{onProgress:(done,total)=>{if(status)status.textContent=`Mengoptimalkan foto ${done} dari ${total}…`;}});
      if (!loaded.length) throw new Error('Foto tidak dapat diproses. Periksa format dan ukuran file (maksimal 15 MB).');
      folder.photos=[...oldPhotos,...loaded]; const result=PhotoService.autoMatchFolderPhotos(folder);
      if (!StorageService.save(state)) { folder.photos=oldPhotos; oldMatches.forEach(([student,photoId])=>student.photoId=photoId); throw new Error('Penyimpanan browser penuh. Hapus foto lama atau kurangi jumlah foto.'); }
      if(status){status.className='import-status';status.textContent=`${loaded.length} foto disiapkan · ${result.matchedCount} cocok otomatis · ${files.length-loaded.length} gagal diproses.`;}
      showToast(`${loaded.length} foto ditambahkan; ${result.matchedCount} cocok otomatis.`,'success'); rerender();
    } catch(error) { if(status){status.className='import-status is-error';status.textContent=error.message;} showToast(error.message,'error'); }
    finally { input.disabled=false; drop?.classList.remove('is-loading'); }
  }));
  document.getElementById('btn-run-automatch')?.addEventListener('click',()=>{const result=PhotoService.autoMatchFolderPhotos(folder);StorageService.save(state);showToast(`${result.matchedCount} foto cocok dengan data siswa.`,'success');rerender();});
  document.querySelectorAll('[data-manual-photo]').forEach(select=>select.addEventListener('change',()=>{
    const student=folder.students.find(item=>item.studentId===select.dataset.manualPhoto);const photoId=select.value||null;
    const claimedBy=photoId&&folder.students.find(item=>item.studentId!==student?.studentId&&item.photoId===photoId);
    if(claimedBy){showToast('Foto tersebut sudah terpasang pada siswa lain.','error');select.value=student?.photoId||'';return;}
    const previous=folder.photos.find(item=>item.photoId===student?.photoId);if(previous&&previous.photoId!==photoId)previous.matchedStudentId=null;
    if(student)student.photoId=photoId;const photo=folder.photos.find(item=>item.photoId===photoId);if(photo)photo.matchedStudentId=student?.studentId||null;
    StorageService.save(state);rerender();
  }));
  document.querySelectorAll('[data-crop-stu]').forEach(button=>button.addEventListener('click',()=>{
    const student=folder.students.find(item=>item.studentId===button.dataset.cropStu);const photo=folder.photos.find(item=>item.photoId===student?.photoId);
    if(student&&photo)openPhotoCropModal(student,photo,()=>{StorageService.save(state);showToast('Posisi foto disimpan.','success');rerender();});
  }));
}
