/**
 * กระดานคิววันนี้ (หน้าติดตามสถานะ) — สำหรับบัญชีพนักงานส่งเอกสาร / คนขับรถ
 *   1) คิว Messenger  2) การใช้รถยนต์บริษัทฯ ประจำสำนักงาน
 * แต่ละส่วน: รายละเอียดคิวของวัน (การ์ดใหญ่) + ปฏิทินทั้งเดือนแบบเห็นรายการในช่องวัน
 *
 * แสดงเฉพาะอีเมลที่อยู่ในตั้งค่าระบบ DispatchBoardEmails (คั่นด้วยจุลภาค)
 * ข้อมูลอ่านจากคำขอในระบบ ดึงใหม่ทุก 2 นาที (เปิดค้างไว้บนจอได้)
 */
import { esc, $, $$ } from '../core/dom.js';
import { list } from '../services/data.js';
import { stTone, DEAD } from '../services/booking.js';
import { carPlates } from '../services/car.js';
import { bookingsOf } from './queue-calendar.js';

export const BOARD_SETTING = 'DispatchBoardEmails';
const REFRESH_MS = 120000;
const TH_MONTH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_WEEKDAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const low = (v) => String(v || '').trim().toLowerCase();
const live = (b) => !DEAD.includes(b.status);
const hhmm = (t) => String(t || '').trim().padStart(5, '0');
const todayKey = () => new Date().toLocaleDateString('sv-SE');
const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const thaiDate = (k, withDow = true) => {
  const [y, m, d] = k.split('-').map(Number);
  const dow = TH_WEEKDAY[new Date(y, m - 1, d).getDay()];
  return `${withDow ? `วัน${dow}ที่ ` : ''}${d} ${TH_MONTH[m - 1]} ${y + 543}`;
};
const tone = (b) => (b.clash && live(b) ? 'clash' : stTone(b.status));
const timeText = (b) => (b.from === '00:00' && b.to === '24:00' ? 'ทั้งวัน'
  : `${b.from === '00:00' ? 'ต่อจากเมื่อวาน' : esc(b.from)}${b.to ? ` – ${b.to === '24:00' ? 'ข้ามวัน' : esc(b.to)}` : ''}`);

/** บัญชีนี้เห็นกระดานคิวหรือไม่ */
export async function boardEnabled(email) {
  const em = low(email);
  if (!em) return false;
  try {
    const { settings } = await import('../utils/settings.js');
    return String((await settings())[BOARD_SETTING] || '').split(/[,;\s]+/).map(low).filter(Boolean).includes(em);
  } catch (e) { return false; }
}

/** รหัสฟอร์มจองคิว Messenger (ทุกตัว) และฟอร์มขอใช้รถประจำสำนักงาน — หาจากทะเบียนแบบฟอร์ม เผื่อรหัสเปลี่ยน */
async function formCodes() {
  const forms = await list('formCatalog').catch(() => []);
  const t = (f) => `${f.Title || ''} ${f.Description || ''}`;
  const code = (f) => String(f.FormCode || '').trim();
  const msg = new Set(forms.filter((f) => /messenger|จองคิว/i.test(t(f))).map(code));
  ['FM-ADM-006', 'FM-HR-003'].forEach((c) => msg.add(c));
  const cars = forms.filter((f) => /ขอใช้รถ/.test(f.Title || '') && !/คืน/.test(f.Title || ''));
  const car = cars.find((f) => /ประจำสำนักงาน/.test(f.Title || '')) || cars[0];
  const active = (c) => forms.some((f) => code(f) === c && f.IsActive !== false);
  return { msg: [...msg].filter(Boolean), car: car ? code(car) : 'FM-ADM-002', active };
}

const S = {
  queue: { title: '🏍 คิว Messenger', unit: 'คิว', rows: [], ym: null, picked: '', code: null },
  car: { title: '🚗 การใช้รถยนต์บริษัทฯ ประจำสำนักงาน', unit: 'รายการ', rows: [], ym: null, picked: '', code: null },
};
let plates = [];
let active = () => true;
let updatedAt = null;
let timer = null;
let openReq = null;

