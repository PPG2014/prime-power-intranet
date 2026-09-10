/** เรียงและจัดกลุ่มตามลำดับฝ่ายในสมุดโทรศัพท์ ไม่ใช่เรียงตามตัวอักษร */
import { list } from '../services/data.js';
import { settings } from './settings.js';

let cached = null;
export async function departments() {
  if (!cached) {
    cached = (await list('departments'))
      .filter((d) => d.IsActive !== false)
      .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));
  }
  return cached;
}

let cachedSections = null;

/** ทะเบียนแผนก เรียงตามลำดับที่ผู้ดูแลตั้งไว้ */
export async function sections() {
  if (!cachedSections) {
    cachedSections = (await list('sections'))
      .filter((s) => s.IsActive !== false)
      .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));
  }
  return cachedSections;
}

/** เรียกหลังผู้ดูแลแก้ข้อมูล เพื่อให้หน้าอื่นเห็นลำดับใหม่ทันที */
export function clearCaches() { cached = null; cachedSections = null; }

/**
 * ลำดับการแสดงกลุ่มบนหน้าเว็บ
 * ชื่อกลุ่มที่ไม่ได้อยู่ในทะเบียนหน่วยงาน เช่น "ผู้บริหาร" ให้ปักไว้บนสุดเสมอ
 * ตั้งค่าได้ที่ ⚙ จัดการข้อมูล → ตั้งค่าระบบ คีย์ ExecutiveGroup
 */
export async function groupOrder() {
  const cfg = await settings();
  const pinned = (cfg.ExecutiveGroup || 'ผู้บริหาร')
    .split(',').map((x) => x.trim()).filter(Boolean);
  return [...pinned, ...(await departments()).map((d) => d.Title)]
    .filter((v, i, a) => a.indexOf(v) === i);
}

export async function groupByDepartment(rows, key = 'Department') {
  const order = await groupOrder();
  const seen = [];
  rows.forEach((r) => { if (!seen.includes(r[key])) seen.push(r[key]); });
  seen.sort((a, b) => {
    const i = order.indexOf(a), j = order.indexOf(b);
    return (i < 0 ? 999 : i) - (j < 0 ? 999 : j);
  });
  return seen.map((name) => ({ name, rows: rows.filter((r) => r[key] === name) }));
}

export async function extensionOf(name) {
  return (await departments()).find((d) => d.Title === name)?.Extension || '';
}
