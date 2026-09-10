/** ฟอร์มเพิ่ม/แก้ไขที่ใช้ร่วมทุกชุดข้อมูล ขับเคลื่อนด้วย SCHEMA */
import { esc, $ } from '../core/dom.js';
import { list } from '../services/data.js';

async function optionsFor(field) {
  if (field.type === 'choice') return field.options;
  if (field.type === 'lookup') return (await list(field.from)).map((r) => r.Title);
  return [];
}

export async function formBody(schema, record = {}) {
  const parts = [];
  for (const f of schema.fields) {
    const id = 'f_' + f.key;
    const v = record[f.key] ?? '';
    const help = f.help ? `<div class="field-help">${esc(f.help)}</div>` : '';
    let input;

    if (f.type === 'textarea') {
      input = `<textarea id="${id}" rows="4">${esc(v)}</textarea>`;
    } else if (f.type === 'number') {
      input = `<input id="${id}" type="number" value="${esc(v)}">`;
    } else if (f.type === 'yesno') {
      input = `<label class="switch"><input id="${id}" type="checkbox" ${v !== false ? 'checked' : ''}>
        <span>เปิดใช้งาน</span></label>`;
    } else if (f.type === 'choice' || f.type === 'lookup') {
      const opts = await optionsFor(f);
      input = `<select id="${id}">${opts.map((o) =>
        `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o || '— ไม่ระบุ —')}</option>`).join('')}</select>`;
    } else {
      input = `<input id="${id}" value="${esc(v)}">`;
    }

    parts.push(`<div class="field">
      <label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${help}${input}</div>`);
  }
  return `<div class="field-grid">${parts.join('')}</div>
          <div class="field-error" id="form-error" hidden></div>`;
}

/** อ่านค่าจากฟอร์ม คืน null ถ้ากรอกไม่ครบ พร้อมแสดงข้อความบอกจุดที่ผิด */
export function collect(schema) {
  const out = {};
  for (const f of schema.fields) {
    const el = $('#f_' + f.key);
    if (!el) continue;
    out[f.key] = f.type === 'yesno' ? el.checked
               : f.type === 'number' ? (+el.value || 0)
               : el.value.trim();
  }
  const err = $('#form-error');
  const missing = schema.fields.find((f) => f.required && !String(out[f.key] || '').trim());
  if (missing) {
    err.textContent = `กรอก${missing.label}ก่อนบันทึก`;
    err.hidden = false;
    $('#f_' + missing.key).focus();
    return null;
  }
  if (out.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.Email)) {
    err.textContent = 'รูปแบบอีเมลไม่ถูกต้อง ตรวจสอบอีกครั้ง';
    err.hidden = false;
    $('#f_Email').focus();
    return null;
  }
  return out;
}
