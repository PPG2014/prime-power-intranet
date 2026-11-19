/**
 * ทะเบียนเครื่องมือและอุปกรณ์ — #/equipment
 *   ทุกคนดูได้ว่าเครื่องมือแต่ละตัวอยู่ที่ใคร โครงการไหน สถานะอะไร (มุมมองรายการ / แยกตามผู้ใช้งาน)
 *   ฝ่ายจัดซื้อและคลังสินค้า + ผู้ดูแลระบบ: เพิ่ม/แก้ไข · นำเข้าจากไฟล์ Excel (ทะเบียนเดิม) · ส่งออก Excel
 *   ยื่นใบยืม-คืน (FM-PUR-006) / บันทึกโอนย้าย (FM-PUR-008) ได้จากหน้านี้ — สถานะในใบอัปเดตทะเบียนให้เอง
 *   ทางเข้า: หน้าแบบฟอร์มทั้งหมด → กลุ่มฝ่ายจัดซื้อและคลังสินค้า · ลิงก์ในหน้ารายละเอียดบุคลากร
 */
import { esc, $, $$ } from '../core/dom.js';
import { list, create, update, remove, clearDataCache } from '../services/data.js';
import { state } from '../core/state.js';
import { personRef, bindPersonCards } from '../components/person-card.js';
import { EQ_MANAGERS_SETTING } from '../components/eq-managers-editor.js';
import {
  EQ_LIST, EQ_STATUS, EQ_READY, EQ_INUSE, LOAN_CODE, MOVE_CODE, equipment, eqCode, eqLabel, holderOf, importRows, matchPerson,
} from '../services/equipment.js';

export const meta = { route: 'equipment', title: 'ทะเบียนเครื่องมือและอุปกรณ์', nav: false, order: 97, adminOnly: false };

const clean = (v) => (v && typeof v === 'object' ? String(v.LookupValue ?? v.Title ?? '') : String(v ?? '')).replace(/\s+/g, ' ').trim();
const low = (v) => clean(v).toLowerCase();
const day = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleDateString('th-TH', { dateStyle: 'medium' }) : ''; };
const iso = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''; };
const NOBODY = '(ไม่มีผู้ใช้งาน · อยู่ที่คลัง)';
const TONE = { [EQ_INUSE]: 'use', [EQ_READY]: 'ok', 'ส่งซ่อม': 'fix', 'ส่ง Calibration': 'fix', 'เสีย': 'bad' };

let rows = [];
let dir = [];
let canManage = false;
let forms = [];
const f = { q: '', status: '', project: '', holder: '', view: 'list', page: 1 };
const PER_PAGE = 25;   // มุมมองรายการ: หน้าละ 25 รายการ กดถัดไป

/** แถบเลือกหน้า (แสดงเมื่อเกิน 1 หน้า) */
function pager(page, pages, total, where) {
  if (pages <= 1) return '';
  const from = (page - 1) * PER_PAGE + 1; const to = Math.min(page * PER_PAGE, total);
  const b = (p, label, off, title = '') => `<button class="btn-mini" data-eqpage="${p}" ${off ? 'disabled' : ''}${title ? ` title="${title}"` : ''}>${label}</button>`;
  return `<div class="eq-pager ${where}" role="navigation" aria-label="เลือกหน้า">
    ${b(1, '«', page <= 1, 'หน้าแรก')}${b(page - 1, '‹ ก่อนหน้า', page <= 1)}
    <span class="eq-pager-info">หน้า <b>${page}</b> / ${pages} · รายการที่ ${from}–${to} จาก ${total}</span>
    ${b(page + 1, 'ถัดไป ›', page >= pages)}${b(pages, '»', page >= pages, 'หน้าสุดท้าย')}
  </div>`;
}

/**
 * เพิ่ม / แก้ไข / ลบ เครื่องมือได้: ผู้ดูแลระบบ · บุคลากรฝ่ายจัดซื้อและคลังสินค้า
 * · ผู้รับผิดชอบที่ระบุในตั้งค่าระบบ EquipmentManagers (อีเมล คั่นด้วยจุลภาค)
 * คนอื่นดูได้อย่างเดียว
 */
async function manager() {
  if (state.isAdmin) return true;
  const em = low(state.user?.email);
  if (!em) return false;
  const me = dir.find((p) => low(p.Email) === em) || {};
  if (/จัดซื้อ|คลังสินค้า/.test(`${me.Department || ''} ${me.Section || ''}`)) return true;
  const { settings } = await import('../utils/settings.js');
  const extra = String((await settings())[EQ_MANAGERS_SETTING] || '').split(/[,;\s]+/).map(low).filter(Boolean);
  return extra.includes(em);
}

