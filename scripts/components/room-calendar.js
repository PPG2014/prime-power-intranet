/**
 * ตารางห้องประชุมรายเดือน — วาดเองจากปฏิทินของ Room Mailbox (Microsoft Graph getSchedule)
 *
 * ใช้แทนการฝังปฏิทินที่เผยแพร่จาก Outlook (Outlook ไม่ให้แสดงในเว็บอื่นแล้ว กรอบจึงขึ้นไอคอนห้าม)
 *   - เห็นช่วงเวลาที่ห้องไม่ว่างของทั้งเดือน · ชื่อเรื่องขึ้นถ้าห้องตั้งให้แสดงรายละเอียด ไม่งั้นขึ้นว่า "ไม่ว่าง"
 *   - คลิกวัน → ดูรายการของวันนั้น + ปุ่ม "จองวันนี้" เติมวันที่ลงฟอร์มจองด้านบน
 *   - ครั้งแรกถ้ายังไม่ได้ยืนยันสิทธิ์ปฏิทิน ให้กดปุ่มเพื่อยืนยัน (ป๊อปอัปต้องมาจากการกดเท่านั้น)
 */
import { esc, $, $$ } from '../core/dom.js';
import { getRoomSchedule } from '../services/calendar.js';

const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayKey = () => new Date().toLocaleDateString('sv-SE');
const thaiDay = (k) => { const [y, m, d] = k.split('-').map(Number); return `${d} ${TH_MONTH[m - 1]} ${y + 543}`; };

let room = null;
let ym = null;
let picked = '';
let events = [];     // [{ day, from, to, subject, status }]
let state = 'idle';  // idle | loading | ready | consent | error
let errMsg = '';

/** เวลาจาก Graph: เวลาไทยอยู่แล้ว (ขอด้วย Prefer) · ถ้าเป็น UTC แปลงเป็นเวลาเครื่อง */
function local(dt) {
  const s = String((dt && dt.dateTime) || '');
  const tz = String((dt && dt.timeZone) || '');
  const d = /utc/i.test(tz) ? new Date(s.replace(/(\.\d+)?Z?$/, 'Z')) : new Date(s.replace(/(\.\d+)?Z?$/, ''));
  return d;
}
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

async function load({ silent }) {
  const start = new Date(ym.y, ym.m, 1);
  const end = new Date(ym.y, ym.m + 1, 1);
  state = 'loading'; paint();
  try {
    const sch = await getRoomSchedule(room.RoomMailbox, `${start.toLocaleDateString('sv-SE')}T00:00:00`,
      `${end.toLocaleDateString('sv-SE')}T00:00:00`, { silent });
    events = [];
    (sch.scheduleItems || []).filter((x) => x.status !== 'free').forEach((x) => {
      const a = local(x.start); const b = local(x.end);
      // นัดข้ามวัน: แสดงทุกวันที่อยู่ในช่วง
      for (let d = new Date(a.getFullYear(), a.getMonth(), a.getDate()); d < b; d.setDate(d.getDate() + 1)) {
        const day = d.toLocaleDateString('sv-SE');
        const first = day === a.toLocaleDateString('sv-SE');
        const last = day === new Date(b - 1).toLocaleDateString('sv-SE');
        events.push({ day, from: first ? hm(a) : '00:00', to: last ? hm(b) : '24:00',
          subject: String(x.subject || '').trim(), status: x.status, priv: !!x.isPrivate });
      }
    });
    events.sort((p, q) => p.day.localeCompare(q.day) || p.from.localeCompare(q.from));
    state = 'ready';
  } catch (e) {
    state = e.code === 'needs-interaction' ? 'consent' : 'error';
    errMsg = e.message;
  }
  paint();
}

const label = (e) => e.subject || (e.priv ? 'นัดส่วนตัว' : 'ไม่ว่าง');

