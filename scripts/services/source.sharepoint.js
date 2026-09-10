/**
 * อ่านและเขียน SharePoint List ผ่าน Microsoft Graph
 * อ้าง List ด้วย GUID ไม่ใช่ชื่อ เพราะไซต์นี้มี "Documents" ซ้ำกันสองตัว
 */
import { CONFIG } from '../core/config.js';
import { getToken } from './auth.js';
import { LOOKUPS } from './lookups.js';

const base = () => `https://graph.microsoft.com/v1.0/sites/${CONFIG.sharepoint.siteId}`;
const listId = (name) => CONFIG.sharepoint.lists[name] || name;

async function call(path, options = {}) {
  const token = await getToken();
  if (!token) throw new Error('ยังไม่ได้เข้าสู่ระบบ');

  const res = await fetch(base() + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 403) {
      throw new Error('ยังไม่ได้รับสิทธิ์เข้าถึงข้อมูล — ต้องให้ผู้ดูแลอนุมัติสิทธิ์ Sites.ReadWrite.All ก่อน');
    }
    if (res.status === 404) {
      throw new Error(`ไม่พบรายการที่ขอ (${path}) — ตรวจว่า GUID ของ List ใน config.js ตรงกับของจริง`);
    }
    throw new Error(`Graph ตอบกลับ ${res.status} — ${detail.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Lookup และ Person ใน Graph คืนค่าเป็นออบเจ็กต์ ต้องคลี่ออกเป็นข้อความก่อนใช้ */
function flatten(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith('@') || k.endsWith('@odata.type')) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = v.Label ?? v.LookupValue ?? v.DisplayName ?? v.Email ?? JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/* ---------- แปลงค่า Lookup ระหว่างเลข id กับชื่อ ---------- */

const maps = {};

/** ตารางแปลง id ↔ ชื่อ ของ List ปลายทาง ดึงครั้งเดียวแล้วจำไว้ */
async function titleMap(target) {
  if (!maps[target]) {
    const rows = await fetchRows(target);
    const byId = {}, byTitle = {};
    rows.forEach((r) => { byId[String(r.id)] = r.Title; byTitle[r.Title] = r.id; });
    maps[target] = { byId, byTitle };
  }
  return maps[target];
}

/* ---------- รายชื่อคอลัมน์ที่มีอยู่จริงใน List ---------- */

const columnCache = {};

/**
 * ดึงรายชื่อคอลัมน์ของ List เพื่อคัดเฉพาะช่องที่มีอยู่จริงก่อนบันทึก
 * ถ้าส่งช่องที่ไม่มี Graph จะปฏิเสธทั้งรายการด้วย invalidRequest
 * ซึ่งทำให้บันทึกอะไรไม่ได้เลยแม้ช่องอื่นถูกต้องหมด
 */
async function columnsOf(name) {
  if (!columnCache[name]) {
    const data = await call(`/lists/${listId(name)}/columns?$select=name`);
    columnCache[name] = new Set(data.value.map((c) => c.name));
  }
  return columnCache[name];
}

/** คัดช่องที่ List ไม่มี คืนทั้งข้อมูลที่ส่งได้และรายชื่อที่ถูกข้าม */
async function keepKnown(name, fields) {
  const cols = await columnsOf(name);
  const out = {}, skipped = [];

  // รอบแรกคัดเฉพาะช่องข้อมูลจริง ยังไม่แตะคำกำกับชนิดข้อมูล
  for (const [k, v] of Object.entries(fields)) {
    if (k.endsWith('@odata.type')) continue;
    const base = k.replace(/LookupId$/, '');
    if (cols.has(k) || cols.has(base)) out[k] = v;
    else skipped.push(base);
  }

  // คำกำกับชนิดข้อมูลติดไปด้วยเฉพาะเมื่อช่องของมันถูกส่งจริง
  for (const [k, v] of Object.entries(fields)) {
    if (k.endsWith('@odata.type') && k.replace(/@odata\.type$/, '') in out) out[k] = v;
  }

  return { fields: out, skipped: [...new Set(skipped)] };
}

export function clearColumnCache() { for (const k of Object.keys(columnCache)) delete columnCache[k]; }

export function clearLookupCache() { for (const k of Object.keys(maps)) delete maps[k]; }

/** เติมชื่อให้คอลัมน์ Lookup หลังอ่านข้อมูลมา */
async function resolveIn(name, rows) {
  const spec = LOOKUPS[name];
  if (!spec) return rows;

  for (const [key, [target, many]] of Object.entries(spec)) {
    const idKey = key + 'LookupId';
    if (!rows.some((r) => r[idKey] !== undefined)) continue;   // ไม่ใช่ Lookup ก็ข้าม
    const { byId } = await titleMap(target);
    rows.forEach((r) => {
      const v = r[idKey];
      if (v === undefined || v === null) return;
      r[key] = many
        ? (Array.isArray(v) ? v : [v]).map((x) => byId[String(x)]).filter(Boolean)
        : (byId[String(v)] ?? r[key] ?? '');
    });
  }
  return rows;
}

/** แปลงชื่อกลับเป็นเลข id ก่อนส่งไปบันทึก */
async function resolveOut(name, item) {
  const spec = LOOKUPS[name];
  if (!spec) return item;
  const out = { ...item };

  for (const [key, [target, many]] of Object.entries(spec)) {
    if (!(key in out)) continue;
    const { byTitle } = await titleMap(target);
    const idKey = key + 'LookupId';

    if (many) {
      const names = Array.isArray(out[key]) ? out[key]
        : String(out[key] || '').split(',').map((x) => x.trim()).filter(Boolean);
      out[idKey + '@odata.type'] = 'Collection(Edm.Int32)';
      out[idKey] = names.map((n) => Number(byTitle[n])).filter((n) => !isNaN(n));
    } else {
      const id = byTitle[out[key]];
      out[idKey] = id === undefined ? null : Number(id);
    }
    delete out[key];
  }
  return out;
}

/** อ่านข้อมูลดิบโดยยังไม่แปลงค่า Lookup ใช้ตอนสร้างตารางแปลง */
async function fetchRows(name) {
  const rows = [];
  let path = `/lists/${listId(name)}/items?expand=fields&$top=999`;
  while (path) {
    const data = await call(path);
    rows.push(...data.value.map((it) => ({ id: it.id, ...flatten(it.fields) })));
    const next = data['@odata.nextLink'];
    path = next ? next.replace(base(), '') : null;
  }
  return rows;
}

export async function list(name) {
  return resolveIn(name, await fetchRows(name));
}

export async function get(name, id) {
  const it = await call(`/lists/${listId(name)}/items/${id}?expand=fields`);
  return { id: it.id, ...flatten(it.fields) };
}

export async function create(name, item) {
  clearLookupCache();   // ข้อมูลอ้างอิงอาจเพิ่งถูกเพิ่มไปในรอบเดียวกัน
  const { fields, skipped } = await keepKnown(name, await resolveOut(name, item));
  const res = await call(`/lists/${listId(name)}/items`,
    { method: 'POST', body: JSON.stringify({ fields }) });
  return { ...res, skipped };
}

export async function update(name, id, item) {
  const { fields, skipped } = await keepKnown(name, await resolveOut(name, item));
  const res = await call(`/lists/${listId(name)}/items/${id}/fields`,
    { method: 'PATCH', body: JSON.stringify(fields) });
  return { ...res, skipped };
}

export const remove = (name, id) =>
  call(`/lists/${listId(name)}/items/${id}`, { method: 'DELETE' });