const holderKey = (e) => holderOf(e) || NOBODY;

function filtered() {
  const q = low(f.q);
  return rows.filter((e) => {
    if (f.status && clean(e.Status) !== f.status) return false;
    if (f.project && clean(e.Project) !== f.project) return false;
    if (f.holder && holderKey(e) !== f.holder) return false;
    if (q && !q.split(' ').every((w) => [eqCode(e), e.ItemName, e.Brand, e.Model, e.SerialNo, holderOf(e), e.Project, e.LoanNo]
      .some((v) => low(v).includes(w)))) return false;
    return true;
  }).sort((a, b) => eqCode(a).localeCompare(eqCode(b)));
}

const opt = (vals, cur, all) => `<option value="">${all}</option>`
  + vals.map((v) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
const pill = (s) => (s ? `<span class="eq-st eq-${TONE[s] || 'other'}">${esc(s)}</span>` : '');
const who = (e) => (e.HolderName ? personRef(clean(e.HolderName)) : esc(clean(e.HolderText)) || '<span class="dim">—</span>');

function listView(list) {
  // จัดคอลัมน์ไม่ให้ตัวหนังสือตกบรรทัด: ยี่ห้อ/รุ่น/S/N รวมคอลัมน์เดียว (คนละบรรทัด) · เลขที่ใบยืม + วันที่ยืม รวมคอลัมน์เดียว
  // คอลัมน์สั้น (รหัส สถานะ ผู้ใช้งาน วันที่) ไม่ตัดบรรทัด · รายการกว้างสุด
  const brand = (e) => {
    const b = clean(e.Brand); const m = clean(e.Model); const sn = clean(e.SerialNo);
    return `${b ? `<div class="eq-b">${esc(b)}</div>` : ''}${m ? `<div class="eq-m">${esc(m)}</div>` : ''}${sn ? `<div class="eq-sn">S/N ${esc(sn)}</div>` : ''}`
      || '<span class="dim">—</span>';
  };
  const loan = (e) => {
    const no = clean(e.LoanNo); const d = day(e.LoanDate);
    return no || d ? `${no ? `<div class="eq-ln">${esc(no)}</div>` : ''}${d ? `<div class="eq-ld">${esc(d)}</div>` : ''}` : '<span class="dim">—</span>';
  };
  return `<div class="eq-scroll"><table class="ap-table eq-table">
    <colgroup><col class="c-code"><col class="c-item"><col class="c-brand"><col class="c-st"><col class="c-who"><col class="c-prj">
      <col class="c-loan"><col class="c-cert">${canManage ? '<col class="c-act">' : ''}</colgroup>
    <thead><tr><th>รหัส</th><th>รายการ</th><th>ยี่ห้อ / รุ่น / S/N</th><th>สถานะ</th><th>ผู้ใช้งาน</th>
      <th>โครงการ</th><th>เลขที่ใบยืม / วันที่ยืม</th><th>Cert. Date</th>${canManage ? '<th></th>' : ''}</tr></thead>
    <tbody>${list.map((e) => `<tr>
      <td class="eq-code">${esc(eqCode(e))}</td>
      <td class="eq-item">${esc(clean(e.ItemName))}${e.Remark ? `<div class="dim eq-rm">${esc(clean(e.Remark))}</div>` : ''}</td>
      <td class="eq-brand">${brand(e)}</td>
      <td>${pill(clean(e.Status))}</td>
      <td class="eq-nw">${who(e)}</td>
      <td class="eq-prj">${esc(clean(e.Project)) || '<span class="dim">—</span>'}</td>
      <td class="eq-nw">${loan(e)}</td>
      <td class="eq-nw">${esc(day(e.CertDate)) || '<span class="dim">—</span>'}</td>
      ${canManage ? `<td class="eq-act"><button class="btn-mini" data-eqedit="${e.id}" title="แก้ไข / ลบ">✎</button></td>` : ''}</tr>`).join('')
      || `<tr><td colspan="9" class="empty">ไม่พบเครื่องมือตามเงื่อนไข</td></tr>`}</tbody></table></div>`;
}

function holderView(list) {
  const g = {};
  list.forEach((e) => { (g[holderKey(e)] = g[holderKey(e)] || []).push(e); });
  const keys = Object.keys(g).sort((a, b) => (a === NOBODY) - (b === NOBODY) || g[b].length - g[a].length || a.localeCompare(b, 'th'));
  return `<div class="eq-holders">${keys.map((k) => {
    const first = g[k][0];
    return `<section class="panel eq-holder">
      <div class="eq-holder-h">${k === NOBODY ? esc(k) : first.HolderName ? personRef(clean(first.HolderName)) : esc(k)}
        <span class="dim">${g[k].length} รายการ</span></div>
      <ul>${g[k].map((e) => `<li><b>${esc(eqCode(e))}</b> ${esc(eqLabel(e))} ${pill(clean(e.Status))}
        ${e.Project ? `<span class="dim">· ${esc(clean(e.Project))}</span>` : ''}</li>`).join('')}</ul></section>`;
  }).join('') || '<div class="empty">ไม่พบเครื่องมือตามเงื่อนไข</div>'}</div>`;
}

export async function render() {
  [rows, dir, forms] = await Promise.all([
    equipment({ fresh: true }), list('directory').catch(() => []), list('formCatalog').catch(() => []),
  ]);
  canManage = await manager();
  // ลิงก์จากหน้าบุคลากร: #/equipment?holder=ชื่อ
  const hp = new URLSearchParams((location.hash.split('?')[1] || ''));
  const qh = hp.get('holder');
  if (qh) { f.holder = qh; f.view = 'list'; f.page = 1; }
  // ลิงก์จากกล่องเครื่องมือในหน้าแรก: #/equipment?q=รหัสเครื่องมือ
  const qq = hp.get('q');
  if (qq) { f.q = qq; f.view = 'list'; f.status = ''; f.project = ''; f.holder = ''; f.page = 1; }

  const list2 = filtered();
  const pages = Math.max(1, Math.ceil(list2.length / PER_PAGE));
  f.page = Math.min(Math.max(1, f.page || 1), pages);
  const pageRows = list2.slice((f.page - 1) * PER_PAGE, f.page * PER_PAGE);
  const count = (st) => rows.filter((e) => clean(e.Status) === st).length;
  const hasForm = (code) => forms.some((x) => clean(x.FormCode).toUpperCase() === code && x.IsActive !== false);
  const me = dir.find((p) => low(p.Email) === low(state.user?.email));
  const mine = me ? rows.filter((e) => low(e.HolderEmail) === low(me.Email) || low(e.HolderName) === low(me.Title)).length : 0;

  return `<section class="page page-equipment"><div class="wrap">
    <h1 class="page-title">🧰 ทะเบียนเครื่องมือและอุปกรณ์</h1>
    <p class="page-sub">เครื่องมือแต่ละตัวอยู่ที่ใคร โครงการไหน · ปรับอัตโนมัติจากใบยืม-คืนอุปกรณ์ (FM-PUR-006) และบันทึกโอนย้าย (FM-PUR-008)</p>
    <div class="eq-actions">
      ${hasForm(LOAN_CODE) ? `<a class="btn btn-primary" href="#/form/${LOAN_CODE}">📝 ยื่นใบยืม-คืนอุปกรณ์</a>` : ''}
      ${hasForm(MOVE_CODE) ? `<a class="btn btn-primary" href="#/form/${MOVE_CODE}">🚚 บันทึกโอนย้ายเครื่องมือ</a>` : ''}
      ${me && mine ? `<button class="btn-mini" id="eq-mine">👤 ของฉัน (${mine})</button>` : ''}
      <span class="eq-gap"></span>
      ${canManage ? `<button class="btn-mini" id="eq-add">➕ เพิ่มเครื่องมือ</button>
        <label class="btn-mini" for="eq-file">⬆ นำเข้าจาก Excel</label><input type="file" id="eq-file" accept=".xlsx" hidden>` : ''}
      <button class="btn-mini" id="eq-xlsx">⬇ ส่งออก Excel</button>
      <button class="btn-mini" id="eq-pdf">⬇ ส่งออก PDF</button>
    </div>
    <div class="eq-perm ${canManage ? 'on' : ''}">${canManage
      ? '✏️ คุณเพิ่ม แก้ไข และลบเครื่องมือในทะเบียนนี้ได้ (กด ✎ ท้ายแถวเพื่อแก้ไขหรือลบ)'
      : '👁 ดูได้อย่างเดียว · การเพิ่ม แก้ไข หรือลบ ทำได้เฉพาะฝ่ายจัดซื้อและคลังสินค้า และผู้รับผิดชอบที่ได้รับสิทธิ์'}</div>
    ${!rows.length ? `<div class="panel-note">ยังไม่มีข้อมูลในทะเบียน${canManage ? ' — กด <b>⬆ นำเข้าจาก Excel</b> แล้วเลือกไฟล์ทะเบียนเครื่องมือเดิม (ระบบจับคู่ชื่อผู้ใช้งานกับหน้าบุคลากรให้)' : ''}
      ${state.isAdmin ? '<br>ต้องสร้าง List <b>Equipment</b> ใน SharePoint ก่อน (ดู docs/sharepoint-todo.md)' : ''}</div>` : ''}
    <div class="ap-stats eq-stats">
      <div><b>${rows.length}</b><span>ทั้งหมด</span></div>
      <div><b>${count(EQ_INUSE)}</b><span>${EQ_INUSE}</span></div>
      <div><b>${count(EQ_READY)}</b><span>${EQ_READY}</span></div>
      <div><b>${count('ส่งซ่อม') + count('ส่ง Calibration')}</b><span>ส่งซ่อม / Calibration</span></div>
      <div><b>${count('เสีย')}</b><span>เสีย</span></div>
    </div>
    <div class="panel">
      <div class="eq-filter">
        <input id="eq-q" type="search" placeholder="ค้นหา รหัส ชื่อ ยี่ห้อ S/N ผู้ใช้งาน เลขที่ใบยืม" value="${esc(f.q)}">
        <select id="eq-status">${opt(EQ_STATUS.filter((s) => count(s)).concat(uniq(rows.map((e) => clean(e.Status))).filter((s) => !EQ_STATUS.includes(s))), f.status, 'ทุกสถานะ')}</select>
        <select id="eq-project">${opt(uniq(rows.map((e) => clean(e.Project))), f.project, 'ทุกโครงการ')}</select>
        <select id="eq-holder">${opt(uniq(rows.map(holderKey)), f.holder, 'ทุกผู้ใช้งาน')}</select>
        <div class="eq-view">
          <button class="chip ${f.view === 'list' ? 'active' : ''}" data-eqview="list">☰ รายการ</button>
          <button class="chip ${f.view === 'holder' ? 'active' : ''}" data-eqview="holder">👥 แยกตามผู้ใช้งาน</button>
        </div>
        <span class="dim">${list2.length} รายการ</span>
      </div>
      ${f.view === 'holder' ? holderView(list2)
    : `${pager(f.page, pages, list2.length, 'top')}${listView(pageRows)}${pager(f.page, pages, list2.length, 'bottom')}`}
    </div>
  </div></section>`;
}

/* ───────── แก้ไข / เพิ่ม ───────── */
const FIELDS = [
  ['Title', 'รหัสเครื่องมือ', 'text', true], ['ItemName', 'รายการ', 'text', true], ['Brand', 'ยี่ห้อ'], ['Model', 'รุ่น'],
  ['SerialNo', 'Serial No.'], ['MachineCode', 'รหัสเครื่องจักร'], ['Qty', 'จำนวน', 'number'], ['Unit', 'หน่วย'],
  ['Status', 'สถานะ', 'status'], ['Holder', 'ผู้ใช้งาน', 'holder'], ['Project', 'โครงการ'], ['LoanNo', 'เลขที่ใบยืม'],
  ['LoanDate', 'วันที่ยืม', 'date'], ['ReturnDate', 'วันที่คืน', 'date'], ['CertDate', 'Cert. Date Of Issue', 'date'],
  ['ReceivedDate', 'วันที่รับเข้า', 'date'], ['Remark', 'หมายเหตุ', 'textarea'],
];

async function openEdit(e = null) {
  const { openModal } = await import('../components/modal.js');
  const v = e || { Status: EQ_READY, Qty: 1, Unit: 'EA' };
  const input = ([k, label, type = 'text', req]) => {
    if (type === 'status') return `<label>${label}<select id="eqf-${k}">${EQ_STATUS.map((s) => `<option ${s === clean(v.Status) ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`;
    if (type === 'holder') return `<label>${label}<input id="eqf-Holder" list="eqf-people" value="${esc(holderOf(v))}" placeholder="เลือกจากรายชื่อ หรือพิมพ์ เช่น Office">
      <datalist id="eqf-people">${dir.filter((p) => p.IsActive !== false && p.Title).map((p) => `<option value="${esc(p.Title)}">${esc(p.Nickname || '')}</option>`).join('')}</datalist></label>`;
    if (type === 'textarea') return `<label class="eqf-full">${label}<textarea id="eqf-${k}" rows="2">${esc(clean(v[k]))}</textarea></label>`;
    return `<label>${label}${req ? ' <b class="req">*</b>' : ''}<input id="eqf-${k}" type="${type}" value="${esc(type === 'date' ? iso(v[k]) : clean(v[k]))}"></label>`;
  };
  const close = openModal({
    title: e ? `แก้ไข ${eqCode(e)}` : 'เพิ่มเครื่องมือ', wide: true,
    body: `<div class="eqf-grid">${FIELDS.map(input).join('')}</div><div class="field-error" id="eqf-err" hidden></div>`,
    footer: `${e ? '<button class="btn-mini danger" id="eqf-del">🗑 ลบเครื่องมือนี้</button><span style="flex:1"></span>' : ''}
      <button class="btn-mini" id="eqf-cancel">ยกเลิก</button><button class="btn btn-primary" id="eqf-save">💾 บันทึก</button>`,
  });
  $('#eqf-cancel').onclick = close;
  const del = $('#eqf-del');
  if (del) {
    del.onclick = async () => {
      const busy = holderOf(e) && clean(e.Status) === EQ_INUSE;
      if (!confirm(`ลบ ${eqCode(e)} ${clean(e.ItemName)} ออกจากทะเบียน?${busy ? `\n\n⚠ ตอนนี้อยู่ระหว่างใช้งานโดย ${holderOf(e)}` : ''}\n\nลบแล้วกู้คืนไม่ได้ (ถ้าแค่เลิกใช้ ให้เปลี่ยนสถานะเป็น "จำหน่าย / ตัดออก" แทน)`)) return;
      del.disabled = true;
      try { await remove(EQ_LIST, e.id); clearDataCache(EQ_LIST); close(); rerender(); }
      catch (x) { del.disabled = false; const err = $('#eqf-err'); err.textContent = 'ลบไม่สำเร็จ — ' + x.message; err.hidden = false; }
    };
  }
  $('#eqf-save').onclick = async () => {
    const data = {};
    FIELDS.forEach(([k, , type]) => {
      if (k === 'Holder') return;
      const el = $(`#eqf-${k}`); const val = el.value.trim();
      data[k] = type === 'number' ? (val === '' ? null : +val) : type === 'date' ? (val || null) : val;
    });
    const h = $('#eqf-Holder').value.trim();
    const p = dir.find((x) => low(x.Title) === low(h)) || (h ? matchPerson(dir, h) : null);
    Object.assign(data, p ? { HolderName: clean(p.Title), HolderEmail: clean(p.Email), HolderText: '' } : { HolderName: '', HolderEmail: '', HolderText: h });
    const err = $('#eqf-err');
    if (!data.Title || !data.ItemName) { err.textContent = 'กรอกรหัสเครื่องมือและรายการ'; err.hidden = false; return; }
    if (rows.some((x) => eqCode(x).toUpperCase() === data.Title.toUpperCase() && (!e || x.id !== e.id))) {
      err.textContent = `รหัส ${data.Title} มีในทะเบียนแล้ว`; err.hidden = false; return;
    }
    const b = $('#eqf-save'); b.disabled = true; b.textContent = 'กำลังบันทึก…';
    try {
      if (e) await update(EQ_LIST, e.id, data); else await create(EQ_LIST, { ...data, IsActive: true });
      clearDataCache(EQ_LIST); close(); rerender();
    } catch (x) { b.disabled = false; b.textContent = '💾 บันทึก'; err.textContent = 'บันทึกไม่สำเร็จ — ' + x.message; err.hidden = false; }
  };
}

