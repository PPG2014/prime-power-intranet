/**
 * ทะเบียนใบขอสั่งซื้อ (PR) — #/pr-register
 *   กรองรายวัน / รายเดือน / รายปี (อิงวันที่ส่งคำขอ หรือวันที่ออก PR) · โครงการ · สถานะ · ค้นเลข PR
 *   ส่งออก Excel หนึ่งแถวต่อหนึ่งรายการสินค้า
 *
 * ผู้ดูแลระบบ ผู้บริหาร และคนในฝ่ายจัดซื้อ เห็นทุกใบ · คนอื่นเห็นเฉพาะใบที่ตัวเองยื่น
 */
import { esc, $ } from '../core/dom.js';
import { list } from '../services/data.js';
import { state } from '../core/state.js';
import { thaiNumDate } from '../templates/pr-fm-pur-004.js';
import { isPRRequest, prHeader } from '../services/pr.js';
import { downloadXlsx } from '../utils/xlsx.js';

export const meta = { route: 'pr-register', title: 'ทะเบียนใบขอสั่งซื้อ (PR)', nav: false, order: 98, adminOnly: false };

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** yyyy-mm-dd = วันที่ท้องถิ่น (ไม่เลื่อนวันตามเขตเวลา) · อย่างอื่นให้ Date แปลง */
const toDate = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  return isNaN(d) ? null : d;
};
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let rows = [];          // หัวใบขอสั่งซื้อทั้งหมดที่ผู้ใช้เห็นได้
let seeAll = false;
const now = new Date();
const f = {             // ตัวกรองปัจจุบัน (คงไว้เมื่อกลับมาหน้านี้)
  period: 'month', basis: 'submitted',
  day: isoDay(now), month: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`, year: String(now.getFullYear()),
  project: '', status: '', q: '',
};

/** เห็นทะเบียน PR ได้: ผู้ดูแลระบบ · ผู้บริหาร (RequestViewers) · บุคลากรฝ่ายจัดซื้อและคลังสินค้า */
export async function canSeePRRegister() {
  if (state.isAdmin || state.isViewer) return true;
  const em = norm(state.user?.email);
  if (!em) return false;
  const dir = await list('directory').catch(() => []);
  const me = dir.find((p) => norm(p.Email) === em) || {};
  return /จัดซื้อ/.test(`${me.Department || ''} ${me.Section || ''}`);
}

function filtered() {
  const q = norm(f.q);
  return rows.filter((r) => {
    if (f.period !== 'all') {
      const d = toDate(f.basis === 'prDate' ? r.prDate : r.submitted);
      if (!d) return false;
      if (f.period === 'day' && isoDay(d) !== f.day) return false;
      if (f.period === 'month' && `${d.getFullYear()}-${pad(d.getMonth() + 1)}` !== f.month) return false;
      if (f.period === 'year' && String(d.getFullYear()) !== f.year) return false;
    }
    if (f.project && r.project !== f.project) return false;
    if (f.status && r.status !== f.status) return false;
    if (q && !q.split(' ').every((w) => [r.prNo, r.reqNo, r.requester, r.subject, r.project,
      ...r.items.map((i) => i.detail)].some((v) => norm(v).includes(w)))) return false;
    return true;
  }).sort((a, b) => (toDate(b.submitted) || 0) - (toDate(a.submitted) || 0));
}

const options = (vals, cur, all) => `<option value="">${all}</option>`
  + vals.map((v) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');

function periodInput() {
  if (f.period === 'day') return `<input id="prr-day" type="date" value="${esc(f.day)}" aria-label="วันที่">`;
  if (f.period === 'month') {
    const [y, m] = f.month.split('-');
    return `<select id="prr-mon" aria-label="เดือน">${MONTHS.map((n, i) => `<option value="${pad(i + 1)}" ${pad(i + 1) === m ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select id="prr-year" aria-label="ปี">${yearOptions(y)}</select>`;
  }
  if (f.period === 'year') return `<select id="prr-year" aria-label="ปี">${yearOptions(f.year)}</select>`;
  return '';
}
function yearOptions(cur) {
  const ys = new Set([String(now.getFullYear()), cur]);
  rows.forEach((r) => [r.submitted, r.prDate].forEach((v) => { const d = toDate(v); if (d) ys.add(String(d.getFullYear())); }));
  return [...ys].filter(Boolean).sort().reverse().map((y) => `<option value="${y}" ${y === cur ? 'selected' : ''}>พ.ศ. ${+y + 543}</option>`).join('');
}

function tableHtml() {
  const shown = filtered();
  const nItems = shown.reduce((n, r) => n + Math.max(1, r.items.length), 0);
  $('#prr-count').textContent = `พบ ${shown.length} ใบ · ${nItems} รายการ`;
  $('#prr-xlsx').disabled = !shown.length;
  if (!shown.length) return '<div class="empty">ไม่พบใบขอสั่งซื้อตามเงื่อนไขนี้</div>';
  return `<div class="prr-scroll"><table class="prr-table">
    <thead><tr><th>PR No.</th><th>เลขที่คำขอ</th><th>วันที่ส่งคำขอ</th><th>วันที่ต้องการใช้</th><th>โครงการ</th>
      <th>ผู้ขอ / ฝ่าย</th><th>รายการ</th><th>วันที่ออก PR</th><th>สถานะ</th></tr></thead>
    <tbody>${shown.map((r) => `<tr>
      <td>${r.prNo ? `<b>${esc(r.prNo)}</b>` : '<span class="dim">ยังไม่มี</span>'}</td>
      <td><a href="#/requests/${esc(r.id)}">${esc(r.reqNo)}</a></td>
      <td>${esc(thaiNumDate(r.submitted))}</td>
      <td>${esc(thaiNumDate(r.needDate))}</td>
      <td>${esc(r.project)}</td>
      <td>${esc(r.requester)}<span class="prr-sub">${esc(r.dept)}</span></td>
      <td>${r.items.length ? `${esc(r.items[0].detail)}${r.items.length > 1 ? ` <span class="prr-more">+${r.items.length - 1} รายการ</span>` : ''}` : '<span class="dim">—</span>'}</td>
      <td>${esc(thaiNumDate(r.prDate))}</td>
      <td><span class="prr-st">${esc(r.status)}</span></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function exportXlsx() {
  const shown = filtered();
  const out = [];
  shown.forEach((r) => (r.items.length ? r.items : [{}]).forEach((it) => out.push([
    r.prNo, toDate(r.submitted), toDate(r.needDate), r.project, r.workType, r.category, toDate(r.prDate),
    r.dept, r.requester, r.phone, it.detail || '', it.qty || '', it.unit || '', r.status, r.reqNo,
  ])));
  const label = f.period === 'day' ? f.day : f.period === 'month' ? f.month : f.period === 'year' ? String(+f.year + 543) : 'all';
  // ชื่อไฟล์ภาษาอังกฤษ: บางเบราว์เซอร์ตั้งชื่อไฟล์ภาษาไทยไม่ได้ แล้วกลายเป็น "download"
  downloadXlsx(`PR-Register_${label}.xlsx`, {
    sheet: 'ทะเบียน PR',
    columns: [
      { title: 'PR No.', width: 15 }, { title: 'วันที่ส่งคำขอ', width: 13, type: 'date' },
      { title: 'วันที่ต้องการใช้', width: 14, type: 'date' }, { title: 'โครงการ', width: 26, type: 'wrap' },
      { title: 'ประเภทงาน', width: 16 }, { title: 'หมวดหมู่อุปกรณ์', width: 18 },
      { title: 'วันที่ออก PR', width: 13, type: 'date' }, { title: 'ฝ่าย', width: 24, type: 'wrap' },
      { title: 'ผู้ขอ', width: 20 }, { title: 'เบอร์ติดต่อ', width: 12 },
      { title: 'รายละเอียด', width: 40, type: 'wrap' }, { title: 'จำนวน', width: 9, type: 'number' },
      { title: 'หน่วย', width: 9 }, { title: 'สถานะ', width: 16 }, { title: 'เลขที่คำขอ', width: 22 },
    ],
    rows: out,
  });
}

export async function render() {
  const all = await list('requests').catch(() => []);
  seeAll = await canSeePRRegister();
  if (!seeAll) {
    rows = [];
    return `<section class="page"><div class="wrap"><h1 class="page-title">${meta.title}</h1>
      <div class="panel"><div class="empty">หน้านี้สำหรับผู้ดูแลระบบ ผู้บริหาร และฝ่ายจัดซื้อและคลังสินค้าเท่านั้น<br>
      ดูใบขอสั่งซื้อของคุณได้ที่เมนู <a href="#/requests">ติดตามสถานะ</a></div></div></div></section>`;
  }
  rows = all.filter(isPRRequest).map(prHeader);
  const projects = [...new Set(rows.map((r) => r.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  const statuses = [...new Set(rows.map((r) => r.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  if (f.project && !projects.includes(f.project)) f.project = '';
  if (f.status && !statuses.includes(f.status)) f.status = '';

  return `
  <section class="page page-prr">
    <div class="wrap">
      <h1 class="page-title">${meta.title}</h1>
      <p class="prr-lead">${seeAll ? 'ใบขอสั่งซื้อทั้งหมด' : 'ใบขอสั่งซื้อที่คุณยื่น'} · กดเลขที่คำขอเพื่อเปิดดูรายละเอียด · เลข PR ฝ่ายจัดซื้อกรอกตอนอัปเดตสถานะ</p>
      <div class="panel prr-filters">
        <label>ช่วงเวลา
          <select id="prr-period">
            ${[['day', 'รายวัน'], ['month', 'รายเดือน'], ['year', 'รายปี'], ['all', 'ทั้งหมด']].map(([v, t]) =>
              `<option value="${v}" ${f.period === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select></label>
        <span class="prr-when" id="prr-when">${periodInput()}</span>
        <label>อิงวันที่
          <select id="prr-basis">
            <option value="submitted" ${f.basis === 'submitted' ? 'selected' : ''}>วันที่ส่งคำขอ</option>
            <option value="prDate" ${f.basis === 'prDate' ? 'selected' : ''}>วันที่ออก PR</option>
          </select></label>
        <label>โครงการ <select id="prr-project">${options(projects, f.project, 'ทุกโครงการ')}</select></label>
        <label>สถานะ <select id="prr-status">${options(statuses, f.status, 'ทุกสถานะ')}</select></label>
        <label class="prr-q">ค้นหา <input id="prr-q" type="search" value="${esc(f.q)}" placeholder="เลข PR · เลขที่คำขอ · ผู้ขอ · รายการ" autocomplete="off"></label>
      </div>
      <div class="prr-bar">
        <span id="prr-count" class="dim"></span>
        <button class="btn btn-primary" id="prr-xlsx" type="button">⬇ ส่งออก Excel</button>
      </div>
      <div class="panel" id="prr-body"></div>
    </div>
  </section>`;
}

export function mount() {
  if (!$('#prr-body')) return;   // ไม่มีสิทธิ์ดู
  const redraw = () => { $('#prr-body').innerHTML = tableHtml(); };
  const bindWhen = () => {
    const day = $('#prr-day'); if (day) day.onchange = () => { f.day = day.value || f.day; redraw(); };
    const mon = $('#prr-mon'); const yr = $('#prr-year');
    if (mon) mon.onchange = () => { f.month = `${f.month.split('-')[0]}-${mon.value}`; redraw(); };
    if (yr) yr.onchange = () => {
      if (f.period === 'month') f.month = `${yr.value}-${f.month.split('-')[1]}`; else f.year = yr.value;
      redraw();
    };
  };
  $('#prr-period').onchange = (e) => { f.period = e.target.value; $('#prr-when').innerHTML = periodInput(); bindWhen(); redraw(); };
  $('#prr-basis').onchange = (e) => { f.basis = e.target.value; redraw(); };
  $('#prr-project').onchange = (e) => { f.project = e.target.value; redraw(); };
  $('#prr-status').onchange = (e) => { f.status = e.target.value; redraw(); };
  let t; $('#prr-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; redraw(); }, 200); };
  $('#prr-xlsx').onclick = exportXlsx;
  bindWhen();
  redraw();
}
