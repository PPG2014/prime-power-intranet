/** อ่านค่าตั้งค่าระบบจาก List Settings แบบชื่อ→ค่า */
import { list } from '../services/data.js';

let cached = null;
export async function settings() {
  if (!cached) {
    cached = {};
    for (const row of await list('settings')) cached[row.Title] = row.Value;
  }
  return cached;
}

/** เรียกหลังผู้ดูแลแก้ตั้งค่าระบบ เพื่อให้ค่าใหม่มีผลทันทีโดยไม่ต้องรีเฟรช */
export function clearSettings() { cached = null; }
