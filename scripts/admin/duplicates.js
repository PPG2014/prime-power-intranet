/**
 * ตรวจค่าซ้ำก่อนบันทึก (ใช้ทั้งหน้าจัดการข้อมูล นำเข้า CSV และปุ่มอัปเดตโครงการ)
 *
 *   schema.unique   = ช่องที่ตรวจซ้ำ — ซ้ำแล้ว "เตือน" ให้เลือกว่าจะบันทึกต่อไหม
 *                     ใส่เป็นอาร์เรย์ย่อย เช่น ['Title', 'Department'] = ซ้ำเมื่อตรงกันทุกช่องพร้อมกัน
 *   schema.strict   = ช่องที่ "ห้ามซ้ำ" — ซ้ำแล้วบันทึกไม่ได้ (เช่น รหัสโครงการ อีเมลบุคลากร)
 *   schema.nameKeys = ช่องชื่อคน — ตัดคำนำหน้า นาย/นาง/นางสาว ฯลฯ ก่อนเทียบ
 *
 * เทียบแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ ช่องว่างหัวท้าย และช่องว่างซ้อน
 */
// ต้องตามด้วยช่องว่างหรือพยัญชนะ (ไม่ใช่สระ/วรรณยุกต์) กัน "นายิกา" "นางสาวิตรี" ถูกตัดผิด
const PREFIX = /^(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|ดร\.|ว่าที่\s*ร\.ต\.|mrs\.?|mr\.?|ms\.?|miss)(?=\s|[^\u0E30-\u0E3A\u0E45\u0E47-\u0E4E])\s*/i;

export function normValue(v, isName = false) {
  let x = String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (isName) {
    const cut = x.replace(PREFIX, '').trim();
    // ตัดเฉพาะเมื่อเหลือทั้งชื่อและนามสกุล กันชื่อที่บังเอิญขึ้นต้นด้วยคำเหล่านี้ถูกตัดผิด
    if (cut.includes(' ')) x = cut;
  }
  return x;
}

/** รายการค่าซ้ำทั้งหมดของ data เทียบกับ rows (ไม่นับตัวเอง selfId) */
export function findDuplicates(s, data, rows, selfId = null) {
  const out = [];
  const label = (key) => ((s.fields || []).find((f) => f.key === key) || {}).label || key;
  // แบบหลายช่องรวมกัน เช่น [['Title', 'Department']] = ชื่อแผนกซ้ำ "ในฝ่ายเดียวกัน" เท่านั้น
  (s.unique || []).filter(Array.isArray).forEach((combo) => {
    if (combo.some((k) => !normValue(data[k]))) return;
    const clash = rows.find((r) => combo.every((k) => normValue(r[k]) === normValue(data[k]))
      && (selfId == null || String(r.id) !== String(selfId)));
    if (clash) out.push({ key: combo[0], label: combo.map(label).join(' + '), clash, strict: false });
  });
  const keys = [...new Set([...(s.unique || []), ...(s.strict || [])].filter((k) => !Array.isArray(k)))];
  keys.forEach((key) => {
    const isName = (s.nameKeys || []).includes(key);
    const value = normValue(data[key], isName);
    if (!value) return;
    const clash = rows.find((r) => normValue(r[key], isName) === value
      && (selfId == null || String(r.id) !== String(selfId)));
    if (!clash) return;
    out.push({ key, label: label(key), clash, strict: (s.strict || []).includes(key) });
  });
  return out;
}

/**
 * ถามผู้ใช้ตามผลตรวจ · คืน null = บันทึกต่อได้ · คืน { key, message } = ยกเลิกการบันทึก
 * ห้ามซ้ำ → แจ้งแล้วหยุดทันที · เตือน → ถามยืนยันทีละช่อง
 */
export function confirmDuplicates(s, data, rows, selfId = null) {
  const dups = findDuplicates(s, data, rows, selfId);
  const where = (c) => `"${c.clash[c.key]}"` + (c.key !== 'Title' && c.clash.Title ? ` — ${c.clash.Title}` : '')
    + (c.clash.Department ? `  (${c.clash.Department})` : '');

  const hard = dups.find((d) => d.strict);
  if (hard) {
    alert(`บันทึกไม่ได้: ${hard.label}นี้มีใน${s.title}อยู่แล้ว\n\n${where(hard)}\n\n${hard.label}ต้องไม่ซ้ำกัน กรุณาแก้ให้ถูกต้อง`);
    return { key: hard.key, message: `บันทึกไม่ได้ เพราะ${hard.label}ซ้ำกับรายการที่มีอยู่ (ห้ามซ้ำ)` };
  }
  for (const d of dups) {
    const same = normValue(d.clash[d.key]) !== normValue(data[d.key])
      ? `\n(ต่างกันแค่คำนำหน้าชื่อ: "${data[d.key]}")` : '';
    if (!confirm(`มี${s.title}ที่ใช้${d.label}นี้อยู่แล้ว\n\n${where(d)}${same}\n\nต้องการบันทึกซ้ำหรือไม่`)) {
      return { key: d.key, message: `ยกเลิกการบันทึก เพราะ${d.label}ซ้ำกับรายการที่มีอยู่` };
    }
  }
  return null;
}
