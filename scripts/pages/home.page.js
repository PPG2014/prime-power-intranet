import { esc, $, onClick } from '../core/dom.js';
import { list, listRecent, RECENT_REQUESTS } from '../services/data.js';
import { thaiDateShort } from '../utils/format.js';
import { openModal } from '../components/modal.js';
import { toFiles } from '../admin/entity-form.js';
import { renderDashboard, mountDashboard } from './projects.page.js';
import { attachedFiles } from '../components/form-renderer.js';
import { companySocial } from '../components/company-social.js';
import { codeOf, stTone, DEAD } from '../services/booking.js';
import { localDay } from '../services/car.js';
import { equipment, eqCode, holderOf, EQ_READY, EQ_INUSE, LOAN_CODE, MOVE_CODE } from '../services/equipment.js';
import { personRef, bindPersonCards } from '../components/person-card.js';

export const meta = { route: 'home', title: 'หน้าแรก', nav: true, order: 1, adminOnly: false };

let newsRows = [];

/** ป้ายข่าว: NEW วิบวับ (อัตโนมัติ 7 วันแรกนับจากวันที่ประกาศ หรือเลือกป้าย "ใหม่") · สำคัญ / ด่วน เลือกในหน้าจัดการข้อมูล */
const NEW_DAYS = 7;
const NEW_BADGE = '<b class="news-new" aria-label="ข่าวใหม่"><i>NEW</i></b>';
const badgeOf = (n) => String((n && n.Badge) || '').trim();
function isNewNews(n) {
  if (badgeOf(n) === 'ใหม่') return true;
  const d = n && n.PublishDate ? new Date(n.PublishDate) : null;
  if (!d || isNaN(d)) return false;
  const age = (Date.now() - d.getTime()) / 86400000;
  return age >= -1 && age <= NEW_DAYS;
}
const newsTag = (n) => (badgeOf(n) === 'ด่วน' ? '<b class="news-tag urgent">ด่วน</b> '
  : badgeOf(n) === 'สำคัญ' ? '<b class="news-tag important">สำคัญ</b> ' : '');
let msgCodeList = [];   // รหัสฟอร์มจองคิว Messenger ทุกตัว ใช้เปิดปฏิทินคิวทั้งหมด

/* ───── กล่องเครื่องมือและอุปกรณ์ (ทุกคนเห็น) — ของอยู่ที่ใคร โครงการไหน ไว้ตรวจก่อนขอยืมต่อ ───── */
let eqRows = null;                  // null = ยังไม่มีรายการ Equipment ใน SharePoint → ไม่แสดงกล่อง
const eqF = { q: '', g: '' };
const EQ_GONE = /จำหน่าย|ตัดออก/;
const eqClean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
/** กลุ่มสถานะ: ok ว่าง พร้อมยืม · use กำลังใช้งาน · fix ซ่อม / Calibration / เสีย */
const eqGroup = (e) => {
  const s = eqClean(e.Status);
  if (s === EQ_READY) return 'ok';
  if (s === EQ_INUSE) return 'use';
  return /ซ่อม|calib|เสีย/i.test(s) ? 'fix' : 'other';
};
const EQ_ORDER = { ok: 0, use: 1, fix: 2, other: 3 };
const eqStText = (e) => (eqGroup(e) === 'ok' ? 'ว่าง พร้อมยืม' : eqClean(e.Status) || 'ไม่ระบุสถานะ');
const eqName = (e) => [e.ItemName, e.Brand, e.Model].map(eqClean).filter(Boolean).join(' ') || eqCode(e);

function eqItems() {
  const q = eqClean(eqF.q).toLowerCase();
  return (eqRows || []).filter((e) => {
    if (eqF.g && eqGroup(e) !== eqF.g) return false;
    if (q && !q.split(' ').every((w) => [eqCode(e), e.ItemName, e.Brand, e.Model, e.SerialNo, holderOf(e), e.Project]
      .some((v) => eqClean(v).toLowerCase().includes(w)))) return false;
    return true;
  });
}

