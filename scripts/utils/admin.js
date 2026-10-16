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
import { settings, settingsFailed } from './settings.js';

export const ADMIN_KEY = 'Admins';
/** ฝ่ายบุคคล: ทำงานระบบประเมินได้ทั้งหมด แต่ไม่เห็นข้อมูลชุดอื่นในหน้าจัดการข้อมูล */
export const HR_KEY = 'HR';
/**
 * ผู้บริหาร: ดูคำขอได้ทุกใบ ทุกสถานะ ในหน้าติดตามสถานะ (ดูอย่างเดียว · อนุมัติได้เฉพาะใบที่มีชื่อในเส้นทาง)
 * ตั้งค่าใน Settings คีย์ RequestViewers (อีเมลคั่นด้วยจุลภาค) · ยังไม่ตั้ง ใช้รายชื่อเริ่มต้นด้านล่าง
 */
export const VIEWER_KEY = 'RequestViewers';
const DEFAULT_VIEWERS = 'pairach.kh@primepower.co.th, arthid.ko@primepower.co.th, khanthida.sa@primepower.co.th';

const emails = (raw) => String(raw || '').toLowerCase()
  .split(',').map((x) => x.trim()).filter(Boolean);

export async function resolveAdmin(email) {
  const cfg = await settings();
  const raw = cfg[ADMIN_KEY];

  // อ่านตั้งค่าไม่ได้ (เน็ตสะดุด/ไม่มีสิทธิ์) → ไม่มีใครเป็นผู้ดูแล ปิดไว้ก่อนเพื่อความปลอดภัย
  if (settingsFailed()) return { isAdmin: false, isHR: false, isViewer: false, unconfigured: false };

  if (raw === undefined) {
    return { isAdmin: true, isHR: true, isViewer: true, unconfigured: true };
  }

  const me = String(email || '').toLowerCase();
  const isAdmin = emails(raw).includes(me);
  const isViewer = isAdmin || emails(cfg[VIEWER_KEY] ?? DEFAULT_VIEWERS).includes(me);
  return { isAdmin, isHR: isAdmin || emails(cfg[HR_KEY]).includes(me), isViewer, unconfigured: false };
}
