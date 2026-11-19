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
import { OM_PROJECT, OM_OTHER, OM_FORMS, omSites } from '../services/om.js';
import { PPE_PROJECT, PPE_OTHER, ppeConfig } from '../services/ppe.js';
import { PPC_PROJECT, ppcConfig } from '../services/ppc.js';
import { mileageConfig, carRateFor, vehicleLabel, vehicleRate, isMileageVehicle, VEHICLE_RE, RATE_RE } from '../services/mileage.js';

/** ตัวเลือกพิเศษของช่องโครงการ — ใช้เมื่อคำขอไม่เกี่ยวกับโครงการใด (ผู้บังคับบัญชาจะเป็นผู้อนุมัติ) */
export const NO_PROJECT = 'ไม่เกี่ยวกับโครงการ';
/** ตัวเลือกพิเศษของช่องโครงการ: งานของสำนักงาน (ไม่ใช่โครงการ) — ผู้บังคับบัญชาอนุมัติเหมือน "ไม่เกี่ยวกับโครงการ" */
export const OFFICE_PROJECTS = ['สำนักงานใหญ่', 'สำนักงานชลบุรี'];

/** ไฟล์แนบของฟอร์มที่เปิดอยู่ */
let files = [];
let currentValues = {};
/** ผู้ยื่น (จากทะเบียนบุคลากร) ของฟอร์มที่เปิดอยู่ — ใช้หาอัตราค่าพาหนะของคนนั้น */
let currentMe = null;

/** ตัวเลือกของช่องที่ดึงจาก List อื่น เก็บไว้ใช้ตอนวาด */
let lookupData = {};

/**
 * โหลดตัวเลือกของช่องชนิด lookup และ person ล่วงหน้า
 * ช่อง Options ใส่ชื่อ List เช่น projects หรือ directory
 */
