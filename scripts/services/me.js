/**
 * หาตัวผู้ใช้ที่ล็อกอินในทะเบียนบุคลากร
 *
 * อีเมลที่ล็อกอิน (UPN) อาจไม่ตรงกับช่อง Email ในทะเบียน เช่น ใช้ชื่อย่อคนละแบบ หรือเป็นโดเมน onmicrosoft
 * จึงเทียบกับอีเมลทุกตัวของบัญชี (mail / userPrincipalName / proxyAddresses) ที่อ่านจาก Graph ตอนเข้าสู่ระบบ
 * ถ้ายังไม่เจอ เทียบชื่อหน้า @ เฉพาะกรณีที่มีคนเดียวในทะเบียนที่ตรง
 */
import { state } from '../core/state.js';

const low = (v) => String(v || '').trim().toLowerCase();
const local = (e) => low(e).split('@')[0];

/** อีเมลทั้งหมดของผู้ใช้ที่ล็อกอิน (ตัวพิมพ์เล็ก) */
export const myEmails = () => [...new Set([state.user?.email, ...((state.user && state.user.emails) || [])].map(low).filter(Boolean))];

/** แถวของผู้ใช้ในทะเบียนบุคลากร หรือ null */
export function findMe(dir = []) {
  const mine = myEmails();
  if (!mine.length) return null;
  const hit = dir.find((p) => mine.includes(low(p.Email)));
  if (hit) return hit;
  const names = new Set(mine.map(local));
  const loose = dir.filter((p) => p.Email && names.has(local(p.Email)));
  return loose.length === 1 ? loose[0] : null;
}

/** อ่านอีเมลอื่นของบัญชีจาก Graph (เรียกครั้งเดียวตอนเข้าสู่ระบบ) */
export async function loadMyEmails(user) {
  try {
    const { getToken } = await import('./auth.js');
    const token = await getToken();
    if (!token) return [];
    const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,otherMails,proxyAddresses',
      { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return [];
    const j = await r.json();
    const proxy = (j.proxyAddresses || []).filter((x) => /^smtp:/i.test(x)).map((x) => x.slice(5));
    return [...new Set([user && user.email, j.mail, j.userPrincipalName, ...(j.otherMails || []), ...proxy].map(low).filter(Boolean))];
  } catch (e) { return []; }
}
