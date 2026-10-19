/**
 * ปฏิทินคิวรายเดือน สำหรับฟอร์มที่จองเป็นช่วงเวลา (เช่น จองคิว Messenger)
 *
 * อ่านคิวจากคำขอใน SharePoint โดยตรง ไม่ต้องใช้ปฏิทิน Outlook
 * คลิกวันไหนจะเห็นคิวของวันนั้น และเติมวันที่ลงในฟอร์มให้เลย
 */
import { esc, $, $$ } from '../core/dom.js';
import { list, clearDataCache } from '../services/data.js';
import { CAR_FIELDS, carBookings, localDay } from '../services/car.js';
import { QUEUE_FIELDS, DEAD, codeOf, stTone } from '../services/booking.js';

const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const live = (b) => !DEAD.includes(b.status);   // นับเป็นคิว (ไม่รวมยกเลิก/ไม่อนุมัติ)

let ym = null;          // เดือนที่กำลังดู { y, m }
let picked = '';        // วันที่ที่เลือกดู (YYYY-MM-DD)
let bookings = [];      // คิวทั้งหมดของฟอร์มนี้
let formCode = '';      // รหัสฟอร์ม (หรือหลายรหัส) ที่กำลังแสดงคิว
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
  const rows = await list('requests').catch(() => []);
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
    const shown = items.slice(0, 3).map((b) => `<span class="qc-ev ${stTone(b.status)}"
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
      <span class="qc-st ${stTone(b.status)}">${esc(b.status)}</span>
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
        <span class="qc-st ${stTone(b.status)}">${esc(b.status)}</span>
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
        <button class="btn-mini" data-qcpng="1" title="บันทึกเป็นรูปแนวตั้ง 1080×1920 สำหรับส่งในกลุ่ม">⬇ PNG</button>
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
  $$('[data-qcpng]', box).forEach((b) => { b.onclick = () => exportPng(); });
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
  const box = $('#queue-cal');
  if (!box) return;
  box.innerHTML = '<div class="panel qc-panel"><div class="qc-hint">กำลังโหลดคิว…</div></div>';
  const now = new Date();
  const id = String(code);
  ym = ym && ym.code === id ? ym : { y: now.getFullYear(), m: now.getMonth(), code: id };
  picked = todayKey();
  clearDataCache('requests');   // อ่านสถานะล่าสุดทุกครั้งที่เปิดปฏิทิน
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
const tone = (b) => stTone(b.status);

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
          <button class="btn btn-primary" data-qcfpng="1">⬇ บันทึกเป็น PNG (1080×1920)</button>
          <button class="btn-mini" data-qcfclose="1" aria-label="ปิด">✕ ปิด</button>
        </div>
      </div>
      <div class="qcf-legend"><i class="ok"></i>อนุมัติแล้ว/เสร็จสิ้น <i class="wait"></i>รออนุมัติ <i class="back"></i>ส่งกลับแก้ไข${kind === 'car' ? ' <i class="done"></i>คืนรถแล้ว' : ' <i class="dead"></i>ยกเลิก/ไม่อนุมัติ'}</div>
      <div class="qcf-dow">${TH_DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="qcf-grid">${cells.join('')}</div>
    </div>`;
    $$('[data-qcfm]', host).forEach((b) => { b.onclick = () => {
      const d = new Date(ym.y, ym.m + (+b.dataset.qcfm), 1);
      ym = { ...ym, y: d.getFullYear(), m: d.getMonth() };
      draw(); if (sideBox) paint(sideBox);
    }; });
    $('[data-qcfpng]', host).onclick = () => exportPng();
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
async function exportPng() {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (getComputedStyle(document.body).fontFamily || 'sans-serif');
  try { await document.fonts.ready; } catch (e) { /* ไม่เป็นไร */ }
  const F = (size, w = 400) => `${w} ${size}px ${font}`;
  const NAVY = '#0b3b7a', INK = '#1d2733', MUTED = '#6b7787', LINE = '#dbe3ee';
  const TONE = { ok: '#1e7f4f', wait: '#d69e2e', back: '#dd6b20', done: '#8a96a5', dead: '#b0b8c4' };
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
  g.fillStyle = NAVY; g.fillRect(0, 0, W, 230);
  const logo = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'assets/img/logo-ppg.png'; });
  if (logo) {
    const lh = 70, lw = logo.width * (lh / logo.height);
    g.fillStyle = '#fff'; round(40, 36, lw + 36, lh + 24, 16); g.fill();
    g.drawImage(logo, 58, 48, lw, lh);
  }
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.font = F(54, 700); g.fillText(fit(calTitle(), W - 80), 40, 182);
  g.font = F(30, 600); g.textAlign = 'right';
  g.fillText(`${TH_MONTH[m]} ${y + 543}`, W - 40, 82);
  g.font = F(22); g.fillStyle = '#b9cde6';
  const now = new Date();
  g.fillText(`${rows.length} รายการ · ข้อมูล ณ ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear() + 543} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น.`, W - 40, 120);
  g.textAlign = 'left';

  // ปฏิทิน
  const X0 = 30, CW = (W - 60) / 7, Y0 = 260;
  g.font = F(24, 600); g.fillStyle = MUTED; g.textAlign = 'center';
  TH_DOW.forEach((d, i) => g.fillText(d, X0 + CW * i + CW / 2, Y0 + 26));
  g.textAlign = 'left';
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const weeks = Math.ceil((first + days) / 7);
  const RH = weeks > 5 ? 136 : 160, GY = Y0 + 44;
  const byDay = {};
  rows.forEach((b) => { (byDay[b.day] = byDay[b.day] || []).push(b); });
  for (let d = 1; d <= days; d += 1) {
    const i = first + d - 1, cx = X0 + CW * (i % 7), cy = GY + RH * Math.floor(i / 7);
    const k = key(y, m, d), items = byDay[k] || [];
    g.fillStyle = items.length ? '#e6f0ff' : '#ffffff';
    round(cx + 3, cy + 3, CW - 6, RH - 6, 12); g.fill();
    if (k === todayKey()) { g.strokeStyle = NAVY; g.lineWidth = 3; g.stroke(); }
    g.fillStyle = INK; g.font = F(26, 700); g.fillText(String(d), cx + 12, cy + 34);
    const per = RH > 140 ? 3 : 2;
    items.slice(0, per).forEach((b, j) => {
      const ey = cy + 46 + j * 32;
      g.fillStyle = '#fff'; round(cx + 8, ey, CW - 16, 28, 6); g.fill();
      g.fillStyle = TONE[tone(b)]; g.fillRect(cx + 8, ey, 5, 28);
      g.fillStyle = INK; g.font = F(19, 600);
      g.fillText(fit(`${b.from} ${String(b.by).split(' ')[0]}`, CW - 30), cx + 18, ey + 21);
    });
    if (items.length > per) { g.fillStyle = MUTED; g.font = F(18, 600); g.fillText(`+${items.length - per} รายการ`, cx + 12, cy + RH - 14); }
  }

  // รายการทั้งเดือน (ถ้ายาวเกินหน้า เริ่มจากวันนี้)
  let ly = GY + RH * weeks + 34;
  g.fillStyle = NAVY; g.font = F(30, 700); g.fillText(`รายการเดือน${TH_MONTH[m]}`, 40, ly); ly += 18;
  const LH = 46, room = Math.floor((H - 90 - ly) / LH);
  let list = rows;
  if (list.length > room) {
    const from = rows.findIndex((b) => b.day >= todayKey());
    list = rows.slice(Math.max(0, Math.min(from < 0 ? 0 : from, rows.length - room)));
  }
  const more = list.length - room;
  list.slice(0, more > 0 ? room - 1 : room).forEach((b, i) => {
    const yy = ly + i * LH;
    g.fillStyle = i % 2 ? '#ffffff' : '#eef3f9'; round(30, yy, W - 60, LH - 6, 8); g.fill();
    g.fillStyle = TONE[tone(b)]; g.fillRect(30, yy, 6, LH - 6);
    const [, mm, dd] = b.day.split('-').map(Number);
    g.fillStyle = INK; g.font = F(22, 700);
    g.fillText(`${dd} ${TH_MONTH[mm - 1].slice(0, 3)}.`, 48, yy + 29);
    g.fillText(`${b.from}–${b.to}`, 150, yy + 29);
    g.font = F(22);
    g.fillText(fit(b.by, 230), 310, yy + 29);
    g.fillStyle = NAVY; g.font = F(21, 600);
    g.fillText(fit(b.plate ? `🚗 ${b.plate}` : b.place, 300), 550, yy + 29);
    g.fillStyle = TONE[tone(b)]; g.font = F(20, 600); g.textAlign = 'right';
    g.fillText(b.status, W - 46, yy + 29); g.textAlign = 'left';
  });
  if (more > 0) { g.fillStyle = MUTED; g.font = F(22, 600); g.fillText(`…และอีก ${more + 1} รายการ ดูทั้งหมดในระบบ Intranet`, 48, ly + (room - 1) * LH + 29); }
  if (!rows.length) { g.fillStyle = MUTED; g.font = F(24); g.fillText('เดือนนี้ยังไม่มีรายการ', 48, ly + 32); }

  // ท้ายภาพ
  g.fillStyle = NAVY; g.fillRect(0, H - 64, W, 64);
  g.fillStyle = '#fff'; g.font = F(22, 600);
  g.fillText('Prime Power Group · ระบบ Intranet', 40, H - 24);
  g.textAlign = 'right'; g.fillStyle = '#b9cde6'; g.font = F(20);
  g.fillText('🟩 อนุมัติแล้ว  🟨 รออนุมัติ  🟧 ส่งกลับแก้ไข' + (kind === 'car' ? '  ⬜ คืนรถแล้ว' : ''), W - 40, H - 24);
  g.textAlign = 'left';

  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${kind === 'car' ? 'car' : 'queue'}-calendar-${monthKey()}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
