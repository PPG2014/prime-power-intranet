/**
 * ตัววาดแบบฟอร์ม
 *
 * อ่านนิยามช่องจาก List FormFields แล้วสร้างหน้าจอกรอกให้เอง
 * มีตัวเดียวใช้ได้ทุกฟอร์ม เพิ่มฟอร์มใหม่คือเพิ่มแถวในตาราง ไม่ต้องแก้ไฟล์นี้
 */
import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { uploadFile, fileSize, fileKind } from '../services/photos.js';
import { toDateInput } from '../admin/entity-form.js';

/** ไฟล์แนบของฟอร์มที่เปิดอยู่ */
let files = [];
let currentValues = {};

/** ตัวเลือกของช่องที่ดึงจาก List อื่น เก็บไว้ใช้ตอนวาด */
let lookupData = {};

/**
 * โหลดตัวเลือกของช่องชนิด lookup และ person ล่วงหน้า
 * ช่อง Options ใส่ชื่อ List เช่น projects หรือ directory
 */
export async function loadLookups(fields) {
  lookupData = {};
  const names = [...new Set(fields
    .filter((f) => f.FieldType === 'lookup' || f.FieldType === 'person')
    .map((f) => (f.FieldType === 'person' ? 'directory' : String(f.Options || '').trim()))
    .filter(Boolean))];

  for (const name of names) {
    try {
      lookupData[name] = (await list(name))
        .filter((r) => r.IsActive !== false)
        .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));
    } catch (e) {
      lookupData[name] = [];
      console.warn(`โหลดตัวเลือกจาก ${name} ไม่สำเร็จ:`, e.message);
    }
  }
}
export const attachedFiles = () => files;

/**
 * ช่องหัวข้อมาตรฐานที่ทุกแบบฟอร์มมีเหมือนกัน
 * 5 ช่องแรกดึงข้อมูลผู้ใช้อัตโนมัติ ผู้ยื่นไม่ต้องกรอก
 * ผู้ดูแลไม่ต้องเพิ่มช่องเหล่านี้ในตาราง ระบบเติมให้เอง
 * ถ้าฟอร์มไหนมีช่องชื่อซ้ำอยู่แล้ว จะใช้ของฟอร์มนั้นแทน ไม่เติมซ้ำ
 */
export const STANDARD = [
  { FieldKey: 'std_emp_code', Title: 'รหัสพนักงาน', FieldType: 'readonly',
    DefaultValue: '{me.EmployeeCode}', Section: 'ข้อมูลผู้ยื่น', ColumnWidth: 'half' },
  { FieldKey: 'std_emp_name', Title: 'ชื่อ-นามสกุล', FieldType: 'readonly',
    DefaultValue: '{me.Title}', Section: 'ข้อมูลผู้ยื่น', ColumnWidth: 'half' },
  { FieldKey: 'std_emp_email', Title: 'อีเมล', FieldType: 'readonly',
    DefaultValue: '{me.Email}', Section: 'ข้อมูลผู้ยื่น', ColumnWidth: 'half' },
  { FieldKey: 'std_emp_dept', Title: 'ฝ่าย', FieldType: 'readonly',
    DefaultValue: '{me.Department}', Section: 'ข้อมูลผู้ยื่น', ColumnWidth: 'half' },
  { FieldKey: 'std_emp_section', Title: 'แผนก', FieldType: 'readonly',
    DefaultValue: '{me.Section}', Section: 'ข้อมูลผู้ยื่น', ColumnWidth: 'half' },
  { FieldKey: 'std_subject', Title: 'ชื่อเรื่อง', FieldType: 'text', IsRequired: 'Yes',
    Section: 'ข้อมูลผู้ยื่น', ColumnWidth: 'half' },
  { FieldKey: 'std_date', Title: 'วันที่', FieldType: 'date', IsRequired: 'Yes',
    DefaultValue: '{today}', Section: 'ข้อมูลผู้ยื่น', ColumnWidth: 'half' },
];

/**
 * รวมช่องมาตรฐานเข้ากับช่องเฉพาะของฟอร์ม
 * ช่องมาตรฐานมาก่อน เว้นแต่ฟอร์มปิดไว้ด้วย useStandard=false หรือมีช่องชื่อซ้ำเอง
 */
/** ชื่อไทยของช่องมาตรฐาน จาก FieldKey ใช้ตอนแสดงคำขอในหน้าอื่น */
export function standardLabel(key) {
  const f = STANDARD.find((x) => x.FieldKey === key);
  return f ? f.Title : null;
}

