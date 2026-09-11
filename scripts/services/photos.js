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
const PHOTO_ROOT = 'Photos';
const ATTACH_ROOT = 'Attachments';

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

/** ชื่อโฟลเดอร์ที่ SharePoint รับได้ ตัดอักขระต้องห้ามออก */
export const safeFolder = (name) =>
  String(name || '').replace(/[\\/:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * ชื่อไฟล์แบบสั้นและเป็นอักษรอังกฤษล้วน
 *
 * ไม่ใส่ชื่อคนหรือชื่อเอกสารไว้ในชื่อไฟล์ ด้วยสองเหตุผล
 * ภาษาไทยในลิงก์จะถูกแปลงเป็นรหัสยาวตัวละ 9 อักขระ ทำให้ลิงก์ยาวจนคอลัมน์เก็บไม่พอ
 * และชื่อไฟล์ที่เดาได้ทำให้คนนอกลองเปิดไฟล์ของคนอื่นได้
 *
 * ชื่อจริงของไฟล์แนบเก็บไว้ในคอลัมน์ข้อมูลอยู่แล้ว หน้าเว็บจึงยังแสดงชื่อเดิมได้
 */
function safeName(hint, ext = 'jpg') {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}${rand}.${ext}`;
}

/**
 * อัปโหลดรูปเข้าคลังเอกสารของไซต์ คืนลิงก์ที่เอาไปใส่ใน <img> ได้
 * โหมดข้อมูลตัวอย่างจะคืนเป็น data URL แทน เพื่อให้ทดสอบได้โดยไม่ต้องต่อ SharePoint
 */
export async function uploadPhoto(file, hint, folder = '') {
  const blob = await resizeImage(file);

  if (CONFIG.dataSource === 'mock') {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  }

  const token = await getToken();
  const path = [PHOTO_ROOT, ...folder.split('/').map(safeFolder).filter(Boolean), safeName(hint, 'jpg')].join('/');
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

/** ขนาดไฟล์แบบอ่านง่าย เลือกหน่วยให้เอง */
export const fileSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
};

/** ชนิดไฟล์จากนามสกุล ใช้เติมคอลัมน์ชนิดไฟล์ให้อัตโนมัติ */
export const fileKind = (name) => {
  const ext = String(name).split('.').pop().toUpperCase();
  return ext.length <= 5 ? ext : 'FILE';
};

const MAX_ATTACH = 15 * 1024 * 1024;

/**
 * อัปโหลดไฟล์แนบเข้าคลังเอกสารของไซต์ โดยไม่ย่อและไม่แปลงไฟล์
 * คืนข้อมูลไฟล์ที่เก็บลงคอลัมน์ได้เลย
 */
export async function uploadFile(file, folder = '') {
  if (file.size > MAX_ATTACH) {
    throw new Error(`ไฟล์ ${file.name} ใหญ่ ${fileSize(file.size)} เกิน 15 MB`);
  }

  const meta = { name: file.name, size: file.size,
                 sizeText: fileSize(file.size), kind: fileKind(file.name) };

  if (CONFIG.dataSource === 'mock') {
    return { ...meta, url: '#' };
  }

  const token = await getToken();
  const ext = (file.name.split('.').pop() || 'dat').toLowerCase();
  const path = [ATTACH_ROOT, ...folder.split('/').map(safeFolder).filter(Boolean),
                safeName(file.name, ext)].join('/');

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${CONFIG.sharepoint.siteId}` +
    `/drive/root:/${encodeURIComponent(path)}:/content`,
    { method: 'PUT',
      headers: { Authorization: `Bearer ${token}`,
                 'Content-Type': file.type || 'application/octet-stream' },
      body: file });

  if (!res.ok) {
    if (res.status === 403) throw new Error('ไม่มีสิทธิ์อัปโหลดไฟล์เข้าคลังเอกสารของไซต์');
    throw new Error(`อัปโหลด ${file.name} ไม่สำเร็จ (${res.status})`);
  }
  const item = await res.json();
  return { ...meta, url: item.webUrl };
}
