/** อ่านจากไฟล์ JSON ใน data/mock — ใช้ตอนพัฒนา แก้ในหน่วยความจำเท่านั้น */
const cache = {};

async function load(name) {
  if (!cache[name]) {
    const res = await fetch(`data/mock/${name}.json`);
    if (!res.ok) throw new Error(`ไม่พบไฟล์ข้อมูลจำลอง: ${name}.json`);
    cache[name] = await res.json();
  }
  return cache[name];
}

export const list   = (name) => load(name);
export const get    = async (name, id) => (await load(name)).find((r) => String(r.id) === String(id));
export const create = async (name, item) => {
  const rows = await load(name);
  item.id = Math.max(0, ...rows.map((r) => +r.id || 0)) + 1;
  rows.push(item);
  return { ...item, skipped: [] };
};
export const update = async (name, id, item) => {
  const rows = await load(name);
  const i = rows.findIndex((r) => String(r.id) === String(id));
  if (i > -1) rows[i] = { ...rows[i], ...item };
  return { ...rows[i], skipped: [] };
};
export const remove = async (name, id) => {
  const rows = await load(name);
  const i = rows.findIndex((r) => String(r.id) === String(id));
  if (i > -1) rows.splice(i, 1);
};