export function withStandard(formFields, form) {
  if (form && (form.UseStandardHeader === false || form.UseStandardHeader === 'No')) {
    return formFields;
  }
  const titles = new Set(formFields.map((f) => String(f.Title).trim()));
  const std = STANDARD
    .filter((f) => !titles.has(f.Title))
    .map((f, i) => ({ ...f, Options: '', HelpText: '', ShowIf: '', SortOrder: -100 + i, IsActive: true }));
  return [...std, ...formFields];
}

const opts = (f) => String(f.Options || '').split('\n').map((x) => x.trim()).filter(Boolean);
const isTrue = (v) => v === true || v === 'Yes' || v === 'ใช่';

/** ค่าเริ่มต้นของช่องหนึ่ง จากค่าที่ renderForm ได้รับ (ใช้ตอน bind) */
function getDefault(fields, f) {
  return currentValues[f.FieldKey] ?? [];
}

/** แปลงค่ารายการเป็นอาร์เรย์ของแถวเสมอ */
function toLineRows(v) {
  if (Array.isArray(v)) return v;
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}

/**
 * แทนค่าอัตโนมัติในช่องค่าเริ่มต้น
 * {today} = วันนี้ · {me.X} = ข้อมูลของผู้ที่ล็อกอินจากทะเบียนบุคลากร
 */
function resolveDefault(raw, me) {
  const v = String(raw ?? '');
  if (v === '{today}') return new Date().toISOString();
  const m = v.match(/^\{me\.(\w+)\}$/);
  if (m) return (me && me[m[1]]) || '';
  return v;
}

/** เงื่อนไขแสดงช่อง รูปแบบ key=value คั่นหลายเงื่อนไขด้วย | (ตรงข้อใดข้อหนึ่งก็พอ) */
function showIfMatches(rule, values) {
  if (!rule) return true;
  return String(rule).split('|').some((part) => {
    const [key, ...rest] = part.split('=');
    return String(values[key.trim()] ?? '') === rest.join('=').trim();
  });
}

