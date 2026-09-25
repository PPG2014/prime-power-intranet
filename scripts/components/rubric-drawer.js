/**
 * แถบเกณฑ์การให้คะแนน ซ่อนอยู่ที่ขอบซ้ายของจอ
 *   กดแถบ → เลื่อนออกมา
 *   เอาเมาส์ออกจากแถบ / กด ✕ / กด Esc → พับเก็บ
 * วางไว้ในหน้า (ไม่ใช่ในหน้าต่างลอย) แต่ลอยเหนือหน้าต่างประเมิน เปิดดูระหว่างให้คะแนนได้
 */
import { esc, $, $$ } from '../core/dom.js';

const LEAVE_DELAY = 350;    // มิลลิวินาที กันพับทันทีตอนเมาส์เฉียดขอบ

export function rubricDrawer(rubric, title = 'เกณฑ์การให้คะแนน') {
  return `
  <aside class="rb-drawer" id="rb-drawer" aria-label="${esc(title)}">
    <button type="button" class="rb-tab" id="rb-tab" aria-expanded="false" aria-controls="rb-panel">
      📋 เกณฑ์การให้คะแนน</button>
    <div class="rb-panel" id="rb-panel">
      <div class="rb-head">${esc(title)}
        <button type="button" class="rb-x" id="rb-x" aria-label="ปิด">✕</button></div>
      <div class="rb-jump">${rubric.map((t) =>
        `<button type="button" data-rbgo="${t.no}">${t.no}</button>`).join('')}</div>
      <div class="rb-body" id="rb-body">
        ${rubric.map((t) => `<section class="rb-topic" id="rb-t${t.no}">
          <h4>${t.no}. ${esc(t.title)}</h4>
          <table>${t.levels.map((txt, i) => `<tr>
            <th>${10 - i}</th><td>${esc(txt)}</td></tr>`).join('')}</table>
        </section>`).join('')}
      </div>
    </div>
  </aside>`;
}

export function bindRubricDrawer() {
  const box = $('#rb-drawer');
  if (!box) return;
  const tab = $('#rb-tab');
  let timer = 0;

  const open = (on) => {
    clearTimeout(timer);
    box.classList.toggle('open', on);
    tab.setAttribute('aria-expanded', String(on));
  };

  tab.onclick = () => open(!box.classList.contains('open'));
  $('#rb-x').onclick = () => open(false);
  box.addEventListener('mouseleave', () => {
    if (!box.classList.contains('open')) return;
    timer = setTimeout(() => open(false), LEAVE_DELAY);
  });
  box.addEventListener('mouseenter', () => clearTimeout(timer));

  // ปิดด้วย Esc — ผูกครั้งเดียว เพราะหน้าวาดใหม่บ่อย
  if (!window.__rbEsc) {
    window.__rbEsc = true;
    addEventListener('keydown', (e) => {
      const d = $('#rb-drawer');
      if (e.key === 'Escape' && d && d.classList.contains('open')) {
        d.classList.remove('open');
        e.stopPropagation();
      }
    }, true);
  }

  $$('[data-rbgo]', box).forEach((b) => {
    b.onclick = () => {
      const t = $('#rb-t' + b.dataset.rbgo);
      if (t) $('#rb-body').scrollTo({ top: t.offsetTop, behavior: 'smooth' });
    };
  });
}
