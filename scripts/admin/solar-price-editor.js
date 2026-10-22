/**
 * 💲 ราคาโซลาร์เซลล์ (เมนูในหน้าจัดการข้อมูล · เฉพาะผู้ดูแลระบบ)
 * Price List ใบจองโซลาร์ (FM-SMD-001) — เก็บในตั้งค่าระบบ SolarPriceList (JSON) ไม่อยู่ในโค้ด
 * เพราะเว็บเปิดสาธารณะ ราคาขั้นต่ำเป็นข้อมูลลับ
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { toast } from '../components/toast.js';
import { clearCaches } from '../utils/dept.js';
import { PRICE_SETTING, EMPTY_PRICES, normalizePrices, loadSolarPrices, clearSolarPrices } from '../services/solar.js';

let draft = EMPTY_PRICES();
let saved = '';
const sig = () => JSON.stringify(normalizePrices(draft));
const dirty = () => sig() !== saved;

/** ตารางแต่ละส่วน: ชื่อ · ที่อยู่ในร่าง · คอลัมน์ [key, หัวคอลัมน์, ชนิด] */
const TABLES = [
  { id: 'pv1', title: 'A · ระบบโซลาร์ 1 เฟส (Supply & Installation of Solar PV Rooftop)', get: () => draft.pv[1], set: (r) => { draft.pv[1] = r; },
    cols: [['kwp', 'ขนาด (kWp)', 'n'], ['list', 'Price List (Total)', 'm'], ['discount', 'ส่วนลดในงาน', 'm'], ['min', 'Minimum (Total) 🔒', 'm']] },
  { id: 'pv3', title: 'A · ระบบโซลาร์ 3 เฟส', get: () => draft.pv[3], set: (r) => { draft.pv[3] = r; },
    cols: [['kwp', 'ขนาด (kWp)', 'n'], ['list', 'Price List (Total)', 'm'], ['discount', 'ส่วนลดในงาน', 'm'], ['min', 'Minimum (Total) 🔒', 'm']] },
  { id: 'bat', title: 'B · แบตเตอรี่ (Supply & Installation of Battery System)', get: () => draft.battery, set: (r) => { draft.battery = r; },
    cols: [['kwh', 'ขนาด (kWh)', 'n'], ['model', 'รุ่น', 't'], ['parts', 'ประกอบด้วย', 't'], ['list', 'Price List (Total)', 'm'], ['discount', 'ส่วนลดในงาน', 'm'], ['min', 'Minimum (Total) 🔒', 'm']] },
  { id: 'str', title: 'C · โครงสร้างพิเศษ (Mounting Structure for Concrete Slab)', get: () => draft.structure, set: (r) => { draft.structure = r; },
    cols: [['kwp', 'ขนาด (kWp)', 'n'], ['panels', 'จำนวนแผง', 'n'], ['list', 'Price List (Total)', 'm'], ['min', 'Minimum (Total) 🔒', 'm']] },
];

export async function solarPriceHtml() {
  draft = (await loadSolarPrices({ fresh: true })) || EMPTY_PRICES();
  draft = JSON.parse(JSON.stringify(draft));
  saved = sig();
  return `<div class="panel-head">💲 ราคาโซลาร์เซลล์ (Price List)</div>
    <div class="om-intro">
      ราคาที่ใช้คำนวณใน <b>ใบจองและสั่งซื้อระบบโซลาร์เซลล์ (FM-SMD-001)</b> — ราคาก่อนส่วนลด = Price List · ส่วนลดโปรโมชั่น = ส่วนลดในงาน ·
      🔒 <b>Minimum</b> ใช้เตือนฝ่ายขายเมื่อขายต่ำกว่าราคานี้ (ไม่แสดงในเอกสารที่ส่งให้ลูกค้า)
      <ul><li>ข้อมูลนี้เก็บใน SharePoint (ตั้งค่าระบบ ${PRICE_SETTING}) ไม่อยู่ในโค้ดของเว็บ</li>
      <li>เริ่มครั้งแรก: กด <b>⬆ นำเข้า JSON</b> แล้ววางไฟล์ราคาที่ได้รับ หรือกรอกในตาราง แล้วกด <b>💾 บันทึก</b></li></ul>
    </div>
    <div id="sp-editor"></div>`;
}

function table(t) {
  const rows = t.get();
  return `<section class="om-group"><header class="om-ghead"><b class="om-glabel">${esc(t.title)}</b>
      <span class="dim">${rows.length} รายการ</span></header>
    <div class="table-scroll"><table class="sp-table"><thead><tr>${t.cols.map(([, h]) => `<th>${esc(h)}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr>${t.cols.map(([k, , type]) => `<td><input data-t="${t.id}" data-i="${i}" data-c="${k}" value="${esc(r[k] ?? '')}" ${type === 't' ? '' : 'inputmode="decimal" class="sp-num"'}></td>`).join('')}
        <td><button class="btn-mini danger" data-sp="del" data-t="${t.id}" data-i="${i}" title="ลบแถว">✕</button></td></tr>`).join('')}
    </tbody></table></div>
    <button class="btn-mini om-add" data-sp="add" data-t="${t.id}">＋ เพิ่มแถว</button></section>`;
}

