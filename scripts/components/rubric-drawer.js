/**
 * แถบเกณฑ์การให้คะแนน ซ่อนอยู่ที่ขอบซ้ายของจอ
 *   เอาเมาส์ชี้ที่แถบ / กดแถบ → เลื่อนออกมา
 *   เอาเมาส์ออกจากแผง / กด ✕ / กด Esc → พับเก็บ
 * ลอยเหนือหน้าต่างประเมิน เปิดดูระหว่างให้คะแนนได้
 *
 * rubricDrawer(topics)   — เกณฑ์แบบประเมินผ่านงาน (หัวข้อละ 10 ระดับ)
 * drawerHtml({ … })      — แถบแบบกำหนดเนื้อหาเอง (ใช้กับ KPI ประจำปี)
 * id = ชื่อนำหน้า id ของแถบ ใช้แยกแถบในหน้ากับแถบในหน้าต่างประเมิน
 */
import { esc, $, $$ } from '../core/dom.js';

const LEAVE_DELAY = 350;    // มิลลิวินาที กันพับทันทีตอนเมาส์เฉียดขอบ
const HOVER_DELAY = 120;    // ชี้ค้างสั้น ๆ ก่อนเด้งออก กันเด้งตอนลากเมาส์ผ่าน

/** แถบเปล่า: jumps = [{ id, label }] ปุ่มลัดไปยังหัวข้อ · body = HTML ที่มี section id="<id>-t<jump.id>" */
export function drawerHtml({ id = 'rb', title, tab = '📋 เกณฑ์การให้คะแนน', jumps = [], body = '' }) {
  return `
  <aside class="rb-drawer" id="${id}-drawer" aria-label="${esc(title)}">
    <button type="button" class="rb-tab" id="${id}-tab" aria-expanded="false" aria-controls="${id}-panel">${esc(tab)}</button>
    <div class="rb-panel" id="${id}-panel">
      <div class="rb-head">${esc(title)}
        <button type="button" class="rb-x" id="${id}-x" aria-label="ปิด">✕</button></div>
      ${jumps.length ? `<div class="rb-jump">${jumps.map((j) =>
        `<button type="button" data-rbgo="${esc(String(j.id))}">${esc(String(j.label ?? j.id))}</button>`).join('')}</div>` : ''}
      <div class="rb-body" id="${id}-body">${body}</div>
    </div>
  </aside>`;
}

export function rubricDrawer(rubric, title = 'เกณฑ์การให้คะแนน', id = 'rb') {
  return drawerHtml({
    id, title,
    jumps: rubric.map((t) => ({ id: t.no, label: t.no })),
    body: rubric.map((t) => `<section class="rb-topic" id="${id}-t${t.no}">
          <h4>${t.no}. ${esc(t.title)}</h4>
          <table>${t.levels.map((txt, i) => `<tr>
            <th>${10 - i}</th><td>${esc(txt)}</td></tr>`).join('')}</table>
        </section>`).join(''),
  });
}

export function bindRubricDrawer(id = 'rb') {
  const box = $(`#${id}-drawer`);
  if (id === 'rb' || !box) document.body.classList.remove('rb-open');   // หน้าวาดใหม่ แผงเริ่มแบบพับเสมอ
  if (!box) return;
  const tab = $(`#${id}-tab`);
  let timer = 0;

  const open = (on) => {
    clearTimeout(timer);
    box.classList.toggle('open', on);
    // ให้หน้าต่างประเมินและเนื้อหาหน้าเลื่อนหลบแผง (ดู appraisal.css)
    document.body.classList.toggle('rb-open', on);
    tab.setAttribute('aria-expanded', String(on));
  };

  tab.onclick = () => open(!box.classList.contains('open'));
  $(`#${id}-x`).onclick = () => open(false);
  // เมาส์ชี้ที่แถบ → เด้งออก (จอสัมผัสใช้การกดแทน)
  tab.addEventListener('mouseenter', () => {
    if (box.classList.contains('open')) return;
    clearTimeout(timer);
    timer = setTimeout(() => open(true), HOVER_DELAY);
  });
  tab.addEventListener('mouseleave', () => { if (!box.classList.contains('open')) clearTimeout(timer); });
  box.addEventListener('mouseleave', () => {
    if (!box.classList.contains('open')) return;
    timer = setTimeout(() => open(false), LEAVE_DELAY);
  });
  box.addEventListener('mouseenter', () => { if (box.classList.contains('open')) clearTimeout(timer); });

  // ปิดด้วย Esc — ผูกครั้งเดียว เพราะหน้าวาดใหม่บ่อย · ปิดแผงที่เปิดอยู่ก่อนหน้าต่างประเมิน
  if (!window.__rbEsc) {
    window.__rbEsc = true;
    addEventListener('keydown', (e) => {
      const d = $('.rb-drawer.open');
      if (e.key === 'Escape' && d) {
        d.classList.remove('open');
        document.body.classList.remove('rb-open');
        e.stopPropagation();
      }
    }, true);
  }

  $$('[data-rbgo]', box).forEach((b) => {
    b.onclick = () => {
      const t = $(`#${id}-t${b.dataset.rbgo}`);
      if (t) $(`#${id}-body`).scrollTo({ top: t.offsetTop, behavior: 'smooth' });
    };
  });
}
