/** เรียงและจัดกลุ่มตามลำดับฝ่ายในสมุดโทรศัพท์ ไม่ใช่เรียงตามตัวอักษร */
import { list } from '../services/data.js';

let cached = null;
export async function departments() {
  if (!cached) cached = (await list('departments')).filter((d) => d.IsActive !== false);
  return cached;
}

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