function eqListHtml() {
  const items = eqItems();
  if (!items.length) return `<div class="side-empty">${eqF.q || eqF.g ? 'ไม่พบเครื่องมือที่ตรงกับที่ค้นหา' : 'ยังไม่มีเครื่องมือในทะเบียน'}</div>`;
  return `<ul class="side-list eqs-list">${items.map((e) => {
    const g = eqGroup(e); const who = holderOf(e); const where = eqClean(e.Project);
    return `<li><div class="eqs-item" role="link" tabindex="0" data-eqgo="${esc(eqCode(e))}" title="เปิดในทะเบียนเครื่องมือ">
      <div class="eqs-top"><b>${esc(eqName(e))}</b><span class="eqs-code">${esc(eqCode(e))}</span></div>
      <div class="eqs-where"><span class="eqs-st ${g}">${esc(eqStText(e))}</span>
        ${who ? `<span>👤 ${personRef(who)}</span>` : ''}${where ? `<span>📍 ${esc(where)}</span>` : ''}</div>
    </div></li>`;
  }).join('')}</ul>`;
}

function eqPanel(forms) {
  if (!eqRows) return '';
  const n = (g) => eqRows.filter((e) => eqGroup(e) === g).length;
  const hasForm = (code) => forms.some((x) => eqClean(x.FormCode).toUpperCase() === code && x.IsActive !== false);
  const stat = (g, label) => `<button type="button" class="${g}${eqF.g === g ? ' on' : ''}" data-eqg="${g}" title="กดเพื่อกรอง · กดซ้ำเพื่อดูทั้งหมด"><b>${n(g)}</b><span>${label}</span></button>`;
  const btns = [hasForm(LOAN_CODE) ? `<a class="btn btn-primary" href="#/form/${LOAN_CODE}">📝 ขอยืมอุปกรณ์</a>` : '',
    hasForm(MOVE_CODE) ? `<a class="btn-mini" href="#/form/${MOVE_CODE}">🚚 โอนย้าย</a>` : ''].filter(Boolean);
  return `<div class="panel side-panel eqs">
    <div class="panel-head">🧰 เครื่องมือและอุปกรณ์
      <a class="panel-link" href="#/equipment">ทะเบียนทั้งหมด →</a></div>
    <div class="eqs-stats">${stat('ok', 'ว่าง พร้อมยืม')}${stat('use', 'กำลังใช้งาน')}${stat('fix', 'ซ่อม / Cal')}</div>
    <div class="eqs-q"><input type="search" id="eqs-q" placeholder="🔍 ค้นหา ชื่อเครื่องมือ · รหัส · ผู้ถือ · โครงการ" value="${esc(eqF.q)}" aria-label="ค้นหาเครื่องมือ"></div>
    <div id="eqs-body">${eqListHtml()}</div>
    ${btns.length ? `<div class="eqs-foot">${btns.join('')}</div>` : ''}
  </div>`;
}

function mountEqPanel() {
  const box = $('.eqs');
  if (!box) return;
  bindPersonCards();
  const body = box.querySelector('#eqs-body');
  const redraw = () => { body.innerHTML = eqListHtml(); };
  const q = box.querySelector('#eqs-q');
  let t;
  q.oninput = () => { clearTimeout(t); t = setTimeout(() => { eqF.q = q.value.trim(); redraw(); }, 200); };
  box.querySelectorAll('[data-eqg]').forEach((b) => {
    b.onclick = () => {
      eqF.g = eqF.g === b.dataset.eqg ? '' : b.dataset.eqg;
      box.querySelectorAll('[data-eqg]').forEach((x) => x.classList.toggle('on', x.dataset.eqg === eqF.g));
      redraw();
    };
  });
  // กดรายการ → ทะเบียนเครื่องมือ ค้นหาตัวนั้นให้เลย (กดที่ชื่อผู้ถือ = เปิดการ์ดบุคลากร ไม่ไปหน้าอื่น)
  const go = (e) => {
    const it = e.target.closest('[data-eqgo]');
    if (!it || e.target.closest('.pref')) return;
    location.hash = `#/equipment?q=${encodeURIComponent(it.dataset.eqgo)}`;
  };
  body.addEventListener('click', go);
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
}

