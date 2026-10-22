/**
 * Solar Rooftop Calculator (ตามไฟล์ Solar Calculator Rev.03) — แถบซ่อนด้านขวาของใบจองโซลาร์
 * กดแถบ "☀ Solar Calculator" → แผงเลื่อนออกมา หน้าแบบฟอร์มยังอยู่และขยับหลบไปทางซ้าย
 *
 * สูตร (เหมือนใน Excel):
 *   ค่าไฟต่อหน่วย = อัตราค่าไฟ + Ft · หน่วยกลางวัน = ค่าไฟ × สัดส่วนกลางวัน ÷ ค่าไฟต่อหน่วย
 *   A (ไม่มีแบต): kWp = หน่วยกลางวัน × 1.3 ÷ 6 ÷ 30 · ผลิตได้ = kWp × PR × ชม.แดด × 30
 *   B (มีแบต): แบต kWh = หน่วยกลางคืน ÷ 30 ÷ 2.5 · kWp = แบต ÷ PR(DoD) ÷ ชม.แดด + kWp(A)
 *   แพ็กเกจแนะนำ = ขนาดที่เล็กที่สุดที่ ≥ ค่าที่คำนวณ · แอร์: kW = BTU ÷ 3412.142 · ติดตั้ง = kW × 1.25
 */
import { esc, $ } from '../core/dom.js';
import { loadSolarPrices, sizesFor } from '../services/solar.js';
import { state } from '../core/state.js';
import { toast } from './toast.js';

/** ขนาดแพ็กเกจตั้งต้นในไฟล์ Excel (ใช้เมื่อยังไม่ได้ตั้ง Price List) */
const DEFAULT_SIZES = [3.25, 3.9, 5.2, 6.5, 10.4, 13, 19.5, 20.8, 22.1, 26];
const DEFAULT_BATT = [7, 14, 21];
const D = { bill: 8000, day: 20, rate: 4.3583, ft: 0.1623, pr: 0.8, sun: 5, prDod: 0.7, btu: 18000, phase: '1' };
const KEY = 'solarCalc';
/**
 * สมมติฐานการคำนวณ: ผู้ใช้ทั่วไปแก้ไม่ได้ · ผู้ดูแลระบบกด ⚙ ในกรอบเพื่อแก้
 * เก็บในตั้งค่าระบบ SolarCalcAssumptions (JSON) · ไม่มีค่า = ใช้ค่าตาม Rev.03
 */
const FIXED = ['rate', 'ft', 'pr', 'sun', 'prDod'];
export const ASSUME_SETTING = 'SolarCalcAssumptions';
async function loadAssumptions({ fresh = false } = {}) {
  const out = {};
  try {
    const { settings, clearSettings } = await import('../utils/settings.js');
    if (fresh) clearSettings();
    const saved = JSON.parse(String((await settings())[ASSUME_SETTING] || '').trim() || '{}') || {};
    FIXED.forEach((k) => { const n = +String(saved[k] ?? '').replace(/,/g, ''); if (saved[k] !== '' && saved[k] != null && Number.isFinite(n) && n > 0) out[k] = n; });
  } catch (e) { console.warn('อ่านสมมติฐาน Solar Calculator ไม่สำเร็จ:', e.message); }
  return out;
}

const n2 = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
const baht = (v) => n2(v, 0);
const pick = (list, need) => { const s = [...list].sort((a, b) => a - b); return s.find((x) => x >= need - 1e-9) ?? null; };

export function calculatorHtml() {
  return `
  <button class="sc-tab" id="sc-tab" aria-expanded="false" aria-controls="sc-panel" title="เปิด Solar Calculator">☀ Solar Calculator</button>
  <aside class="sc-panel" id="sc-panel" aria-label="Solar Calculator" aria-hidden="true">
    <div class="sc-head">
      <div><b>SOLAR ROOFTOP CALCULATOR</b><div class="sc-sub">คำนวณขนาดติดตั้งและความคุ้มค่า</div></div>
      <button class="sc-close" id="sc-close" title="ปิด">✕</button>
    </div>
    <div class="sc-body" id="sc-body"></div>
  </aside>`;
}

