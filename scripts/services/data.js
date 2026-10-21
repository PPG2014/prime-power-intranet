/**
 * ชั้นกลางระหว่างหน้าเว็บกับแหล่งข้อมูล
 * หน้าเว็บเรียกผ่านที่นี่เท่านั้น ห้ามเรียก Graph ตรงจากหน้า
 * ตอนพัฒนาอ่านจาก data/mock พอขึ้นจริงสลับ CONFIG.dataSource เป็น 'sharepoint'
 * โดยไม่ต้องแก้โค้ดหน้าเว็บแม้แต่บรรทัดเดียว
 */
import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import * as mock from './source.mock.js';
import * as spo from './source.sharepoint.js';

const src = () => (CONFIG.dataSource === 'sharepoint' ? spo : mock);

/**
 * แคชผลการอ่านรายการ (stale-while-revalidate)
 * - ภายใน FRESH (60 วินาที) ใช้ของในแคชเลย
 * - เก่ากว่านั้นแต่ไม่เกิน STALE_MAX → คืนของเดิมทันที (กดเมนูแล้วขึ้นเลย) แล้วดึงใหม่เบื้องหลัง
 *   ถ้าข้อมูลเปลี่ยน ส่งอีเวนต์ 'data:updated' ให้หน้าที่เปิดอยู่วาดใหม่ (core/render.js)
 * - เก็บเป็น Promise จึงรวมคำขอที่เกิดพร้อมกันให้เหลือครั้งเดียว
 * - ทุกครั้งที่มีการเขียนข้อมูล แคชของชุดนั้นถูกล้างทันที ข้อมูลจึงไม่ค้าง
 */
const FRESH = 60000;
const STALE_MAX = 30 * 60000;
const cache = new Map();      // key → { at, p, data?, refreshing? }

/** ชุดคำขอที่ใช้ร่วมกันทุกหน้า (หน้าแรก ติดตามสถานะ ตัวเลขเตือน) → ดึงครั้งเดียวใช้ทุกที่ */
export const RECENT_REQUESTS = { days: 183, statuses: ['รออนุมัติ', 'ส่งกลับแก้ไข'] };

/** ชื่อชุดข้อมูลที่หน้าปัจจุบันอ่าน — ใช้ตัดสินว่าข้อมูลที่อัปเดตเบื้องหลังเกี่ยวกับหน้านี้ไหม */
let reads = new Set();
export function startReadTracking() { reads = new Set(); return reads; }

export function clearDataCache(name) {
  if (!name) { cache.clear(); return; }
  [...cache.keys()].forEach((k) => { if (k === name || k.startsWith(name + '|')) cache.delete(k); });
}

/** ลายเซ็นย่อของข้อมูล ไว้เทียบว่าดึงใหม่แล้วเปลี่ยนไหม */
function sig(rows) {
  if (!Array.isArray(rows)) return JSON.stringify(rows);
  if (rows.length && rows.every((r) => r && r.Modified)) return rows.length + '|' + rows.map((r) => r.id + ':' + r.Modified).join(',');
  return JSON.stringify(rows);
}

/** ดึงชุดนี้ใหม่เบื้องหลัง ระหว่างนั้นยังใช้ของเดิมได้ · เปลี่ยนจริงค่อยแจ้งหน้าให้วาดใหม่ */
function refresh(key, hit) {
  if (!hit.refreshing) {
    hit.refreshing = hit.fetch().then((rows) => {
      if (cache.get(key) !== hit) return;             // มีคนล้าง/ดึงใหม่ไปแล้ว
      cache.set(key, { at: Date.now(), name: hit.name, fetch: hit.fetch, p: Promise.resolve(rows), data: rows });
      if (sig(rows) !== sig(hit.data)) dispatchEvent(new CustomEvent('data:updated', { detail: { name: hit.name } }));
    }).catch(() => { hit.refreshing = null; });
  }
  return hit.refreshing;
}

