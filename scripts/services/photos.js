/**
 * จัดการรูปบุคลากร
 *
 * ย่อรูปในเบราว์เซอร์ก่อนอัปโหลดเสมอ เพราะรูปจากมือถือมักใหญ่ 2–5 MB
 * ย่อแล้วเหลือราว 60–80 KB ซึ่งพอสำหรับรูปติดบัตรบนหน้าเว็บ
 * ที่บุคลากร 200 คน ต่างกันระหว่างโหลด 15 MB กับ 500 MB
 *
 * เก็บไฟล์จริงไว้ในคลังเอกสารของไซต์ แล้วเก็บแค่ลิงก์ในทะเบียนบุคลากร
 * ไม่เก็บตัวรูปลงในคอลัมน์ เพราะคอลัมน์ข้อความรับข้อมูลขนาดนั้นไม่ไหว
 */
import { CONFIG } from '../core/config.js';
import { getToken } from './auth.js';

const MAX_W = 600;
const MAX_H = 800;      // สัดส่วน 3:4 แบบรูปติดบัตร
const QUALITY = 0.82;
const FOLDER = 'Photos';

/** ย่อและครอปรูปให้ได้สัดส่วน 3:4 คืนค่าเป็น Blob */
export function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // ครอปจากกลางภาพให้ได้สัดส่วน 3:4 ก่อน แล้วค่อยย่อ
      const target = MAX_W / MAX_H;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (sw / sh > target) { sw = sh * target; sx = (img.width - sw) / 2; }
      else                  { sh = sw / target; sy = (img.height - sh) / 2; }

      const canvas = document.createElement('canvas');
      canvas.width = MAX_W;
      canvas.height = MAX_H;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, MAX_W, MAX_H);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('ย่อรูปไม่สำเร็จ'))),
        'image/jpeg', QUALITY);
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์รูปไม่ได้')); };
    img.src = url;
  });
}

/** ชื่อไฟล์ที่ปลอดภัย ไม่ซ้ำ และเดาไม่ได้จากชื่อคน */
function safeName(hint) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const base = String(hint || 'photo').replace(/[^\w\u0E00-\u0E7F]+/g, '-').slice(0, 40);
  return `${base}-${stamp}${rand}.jpg`;
}

/**
 * อัปโหลดรูปเข้าคลังเอกสารของไซต์ คืนลิงก์ที่เอาไปใส่ใน <img> ได้
 * โหมดข้อมูลตัวอย่างจะคืนเป็น data URL แทน เพื่อให้ทดสอบได้โดยไม่ต้องต่อ SharePoint
 */
export async function uploadPhoto(file, hint) {
  const blob = await resizeImage(file);

  if (CONFIG.dataSource === 'mock') {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  }

  const token = await getToken();
  const path = `${FOLDER}/${safeName(hint)}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${CONFIG.sharepoint.siteId}` +
    `/drive/root:/${encodeURIComponent(path)}:/content`,
    { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' }, body: blob });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 403)
      throw new Error('ไม่มีสิทธิ์อัปโหลดไฟล์เข้าคลังเอกสารของไซต์ — แจ้งผู้ดูแล Microsoft 365');
    throw new Error(`อัปโหลดรูปไม่สำเร็จ (${res.status}) ${detail.slice(0, 120)}`);
  }

  const item = await res.json();
  return item.webUrl;
}

/** ขนาดไฟล์หลังย่อ ใช้แสดงให้ผู้ใช้เห็นว่าย่อได้เท่าไร */
export const kb = (bytes) => Math.round(bytes / 1024) + ' KB';