function paint() {
  const box = $('#sp-editor');
  if (!box) return;
  const g = (k, label, help = '') => `<label class="sp-g"><span>${label}</span><input data-g="${k}" value="${esc(draft[k] ?? '')}" inputmode="decimal" class="sp-num">${help ? `<em>${help}</em>` : ''}</label>`;
  const sg = (ph) => `<tr><td>${ph} เฟส</td><td><input data-sg="${ph}" data-c="model" value="${esc(draft.smartguard[ph].model || '')}"></td>
    <td><input data-sg="${ph}" data-c="list" value="${esc(draft.smartguard[ph].list ?? '')}" inputmode="decimal" class="sp-num"></td>
    <td><input data-sg="${ph}" data-c="min" value="${esc(draft.smartguard[ph].min ?? '')}" inputmode="decimal" class="sp-num"></td></tr>`;
  box.innerHTML = `
    <div class="om-bar">
      <span class="dim">${draft.pv[1].length + draft.pv[3].length} ขนาดระบบ · ${draft.battery.length} แบตเตอรี่</span>
      <button class="btn-mini" data-sp="import">⬆ นำเข้า JSON</button>
      <button class="btn-mini" data-sp="export">⬇ ดาวน์โหลด JSON</button>
      <button class="btn btn-primary om-save" data-sp="save" ${dirty() ? '' : 'disabled'}>💾 บันทึก</button>
    </div>
    ${dirty() ? '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>' : ''}
    <section class="om-group"><header class="om-ghead"><b class="om-glabel">ค่าทั่วไป</b></header>
      <div class="sp-gen">
        ${g('vat', 'VAT (%)')}
        ${g('deposit', 'เงินจอง (บาท)')}
        ${g('optimizerUnit', 'Optimizer ราคาต่อตัว (บาท)', 'ราคา Optimizer = จำนวนแผง × ราคานี้')}
        ${g('touPrice', 'มิเตอร์ TOU (บาท)', '0 = ให้ฝ่ายขายกรอกเอง')}
      </div></section>
    ${TABLES.map(table).join('')}
    <section class="om-group"><header class="om-ghead"><b class="om-glabel">D · Smart Guard (Optional)</b></header>
      <div class="table-scroll"><table class="sp-table"><thead><tr><th>ระบบไฟ</th><th>รุ่น</th><th>Price List (Total)</th><th>Minimum (Total) 🔒</th></tr></thead>
      <tbody>${sg(1)}${sg(3)}</tbody></table></div></section>`;
}

async function save(btn) {
  const value = JSON.stringify(normalizePrices(draft));
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    const rows = await list('settings', { fresh: true });
    const row = rows.find((r) => String(r.Title || '').trim() === PRICE_SETTING);
    if (row) await update('settings', row.id, { Value: value });
    else await create('settings', { Title: PRICE_SETTING, Value: value, Description: 'Price List ใบจองโซลาร์ (FM-SMD-001) — แก้ที่ จัดการข้อมูล → 💲 ราคาโซลาร์เซลล์' });
    clearCaches(); clearSolarPrices();
    draft = normalizePrices(draft); saved = sig();
    toast('✓ บันทึกราคาโซลาร์แล้ว — ใบจองใช้ราคาใหม่ทันที');
  } catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'bad'); }
  paint();
}

export function bindSolarPriceEditor() {
  const box = $('#sp-editor');
  if (!box) return;
  paint();
  const tbl = (id) => TABLES.find((t) => t.id === id);
  box.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.g) draft[el.dataset.g] = el.value;
    else if (el.dataset.sg) draft.smartguard[el.dataset.sg][el.dataset.c] = el.value;
    else if (el.dataset.t) tbl(el.dataset.t).get()[+el.dataset.i][el.dataset.c] = el.value;
    else return;
    const d = dirty();
    box.querySelector('[data-sp="save"]').disabled = !d;
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sp]');
    if (!b || b.disabled) return;
    const a = b.dataset.sp;
    if (a === 'save') { save(b); return; }
    if (a === 'add') tbl(b.dataset.t).get().push({});
    else if (a === 'del') { if (!confirm('ลบแถวนี้?')) return; tbl(b.dataset.t).get().splice(+b.dataset.i, 1); }
    else if (a === 'export') {
      const blob = new Blob([JSON.stringify(normalizePrices(draft), null, 2)], { type: 'application/json' });
      const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'solar-price-list.json'; l.click();
      setTimeout(() => URL.revokeObjectURL(l.href), 2000);
      return;
    } else if (a === 'import') {
      const pick = document.createElement('input'); pick.type = 'file'; pick.accept = '.json,application/json';
      pick.onchange = async () => {
        try {
          const text = await pick.files[0].text();
          draft = JSON.parse(JSON.stringify(normalizePrices(JSON.parse(text))));
          paint();
          toast('นำเข้าแล้ว ตรวจตัวเลข แล้วกด 💾 บันทึก');
        } catch (ex) { toast('ไฟล์ไม่ถูกต้อง: ' + ex.message, 'bad'); }
      };
      pick.click();
      return;
    }
    paint();
  });
}

export const solarPriceUnsaved = () => !!$('#sp-editor') && dirty();