function control(f, value) {
  const id = 'q_' + f.FieldKey;
  const req = isTrue(f.IsRequired) ? 'aria-required="true"' : '';

  switch (f.FieldType) {
    case 'readonly':
      return `<div class="q-readonly" id="${id}" data-value="${esc(value)}">${
        esc(value) || '<span class="dim">ยังไม่มีข้อมูลในทะเบียนบุคลากร</span>'}</div>`;
    case 'textarea':
      return `<textarea id="${id}" rows="5" ${req}>${esc(value)}</textarea>`;
    case 'number':
    case 'currency':
      return `<input id="${id}" type="number" step="${f.FieldType === 'currency' ? '0.01' : '1'}"
                value="${esc(value)}" ${req}>`;
    case 'date':
      return `<input id="${id}" type="date" value="${esc(toDateInput(value))}" ${req}>`;
    case 'time':
      return `<input id="${id}" type="time" value="${esc(value)}" ${req}>`;
    case 'yesno':
      return `<label class="q-switch"><input id="${id}" type="checkbox" ${value ? 'checked' : ''}>
        <span>ใช่</span></label>`;
    case 'choice':
      return `<select id="${id}" ${req}>
        <option value="">— เลือก —</option>
        ${opts(f).map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;
    case 'lookup':
    case 'person': {
      /**
       * ตัวเลือกมาจาก List อื่น เช่นทะเบียนโครงการหรือทะเบียนบุคลากร
       * ใช้ input คู่กับ datalist เพื่อให้พิมพ์ค้นหาได้ ไม่ต้องเลื่อนหาในรายการยาว
       */
      const src = f.FieldType === 'person' ? 'directory' : String(f.Options || '').trim();
      const rows = lookupData[src] || [];
      const hint = !src ? ' (ยังไม่ได้ระบุว่าดึงตัวเลือกจาก List ไหน)' : '';
      return `<input id="${id}" list="${id}_opts" value="${esc(value)}" ${req}
                placeholder="พิมพ์เพื่อค้นหา${esc(hint)}" autocomplete="off">
        <datalist id="${id}_opts">
          ${rows.map((r) => `<option value="${esc(r.Title)}">${
            esc([r.ProjectCode, r.Position, r.Department].filter(Boolean)[0] || '')}</option>`).join('')}
        </datalist>`;
    }
    case 'lineitems': {
      /**
       * ตารางรายการที่เพิ่มบรรทัดได้ เช่นรายการซื้อของ
       * คอลัมน์กำหนดใน Options บรรทัดละคอลัมน์ รูปแบบ key|ชื่อ|ชนิด
       * ชนิด: text, number, money, choice:ตัวเลือก1;ตัวเลือก2
       * คอลัมน์ money จะถูกรวมเป็นยอดท้ายตาราง (คูณจำนวนถ้ามีคอลัมน์ qty)
       */
      const cols = String(f.Options || 'detail|รายละเอียด|text\nqty|จำนวน|number\nprice|ราคา|money')
        .split('\n').map((line) => {
          const [key, label, type] = line.split('|').map((x) => x.trim());
          return { key, label: label || key, type: type || 'text' };
        }).filter((c) => c.key);
      const rows = toLineRows(value);
      return `<div class="li-field" id="${id}" data-cols='${esc(JSON.stringify(cols))}'>
        <table class="li-table">
          <thead><tr>
            ${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}
            <th class="li-x"></th>
          </tr></thead>
          <tbody class="li-body"></tbody>
          ${cols.some((c) => c.type === 'money') ? `<tfoot><tr>
            <td colspan="${cols.length - 1}" class="li-sumlabel">รวมเป็นเงิน</td>
            <td class="li-sum">0</td><td></td></tr></tfoot>` : ''}
        </table>
        <button type="button" class="btn-mini li-add">+ เพิ่มรายการ</button>
      </div>`;
    }
    case 'multichoice':
      return `<div class="q-checks" id="${id}">
        ${opts(f).map((o) => `<label class="check-item">
          <input type="checkbox" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}
      </div>`;
    case 'file':
      return `<div class="q-files">
        <div class="file-list" id="${id}_list"></div>
        <label class="btn-mini upload-btn" for="${id}_input">+ แนบไฟล์</label>
        <input type="file" id="${id}_input" multiple hidden>
        <div class="photo-status" id="${id}_status"></div>
      </div>`;
    default:
      return `<input id="${id}" value="${esc(value)}" ${req}>`;
  }
}

/** วาดฟอร์มทั้งใบ จัดกลุ่มตามหัวข้อที่ระบุไว้ในช่อง Section */
export function renderForm(fields, me, values = {}) {
  files = [];
  currentValues = values || {};
  const groups = [];
  fields.forEach((f) => {
    const name = f.Section || 'ข้อมูลคำขอ';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, rows: [] }));
    g.rows.push(f);
  });

  return groups.map((g) => `
    <section class="q-group">
      <h3 class="q-group-title">${esc(g.name)}</h3>
      <div class="q-grid">
        ${g.rows.map((f) => {
          const value = values[f.FieldKey] ?? resolveDefault(f.DefaultValue, me);
          const shown = showIfMatches(f.ShowIf, { ...values,
            ...Object.fromEntries(fields.map((x) => [x.FieldKey,
              values[x.FieldKey] ?? resolveDefault(x.DefaultValue, me)])) });
          return `
            <div class="q-field ${f.ColumnWidth === 'full' ? 'q-full' : ''}"
                 data-q="${esc(f.FieldKey)}" ${shown ? '' : 'hidden'}>
              <label for="q_${esc(f.FieldKey)}">${esc(f.Title)}${
                isTrue(f.IsRequired) ? ' <b class="req">*</b>' : ''}</label>
              ${f.HelpText ? `<div class="q-help">${esc(f.HelpText)}</div>` : ''}
              ${control(f, value)}
            </div>`;
        }).join('')}
      </div>
    </section>`).join('');
}

/** อ่านค่าจากฟอร์ม คืน null พร้อมข้อความถ้ากรอกไม่ครบ */
export function collectForm(fields) {
  const out = {};
  const errors = [];

  for (const f of fields) {
    const box = $(`[data-q="${f.FieldKey}"]`);
    if (box && box.hidden) continue;               // ช่องที่ซ่อนอยู่ไม่ต้องเก็บและไม่ต้องตรวจ

    const el = $('#q_' + f.FieldKey);
    let v = '';

    if (f.FieldType === 'file') v = files;
    else if (f.FieldType === 'lineitems') {
      const box = $('#' + 'q_' + f.FieldKey);
      const cols = box ? JSON.parse(box.dataset.cols) : [];
      const rows = [];
      if (box) box.querySelectorAll('.li-body tr').forEach((tr) => {
        const row = {};
        cols.forEach((c) => { row[c.key] = (tr.querySelector(`[data-k="${c.key}"]`) || {}).value || ''; });
        // เก็บเฉพาะแถวที่กรอกอะไรบ้าง
        if (Object.values(row).some((x) => String(x).trim())) rows.push(row);
      });
      v = rows;
    }
    else if (f.FieldType === 'readonly') v = el ? el.dataset.value || '' : '';
    else if (f.FieldType === 'multichoice') {
      v = el ? [...el.querySelectorAll('input:checked')].map((c) => c.value) : [];
    } else if (f.FieldType === 'yesno') v = el ? el.checked : false;
    else if (f.FieldType === 'date') {
      v = el && el.value ? new Date(el.value + 'T00:00:00').toISOString() : '';
    } else v = el ? el.value.trim() : '';

    const empty = Array.isArray(v) ? !v.length : !String(v ?? '').trim();
    if (isTrue(f.IsRequired) && empty && f.FieldType !== 'readonly') {
      errors.push(f.Title);
    }
    out[f.FieldKey] = v;
  }

  return errors.length ? { errors } : { values: out };
}

