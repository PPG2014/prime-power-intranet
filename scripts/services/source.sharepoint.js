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

/**
 * Lookup, Person และช่องที่เลือกได้หลายค่า Graph ส่งกลับมาเป็นออบเจ็กต์
 * ต้องคลี่เป็นข้อความก่อน ไม่งั้นหน้าเว็บจะแสดงเป็น [object Object]
 * และการเทียบชื่อฝ่ายเพื่อจัดกลุ่มจะไม่ตรง
 */
function plain(v) {
  if (v === null || v === undefined) return v;

  if (typeof v === 'object') {
    // คอลัมน์ชนิด Image เก็บที่อยู่ไฟล์ไว้เป็นสองส่วน
    if (v.serverUrl && v.serverRelativeUrl) return v.serverUrl + v.serverRelativeUrl;
    return v.LookupValue ?? v.Label ?? v.Url ?? v.DisplayName ?? v.Email
        ?? v.Title ?? JSON.stringify(v);
  }

  // ข้อความที่เป็นข้อมูลรูปแบบ JSON ของคอลัมน์ Image
  if (typeof v === 'string' && v.startsWith('{"') && v.includes('serverRelativeUrl')) {
    try {
      const img = JSON.parse(v);
      return (img.serverUrl || '') + (img.serverRelativeUrl || '');
    } catch (e) { return v; }
  }

  return v;
}

function flatten(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith('@') || k.endsWith('@odata.type')) continue;
    out[k] = Array.isArray(v) ? v.map(plain) : plain(v);
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

export function clearLookupCache() { for (const k of Object.keys(maps)) delete maps[k]; }

