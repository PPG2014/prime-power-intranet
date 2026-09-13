export const thaiDate = (d) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

export const baht = (n) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n || 0);

export const fileSize = (bytes) =>
  bytes < 1024 * 1024 ? (bytes / 1024).toFixed(0) + ' KB' : (bytes / 1024 / 1024).toFixed(2) + ' MB';

/** วันที่จาก SharePoint เป็น ISO — แปลงเป็นรูปแบบไทยสำหรับแสดงผล */
export const thaiDateShort = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);          // ข้อมูลเก่าที่กรอกเป็นข้อความ ปล่อยตามเดิม
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** วันที่พร้อมเวลา สำหรับบันทึกการอนุมัติที่ต้องรู้ว่ากี่โมง */
export const thaiDateTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' น.';
};