function grid() {
  const { y, m } = ym;
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i += 1) cells.push('<div class="rc-cell rc-blank"></div>');
  for (let d = 1; d <= days; d += 1) {
    const k = key(y, m, d);
    const items = events.filter((e) => e.day === k);
    const cls = ['rc-cell', items.length ? 'has' : '', k === todayKey() ? 'today' : '', k === picked ? 'on' : ''].filter(Boolean).join(' ');
    cells.push(`<button class="${cls}" data-rcday="${k}">
      <span class="rc-d">${d}</span>
      ${items.slice(0, 3).map((e) => `<span class="rc-ev ${e.status === 'tentative' ? 'tent' : ''}" title="${esc(`${e.from}–${e.to} ${label(e)}`)}"><b>${esc(e.from)}</b> ${esc(label(e))}</span>`).join('')}
      ${items.length > 3 ? `<span class="rc-more">+${items.length - 3} รายการ</span>` : ''}
    </button>`);
  }
  return cells.join('');
}

function dayList() {
  if (!picked) return '';
  const rows = events.filter((e) => e.day === picked);
  const use = picked >= todayKey() ? `<button class="btn-mini" data-rcuse="${picked}">📅 จองวันนี้</button>` : '';
  if (!rows.length) return `<div class="rc-free">✓ ${esc(thaiDay(picked))} ห้องว่างทั้งวัน ${use}</div>`;
  return `<div class="rc-daytitle">${esc(thaiDay(picked))} · ไม่ว่าง ${rows.length} ช่วง ${use}</div>
    <ul class="rc-list">${rows.map((e) => `<li><span class="rc-time">${esc(e.from)}–${esc(e.to)}</span>
      <span>${esc(label(e))}</span>${e.status === 'tentative' ? '<span class="rc-tag">รอยืนยัน</span>' : ''}</li>`).join('')}</ul>`;
}

function body() {
  if (state === 'loading') return '<div class="rc-hint">กำลังโหลดตารางห้อง…</div>';
  if (state === 'consent') return `<div class="rc-hint">ต้องยืนยันสิทธิ์ปฏิทิน Microsoft 365 ครั้งแรกก่อน จึงจะเห็นตารางห้อง
      <br><button class="btn btn-primary" data-rcauth="1">🔓 แสดงตารางห้อง</button></div>`;
  if (state === 'error') return `<div class="rc-hint">อ่านตารางห้องไม่สำเร็จ — ${esc(errMsg)}
      <br><button class="btn-mini" data-rcauth="1">↻ ลองใหม่</button></div>`;
  return `<div class="rc-dow">${TH_DOW.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="rc-grid">${grid()}</div>
    <div class="rc-day">${dayList()}</div>`;
}

function paint() {
  const box = $('#room-cal');
  if (!box || !ym) return;
  const busyDays = new Set(events.map((e) => e.day)).size;
  box.innerHTML = `<div class="rc-head">
      <button class="btn-mini" data-rcmove="-1" aria-label="เดือนก่อน">‹</button>
      <b>${TH_MONTH[ym.m]} ${ym.y + 543}</b>
      <button class="btn-mini" data-rcmove="1" aria-label="เดือนถัดไป">›</button>
      <button class="btn-mini" data-rcmove="0">วันนี้</button>
      ${state === 'ready' ? `<span class="dim rc-meta">มีการใช้ห้อง ${busyDays} วัน</span>` : ''}
    </div>${body()}`;
  $$('[data-rcmove]', box).forEach((b) => { b.onclick = () => {
    const step = +b.dataset.rcmove;
    const d = step ? new Date(ym.y, ym.m + step, 1) : new Date();
    ym = { y: d.getFullYear(), m: d.getMonth() };
    if (!step) picked = todayKey();
    load({ silent: true });
  }; });
  $$('[data-rcday]', box).forEach((b) => { b.onclick = () => { picked = b.dataset.rcday; paint(); }; });
  $$('[data-rcauth]', box).forEach((b) => { b.onclick = () => load({ silent: false }); });
  $$('[data-rcuse]', box).forEach((b) => { b.onclick = () => {
    const input = $('#bk-date');
    if (!input) return;
    input.value = b.dataset.rcuse;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    ($('#bk-subject') || input).focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }; });
}

/** เรียกหลังหน้าจองห้องวาดเสร็จ */
export function mountRoomCalendar(r) {
  room = r;
  if (!$('#room-cal') || !r || !r.RoomMailbox) return;
  const now = new Date();
  ym = { y: now.getFullYear(), m: now.getMonth() };
  picked = todayKey();
  events = [];
  load({ silent: true });
}