/** เติมชื่อให้คอลัมน์ Lookup หลังอ่านข้อมูลมา */
async function resolveIn(name, rows) {
  const spec = LOOKUPS[name];
  if (!spec) return rows;

  for (const [key, [target, many]] of Object.entries(spec)) {
    const idKey = key + 'LookupId';
    if (!rows.some((r) => r[idKey] !== undefined)) continue;   // ค่ามาเป็นชื่ออยู่แล้วก็ข้าม
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
      const ids = names.map((n) => Number(byTitle[n])).filter((n) => !isNaN(n));
      // อาร์เรย์ว่างทำให้ SharePoint ตอบ generalException จึงไม่ส่งไปเลย
      if (ids.length) {
        out[idKey + '@odata.type'] = 'Collection(Edm.Int32)';
        out[idKey] = ids;
      }
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

/* ---------- รายชื่อคอลัมน์ที่มีอยู่จริงใน List ---------- */

const columnCache = {};

async function columnsOf(name) {
  if (!columnCache[name]) {
    const data = await call(
      `/lists/${listId(name)}/columns` +
      `?$select=name,text,boolean,number,dateTime,choice,hyperlinkOrPicture,lookup,thumbnail`
      + `&$expand=choice`);
    const map = new Map();
    data.value.forEach((c) => map.set(c.name, c));
    columnCache[name] = map;
  }
  return columnCache[name];
}

/** แปลงค่าให้ตรงกับชนิดคอลัมน์จริงใน SharePoint */
function coerce(col, value) {
  if (!col) return value;

  // คอลัมน์ชนิด Image เขียนผ่าน Graph ไม่ได้ ต้องข้ามไป
  if (col.thumbnail) return undefined;

  if (col.hyperlinkOrPicture) {
    const url = String(value || '').trim();
    return url ? { Url: url, Description: url.split('/').pop() } : null;
  }

  // คอลัมน์ข้อความบรรทัดเดียวรับได้ 255 อักขระ ลิงก์ที่มีภาษาไทยจะยาวเกินได้ง่าย
  if (col.text && col.text.allowMultipleLines === false && typeof value === 'string'
      && value.length > 255) {
    throw new Error(
      `ค่าในช่องนี้ยาว ${value.length} อักขระ เกินที่คอลัมน์รับได้ 255 อักขระ\n` +
      'ให้เปลี่ยนชนิดคอลัมน์เป็น Multiple lines of text แบบ Plain text');
  }

  if (col.boolean) return Boolean(value);
  if (col.number)  return value === '' || value === null ? null : Number(value);

  /**
   * คอลัมน์ Choice ที่ไม่ได้เปิด "เพิ่มค่าเองได้" จะปฏิเสธค่านอกรายการด้วย 500
   * ค่าว่างส่ง null ได้ ค่าที่ไม่ตรงรายการให้ข้ามไป ดีกว่าล้มทั้งรายการ
   */
  if (col.choice && Array.isArray(col.choice.choices)) {
    const v = String(value ?? '').trim();
    if (!v) return null;
    if (!col.choice.allowTextEntry && !col.choice.choices.includes(v)) return undefined;
    return v;
  }

  return value;
}

export function clearColumnCache() { for (const k of Object.keys(columnCache)) delete columnCache[k]; }

/** คัดช่องที่ List ไม่มี คืนทั้งข้อมูลที่ส่งได้และรายชื่อที่ถูกข้าม */
async function keepKnown(name, fields) {
  const cols = await columnsOf(name);
  const out = {}, skipped = [];

  for (const [k, v] of Object.entries(fields)) {
    if (k.endsWith('@odata.type')) continue;
    const baseKey = k.replace(/LookupId$/, '');
    if (cols.has(k)) {
      const cv = coerce(cols.get(k), v);
      if (cv === undefined) {
        const col = cols.get(k);
        skipped.push(k + (col && col.thumbnail
          ? ' (คอลัมน์ชนิด Image เขียนผ่านระบบไม่ได้)'
          : ' (ค่าไม่ตรงกับตัวเลือกที่ตั้งไว้ใน SharePoint)'));
      }
      else out[k] = cv;
    } else if (cols.has(baseKey)) {
      out[k] = v;                 // คอลัมน์ Lookup ส่งเป็นเลข id ตามเดิม
    } else {
      skipped.push(baseKey);
    }
  }

  for (const [k, v] of Object.entries(fields)) {
    if (k.endsWith('@odata.type') && k.replace(/@odata\.type$/, '') in out) out[k] = v;
  }

  return { fields: out, skipped: [...new Set(skipped)] };
}

export async function list(name) {
  return resolveIn(name, await fetchRows(name));
}

export async function get(name, id) {
  const it = await call(`/lists/${listId(name)}/items/${id}?expand=fields`);
  return { id: it.id, ...flatten(it.fields) };
}

/** คีย์ของช่องที่เลือกได้หลายค่า ใช้ตอนต้องตัดออกเพื่อลองบันทึกใหม่ */
function multiKeys(name, fields) {
  const spec = LOOKUPS[name] || {};
  return Object.entries(spec)
    .filter(([, [, many]]) => many)
    .map(([key]) => key + 'LookupId')
    .filter((k) => k in fields);
}

/**
 * ส่งข้อมูลไปบันทึก ถ้าไม่ผ่านให้ลองใหม่โดยตัดช่องที่เลือกได้หลายค่าออก
 * เพราะ Graph จัดการคอลัมน์ Lookup แบบหลายค่าได้ไม่สม่ำเสมอ
 * ดีกว่าปล่อยให้บันทึกไม่ได้ทั้งรายการทั้งที่ช่องอื่นถูกต้องหมด
 */
async function send(name, fields, request) {
  try {
    return { res: await request(fields), dropped: [] };
  } catch (err) {
    const multi = multiKeys(name, fields);
    if (!multi.length) throw err;

    const trimmed = { ...fields };
    multi.forEach((k) => { delete trimmed[k]; delete trimmed[k + '@odata.type']; });

    const res = await request(trimmed);          // ถ้ารอบนี้ยังพัง ให้โยนต่อไปเลย
    return { res, dropped: multi.map((k) => k.replace(/LookupId$/, '')) };
  }
}

export async function create(name, item) {
  clearLookupCache();   // ข้อมูลอ้างอิงอาจเพิ่งถูกเพิ่มไปในรอบเดียวกัน
  const { fields, skipped } = await keepKnown(name, await resolveOut(name, item));
  const { res, dropped } = await send(name, fields, (f) =>
    call(`/lists/${listId(name)}/items`, { method: 'POST', body: JSON.stringify({ fields: f }) }));
  return { ...res, skipped, dropped };
}

export async function update(name, id, item) {
  const { fields, skipped } = await keepKnown(name, await resolveOut(name, item));
  const { res, dropped } = await send(name, fields, (f) =>
    call(`/lists/${listId(name)}/items/${id}/fields`, { method: 'PATCH', body: JSON.stringify(f) }));
  return { ...res, skipped, dropped };
}

export const remove = (name, id) =>
  call(`/lists/${listId(name)}/items/${id}`, { method: 'DELETE' });
