/**
 * งานของ Prime Power Construction Co., Ltd (PPC) — ตัวเลือกพิเศษในช่องโครงการของทุกแบบฟอร์ม
 *
 * เลือก "Prime Power Construction Co., Ltd" ในช่องโครงการ → พิมพ์ค้นหาต่อ:
 *   - โครงการหลักในทะเบียนโครงการ → คำขอใช้โครงการนั้นตามปกติ (ผู้รับผิดชอบ/ทีมโครงการอนุมัติ)
 *   - งานที่ไม่ใช่โครงการ (รายการในหน้า 🏗️ งาน PPC) หรือพิมพ์ชื่องานใหม่ → ระบบเพิ่มเข้ารายการให้เมื่อส่งคำขอ
 * คำตอบเก็บใน FormData: project = ชื่อบริษัท · ppc_site = ชื่องาน
 *
 * ผู้อนุมัติของงาน: ชื่อที่ตั้งเฉพาะงาน → ไม่ตั้ง ใช้ของบริษัท → ไม่ตั้งเลย ผู้บังคับบัญชาของผู้ยื่นอนุมัติ
 * แก้ได้ที่ จัดการข้อมูล → 🏗️ งาน PPC (เก็บในตั้งค่าระบบ PPCJobs เป็น JSON รูปแบบเดียวกับ PPEProjects)
 */
import { parsePpe, formatPpe, ppeApproversFor } from './ppe.js';

export const PPC_PROJECT = 'Prime Power Construction Co., Ltd';
export const PPC_SETTING = 'PPCJobs';

export const parsePpc = parsePpe;
export const formatPpc = formatPpe;
export const ppcApproversFor = ppeApproversFor;

/** ตั้งค่างาน PPC ทั้งหมด (รวมที่ซ่อน) */
export async function ppcConfig({ fresh = false } = {}) {
  try {
    const { settings, clearSettings } = await import('../utils/settings.js');
    if (fresh) clearSettings();
    return parsePpc((await settings())[PPC_SETTING]);
  } catch (e) { return parsePpc(''); }
}

/** คำขอนี้เลือกงาน PPC ไหม · คืนชื่องาน (อาจว่าง) หรือ null */
export function ppcSiteOf(data = {}) {
  return String(data.project || '').trim() === PPC_PROJECT ? String(data.ppc_site || '').trim() : null;
}