export async function loadLookups(fields, { formCode = '' } = {}) {
  lookupData = {};
  // แบบฟอร์มเบิกเงิน/ใบขอสั่งซื้อ: ช่องโครงการมีตัวเลือก "งาน O&M" + รายชื่อโครงการ O&M
  if (OM_FORMS.includes(String(formCode).trim())
    && fields.some((f) => f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects')) {
    lookupData._om = await omSites();
  }
  // ทุกแบบฟอร์มที่มีช่องโครงการ: ตัวเลือก Prime Power Engineering Pro + รายชื่อโครงการ PPE
  if (fields.some((f) => f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects')) {
    lookupData._ppe = (await ppeConfig()).projects.filter((p) => p.on).map((p) => p.name);
    // Prime Power Construction: โครงการหลัก (ทะเบียนโครงการ) + งานที่ไม่ใช่โครงการ (จัดการข้อมูล → 🏗️ งาน PPC)
    lookupData._ppc = (await ppcConfig()).projects.filter((p) => p.on).map((p) => p.name);
  }
  // เบิกค่าเดินทาง: มีช่อง/คอลัมน์ประเภทพาหนะ → โหลดอัตรารถยนต์ส่วนบุคคลรายบุคคล
  if (fields.some((f) => (f.FieldType === 'choice' && VEHICLE_RE.test(f.Title || ''))
    || (f.FieldType === 'lineitems' && lineCols(f).some(isVehicleCol)))) {
    lookupData._mileage = await mileageConfig();
  }
  // ตารางรายการที่มีคอลัมน์เลือกเครื่องมือ (ใบยืม-คืน / ใบโอนย้าย) → โหลดทะเบียนเครื่องมือ
  if (fields.some((f) => f.FieldType === 'lineitems' && lineCols(f).some((c) => c.type === 'equipment'))) {
    const eq = await import('../services/equipment.js');
    lookupData._equip = await eq.equipment().catch(() => []);
    lookupData._eqmod = eq;
  }
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
  const f = [...STANDARD, ATTACH].find((x) => x.FieldKey === key);
  return f ? f.Title : null;
}

/**
 * ช่องแนบหลักฐานประกอบ — เติมท้ายฟอร์มให้เองเมื่อฟอร์มนั้นยังไม่มีช่องแนบไฟล์
 * ฟอร์มที่มีตารางเลขไมล์ (เบิกค่าเดินทาง) จะบอกให้แนบรูปเลขไมล์ของแต่ละงาน
 */
export const ATTACH = { FieldKey: 'std_attach', Title: 'แนบหลักฐานประกอบการเบิก / เอกสารประกอบ',
  FieldType: 'file', Section: 'หลักฐานประกอบ', ColumnWidth: 'full' };

function attachHelp(formFields) {
  const mileage = formFields.some((f) => f.FieldType === 'lineitems' && /ไมล์/.test(String(f.Options || '')));
  return mileage
    ? 'กรณีเบิกค่าน้ำมัน ให้จดเลขไมล์ก่อน-หลังของแต่ละงาน และแนบรูปหน้าปัดเลขไมล์ พร้อมใบเสร็จค่าน้ำมัน/ทางด่วน/ที่จอดรถ'
    : 'ถ้ามี เช่น ใบเสร็จ ใบกำกับภาษี รูปถ่าย หรือเอกสารที่เกี่ยวข้อง';
}

export function withStandard(formFields, form) {
  // ฟอร์มที่ยังไม่มีช่องแนบไฟล์ เติมช่องแนบหลักฐานให้ท้ายฟอร์ม (ไม่บังคับ)
  const withAttach = formFields.some((f) => f.FieldType === 'file') ? formFields
    : [...formFields, { ...ATTACH, Options: '', HelpText: attachHelp(formFields), ShowIf: '',
      SortOrder: 99999, IsActive: true }];
  if (form && (form.UseStandardHeader === false || form.UseStandardHeader === 'No')) {
    return withAttach;
  }
  const titles = new Set(formFields.map((f) => String(f.Title).trim()));
  const std = STANDARD
    .filter((f) => !titles.has(f.Title))
    .map((f, i) => ({ ...f, Options: '', HelpText: '', ShowIf: '', SortOrder: -100 + i, IsActive: true }));
  return [...std, ...withAttach];
}

/** คอลัมน์ของตารางรายการ จาก Options บรรทัดละ key|ชื่อ|ชนิด */
export function lineCols(f) {
  return String(f.Options || 'detail|รายละเอียด|text\nqty|จำนวน|number\nprice|ราคา|money')
    .split(/\r?\n/).map((line) => {
      const [key, label, type] = line.split('|').map((x) => (x || '').trim());
      return { key, label: label || key, type: type || 'text' };
    }).filter((c) => c.key);
}

/** ยอดรวมของตารางรายการ (คอลัมน์ money แรก คูณคอลัมน์ qty ถ้ามี) · ไม่มีคอลัมน์เงินคืน null */
export function lineTotal(cols, rows) {
  const money = cols.find((c) => c.type === 'money');
  if (!money) return null;
  const qty = cols.find((c) => c.key === 'qty' && c.key !== money.key);
  return rows.reduce((t, r) => t + (+r[money.key] || 0) * (qty ? (+r[qty.key] || 1) : 1), 0);
}

const opts = (f) => String(f.Options || '').split('\n').map((x) => x.trim()).filter(Boolean);

/* ───── ค่าพาหนะ: รถยนต์ส่วนบุคคลคิดตามอัตราของผู้ยื่น (services/mileage.js) ───── */
const isVehicleCol = (c) => String(c.type).startsWith('choice:') && VEHICLE_RE.test(c.label);
const isRateCol = (c) => !isVehicleCol(c) && RATE_RE.test(c.label) && c.type !== 'text';
/** อัตรารถยนต์ส่วนบุคคลของผู้ยื่น · ฟอร์มที่ไม่มีช่องพาหนะคืน null */
const myCarRate = () => (lookupData._mileage ? carRateFor(lookupData._mileage, currentMe && currentMe.Title) : null);
/** ตัวเลือกพาหนะ: แสดงอัตราของผู้ยื่น · ค่าเดิมที่บันทึกด้วยอัตราอื่น (รถยนต์ส่วนบุคคล) ถือว่าเป็นตัวเลือกเดียวกัน */
const vehicleOptions = (list, val) => list.map((o) => {
  const label = vehicleLabel(o, myCarRate());
  return `<option${label === vehicleLabel(val, myCarRate()) ? ' selected' : ''}>${esc(label)}</option>`;
}).join('');
const isTrue = (v) => v === true || v === 'Yes' || v === 'ใช่';

/** ค่าเริ่มต้นของช่องหนึ่ง จากค่าที่ renderForm ได้รับ (ใช้ตอน bind) */
function getDefault(fields, f) {
  return currentValues[f.FieldKey] ?? [];
}

/** แปลงค่ารายการเป็นอาร์เรย์ของแถวเสมอ */
export function toLineRows(v) {
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
export function showIfMatches(rule, values) {
  if (!rule) return true;
  return String(rule).split('|').some((part) => {
    const [key, ...rest] = part.split('=');
    const want = rest.join('=').trim();
    const got = values[key.trim()];
    // ช่องเลือกได้หลายข้อ (multichoice) = แสดงเมื่อติ๊กตัวเลือกนั้นไว้
    return Array.isArray(got) ? got.map((x) => String(x).trim()).includes(want) : String(got ?? '') === want;
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
        ${lookupData._mileage && VEHICLE_RE.test(f.Title || '') ? vehicleOptions(opts(f), value)
    : opts(f).map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
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
          ${src === 'projects' ? `<option value="${NO_PROJECT}">ใช้งานทั่วไป · ผู้บังคับบัญชาอนุมัติ</option>` : ''}
          ${src === 'projects' ? OFFICE_PROJECTS.filter((o) => !rows.some((r) => String(r.Title).trim() === o))
            .map((o) => `<option value="${esc(o)}">งานของสำนักงาน · ผู้บังคับบัญชาอนุมัติ</option>`).join('') : ''}
          ${src === 'projects' && lookupData._om && !rows.some((r) => String(r.Title).trim() === OM_PROJECT)
            ? `<option value="${OM_PROJECT}">งานบำรุงรักษา · เลือกโครงการ O&amp;M ต่อ</option>` : ''}
          ${src === 'projects' && lookupData._ppe && !rows.some((r) => String(r.Title).trim() === PPE_PROJECT)
            ? `<option value="${esc(PPE_PROJECT)}">บริษัท PPE · เลือกโครงการ PPE ต่อ หรือเพิ่มชื่อเอง</option>` : ''}
          ${src === 'projects' && lookupData._ppc && !rows.some((r) => String(r.Title).trim() === PPC_PROJECT)
            ? `<option value="${esc(PPC_PROJECT)}">บริษัท PPC · โครงการหลัก หรืองานที่ไม่ใช่โครงการ</option>` : ''}
          ${rows.map((r) => `<option value="${esc(r.Title)}">${
            esc([r.ProjectCode, r.Position, r.Department].filter(Boolean)[0] || '')}</option>`).join('')}
        </datalist>${src === 'projects' && lookupData._om ? omBox(value) : ''}${src === 'projects' && lookupData._ppe ? ppeBox(value) : ''}${src === 'projects' && lookupData._ppc ? ppcBox(value) : ''}`;
    }
    case 'lineitems': {
      /**
       * ตารางรายการที่เพิ่มบรรทัดได้ เช่นรายการซื้อของ
       * คอลัมน์กำหนดใน Options บรรทัดละคอลัมน์ รูปแบบ key|ชื่อ|ชนิด
       * ชนิด: text, number, money, choice:ตัวเลือก1;ตัวเลือก2
       * คอลัมน์ money จะถูกรวมเป็นยอดท้ายตาราง (คูณจำนวนถ้ามีคอลัมน์ qty)
       */
      const cols = lineCols(f);
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
/** ช่องเลือกโครงการ O&M (แสดงเมื่อช่องโครงการเป็น "งาน O&M") */
function omBox(project) {
  const site = String(currentValues.om_site || '').trim();
  return `<div class="q-om" id="q_om_box" ${project === OM_PROJECT ? '' : 'hidden'}>
    <label for="q_om_site">โครงการ O&amp;M <b class="req">*</b></label>
    <div class="q-help">พิมพ์ค้นหาได้ · ไม่มีในรายการ พิมพ์ชื่อโครงการใหม่ได้เลย (ระบบเพิ่มเข้ารายการให้เมื่อส่งคำขอ)</div>
    <input id="q_om_site" list="q_om_dl" maxlength="120" autocomplete="off" value="${esc(site)}"
      placeholder="🔍 พิมพ์ค้นหาโครงการ O&amp;M หรือพิมพ์ชื่อใหม่">
    <datalist id="q_om_dl">${(lookupData._om || []).flatMap(([g, names]) => names.map((n) =>
      `<option value="${esc(n)}" label="${esc(g)}"></option>`)).join('')}</datalist>
    <div class="q-site-note" id="q_om_note"></div>
  </div>`;
}
/** กลุ่มของโครงการ O&M ที่อยู่ในรายการ ('' = ไม่มีในรายการ) */
const omGroupOf = (site) => ((lookupData._om || []).find(([, names]) => names.includes(site)) || [''])[0];

/** เลือก Prime Power Engineering Pro → เลือกโครงการ PPE หรือพิมพ์ชื่อโครงการเอง */
function ppeBox(project) {
  const site = String(currentValues.ppe_site || '').trim();
  const list = lookupData._ppe || [];
  return `<div class="q-om q-ppe" id="q_ppe_box" ${project === PPE_PROJECT ? '' : 'hidden'}>
    <label for="q_ppe_site">โครงการของ Prime Power Engineering Pro <b class="req">*</b></label>
    <div class="q-help">พิมพ์ค้นหาได้ · ไม่มีในรายการ พิมพ์ชื่อโครงการใหม่ได้เลย (ระบบเพิ่มเข้ารายการให้เมื่อส่งคำขอ)</div>
    <input id="q_ppe_site" list="q_ppe_dl" maxlength="150" autocomplete="off" value="${esc(site)}"
      placeholder="🔍 พิมพ์ค้นหาโครงการ หรือพิมพ์ชื่อใหม่ เช่น บ้านคุณ… 23.94 kWp">
    <datalist id="q_ppe_dl">${list.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    <div class="q-site-note" id="q_ppe_note"></div>
  </div>`;
}
/** ชื่อโครงการหลักในทะเบียนโครงการ (ไม่รวมตัวเลือกพิเศษ) */
const mainProjects = () => (lookupData.projects || []).map((r) => String(r.Title || '').trim())
  .filter((t) => t && t !== PPC_PROJECT && t !== PPE_PROJECT && t !== OM_PROJECT);
const ppcKnown = (v) => mainProjects().includes(v) || (lookupData._ppc || []).includes(v);
function ppcBox(project) {
  const site = String(currentValues.ppc_site || '').trim();
  return `<div class="q-om q-ppe q-ppc" id="q_ppc_box" ${project === PPC_PROJECT ? '' : 'hidden'}>
    <label for="q_ppc_site">โครงการ / งานของ Prime Power Construction <b class="req">*</b></label>
    <div class="q-help">พิมพ์ค้นหาได้ทั้งโครงการหลักและงานที่ไม่ใช่โครงการ · ไม่มีในรายการ พิมพ์ชื่องานใหม่ได้เลย (ระบบเพิ่มเข้ารายการให้เมื่อส่งคำขอ)</div>
    <input id="q_ppc_site" list="q_ppc_dl" maxlength="150" autocomplete="off" value="${esc(site)}"
      placeholder="🔍 พิมพ์ค้นหาโครงการ / งาน หรือพิมพ์ชื่องานใหม่">
    <datalist id="q_ppc_dl">${mainProjects().map((n) => `<option value="${esc(n)}" label="โครงการหลัก"></option>`).join('')}${
      (lookupData._ppc || []).filter((n) => !mainProjects().includes(n)).map((n) => `<option value="${esc(n)}" label="งานที่ไม่ใช่โครงการ"></option>`).join('')}</datalist>
    <div class="q-site-note" id="q_ppc_note"></div>
  </div>`;
}
/** ป้ายใต้ช่อง: เลือกจากรายการแล้ว / ชื่อใหม่ (จะเพิ่มเข้ารายการ) */
function siteNote(el, note, known) {
  const v = String(el.value || '').trim();
  note.className = `q-site-note${v ? (known(v) ? ' ok' : ' new') : ''}`;
  note.textContent = !v ? '' : known(v) ? '✓ เลือกจากรายการ' : '＋ ชื่อใหม่ — ระบบจะเพิ่มเข้ารายการให้เมื่อส่งคำขอ';
}

export function renderForm(fields, me, values = {}) {
  files = [];
  // แก้ไขคำขอเดิม (เช่น ถูกส่งกลับแก้ไข): ดึงไฟล์แนบเดิมกลับมา ไม่ต้องแนบใหม่ · ลบหรือเพิ่มได้ตามปกติ
  const seen = new Set();
  fields.filter((f) => f.FieldType === 'file').forEach((f) => {
    (Array.isArray(values && values[f.FieldKey]) ? values[f.FieldKey] : []).forEach((x) => {
      const k = x && typeof x === 'object' && x.url ? `${x.url}|${x.name || ''}` : '';
      if (k && !seen.has(k)) { seen.add(k); files.push(x); }
    });
  });
  currentValues = values || {};
  currentMe = me || null;
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
    // ช่องโครงการ: ต้องเป็นชื่อจากทะเบียนโครงการ หรือ "ไม่เกี่ยวกับโครงการ" (พิมพ์เองไม่ได้ ระบบจะหาผู้อนุมัติไม่ถูก)
    const isOm = !!lookupData._om && v === OM_PROJECT;
    const isPpe = !!lookupData._ppe && v === PPE_PROJECT;
    const isPpc = !!lookupData._ppc && v === PPC_PROJECT;
    if (f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects' && !empty && !isOm && !isPpe && !isPpc
      && v !== NO_PROJECT && !OFFICE_PROJECTS.includes(v) && !(lookupData.projects || []).some((r) => String(r.Title).trim() === v)) {
      errors.push(`${f.Title} (เลือกจากรายการ หรือเลือก "${NO_PROJECT}")`);
    }
    // Prime Power Engineering Pro: ต้องเลือกโครงการ PPE หรือพิมพ์ชื่อเอง
    if (f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects' && lookupData._ppe) {
      if (isPpe) {
        const site = String(($('#q_ppe_site') || {}).value || '').trim().replace(/\s+/g, ' ');
        if (!site) errors.push('โครงการของ Prime Power Engineering Pro (เลือกจากรายการ หรือพิมพ์ชื่อโครงการ)');
        out.ppe_site = site;
      } else out.ppe_site = '';
    }
    // Prime Power Construction: โครงการหลัก → ใช้โครงการนั้นตามปกติ · งานที่ไม่ใช่โครงการ → เก็บชื่องานใน ppc_site
    if (f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects' && lookupData._ppc) {
      out.ppc_site = '';
      if (isPpc) {
        const site = String(($('#q_ppc_site') || {}).value || '').trim().replace(/\s+/g, ' ');
        if (!site) errors.push('โครงการ / งานของ Prime Power Construction (เลือกจากรายการ หรือพิมพ์ชื่องาน)');
        else if (mainProjects().includes(site)) { v = site; out[f.FieldKey] = site; }
        else out.ppc_site = site;
      }
    }
    // งาน O&M: ต้องเลือกโครงการ O&M (หรือพิมพ์เองเมื่อเลือก อื่นๆ)
    if (f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects' && lookupData._om) {
      if (isOm) {
        const site = String(($('#q_om_site') || {}).value || '').trim().replace(/\s+/g, ' ');
        if (!site) errors.push('โครงการ O&M (เลือกจากรายการ หรือพิมพ์ชื่อโครงการ)');
        out.om_site = site;
        out.om_group = omGroupOf(site) || OM_OTHER;   // ไม่มีในรายการ = พิมพ์ชื่อใหม่ (กลุ่ม อื่นๆ)
      } else { out.om_site = ''; out.om_group = ''; }
    }
    out[f.FieldKey] = v;
  }

  // partial = ค่าที่กรอกไว้แม้ยังไม่ครบ ใช้ตอนดาวน์โหลดแบบฟอร์มไปกรอกต่อ
  return errors.length ? { errors, partial: out } : { values: out };
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
      if (c.type === 'equipment') {
        // เลือกเครื่องมือจากทะเบียน: พิมพ์รหัสหรือชื่อ · เลือกแล้วเติมรายการ/ยี่ห้อ/รุ่น/หน่วยในแถวให้
        return `<td class="li-eqcell"><input data-k="${c.key}" list="li-eq-${f.FieldKey}" class="li-eq" value="${esc(val ?? '')}"
          placeholder="รหัส หรือชื่อเครื่องมือ" autocomplete="off"><div class="li-eqinfo"></div></td>`;
      }
      if (String(c.type).startsWith('choice:')) {
        const opts = c.type.slice(7).split(';').map((x) => x.trim()).filter(Boolean);
        return `<td><select data-k="${c.key}"><option value="">— เลือก —</option>${
          isVehicleCol(c) && lookupData._mileage ? vehicleOptions(opts, val)
            : opts.map((o) => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></td>`;
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

    /*
     * ค่าพาหนะ (เบิกค่าเดินทาง): ประเภทพาหนะ (ในแถว หรือช่องประเภทพาหนะของฟอร์ม) กำหนดวิธีเบิก
     *   - รถยนต์/รถจักรยานยนต์ส่วนบุคคล → กรอกเลขไมล์ก่อน-หลัง · ก.ม. และจำนวนเงิน (ก.ม. × ราคาต่อหน่วย) คำนวณให้
     *   - อื่น ๆ (แท็กซี่ รถสาธารณะ ทางด่วน ที่จอดรถ) → ไม่ใช้เลขไมล์/ราคาต่อหน่วย · กรอกจำนวนเงินตามจริงตามใบเสร็จ/สลิป
     */
    const travel = !!lookupData._mileage;
    const colBy = (re, ok = () => true) => (travel ? cols.find((c) => re.test(c.label) && ok(c)) : null);
    const vCol = travel && cols.find(isVehicleCol);
    const rCol = travel && cols.find(isRateCol);
    const vField = travel && !vCol && fields.find((x) => x.FieldType === 'choice' && VEHICLE_RE.test(x.Title || ''));
    const fromCol = colBy(/ไมล์ก่อน/); const toCol = colBy(/ไมล์หลัง/);
    const kmCol = colBy(/^ก\.?\s*ม|กิโลเมตร|ระยะทาง/, (c) => c !== fromCol && c !== toCol);
    const amtCol = colBy(/จำนวนเงิน|เป็นเงิน/) || (travel ? cols.find((c) => c.type === 'money' && c !== rCol) : null);
    const vehicleOf = (tr) => (vCol ? (tr.querySelector(`[data-k="${vCol.key}"]`) || {}).value
      : ($('#q_' + (vField || {}).FieldKey) || {}).value) || '';
    const inp = (tr, c) => (c ? tr.querySelector(`[data-k="${c.key}"]`) : null);
    const mileCols = [fromCol, toCol, kmCol, rCol].filter(Boolean);
    const n = (el) => (el && String(el.value).trim() !== '' ? Number(el.value) : null);

    /** โหมดของแถว: 'mile' = ตามระยะทาง · 'actual' = ตามจริง · '' = ยังไม่เลือกพาหนะ */
    const modeOf = (tr) => { const v = vehicleOf(tr); return !v ? '' : isMileageVehicle(v) ? 'mile' : 'actual'; };
    const calcRow = (tr) => {
      if (modeOf(tr) !== 'mile') return;
      const a = n(inp(tr, fromCol)); const b = n(inp(tr, toCol));
      const kmEl = inp(tr, kmCol);
      if (kmEl && a != null && b != null) kmEl.value = b >= a ? +(b - a).toFixed(2) : '';
      const km = n(kmEl); const rate = n(inp(tr, rCol)); const amt = inp(tr, amtCol);
      if (amt && km != null && rate != null) amt.value = +(km * rate).toFixed(2);
    };
    const applyMode = (tr, force) => {
      const mode = modeOf(tr);
      mileCols.forEach((c) => {
        const el = inp(tr, c);
        if (!el) return;
        el.disabled = mode === 'actual';
        el.placeholder = mode === 'actual' ? '—' : '';
        if (mode === 'actual') el.value = '';
      });
      const rateEl = inp(tr, rCol);
      const r = rateEl && vehicleRate(vehicleOf(tr), myCarRate());
      if (rateEl && r != null && (force || !String(rateEl.value).trim())) rateEl.value = r;
      const amt = inp(tr, amtCol);
      if (amt) {
        amt.readOnly = mode === 'mile' && !!(kmCol || (fromCol && toCol)) && !!rCol;
        amt.placeholder = mode === 'actual' ? 'ตามใบเสร็จ' : mode === 'mile' ? 'คำนวณให้' : '';
      }
      tr.classList.toggle('li-actual', mode === 'actual');
      calcRow(tr);
    };
    const hint = travel && (vCol || vField) ? document.createElement('div') : null;
    if (hint) { hint.className = 'li-mode q-help'; box.insertBefore(hint, box.firstChild); }
    const paintHint = () => {
      if (!hint) return;
      const modes = new Set([...body.querySelectorAll('tr')].map(modeOf));
      hint.innerHTML = modes.has('actual') && !modes.has('mile')
        ? '🧾 <b>เบิกตามจริง</b> — ไม่ต้องกรอกเลขไมล์/ราคาต่อหน่วย · กรอกคำอธิบายและ <b>จำนวนเงินตามใบเสร็จหรือสลิปโอนเงิน</b> แล้วแนบหลักฐาน'
        : modes.has('mile') ? '🚗 <b>เบิกตามระยะทาง</b> — กรอกเลขไมล์ก่อน-หลัง ระบบคำนวณ ก.ม. และจำนวนเงิน (ก.ม. × ราคาต่อหน่วย) ให้' : '';
      hint.hidden = !hint.innerHTML;
    };

    // รายชื่อเครื่องมือสำหรับคอลัมน์ equipment (datalist เดียวต่อตาราง)
    const eqCol = cols.find((c) => c.type === 'equipment');
    const EQ = lookupData._eqmod;
    if (eqCol && EQ && !box.querySelector('datalist')) {
      const dl = document.createElement('datalist');
      dl.id = `li-eq-${f.FieldKey}`;
      dl.innerHTML = (lookupData._equip || []).map((e) => `<option value="${esc(EQ.eqCode(e))}">${esc([EQ.eqLabel(e),
        EQ.holderOf(e) ? `อยู่ที่ ${EQ.holderOf(e)}` : e.Status].filter(Boolean).join(' · '))}</option>`).join('');
      box.appendChild(dl);
    }
    const eqFill = (tr, force) => {
      if (!eqCol || !EQ) return;
      const inpEl = tr.querySelector(`[data-k="${eqCol.key}"]`);
      const info = tr.querySelector('.li-eqinfo');
      const e = EQ.findEq(lookupData._equip || [], inpEl.value);
      if (!e) { info.textContent = inpEl.value.trim() ? 'ไม่พบในทะเบียน (พิมพ์รายการเอง)' : ''; info.className = 'li-eqinfo dim'; return; }
      inpEl.value = EQ.eqCode(e);
      const set = (key, v) => { const el = tr.querySelector(`[data-k="${key}"]`); if (el && v && (force || !String(el.value).trim())) el.value = v; };
      set('desc', [e.ItemName, e.Brand, e.Model].filter((x) => String(x || '').trim()).join(' '));
      set('name', e.ItemName); set('brand', e.Brand); set('model', e.Model); set('unit', e.Unit);
      set('qty', e.Qty || 1);
      set('status', 'ยืม');   // ใบยืม-คืน: เลือกจากทะเบียน = ยืม (แก้ได้)
      const holder = EQ.holderOf(e);
      info.textContent = [e.Status, holder ? `ผู้ใช้งาน: ${holder}` : '', e.Project ? `โครงการ: ${e.Project}` : ''].filter(Boolean).join(' · ');
      info.className = `li-eqinfo ${e.Status === EQ.EQ_READY ? 'ok' : 'warn'}`;
    };

    const addRow = (data = {}) => {
      const tr = document.createElement('tr');
      tr.innerHTML = cols.map((c) => cell(c, data[c.key])).join('')
        + '<td class="li-x"><button type="button" class="li-del">✕</button></td>';
      body.appendChild(tr);
      if (eqCol) {
        const el = tr.querySelector(`[data-k="${eqCol.key}"]`);
        el.addEventListener('change', () => eqFill(tr, true));
        if (el.value) eqFill(tr, false);
      }
      tr.querySelectorAll('input, select').forEach((el) => { el.oninput = () => { calcRow(tr); recalc(); }; el.onchange = el.oninput; });
      if (vCol) tr.querySelector(`[data-k="${vCol.key}"]`).onchange = () => { applyMode(tr, true); paintHint(); recalc(); };
      if (vCol || vField) applyMode(tr, false);
      tr.querySelector('.li-del').onclick = () => { tr.remove(); recalc(); };
    };
    if (vField && $('#q_' + vField.FieldKey)) {
      $('#q_' + vField.FieldKey).addEventListener('change', () => {
        body.querySelectorAll('tr').forEach((tr) => applyMode(tr, true)); paintHint(); recalc();
      });
    }

    (initial.length ? initial : [{}]).forEach(addRow);
    if (hint) paintHint();
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

  // งาน O&M: เลือกในช่องโครงการแล้วแสดงช่องโครงการ O&M · เลือก อื่นๆ แล้วแสดงช่องพิมพ์ชื่อ
  const omBoxEl = $('#q_om_box');
  if (omBoxEl) {
    const pf = fields.find((f) => f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects');
    const pEl = pf && $('#q_' + pf.FieldKey);
    const sel = $('#q_om_site'); const note = $('#q_om_note');
    const sync = () => {
      omBoxEl.hidden = !(pEl && pEl.value.trim() === OM_PROJECT);
      siteNote(sel, note, (v) => !!omGroupOf(v));
    };
    if (pEl) { pEl.addEventListener('input', sync); pEl.addEventListener('change', sync); }
    sel.addEventListener('input', sync); sel.addEventListener('change', sync);
    sync();
  }

  // Prime Power Engineering Pro: เลือกในช่องโครงการแล้วแสดงช่องโครงการ PPE · เลือก เพิ่มชื่อเอง แล้วแสดงช่องพิมพ์
  const ppeBoxEl = $('#q_ppe_box');
  if (ppeBoxEl) {
    const pf = fields.find((f) => f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects');
    const pEl = pf && $('#q_' + pf.FieldKey);
    const sel = $('#q_ppe_site'); const note = $('#q_ppe_note');
    const sync = () => {
      ppeBoxEl.hidden = !(pEl && pEl.value.trim() === PPE_PROJECT);
      siteNote(sel, note, (v) => (lookupData._ppe || []).includes(v));
    };
    if (pEl) { pEl.addEventListener('input', sync); pEl.addEventListener('change', sync); }
    sel.addEventListener('input', sync); sel.addEventListener('change', sync);
    sync();
  }

  // Prime Power Construction: เลือกในช่องโครงการแล้วแสดงช่องพิมพ์ค้นหาโครงการหลัก / งาน
  const ppcBoxEl = $('#q_ppc_box');
  if (ppcBoxEl) {
    const pf = fields.find((f) => f.FieldType === 'lookup' && String(f.Options || '').trim() === 'projects');
    const pEl = pf && $('#q_' + pf.FieldKey);
    const sel = $('#q_ppc_site'); const note = $('#q_ppc_note');
    const sync = () => {
      ppcBoxEl.hidden = !(pEl && pEl.value.trim() === PPC_PROJECT);
      siteNote(sel, note, ppcKnown);
      const v = String(sel.value || '').trim();
      if (v && mainProjects().includes(v)) note.textContent = '✓ โครงการหลัก — ผู้รับผิดชอบ/ทีมโครงการนี้อนุมัติตามปกติ';
    };
    if (pEl) { pEl.addEventListener('input', sync); pEl.addEventListener('change', sync); }
    sel.addEventListener('input', sync); sel.addEventListener('change', sync);
    sync();
  }

  // ช่องที่แสดงตามเงื่อนไข ต้องอัปเดตทันทีเมื่อค่าที่อ้างถึงเปลี่ยน
  const conditional = fields.filter((f) => f.ShowIf);
  if (!conditional.length) return;

  const refresh = () => {
    const current = {};
    fields.forEach((f) => {
      const el = $('#q_' + f.FieldKey);
      if (el) current[f.FieldKey] = f.FieldType === 'yesno' ? el.checked
        : f.FieldType === 'multichoice' ? [...el.querySelectorAll('input:checked')].map((c) => c.value)
        : (el.value ?? '');
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
 * opts.html = ใช้ <br> และ escape ข้อความ · opts.pairs = คืนเป็นรายการ [หัวข้อ, คำตอบ] แทนข้อความ
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
    // งาน O&M: ต่อท้ายชื่อโครงการ O&M
    if (v === OM_PROJECT && values && values.om_site) return esc(`${v} · ${values.om_site}`);
    if (f.FieldType === 'currency') {
      const n = Number(v);
      return isNaN(n) ? esc(v) : n.toLocaleString('th-TH', { minimumFractionDigits: 2 }) + ' บาท';
    }
    return esc(v);
  };

  const lines = [];
  const pairs = [];    // [หัวข้อ, คำตอบ] ใช้ทำตารางสรุปก่อนส่ง (opts.pairs)
  for (const f of fields) {
    if (f.FieldType === 'section') continue;
    const text = one(f, values[f.FieldKey]);
    if (!String(text).trim()) continue;
    lines.push(`${esc(f.Title)}: ${text}`);
    pairs.push([esc(f.Title), String(text).replace(/^(<br>|\n)/, '')]);
  }
  return opts.pairs ? pairs : lines.join(nl);
}
