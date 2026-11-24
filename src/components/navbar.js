import { escapeHtml } from '../utils/helpers.js';

const GROUPS = [
  { id:'dashboard', label:'Beranda', routes:['dashboard'] },
  { id:'folders', label:'Data & Folder Kelas', routes:['folders','students','photos'] },
  { id:'templates', label:'Desain Kartu', routes:['templates','validation'] },
  { id:'print', label:'Cetak Kartu', routes:['print'] },
  { id:'settings', label:'Pengaturan Sekolah', routes:['settings','exams'] }
];
const LABELS={students:'Data Siswa & Excel',photos:'Foto Siswa',validation:'Validasi Pra-Cetak',exams:'Kegiatan Ujian'};

export function renderSidebar(state) {
  const schoolName=state.schoolProfile?.schoolName||'Sekolah Terdaftar';
  return `<aside class="sidebar"><div class="sidebar-header"><div class="sidebar-logo-mark">SC</div><div class="sidebar-brand"><div class="sidebar-brand-title">EXAM CARD PRO</div><div class="sidebar-brand-school">${escapeHtml(schoolName)}</div></div></div><nav class="sidebar-nav" aria-label="Navigasi Utama">${GROUPS.map(group=>{const active=group.routes.includes(state.activeRoute);const children=group.routes.length>1?`<div class="nav-subitems">${group.routes.filter(route=>route!==group.id).map(route=>`<button type="button" class="nav-subitem ${state.activeRoute===route?'active':''}" data-route="${route}">${LABELS[route]}</button>`).join('')}</div>`:'';return `<div class="nav-group"><button type="button" class="nav-item ${active?'active':''}" data-route="${group.id}"><span>${group.label}</span>${group.id==='folders'?`<span class="nav-pill">${state.folders.length}</span>`:''}</button>${children}</div>`}).join('')}</nav><div class="sidebar-footnote">Administrasi kartu ujian</div></aside>`;
}

export function renderTopbar(state) {
  const schoolName=state.schoolProfile?.schoolName||'Sekolah';
  const logo=state.schoolProfile?.logoDataUrl||'';
  const folder=state.folders.find(item=>item.folderId===state.activeFolderId);
  const status=state.cloudStatus||'Tersinkronisasi';
  return `<header class="topbar"><div class="school-identity-bar">${logo?`<img src="${logo}" alt="Logo Sekolah" class="school-nav-logo">`:''}<div class="topbar-identity"><div class="school-nav-name">${escapeHtml(schoolName)}</div><div class="topbar-indicators"><span class="workspace-chip ${state.devBypassAuth?'is-local':''}"><i></i>${escapeHtml(state.devBypassAuth?'Mode tes lokal':status)}</span><span class="workspace-chip folder-chip">${folder?`Folder aktif · ${escapeHtml(folder.level)} / ${escapeHtml(folder.className)}`:'Belum ada kelas aktif'}</span></div></div></div>${state.devBypassAuth?'':'<button type="button" class="btn btn-outline btn-sm" id="btn-logout">Keluar</button>'}</header>`;
}
