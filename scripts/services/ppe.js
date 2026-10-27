/**
 * โครงการของ Prime Power Engineering Pro Co., Ltd (PPE) — ตัวเลือกพิเศษในช่องโครงการของทุกแบบฟอร์ม
 *
 * เลือก "Prime Power Engineering Pro Co., Ltd" ในช่องโครงการ → เลือกโครงการ PPE ต่อ
 * ไม่มีในรายการ → "➕ เพิ่มชื่อโครงการเอง" แล้วพิมพ์ชื่อ
 * คำตอบเก็บใน FormData: project = ชื่อบริษัท · ppe_site = ชื่อโครงการ PPE
 *
 * ผู้อนุมัติ: ลำดับที่ใช้ผู้อนุมัติจากโครงการ (ผู้รับผิดชอบหลักของโครงการ / ผู้จัดการโครงการ)
 *   → ใช้ชื่อที่ตั้งไว้ของโครงการนั้น ถ้าไม่ได้ตั้ง ใช้ชื่อผู้อนุมัติของบริษัท (เลือกได้หลายคน)
 *
 * แก้รายการและผู้อนุมัติได้ที่ จัดการข้อมูล → 🏠 โครงการ PPE (เก็บในตั้งค่าระบบ PPEProjects เป็น JSON)
 */
export const PPE_PROJECT = 'Prime Power Engineering Pro Co., Ltd';
export const PPE_SETTING = 'PPEProjects';
/** ค่าในรายการเลือกโครงการ PPE ที่หมายถึง "พิมพ์ชื่อเอง" */
export const PPE_OTHER = '__other';

const names = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[,;\n]/))
  .map((x) => String(x || '').trim()).filter(Boolean))];

/** { approvers: [ชื่อ], projects: [{ name, on, approvers: [ชื่อ] }] } */
export function parsePpe(raw) {
  let d = {};
  try { d = JSON.parse(String(raw || '').trim() || '{}') || {}; } catch (e) { d = {}; }
  const seen = new Set();
  const projects = (Array.isArray(d.projects) ? d.projects : [])
    .map((p) => ({ name: String((p && p.name) || '').trim(), on: !(p && p.on === false), approvers: names(p && p.approvers) }))
    .filter((p) => { const k = p.name.toLowerCase(); if (!p.name || seen.has(k)) return false; seen.add(k); return true; });
  return { approvers: names(d.approvers), projects };
}
export const formatPpe = (cfg) => JSON.stringify(parsePpe(JSON.stringify(cfg)));

/** ตั้งค่าโครงการ PPE ทั้งหมด (รวมที่ซ่อน) */
export async function ppeConfig({ fresh = false } = {}) {
  try {
    const { settings, clearSettings } = await import('../utils/settings.js');
    if (fresh) clearSettings();
    return parsePpe((await settings())[PPE_SETTING]);
  } catch (e) { return parsePpe(''); }
}

/** ผู้อนุมัติของโครงการ PPE นี้: ชื่อที่ตั้งเฉพาะโครงการ → ไม่มีใช้ของบริษัท */
export function ppeApproversFor(cfg, site) {
  const s = String(site || '').trim().toLowerCase();
  const p = cfg.projects.find((x) => x.name.toLowerCase() === s);
  return p && p.approvers.length ? p.approvers : cfg.approvers;
}

/** คำขอนี้เลือกโครงการ PPE ไหม · คืนชื่อโครงการ PPE (อาจว่าง) หรือ null */
export function ppeSiteOf(data = {}) {
  return String(data.project || '').trim() === PPE_PROJECT ? String(data.ppe_site || '').trim() : null;
}
