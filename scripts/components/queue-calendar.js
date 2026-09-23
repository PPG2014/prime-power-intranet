/**
 * ปฏิทินคิวรายเดือน สำหรับฟอร์มที่จองเป็นช่วงเวลา (เช่น จองคิว Messenger)
 *
 * อ่านคิวจากคำขอใน SharePoint โดยตรง ไม่ต้องใช้ปฏิทิน Outlook
 * คลิกวันไหนจะเห็นคิวของวันนั้น และเติมวันที่ลงในฟอร์มให้เลย
 */
import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { QUEUE_FIELDS } from '../services/booking.js';

const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DEAD = ['ยกเลิก', 'ไม่อนุมัติ'];

let ym = null;          // เดือนที่กำลังดู { y, m }
let picked = '';        // วันที่ที่เลือกดู (YYYY-MM-DD)
let bookings = [];      // คิวทั้งหมดของฟอร์มนี้
let formCode = '';

const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayKey = () => new Date().toLocaleDateString('sv-SE');

/** โหลดคิวทั้งหมดของฟอร์มนี้ (ไม่รวมใบที่ยกเลิก/ไม่อนุมัติ) */
async function load(code) {
  formCode = code;
  const rows = await list('requests').catch(() => []);
  bookings = rows
    .filter((r) => String(r.FormCode || '').trim() === String(code).trim())
    .filter((r) => !DEAD.includes(String(r.Status || '').trim()))
    .map((r) => {
      let d = {};
      try { d = JSON.parse(r.FormData || '{}'); } catch (e) { return null; }
      const day = String(d[QUEUE_FIELDS.date] || '').slice(0, 10);
      if (!day) return null;
      return {
        day,
        from: d[QUEUE_FIELDS.from] || '',
        to: d[QUEUE_FIELDS.to] || '',
        by: d.requester || r.RequesterName || '',
        place: d.place || d.job_detail || '',
        status: String(r.Status || '').trim(),
        title: r.Title || '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.from).localeCompare(String(b.from)));
}

function grid() {
  const { y, m } = ym;
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const byDay = {};
  bookings.forEach((b) => { (byDay[b.day] = byDay[b.day] || []).push(b); });

  const cells = [];
  for (let i = 0; i < first; i += 1) cells.push('<div class="qc-cell qc-blank"></div>');
  for (let d = 1; d <= days; d += 1) {
    const k = key(y, m, d);
    const items = byDay[k] || [];
    const cls = [
      'qc-cell',
      items.length ? 'has' : '',
      k === todayKey() ? 'today' : '',
      k === picked ? 'on' : '',
    ].filter(Boolean).join(' ');

    // แสดงคิวในช่องวันเลย สูงสุด 3 รายการ ที่เหลือบอกเป็นจำนวน
    const shown = items.slice(0, 3).map((b) => `<span class="qc-ev ${b.status === 'รออนุมัติ' ? 'wait' : 'ok'}"
        title="${esc(`${b.from}–${b.to} ${b.by}${b.place ? ' · ' + b.place : ''}`)}">${esc(b.from)}</span>`).join('');

    cells.push(`<button class="${cls}" data-qcday="${k}">
      <span class="qc-d">${d}</span>
      ${shown}
      ${items.length > 3 ? `<span class="qc-more">+${items.length - 3} คิว</span>` : ''}
    </button>`);
  }
  return cells.join('');
}

function dayList() {
  if (!picked) return '<div class="qc-hint">คลิกวันที่เพื่อดูคิวของวันนั้น</div>';
  const rows = bookings.filter((b) => b.day === picked);
  if (!rows.length) {
    return `<div class="qc-free">✓ ${esc(thaiDay(picked))} ยังไม่มีคิว
      <button class="btn-mini" data-qcuse="${picked}">ใช้วันนี้ในฟอร์ม</button></div>`;
  }
  return `<div class="qc-daytitle">${esc(thaiDay(picked))} · ${rows.length} คิว
      <button class="btn-mini" data-qcuse="${picked}">ใช้วันนี้ในฟอร์ม</button></div>
    <ul class="qc-list">${rows.map((b) => `<li>
      <span class="qc-time">${esc(b.from)}${b.to ? `–${esc(b.to)}` : ''}</span>
      <span class="qc-by">${esc(b.by)}</span>
      ${b.place ? `<span class="qc-place">${esc(b.place)}</span>` : ''}
      <span class="qc-st ${b.status === 'รออนุมัติ' ? 'wait' : 'ok'}">${esc(b.status)}</span>
    </li>`).join('')}</ul>`;
}

/** รายการคิวทั้งเดือน จัดกลุ่มตามวัน เห็นชื่อผู้จองและช่วงเวลาเต็ม */
function monthList() {
  const { y, m } = ym;
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const rows = bookings.filter((b) => b.day.startsWith(prefix));
  if (!rows.length) return '<div class="qc-hint">เดือนนี้ยังไม่มีคิว</div>';

  const byDay = {};
  rows.forEach((b) => { (byDay[b.day] = byDay[b.day] || []).push(b); });

  return `<ul class="qc-mlist">${Object.keys(byDay).sort().map((d) => `<li>
      <button class="qc-mday${d === picked ? ' on' : ''}" data-qcday="${d}">${esc(thaiDay(d))}</button>
      ${byDay[d].map((b) => `<div class="qc-mrow">
        <span class="qc-time">${esc(b.from)}${b.to ? `–${esc(b.to)}` : ''}</span>
        <span class="qc-by">${esc(b.by)}</span>
        ${b.place ? `<span class="qc-place">${esc(b.place)}</span>` : ''}
        <span class="qc-st ${b.status === 'รออนุมัติ' ? 'wait' : 'ok'}">${esc(b.status)}</span>
      </div>`).join('')}
    </li>`).join('')}</ul>`;
}

const thaiDay = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return `${d} ${TH_MONTH[m - 1]} ${y + 543}`;
};

function html() {
  const { y, m } = ym;
  const total = bookings.filter((b) => b.day.slice(0, 7) === `${y}-${String(m + 1).padStart(2, '0')}`).length;
  return `
    <div class="panel qc-panel">
      <div class="qc-head">
        <button class="btn-mini" data-qcmove="-1">‹</button>
        <b>${TH_MONTH[m]} ${y + 543}</b>
        <button class="btn-mini" data-qcmove="1">›</button>
      </div>
      <div class="qc-meta">คิวเดือนนี้ ${total} รายการ</div>
      <div class="qc-dow">${TH_DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="qc-grid">${grid()}</div>
      <div class="qc-day">${dayList()}</div>
      <div class="qc-month">
        <div class="qc-monthtitle">คิวทั้งเดือน ${TH_MONTH[m]}</div>
        ${monthList()}
      </div>
      <div class="panel-note">ข้อมูลจากคำขอในระบบ ไม่รวมใบที่ยกเลิกหรือไม่อนุมัติ</div>
    </div>`;
}

/** วาดปฏิทินลงกล่องที่กำหนด แล้วผูกปุ่มต่าง ๆ */
function paint(box) {
  box.innerHTML = html();
  $$('[data-qcmove]', box).forEach((b) => {
    b.onclick = () => {
      const step = +b.dataset.qcmove;
      const d = new Date(ym.y, ym.m + step, 1);
      ym = { y: d.getFullYear(), m: d.getMonth() };
      paint(box);
    };
  });
  $$('[data-qcday]', box).forEach((b) => {
    b.onclick = () => { picked = b.dataset.qcday; paint(box); };
  });
  $$('[data-qcuse]', box).forEach((b) => {
    b.onclick = () => {
      const input = $('#q_' + QUEUE_FIELDS.date);
      if (!input) return;
      input.value = b.dataset.qcuse;
      input.dispatchEvent(new Event('change', { bubbles: true }));   // ให้ระบบตรวจคิวชนทันที
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  });
}

/** เรียกหลังหน้าแบบฟอร์มวาดเสร็จ — สร้างปฏิทินในกล่อง #queue-cal */
export async function mountQueueCalendar(code) {
  const box = $('#queue-cal');
  if (!box) return;
  box.innerHTML = '<div class="panel qc-panel"><div class="qc-hint">กำลังโหลดคิว…</div></div>';
  const now = new Date();
  ym = ym && ym.code === code ? ym : { y: now.getFullYear(), m: now.getMonth(), code };
  picked = todayKey();
  await load(code);
  paint(box);
}

/** ให้หน้าแบบฟอร์มรีเฟรชปฏิทินหลังส่งคำขอสำเร็จ */
export async function refreshQueueCalendar() {
  const box = $('#queue-cal');
  if (!box || !formCode) return;
  await load(formCode);
  paint(box);
}
