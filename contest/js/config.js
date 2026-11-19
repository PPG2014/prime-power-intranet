// ============================================================
//  ตั้งค่า Firebase — ไม่ต้องแก้ไฟล์นี้
//  ผู้ดูแลวางค่า firebaseConfig ที่เว็บภายใน: จัดการข้อมูล → 🧩 ฟังก์ชันเสริม
//  เว็บภายในส่งค่ามาให้หน้าประกวดทาง localStorage (ดู js/intranet.js)
//  ยังไม่ได้วางค่า → ทำงานใน "โหมดทดลอง" ข้อมูลอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น
// ============================================================
import { intranet } from './intranet.js';

export const firebaseConfig = (intranet && intranet.fb && intranet.fb.apiKey && intranet.fb.databaseURL) ? intranet.fb : null;