export async function render(ctx) {
  const [forms, news, docs, requests, dashboard, eqAll] = await Promise.all([
    list('formCatalog'), list('news'), list('documents'),
    listRecent('requests', RECENT_REQUESTS).catch(() => []), renderDashboard(),
    equipment().catch(() => null),
  ]);
  // เครื่องมือที่ยังใช้งาน (ไม่รวมที่จำหน่าย/ตัดออก) · ว่างพร้อมยืมขึ้นก่อน → กำลังใช้งาน → ซ่อม/Cal
  eqRows = eqAll && eqAll.filter((e) => e.IsActive !== false && !EQ_GONE.test(eqClean(e.Status)))
    .sort((a, b) => (EQ_ORDER[eqGroup(a)] - EQ_ORDER[eqGroup(b)]) || eqName(a).localeCompare(eqName(b), 'th'));

  // คำขอจองคิว Messenger ของวันนี้ ดึงวันที่ที่ขอใช้จากคำตอบในฟอร์ม
  const today = localDay(new Date().toISOString());   // วันที่ตามเวลาไทย
  // หารหัสฟอร์มจองคิว Messenger จากทะเบียนแบบฟอร์มเอง เผื่อรหัส ISO เปลี่ยน
  const msgCodes = new Set(forms
    .filter((f) => /messenger|จองคิว/i.test(`${f.Title} ${f.Description || ''}`))
    .map((f) => String(f.FormCode || '').trim()));
  ['FM-ADM-006', 'FM-HR-003'].forEach((c) => msgCodes.add(c));
  msgCodeList = [...msgCodes].filter(Boolean);

  // แสดงคิวของวันนี้ทุกคำขอ ไม่ว่าใครเป็นคนจอง พร้อมสถานะล่าสุด ยกเว้นใบที่ยกเลิก/ไม่อนุมัติ
  const messengerToday = requests
    .filter((r) => msgCodes.has(codeOf(r)) && !DEAD.includes(String(r.Status || '').trim()))
    .map((r) => { try { return { r, d: JSON.parse(r.FormData || '{}') }; } catch (e) { return null; } })
    .filter((x) => x && localDay(x.d.service_date) === today)
    // เติม 0 หน้าเวลาก่อนเทียบ ไม่งั้น "10:00" จะมาก่อน "9:00"
    .sort((a, b) => String(a.d.time_from || a.d.time_slot || '').padStart(5, '0')
      .localeCompare(String(b.d.time_from || b.d.time_slot || '').padStart(5, '0')));

  newsRows = news.filter((n) => n.IsActive !== false);

  const popular = forms
    .filter((f) => f.IsActive !== false && (f.Badge === 'ใช้บ่อย' || f.Badge === 'ใหม่'))
    .slice(0, 6);
  // ปักหมุดขึ้นก่อน → ลำดับที่จัดไว้ในหน้าจัดการข้อมูล (SortOrder) → วันที่ล่าสุด (ข่าวที่ยังไม่ได้จัดลำดับอยู่บนสุดของกลุ่ม)
  const newsTime = (n) => { const d = new Date(n.PublishDate); return isNaN(d) ? 0 : d.getTime(); };
  const pinned = [...newsRows]
    .sort((a, b) => ((b.IsPinned ? 1 : 0) - (a.IsPinned ? 1 : 0))
      || ((+a.SortOrder || 0) - (+b.SortOrder || 0))
      || (newsTime(b) - newsTime(a)) || ((+b.id || 0) - (+a.id || 0)))
    .slice(0, 6);
  const manuals = docs.filter((d) => d.DocType === 'คู่มือ' && d.IsActive !== false).slice(0, 5);

  return `
  <section class="page page-home">
    <div class="wrap">
      <div class="home-layout">

        <main class="home-main">
          <h1 class="page-title">ความคืบหน้าโครงการ</h1>
          <p class="page-lead">ภาพรวมของทุกโครงการ เทียบแผนกับผลจริงและยอดเบิกจ่าย</p>
          ${dashboard}
        </main>

        <aside class="home-side">
          <div class="panel side-panel">
            <div class="panel-head">📋 แบบฟอร์มที่ใช้บ่อย
              <a class="panel-link" href="#/forms">ทั้งหมด →</a></div>
            ${popular.length ? `<ul class="side-list">
              ${popular.map((f) => `<li>
                ${f.ExternalUrl
                  ? `<a href="${esc(f.ExternalUrl)}" target="_blank" rel="noopener">
                      <span class="si">${f.Icon || '📄'}</span>
                      <span class="st">${esc(f.Title)}</span><span class="sx">↗</span></a>`
                  : `<a href="${f.FormCode ? `#/form/${esc(String(f.FormCode).trim())}` : '#/forms'}"><span class="si">${f.Icon || '📄'}</span>
                      <span class="st">${esc(f.Title)}</span></a>`}
              </li>`).join('')}</ul>`
              : '<div class="side-empty">ยังไม่มีแบบฟอร์มที่ติดป้ายใช้บ่อย</div>'}
          </div>

          ${eqPanel(forms)}

          <div class="panel side-panel">
            <div class="panel-head">📢 ข่าวประกาศ</div>
            ${pinned.length ? `<ul class="side-list">
              ${pinned.map((n) => `<li>
                <button data-news="${n.id}">
                  <span class="st">${n.IsPinned ? '<b class="pin">ปักหมุด</b> ' : ''}${newsTag(n)}${esc(n.Title)}</span>
                  <span class="news-when"><time>${esc(thaiDateShort(n.PublishDate))}</time>${isNewNews(n) ? NEW_BADGE : ''}</span>
                </button></li>`).join('')}</ul>`
              : '<div class="side-empty">ยังไม่มีข่าวประกาศ</div>'}
          </div>

          <div class="panel side-panel">
            <div class="panel-head">📚 คู่มือการใช้งาน
              <a class="panel-link" href="#/documents">ทั้งหมด →</a></div>
            <ul class="side-list">
              <li><a href="manual/" target="_blank" rel="noopener"><span class="si">📘</span>
                <span class="st"><b>คู่มือการใช้งานระบบ Intranet</b> (ฉบับเต็ม · อบรมพนักงานใหม่)</span><span class="sx">↗</span></a></li>
              ${manuals.map((d) => `<li>
                <a href="#/documents"><span class="si">${d.Icon || '📘'}</span>
                  <span class="st">${esc(d.Title)}</span></a></li>`).join('')}</ul>
          </div>
          <div class="panel side-panel">
            <div class="panel-head">🏍 จองคิว Messenger วันนี้
              <button type="button" class="panel-link" data-msgall="1">ดูทั้งหมด →</button></div>
            ${messengerToday.length ? `<ul class="side-list msg-list">
              ${messengerToday.map(({ r, d }) => `<li>
                <div class="msg-row">
                  <span class="msg-time">${esc(d.time_from ? `${d.time_from}–${d.time_to || ''}` : (d.time_slot || ''))}</span>
                  <span class="st">${esc(d.place || d.job_detail || 'ไม่ระบุสถานที่')}</span>
                </div>
                <div class="msg-by">${esc(d.requester || r.RequesterName || '')}${
                  r.Status ? ` <span class="msg-st ${stTone(String(r.Status).trim())}">${esc(r.Status)}</span>` : ''}</div>
              </li>`).join('')}</ul>`
              : '<div class="side-empty">วันนี้ยังไม่มีการจองคิว</div>'}
          </div>

          ${companySocial({ compact: true })}

        </aside>

      </div>
    </div>
  </section>`;
}

