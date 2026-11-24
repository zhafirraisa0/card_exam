import { escapeHtml, showToast } from '../utils/helpers.js';
import { CloudService } from '../services/cloudService.js';
import { StorageService } from '../services/storageService.js';

export function renderAuthPage(state) {
  return `<div class="auth-wrapper"><section class="auth-brand-pane"><div><div class="auth-badge">WORKSPACE UJIAN SEKOLAH</div><h1 style="font-size:34px;line-height:1.2;margin:20px 0 14px;font-weight:800">SCHOOL EXAM CARD GENERATOR</h1><p style="color:#cbd5e1;font-size:15px;max-width:460px">Satu workspace cloud untuk operator sekolah, data kelas, foto, template, dan pencetakan kartu.</p></div><div style="font-size:12.5px;color:#94a3b8">Data disimpan di Supabase dan dilindungi kebijakan tenant.</div></section><section class="auth-form-pane"><form class="auth-card" id="form-login-school"><h2 style="margin:0 0 6px;font-size:22px;color:#0f2347">Login Operator</h2><p style="margin:0 0 18px;font-size:13px;color:#64748b">Gunakan nama sekolah dan password workspace. Nama operator dicatat di aktivitas.</p><label class="form-label" for="login-school-name">Nama Sekolah</label><input class="input" id="login-school-name" required autocomplete="organization"/><label class="form-label" for="login-operator" style="margin-top:12px">Nama Operator</label><input class="input" id="login-operator" placeholder="Contoh: Budi"/><label class="form-label" for="login-passcode" style="margin-top:12px">Password Sekolah</label><input type="password" class="input" id="login-passcode" required autocomplete="current-password"/><button type="submit" class="btn btn-primary" style="width:100%;padding:11px;margin:16px 0 10px">Masuk ke Workspace</button><button type="button" class="btn btn-outline btn-sm" id="btn-show-register" style="width:100%">Daftarkan Sekolah Baru</button></form><form class="auth-card" id="form-register-school" hidden><h2 style="margin:0 0 6px;font-size:22px;color:#0f2347">Registrasi Sekolah</h2><p style="font-size:13px;color:#64748b">Nama sekolah harus unik. Password sekolah diproses oleh Supabase Auth.</p><label class="form-label">Nama Sekolah</label><input class="input" id="reg-school-name" required/><label class="form-label" style="margin-top:12px">Nama Operator</label><input class="input" id="reg-operator" required/><label class="form-label" style="margin-top:12px">Password Sekolah (minimal 8 karakter)</label><input type="password" class="input" id="reg-passcode" minlength="8" required/><label class="form-label" style="margin-top:12px">Kode Aktivasi (jika diwajibkan)</label><input class="input" id="reg-license"/><button class="btn btn-primary" style="width:100%;padding:11px;margin:16px 0 10px">Buat Workspace</button><button type="button" class="btn btn-outline btn-sm" id="btn-show-login" style="width:100%">Kembali ke Login</button></form></section></div>`;
}

export function bindAuthEvents(state, rerender) {
  const login = document.getElementById('form-login-school');
  const registration = document.getElementById('form-register-school');
  document.getElementById('btn-show-register').onclick = () => { login.hidden = true; registration.hidden = false; };
  document.getElementById('btn-show-login').onclick = () => { registration.hidden = true; login.hidden = false; };
  login.onsubmit = async e => {
    e.preventDefault(); const button = login.querySelector('[type=submit]'); button.disabled = true; button.textContent = 'Menghubungkan...';
    try {
      const result = await CloudService.login(document.getElementById('login-school-name').value, document.getElementById('login-passcode').value, document.getElementById('login-operator').value);
      const fresh = await CloudService.loadWorkspace(); if (fresh) Object.assign(state, { ...state, ...fresh });
      state.schoolProfile = { ...(state.schoolProfile || {}), schoolId: result.school.id, schoolName: result.school.name, logoDataUrl: state.schoolProfile?.logoDataUrl || '' };
      state.operatorName = result.operatorName; state.isAuthenticated = true; state.activeRoute = 'dashboard'; state.cloudStatus = 'Tersinkronisasi'; state.operatorLogs = await CloudService.recentLogs().catch(() => []); StorageService.save(state); await CloudService.subscribeWorkspace(payload => { if (state.cloudStatus === 'Menyimpan...') return; const route=state.activeRoute, operator=state.operatorName, profile=state.schoolProfile; Object.assign(state,{...payload,activeRoute:route,operatorName:operator,schoolProfile:profile,isAuthenticated:true,cloudStatus:'Tersinkronisasi'}); rerender(); }); rerender();
    } catch (error) { showToast(error.message || 'Login gagal.', 'error'); button.disabled = false; button.textContent = 'Masuk ke Workspace'; }
  };
  registration.onsubmit = async e => {
    e.preventDefault(); const button = registration.querySelector('[type=submit]'); button.disabled = true; button.textContent = 'Membuat workspace...';
    try {
      const name = document.getElementById('reg-school-name').value.trim(); const operatorName = document.getElementById('reg-operator').value.trim();
      const result = await CloudService.registerSchool({ name, operatorName, password: document.getElementById('reg-passcode').value, activationCode: document.getElementById('reg-license').value.trim() });
      state.schoolProfile = { schoolId: result.schoolId, schoolName: name, logoDataUrl: '' }; state.operatorName = operatorName; state.isAuthenticated = true; state.cloudStatus = 'Tersinkronisasi'; StorageService.save(state); await CloudService.log(operatorName, 'Registrasi sekolah', 'Workspace sekolah dibuat'); state.operatorLogs = await CloudService.recentLogs().catch(() => []); await CloudService.subscribeWorkspace(payload => { if (state.cloudStatus === 'Menyimpan...') return; const route=state.activeRoute, operator=state.operatorName, profile=state.schoolProfile; Object.assign(state,{...payload,activeRoute:route,operatorName:operator,schoolProfile:profile,isAuthenticated:true,cloudStatus:'Tersinkronisasi'}); rerender(); }); showToast('Workspace sekolah berhasil dibuat.', 'success'); rerender();
    } catch (error) { showToast(error.message || 'Registrasi gagal.', 'error'); button.disabled = false; button.textContent = 'Buat Workspace'; }
  };
}
