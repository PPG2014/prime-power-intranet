/**
 * อ่านและเขียน SharePoint List ผ่าน Microsoft Graph
 * อ้าง List ด้วย GUID ไม่ใช่ชื่อ เพราะไซต์นี้มี "Documents" ซ้ำกันสองตัว
 */
import { CONFIG } from '../core/config.js';
import { getToken } from './auth.js';

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

export async function list(name) {
  const rows = [];
  let path = `/lists/${listId(name)}/items?expand=fields&$top=999`;
  // Graph ส่งข้อมูลมาเป็นหน้า ๆ ต้องไล่ตามลิงก์จนหมด
  while (path) {
    const data = await call(path);
    rows.push(...data.value.map((it) => ({ id: it.id, ...flatten(it.fields) })));
    const next = data['@odata.nextLink'];
    path = next ? next.replace(base(), '') : null;
  }
  return rows;
}

export async function get(name, id) {
  const it = await call(`/lists/${listId(name)}/items/${id}?expand=fields`);
  return { id: it.id, ...flatten(it.fields) };
}

export const create = (name, item) =>
  call(`/lists/${listId(name)}/items`, { method: 'POST', body: JSON.stringify({ fields: item }) });

export const update = (name, id, item) =>
  call(`/lists/${listId(name)}/items/${id}/fields`, { method: 'PATCH', body: JSON.stringify(item) });

export const remove = (name, id) =>
  call(`/lists/${listId(name)}/items/${id}`, { method: 'DELETE' });
