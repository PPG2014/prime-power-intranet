/**
 * ฟังก์ชันเสริม (เปิด/ปิดได้ที่ จัดการข้อมูล → 🧩 ฟังก์ชันเสริม)
 * เก็บในตั้งค่าระบบ Addons (JSON) — ตอนนี้มี contest = ระบบประกวด/โหวตปีใหม่ (โฟลเดอร์ contest/)
 *
 *   contest.enabled   เปิด/ปิด — ปิดแล้วแถบเมนูหาย เปิดลิงก์ตรงก็เข้าไม่ได้ (ข้อมูลประกวดยังอยู่)
 *   contest.label     ชื่อแถบเมนู
 *   contest.title     ชื่องาน (แสดงหน้าเลือกบทบาท ถ้ายังไม่ตั้งชื่อในหน้าควบคุมการประกวด)
 *   contest.audience  'all' = พนักงานทุกคนเห็นแถบ · 'managers' = เฉพาะผู้ดูแลการประกวด (ช่วงเตรียมงาน)
 *   contest.until     ปิดแถบเองหลังวันที่นี้ (YYYY-MM-DD) · ว่าง = ไม่ปิดเอง
 *   contest.managers  ชื่อบุคลากรที่ดูแลการประกวดได้ (นอกจากผู้ดูแลระบบและฝ่ายบุคคล)
 *   contest.fb        ค่า firebaseConfig ของ Firebase Realtime Database (ไม่ใช่ความลับ ความปลอดภัยอยู่ที่ Rules)
 *
 * หน้าประกวดเป็นไฟล์แยก (ไม่ได้อยู่ใน SPA นี้) จึงส่งค่าให้ทาง localStorage "pp-contest"
 * ทุกครั้งที่เข้าเว็บ/บันทึกตั้งค่า ปิดอยู่ → เขียน { on: false } หน้าประกวดจะแสดงว่าปิดอยู่
 */
import { state, setState } from '../core/state.js';
import { list } from './data.js';

export const ADDONS_SETTING = 'Addons';
export const CONTEST_CTX_KEY = 'pp-contest';
export const CONTEST_DEFAULT = { enabled: false, label: '🎉 ประกวดปีใหม่', title: '', audience: 'all', until: '', managers: [], fb: null };
const FB_KEYS = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

export function parseAddons(raw) {
  let o = {};
  try { o = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : {}) : (raw || {}); } catch (e) { o = {}; }
  const c = { ...CONTEST_DEFAULT, ...(o.contest || {}) };
  c.enabled = c.enabled === true;
  c.audience = c.audience === 'managers' ? 'managers' : 'all';
  c.managers = Array.isArray(c.managers) ? c.managers.map((x) => String(x).trim()).filter(Boolean) : [];
  c.label = String(c.label || '').trim() || CONTEST_DEFAULT.label;
  c.until = /^\d{4}-\d{2}-\d{2}$/.test(String(c.until || '')) ? c.until : '';
  c.fb = cleanFb(c.fb);
  return { contest: c };
}

export const formatAddons = (cfg) => JSON.stringify({ contest: cfg.contest });

function cleanFb(fb) {
  if (!fb || typeof fb !== 'object') return null;
  const out = {};
  FB_KEYS.forEach((k) => { if (fb[k]) out[k] = String(fb[k]).trim(); });
  return out.apiKey && out.databaseURL ? out : null;
}

/**
 * อ่านค่า firebaseConfig ที่วางมาจาก Firebase Console (ทั้งก้อน const firebaseConfig = {...}; หรือ JSON ก็ได้)
 * คืน { fb } หรือ { error }
 */
export function parseFirebaseSnippet(text) {
  const t = String(text || '').trim();
  if (!t) return { fb: null };
  const o = {};
  const re = /["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(t))) if (FB_KEYS.includes(m[1])) o[m[1]] = m[2];
  const fb = cleanFb(o);
  if (!fb) return { error: o.apiKey ? 'ไม่พบ databaseURL — คัดลอก URL จากหน้า Realtime Database มาใส่เพิ่ม (databaseURL: "https://…firebasedatabase.app")' : 'อ่านค่าไม่ได้ — วางก้อน firebaseConfig ทั้งหมดจาก Firebase Console' };
  if (!/^https:\/\/[\w.-]+\.(firebasedatabase\.app|firebaseio\.com)\/?$/.test(fb.databaseURL)) return { error: 'databaseURL ต้องเป็นลิงก์ของ Firebase Realtime Database' };
  return { fb };
}

export async function addonsConfig({ fresh = false } = {}) {
  const rows = await list('settings', fresh ? { fresh: true } : {});
  const row = rows.find((r) => String(r.Title || '').trim() === ADDONS_SETTING);
  return parseAddons(row ? row.Value : '');
}

const low = (s) => String(s || '').trim().toLowerCase();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** ผู้ดูแลการประกวด = ผู้ดูแลระบบ · ฝ่ายบุคคล · คนที่มีชื่อในรายการผู้ดูแลการประกวด */
export function isContestManager(st = state, c = st.addons?.contest, me = st.contestMe) {
  if (st.isAdmin || st.isHR) return true;
  return !!(c && me && me.name && c.managers.includes(me.name));
}

/** แถบประกวดแสดงให้ผู้ใช้นี้ไหม */
export function contestVisible(st = state) {
  const c = st.addons && st.addons.contest;
  if (!c || !c.enabled) return false;
  if (c.until && today() > c.until) return false;
  return c.audience === 'all' || isContestManager(st, c);
}

/** หาชื่อ/อีเมลของผู้ใช้ในทะเบียนบุคลากร (อีเมลที่ล็อกอินอาจไม่ตรงกับช่อง Email) */
function findMe(dir) {
  const mine = [state.user?.email, ...((state.user && state.user.emails) || [])].map(low).filter(Boolean);
  const p = dir.find((x) => mine.includes(low(x.Email)));
  return { name: (p && p.Title) || state.user?.name || '', email: low((p && p.Email) || state.user?.email) };
}

/** โหลดตั้งค่าฟังก์ชันเสริมเข้า state + ส่งค่าให้หน้าประกวด · เรียกตอนเข้าเว็บ และหลังบันทึกตั้งค่า */
export async function loadAddons({ fresh = false } = {}) {
  let cfg;
  try { cfg = await addonsConfig({ fresh }); } catch (e) { cfg = parseAddons(''); }
  const c = cfg.contest;
  let dir = [];
  if (c.enabled) { try { dir = await list('directory'); } catch (e) { dir = []; } }
  const me = findMe(dir);
  setState({ addons: cfg, contestMe: me }, { silent: true });
  writeContestCtx(dir);
  return cfg;
}

function writeContestCtx(dir) {
  const c = state.addons.contest;
  const on = contestVisible();
  let ctx = { on: false };
  if (on) {
    const manager = isContestManager();
    ctx = {
      on: true, title: c.title, fb: c.fb, email: state.contestMe.email, name: state.contestMe.name, manager,
      // รายชื่อบุคลากรใช้ผูกกรรมการกับบัญชี — ส่งให้เฉพาะผู้ดูแลการประกวด
      people: manager ? dir.filter((p) => p.IsActive !== false && p.Title && p.Email)
        .map((p) => ({ n: String(p.Title).trim(), e: low(p.Email) })) : [],
    };
  }
  try { localStorage.setItem(CONTEST_CTX_KEY, JSON.stringify(ctx)); } catch (e) { /* เบราว์เซอร์ไม่ให้เก็บ → หน้าประกวดจะแจ้งว่าปิดอยู่ */ }
}
