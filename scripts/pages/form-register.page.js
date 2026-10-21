/**
 * ทะเบียนคำขอของแต่ละแบบฟอร์ม — #/register/<รหัสฟอร์ม>
 *   สรุปรวมคำขอเฉพาะแบบฟอร์มนั้น (คล้ายทะเบียนใบขอสั่งซื้อ)
 *   กรองรายวัน / รายเดือน / รายปี (วันที่ยื่น) · สถานะ · โครงการ · ค้นหา
 *   ส่งออก Excel หนึ่งแถวต่อหนึ่งคำขอ: ข้อมูลระบบ + ทุกช่องในฟอร์ม
 *
 * เห็นทุกใบ: ผู้ดูแลระบบ · ผู้บริหาร (RequestViewers) · ฝ่ายที่ติดตามฟอร์มนั้น (DEPT_WATCH_FORMS)
 * คนอื่นเห็นเฉพาะใบที่ตัวเองยื่น หรืออยู่ในเส้นทางอนุมัติ
 */
import { esc, $ } from '../core/dom.js';
import { list } from '../services/data.js';
import { state } from '../core/state.js';
import { thaiNumDate } from '../templates/pr-fm-pur-004.js';
import { stepsOf, loadResolved, roleOnRequest, reqCode } from '../services/requests.js';
import { withStandard } from '../components/form-renderer.js';
import { findMe, myEmails } from '../services/me.js';
import { downloadXlsx } from '../utils/xlsx.js';
import { projectText } from '../services/om.js';
import { formFieldsOf, DEPT_WATCH_FORMS } from './requests.page.js';

export const meta = { route: 'register', title: 'ทะเบียนคำขอ', nav: false, order: 99, adminOnly: false };

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const STATUS_ORDER = ['รออนุมัติ', 'ส่งกลับแก้ไข', 'อนุมัติแล้ว', 'เสร็จสิ้น', 'ไม่อนุมัติ', 'ยกเลิก'];
const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const plain = (v) => String((v && typeof v === 'object' ? (v.LookupValue ?? v.Title ?? '') : v) ?? '').trim();
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** yyyy-mm-dd = วันที่ท้องถิ่น · อย่างอื่นให้ Date แปลง */
const toDate = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  return isNaN(d) ? null : d;
};

