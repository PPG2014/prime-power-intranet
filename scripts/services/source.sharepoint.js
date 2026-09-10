/**
 * อ่านและเขียน SharePoint List ผ่าน Microsoft Graph
 * ยังไม่ได้ต่อของจริง — ทำในระยะที่ 1 หลังจดทะเบียนแอปใน Entra ID เสร็จ
 */
import { CONFIG } from '../core/config.js';
import { getToken } from './auth.js';

const base = () => `https://graph.microsoft.com/v1.0/sites/${CONFIG.sharepoint.siteId}`;

async function call(path, options = {}) {
  const token = await getToken();
  const res = await fetch(base() + path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`Graph ตอบกลับ ${res.status} — ${path}`);
  return res.status === 204 ? null : res.json();
}

const listPath = (name) => `/lists/${CONFIG.sharepoint.lists[name] || name}`;

export async function list(name) {
  const data = await call(`${listPath(name)}/items?expand=fields&$top=999`);
  return data.value.map((it) => ({ id: it.id, ...it.fields }));
}
export async function get(name, id) {
  const it = await call(`${listPath(name)}/items/${id}?expand=fields`);
  return { id: it.id, ...it.fields };
}
export const create = (name, item) =>
  call(`${listPath(name)}/items`, { method: 'POST', body: JSON.stringify({ fields: item }) });
export const update = (name, id, item) =>
  call(`${listPath(name)}/items/${id}/fields`, { method: 'PATCH', body: JSON.stringify(item) });
export const remove = (name, id) =>
  call(`${listPath(name)}/items/${id}`, { method: 'DELETE' });
