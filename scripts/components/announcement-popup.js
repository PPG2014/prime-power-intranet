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
import { hydratePhotos, photoBlobUrl } from '../services/photos.js';

const SEEN_KEY = 'ppg-announce-seen';

let items = [];
let index = 0;
let timer = null;
let previewNote = '';   // ข้อความเตือนตอนแอดมินกดดูตัวอย่าง (ไม่ใช่การเด้งจริง)

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
    <div class="pop-card${isImage ? ' pop-wide' : ''}" role="dialog" aria-modal="true" aria-label="ประกาศจากบริษัท">
      <button class="pop-close" id="pop-x" aria-label="ปิดประกาศ">✕</button>

      ${isImage
        ? `<div class="pop-full"><img data-photo="${esc(a.ImageUrl)}" alt="${esc(a.Title)}"></div>
           ${a.Title ? `<div class="pop-caption">${esc(a.Title)}${
             a.Department ? ' · ' + esc(a.Department) : ''}</div>` : ''}`
        : `${a.ImageUrl ? `<div class="pop-image"><img data-photo="${esc(a.ImageUrl)}" alt=""></div>` : ''}
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

/**
 * โหลดรูปของประกาศล่วงหน้า (ดึงจาก SharePoint + ถอดรหัสภาพไว้ก่อน) เพื่อให้เปลี่ยนการ์ดได้ทันทีไม่ต้องรอ
 * คืน Promise ที่เสร็จเมื่อรูปพร้อมแสดง (หรือโหลดไม่ได้ ก็ไม่ค้าง)
 */
const ready = new Map();
function preload(a) {
  const url = a && a.ImageUrl;
  if (!url) return Promise.resolve();
  if (!ready.has(url)) {
    ready.set(url, photoBlobUrl(url).then((src) => {
      if (!src) return undefined;
      const im = new Image();
      im.src = src;
      return (im.decode ? im.decode() : new Promise((r) => { im.onload = r; im.onerror = r; })).catch(() => {});
    }).catch(() => {}));
  }
  return ready.get(url);
}
/** รอรูปไม่เกินเวลาที่กำหนด — ช้ากว่านั้นเปลี่ยนการ์ดไปก่อน รูปขึ้นตามมาเอง */
const waitFor = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

let interval = 0;
let busy = false;   // กำลังเปลี่ยนการ์ด (กันกดรัว)

const stop = () => { clearTimeout(timer); timer = null; };
function close() {
  stop();
  const root = $('#overlay-root');
  if (root) root.innerHTML = '';
  previewNote = '';
  window.removeEventListener('keydown', onKey);
}
function onKey(ev) {
  if (!$('#pop-mask')) { window.removeEventListener('keydown', onKey); return; }
  if (ev.key === 'Escape') close();
  if (items.length > 1 && ev.key === 'ArrowRight') goTo(index + 1);
  if (items.length > 1 && ev.key === 'ArrowLeft') goTo(index - 1);
}

/** ผูกปุ่มของการ์ดที่แสดงอยู่ + ตั้งเวลาเลื่อนอัตโนมัติ */
function bindCard() {
  $('#pop-x').onclick = close;
  $('#pop-ok').onclick = close;
  if (items.length < 2) return;
  $('#pop-prev').onclick = () => goTo(index - 1);
  $('#pop-next').onclick = () => goTo(index + 1);
  $$('[data-slide]').forEach((b) => { b.onclick = () => goTo(+b.dataset.slide); });
  if (interval > 0) {
    const tick = () => { stop(); timer = setTimeout(() => goTo(index + 1), interval * 1000); };
    tick();
    const card = $('.pop-card');
    const bar = $('.pop-bar span');
    card.onmouseenter = () => { stop(); if (bar) bar.style.animationPlayState = 'paused'; };
    card.onmouseleave = () => { tick(); if (bar) bar.style.animationPlayState = 'running'; };
  }
  // การ์ดถัดไปโหลดรอไว้ก่อน
  preload(items[(index + 1) % items.length]);
}

/** เปลี่ยนการ์ดแบบจางออก-จางเข้า · รอรูปการ์ดใหม่พร้อมก่อน (ไม่เกิน 1.5 วินาที) จะได้ไม่เห็นกรอบว่าง */
async function goTo(k) {
  if (busy || !$('#pop-mask')) return;
  busy = true;
  stop();
  index = (k + items.length) % items.length;
  const old = $('.pop-card');
  old.classList.add('pop-leave');
  await Promise.all([waitFor(preload(items[index]), 1500), new Promise((r) => setTimeout(r, 180))]);
  if (!$('#pop-mask')) { busy = false; return; }   // ปิดไประหว่างรอ
  // ความสูงเปลี่ยนแบบนุ่มนวลจากการ์ดเดิมไปการ์ดใหม่
  const h = old.offsetHeight;
  const tmp = document.createElement('div');
  tmp.innerHTML = slideHtml(items[index], interval).trim();
  const card = tmp.firstElementChild;
  card.classList.add('pop-swap', 'pop-enter');
  old.replaceWith(card);
  await hydratePhotos(card);   // รูปอยู่ในแคชแล้ว ขึ้นทันที
  const nh = card.offsetHeight;
  if (card.animate && Math.abs(nh - h) > 2) card.animate([{ height: `${h}px` }, { height: `${nh}px` }], { duration: 220, easing: 'ease-out' });
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('pop-enter')));
  bindCard();
  busy = false;
}

function draw(iv) {
  interval = iv;
  busy = false;
  const root = $('#overlay-root');
  root.innerHTML = `<div class="pop-mask" id="pop-mask">${previewNote
    ? `<div class="pop-preview-note">${esc(previewNote)}</div>` : ''}${slideHtml(items[index], interval)}</div>`;
  // รูปจาก SharePoint ต้องแนบ token จึงจะโหลดได้ทุกบัญชี ไม่ใช่เฉพาะคนที่เปิด SharePoint ค้างไว้
  hydratePhotos(root);
  $('#pop-mask').onclick = (ev) => { if (ev.target.id === 'pop-mask') close(); };
  window.removeEventListener('keydown', onKey);
  window.addEventListener('keydown', onKey);
  bindCard();
  // โหลดรูปของทุกประกาศรอไว้ (ทีละใบตามลำดับ ไม่แย่งกับใบที่กำลังดู)
  items.reduce((p, a) => p.then(() => preload(a)), Promise.resolve());
}

/** เรียกหลังเข้าสู่ระบบสำเร็จ */
export async function showAnnouncements({ force = false } = {}) {
  try {
    if (false && !force && sessionStorage.getItem(SEEN_KEY)) return;   // เด้งทุกครั้งที่เปิด/รีเฟรชหน้าแรก
  } catch (e) { /* ไม่มี sessionStorage ก็แสดงตามปกติ */ }

  try {
    const [rows, cfg] = await Promise.all([list('announcements'), settings()]);
    items = rows
      .filter((a) => a.IsActive !== false && withinRange(a))
      // ประกาศล่าสุดขึ้นก่อน ถ้าวันที่เท่ากันใช้ลำดับที่ตั้งไว้
      .sort((a, b) => {
        const t = (x) => { const d = new Date(x.PublishDate); return isNaN(d) ? null : d.getTime(); };
        return ((t(b) ?? 0) - (t(a) ?? 0))
          || ((+a.SortOrder || 0) - (+b.SortOrder || 0))
          || ((+b.id || 0) - (+a.id || 0));
      });

    if (!items.length) return;
    index = 0;
    draw(Number(cfg.PopupInterval ?? 5) || 0);
  } catch (err) {
    // ประกาศเด้งไม่ใช่งานหลัก ถ้าดึงไม่ได้ให้เข้าเว็บต่อได้ตามปกติ
    console.warn('แสดงประกาศไม่สำเร็จ:', err.message);
  }
}


/**
 * ดูตัวอย่างประกาศทีละรายการจากหน้าจัดการข้อมูล
 * แสดงเสมอแม้ยังไม่ถึงวันแสดง หมดช่วงแล้ว หรือปิดใช้งานอยู่ พร้อมบอกว่าตอนนี้จะเด้งจริงไหม
 */
export async function previewAnnouncement(item) {
  if (!item) return;
  let cfg = {};
  try { cfg = await settings(); } catch (e) { /* ใช้ค่าเริ่มต้น */ }

  const why = [];
  if (item.IsActive === false) why.push('ปิดใช้งานอยู่');
  const today = day(new Date());
  const from = day(item.StartDate);
  const to = day(item.EndDate);
  if (from && today < from) why.push(`ยังไม่ถึงวันเริ่มแสดง (${thaiDateShort(item.StartDate)})`);
  if (to && today > to) why.push(`หมดช่วงแสดงแล้ว (${thaiDateShort(item.EndDate)})`);

  previewNote = why.length
    ? `ตัวอย่าง · ประกาศนี้ยังไม่ขึ้น Popup บนหน้าแรกตอนนี้ เพราะ${why.join(' และ ')}`
    : 'ตัวอย่าง · ประกาศนี้กำลังขึ้น Popup บนหน้าแรกอยู่';
  stop();
  items = [item];
  index = 0;
  draw(Number(cfg.PopupInterval ?? 5) || 0);
}