/**
 * แถบข้างขวาติดจอตอนเลื่อน (sticky) แต่ถ้าสูงกว่าจอ ส่วนล่าง (เช่นกล่องติดต่อบริษัท)
 * จะไม่โผล่จนกว่าจะเลื่อนหน้าจนสุด — จึงตั้งจุดติดให้เป็น "ขอบล่างชนขอบจอ" แทน
 * แถบจะเลื่อนตามหน้าไปจนเห็นกล่องสุดท้าย แล้วค่อยติดอยู่ตรงนั้น
 */
const SIDE_TOP = 82;      // ตรงกับ top ใน home.css (ใต้หัวเว็บ)
function fitSidebar() {
  const side = $('.home-side');
  if (!side) return;
  const fit = () => {
    if (!document.body.contains(side)) { removeEventListener('resize', fit); ro.disconnect(); return; }
    const room = innerHeight - SIDE_TOP - 16;
    side.style.top = side.offsetHeight > room
      ? `${innerHeight - side.offsetHeight - 16}px` : `${SIDE_TOP}px`;
  };
  const ro = new ResizeObserver(fit);   // กล่องข้างในโหลดข้อมูลเสร็จแล้วสูงขึ้น ต้องคำนวณใหม่
  ro.observe(side);
  addEventListener('resize', fit);
  fit();
}

