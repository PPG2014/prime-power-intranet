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
 * แคชผลการอ่านรายการไว้ชั่วคราว
 * เดิมทุกครั้งที่เปลี่ยนหน้าจะยิงขอข้อมูลใหม่หมด ทำให้กดแล้วรู้สึกหน่วง
 * เก็บเป็น Promise จึงรวมคำขอที่เกิดพร้อมกันให้เหลือครั้งเดียวด้วย
 * ทุกครั้งที่มีการเขียนข้อมูล แคชของชุดนั้นจะถูกล้างทันที ข้อมูลจึงไม่ค้าง
 */
const TTL = 60000;            // อายุแคช 60 วินาที
const cache = new Map();      // name → { at, p }

export function clearDataCache(name) {
  if (name) cache.delete(name); else cache.clear();
}

export function list(name) {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL) return hit.p;

  const p = src().list(name).catch((err) => {
    cache.delete(name);       // อ่านไม่สำเร็จ อย่าจำค่าเสียไว้
    throw err;
  });
  cache.set(name, { at: Date.now(), p });
  return p;
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