/** การ์ดรายละเอียดหนึ่งคิว */
function card(b, kind) {
  return `<article class="dp-card ${tone(b)}${live(b) ? '' : ' dead'}"${b.id ? ` data-dpopen="${esc(String(b.id))}" tabindex="0" role="button" title="ดูรายละเอียดคำขอ"` : ''}>
    <div class="dp-card-top"><span class="dp-time">${timeText(b)}</span><span class="dp-st ${tone(b)}">${esc(b.status)}</span></div>
    ${kind === 'car' && b.plate ? `<div class="dp-plate">🚗 ${esc(b.plate)}</div>` : ''}
    <div class="dp-line dp-by">👤 ${esc(b.by || '—')}</div>
    ${b.place ? `<div class="dp-line">📍 ${esc(b.place)}</div>` : ''}
    ${b.detail ? `<div class="dp-line dp-detail">📝 ${esc(b.detail)}</div>` : ''}
    ${b.clash && live(b) ? '<div class="dp-clash">⚠ เวลาชนกับคิวอื่น</div>' : ''}
    ${b.title ? `<div class="dp-no">${esc(b.title)}</div>` : ''}
  </article>`;
}

/** รถแต่ละคันตอนนี้: ว่าง / กำลังใช้ (เฉพาะวันนี้) */
function plateStrip(rows) {
  if (!plates.length) return '';
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = rows.filter((b) => b.day === todayKey() && live(b) && b.status !== 'คืนรถแล้ว');
  return `<div class="dp-plates">${plates.map((p) => {
    const using = today.find((b) => b.plate === p && hhmm(b.from) <= t && t < hhmm(b.to));
    const next = today.filter((b) => b.plate === p && hhmm(b.from) > t).sort((a, b) => hhmm(a.from).localeCompare(hhmm(b.from)))[0];
    return `<div class="dp-pl ${using ? 'busy' : 'free'}"><b>${esc(p)}</b>
      <span>${using ? `กำลังใช้ · ${esc(using.by)} ถึง ${using.to === '24:00' ? 'ข้ามวัน' : esc(using.to)}` : 'ว่างตอนนี้'}</span>
      ${next ? `<small>คิวถัดไป ${esc(next.from)} · ${esc(next.by)}</small>` : ''}</div>`;
  }).join('')}</div>`;
}

function calendar(kind) {
  const s = S[kind];
  const { y, m } = s.ym;
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const byDay = {};
  s.rows.forEach((b) => { (byDay[b.day] = byDay[b.day] || []).push(b); });
  const cells = [];
  for (let i = 0; i < first; i += 1) cells.push('<div class="dp-cell blank"></div>');
  for (let d = 1; d <= days; d += 1) {
    const k = key(y, m, d);
    const all = byDay[k] || [];
    const items = all.filter(live).concat(all.filter((b) => !live(b)));
    const n = items.filter(live).length;
    cells.push(`<button type="button" class="dp-cell${k === todayKey() ? ' today' : ''}${k === s.picked ? ' on' : ''}${n ? ' has' : ''}" data-dpday="${kind}|${k}">
      <span class="dp-d">${d}${n ? `<em>${n} ${s.unit}</em>` : ''}</span>
      ${items.slice(0, 4).map((b) => `<span class="dp-ev ${tone(b)}${live(b) ? '' : ' dead'}"><b>${b.from === '00:00' ? (b.to === '24:00' ? 'ทั้งวัน' : `ถึง ${esc(b.to)}`) : esc(b.from)}</b> ${esc(b.by)}${kind === 'car' && b.plate ? ` · ${esc(b.plate.split(' (')[0])}` : b.place ? ` · ${esc(b.place)}` : ''}</span>`).join('')}
      ${items.length > 4 ? `<span class="dp-more">+${items.length - 4} รายการ</span>` : ''}
    </button>`);
  }
  return `<div class="dp-cal">
    <div class="dp-cal-head">
      <button type="button" class="btn-mini" data-dpmove="${kind}|-1">‹ เดือนก่อน</button>
      <b>${TH_MONTH[m]} ${y + 543}</b>
      <button type="button" class="btn-mini" data-dpmove="${kind}|1">เดือนถัดไป ›</button>
    </div>
    <div class="dp-dow">${TH_DOW.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="dp-grid">${cells.join('')}</div>
  </div>`;
}

