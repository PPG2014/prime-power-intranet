/**
 * การ์ดบุคลากรแบบลอย — ชี้เมาส์ที่ชื่อ (หรือคลิก/แตะบนมือถือ) แล้วแสดงรูป ชื่อ ตำแหน่ง ฝ่าย อีเมล เบอร์ต่อ
 *
 * ใช้: วางชื่อด้วย personRef(ชื่อ) หรือ personRefs("ชื่อ1, ชื่อ2") แล้วเรียก bindPersonCards() ครั้งเดียว
 * จับคู่ชื่อกับทะเบียนบุคลากรจาก ชื่อไทย / ชื่ออังกฤษ / อีเมล · ไม่พบในทะเบียน → แสดงเป็นข้อความธรรมดา
 */
import { esc } from '../core/dom.js';
import { list } from '../services/data.js';
import { hydratePhotos } from '../services/photos.js';

let people = null;
let loading = null;
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
function loadPeople() {
  if (people) return Promise.resolve(people);
  if (!loading) loading = list('directory').then((rows) => { people = rows || []; return people; }).catch(() => { loading = null; return []; });
  return loading;
}
const find = (name) => {
  const k = norm(name);
  return (people || []).find((p) => [p.Title, p.NameEN, p.Email].some((x) => norm(x) === k)) || null;
};

/** ชื่อที่ชี้/คลิกแล้วเปิดการ์ดได้ */
export const personRef = (name) => {
  const n = String(name || '').trim();
  return n ? `<span class="pref" data-pref="${esc(n)}" tabindex="0">${esc(n)}</span>` : '';
};
/** หลายชื่อคั่นด้วยจุลภาค (เช่น "ผู้อนุมัติทุกคนในลำดับนี้") */
export const personRefs = (names) => String(names || '').split(/\s*,\s*/).filter(Boolean).map(personRef).join(', ');

function cardHtml(p) {
  return `<div class="pcard-in">
    <div class="pcard-photo">${p.PhotoUrl ? `<img data-photo="${esc(p.PhotoUrl)}" alt="${esc(p.Title)}">` : `<span>${esc(String(p.Title || '').slice(0, 2))}</span>`}</div>
    <div class="pcard-info">
      <div class="pcard-name">${esc(p.Title)}${p.Nickname ? ` <em>(${esc(p.Nickname)})</em>` : ''}</div>
      ${p.NameEN ? `<div class="pcard-en">${esc(p.NameEN)}</div>` : ''}
      ${p.Position ? `<div class="pcard-pos">${esc(p.Position)}</div>` : ''}
      ${p.Department || p.Section ? `<div class="pcard-dept">${esc([p.Department, p.Section].filter(Boolean).join(' · '))}</div>` : ''}
      ${p.Email ? `<a class="pcard-mail" href="mailto:${esc(p.Email)}">✉ ${esc(p.Email)}</a>` : ''}
      <div class="pcard-ext">โทรภายใน <b>${p.Extension ? esc(p.Extension) : '—'}</b></div>
    </div>
  </div>`;
}

let box = null;
let anchor = null;
let pinned = false;
let showT = null;
let hideT = null;

function place(el) {
  const r = el.getBoundingClientRect();
  const w = box.offsetWidth; const h = box.offsetHeight;
  let left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);   // ไม่พอด้านล่าง → แสดงด้านบน
  box.style.left = `${left}px`; box.style.top = `${top}px`;
}
function hide() {
  clearTimeout(showT); clearTimeout(hideT);
  if (box) box.hidden = true;
  anchor = null; pinned = false;
}
async function show(el, pin = false) {
  await loadPeople();
  const p = find(el.dataset.pref);
  if (!p) { el.classList.add('pref-none'); return; }   // ไม่อยู่ในทะเบียน → ไม่มีการ์ด
  if (!box) {
    box = document.createElement('div');
    box.className = 'pcard'; box.setAttribute('role', 'dialog'); box.hidden = true;
    box.addEventListener('mouseenter', () => clearTimeout(hideT));
    box.addEventListener('mouseleave', () => { if (!pinned) hideT = setTimeout(hide, 200); });
    document.body.appendChild(box);
  }
  anchor = el; pinned = pin;
  box.innerHTML = cardHtml(p);
  box.hidden = false;
  place(el);
  hydratePhotos(box);
}

let bound = false;
/** ผูกครั้งเดียวทั้งหน้า (ใช้ event delegation จึงใช้ได้กับชื่อที่วาดภายหลัง เช่นใน modal) */
export function bindPersonCards() {
  if (bound) return;
  bound = true;
  loadPeople();
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.pref');
    if (!el || pinned) return;
    clearTimeout(hideT); clearTimeout(showT);
    showT = setTimeout(() => show(el), 250);
  });
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest && e.target.closest('.pref');
    if (!el || pinned) return;
    clearTimeout(showT);
    hideT = setTimeout(hide, 250);
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.pref');
    if (el) {
      e.preventDefault(); e.stopPropagation();
      clearTimeout(showT); clearTimeout(hideT);   // กันตัวจับเวลาจากการชี้เมาส์มาเปลี่ยนการ์ดที่ปักไว้
      if (anchor === el && pinned) hide(); else show(el, true);   // คลิก/แตะ = ปักการ์ดไว้ · คลิกซ้ำ = ปิด
      return;
    }
    if (box && !box.hidden && !box.contains(e.target)) hide();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && box && !box.hidden) { e.stopPropagation(); hide(); }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('pref')) show(e.target, true);
  }, true);
  addEventListener('scroll', () => { if (box && !box.hidden) hide(); }, true);
}
