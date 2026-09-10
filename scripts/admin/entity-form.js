/** ฟอร์มเพิ่ม/แก้ไขที่ใช้ร่วมทุกชุดข้อมูล ขับเคลื่อนด้วย SCHEMA */
import { esc, $ } from '../core/dom.js';
import { list } from '../services/data.js';

/** ค่าหลายรายการอาจมาเป็นอาร์เรย์ (จาก SharePoint) หรือสตริงคั่นจุลภาค (จากข้อมูลตัวอย่าง) */
export const toArray = (v) =>
  Array.isArray(v) ? v : String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

/**
 * คืนตัวเลือกเป็น [{ value, label }]
 * ถ้าช่องนี้ผูกกับช่องอื่น (dependsOn) จะกรองให้เหลือเฉพาะที่ตรงกับค่าของช่องแม่
 */
export async function optionsFor(field, parentValue) {
  if (field.type === 'choice') return field.options.map((o) => ({ value: o, label: o }));
  if (field.type !== 'lookup') return [];

  let rows = (await list(field.from))
    .filter((r) => r.IsActive !== false)
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));

  if (field.dependsOn) {
    rows = parentValue ? rows.filter((r) => r[field.matchField] === parentValue) : [];
  }

  const opts = rows.map((r) => ({
    value: r.Title,
    label: field.labelWith && r[field.labelWith] ? `${r.Title} · ${r[field.labelWith]}` : r.Title,
  }));
  return field.allowEmpty ? [{ value: '', label: '— ไม่ระบุ —' }, ...opts] : opts;
}

/** สร้างรายการ <option> พร้อมเก็บค่าเดิมที่ไม่มีในรายการไว้ให้เห็น */
export function optionHtml(opts, value, emptyHint) {
  const known = opts.some((o) => o.value === value);
  const extra = !known && value
    ? `<option value="${esc(value)}" selected>${esc(value)} (ค่าเดิมที่ไม่มีในรายการ)</option>` : '';
  const body = opts.map((o) =>
    `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  if (!extra && !opts.filter((o) => o.value).length && emptyHint)
    return `<option value="">${esc(emptyHint)}</option>`;
  return extra + body;
}

export async function formBody(schema, record = {}) {
  const parts = [];
  for (const f of schema.fields) {
    const id = 'f_' + f.key;
    const v = record[f.key] ?? '';
    const help = f.help ? `<div class="field-help">${esc(f.help)}</div>` : '';
    let input;

    if (f.type === 'multilookup') {
      const opts = await optionsFor({ ...f, type: 'lookup', allowEmpty: false });
      const chosen = toArray(v);
      input = `<div class="check-list" id="${id}">
        ${opts.map((o, k) => `<label class="check-item">
          <input type="checkbox" value="${esc(o.value)}"
            ${chosen.includes(o.value) ? 'checked' : ''}>
          <span>${esc(o.label)}</span></label>`).join('')}
      </div>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" rows="4">${esc(v)}</textarea>`;
    } else if (f.type === 'number') {
      input = `<input id="${id}" type="number" value="${esc(v)}">`;
    } else if (f.type === 'yesno') {
      input = `<label class="switch"><input id="${id}" type="checkbox" ${v !== false ? 'checked' : ''}>
        <span>เปิดใช้งาน</span></label>`;
    } else if (f.type === 'choice' || f.type === 'lookup') {
      const opts = await optionsFor(f, f.dependsOn ? record[f.dependsOn] : undefined);
      input = `<select id="${id}">${optionHtml(opts, v, f.emptyHint)}</select>`;
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
    if (f.type === 'multilookup') {
      out[f.key] = [...el.querySelectorAll('input:checked')].map((c) => c.value);
      continue;
    }
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

/**
 * ผูกช่องที่ขึ้นกับช่องอื่น เช่น แผนก ที่ต้องเปลี่ยนตามฝ่ายที่เลือก
 * เรียกหลังฟอร์มขึ้นจอแล้ว
 */
export function bindDependents(schema) {
  for (const f of schema.fields) {
    if (!f.dependsOn) continue;
    const parent = $('#f_' + f.dependsOn);
    const child = $('#f_' + f.key);
    if (!parent || !child) continue;

    parent.onchange = async () => {
      const opts = await optionsFor(f, parent.value);
      child.innerHTML = optionHtml(opts, '', f.emptyHint);
    };
  }
}
