/** อ่านค่าตั้งค่าระบบจาก List Settings แบบชื่อ→ค่า */
import { list } from '../services/data.js';

let cached = null;
let failed = false;

/**
 * อ่านไม่สำเร็จ → คืนค่าว่างโดยไม่จำไว้ (ครั้งหน้าลองอ่านใหม่) และจด failed ไว้
 * ให้ส่วนที่เกี่ยวกับสิทธิ์ (utils/admin.js) ตัดสินแบบปิดไว้ก่อน ไม่ใช่เปิดให้ทุกคน
 */
export async function settings() {
  if (cached) return cached;
  try {
    const rows = await list('settings');
    const map = {};
    rows.forEach((row) => { map[row.Title] = row.Value; });
    cached = map;
    failed = false;
    return cached;
  } catch (e) {
    failed = true;
    console.warn('อ่านตั้งค่าระบบไม่สำเร็จ:', e.message);
    return {};
  }
}

/** ครั้งล่าสุดอ่านตั้งค่าระบบไม่สำเร็จหรือไม่ */
export const settingsFailed = () => failed;

/** เรียกหลังผู้ดูแลแก้ตั้งค่าระบบ เพื่อให้ค่าใหม่มีผลทันทีโดยไม่ต้องรีเฟรช */
export function clearSettings() { cached = null; }