let code = '';
let formRow = {};
let fields = [];       // ช่องในฟอร์ม (ไม่รวมหัวข้อ/ลายเซ็น)
let rows = [];         // [{ r, d, wait }]
let seeAll = false;
const now = new Date();
const f = {
  period: 'month', day: isoDay(now), month: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`, year: String(now.getFullYear()),
  status: '', project: '', q: '',
};

const subjectOf = (d) => plain(d.std_subject || d.subject || d.purpose || d.reason);

function filtered() {
  const q = norm(f.q);
  return rows.filter(({ r, d }) => {
    if (f.period !== 'all') {
      const t = toDate(r.SubmittedDate);
      if (!t) return false;
      if (f.period === 'day' && isoDay(t) !== f.day) return false;
      if (f.period === 'month' && `${t.getFullYear()}-${pad(t.getMonth() + 1)}` !== f.month) return false;
      if (f.period === 'year' && String(t.getFullYear()) !== f.year) return false;
    }
    if (f.status && plain(r.Status) !== f.status) return false;
    if (f.project && plain(projectText(d)) !== f.project) return false;
    if (q && !q.split(' ').every((w) => [r.Title, r.RequesterName, plain(r.RequesterDept), subjectOf(d), plain(projectText(d))]
      .some((v) => norm(v).includes(w)))) return false;
    return true;
  }).sort((a, b) => (toDate(b.r.SubmittedDate) || 0) - (toDate(a.r.SubmittedDate) || 0));
}

const options = (vals, cur, all) => `<option value="">${all}</option>`
  + vals.map((v) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');

function yearOptions(cur) {
  const ys = new Set([String(now.getFullYear()), cur]);
  rows.forEach(({ r }) => { const d = toDate(r.SubmittedDate); if (d) ys.add(String(d.getFullYear())); });
  return [...ys].filter(Boolean).sort().reverse().map((y) => `<option value="${y}" ${y === cur ? 'selected' : ''}>พ.ศ. ${+y + 543}</option>`).join('');
}
function periodInput() {
  if (f.period === 'day') return `<input id="frg-day" type="date" value="${esc(f.day)}" aria-label="วันที่">`;
  if (f.period === 'month') {
    const [y, m] = f.month.split('-');
    return `<select id="frg-mon" aria-label="เดือน">${MONTHS.map((n, i) => `<option value="${pad(i + 1)}" ${pad(i + 1) === m ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select id="frg-year" aria-label="ปี">${yearOptions(y)}</select>`;
  }
  if (f.period === 'year') return `<select id="frg-year" aria-label="ปี">${yearOptions(f.year)}</select>`;
  return '';
}

function tableHtml() {
  const shown = filtered();
  $('#frg-count').textContent = `พบ ${shown.length} ใบ`;
  $('#frg-xlsx').disabled = !shown.length;
  if (!shown.length) return '<div class="empty">ไม่พบคำขอตามเงื่อนไขนี้</div>';
  const hasProject = rows.some(({ d }) => plain(projectText(d)));
  return `<div class="prr-scroll"><table class="prr-table">
    <thead><tr><th>เลขที่คำขอ</th><th>วันที่ยื่น</th><th>ผู้ยื่น / ฝ่าย</th><th>เรื่อง</th>${hasProject ? '<th>โครงการ</th>' : ''}<th>สถานะ</th></tr></thead>
    <tbody>${shown.map(({ r, d, wait }) => `<tr>
      <td><a href="#/requests/${esc(r.id)}">${esc(r.Title)}</a></td>
      <td>${esc(thaiNumDate(r.SubmittedDate))}</td>
      <td>${esc(r.RequesterName || '')}<span class="prr-sub">${esc(plain(r.RequesterDept))}</span></td>
      <td>${esc(subjectOf(d)) || '<span class="dim">—</span>'}</td>
      ${hasProject ? `<td>${esc(plain(projectText(d)))}</td>` : ''}
      <td><span class="prr-st${/^(ยกเลิก|ไม่อนุมัติ)$/.test(plain(r.Status)) ? ' bad' : ''}">${esc(plain(r.Status))}</span>${
        wait ? `<span class="prr-sub">รอ: ${esc(wait)}</span>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

/** ค่าของช่อง → ข้อความใน Excel · ตารางรายการรวมในช่องเดียว ขึ้นบรรทัดใหม่ต่อรายการ */
function cellOf(fd, v) {
  if (v == null || v === '') return fd.FieldType === 'date' ? null : '';
  if (fd.FieldType === 'date') return toDate(v);
  if (fd.FieldType === 'number' && !isNaN(+v)) return +v;
  if (fd.FieldType === 'lineitems' && Array.isArray(v)) {
    const cols = String(fd.Options || '').split('\n').map((x) => x.split('|')[0].trim()).filter(Boolean);
    return v.filter((x) => x && Object.values(x).some((y) => String(y || '').trim()))
      .map((x, i) => `${i + 1}. ${cols.map((c) => String(x[c] ?? '').trim()).filter(Boolean).join(' · ')}`).join('\n');
  }
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? (x.name || x.Title || '') : x)).filter(Boolean).join(', ');
  if (typeof v === 'object') return plain(v.name || v.Title || v.LookupValue || '');
  return String(v);
}

function exportXlsx() {
  const shown = filtered();
  if (!shown.length) return;
  const base = [
    { title: 'เลขที่คำขอ', width: 22 }, { title: 'วันที่ยื่น', width: 13, type: 'date' },
    { title: 'ผู้ยื่น', width: 22 }, { title: 'ฝ่าย', width: 26, type: 'wrap' },
    { title: 'สถานะ', width: 14 }, { title: 'รอลำดับ', width: 26, type: 'wrap' },
  ];
  // ช่องมาตรฐานที่ซ้ำกับคอลัมน์ระบบ (ฝ่าย) ไม่ต้องใส่ซ้ำ
  const titles = new Set(base.map((c) => c.title));
  const cols = fields.filter((x) => !titles.has(x.Title));
  const label = f.period === 'day' ? f.day : f.period === 'month' ? f.month : f.period === 'year' ? String(+f.year + 543) : 'all';
  // ชื่อไฟล์ภาษาอังกฤษ: บางเบราว์เซอร์ตั้งชื่อไฟล์ภาษาไทยไม่ได้ แล้วกลายเป็น "download"
  downloadXlsx(`${code}_Register_${label}.xlsx`, {
    sheet: code,
    columns: [...base, ...cols.map((x) => ({ title: x.Title || x.FieldKey,
      width: x.FieldType === 'lineitems' ? 50 : x.FieldType === 'textarea' ? 36 : 20,
      type: x.FieldType === 'date' ? 'date' : x.FieldType === 'number' ? 'number'
        : ['lineitems', 'textarea'].includes(x.FieldType) ? 'wrap' : undefined }))],
    rows: shown.map(({ r, d, wait }) => [
      r.Title || '', toDate(r.SubmittedDate), r.RequesterName || '', plain(r.RequesterDept), plain(r.Status), wait,
      ...cols.map((x) => cellOf(x, d[x.FieldKey])),
    ]),
  });
}

export async function render() {
  code = decodeURIComponent((location.hash.split('/')[2] || '').split('?')[0]).trim().toUpperCase();
  const [all, catalog, dir] = await Promise.all([
    list('requests').catch(() => []), list('formCatalog').catch(() => []), list('directory').catch(() => []),
  ]);
  formRow = catalog.find((c) => plain(c.FormCode) === code) || { FormCode: code, Title: code };
  fields = withStandard(await formFieldsOf(code), formRow)
    .filter((x) => !['section', 'signature', 'heading'].includes(x.FieldType));

  const me = findMe(dir);
  const ids = [me && me.Title, state.user?.name, state.user?.email].filter(Boolean);
  const watch = DEPT_WATCH_FORMS[plain(me && me.Department)] || [];
  seeAll = !!(state.isAdmin || state.isViewer || watch.includes(code));
  const mine = new Set(myEmails());
  const steps = (await stepsOf(code).catch(() => [])).map((x) => ({ ...x }));

  rows = [];
  for (const r of all.filter((x) => reqCode(x) === code)) {
    let d = {};
    try { d = JSON.parse(r.FormData || '{}') || {}; } catch (e) { d = {}; }
    // eslint-disable-next-line no-await-in-loop
    const st = await loadResolved(steps.map((x) => ({ ...x })), { ...r, FormCode: code });
    if (!seeAll && !mine.has(norm(r.RequesterEmail)) && !roleOnRequest({ ...r, FormCode: code }, st, ids).isInvolved) continue;
    const wait = plain(r.Status) === 'รออนุมัติ' ? plain((st.find((x) => +x.StepOrder === (+r.CurrentStep || 1)) || {}).StepName) : '';
    rows.push({ r, d, wait });
  }
  const statuses = STATUS_ORDER.filter((s) => rows.some(({ r }) => plain(r.Status) === s));
  const projects = [...new Set(rows.map(({ d }) => plain(projectText(d))).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  if (f.status && !statuses.includes(f.status)) f.status = '';
  if (f.project && !projects.includes(f.project)) f.project = '';

  return `
  <section class="page page-prr">
    <div class="wrap">
      <h1 class="page-title">ทะเบียน ${esc(formRow.Title || code)}</h1>
      <p class="prr-lead">${esc(code)} · ${seeAll ? 'คำขอทั้งหมดของแบบฟอร์มนี้' : 'คำขอที่คุณยื่นหรืออยู่ในเส้นทางอนุมัติ'} · กดเลขที่คำขอเพื่อเปิดดูรายละเอียด
        · <a href="#/requests">← กลับหน้าติดตามสถานะ</a></p>
      <div class="panel prr-filters">
        <label>ช่วงเวลา (วันที่ยื่น)
          <select id="frg-period">
            ${[['day', 'รายวัน'], ['month', 'รายเดือน'], ['year', 'รายปี'], ['all', 'ทั้งหมด']].map(([v, t]) =>
              `<option value="${v}" ${f.period === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select></label>
        <span class="prr-when" id="frg-when">${periodInput()}</span>
        <label>สถานะ <select id="frg-status">${options(statuses, f.status, 'ทุกสถานะ')}</select></label>
        ${projects.length ? `<label>โครงการ <select id="frg-project">${options(projects, f.project, 'ทุกโครงการ')}</select></label>` : ''}
        <label class="prr-q">ค้นหา <input id="frg-q" type="search" value="${esc(f.q)}" placeholder="เลขที่คำขอ · ผู้ยื่น · เรื่อง" autocomplete="off"></label>
      </div>
      <div class="prr-bar">
        <span id="frg-count" class="dim"></span>
        <button class="btn btn-primary" id="frg-xlsx" type="button">⬇ ส่งออก Excel</button>
      </div>
      <div class="panel" id="frg-body"></div>
    </div>
  </section>`;
}

export function mount() {
  if (!$('#frg-body')) return;
  const redraw = () => { $('#frg-body').innerHTML = tableHtml(); };
  const bindWhen = () => {
    const day = $('#frg-day'); if (day) day.onchange = () => { f.day = day.value || f.day; redraw(); };
    const mon = $('#frg-mon'); const yr = $('#frg-year');
    if (mon) mon.onchange = () => { f.month = `${f.month.split('-')[0]}-${mon.value}`; redraw(); };
    if (yr) yr.onchange = () => {
      if (f.period === 'month') f.month = `${yr.value}-${f.month.split('-')[1]}`; else f.year = yr.value;
      redraw();
    };
  };
  $('#frg-period').onchange = (e) => { f.period = e.target.value; $('#frg-when').innerHTML = periodInput(); bindWhen(); redraw(); };
  $('#frg-status').onchange = (e) => { f.status = e.target.value; redraw(); };
  const pj = $('#frg-project'); if (pj) pj.onchange = (e) => { f.project = e.target.value; redraw(); };
  let t; $('#frg-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; redraw(); }, 200); };
  $('#frg-xlsx').onclick = exportXlsx;
  bindWhen();
  redraw();
}
