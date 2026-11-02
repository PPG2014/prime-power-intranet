/**
 * อัตราค่าพาหนะ (เบิกค่าใช้จ่ายในการเดินทาง) — รถยนต์ส่วนบุคคลคิดกิโลละกี่บาท แยกตามบุคคล
 *
 * ปกติ 6 บาท/กม. · บุคลากรที่มีรายชื่อในหน้า จัดการข้อมูล → 🚗 ค่าพาหนะ ได้ 3 บาท/กม.
 * ในตารางรายการของฟอร์มเบิกค่าเดินทาง: เลือกประเภทพาหนะ = รถยนต์ส่วนบุคคล → ช่องราคาต่อหน่วยเติมอัตราของผู้ยื่นให้
 * ตัวเลือกรถยนต์ส่วนบุคคลแสดงอัตราของผู้ยื่นคนนั้น เช่น "รถยนต์ส่วนบุคคล (3 บาท/กม.)"
 * พาหนะประเภทอื่นใช้อัตราที่เขียนในตัวเลือก เช่น "รถจักรยานยนต์ (3.5 บาท/กม.)"
 *
 * เก็บในตั้งค่าระบบ MileageRates เป็น JSON { car, reduced, people: [ชื่อ] } ไม่ต้องสร้าง List ใหม่
 */
export const MILEAGE_SETTING = 'MileageRates';
export const DEFAULT_MILEAGE = { car: 6, reduced: 3, people: [] };

const rate = (v, d) => { const n = Number(v); return isFinite(n) && n > 0 ? n : d; };

export function parseMileage(raw) {
  let d = {};
  try { d = JSON.parse(String(raw || '').trim() || '{}') || {}; } catch (e) { d = {}; }
  const people = [...new Set((Array.isArray(d.people) ? d.people : [])
    .map((x) => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
  return { car: rate(d.car, DEFAULT_MILEAGE.car), reduced: rate(d.reduced, DEFAULT_MILEAGE.reduced), people };
}
export const formatMileage = (cfg) => JSON.stringify(parseMileage(JSON.stringify(cfg)));

export async function mileageConfig({ fresh = false } = {}) {
  try {
    const { settings, clearSettings } = await import('../utils/settings.js');
    if (fresh) clearSettings();
    return parseMileage((await settings())[MILEAGE_SETTING]);
  } catch (e) { return parseMileage(''); }
}

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
/** อัตรารถยนต์ส่วนบุคคลของบุคคลนี้ (บาท/กม.) */
export const carRateFor = (cfg, name) => (name && cfg.people.some((p) => norm(p) === norm(name)) ? cfg.reduced : cfg.car);

/** คอลัมน์/ช่อง "ประเภทพาหนะ" และ "ราคาต่อหน่วย" */
export const VEHICLE_RE = /พาหนะ|ประเภทรถ/;
export const RATE_RE = /ราคาต่อหน่วย|อัตรา|บาท\/กม/;
/** ตัวเลือกที่เป็นรถยนต์ส่วนบุคคล */
export const isPrivateCar = (opt) => /รถยนต์ส่วนบุคคล|รถยนต์ส่วนตัว|รถส่วนตัว|รถส่วนบุคคล/.test(String(opt || ''));
const RATE_TEXT = /\(\s*[\d.,]+\s*บาท\s*\/\s*(?:กม|กิโล)[^)]*\)/;

/** ข้อความตัวเลือกที่แสดง: รถยนต์ส่วนบุคคล → อัตราของผู้ยื่น */
export function vehicleLabel(opt, carRate) {
  const o = String(opt || '');
  if (!isPrivateCar(o) || !carRate) return o;
  return RATE_TEXT.test(o) ? o.replace(RATE_TEXT, `(${carRate} บาท/กม.)`) : `${o} (${carRate} บาท/กม.)`;
}
/** รถจักรยานยนต์ส่วนบุคคล — คิดตามระยะทางเหมือนรถยนต์ */
export const isMotorcycle = (opt) => /จักรยานยนต์|มอเตอร์ไซ/.test(String(opt || ''));
/** อัตรารถจักรยานยนต์ถ้าตัวเลือกไม่ได้เขียนอัตราไว้ (ตามระเบียบ 3.5 บาท/กม.) */
export const MOTO_RATE = 3.5;
/**
 * พาหนะนี้เบิกตามระยะทาง (เลขไมล์ × ราคาต่อหน่วย) ไหม
 * รถยนต์/รถจักรยานยนต์ส่วนบุคคล หรือตัวเลือกที่เขียนอัตรา "บาท/กม." = ใช่
 * อื่น ๆ (แท็กซี่ รถสาธารณะ ทางด่วน ที่จอดรถ) = ไม่ใช่ → เบิกตามจริงตามใบเสร็จ/สลิป
 */
export const isMileageVehicle = (opt) => isPrivateCar(opt) || isMotorcycle(opt) || /บาท\s*\/\s*(?:กม|กิโล)/.test(String(opt || ''));

/** อัตรา (บาท/กม.) ของตัวเลือกพาหนะ · เบิกตามจริง/ไม่รู้ คืน null */
export function vehicleRate(opt, carRate) {
  const o = String(opt || '');
  if (!o || !isMileageVehicle(o)) return null;
  if (isPrivateCar(o)) return carRate || null;
  const m = o.match(/([\d.]+)\s*บาท/);
  return m ? Number(m[1]) : isMotorcycle(o) ? MOTO_RATE : null;
}
