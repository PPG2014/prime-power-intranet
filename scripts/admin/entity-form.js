/** ฟอร์มเพิ่ม/แก้ไขที่ใช้ร่วมทุกชุดข้อมูล ขับเคลื่อนด้วย SCHEMA */
import { esc, $ } from '../core/dom.js';
import { list } from '../services/data.js';
import { settings } from '../utils/settings.js';
import { CONFIG } from '../core/config.js';
import { uploadPhoto, uploadFile, kb, fileSize, fileKind } from '../services/photos.js';

/** รูปที่เลือกไว้ในฟอร์มที่เปิดอยู่ เก็บเป็น data URL */
let draftPhoto = '';
/** ไฟล์แนบของฟอร์มที่เปิดอยู่ */
let draftFiles = [];

/** ค่าหลายรายการอาจมาเป็นอาร์เรย์ (จาก SharePoint) หรือสตริงคั่นจุลภาค (จากข้อมูลตัวอย่าง) */
/** ค่าจาก SharePoint มาเป็น ISO ส่วนช่อง input ต้องการ YYYY-MM-DD */
export const toDateInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** ไฟล์แนบเก็บเป็น JSON ในคอลัมน์ข้อความ แปลงกลับให้ปลอดภัยแม้ข้อมูลเสีย */
export const toFiles = (v) => {
  if (Array.isArray(v)) return v;
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
};

/**
 * ค่าหลายรายการอาจมาได้สามแบบ
 * อาร์เรย์ของข้อความ, อาร์เรย์ของออบเจ็กต์จาก SharePoint, หรือสตริงคั่นจุลภาค
 * ต้องคลี่ให้เป็นอาร์เรย์ของข้อความเสมอ ไม่งั้นเทียบกับตัวเลือกในฟอร์มไม่ตรง
 * แล้วเครื่องหมายถูกที่เคยติ๊กไว้จะหายไปตอนเปิดแก้ไข
 */
export const toArray = (v) => {
  const raw = Array.isArray(v)
    ? v
    : String(v || '').split(',').map((x) => x.trim());

  return raw
    .map((x) => (x && typeof x === 'object'
      ? (x.LookupValue ?? x.Label ?? x.Title ?? x.DisplayName ?? x.Email ?? '')
      : x))
    .filter(Boolean);
};

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
    if (!parentValue) {
      rows = [];
    } else {
      /**
       * คอลัมน์ Lookup ใน SharePoint บางครั้ง Graph ส่งกลับมาเป็นเลข id
       * ในคีย์ที่ลงท้ายด้วย LookupId แทนที่จะเป็นชื่อ จึงต้องเทียบทั้งสองแบบ
       */
      let ids = [];
      if (field.matchList) {
        const parents = await list(field.matchList);
        ids = parents.filter((x) => x.Title === parentValue).map((x) => String(x.id));
      }
      const idKey = field.matchField + 'LookupId';
      rows = rows.filter((r) =>
        r[field.matchField] === parentValue ||
        (r[idKey] !== undefined && ids.includes(String(r[idKey]))));
    }
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

/** ช่องที่แสดงเฉพาะบางฝ่าย เช่นช่องโครงการ — อ่านรายชื่อฝ่ายจากตั้งค่าระบบ */
export async function fieldVisible(field, record) {
  if (!field.showIfDeptIn) return true;
  const cfg = await settings();
  const allow = String(cfg[field.showIfDeptIn] || '')
    .split(',').map((x) => x.trim()).filter(Boolean);
  return allow.includes(record[field.dependsOn || 'Department']);
}

