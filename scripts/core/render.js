import { state, subscribe } from './state.js';
import { pages, pageByRoute } from '../pages/index.js';
import { $, esc } from './dom.js';
import { CONFIG } from './config.js';
import { startReadTracking } from '../services/data.js';

/** ตัวเลขเตือนบนเมนู (นับใน services/badges.js) */
const NAV_BADGE = { requests: 'requests', appraisal: 'appraisal' };
function badgeOf(route) {
  const n = (state.navBadges || {})[NAV_BADGE[route]] || 0;
  return n ? `<span class="nav-badge" aria-label="${n} รายการรอดำเนินการ">${n > 99 ? '99+' : n}</span>` : '';
}

export function renderNav() {
  $('#nav').innerHTML = pages
    .filter((p) => p.meta.nav && (!p.meta.adminOnly || state.isAdmin || (p.meta.hrAllowed && state.isHR)))
    .sort((a, b) => a.meta.order - b.meta.order)
    .map((p) => `<a href="#/${p.meta.route}"
        ${state.route === p.meta.route ? 'aria-current="page"' : ''}>${esc(p.meta.title)}${badgeOf(p.meta.route)}</a>`)
    .join('');
  // ตอนเมนูพับเป็นปุ่ม ☰ ให้ปุ่มแสดงยอดรวมแทน
  const nb = state.navBadges || {};
  const total = (nb.requests || 0) + (nb.appraisal || 0);
  const burger = document.getElementById('burger');
  if (burger) burger.innerHTML = `☰ เมนู${total ? `<span class="nav-badge">${total > 99 ? '99+' : total}</span>` : ''}`;
  fitNav();
}

/** เมนูยาวเกินหัวเว็บ (จำนวนเมนูต่างกันตามสิทธิ์) → สลับเป็นปุ่ม ☰ ดู header.css */
function fitNav() {
  const head = document.querySelector('header');
  const wrap = head && head.querySelector('.wrap');
  if (!wrap) return;
  head.classList.remove('nav-compact');
  if (wrap.scrollWidth > wrap.clientWidth + 1) head.classList.add('nav-compact');
}
addEventListener('resize', () => requestAnimationFrame(fitNav));

/** แถบความคืบหน้าบาง ๆ ด้านบน บอกว่ากำลังโหลดข้อมูลอยู่ */
function busy(on) {
  let bar = document.getElementById('loadbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'loadbar';
    document.body.appendChild(bar);
  }
  bar.classList.toggle('on', !!on);
}

let renderSeq = 0;
let dirty = false;        // ผู้ใช้พิมพ์/เลือกค่าในหน้าแล้ว → ห้ามวาดใหม่เองเบื้องหลัง (ค่าที่กรอกจะหาย)
let pageReads = new Set();

/** หน้าที่วาดใหม่เองได้เมื่อข้อมูลเบื้องหลังเปลี่ยน (หน้ากรอกข้อมูล/แอดมิน/ประเมิน ไม่วาดเอง) */
const AUTO_REFRESH = new Set(['home', 'policies', 'forms', 'requests', 'rooms', 'documents', 'directory', 'reports', 'contact', 'projects']);

/** โครงหน้าชั่วคราว ขึ้นทันทีที่กดเมนู ระหว่างรอข้อมูลครั้งแรก */
const skeleton = (title) => `<section class="page page-skel" aria-busy="true"><div class="wrap">
  <h1 class="page-title">${esc(title)}</h1>
  <div class="skel-line w40"></div><div class="skel-card"></div><div class="skel-card"></div><div class="skel-card short"></div>
</div></section>`;

export async function render({ quiet = false } = {}) {
  const page = pageByRoute(state.route) || pageByRoute('home');
  const ctx = { state, config: CONFIG };
  const seq = ++renderSeq;
  const sameRoute = $('#app').dataset.route === page.meta.route;

  // จำช่องค้นหาที่กำลังพิมพ์อยู่ เพื่อคืนโฟกัสและตำแหน่งเคอร์เซอร์หลังวาดใหม่
  const act = document.activeElement;
  const keepId = act && act.matches && act.matches('input[data-keepfocus]') ? act.id : null;
  const caret = keepId ? act.selectionStart : null;

  // เปลี่ยนแถบเมนูทันทีที่กด แล้วค่อยรอข้อมูล จะได้ไม่รู้สึกว่าไม่ตอบสนอง
  if (!quiet) renderNav();
  document.body.classList.remove('rb-open');   // ออกจากหน้าประเมิน แผงเกณฑ์ต้องไม่ดันหน้าอื่นค้าง
  if (!quiet) busy(true);
  const scrollY = window.scrollY;
  // ข้อมูลยังไม่มาใน 120ms (โหลดครั้งแรก) → ขึ้นโครงหน้าใหม่ทันที ไม่ค้างอยู่หน้าเดิม
  const skelTimer = !quiet && !sameRoute ? setTimeout(() => {
    if (seq === renderSeq) { $('#app').innerHTML = skeleton(page.meta.title); $('#app').dataset.route = ''; }
  }, 120) : null;
  let html;
  try {
    const reads = startReadTracking();
    html = await page.render(ctx);
    if (seq !== renderSeq) return;               // กดเมนูอื่นไปแล้ว ผลของหน้านี้ทิ้งได้
    pageReads = reads;
    $('#app').innerHTML = html;
    $('#app').dataset.route = page.meta.route;
    dirty = false;
    page.mount?.(ctx);
  } finally {
    clearTimeout(skelTimer);
    if (seq === renderSeq) busy(false);
  }
  if (quiet) window.scrollTo(0, scrollY);
  else {
    // นับตัวเลขเตือนบนเมนูใหม่หลังเปลี่ยนหน้า/ทำรายการ (ทำเบื้องหลัง ไม่ขวางหน้า)
    import('../services/badges.js').then((m) => m.refreshBadges()).catch(() => {});
    document.title =
      (page.meta.route === 'home' ? '' : page.meta.title + ' — ') + CONFIG.appName;
  }

  if (keepId) {
    const again = document.getElementById(keepId);
    if (again) {
      again.focus({ preventScroll: true });
      try { again.setSelectionRange(caret, caret); } catch (e) { /* ช่องบางชนิดตั้งเคอร์เซอร์ไม่ได้ */ }
    } else {
      $('#app').focus({ preventScroll: true });
    }
  } else if (!quiet) {
    $('#app').focus({ preventScroll: true });
  }
}

export function startRendering() {
  subscribe(() => render());
  // ผู้ใช้กรอก/เลือกค่าในหน้า (ไม่นับช่องค้นหาที่จำค่าใน state) → หน้านี้ไม่วาดใหม่เอง
  const mark = (e) => { if (!e.target.closest('input[data-keepfocus]')) dirty = true; };
  $('#app').addEventListener('input', mark);
  $('#app').addEventListener('change', mark);
  // ข้อมูลที่หน้านี้ใช้ถูกอัปเดตเบื้องหลัง → วาดใหม่เงียบ ๆ ถ้าไม่รบกวนผู้ใช้
  let t;
  addEventListener('data:updated', (e) => {
    if (!pageReads.has(e.detail.name)) return;
    clearTimeout(t);
    t = setTimeout(() => {
      const busyUser = dirty || document.querySelector('#overlay-root')?.children.length
        || !AUTO_REFRESH.has(state.route || 'home') || document.hidden;
      if (!busyUser) render({ quiet: true });
    }, 300);
  });
}
