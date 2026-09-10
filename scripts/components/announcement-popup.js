/**
 * ประกาศเด้งหลังเข้าระบบ
 *
 * อ่านจาก List Announcements แสดงเฉพาะรายการที่เปิดใช้งานและอยู่ในช่วงวันที่กำหนด
 * เลื่อนอัตโนมัติตามค่า PopupInterval ในตั้งค่าระบบ หยุดเลื่อนเมื่อเอาเมาส์ชี้
 * แสดงครั้งเดียวต่อการเข้าใช้งานหนึ่งรอบ ไม่เด้งซ้ำทุกครั้งที่เปลี่ยนหน้า
 */
import { list } from '../services/data.js';
import { settings } from '../utils/settings.js';
import { esc, $, $$ } from '../core/dom.js';
import { thaiDateShort } from '../utils/format.js';

const SEEN_KEY = 'ppg-announce-seen';

let items = [];
let index = 0;
let timer = null;

/** แปลงวันที่จาก SharePoint เป็นวันเริ่มต้นของวัน เพื่อเทียบช่วงได้ตรง */
const day = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

function withinRange(a) {
  const today = day(new Date());
  const from = day(a.StartDate);
  const to = day(a.EndDate);
  if (from && today < from) return false;
  if (to && today > to) return false;
  return true;
}

function slideHtml(a, interval) {
  const many = items.length > 1;
  const isImage = a.AnnounceType === 'รูปภาพเต็มใบ' && a.ImageUrl;

  return `
    <div class="pop-card" role="dialog" aria-modal="true" aria-label="ประกาศจากบริษัท">
      <button class="pop-close" id="pop-x" aria-label="ปิดประกาศ">✕</button>

      ${isImage
        ? `<div class="pop-full"><img src="${esc(a.ImageUrl)}" alt="${esc(a.Title)}"></div>
           ${a.Title ? `<div class="pop-caption">${esc(a.Title)}${
             a.Department ? ' · ' + esc(a.Department) : ''}</div>` : ''}`
        : `${a.ImageUrl ? `<div class="pop-image"><img src="${esc(a.ImageUrl)}" alt=""></div>` : ''}
           <div class="pop-body">
             ${a.Department ? `<span class="pop-dept">${esc(a.Department)}</span>` : ''}
             <h3>${esc(a.Title)}</h3>
             ${a.Content ? `<p>${esc(a.Content)}</p>` : ''}
             ${a.PublishDate ? `<div class="pop-date">ประกาศเมื่อ ${esc(thaiDateShort(a.PublishDate))}</div>` : ''}
           </div>`}

      ${many && interval > 0
        ? `<div class="pop-bar"><span style="animation-duration:${interval}s"></span></div>` : ''}

      <div class="pop-foot">
        ${many ? `
          <button class="pop-arrow" id="pop-prev" aria-label="ประกาศก่อนหน้า">‹</button>
          <div class="pop-dots">
            ${items.map((_, k) => `<button data-slide="${k}" class="${k === index ? 'on' : ''}"
              aria-label="ประกาศที่ ${k + 1}"></button>`).join('')}
          </div>
          <span class="pop-count">${index + 1} / ${items.length}</span>
          <button class="pop-arrow" id="pop-next" aria-label="ประกาศถัดไป">›</button>`
        : `<span class="pop-count">มี 1 ประกาศ</span>`}
        <button class="btn btn-primary pop-ok" id="pop-ok">รับทราบ</button>
      </div>
    </div>`;
}

function draw(interval) {
  const root = $('#overlay-root');
  root.innerHTML = `<div class="pop-mask" id="pop-mask">${slideHtml(items[index], interval)}</div>`;

  const stop = () => { clearTimeout(timer); timer = null; };
  const close = () => {
    stop();
    root.innerHTML = '';
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* โหมดส่วนตัวอาจเขียนไม่ได้ */ }
  };
  const goTo = (k) => { stop(); index = (k + items.length) % items.length; draw(interval); };

  $('#pop-x').onclick = close;
  $('#pop-ok').onclick = close;
  $('#pop-mask').onclick = (ev) => { if (ev.target.id === 'pop-mask') close(); };
  addEventListener('keydown', function onEsc(ev) {
    if (ev.key === 'Escape') { close(); removeEventListener('keydown', onEsc); }
  });

  if (items.length > 1) {
    $('#pop-prev').onclick = () => goTo(index - 1);
    $('#pop-next').onclick = () => goTo(index + 1);
    $$('[data-slide]').forEach((b) => { b.onclick = () => goTo(+b.dataset.slide); });

    if (interval > 0) {
      const tick = () => { timer = setTimeout(() => goTo(index + 1), interval * 1000); };
      tick();
      const card = $('.pop-card');
      const bar = $('.pop-bar span');
      card.onmouseenter = () => { stop(); if (bar) bar.style.animationPlayState = 'paused'; };
      card.onmouseleave = () => { tick(); if (bar) bar.style.animationPlayState = 'running'; };
    }
  }
}

/** เรียกหลังเข้าสู่ระบบสำเร็จ */
export async function showAnnouncements({ force = false } = {}) {
  try {
    if (!force && sessionStorage.getItem(SEEN_KEY)) return;
  } catch (e) { /* ไม่มี sessionStorage ก็แสดงตามปกติ */ }

  try {
    const [rows, cfg] = await Promise.all([list('announcements'), settings()]);
    items = rows
      .filter((a) => a.IsActive !== false && withinRange(a))
      .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));

    if (!items.length) return;
    index = 0;
    draw(Number(cfg.PopupInterval ?? 5) || 0);
  } catch (err) {
    // ประกาศเด้งไม่ใช่งานหลัก ถ้าดึงไม่ได้ให้เข้าเว็บต่อได้ตามปกติ
    console.warn('แสดงประกาศไม่สำเร็จ:', err.message);
  }
}