/** ผูกช่องแนบไฟล์และเงื่อนไขการแสดงช่อง เรียกหลังฟอร์มขึ้นจอ */
export function bindForm(fields, folder) {
  // ตารางรายการ
  fields.filter((f) => f.FieldType === 'lineitems').forEach((f) => {
    const box = $('#q_' + f.FieldKey);
    if (!box) return;
    const cols = JSON.parse(box.dataset.cols);
    const body = box.querySelector('.li-body');
    const sumCell = box.querySelector('.li-sum');
    const initial = toLineRows(getDefault(fields, f));

    const cell = (c, val) => {
      if (String(c.type).startsWith('choice:')) {
        const opts = c.type.slice(7).split(';').map((x) => x.trim()).filter(Boolean);
        return `<td><select data-k="${c.key}"><option value="">— เลือก —</option>${
          opts.map((o) => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></td>`;
      }
      return c.type === 'text'
        ? `<td><input data-k="${c.key}" value="${esc(val ?? '')}"></td>`
        : `<td><input data-k="${c.key}" type="number" ${c.type === 'money' ? 'step="0.01"' : ''}
             value="${esc(val ?? '')}" class="li-num"></td>`;
    };

    const recalc = () => {
      if (!sumCell) return;
      let sum = 0;
      body.querySelectorAll('tr').forEach((tr) => {
        const money = cols.find((c) => c.type === 'money');
        const qty = cols.find((c) => c.key === 'qty');
        if (!money) return;
        const priceEl = tr.querySelector(`[data-k="${money.key}"]`);
        const price = +(priceEl && priceEl.value) || 0;
        const q = qty && qty.key !== money.key
          ? (+(tr.querySelector(`[data-k="${qty.key}"]`) || {}).value || 1) : 1;
        sum += price * q;
      });
      sumCell.textContent = sum.toLocaleString('th-TH', { minimumFractionDigits: 2 });
    };

    const addRow = (data = {}) => {
      const tr = document.createElement('tr');
      tr.innerHTML = cols.map((c) => cell(c, data[c.key])).join('')
        + '<td class="li-x"><button type="button" class="li-del">✕</button></td>';
      body.appendChild(tr);
      tr.querySelectorAll('input, select').forEach((el) => { el.oninput = recalc; el.onchange = recalc; });
      tr.querySelector('.li-del').onclick = () => { tr.remove(); recalc(); };
    };

    (initial.length ? initial : [{}]).forEach(addRow);
    recalc();
    box.querySelector('.li-add').onclick = () => addRow();
  });

  // แนบไฟล์
  fields.filter((f) => f.FieldType === 'file').forEach((f) => {
    const id = 'q_' + f.FieldKey;
    const box = $('#' + id + '_list');
    const input = $('#' + id + '_input');
    const status = $('#' + id + '_status');
    if (!box || !input) return;

    const draw = () => {
      box.innerHTML = files.length
        ? files.map((a, k) => `<div class="file-row">
            <span class="file-icon">${/^(JPG|JPEG|PNG|GIF|WEBP)$/.test(a.kind) ? '🖼' : '📄'}</span>
            <span class="file-name">${esc(a.name)}</span>
            <span class="file-meta">${esc(a.kind)} · ${esc(a.sizeText || '')}</span>
            <button type="button" class="btn-mini danger" data-qrm="${k}">ลบ</button>
          </div>`).join('')
        : '<div class="file-empty">ยังไม่มีไฟล์แนบ</div>';
      box.querySelectorAll('[data-qrm]').forEach((b) => {
        b.onclick = () => { files.splice(+b.dataset.qrm, 1); draw(); };
      });
    };
    draw();

    input.onchange = async (ev) => {
      const picked = [...ev.target.files];
      if (!picked.length) return;
      status.className = 'photo-status';
      status.textContent = `กำลังอัปโหลด ${picked.length} ไฟล์…`;
      let ok = 0;
      for (const [n, file] of picked.entries()) {
        const label = `${picked.length > 1 ? `(${n + 1}/${picked.length}) ` : ''}${file.name}`;
        try {
          files.push(await uploadFile(file, folder, (pct) => {
            status.className = 'photo-status';
            status.textContent = `กำลังอัปโหลด ${label} · ${pct}%`;
          }));
          ok++; draw();
        } catch (err) { status.className = 'photo-status bad'; status.textContent = err.message; }
      }
      if (ok === picked.length) {
        status.className = 'photo-status ok';
        status.textContent = `แนบแล้ว ${ok} ไฟล์`;
      }
      ev.target.value = '';
    };
  });

  // ช่องที่แสดงตามเงื่อนไข ต้องอัปเดตทันทีเมื่อค่าที่อ้างถึงเปลี่ยน
  const conditional = fields.filter((f) => f.ShowIf);
  if (!conditional.length) return;

  const refresh = () => {
    const current = {};
    fields.forEach((f) => {
      const el = $('#q_' + f.FieldKey);
      if (el) current[f.FieldKey] = f.FieldType === 'yesno' ? el.checked : (el.value ?? '');
    });
    conditional.forEach((f) => {
      const box = $(`[data-q="${f.FieldKey}"]`);
      if (box) box.hidden = !showIfMatches(f.ShowIf, current);
    });
  };

  const watched = new Set();
  conditional.forEach((f) => String(f.ShowIf).split('|')
    .forEach((p) => watched.add(p.split('=')[0].trim())));
  watched.forEach((key) => {
    const el = $('#q_' + key);
    if (el) el.onchange = refresh;
  });
  refresh();
}