export function bindCalculator({ shell, onApply }) {
  const tab = $('#sc-tab');
  const panel = $('#sc-panel');
  const body = $('#sc-body');
  if (!tab || !panel) return;
  let v = { ...D };
  try { v = { ...D, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) }; } catch (e) { /* ใช้ค่าเริ่มต้น */ }
  FIXED.forEach((k) => { v[k] = D[k]; });
  let prices = null;
  let editing = null;      // ค่าที่ผู้ดูแลกำลังแก้ (null = ไม่ได้แก้)
  let assumeOpen = false;
  loadSolarPrices().then((p) => { prices = p; paint(); });
  loadAssumptions().then((a) => { Object.assign(v, a); paint(); });

  const setOpen = (open) => {
    panel.classList.toggle('open', open);
    document.body.classList.toggle('sc-open', open);
    shell.classList.toggle('sc-shift', open);
    tab.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    tab.textContent = open ? '✕ ปิด Calculator' : '☀ Solar Calculator';
  };
  tab.onclick = () => setOpen(!panel.classList.contains('open'));
  $('#sc-close').onclick = () => setOpen(false);

  const inp = (k, label, unit, attrs = '') => `<label class="sc-row"><span>${label}</span><input data-sc="${k}" value="${esc(v[k])}" inputmode="decimal" ${attrs}><em>${unit}</em></label>`;

  function calc() {
    const num = (k) => +String(v[k]).replace(/,/g, '') || 0;
    const bill = num('bill'); const day = num('day') / 100;
    const unit = num('rate') + num('ft');
    const dayU = unit ? bill * day / unit : 0;
    const nightU = unit ? bill * (1 - day) / unit : 0;
    const pr = num('pr'); const sun = num('sun'); const prDod = num('prDod');
    const kwpA = dayU * 1.3 / 6 / 30;
    const batt = nightU / 30 / 2.5;
    const kwpB = (prDod && sun ? batt / prDod / sun : 0) + kwpA;
    const prodA = kwpA * pr * sun * 30; const prodB = kwpB * pr * sun * 30;
    const phase = String(v.phase) === '3' ? 3 : 1;
    const sizes = (prices && sizesFor(prices, phase).length) ? sizesFor(prices, phase) : DEFAULT_SIZES;
    const batts = (prices && prices.battery.length) ? prices.battery.map((b) => b.kwh) : DEFAULT_BATT;
    const priceOf = (kwp) => { const r = prices && prices.pv[phase].find((x) => Math.abs(x.kwp - kwp) < 0.001); return r ? r.list : null; };
    const battPrice = (kwh) => { const r = prices && prices.battery.find((x) => Math.abs(x.kwh - kwh) < 0.001); return r ? r.list : null; };
    const ac = num('btu') / 3412.142;
    return {
      unit, dayU, nightU, total: dayU + nightU, kwpA, prodA, saveA: prodA * unit, pkgA: pick(sizes, kwpA),
      batt, kwpB, prodB, saveB: prodB * unit, pkgB: pick(sizes, kwpB), pkgBatt: pick(batts, batt),
      ac, acKwp: ac * 1.25, phase, priceOf, battPrice,
    };
  }

  function paint() {
    const r = calc();
    const pkg = (k) => (k == null ? '<b class="sc-over">เกินแพ็กเกจ</b>' : `<b>${n2(k)}</b> kWp`);
    const pA = r.pkgA != null ? r.priceOf(r.pkgA) : null;
    const pB = r.pkgB != null ? r.priceOf(r.pkgB) : null;
    const pBat = r.pkgBatt != null ? r.battPrice(r.pkgBatt) : null;
    const fixed = (k, label, unit) => (editing
      ? `<label class="sc-row"><span>${label}</span><input data-as="${k}" value="${esc(editing[k])}" inputmode="decimal"><em>${unit}</em></label>`
      : `<div class="sc-out"><span>${label}</span><b>${v[k]}</b><em>${unit}</em></div>`);
    const gear = state.isAdmin && !editing ? '<button type="button" class="sc-gear" data-asact="edit" title="แก้ไขสมมติฐานการคำนวณ (ผู้ดูแลระบบ)" aria-label="แก้ไขสมมติฐานการคำนวณ">⚙</button>' : '';
    body.innerHTML = `
      <div class="sc-note">กรอกเฉพาะช่องสีขาว · ช่องอื่นคำนวณให้อัตโนมัติ</div>
      <h4>① ข้อมูลการใช้ไฟฟ้าของลูกค้า</h4>
      ${inp('bill', 'ค่าไฟฟ้าต่อเดือน', 'บาท/เดือน')}
      ${inp('day', 'สัดส่วนใช้ไฟ กลางวัน', '%')}
      <div class="sc-out"><span>สัดส่วนกลางคืน</span><b>${n2(100 - (+v.day || 0), 0)}%</b></div>
      <div class="sc-out"><span>หน่วยไฟ กลางวัน / กลางคืน</span><b>${n2(r.dayU, 0)} / ${n2(r.nightU, 0)}</b><em>หน่วย/เดือน</em></div>
      <div class="sc-out"><span>รวมหน่วยไฟฟ้าทั้งหมด</span><b>${n2(r.total, 0)}</b><em>หน่วย/เดือน</em></div>
      <details class="sc-assume${editing ? ' editing' : ''}" ${assumeOpen || editing ? 'open' : ''}><summary>② สมมติฐานการคำนวณ ${gear}</summary>
        ${fixed('rate', 'อัตราค่าไฟฟ้า', 'บาท/หน่วย')}
        ${fixed('ft', 'ค่า Ft', 'บาท/หน่วย')}
        ${editing ? '' : `<div class="sc-out"><span>รวมค่าไฟฟ้าต่อหน่วย</span><b>${n2(r.unit, 4)}</b><em>บาท/หน่วย</em></div>`}
        ${fixed('pr', 'Performance Ratio (PR)', '')}
        ${fixed('sun', 'ชั่วโมงแดดเฉลี่ย', 'ชม./วัน')}
        ${fixed('prDod', 'PR Including DoD Battery', '')}
        ${editing ? `<div class="sc-asbar">
            <button type="button" class="btn-mini" data-asact="default" title="กลับไปใช้ค่าตาม Solar Calculator Rev.03">↺ ค่าตาม Rev.03</button>
            <button type="button" class="btn-mini" data-asact="cancel">ยกเลิก</button>
            <button type="button" class="btn btn-primary sc-assave" data-asact="save">💾 บันทึก</button>
          </div>
          <div class="sc-fixnote">บันทึกแล้วมีผลกับทุกคนที่ใช้ Calculator</div>`
    : `<div class="sc-fixnote">🔒 ${state.isAdmin ? 'กด ⚙ เพื่อแก้ไข (ผู้ดูแลระบบ)' : 'ค่ากลางของบริษัท · แก้ไขได้เฉพาะผู้ดูแลระบบ'}</div>`}
      </details>
      <label class="sc-row"><span>ระบบไฟฟ้าของลูกค้า</span><select data-sc="phase"><option value="1" ${String(v.phase) !== '3' ? 'selected' : ''}>1 เฟส</option><option value="3" ${String(v.phase) === '3' ? 'selected' : ''}>3 เฟส</option></select><em></em></label>
      <h4>③ ผลการคำนวณ · เปรียบเทียบ 2 ทางเลือก</h4>
      <div class="sc-cards">
        <div class="sc-card a">
          <div class="sc-ct">ทางเลือก A <span>เฉพาะกลางวัน · ไม่มีแบตเตอรี่</span></div>
          <div class="sc-kv"><span>ขนาดติดตั้ง (คำนวณ)</span><b>${n2(r.kwpA)} kWp</b></div>
          <div class="sc-kv"><span>ผลิตไฟฟ้าได้</span><b>${n2(r.prodA, 0)} หน่วย/เดือน</b></div>
          <div class="sc-kv"><span>ประหยัดค่าไฟ</span><b>${baht(r.saveA)} บาท/เดือน</b></div>
          <div class="sc-kv"><span>ประหยัดต่อปี</span><b>${baht(r.saveA * 12)} บาท/ปี</b></div>
          <div class="sc-kv hl"><span>แพ็กเกจที่แนะนำ</span>${pkg(r.pkgA)}</div>
          ${pA != null ? `<div class="sc-kv"><span>ราคา Price List (${r.phase} เฟส)</span><b>${baht(pA)} บาท</b></div>` : ''}
          <div class="sc-kv"><span>คืนทุน (โดยประมาณ)</span><b>3 – 4 ปี</b></div>
          <button class="btn-mini sc-apply" data-scapply="A" ${r.pkgA == null ? 'disabled' : ''}>ใช้แพ็กเกจ A ในใบจอง →</button>
        </div>
        <div class="sc-card b">
          <div class="sc-ct">ทางเลือก B <span>กลางวัน + กลางคืนบางส่วน · มีแบตเตอรี่</span></div>
          <div class="sc-kv"><span>ขนาดติดตั้ง (คำนวณ)</span><b>${n2(r.kwpB)} kWp</b></div>
          <div class="sc-kv"><span>ขนาดแบตเตอรี่ (คำนวณ)</span><b>${n2(r.batt)} kWh</b></div>
          <div class="sc-kv"><span>ผลิตไฟฟ้าได้</span><b>${n2(r.prodB, 0)} หน่วย/เดือน</b></div>
          <div class="sc-kv"><span>ประหยัดค่าไฟ</span><b>${baht(r.saveB)} บาท/เดือน</b></div>
          <div class="sc-kv"><span>ประหยัดต่อปี</span><b>${baht(r.saveB * 12)} บาท/ปี</b></div>
          <div class="sc-kv hl"><span>แพ็กเกจที่แนะนำ</span>${pkg(r.pkgB)}</div>
          <div class="sc-kv hl"><span>แบตเตอรี่ที่แนะนำ</span>${r.pkgBatt == null ? '<b class="sc-over">เกินแพ็กเกจ</b>' : `<b>${r.pkgBatt}</b> kWh`}</div>
          ${pB != null ? `<div class="sc-kv"><span>ราคา Price List</span><b>${baht(pB + (pBat || 0))} บาท</b></div>` : ''}
          <div class="sc-kv"><span>คืนทุน (โดยประมาณ)</span><b>4 – 5 ปี</b></div>
          <button class="btn-mini sc-apply" data-scapply="B" ${r.pkgB == null ? 'disabled' : ''}>ใช้แพ็กเกจ B ในใบจอง →</button>
        </div>
      </div>
      <h4>❄ คำนวณจากแอร์</h4>
      ${inp('btu', 'ขนาดแอร์รวม', 'BTU')}
      <div class="sc-out"><span>กำลังไฟแอร์</span><b>${n2(r.ac)}</b><em>kW</em></div>
      <div class="sc-out"><span>ขนาดติดตั้งที่แนะนำ</span><b>${n2(r.acKwp)}</b><em>kWp</em></div>
      <div class="sc-foot">* ระยะเวลาคืนทุนเป็นค่าประมาณ ขึ้นกับพฤติกรรมการใช้ไฟจริง</div>`;
  }
  paint();

  async function saveAssumptions(btn) {
    const val = {};
    for (const k of FIXED) {
      const n = +String(editing[k] ?? '').replace(/,/g, '');
      if (!Number.isFinite(n) || n <= 0) { toast('กรอกตัวเลขมากกว่า 0 ให้ครบทุกช่อง', 'bad'); return; }
      val[k] = n;
    }
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      const { list, create, update } = await import('../services/data.js');
      const { clearSettings } = await import('../utils/settings.js');
      const rows = await list('settings', { fresh: true });
      const row = rows.find((x) => String(x.Title || '').trim() === ASSUME_SETTING);
      if (row) await update('settings', row.id, { Value: JSON.stringify(val) });
      else await create('settings', { Title: ASSUME_SETTING, Value: JSON.stringify(val), Description: 'สมมติฐาน Solar Calculator (ใบจองโซลาร์ FM-SMD-001) — แก้ที่ปุ่ม ⚙ ในกรอบสมมติฐานการคำนวณ' });
      clearSettings();
      Object.assign(v, val); editing = null;
      toast('✓ บันทึกสมมติฐานการคำนวณแล้ว');
    } catch (ex) {
      toast('บันทึกไม่สำเร็จ: ' + ex.message, 'bad');
      btn.disabled = false; btn.textContent = '💾 บันทึก';
      return;
    }
    paint();
  }

  // พิมพ์แล้วคำนวณใหม่ทันที โดยไม่วาดช่องที่กำลังพิมพ์ทับ (เคอร์เซอร์ไม่หลุด)
  body.addEventListener('toggle', (e) => { if (e.target.classList?.contains('sc-assume')) assumeOpen = e.target.open; }, true);
  body.addEventListener('input', (e) => {
    if (editing && e.target.dataset.as) { editing[e.target.dataset.as] = e.target.value; return; }
    const k = e.target.dataset.sc;
    if (!k || FIXED.includes(k)) return;
    v[k] = e.target.value;
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (ex) { /* ข้าม */ }
    clearTimeout(body._t);
    body._t = setTimeout(() => {
      const id = e.target.dataset.sc; const pos = e.target.selectionStart;
      const openDetails = body.querySelector('.sc-assume')?.open;
      paint();
      if (openDetails) body.querySelector('.sc-assume').open = true;
      const el = body.querySelector(`[data-sc="${id}"]`);
      if (el && el.tagName === 'INPUT') { el.focus(); try { el.setSelectionRange(pos, pos); } catch (ex) { /* ข้าม */ } }
    }, 300);
  });
  body.addEventListener('change', (e) => { if (e.target.dataset.sc === 'phase') { v.phase = e.target.value; paint(); } });
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-asact]');
    if (a) {
      e.preventDefault();   // ปุ่มอยู่ใน <summary> ไม่ให้พับกรอบ
      const act = a.dataset.asact;
      if (act === 'edit') editing = Object.fromEntries(FIXED.map((k) => [k, v[k]]));
      else if (act === 'cancel') editing = null;
      else if (act === 'default') editing = Object.fromEntries(FIXED.map((k) => [k, D[k]]));
      else if (act === 'save') { await saveAssumptions(a); return; }
      paint();
      return;
    }
    const b = e.target.closest('[data-scapply]');
    if (!b) return;
    const r = calc();
    const phase = r.phase === 3 ? '3 เฟส' : '1 เฟส';
    if (b.dataset.scapply === 'A') onApply({ kwp: r.pkgA, phase });
    else onApply({ kwp: r.pkgB, kwh: r.pkgBatt, phase });
  });
}