export function mount(ctx) {
  mountDashboard();
  mountEqPanel();
  fitSidebar();

  // เดิมลิงก์ไป #/requests?form=… ซึ่งเราเตอร์ไม่รู้จัก เลยค้างอยู่หน้าแรก
  // และหน้าติดตามสถานะก็ไม่แสดงคำขอของคนอื่นอยู่แล้ว จึงเปิดปฏิทินคิวทั้งหมดแทน
  onClick('msgall', async () => {
    openModal({ title: '🏍 คิว Messenger ทั้งหมด', wide: true, dismissable: true,
      body: '<div id="queue-cal"></div>' });
    const { mountQueueCalendar } = await import('../components/queue-calendar.js');
    await mountQueueCalendar(msgCodeList, { fresh: false });
  });

  onClick('news', (id) => {
    const n = newsRows.find((r) => String(r.id) === String(id));
    if (!n) return;
    const files = toFiles(n.Files);
    // รูปภาพที่แนบ แสดงในหน้าต่างเลย (ย่อให้พอดีกรอบ ทั้งแนวตั้งและแนวนอน) · ไฟล์อื่นเป็นรายการให้เปิด
    const isImg = (a) => /^(JPG|JPEG|PNG|GIF|WEBP)$/i.test(a.kind || '')
      || /\.(jpe?g|png|gif|webp)$/i.test(a.name || '');
    const imgs = files.filter(isImg);
    const others = files.filter((a) => !isImg(a));
    openModal({
      title: n.Title, wide: true,
      body: `
        <div class="doc-meta"><span>${esc(thaiDateShort(n.PublishDate))}</span>${newsTag(n)}${isNewNews(n) ? NEW_BADGE : ''}</div>
        ${imgs.length ? `<div class="news-imgs">${imgs.map((a) => `
          <a class="news-img" href="${esc(a.url)}" target="_blank" rel="noopener" title="เปิดรูปขนาดเต็ม">
            <img data-photo="${esc(a.url)}" alt="${esc(a.name || n.Title)}" loading="lazy"></a>`).join('')}</div>` : ''}
        ${n.Content ? `<div class="doc-body">${esc(n.Content)}</div>`
                    : (imgs.length ? '' : '<div class="doc-empty">ยังไม่ได้ใส่เนื้อหาสำหรับข่าวนี้</div>')}
        ${others.length ? `<div class="doc-files"><h4>ไฟล์แนบ ${others.length} ไฟล์</h4>
          ${others.map((a) => `<a class="doc-file" href="${esc(a.url)}" target="_blank" rel="noopener">
            <span>📄</span>
            <b>${esc(a.name)}</b>
            <span class="doc-file-meta">${esc(a.kind)} · ${esc(a.sizeText || '')}</span>
          </a>`).join('')}</div>` : ''}`,
    });
    // รูปใน SharePoint ต้องแนบ token จึงโหลดได้
    if (imgs.length) import('../services/photos.js').then((m) => m.hydratePhotos(document.getElementById('overlay-root')));
  });
}
