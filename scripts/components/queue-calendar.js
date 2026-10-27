/**
 * ปฏิทินคิวรายเดือน สำหรับฟอร์มที่จองเป็นช่วงเวลา (เช่น จองคิว Messenger)
 *
 * อ่านคิวจากคำขอใน SharePoint โดยตรง ไม่ต้องใช้ปฏิทิน Outlook
 * คลิกวันไหนจะเห็นคิวของวันนั้น และเติมวันที่ลงในฟอร์มให้เลย
 */
import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { CAR_FIELDS, carBookings, localDay } from '../services/car.js';
import { QUEUE_FIELDS, DEAD, codeOf, stTone, markClashes } from '../services/booking.js';

const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
/** สีของคิวในปฏิทิน: คิวที่เวลาชนกันใช้สีม่วง นอกนั้นตามสถานะ */
const evTone = (b) => (b.clash && !DEAD.includes(b.status) ? 'clash' : stTone(b.status));
const live = (b) => !DEAD.includes(b.status);   // นับเป็นคิว (ไม่รวมยกเลิก/ไม่อนุมัติ)

let ym = null;          // เดือนที่กำลังดู { y, m }
let picked = '';        // วันที่ที่เลือกดู (YYYY-MM-DD)
let bookings = [];      // คิวทั้งหมดของฟอร์มนี้
let formCode = '';      // รหัสฟอร์ม (หรือหลายรหัส) ที่กำลังแสดงคิว
let fresh = true;       // หน้าแบบฟอร์มต้องเห็นคิวล่าสุด · หน้าแรกใช้แคชแล้ววาดใหม่เองเมื่อข้อมูลเปลี่ยน
let kind = 'queue';     // 'queue' = คิวรายวัน (Messenger) · 'car' = จองรถ (ข้ามวันได้ มีทะเบียนรถ)
const dateField = () => (kind === 'car' ? CAR_FIELDS.dateFrom : QUEUE_FIELDS.date);

/** เวลาแบบ 9:00 ต้องเติม 0 ก่อนเทียบ ไม่งั้น "10:00" จะมาก่อน "9:00" */
const hhmm = (t) => String(t || '').trim().padStart(5, '0');
const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayKey = () => new Date().toLocaleDateString('sv-SE');