/** ดึงใหม่เบื้องหลังโดยไม่ล้างของเดิม (หน้าที่กดเข้าไประหว่างนั้นยังขึ้นทันที) — รอจนได้ข้อมูลใหม่ */
export function revalidate(name) {
  return Promise.all([...cache.entries()]
    .filter(([k, e]) => (k === name || k.startsWith(name + '|')) && e.data)
    .map(([k, e]) => refresh(k, e)));
}

function cached(key, name, fetcher, { fresh = false } = {}) {
  reads.add(name);
  const hit = cache.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < FRESH) return hit.p;
  if (hit && hit.data && age < STALE_MAX && !fresh) {
    refresh(key, hit);
    return hit.p;
  }
  const entry = { at: Date.now(), name, fetch: fetcher };
  entry.p = fetcher().then((rows) => { entry.data = rows; return rows; }).catch((err) => {
    if (cache.get(key) === entry) cache.delete(key);  // อ่านไม่สำเร็จ อย่าจำค่าเสียไว้
    throw err;
  });
  cache.set(key, entry);
  return entry.p;
}

/**
 * opts.fresh = true → ต้องได้ข้อมูลไม่เก่ากว่า 60 วินาที (รอดึงใหม่ ไม่ใช้ของค้าง)
 * ใช้กับงานที่ข้อมูลเก่าทำให้ผิด เช่น ออกเลขที่เอกสาร ตรวจคิว/รถชนกัน ตรวจสถานะก่อนอนุมัติ
 */
export function list(name, opts) {
  return cached(name, name, () => src().list(name), opts);
}

/**
 * เฉพาะรายการที่มีความเคลื่อนไหวใน `days` วันล่าสุด หรือสถานะอยู่ใน `statuses` (เช่น รออนุมัติ)
 * SharePoint กรองให้ที่ต้นทาง · ถ้ากรองไม่ได้ ใช้ทั้ง List แล้วกรองในเครื่องแทน (ผลเหมือนกัน)
 * คืนอาร์เรย์ที่มี .partial = true เมื่อได้มาแค่บางส่วน (ไม่รู้จำนวนรายการเก่าที่ถูกข้าม)
 */
export function listRecent(name, { days = 183, statuses = [] } = {}) {
  const key = `${name}|recent|${days}|${statuses.join(',')}`;
  return cached(key, name, async () => {
    const since = new Date(Date.now() - days * 86400000);
    if (src().listRecent) {
      const rows = await src().listRecent(name, { since, statuses });
      if (rows) return Object.assign(rows, { partial: true });
    }
    return (await list(name)).filter((r) => {
      const m = new Date(r.Modified || r.SubmittedDate || r.Created || 0);
      return statuses.includes(String(r.Status || '').trim()) || isNaN(m) || m >= since;
    });
  });
}

/** ล้างแคชของชุดที่เพิ่งเขียน (และชุดอ้างอิงที่อาจเปลี่ยนตาม) */
const afterWrite = (name, res) => { clearDataCache(name); return res; };

/* ───── บันทึกการใช้งาน (List AuditLog) ─────
 * บันทึกว่าใครเพิ่ม/แก้/ลบข้อมูลอะไร เมื่อไร ไว้ตรวจย้อนหลัง
 *   - ลบ: บันทึกทุกชุดข้อมูล
 *   - เพิ่ม/แก้: บันทึกทุกชุด ยกเว้นงานประจำวันที่มีประวัติในตัวอยู่แล้ว (AUDIT_SKIP)
 * บันทึกไม่สำเร็จ (เช่นยังไม่ได้สร้าง List) ต้องไม่ทำให้งานหลักล้ม — เตือนใน Console ครั้งเดียวแล้วหยุดพยายาม
 */
const AUDIT_LIST = 'auditLog';
const AUDIT_SKIP = new Set([AUDIT_LIST, 'requests', 'requestHistory', 'projectHistory', 'feedback']);
let auditOff = false;

/** ย่อค่าที่ยาว (รูป ลายเซ็น JSON ใหญ่) ให้พอดูได้ ไม่ให้ช่องบันทึกเต็ม */
const brief = (fields) => {
  const out = {};
  Object.entries(fields || {}).forEach(([k, v]) => {
    if (k.endsWith('@odata.type')) return;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    out[k] = s && s.length > 200 ? s.slice(0, 200) + '…' : v;
  });
  return JSON.stringify(out).slice(0, 4000);
};