/* ───────── นำเข้าจากไฟล์ Excel ───────── */

/** คนที่ชื่อเล่น/ชื่อต้นตรงกับชื่อในไฟล์ (เช่น K.บูม → ทุกคนที่ชื่อเล่น บูม) ให้กดเลือก */
function candidates(text) {
  const k = low(String(text).replace(/^(k\.|k\s|คุณ|พี่|น้อง)\s*/i, ''));
  if (!k) return [];
  return dir.filter((p) => p.IsActive !== false && p.Title
    && (low(p.Nickname) === k || low(p.Title).split(' ')[0] === k || low(p.NameEN).split(' ')[0] === k)).slice(0, 6);
}
async function openImport(file) {
  const { openModal } = await import('../components/modal.js');
  const { readXlsxTable } = await import('../utils/xlsx-read.js');
  let items;
  try {
    items = importRows(await readXlsxTable(file, { headerMatch: /รหัสเครื่อง/ }), dir);
  } catch (e) { alert('อ่านไฟล์ไม่สำเร็จ — ' + e.message); return; }
  const byCode = new Map(rows.map((e) => [eqCode(e).toUpperCase(), e]));
  items.forEach((it) => { if (!clean(it.data.Title)) it.data.Title = `ไม่มีรหัส-${it.data.SeqNo || Math.random().toString(36).slice(2, 7)}`; });
  const isNew = (it) => !byCode.has(clean(it.data.Title).toUpperCase());
  const unmatched = uniq(items.filter((it) => it.holderText && !it.holderMatch).map((it) => it.holderText));
  const matched = items.filter((it) => it.holderMatch).length;
  const people = dir.filter((p) => p.IsActive !== false && p.Title).sort((a, b) => clean(a.Title).localeCompare(clean(b.Title), 'th'));

  const close = openModal({
    title: `นำเข้าทะเบียนเครื่องมือ — ${file.name}`, wide: true,
    body: `<div class="ap-stats small">
        <div><b>${items.length}</b><span>รายการในไฟล์</span></div>
        <div><b>${items.filter(isNew).length}</b><span>เพิ่มใหม่</span></div>
        <div><b>${items.filter((it) => !isNew(it)).length}</b><span>มีอยู่แล้ว (อัปเดต)</span></div>
        <div><b>${matched}</b><span>จับคู่ผู้ใช้งานกับหน้าบุคลากรได้</span></div>
      </div>
      ${unmatched.length ? `<div class="panel"><div class="panel-head">ผู้ใช้งานที่จับคู่เองไม่ได้ (${unmatched.length}) <span class="panel-meta">พิมพ์ค้นหาชื่อจริง ชื่อเล่น หรือฝ่าย แล้วเลือก · เว้นว่าง = คงเป็นข้อความเดิม (เช่น Office, Store)</span></div>
        <datalist id="eqi-people">${people.map((p) => `<option value="${esc(p.Title)}">${esc([p.Nickname ? `(${p.Nickname})` : '', p.Department].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
        <div class="eq-map">${unmatched.map((t, i) => {
          const cand = candidates(t);
          return `<div class="eq-mapi"><span>${esc(t)} <span class="dim">(${items.filter((it) => it.holderText === t).length})</span></span>
            <input data-map="${i}" list="eqi-people" placeholder="พิมพ์ชื่อหรือชื่อเล่นเพื่อค้นหา" autocomplete="off">
            ${cand.length ? `<div class="eq-cand">ชื่อเล่นตรงกัน: ${cand.map((p) => `<button type="button" class="chip" data-cand="${i}" data-name="${esc(p.Title)}">${esc(p.Title)}${p.Department ? ` · ${esc(p.Department)}` : ''}</button>`).join('')}</div>` : ''}
            <div class="eq-mapok dim" data-mapok="${i}">คงเป็นข้อความเดิม</div></div>`;
        }).join('')}</div></div>` : ''}
      <div class="panel-note">รายการที่มีรหัสเดียวกันในทะเบียนอยู่แล้วจะอัปเดตตามไฟล์ · รายการไม่มีรหัสจะตั้งรหัสชั่วคราว "ไม่มีรหัส-ลำดับ" ให้แก้ภายหลัง</div>
      <div class="dim" id="eqi-msg"></div>`,
    footer: '<button class="btn-mini" id="eqi-cancel">ยกเลิก</button><button class="btn btn-primary" id="eqi-go">⬆ นำเข้า</button>',
  });
  $('#eqi-cancel').onclick = close;
  const personOf = (v) => { const k = low(v); return k ? people.find((x) => low(x.Title) === k || low(x.Email) === k) || null : null; };
  const showOk = (inp) => {
    const ok = $(`[data-mapok="${inp.dataset.map}"]`);
    const p = personOf(inp.value);
    ok.textContent = !inp.value.trim() ? 'คงเป็นข้อความเดิม' : p ? `✓ ${p.Title}${p.Department ? ` · ${p.Department}` : ''}` : 'ไม่พบในทะเบียนบุคลากร — เลือกจากรายการที่ขึ้นมา';
    ok.className = `eq-mapok ${!inp.value.trim() ? 'dim' : p ? 'ok' : 'bad'}`;
  };
  $$('[data-map]').forEach((inp) => { inp.oninput = () => showOk(inp); });
  $$('[data-cand]').forEach((b) => {
    b.onclick = () => { const inp = $(`[data-map="${b.dataset.cand}"]`); inp.value = b.dataset.name; showOk(inp); };
  });
  $('#eqi-go').onclick = async () => {
    const pick = {};
    const wrong = [...$$('[data-map]')].filter((inp) => inp.value.trim() && !personOf(inp.value));
    if (wrong.length) { alert(`ไม่พบชื่อในทะเบียนบุคลากร ${wrong.length} ช่อง — เลือกจากรายการที่ขึ้นมา หรือเว้นว่างไว้`); wrong[0].focus(); return; }
    $$('[data-map]').forEach((inp) => {
      const p = personOf(inp.value);
      if (p) pick[unmatched[+inp.dataset.map]] = p;
    });
    const b = $('#eqi-go'); b.disabled = true;
    const msg = $('#eqi-msg');
    let ok = 0; const bad = [];
    for (const [i, it] of items.entries()) {
      const d = { ...it.data };
      const p = pick[it.holderText];
      if (p) Object.assign(d, { HolderName: clean(p.Title), HolderEmail: clean(p.Email) });
      try {
        const old = byCode.get(clean(d.Title).toUpperCase());
        // eslint-disable-next-line no-await-in-loop
        if (old) await update(EQ_LIST, old.id, d); else await create(EQ_LIST, { ...d, IsActive: true });
        ok += 1;
      } catch (e) { bad.push(`${d.Title} — ${e.message}`); }
      msg.textContent = `กำลังนำเข้า ${i + 1}/${items.length}…`;
    }
    clearDataCache(EQ_LIST);
    alert(`นำเข้าสำเร็จ ${ok} รายการ${bad.length ? `\nไม่สำเร็จ ${bad.length} รายการ\n${bad.slice(0, 10).join('\n')}` : ''}`);
    close(); rerender();
  };
}

async function exportXlsx() {
  const { downloadXlsx } = await import('../utils/xlsx.js');
  const list2 = filtered();
  downloadXlsx(`ทะเบียนเครื่องมือและอุปกรณ์ ${new Date().toLocaleDateString('th-TH')}.xlsx`, {
    sheet: 'เครื่องมือ',
    page: { orientation: 'portrait', fitWidth: true },   // พิมพ์ A4 แนวตั้ง ย่อพอดีความกว้าง หัวตารางซ้ำทุกหน้า
    columns: [{ title: 'รหัสเครื่อง', width: 16 }, { title: 'รหัสเครื่องจักร', width: 14 }, { title: 'รายการ', width: 36 },
      { title: 'ยี่ห้อ', width: 14 }, { title: 'รุ่น', width: 14 }, { title: 'Serial no.', width: 18 }, { title: 'จำนวน', width: 8, type: 'number' },
      { title: 'หน่วย', width: 8 }, { title: 'Status', width: 16 }, { title: 'ผู้ใช้งาน', width: 22 }, { title: 'โครงการ', width: 14 },
      { title: 'เลขที่ใบยืม', width: 14 }, { title: 'วันที่ยืม', width: 12, type: 'date' }, { title: 'วันที่คืน', width: 12, type: 'date' },
      { title: 'Cert.Date Of Issue', width: 14, type: 'date' }, { title: 'วันที่รับเข้า', width: 12, type: 'date' }, { title: 'หมายเหตุ', width: 28, type: 'wrap' }],
    rows: list2.map((e) => [eqCode(e), clean(e.MachineCode), clean(e.ItemName), clean(e.Brand), clean(e.Model), clean(e.SerialNo),
      e.Qty ?? '', clean(e.Unit), clean(e.Status), holderOf(e), clean(e.Project), clean(e.LoanNo),
      e.LoanDate || '', e.ReturnDate || '', e.CertDate || '', e.ReceivedDate || '', clean(e.Remark)]),
  });
}

/** ส่งออก PDF: ตารางทะเบียนตามตัวกรองปัจจุบัน · A4 แนวตั้ง · หัวตารางซ้ำทุกหน้า
 *  แนวตั้งแคบ จึงรวมคอลัมน์: รายการ + ยี่ห้อ/รุ่น/S/N · จำนวน + หน่วย · ผู้ใช้งาน + โครงการ · เลขที่ใบยืม + วันที่ยืม */
async function exportPdf() {
  const list2 = filtered();
  const cond = [f.q && `ค้นหา "${f.q}"`, f.status && `สถานะ ${f.status}`, f.project && `โครงการ ${f.project}`, f.holder && `ผู้ใช้งาน ${f.holder}`].filter(Boolean);
  const count = (st) => list2.filter((e) => clean(e.Status) === st).length;
  const html = `<div class="eqp-doc"><div class="eqp-page">
    <div class="eqp-head"><img src="assets/img/ppc-logo-2024.png" alt="">
      <div><div class="eqp-title">ทะเบียนเครื่องมือและอุปกรณ์</div>
        <div class="eqp-sub">ข้อมูล ณ วันที่ ${esc(new Date().toLocaleDateString('th-TH', { dateStyle: 'long' }))}${cond.length ? ` · ${esc(cond.join(' · '))}` : ' · ทั้งหมด'}</div></div>
      <div class="eqp-sum">ทั้งหมด <b>${list2.length}</b> · ${EQ_INUSE} <b>${count(EQ_INUSE)}</b> · ${EQ_READY} <b>${count(EQ_READY)}</b>
        · ส่งซ่อม/Cal. <b>${count('ส่งซ่อม') + count('ส่ง Calibration')}</b> · เสีย <b>${count('เสีย')}</b></div></div>
    <table class="eqp-t"><colgroup><col class="p-no"><col class="p-code"><col class="p-item"><col class="p-qty"><col class="p-st"><col class="p-who">
      <col class="p-loan"><col class="p-cert"><col class="p-rm"></colgroup>
    <thead><tr><th>ลำดับ</th><th>รหัสเครื่อง</th><th>รายการ / ยี่ห้อ / รุ่น / Serial no.</th><th>จำนวน</th><th>Status</th>
      <th>ผู้ใช้งาน / โครงการ</th><th>เลขที่ใบยืม / วันที่ยืม</th><th>Cert. Date</th><th>หมายเหตุ</th></tr></thead>
    <tbody>${list2.map((e, i) => {
      const sub = [clean(e.Brand), clean(e.Model)].filter(Boolean).join(' · ');
      const qty = [clean(e.Qty), clean(e.Unit)].filter(Boolean).join(' ');
      return `<tr><td class="n">${i + 1}</td><td class="nw">${esc(eqCode(e))}</td>
      <td><b>${esc(clean(e.ItemName))}</b>${sub ? `<div class="s">${esc(sub)}</div>` : ''}${clean(e.SerialNo) ? `<div class="s">S/N ${esc(clean(e.SerialNo))}</div>` : ''}</td>
      <td class="n nw">${esc(qty)}</td><td>${esc(clean(e.Status))}</td>
      <td>${esc(holderOf(e))}${clean(e.Project) ? `<div class="s">${esc(clean(e.Project))}</div>` : ''}</td>
      <td>${esc(clean(e.LoanNo))}${day(e.LoanDate) ? `<div class="s">${esc(day(e.LoanDate))}</div>` : ''}</td>
      <td class="nw">${esc(day(e.CertDate))}</td><td>${esc(clean(e.Remark))}</td></tr>`;
    }).join('')}</tbody></table>
  </div></div>`;
  const { openPRWindow } = await import('../templates/pr-fm-pur-004.js');
  openPRWindow(html, 'ทะเบียนเครื่องมือและอุปกรณ์ (PDF)');
}

async function rerender() { const { render: r } = await import('../core/render.js'); r(); }

export function mount() {
  bindPersonCards();
  // เปลี่ยนตัวกรอง/มุมมอง → กลับไปหน้า 1
  const set = (k, v) => { f[k] = v; f.page = 1; if (location.hash.includes('?')) history.replaceState(null, '', '#/equipment'); rerender(); };
  $$('[data-eqpage]').forEach((b) => {
    b.onclick = async () => {
      f.page = Number(b.dataset.eqpage) || 1;
      const bottom = b.closest('.eq-pager.bottom');
      await rerender();
      // กดจากแถบล่าง → เลื่อนขึ้นไปที่แถบค้นหา/หัวตาราง (เผื่อความสูงแถบเมนูด้านบน)
      const top = $('.eq-filter');
      if (bottom && top) window.scrollTo({ top: top.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
    };
  });
  const q = $('#eq-q');
  if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => set('q', q.value.trim()), 300); }; }
  [['eq-status', 'status'], ['eq-project', 'project'], ['eq-holder', 'holder']].forEach(([id, k]) => {
    const el = $('#' + id); if (el) el.onchange = () => set(k, el.value);
  });
  $$('[data-eqview]').forEach((b) => { b.onclick = () => set('view', b.dataset.eqview); });
  const mineBtn = $('#eq-mine');
  if (mineBtn) mineBtn.onclick = () => {
    const me = dir.find((p) => low(p.Email) === low(state.user?.email));
    set('holder', me ? clean(me.Title) : '');
  };
  $$('[data-eqedit]').forEach((b) => { b.onclick = () => openEdit(rows.find((e) => String(e.id) === b.dataset.eqedit)); });
  const add = $('#eq-add'); if (add) add.onclick = () => openEdit(null);
  const file = $('#eq-file'); if (file) file.onchange = () => { if (file.files[0]) openImport(file.files[0]); file.value = ''; };
  const xb = $('#eq-xlsx'); if (xb) xb.onclick = exportXlsx;
  const pb = $('#eq-pdf'); if (pb) pb.onclick = exportPdf;
  if (q && f.q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
