/** เรียงและจัดกลุ่มตามลำดับฝ่ายในสมุดโทรศัพท์ ไม่ใช่เรียงตามตัวอักษร */
import { list } from '../services/data.js';

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

export async function groupByDepartment(rows, key = 'Department') {
  const order = (await departments()).map((d) => d.Title);
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
