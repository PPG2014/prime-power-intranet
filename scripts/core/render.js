import { state, subscribe } from './state.js';
import { pages, pageByRoute } from '../pages/index.js';
import { $, esc } from './dom.js';
import { CONFIG } from './config.js';

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

export async function render() {
  const page = pageByRoute(state.route) || pageByRoute('home');
  const ctx = { state, config: CONFIG };

  // จำช่องค้นหาที่กำลังพิมพ์อยู่ เพื่อคืนโฟกัสและตำแหน่งเคอร์เซอร์หลังวาดใหม่
  const act = document.activeElement;
  const keepId = act && act.matches && act.matches('input[data-keepfocus]') ? act.id : null;
  const caret = keepId ? act.selectionStart : null;

  // เปลี่ยนแถบเมนูทันทีที่กด แล้วค่อยรอข้อมูล จะได้ไม่รู้สึกว่าไม่ตอบสนอง
  renderNav();
  document.body.classList.remove('rb-open');   // ออกจากหน้าประเมิน แผงเกณฑ์ต้องไม่ดันหน้าอื่นค้าง
  busy(true);
  try {
    $('#app').innerHTML = await page.render(ctx);
    page.mount?.(ctx);
  } finally {
    busy(false);
  }
  // นับตัวเลขเตือนบนเมนูใหม่หลังเปลี่ยนหน้า/ทำรายการ (ทำเบื้องหลัง ไม่ขวางหน้า)
  import('../services/badges.js').then((m) => m.refreshBadges()).catch(() => {});

  document.title =
    (page.meta.route === 'home' ? '' : page.meta.title + ' — ') + CONFIG.appName;

  if (keepId) {
    const again = document.getElementById(keepId);
    if (again) {
      again.focus({ preventScroll: true });
      try { again.setSelectionRange(caret, caret); } catch (e) { /* ช่องบางชนิดตั้งเคอร์เซอร์ไม่ได้ */ }
    } else {
      $('#app').focus({ preventScroll: true });
    }
  } else {
    $('#app').focus({ preventScroll: true });
  }
}

export function startRendering() {
  subscribe(render);
}
