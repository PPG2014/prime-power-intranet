/**
 * ตัดสินว่าใครเป็นผู้ดูแลระบบ
 *
 * อ่านรายชื่ออีเมลจากตั้งค่าระบบคีย์ Admins คั่นด้วยจุลภาค
 * เลือกวิธีนี้เพราะแก้ได้เองจากในเว็บหรือจาก SharePoint โดยตรง
 * ไม่ต้องขอสิทธิ์อ่านกลุ่มผู้ใช้จากผู้ดูแล Microsoft 365 เพิ่ม
 *
 * ถ้ายังไม่เคยตั้งค่านี้เลย จะถือว่าทุกคนเป็นผู้ดูแลชั่วคราว
 * เพื่อให้เข้าไปตั้งค่าครั้งแรกได้ พร้อมขึ้นคำเตือนให้รีบกำหนด
 */
import { settings } from './settings.js';

export const ADMIN_KEY = 'Admins';

export async function resolveAdmin(email) {
  const cfg = await settings();
  const raw = cfg[ADMIN_KEY];

  if (raw === undefined) {
    return { isAdmin: true, unconfigured: true };
  }

  const allow = String(raw).toLowerCase()
    .split(',').map((x) => x.trim()).filter(Boolean);

  return { isAdmin: allow.includes(String(email || '').toLowerCase()), unconfigured: false };
}
