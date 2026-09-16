import { state, subscribe } from './state.js';
import { pages, pageByRoute } from '../pages/index.js';
import { $, esc } from './dom.js';
import { CONFIG } from './config.js';

function renderNav() {
  $('#nav').innerHTML = pages
    .filter((p) => p.meta.nav && (!p.meta.adminOnly || state.isAdmin))
    .sort((a, b) => a.meta.order - b.meta.order)
    .map((p) => `<a href="#/${p.meta.route}"
        ${state.route === p.meta.route ? 'aria-current="page"' : ''}>${esc(p.meta.title)}</a>`)
    .join('');
}

export async function render() {
  const page = pageByRoute(state.route) || pageByRoute('home');
  const ctx = { state, config: CONFIG };

  // จำช่องค้นหาที่กำลังพิมพ์อยู่ เพื่อคืนโฟกัสและตำแหน่งเคอร์เซอร์หลังวาดใหม่
  const act = document.activeElement;
  const keepId = act && act.matches && act.matches('input[data-keepfocus]') ? act.id : null;
  const caret = keepId ? act.selectionStart : null;

  renderNav();
  $('#app').innerHTML = await page.render(ctx);
  page.mount?.(ctx);

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
