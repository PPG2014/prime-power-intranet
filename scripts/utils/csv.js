/**
 * อ่านและเขียนไฟล์ CSV
 *
 * เขียนเองแทนการใช้ไลบรารีภายนอก เพราะต้องรองรับข้อความภาษาไทยที่มีจุลภาค
 * และข้อความหลายบรรทัดในเซลล์เดียว ซึ่งพบบ่อยในช่องรายละเอียดและตัวเลือก
 */

/** แยกข้อความ CSV เป็นตาราง รองรับเครื่องหมายคำพูดและขึ้นบรรทัดในเซลล์ */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;

  // ตัด BOM ที่ Excel ใส่มาให้ ไม่งั้นหัวคอลัมน์แรกจะเพี้ยน
  const s = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }   // "" คือเครื่องหมายคำพูดจริง
        else quoted = false;
      } else cell += c;
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

/** แปลงตารางเป็นข้อความ CSV ที่ Excel เปิดแล้วภาษาไทยไม่เพี้ยน */
export function toCsv(headers, rows) {
  const cell = (v) => {
    const t = v === null || v === undefined ? ''
      : Array.isArray(v) ? v.join(', ')
      : typeof v === 'boolean' ? (v ? 'Yes' : 'No')
      : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '\uFEFF' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** สั่งให้เบราว์เซอร์ดาวน์โหลดข้อความเป็นไฟล์ */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** แปลงค่าจากข้อความใน CSV ให้ตรงกับชนิดของช่อง */
export function castValue(field, raw) {
  const v = String(raw ?? '').trim();

  switch (field.type) {
    case 'yesno':
      return /^(yes|y|true|ใช่|1)$/i.test(v);
    case 'number':
      return v === '' ? 0 : Number(v.replace(/,/g, '')) || 0;
    case 'date': {
      if (!v) return null;
      const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00' : v);
      return isNaN(d) ? null : d.toISOString();
    }
    case 'multilookup':
      return v ? v.split(',').map((x) => x.trim()).filter(Boolean) : [];
    default:
      return v;
  }
}
