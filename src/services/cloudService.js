/** Supabase browser client. Only the publishable/anon key belongs here; never expose service_role. */
let clientPromise;
export function getCloudClient() {
  if (!clientPromise) clientPromise = (async () => {
    const cfg = window.SECG_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Cloud belum dikonfigurasi. Isi src/config.js dari .env.example lalu deploy ulang.');
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
    return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  })();
  return clientPromise;
}

export const schoolLoginEmail = name => {
  const slug = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54);
  if (!slug) throw new Error('Nama sekolah tidak valid.');
  return `${slug}@login.examcard.school`;
};

export const CloudService = {
  async registerSchool({ name, password, operatorName, activationCode }) {
    const db = await getCloudClient();
    const email = schoolLoginEmail(name);
    let { data, error } = await db.auth.signUp({ email, password, options: { data: { operator_name: operatorName || 'Operator' } } });
    if (error) throw error;
    if (!data.session) {
      const retry = await db.auth.signInWithPassword({ email, password });
      if (retry.error || !retry.data.session) throw new Error('Konfirmasi email Supabase belum aktif, atau akun login ini sudah ada. Matikan email confirmation di Auth settings.');
      data = retry.data;
    }
    const { data: schoolId, error: rpcError } = await db.rpc('register_school', { p_name: name.trim(), p_activation_code: activationCode || null });
    if (rpcError) { await db.auth.signOut(); throw rpcError; }
    return { schoolId, user: data.user };
  },
  async login(name, password, operatorName) {
    const db = await getCloudClient();
    const { data, error } = await db.auth.signInWithPassword({ email: schoolLoginEmail(name), password });
    if (error) throw new Error('Nama sekolah atau password salah.');
    const { data: school, error: schoolError } = await db.from('schools').select('id,name,logo_path').single();
    if (schoolError) { await db.auth.signOut(); throw new Error('Workspace sekolah tidak ditemukan atau belum aktif.'); }
    await db.from('operator_logs').insert({ school_id: school.id, operator_name: operatorName?.trim() || 'Operator', action: 'login', detail: 'Masuk ke workspace sekolah' });
    return { school, user: data.user, operatorName: operatorName?.trim() || 'Operator' };
  },
  async signOut() { const db = await getCloudClient(); const { error } = await db.auth.signOut(); if (error) throw error; },
  async getSession() { const db = await getCloudClient(); const { data, error } = await db.auth.getSession(); if (error) throw error; return data.session; },
  async loadWorkspace() {
    const db = await getCloudClient();
    const { data, error } = await db.from('workspace_snapshots').select('payload,updated_at').single();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.payload || null;
  },
  async saveWorkspace(payload) {
    const db = await getCloudClient();
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth.user) throw new Error('Sesi cloud berakhir. Login kembali untuk menyimpan perubahan.');
    const { data: school, error: schoolError } = await db.from('schools').select('id').single();
    if (schoolError) throw schoolError;
    const cloudPayload = { ...payload };
    // Ready-to-print originals live in the current browser's IndexedDB; never sync orphan metadata.
    cloudPayload.folders = (cloudPayload.folders || []).map(({ printAssets, ...folder }) => folder);
    delete cloudPayload.operatorName;
    delete cloudPayload.cloudStatus;
    const { error } = await db.from('workspace_snapshots').upsert({ school_id: school.id, payload: cloudPayload, updated_at: new Date().toISOString() }, { onConflict: 'school_id' });
    if (error) throw error;
  },
  async log(operatorName, action, detail) {
    const db = await getCloudClient();
    const { data: school } = await db.from('schools').select('id').single();
    if (school) await db.from('operator_logs').insert({ school_id: school.id, operator_name: operatorName || 'Operator', action, detail });
  },
  async recentLogs(limit = 8) {
    const db = await getCloudClient();
    const { data, error } = await db.from('operator_logs').select('id,operator_name,action,detail,created_at').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },
  async subscribeWorkspace(onChange) {
    const db = await getCloudClient();
    const { data: school, error } = await db.from('schools').select('id').single();
    if (error) throw error;
    return db.channel(`workspace-${school.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_snapshots', filter: `school_id=eq.${school.id}` }, async () => {
      try { const payload = await this.loadWorkspace(); if (payload) onChange(payload); } catch (err) { console.error('Workspace refresh:', err); }
    }).subscribe();
  }
};