function section(kind) {
  const s = S[kind];
  const isToday = s.picked === todayKey();
  const day = s.rows.filter((b) => b.day === s.picked)
    .sort((a, b) => live(b) - live(a) || hhmm(a.from).localeCompare(hhmm(b.from)));
  const n = day.filter(live).length;
  const formCode = kind === 'car' ? s.code : s.code[0];
  return `<section class="dp-sec dp-${kind}">
    <header class="dp-head">
      <h2>${s.title}</h2>
      <span class="dp-when">${isToday ? 'วันนี้ · ' : ''}${esc(thaiDate(s.picked))}</span>
      <span class="dp-count">${n} ${s.unit}</span>
      ${!isToday ? `<button type="button" class="btn-mini" data-dptoday="${kind}">↩ กลับวันนี้</button>` : ''}
      <span class="dp-gap"></span>
      ${formCode && active(formCode) ? `<a class="btn btn-primary" href="#/form/${esc(formCode)}">${kind === 'car' ? '+ ขอใช้รถ' : '+ จองคิว Messenger'}</a>` : ''}
    </header>
    ${kind === 'car' && isToday ? plateStrip(s.rows) : ''}
    <div class="dp-cards">${day.length ? day.map((b) => card(b, kind)).join('')
      : `<div class="dp-empty">✓ ${isToday ? 'วันนี้' : 'วันนั้น'}ยังไม่มี${kind === 'car' ? 'การจองรถ' : 'คิว Messenger'}</div>`}</div>
    ${calendar(kind)}
  </section>`;
}

function paint() {
  const box = document.getElementById('dp-board');
  if (!box) return false;
  const t = updatedAt ? `${String(updatedAt.getHours()).padStart(2, '0')}:${String(updatedAt.getMinutes()).padStart(2, '0')}` : '';
  box.innerHTML = `<div class="dp-bar"><b>📋 กระดานคิววันนี้</b>
      <span class="dim">อัปเดตล่าสุด ${t} น. · ดึงข้อมูลใหม่ทุก 2 นาที · กดการ์ดเพื่อดูรายละเอียดคำขอ · กดวันในปฏิทินเพื่อดูคิววันนั้น</span>
      <button type="button" class="btn-mini" id="dp-refresh">⟳ รีเฟรช</button></div>
    ${section('queue')}${section('car')}
    <div class="dp-legend"><i class="ok"></i>อนุมัติแล้ว/เสร็จสิ้น <i class="wait"></i>รออนุมัติ <i class="back"></i>ส่งกลับแก้ไข <i class="clash"></i>เวลาชนกัน <i class="done"></i>คืนรถแล้ว <i class="dead"></i>ยกเลิก/ไม่อนุมัติ</div>`;
  $$('[data-dpday]', box).forEach((b) => { b.onclick = () => { const [k, d] = b.dataset.dpday.split('|'); S[k].picked = d; paint(); box.querySelector(`.dp-${k}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }; });
  $$('[data-dpmove]', box).forEach((b) => {
    b.onclick = () => {
      const [k, step] = b.dataset.dpmove.split('|');
      const d = new Date(S[k].ym.y, S[k].ym.m + Number(step), 1);
      S[k].ym = { y: d.getFullYear(), m: d.getMonth() };
      paint();
    };
  });
  $$('[data-dptoday]', box).forEach((b) => { b.onclick = () => { const s = S[b.dataset.dptoday]; s.picked = todayKey(); const n = new Date(); s.ym = { y: n.getFullYear(), m: n.getMonth() }; paint(); }; });
  $$('[data-dpopen]', box).forEach((c) => {
    const go = () => openReq && openReq(c.dataset.dpopen);
    c.onclick = go;
    c.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
  const r = $('#dp-refresh', box);
  if (r) r.onclick = () => load(true);
  return true;
}

async function load(fresh) {
  const codes = await formCodes();
  active = codes.active;
  S.queue.code = codes.msg; S.car.code = codes.car;
  const [q, c, p] = await Promise.all([
    bookingsOf(codes.msg, 'queue', { fresh }).catch(() => []),
    bookingsOf(codes.car, 'car', { fresh }).catch(() => []),
    carPlates().catch(() => []),
  ]);
  S.queue.rows = q; S.car.rows = c; plates = p;
  updatedAt = new Date();
  return paint();
}

/** เรียกหลังหน้าวาดเสร็จ (ต้องมีกล่อง #dp-board) · onOpen(id) = เปิดหน้าต่างรายละเอียดคำขอ */
export async function mountBoard({ onOpen = null } = {}) {
  openReq = onOpen;
  const now = new Date();
  ['queue', 'car'].forEach((k) => {
    if (!S[k].ym) S[k].ym = { y: now.getFullYear(), m: now.getMonth() };
    if (!S[k].picked) S[k].picked = todayKey();
  });
  await load(false);
  clearInterval(timer);
  // ดึงใหม่ทุก 2 นาที · ออกจากหน้าแล้วหยุดเอง
  timer = setInterval(async () => {
    if (!document.getElementById('dp-board')) { clearInterval(timer); timer = null; return; }
    if (document.querySelector('#overlay-root .modal')) return;   // เปิดรายละเอียดคำขอค้างอยู่ ไม่วาดทับ
    await load(true);
  }, REFRESH_MS);
}
