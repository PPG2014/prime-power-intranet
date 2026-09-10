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