/**
 * สรุปคำตอบทั้งใบเป็นข้อความอ่านง่าย สำหรับแสดงในการ์ด Teams และอีเมล
 * ผู้อนุมัติจะเห็นข้อมูลครบโดยไม่ต้องเปิดเว็บ
 * ใช้ชื่อหัวข้อภาษาไทยจาก FormFields และรองรับตารางรายการ/ตัวเลือกหลายค่า
 */
export function summarizeForm(fields, values, opts = {}) {
  const nl = opts.html ? '<br>' : '\n';
  const esc = opts.html
    ? (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : (t) => String(t);

  const thaiDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const one = (f, v) => {
    if (v == null || v === '') return '';
    if (f.FieldType === 'yesno') return v ? 'ใช่' : 'ไม่ใช่';
    if (f.FieldType === 'date') return thaiDate(v);
    if (f.FieldType === 'file') {
      const arr = Array.isArray(v) ? v : [];
      return arr.length ? arr.map((x) => x.name || x).join(', ') : '';
    }
    if (f.FieldType === 'lineitems') {
      const rows = Array.isArray(v) ? v : [];
      if (!rows.length) return '';
      const cols = String(f.Options || '').split(/\r?\n/).map((line) => {
        const [key, label] = line.split('|').map((x) => (x || '').trim());
        return { key, label: label || key };
      }).filter((c) => c.key);
      const head = (k) => (cols.find((c) => c.key === k) || {}).label || k;
      return nl + rows.map((r, i) => '   ' + (i + 1) + ') '
        + Object.keys(r).filter((k) => String(r[k]).trim())
            .map((k) => `${esc(head(k))}: ${esc(r[k])}`).join('  ·  ')).join(nl);
    }
    if (Array.isArray(v)) return v.map((x) => esc(typeof x === 'object' ? (x.Title || x.LookupValue || '') : x)).join(', ');
    if (typeof v === 'object') return esc(v.Title || v.LookupValue || '');
    if (f.FieldType === 'currency') {
      const n = Number(v);
      return isNaN(n) ? esc(v) : n.toLocaleString('th-TH', { minimumFractionDigits: 2 }) + ' บาท';
    }
    return esc(v);
  };

  const lines = [];
  for (const f of fields) {
    if (f.FieldType === 'section') continue;
    const text = one(f, values[f.FieldKey]);
    if (!String(text).trim()) continue;
    lines.push(`${esc(f.Title)}: ${text}`);
  }
  return lines.join(nl);
}
