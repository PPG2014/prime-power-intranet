import { esc, $, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { composeBookingUrl, createRoomBooking, isRoomFree } from '../services/calendar.js';
import { state, setState } from '../core/state.js';

let rooms = [];

/** ตัวเลือกเวลา ทุกครึ่งชั่วโมง 07:00–20:00 */
const TIMES = (() => {
  const out = [];
  for (let h = 7; h <= 20; h += 1) for (const m of ['00', '30']) out.push(`${String(h).padStart(2, '0')}:${m}`);
  return out;
})();
const todayStr = () => new Date().toLocaleDateString('sv-SE');   // YYYY-MM-DD ตามเวลาเครื่อง

export const meta = { route: 'rooms', title: 'จองห้องประชุม', nav: true, order: 6, adminOnly: false };

export async function render(ctx) {
  let all = [];
  let loadErr = '';
  try { all = await list('rooms'); } catch (e) { loadErr = e.message; }
  rooms = all.filter((r) => r.IsActive !== false)
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
  if (!rooms.length) {
    // บอกสาเหตุให้ชัด แทนข้อความว่างเปล่า
    const why = loadErr
      ? `อ่านรายการห้องจาก SharePoint ไม่สำเร็จ — ${esc(loadErr)}`
      : all.length
        ? `มีห้องในระบบ ${all.length} ห้อง แต่ทุกห้องถูกปิดใช้งานอยู่`
        : 'ยังไม่มีห้องประชุมในระบบ';
    return `<section class="page"><div class="wrap">
    <h1 class="page-title">${esc(meta.title)}</h1>
    <div class="panel"><div class="empty">${why}${state.isAdmin
      ? `<br><span class="dim">เพิ่มหรือเปิดใช้งานห้องได้ที่ <a href="#/admin">จัดการข้อมูล → ห้องประชุม</a>
         · กรอก "อีเมลของ Room Mailbox" ให้ครบเพื่อให้จองห้องได้จริง</span>` : ''}</div></div></div></section>`;
  }

  const i = Math.min(state.roomIndex || 0, rooms.length - 1);
  const r = rooms[i];

  return `
  <section class="page page-rooms">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">ดูตารางการใช้ห้อง แล้วจองจากหน้าเว็บได้เลย — ระบบสร้างนัดหมายในปฏิทิน Outlook ของคุณและจองห้องให้อัตโนมัติ หรือจะกดจองผ่าน Outlook แบบเดิมก็ได้</p>

      <div class="room-tabs">
        ${rooms.map((x, k) => `<button data-room="${k}" aria-current="${k === i ? 'page' : 'false'}">
          <b>${esc(x.Title)}</b><span>${esc(x.Location)} · ${x.Capacity} ที่นั่ง</span></button>`).join('')}
      </div>

      <div class="panel">
        <div class="room-head">
          <div class="room-info">
            <div class="room-name">${esc(r.Title)}</div>
            <div class="room-meta">${esc(r.Location)} · ${r.Capacity} ที่นั่ง${
              r.Equipment ? ' · ' + esc(r.Equipment) : ''}</div>
          </div>
          <div class="room-actions">
        ${r.PublishedCalendarUrl ? `<a class="btn-mini" href="${esc(r.PublishedCalendarUrl)}"
            target="_blank" rel="noopener">↗ เปิดปฏิทินเต็มจอ</a>` : ''}
          <a class="btn-mini book-btn" href="${composeBookingUrl(r)}"
             target="_blank" rel="noopener">↗ จองผ่าน Outlook</a>
          </div>
        </div>
        <div class="book-form">
          <div class="book-title">จองห้องนี้จากหน้าเว็บ</div>
          <div class="book-grid">
            <label>หัวข้อการประชุม
              <input id="bk-subject" type="text" placeholder="เช่น ประชุมติดตามงานโครงการ">
            </label>
            <label>วันที่
              <input id="bk-date" type="date" value="${todayStr()}" min="${todayStr()}">
            </label>
            <label>เริ่ม
              <select id="bk-start">${TIMES.map((t) => `<option${t === '09:00' ? ' selected' : ''}>${t}</option>`).join('')}</select>
            </label>
            <label>ถึง
              <select id="bk-end">${TIMES.map((t) => `<option${t === '10:00' ? ' selected' : ''}>${t}</option>`).join('')}</select>
            </label>
            <label class="wide">ผู้เข้าร่วม (อีเมล คั่นด้วยเครื่องหมายจุลภาค)
              <input id="bk-att" type="text" placeholder="somchai.w@primepower.co.th, wanna.t@primepower.co.th">
            </label>
            <label class="wide">รายละเอียดเพิ่มเติม
              <input id="bk-note" type="text" placeholder="ไม่บังคับ">
            </label>
          </div>
          <div class="book-msg" id="bk-msg" hidden></div>
          <div class="book-actions">
            <button class="btn btn-primary" id="bk-go">📅 จองห้อง</button>
          </div>
          <div class="panel-note">ระบบจะสร้างนัดหมายในปฏิทิน Outlook ของคุณและเชิญห้องให้อัตโนมัติ
            — เห็นได้ทั้งใน Outlook และ Teams เหมือนจองจาก Outlook โดยตรง</div>
        </div>

        ${r.PublishedCalendarUrl
          ? `<div class="cal-box"><iframe src="${esc(r.PublishedCalendarUrl)}"
               title="ปฏิทิน ${esc(r.Title)}" loading="lazy"></iframe></div>
             <div class="panel-note">ตารางด้านบนคือปฏิทินของห้องที่เผยแพร่จาก Outlook — หากไม่ขึ้น ให้กด ↗ เปิดปฏิทินเต็มจอ</div>`
          : `<div class="empty">ห้องนี้ยังไม่ได้เชื่อมปฏิทิน Outlook</div>`}
      </div>
    </div>
  </section>`;
}

export function mount(ctx) {
  onClick('room', (k) => setState({ roomIndex: +k }));

  const go = $('#bk-go');
  if (!go) return;
  const msg = $('#bk-msg');
  const show = (text, tone) => {
    msg.hidden = false;
    msg.className = `book-msg ${tone}`;
    msg.innerHTML = text;
  };

  go.onclick = async () => {
    const r = rooms[Math.min(state.roomIndex || 0, rooms.length - 1)];
    const subject = $('#bk-subject').value.trim();
    const date = $('#bk-date').value;
    const st = $('#bk-start').value;
    const en = $('#bk-end').value;

    if (!subject) return show('กรุณาใส่หัวข้อการประชุม', 'bad');
    if (!date) return show('กรุณาเลือกวันที่', 'bad');
    if (en <= st) return show('เวลาสิ้นสุดต้องหลังเวลาเริ่ม', 'bad');

    const startISO = `${date}T${st}:00`;
    const endISO = `${date}T${en}:00`;

    go.disabled = true;
    show('กำลังตรวจสอบห้องว่าง…', '');
    try {
      const chk = await isRoomFree(r, startISO, endISO);
      if (!chk.free) {
        go.disabled = false;
        return show('ช่วงเวลานี้ห้องไม่ว่าง กรุณาเลือกเวลาอื่น', 'bad');
      }

      show('กำลังสร้างนัดหมาย…', '');
      const ev = await createRoomBooking({
        room: r, subject, startISO, endISO,
        attendees: $('#bk-att').value.split(','),
        note: $('#bk-note').value.trim(),
      });

      show(`✓ จองเรียบร้อย — ${esc(subject)} · ${esc(date)} ${esc(st)}–${esc(en)}`
        + (r.RoomMailbox ? '<br>ห้องจะยืนยันกลับทางอีเมลอัตโนมัติ' : '')
        + (ev.webLink ? `<br><a href="${esc(ev.webLink)}" target="_blank" rel="noopener">เปิดดูใน Outlook</a>` : ''),
        'ok');
      $('#bk-subject').value = '';
      $('#bk-att').value = '';
      $('#bk-note').value = '';
    } catch (e) {
      show(esc(e.message), 'bad');
    } finally {
      go.disabled = false;
    }
  };
}