/** โหลดคิวทั้งหมดของฟอร์มนี้ ทุกสถานะ (ใบที่ยกเลิก/ไม่อนุมัติเรียงไว้ท้ายวัน) */
async function load(code) {
  formCode = code;
  if (kind === 'car') { bookings = await loadCars(code); return; }
  const codes = (Array.isArray(code) ? code : [code]).map((c) => String(c).trim());
  const rows = await list('requests', { fresh }).catch(() => []);
  // แสดงทุกสถานะ (รออนุมัติ / อนุมัติแล้ว / ส่งกลับแก้ไข / เสร็จสิ้น / ยกเลิก / ไม่อนุมัติ) — ใบที่ยกเลิก/ไม่อนุมัติขีดฆ่าไว้ ไม่นับเป็นคิว
  bookings = rows
    .filter((r) => codes.includes(codeOf(r)))
    .map((r) => {
      let d = {};
      try { d = JSON.parse(r.FormData || '{}'); } catch (e) { return null; }
      // วันที่เก็บเป็น ISO ของเที่ยงคืนเวลาไทย → ต้องแปลงเป็นวันท้องถิ่น (ตัด 10 ตัวแรกจะได้วันก่อนหน้า)
      const day = localDay(d[QUEUE_FIELDS.date]);
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
    .sort((a, b) => a.day.localeCompare(b.day) || live(b) - live(a) || hhmm(a.from).localeCompare(hhmm(b.from)));
  // คิวที่เวลาชนกัน (ผู้ยื่นยืนยันจองทับ) แสดงเป็นอีกสี
  markClashes(bookings, { live });
}

/** จองรถ: หนึ่งคำขอแสดงทุกวันที่อยู่ในช่วง (วันแรกเริ่มตามเวลา · วันสุดท้ายถึงเวลา · วันกลางทั้งวัน) */
async function loadCars(code) {
  const out = [];
  (await carBookings(code)).forEach((b) => {
    const last = localDay(b.end);
    for (let d = new Date(b.start.getFullYear(), b.start.getMonth(), b.start.getDate()); localDay(d) <= last; d.setDate(d.getDate() + 1)) {
      const day = localDay(d);
      const hm = (x) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
      out.push({
        day,
        from: day === localDay(b.start) ? hm(b.start) : '00:00',
        to: day === last ? hm(b.end) : '24:00',
        by: b.by, place: b.place, plate: b.plate,
        status: b.returned ? 'คืนรถแล้ว' : b.status,
        title: b.req.Title || '',
      });
    }
  });
  return out.sort((a, b) => a.day.localeCompare(b.day) || hhmm(a.from).localeCompare(hhmm(b.from)));
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
    const all = byDay[k] || [];
    const items = all.filter(live).concat(all.filter((b) => !live(b)));   // ยกเลิกไว้ท้าย
    const cls = [
      'qc-cell',
      items.some(live) ? 'has' : '',
      k === todayKey() ? 'today' : '',
      k === picked ? 'on' : '',
    ].filter(Boolean).join(' ');

    // แสดงคิวในช่องวันเลย สูงสุด 3 รายการ ที่เหลือบอกเป็นจำนวน
    const shown = items.slice(0, 3).map((b) => `<span class="qc-ev ${evTone(b)}"
        title="${esc(`${b.from}–${b.to} ${b.by}${b.place ? ' · ' + b.place : ''}${b.clash ? ' · ⚠ เวลาชนกับคิวอื่น' : ''}`)}">${esc(b.from)}</span>`).join('');

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
  // ปุ่มเติมวันลงฟอร์มมีเฉพาะตอนเปิดจากหน้ากรอกฟอร์ม (เปิดจากหน้าแรกเป็นแค่ดูคิว)
  const use = $('#q_' + dateField())
    ? `<button class="btn-mini" data-qcuse="${picked}">ใช้วันนี้ในฟอร์ม</button>` : '';
  if (!rows.length) {
    return `<div class="qc-free">✓ ${esc(thaiDay(picked))} ยังไม่มีคิว ${use}</div>`;
  }
  return `<div class="qc-daytitle">${esc(thaiDay(picked))} · ${rows.filter(live).length} คิว ${use}</div>
    <ul class="qc-list">${rows.map((b) => `<li class="${live(b) ? '' : 'qc-dead'}">
      <span class="qc-time">${esc(b.from)}${b.to ? `–${esc(b.to)}` : ''}</span>
      <span class="qc-by">${esc(b.by)}</span>
      ${b.plate ? `<span class="qc-plate">🚗 ${esc(b.plate)}</span>` : ''}
      ${b.place ? `<span class="qc-place">${esc(b.place)}</span>` : ''}
      <span class="qc-st ${stTone(b.status)}">${esc(b.status)}</span>${b.clash && live(b) ? '<span class="qc-clash">⚠ เวลาชนกัน</span>' : ''}
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
      ${byDay[d].map((b) => `<div class="qc-mrow${live(b) ? '' : ' qc-dead'}">
        <span class="qc-time">${esc(b.from)}${b.to ? `–${esc(b.to)}` : ''}</span>
        <span class="qc-by">${esc(b.by)}</span>
        ${b.plate ? `<span class="qc-plate">🚗 ${esc(b.plate)}</span>` : ''}
        ${b.place ? `<span class="qc-place">${esc(b.place)}</span>` : ''}
        <span class="qc-st ${stTone(b.status)}">${esc(b.status)}</span>${b.clash && live(b) ? '<span class="qc-clash">⚠ เวลาชนกัน</span>' : ''}
      </div>`).join('')}
    </li>`).join('')}</ul>`;
}

const thaiDay = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return `${d} ${TH_MONTH[m - 1]} ${y + 543}`;
};

function html() {
  const { y, m } = ym;
  const total = bookings.filter((b) => live(b) && b.day.slice(0, 7) === `${y}-${String(m + 1).padStart(2, '0')}`).length;
  return `
    <div class="panel qc-panel">
      <div class="qc-head">
        <button class="btn-mini" data-qcmove="-1">‹</button>
        <b>${TH_MONTH[m]} ${y + 543}</b>
        <button class="btn-mini" data-qcmove="1">›</button>
      </div>
      <div class="qc-tools">
        <button class="btn-mini" data-qcfull="1" title="ดูปฏิทินเต็มจอ เห็นทุกรายการ">⛶ ขยายเต็มจอ</button>
        <button class="btn-mini" data-qcpng="1" title="บันทึกเป็นรูปแนวตั้ง 1080×1920 สำหรับส่งในกลุ่ม">⬇ PNG แนวตั้ง</button>
        <button class="btn-mini" data-qcpng="wide" title="บันทึกเป็นรูปแนวนอน 1920×1080 สำหรับนำเสนอ/จอประชุม">⬇ PNG แนวนอน</button>
      </div>
      <div class="qc-meta">${kind === 'car' ? 'การจองรถ' : 'คิว'}เดือนนี้ ${total} รายการ</div>
      <div class="qc-dow">${TH_DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="qc-grid">${grid()}</div>
      <div class="qc-day">${dayList()}</div>
      <div class="qc-month">
        <div class="qc-monthtitle">คิวทั้งเดือน ${TH_MONTH[m]}</div>
        ${monthList()}
      </div>
      <div class="panel-note">ข้อมูลจากคำขอในระบบ แสดงสถานะล่าสุดทุกใบ · ใบที่ยกเลิก/ไม่อนุมัติขีดฆ่าไว้และไม่นับเป็นคิว</div>
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
  $$('[data-qcfull]', box).forEach((b) => { b.onclick = () => openFull(box); });
  $$('[data-qcpng]', box).forEach((b) => { b.onclick = () => exportPng(b.dataset.qcpng === 'wide'); });
  $$('[data-qcuse]', box).forEach((b) => {
    b.onclick = () => {
      const input = $('#q_' + dateField());
      if (!input) return;
      input.value = b.dataset.qcuse;
      input.dispatchEvent(new Event('change', { bubbles: true }));   // ให้ระบบตรวจคิวชนทันที
      // จองรถ: วันที่สิ้นสุดยังว่างหรือก่อนวันเริ่ม → ตั้งเป็นวันเดียวกัน
      const to = kind === 'car' ? $('#q_' + CAR_FIELDS.dateTo) : null;
      if (to && (!to.value || to.value < input.value)) { to.value = input.value; to.dispatchEvent(new Event('change', { bubbles: true })); }
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  });
}

/**
 * เรียกหลังหน้าแบบฟอร์มวาดเสร็จ — สร้างปฏิทินในกล่อง #queue-cal
 * code เป็นรหัสฟอร์มเดียว หรือหลายรหัสก็ได้ (หน้าแรกรวมคิวทุกฟอร์มจองคิว Messenger)
 */
export async function mountQueueCalendar(code, opts = {}) {
  kind = opts.kind || 'queue';
  fresh = opts.fresh !== false;
  const box = $('#queue-cal');
  if (!box) return;
  box.innerHTML = '<div class="panel qc-panel"><div class="qc-hint">กำลังโหลดคิว…</div></div>';
  const now = new Date();
  const id = String(code);
  ym = ym && ym.code === id ? ym : { y: now.getFullYear(), m: now.getMonth(), code: id };
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


/* ───────────── ปฏิทินเต็มจอ + บันทึกเป็นรูป ───────────── */

const calTitle = () => (kind === 'car' ? 'ตารางการใช้รถยนต์บริษัทฯ' : 'ตารางคิว Messenger');
const monthKey = () => `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;
const tone = (b) => (b.clash && live(b) ? 'clash' : stTone(b.status));

/** ปฏิทินเต็มจอ: ทุกวันแสดงรายการครบ (เวลา ผู้จอง ทะเบียนรถ สถานที่) */
function openFull(sideBox) {
  let host = document.getElementById('qc-full');
  if (!host) { host = document.createElement('div'); host.id = 'qc-full'; document.body.appendChild(host); }
  const draw = () => {
    const { y, m } = ym;
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const byDay = {};
    bookings.forEach((b) => { (byDay[b.day] = byDay[b.day] || []).push(b); });
    const cells = [];
    for (let i = 0; i < first; i += 1) cells.push('<div class="qcf-cell blank"></div>');
    for (let d = 1; d <= days; d += 1) {
      const k = key(y, m, d);
      const items = byDay[k] || [];
      cells.push(`<div class="qcf-cell${k === todayKey() ? ' today' : ''}${items.length ? ' has' : ''}">
        <div class="qcf-d">${d}${items.filter(live).length ? `<span>${items.filter(live).length} ${kind === 'car' ? 'รายการ' : 'คิว'}</span>` : ''}</div>
        ${items.map((b) => `<div class="qcf-ev ${tone(b)}" title="${esc(b.status)}">
          <b>${esc(b.from)}${b.to ? `–${esc(b.to)}` : ''}</b> ${esc(b.by)} <span class="qcf-st">${esc(b.status)}</span>
          ${b.plate ? `<span class="qcf-plate">🚗 ${esc(b.plate)}</span>` : ''}
          ${b.place ? `<span class="qcf-place">${esc(b.place)}</span>` : ''}
        </div>`).join('')}
      </div>`);
    }
    const total = bookings.filter((b) => live(b) && b.day.startsWith(monthKey())).length;
    host.innerHTML = `<div class="qcf-wrap" role="dialog" aria-label="${esc(calTitle())}">
      <div class="qcf-head">
        <div><h2>${esc(calTitle())}</h2><span>${TH_MONTH[m]} ${y + 543} · ${total} รายการ</span></div>
        <div class="qcf-btns">
          <button class="btn-mini" data-qcfm="-1">‹ เดือนก่อน</button>
          <button class="btn-mini" data-qcfm="1">เดือนถัดไป ›</button>
          <button class="btn btn-primary" data-qcfpng="1">⬇ PNG แนวตั้ง (1080×1920)</button>
          <button class="btn btn-primary" data-qcfpng="wide">⬇ PNG แนวนอน (1920×1080)</button>
          <button class="btn-mini" data-qcfclose="1" aria-label="ปิด">✕ ปิด</button>
        </div>
      </div>
      <div class="qcf-legend"><i class="ok"></i>อนุมัติแล้ว/เสร็จสิ้น <i class="wait"></i>รออนุมัติ <i class="back"></i>ส่งกลับแก้ไข${kind === 'car' ? '' : ' <i class="clash"></i>เวลาชนกัน (จองทับ)'}${kind === 'car' ? ' <i class="done"></i>คืนรถแล้ว' : ' <i class="dead"></i>ยกเลิก/ไม่อนุมัติ'}</div>
      <div class="qcf-dow">${TH_DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="qcf-grid">${cells.join('')}</div>
    </div>`;
    $$('[data-qcfm]', host).forEach((b) => { b.onclick = () => {
      const d = new Date(ym.y, ym.m + (+b.dataset.qcfm), 1);
      ym = { ...ym, y: d.getFullYear(), m: d.getMonth() };
      draw(); if (sideBox) paint(sideBox);
    }; });
    $$('[data-qcfpng]', host).forEach((b) => { b.onclick = () => exportPng(b.dataset.qcfpng === 'wide'); });
    $('[data-qcfclose]', host).onclick = close;
  };
  const close = () => { host.remove(); document.removeEventListener('keydown', onKey); document.body.classList.remove('qcf-open'); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  document.body.classList.add('qcf-open');
  draw();
}

/**
 * บันทึกปฏิทินเดือนที่ดูอยู่เป็นรูป PNG แนวตั้ง 1080×1920 (ขนาดสตอรี่/หน้าจอมือถือ)
 * วาดลง canvas เอง (ไม่ใช้ไลบรารีภายนอก) ใช้ฟอนต์เดียวกับหน้าเว็บ
 */
/**
 * บันทึกปฏิทินเดือนที่ดูอยู่เป็นภาพ PNG
 *   wide = false → แนวตั้ง 1080×1920 (ส่งในกลุ่มแชท) · ปฏิทินด้านบน รายการด้านล่าง
 *   wide = true  → แนวนอน 1920×1080 (นำเสนอ/จอประชุม) · ปฏิทินด้านซ้าย รายการด้านขวา
 */
async function exportPng(wide = false) {
  const W = wide ? 1920 : 1080, H = wide ? 1080 : 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (getComputedStyle(document.body).fontFamily || 'sans-serif');
  try { await document.fonts.ready; } catch (e) { /* ไม่เป็นไร */ }
  const F = (size, w = 400) => `${w} ${size}px ${font}`;
  const NAVY = '#0b3b7a', INK = '#1d2733', MUTED = '#6b7787', LINE = '#dbe3ee';
  const TONE = { ok: '#1e7f4f', wait: '#d69e2e', back: '#dd6b20', done: '#8a96a5', dead: '#b0b8c4', clash: '#805ad5' };
  const fit = (text, max) => {               // ตัดข้อความให้พอดีความกว้าง
    let t = String(text || '');
    if (g.measureText(t).width <= max) return t;
    while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  };
  const round = (x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };

  const { y, m } = ym;
  const rows = bookings.filter((b) => live(b) && b.day.startsWith(monthKey()));

  // พื้นหลัง + หัว
  g.fillStyle = '#f3f6fa'; g.fillRect(0, 0, W, H);
  const HEAD = wide ? 150 : 230;
  g.fillStyle = NAVY; g.fillRect(0, 0, W, HEAD);
  const logo = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'assets/img/logo-ppg.png'; });
  if (logo) {
    const lh = wide ? 56 : 70, lw = logo.width * (lh / logo.height);
    g.fillStyle = '#fff'; round(40, wide ? 30 : 36, lw + 36, lh + 24, 16); g.fill();
    g.drawImage(logo, 58, wide ? 42 : 48, lw, lh);
    if (wide) { g.fillStyle = '#fff'; g.font = F(46, 700); g.fillText(fit(calTitle(), W / 2), lw + 110, 92); }
  }
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  if (!wide || !logo) { g.font = F(wide ? 46 : 54, 700); g.fillText(fit(calTitle(), W - 80), 40, wide ? 92 : 182); }
  g.font = F(30, 600); g.textAlign = 'right';
  g.fillText(`${TH_MONTH[m]} ${y + 543}`, W - 40, 82);
  g.font = F(22); g.fillStyle = '#b9cde6';
  const now = new Date();
  g.fillText(`${rows.length} รายการ · ข้อมูล ณ ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear() + 543} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น.`, W - 40, 120);
  g.textAlign = 'left';

  // ปฏิทิน
  // แนวนอน: ปฏิทินกว้างขึ้นให้ช่องวันแสดงชื่อ ทะเบียนรถ สถานที่ได้ · รายการด้านขวาแคบลง
  const CALW = wide ? 1390 : W - 60;
  const X0 = 30, CW = CALW / 7, Y0 = HEAD + (wide ? 22 : 30);
  g.font = F(24, 600); g.fillStyle = MUTED; g.textAlign = 'center';
  TH_DOW.forEach((d, i) => g.fillText(d, X0 + CW * i + CW / 2, Y0 + 26));
  g.textAlign = 'left';
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const weeks = Math.ceil((first + days) / 7);
  const GY = Y0 + 44;
  const RH = wide ? Math.floor((H - 64 - GY - 14) / weeks) : (weeks > 5 ? 136 : 160);
  const byDay = {};
  rows.forEach((b) => { (byDay[b.day] = byDay[b.day] || []).push(b); });
  for (let d = 1; d <= days; d += 1) {
    const i = first + d - 1, cx = X0 + CW * (i % 7), cy = GY + RH * Math.floor(i / 7);
    const k = key(y, m, d), items = byDay[k] || [];
    g.fillStyle = items.length ? '#e6f0ff' : '#ffffff';
    round(cx + 3, cy + 3, CW - 6, RH - 6, 12); g.fill();
    if (k === todayKey()) { g.strokeStyle = NAVY; g.lineWidth = 3; g.stroke(); }
    g.fillStyle = INK; g.font = F(20, 700); g.fillText(String(d), cx + 10, cy + 26);
    if (items.length) { g.fillStyle = MUTED; g.font = F(12, 600); g.textAlign = 'right'; g.fillText(`${items.length} รายการ`, cx + CW - 12, cy + 24); g.textAlign = 'left'; }
    // การ์ดย่อเหมือนหน้าจอ: เวลา + ชื่อ-สกุล · ทะเบียนรถ · สถานที่ (ตัวเล็ก)
    // วันที่รายการเยอะ ลดเหลือ 2 บรรทัด (ไม่มีสถานที่) ก่อนจะต้องตัดเป็น "+N รายการ"
    // ช่องแคบ (แนวตั้ง): เวลา กับ ชื่อ แยกบรรทัด
    const roomy = CW >= 185;
    const full = (b) => [
      ...(roomy ? [`${b.from}–${b.to} ${b.by}`] : [`${b.from}–${b.to}`, b.by]),
      ...(b.plate ? [`🚗 ${b.plate}`] : []),
      ...(b.place ? [b.place] : []),
    ];
    const compact = (b) => [`${b.from} ${String(b.by).split(' ')[0]}`, ...(b.plate ? [`🚗 ${b.plate}`] : b.place ? [b.place] : [])];
    const LHs = 14, GAP = 3, TOP = cy + 34, AV = RH - 34 - 6;
    const cardH = (k) => k * LHs + 6;
    const fits = (fn) => items.reduce((t, b) => t + cardH(fn(b).length) + GAP, 0) <= AV;
    const lines = fits(full) ? full : compact;
    let ey = TOP, shown = 0;
    for (const b of items) {
      const ls = lines(b);
      const h = cardH(ls.length);
      const left = items.length - shown;
      // เหลือที่ไม่พอ → เก็บบรรทัดสุดท้ายไว้บอกจำนวนที่เหลือ
      if (ey + h > cy + RH - 6 || (left > 1 && !fits(lines) && ey + h > cy + RH - 24)) break;
      g.fillStyle = '#fff'; round(cx + 7, ey, CW - 14, h, 5); g.fill();
      g.fillStyle = TONE[tone(b)]; g.fillRect(cx + 7, ey, 4, h);
      ls.forEach((t, i) => {
        const isPlate = t.startsWith('🚗');
        const isHead = i === 0 || (!roomy && lines === full && i === 1);
        g.fillStyle = isHead ? INK : isPlate ? NAVY : MUTED;
        g.font = F(isHead ? 12.5 : 11.5, isHead || isPlate ? 600 : 400);
        g.fillText(fit(t, CW - 26), cx + 15, ey + 3 + LHs * (i + 1) - 3);
      });
      ey += h + GAP; shown += 1;
    }
    if (shown < items.length) { g.fillStyle = MUTED; g.font = F(13, 600); g.fillText(`+${items.length - shown} รายการ`, cx + 12, cy + RH - 12); }
  }

  // รายการทั้งเดือน (ถ้ายาวเกินหน้า เริ่มจากวันนี้) · แนวนอนอยู่ด้านขวาของปฏิทิน
  const LX = wide ? X0 + CALW + 30 : 30, LW = wide ? W - LX - 30 : W - 60;
  let ly = wide ? Y0 + 26 : GY + RH * weeks + 34;
  g.fillStyle = NAVY; g.font = F(30, 700); g.fillText(`รายการเดือน${TH_MONTH[m]}`, LX + 10, ly); ly += 18;
  const LH = wide ? 42 : 46, room = Math.floor((H - 90 - ly) / LH);
  let list = rows;
  if (list.length > room) {
    const from = rows.findIndex((b) => b.day >= todayKey());
    list = rows.slice(Math.max(0, Math.min(from < 0 ? 0 : from, rows.length - room)));
  }
  const more = list.length - room;
  list.slice(0, more > 0 ? room - 1 : room).forEach((b, i) => {
    const yy = ly + i * LH;
    const ty = yy + (wide ? 27 : 29);
    g.fillStyle = i % 2 ? '#ffffff' : '#eef3f9'; round(LX, yy, LW, LH - 6, 8); g.fill();
    g.fillStyle = TONE[tone(b)]; g.fillRect(LX, yy, 6, LH - 6);
    const [, mm, dd] = b.day.split('-').map(Number);
    g.fillStyle = INK; g.font = F(wide ? 20 : 22, 700);
    g.fillText(`${dd} ${TH_MONTH[mm - 1].slice(0, 3)}.`, LX + 18, ty);
    g.fillText(`${b.from}–${b.to}`, LX + (wide ? 88 : 120), ty);
    if (wide) {
      // แนวนอน: ชื่ออย่างเดียว (ทะเบียนรถ/สถานที่ดูในช่องปฏิทิน) · สถานะดูจากแถบสีด้านซ้าย
      g.font = F(19);
      g.fillText(fit(b.by, LW - 220), LX + 208, ty);
    } else {
      g.font = F(22);
      g.fillText(fit(b.by, 230), LX + 280, ty);
      g.fillStyle = NAVY; g.font = F(21, 600);
      g.fillText(fit(b.plate ? `🚗 ${b.plate}` : b.place, 300), LX + 520, ty);
    }
    if (!wide) {
      g.fillStyle = TONE[tone(b)]; g.font = F(20, 600); g.textAlign = 'right';
      g.fillText(b.status, LX + LW - 16, ty); g.textAlign = 'left';
    }
  });
  if (more > 0) { g.fillStyle = MUTED; g.font = F(22, 600); g.fillText(fit(`…และอีก ${more + 1} รายการ ดูทั้งหมดในระบบ Intranet`, LW - 30), LX + 18, ly + (room - 1) * LH + 29); }
  if (!rows.length) { g.fillStyle = MUTED; g.font = F(24); g.fillText('เดือนนี้ยังไม่มีรายการ', LX + 18, ly + 32); }

  // ท้ายภาพ
  g.fillStyle = NAVY; g.fillRect(0, H - 64, W, 64);
  g.fillStyle = '#fff'; g.font = F(22, 600);
  g.fillText('Prime Power Group · ระบบ Intranet', 40, H - 24);
  g.textAlign = 'right'; g.fillStyle = '#b9cde6'; g.font = F(20);
  g.fillText('🟩 อนุมัติแล้ว  🟨 รออนุมัติ  🟧 ส่งกลับแก้ไข' + (kind === 'car' ? '  ⬜ คืนรถแล้ว' : '  🟪 เวลาชนกัน'), W - 40, H - 24);
  g.textAlign = 'left';

  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${kind === 'car' ? 'car' : 'queue'}-calendar-${monthKey()}${wide ? '-1920x1080' : ''}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