async function audit(action, name, id, title, fields) {
  if (auditOff || (action !== 'ลบ' && AUDIT_SKIP.has(name))) return;
  const who = state.user || {};
  try {
    await src().create(AUDIT_LIST, {
      Title: `${action} · ${name} · ${String(title || id || '').slice(0, 150)}`,
      Action: action,
      ListName: name,
      ItemId: String(id ?? ''),
      ItemTitle: String(title || '').slice(0, 250),
      ByName: who.name || '',
      ByEmail: who.email || '',
      At: new Date().toISOString(),
      Details: brief(fields),
    });
    clearDataCache(AUDIT_LIST);
  } catch (e) {
    auditOff = true;
    console.warn('[AuditLog] บันทึกการใช้งานไม่สำเร็จ — สร้าง List "AuditLog" ตาม docs/sharepoint-todo.md แล้วรีเฟรช', e.message);
  }
}

/** ชื่อรายการเดิมจากแคช ใช้ตอนลบ (ลบแล้วจะอ่านไม่ได้อีก) */
async function titleOf(name, id) {
  try {
    const rows = await list(name);
    const r = rows.find((x) => String(x.id) === String(id));
    return r ? (r.Title || r.EmployeeName || r.id) : '';
  } catch (e) { return ''; }
}

/**
 * บันทึกข้อผิดพลาดที่ผู้ใช้เจอ ลง List AuditLog (การกระทำ = "ข้อผิดพลาด")
 * ให้ผู้ดูแลเปิดดูได้ที่ จัดการข้อมูล → บันทึกการใช้งาน → กรองการกระทำ "ข้อผิดพลาด"
 * จำกัดไม่เกิน 5 ครั้งต่อการเปิดเว็บ และไม่บันทึกข้อความซ้ำ กันบันทึกท่วม
 */
const errSeen = new Set();
export async function logError(err, where = '') {
  if (CONFIG.dataSource === 'mock' || auditOff || errSeen.size >= 5) return;
  const msg = String((err && (err.message || err.reason)) || err || 'ไม่ทราบสาเหตุ').slice(0, 250);
  if (errSeen.has(msg)) return;
  errSeen.add(msg);
  const who = state.user || {};
  try {
    await src().create(AUDIT_LIST, {
      Title: `ข้อผิดพลาด · ${msg}`.slice(0, 250),
      Action: 'ข้อผิดพลาด',
      ListName: where || location.hash || '#/',
      ItemId: '',
      ItemTitle: msg,
      ByName: who.name || '',
      ByEmail: who.email || '',
      At: new Date().toISOString(),
      Details: JSON.stringify({
        page: location.hash, build: CONFIG.build, browser: navigator.userAgent,
        stack: String((err && err.stack) || '').slice(0, 1500),
      }).slice(0, 4000),
    });
  } catch (e) { /* บันทึกไม่ได้ก็ข้าม ไม่ให้วนเกิด error ซ้ำ */ }
}

export const get    = (name, id)      => src().get(name, id);
export const create = async (name, item) => {
  const res = afterWrite(name, await src().create(name, item));
  audit('เพิ่ม', name, res && res.id, item && (item.Title || item.EmployeeName), item);
  return res;
};
export const update = async (name, id, item) => {
  const res = afterWrite(name, await src().update(name, id, item));
  audit('แก้ไข', name, id, (item && item.Title) || (res && (res.Title || res.EmployeeName)), item);
  return res;
};
export const remove = async (name, id) => {
  const title = await titleOf(name, id);
  const res = afterWrite(name, await src().remove(name, id));
  audit('ลบ', name, id, title, {});
  return res;
};
/** โครงสร้างคอลัมน์จริงของ List — คืน null ถ้าแหล่งข้อมูลไม่รองรับ */
export const schemaOf = (name) => (src().schemaOf ? src().schemaOf(name) : Promise.resolve(null));
