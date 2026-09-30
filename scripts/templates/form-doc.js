/**
 * เอกสารของแบบฟอร์มทั่วไป (ฟอร์มที่ไม่มีแม่แบบเฉพาะ) — หน้าตาเหมือนหน้ากรอกบนเว็บ
 *
 * จัดกลุ่มตามหัวข้อ (Section) · ช่องครึ่ง/เต็มแถวตามที่ตั้งไว้ · ตารางรายการพร้อมยอดรวม
 * ตัวเลือกหลายค่าแสดงเป็นช่องติ๊กครบทุกตัวเลือก · รายชื่อไฟล์แนบ · ช่องลงนามผู้ยื่นและผู้อนุมัติ
 * ใช้ทั้งตอน "ดาวน์โหลดแบบฟอร์ม" ก่อนส่ง และ "ส่งออกเอกสาร" ของคำขอที่ส่งแล้ว
 */
import { esc } from '../core/dom.js';
import { LETTERHEAD } from '../core/letterhead.js';
import { lineCols, lineTotal, toLineRows, showIfMatches } from '../components/form-renderer.js';
import { isTravel, renderTravel } from './travel-expense.js';

const isTrue = (v) => v === true || v === 'Yes' || v === 'ใช่';
const optsOf = (f) => String(f.Options || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const money = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (v) => {
  const d = new Date(v);
  return isNaN(d) ? String(v || '') : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
};
const thaiDateTime = (v) => {
  const d = new Date(v);
  return isNaN(d) ? '' : d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
};
const plain = (v) => (v && typeof v === 'object' ? (v.Title ?? v.LookupValue ?? v.name ?? '') : (v ?? ''));

/** รูปลายเซ็น: data URL ใส่ตรง ๆ · ไฟล์ใน SharePoint ใช้ data-photo ให้ hydratePhotos แนบ token */
export const sigImg = (url) => (!url ? ''
  : /^data:/.test(url) ? `<img src="${esc(url)}" alt="ลายเซ็น">` : `<img data-photo="${esc(url)}" alt="ลายเซ็น">`);

const blank = '<span class="fd-blank">&nbsp;</span>';

function valueHtml(f, v) {
  switch (f.FieldType) {
    case 'multichoice': {
      const picked = Array.isArray(v) ? v.map(plain) : String(v || '').split(/,\s*/).filter(Boolean);
      return `<div class="fd-checks">${optsOf(f).map((o) =>
        `<span class="fd-check">${picked.includes(o) ? '☑' : '☐'} ${esc(o)}</span>`).join('')}</div>`;
    }
    case 'yesno': return `<span class="fd-check">${v ? '☑' : '☐'} ใช่</span>`;
    case 'date': return v ? esc(thaiDate(v)) : blank;
    case 'currency': case 'number':
      return v === '' || v == null ? blank : esc(f.FieldType === 'currency' ? money(v) : v);
    case 'textarea': return v ? `<div class="fd-text">${esc(v)}</div>` : '<div class="fd-text">&nbsp;</div>';
    case 'file': {
      const arr = Array.isArray(v) ? v : [];
      return arr.length ? `<ol class="fd-files">${arr.map((x) => `<li>${esc(x.name || x)}</li>`).join('')}</ol>`
        : '<span class="dim">— ไม่มีไฟล์แนบ —</span>';
    }
    case 'lineitems': {
      const cols = lineCols(f);
      const rows = toLineRows(v);
      const total = lineTotal(cols, rows);
      const body = rows.length ? rows : [{}, {}, {}];    // ฟอร์มเปล่าเว้นบรรทัดให้เขียนมือ
      return `<table class="fd-li">
        <thead><tr><th class="fd-no">#</th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${body.map((r, i) => `<tr><td class="fd-no">${rows.length ? i + 1 : ''}</td>${cols.map((c) => {
          const x = r[c.key];
          const num = c.type === 'money' || c.type === 'number';
          return `<td class="${num ? 'fd-num' : ''}">${x === '' || x == null ? '&nbsp;'
            : esc(c.type === 'money' ? money(x) : x)}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
        ${total != null ? `<tfoot><tr><td colspan="${cols.length}" class="fd-sumlabel">รวมเป็นเงิน</td>
          <td class="fd-num fd-sum">${rows.length ? money(total) : ''}</td></tr></tfoot>` : ''}
      </table>`;
    }
    default: {
      const text = Array.isArray(v) ? v.map(plain).join(', ') : plain(v);
      return String(text).trim() ? esc(text) : blank;
    }
  }
}

/**
 * form      = แถวใน formCatalog (ชื่อ เลขที่ ISO)
 * fields    = ช่องทั้งหมด (รวมช่องมาตรฐานแล้ว) เรียงตามลำดับ
 * values    = ค่าที่กรอก { FieldKey: value }
 * docNo     = เลขที่คำขอ (ถ้าส่งแล้ว) · submitted = วันที่ยื่น
 * requester = { name, sig, at } · approvals = [{ role, name, sig, result, note, at }]
 * empCode   = รหัสพนักงานของผู้ยื่น (ใบเบิกค่าเดินทางใช้เป็น "เลขที่")
 */
export function renderFormDoc({ form = {}, fields = [], values = {}, docNo = '', submitted = '',
  requester = {}, approvals = [], empCode = '' }) {
  // ฟอร์มที่มีแม่แบบตามต้นฉบับ ใช้แม่แบบนั้นแทน
  if (isTravel(form, fields)) return renderTravel({ form, fields, values, empCode, requester, approvals });
  const shown = fields.filter((f) => f.FieldType !== 'section' && showIfMatches(f.ShowIf, values));
  const groups = [];
  shown.forEach((f) => {
    const name = f.Section || 'ข้อมูลคำขอ';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, rows: [] }));
    g.rows.push(f);
  });

  const signBox = (role, p) => `
    <div class="ex-approve">
      <div class="ex-ap-role">${esc(role)}</div>
      <div class="ex-ap-sign">${p.sig ? sigImg(p.sig) : '<div class="ex-ap-line"></div>'}</div>
      <div class="ex-ap-name">${p.result ? `<b>${esc(p.result)}</b><br>` : ''}
        ${p.note ? `<span class="ex-ap-time">เหตุผล: ${esc(p.note)}</span><br>` : ''}
        ( ${esc(p.name || '................................')} )<br>
        <span class="ex-ap-time">${p.at ? esc(thaiDateTime(p.at)) : (p.wait ? esc(p.wait) : 'วันที่ ......../......../........')}</span>
      </div>
    </div>`;

  return `
    <div class="ex-doc fd-doc">
      <img class="ex-letterhead" src="${LETTERHEAD}" alt="Prime Power">
      <h2 class="ex-title">${esc(form.Title || '')}</h2>
      <div class="ex-meta">
        <span>${form.FormCode ? `แบบฟอร์ม ${esc(form.ISODocNo || form.FormCode)}` : ''}${form.ISORevision ? ` · ${esc(form.ISORevision)}` : ''}</span>
        <span>${docNo ? `เลขที่คำขอ <b>${esc(docNo)}</b>` : 'เลขที่คำขอ ......................'}
          ${submitted ? ` · ยื่นเมื่อ ${esc(thaiDateTime(submitted))}` : ''}</span>
      </div>
      ${groups.map((g) => `
        <section class="fd-group">
          <h3 class="fd-gtitle">${esc(g.name)}</h3>
          <div class="fd-grid">${g.rows.map((f) => `
            <div class="fd-f${f.ColumnWidth === 'full' || ['lineitems', 'textarea', 'file', 'multichoice'].includes(f.FieldType) ? ' fd-full' : ''}">
              <div class="fd-l">${esc(f.Title)}${isTrue(f.IsRequired) ? ' <b class="req">*</b>' : ''}</div>
              <div class="fd-v fd-t-${esc(f.FieldType || 'text')}">${valueHtml(f, values[f.FieldKey])}</div>
            </div>`).join('')}
          </div>
        </section>`).join('')}
      <div class="ex-approvals">
        ${signBox('ผู้ยื่นคำขอ', requester)}
        ${approvals.map((a) => signBox(a.role, a)).join('')}
      </div>
    </div>`;
}
