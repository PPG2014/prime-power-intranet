// Data layer: Firebase Realtime Database (production) or local demo mode.
// Both expose the same API so pages don't care which one is running.
import { firebaseConfig } from './config.js';

const FB_VERSION = '10.12.2';
const PUBLIC_KEYS = ['event', 'entries', 'judges', 'criteria', 'scores', 'meta', 'media', 'votes'];

export async function getStore() {
  if (firebaseConfig) return createFirebaseStore(firebaseConfig);
  return createDemoStore();
}

// ---------- helpers ----------
const split = p => String(p || '').split('/').filter(Boolean);
function getPath(obj, path) { return split(path).reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function setPath(obj, path, val) {
  const keys = split(path);
  if (!keys.length) return;
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (val === null || val === undefined) delete o[last];
  else o[last] = JSON.parse(JSON.stringify(val));
}
const pick = (state) => Object.fromEntries(PUBLIC_KEYS.map(k => [k, state[k] ?? null]));

// ---------- Demo store (localStorage + BroadcastChannel) ----------
function createDemoStore() {
  const KEY = 'pv-demo-v1';
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let state = load();
  const subs = new Set(), secretSubs = new Set();
  const emit = () => {
    const pub = pick(state);
    subs.forEach(cb => cb(pub));
    secretSubs.forEach(cb => cb(state.secret || {}));
    watchers.forEach(w => { const v = getPath(state, w.path); const k = JSON.stringify(v ?? null).length + ':' + (v && typeof v === 'object' ? Object.keys(v).join() : String(v).slice(0, 64)); if (k !== w.last) { w.last = k; w.cb(v ?? null); } });
  };
  const commit = () => {
    const prev = localStorage.getItem(KEY);
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { state = prev ? JSON.parse(prev) : {}; throw new Error('พื้นที่โหมดทดลองเต็ม (ประมาณ 5 MB) — ไฟล์ใหญ่ให้ใช้กับ Firebase'); }
    ch && ch.postMessage(1);
    emit();
  };
  const watchers = new Set();
  const reload = () => { state = load(); emit(); };
  if (ch) ch.onmessage = reload;
  window.addEventListener('storage', e => { if (e.key === KEY) reload(); });
  const ss = (k, v) => { try { v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch {} };
  const sget = k => { try { return sessionStorage.getItem(k); } catch { return null; } };

  return {
    mode: 'demo',
    onState(cb) { subs.add(cb); cb(pick(state)); return () => subs.delete(cb); },
    onSecret(cb) { secretSubs.add(cb); cb(state.secret || {}); return () => secretSubs.delete(cb); },
    watch(path, cb) { const w = { path, cb, last: null }; watchers.add(w); const v = getPath(state, path); w.last = JSON.stringify(v ?? null).length + ':' + (v && typeof v === 'object' ? Object.keys(v).join() : String(v).slice(0, 64)); cb(v ?? null); return () => watchers.delete(w); },
    async set(path, val) { setPath(state, path, val); commit(); },
    async update(path, obj) { for (const [k, v] of Object.entries(obj)) setPath(state, (path ? path + '/' : '') + k, v); commit(); },
    async remove(path) { setPath(state, path, null); commit(); },
    async adminReady() { return !!getPath(state, 'secret/adminPin'); },
    async createAdmin(pin) {
      if (getPath(state, 'secret/adminPin')) return false;
      setPath(state, 'secret/adminPin', pin); setPath(state, 'meta/adminReady', true); commit();
      ss('pv-admin', '1'); return true;
    },
    async loginAdmin(pin) { const ok = getPath(state, 'secret/adminPin') === pin; if (ok) ss('pv-admin', '1'); return ok; },
    async isAdmin() { return sget('pv-admin') === '1' && !!getPath(state, 'secret/adminPin'); },
    async logoutAdmin() { ss('pv-admin', null); },
    async loginJudge(judgeId, pin) {
      const ok = !!pin && getPath(state, 'secret/pins/' + judgeId) === pin;
      if (ok) ss('pv-judge', judgeId); return ok;
    },
    async whoAmI() { const j = sget('pv-judge'); return j && getPath(state, 'judges/' + j) ? j : null; },
    async logoutJudge() { ss('pv-judge', null); },
    async once(path) { return getPath(state, path) ?? null; },
    disconnect() {},
    async castVote(key, entryId) {
      if (!(state.event || {}).voteOpen) throw new Error('closed');
      if (getPath(state, 'votes/' + key)) throw new Error('already');
      setPath(state, 'votes/' + key, { e: entryId, ts: Date.now() }); commit();
    },
    async submitScore(judgeId, entryId, values) {
      const ev = state.event || {};
      if (ev.status !== 'open') throw new Error('closed');
      if (ev.locked && ev.locked[entryId]) throw new Error('locked');
      if (getPath(state, `scores/${judgeId}/${entryId}`) && !ev.allowEdit) throw new Error('already');
      setPath(state, `scores/${judgeId}/${entryId}`, { v: values, ts: Date.now() }); commit();
    },
  };
}

// ---------- Firebase store ----------
async function createFirebaseStore(cfg) {
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
  const [{ initializeApp }, db_, auth_] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-database.js'), import(base + 'firebase-auth.js'),
  ]);
  const { getDatabase, ref, onValue, set, update, remove, get, serverTimestamp, goOffline, goOnline } = db_;
  const { getAuth, signInAnonymously } = auth_;
  const app = initializeApp(cfg);
  const db = getDatabase(app);
  const auth = getAuth(app);
  if (auth.authStateReady) await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  const uid = () => auth.currentUser.uid;
  const r = p => (p ? ref(db, p) : ref(db));
  const tryWrite = async fn => { try { await fn(); return true; } catch (e) { console.warn(e); return false; } };

  return {
    mode: 'firebase',
    onState(cb) {
      const st = {}, seen = new Set(); let queued = false;
      const flush = () => { queued = false; cb({ ...st }); };
      const offs = PUBLIC_KEYS.map(k => onValue(r(k), s => {
        st[k] = s.val(); seen.add(k);
        if (seen.size < PUBLIC_KEYS.length) return; // wait until every branch has loaded once
        if (!queued) { queued = true; queueMicrotask(flush); }
      }));
      return () => offs.forEach(f => f());
    },
    onSecret(cb) { return onValue(r('secret'), s => cb(s.val() || {}), () => cb({})); },
    watch(path, cb) { return onValue(r(path), s => cb(s.val()), () => cb(null)); },
    set: (p, v) => set(r(p), v),
    update: (p, o) => update(r(p), o),
    remove: p => remove(r(p)),
    async adminReady() { return (await get(r('meta/adminReady'))).val() === true; },
    async createAdmin(pin) {
      const ok = await tryWrite(() => update(r(), { 'secret/adminPin': pin, 'meta/adminReady': true }));
      return ok && tryWrite(() => set(r('adminClaims/' + uid()), { pin }));
    },
    loginAdmin: pin => tryWrite(() => set(r('adminClaims/' + uid()), { pin })),
    async isAdmin() { try { await get(r('secret/adminPin')); return true; } catch { return false; } },
    logoutAdmin: () => tryWrite(() => remove(r('adminClaims/' + uid()))),
    loginJudge: (judgeId, pin) => tryWrite(() => set(r('claims/' + uid()), { judge: judgeId, pin })),
    async whoAmI() { try { return (await get(r('claims/' + uid()))).val()?.judge || null; } catch { return null; } },
    logoutJudge: () => tryWrite(() => remove(r('claims/' + uid()))),
    submitScore: (judgeId, entryId, values) => set(r(`scores/${judgeId}/${entryId}`), { v: values, ts: serverTimestamp() }),
    /** อ่านครั้งเดียว (หน้าเลือกบทบาท / โหวต) ไม่ค้างการเชื่อมต่อ — แพ็กเกจฟรีรับพร้อมกันได้ 100 เครื่อง */
    async once(path) { return (await get(r(path))).val(); },
    disconnect() { try { goOffline(db); } catch {} },
    async castVote(key, entryId) {
      try { goOnline(db); } catch {}   // หน้าโหวตตัดการเชื่อมต่อไว้หลังโหลด → ต่อใหม่ตอนกดยืนยัน
      try { await set(r('votes/' + key), { e: entryId, ts: serverTimestamp() }); }
      catch (e) { const prev = (await get(r('votes/' + key)).catch(() => null))?.val?.(); throw new Error(prev ? 'already' : e.message); }
      finally { try { goOffline(db); } catch {} }
    },
  };
}
