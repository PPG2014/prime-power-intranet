import { esc, onClick } from '../core/dom.js';
import { list } from '../services/data.js';
import { composeBookingUrl } from '../services/calendar.js';
import { state, setState } from '../core/state.js';

export const meta = { route: 'rooms', title: 'จองห้องประชุม', nav: true, order: 6, adminOnly: false };

export async function render(ctx) {
  const rooms = (await list('rooms')).filter((r) => r.IsActive !== false)
    .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));
  if (!rooms.length) return `<section class="page"><div class="wrap">
    <h1 class="page-title">${esc(meta.title)}</h1>
    <div class="panel"><div class="empty">ยังไม่มีห้องประชุมในระบบ</div></div></div></section>`;

  const i = Math.min(state.roomIndex || 0, rooms.length - 1);
  const r = rooms[i];

  return `
  <section class="page page-rooms">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">ตารางการใช้ห้องดึงสดจากปฏิทินห้องใน Outlook — กดจองแล้วระบบจะเปิดปฏิทินของคุณพร้อมกรอกชื่อห้องไว้ให้</p>

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
          ${r.PublishedCalendarUrl ? `<a class="btn-mini" href="${esc(r.PublishedCalendarUrl)}"
            target="_blank" rel="noopener">↗ เปิดปฏิทินเต็มจอ</a>` : ''}
          <a class="btn btn-primary book-btn" href="${composeBookingUrl(r)}"
             target="_blank" rel="noopener">จองห้องนี้</a>
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
}