export async function formBody(schema, record = {}) {
  const parts = [];
  for (const f of schema.fields) {
    const id = 'f_' + f.key;
    const v = record[f.key] ?? '';
    const help = f.help ? `<div class="field-help">${esc(f.help)}</div>` : '';
    let input;

    if (f.type === 'files') {
      draftFiles = toFiles(v);
      input = `<div class="file-field">
        <div class="file-list" id="${id}_list"></div>
        <label class="btn-mini upload-btn" for="${id}_input">+ แนบไฟล์</label>
        <input type="file" id="${id}_input" multiple hidden
          accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.dwg">
        <div class="photo-status" id="${id}_status"></div>
      </div>
      <input type="hidden" id="${id}">`;
    } else if (f.type === 'photo') {
      draftPhoto = v || '';
      input = `<div class="photo-field">
        <div class="photo-preview" id="${id}_prev">${v
          ? `<img src="${esc(v)}" alt="">` : '<span>ยังไม่มีรูป</span>'}</div>
        <div class="photo-actions">
          <label class="btn-mini upload-btn" for="${id}_file">เลือกรูป</label>
          <input type="file" id="${id}_file" accept="image/*" hidden>
          <button type="button" class="btn-mini danger" id="${id}_clear">ลบรูป</button>
        </div>
        <div class="photo-status" id="${id}_status"></div>
        <div class="field-help">รูปติดบัตรแนวตั้ง ถ่ายจากมือถือได้เลย ไม่ต้องย่อมาก่อน<br>
          ระบบครอปเป็นสัดส่วน 3:4 และย่อให้อัตโนมัติ</div>
      </div>
      <input type="hidden" id="${id}">`;
    } else if (f.type === 'multilookup') {
      const opts = await optionsFor({ ...f, type: 'lookup', allowEmpty: false },
        f.dependsOn ? record[f.dependsOn] : undefined);
      const chosen = toArray(v);
      input = `<div class="check-list" id="${id}">
        ${opts.length ? opts.map((o) => `<label class="check-item">
          <input type="checkbox" value="${esc(o.value)}"
            ${chosen.includes(o.value) ? 'checked' : ''}>
          <span>${esc(o.label)}</span></label>`).join('')
          : `<div class="check-empty">${esc(f.emptyHint || '— ไม่มีตัวเลือก —')}</div>`}
      </div>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" rows="4">${esc(v)}</textarea>`;
    } else if (f.type === 'date') {
      input = `<input id="${id}" type="date" value="${esc(toDateInput(v))}">`;
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

    const shown = await fieldVisible(f, record);
    parts.push(`<div class="field" data-field="${f.key}" ${shown ? '' : 'hidden'}>
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
    if (f.type === 'photo') { out[f.key] = draftPhoto; continue; }
    if (f.type === 'files') { out[f.key] = JSON.stringify(draftFiles); continue; }
    if (f.type === 'multilookup') {
      out[f.key] = [...el.querySelectorAll('input:checked')].map((c) => c.value);
      continue;
    }
    out[f.key] = f.type === 'yesno' ? el.checked
               : f.type === 'number' ? (+el.value || 0)
               : f.type === 'date' ? (el.value ? new Date(el.value + 'T00:00:00').toISOString() : null)
               : el.value.trim();
  }
  // เติมชนิดและขนาดไฟล์จากไฟล์แนบไฟล์แรก เฉพาะช่องที่ผู้ใช้ยังไม่ได้กรอกเอง
  if (schema.fields.some((f) => f.type === 'files') && draftFiles.length) {
    if ('FileFormat' in out && !out.FileFormat) out.FileFormat = draftFiles[0].kind;
    if ('FileSize' in out && !out.FileSize)     out.FileSize   = draftFiles[0].sizeText;
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
/** ผูกปุ่มเลือกรูปและปุ่มลบรูป เรียกหลังฟอร์มขึ้นจอ */
/**
 * โฟลเดอร์ปลายทางของไฟล์ = ชื่อ List / ชื่อฝ่ายที่เลือกไว้ในฟอร์ม
 * แยกตามฝ่ายเพื่อให้หาไฟล์ใน SharePoint ได้ง่ายเมื่อมีไฟล์จำนวนมาก
 */
function folderFor(schema) {
  const root = schema.spName || schema.list;
  const dept = $('#f_Department');
  const name = dept && dept.value ? dept.value : 'ไม่ระบุฝ่าย';
  return schema.fields.some((f) => f.key === 'Department') ? `${root}/${name}` : root;
}

export function bindPhoto(schema) {
  const hintName = () => ($('#f_Title') && $('#f_Title').value) || 'photo';

  for (const f of schema.fields) {
    if (f.type !== 'photo') continue;
    const id = 'f_' + f.key;
    const file = $('#' + id + '_file');
    const prev = $('#' + id + '_prev');
    const clear = $('#' + id + '_clear');
    if (!file) continue;

    file.onchange = async (ev) => {
      const img = ev.target.files[0];
      if (!img) return;

      const status = $('#' + id + '_status');
      const setStatus = (t, cls = '') => { if (status) { status.className = 'photo-status ' + cls; status.textContent = t; } };

      // ไม่จำกัดขนาดไฟล์ต้นทาง เพราะระบบย่อให้เองอยู่แล้ว
      setStatus('กำลังย่อรูปและอัปโหลด…');
      try {
        const url = await uploadPhoto(img, hintName(), folderFor(schema));
        draftPhoto = url;
        prev.innerHTML = `<img src="${url}" alt="">`;
        setStatus(`เรียบร้อย · จากไฟล์ ${kb(img.size)} ย่อเหลือประมาณ 60–80 KB`, 'ok');
      } catch (err) {
        setStatus(err.message, 'bad');
      } finally {
        ev.target.value = '';
      }
    };

    if (clear) clear.onclick = () => {
      draftPhoto = '';
      prev.innerHTML = '<span>ยังไม่มีรูป</span>';
      file.value = '';
    };
  }
}

/** ผูกช่องไฟล์แนบ เรียกหลังฟอร์มขึ้นจอ */
export function bindFiles(schema) {
  for (const f of schema.fields) {
    if (f.type !== 'files') continue;
    const id = 'f_' + f.key;
    const box = $('#' + id + '_list');
    const input = $('#' + id + '_input');
    const status = $('#' + id + '_status');
    if (!box || !input) continue;

    const draw = () => {
      box.innerHTML = draftFiles.length
        ? draftFiles.map((a, k) => `<div class="file-row">
            <span class="file-icon">${/^(JPG|JPEG|PNG|GIF|WEBP)$/.test(a.kind) ? '🖼' : '📄'}</span>
            <span class="file-name">${esc(a.name)}</span>
            <span class="file-meta">${esc(a.kind)} · ${esc(a.sizeText || fileSize(a.size))}</span>
            <button type="button" class="btn-mini danger" data-rm="${k}">ลบ</button>
          </div>`).join('')
        : '<div class="file-empty">ยังไม่มีไฟล์แนบ</div>';
      box.querySelectorAll('[data-rm]').forEach((b) => {
        b.onclick = () => { draftFiles.splice(+b.dataset.rm, 1); draw(); };
      });
    };
    draw();

    input.onchange = async (ev) => {
      const picked = [...ev.target.files];
      if (!picked.length) return;
      status.className = 'photo-status';
      status.textContent = `กำลังอัปโหลด ${picked.length} ไฟล์…`;

      let ok = 0;
      for (const file of picked) {
        try { draftFiles.push(await uploadFile(file, folderFor(schema))); ok++; draw(); }
        catch (err) { status.className = 'photo-status bad'; status.textContent = err.message; }
      }
      if (ok === picked.length) {
        status.className = 'photo-status ok';
        status.textContent = `แนบแล้ว ${ok} ไฟล์`;
      }
      ev.target.value = '';
    };
  }
}

export function bindDependents(schema) {
  // จับกลุ่มตามช่องแม่ก่อน เพราะช่องแม่หนึ่งช่องอาจมีลูกหลายช่อง
  // ถ้าผูก onchange ทีละช่อง ตัวหลังจะทับตัวแรกและลูกช่องแรกจะหยุดทำงาน
  const byParent = new Map();
  for (const f of schema.fields) {
    if (!f.dependsOn) continue;
    if (!byParent.has(f.dependsOn)) byParent.set(f.dependsOn, []);
    byParent.get(f.dependsOn).push(f);
  }

  for (const [parentKey, children] of byParent) {
    const parent = $('#f_' + parentKey);
    if (!parent) continue;

    parent.onchange = async () => {
      for (const f of children) {
        const child = $('#f_' + f.key);
        if (!child) continue;

        if (f.type === 'multilookup') {
          const opts = await optionsFor({ ...f, type: 'lookup', allowEmpty: false }, parent.value);
          child.innerHTML = opts.length
            ? opts.map((o) => `<label class="check-item">
                <input type="checkbox" value="${esc(o.value)}"><span>${esc(o.label)}</span></label>`).join('')
            : `<div class="check-empty">${esc(f.emptyHint || '— ไม่มีตัวเลือก —')}</div>`;
        } else {
          const opts = await optionsFor(f, parent.value);
          child.innerHTML = optionHtml(opts, '', f.emptyHint);
        }

        const box = $(`[data-field="${f.key}"]`);
        if (box) {
          const show = await fieldVisible(f, { [f.dependsOn]: parent.value });
          box.hidden = !show;
          if (!show && child.value !== undefined) child.value = '';
        }
      }
    };
  }
}
