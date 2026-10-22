/**
 * ใบจองและสั่งซื้อระบบโซลาร์เซลล์ (FM-SMD-001) — ฝ่ายขายและการตลาด
 *
 * ราคาขาย (Price List) เป็นข้อมูลลับ → ห้ามใส่ในโค้ด (เว็บนี้เปิดสาธารณะบน GitHub)
 * เก็บใน SharePoint ตั้งค่าระบบ คีย์ SolarPriceList (JSON) แก้ได้ที่ จัดการข้อมูล → 💲 ราคาโซลาร์เซลล์
 *
 * เลขที่ใบเสนอราคา SMD-001-ปปดดลำดับ เช่น SMD-001-2610001 (ปี ค.ศ. 2 หลัก · เดือน · ลำดับ 3 หลัก เริ่มใหม่ทุกเดือน)
 * เก็บใน FormData.q_no · ออกตอนบันทึก แล้วตรวจซ้ำหลังบันทึก (ขายในงานมีหลายคนกดพร้อมกัน)
 */
import { list, listRecent, clearDataCache } from './data.js';

export const SOLAR_CODE = 'FM-SMD-001';
export const PRICE_SETTING = 'SolarPriceList';
export const isSolar = (code) => String(code || '').trim().toUpperCase() === SOLAR_CODE;

/** ค่าคงที่ที่ไม่ใช่ราคา */
export const PANEL_W = 650;              // แผง Jinko 650 W
export const TYPICAL_KWP = [5.2, 6.5, 9.75];
export const ROOF_TYPES = ['เมทัลชีท', 'กระเบื้องCPAC', 'อดามัส', 'ลอนคู่ (ไฟเบอร์ซีเมนต์)', 'อื่นๆ'];
export const BANK_ACCOUNT = 'ธนาคารกสิกรไทย  เลขที่ 133-8-67216-7 (บจก.ไพร์ม พาวเวอร์ เอ็นจิเนียริ่ง โปร)';
export const SCHEDULE = [
  { no: 1, text: 'เงินจอง (หักออกจากราคารวมทั้งสิ้น)', pct: null, due: 'วันที่ลงนาม' },
  { no: 2, text: 'ชำระเพื่อมัดจำสั่งอุปกรณ์ (นัดสำรวจหน้างานภายใน 15 วันหลังวันจ่ายเงินจอง)', pct: 50, due: 'วันที่สำรวจหน้างาน' },
  { no: 3, text: 'ติดตั้งระบบแล้วเสร็จ / ทดสอบระบบ', pct: 45, due: 'ภายใน 25-30 วัน' },
  { no: 4, text: 'ส่งมอบงานและเอกสารครบถ้วน', pct: 5, due: 'รอเอกสารจากการไฟฟ้า (MEA/PEA)' },
];
export const INCENTIVES = [
  'สิทธิลดหย่อนภาษีสำหรับการติดตั้ง Solar Rooftop (ตามที่จ่ายจริงสูงสุด 200,000 บาท)',
  'เงินสนับสนุนภาครัฐ (สูงสุด 50,000 บาท/ครัวเรือน ตามประกาศของโครงการ)',
  'โครงการรับซื้อไฟฟ้าส่วนเกินคืนการไฟฟ้า',
];
export const TERMS = [
  ['ราคาและโปรโมชั่น', 'ราคาและส่วนลดนี้ใช้เฉพาะผู้จองภายในงาน ราคาสุดท้ายอาจปรับตามผลสำรวจหน้างานจริง โดยบริษัทจะแจ้งให้ทราบก่อนดำเนินการ'],
  ['เงินจอง', 'เงินจอง {deposit} บาท เป็นส่วนหนึ่งของราคารวมทั้งสิ้น และชำระในวันลงนาม'],
  ['การยกเลิก', '(ก) ผู้สั่งซื้อขอยกเลิกการจอง บริษัทขอสงวนสิทธิ์ไม่คืนเงินจอง (ข) บริษัทไม่สามารถติดตั้งได้ตามผลสำรวจ หรือสินเชื่อไม่ได้รับอนุมัติและผู้สั่งซื้อประสงค์ยกเลิก บริษัทคืนเงินจองเต็มจำนวน'],
  ['สิทธิภาครัฐและภาษี', 'เป็นไปตามประกาศ หลักเกณฑ์ และการอนุมัติของหน่วยงานรัฐ บริษัทไม่รับรองการได้รับสิทธิหรือจำนวนเงิน ผู้สั่งซื้อต้องเป็นเจ้าของมิเตอร์ หรือได้รับอนุญาตจากเจ้าของมิเตอร์'],
  ['การขออนุญาต', 'บริษัทดำเนินการขออนุญาตกับหน่วยงานที่เกี่ยวข้อง ระยะเวลาขึ้นกับหน่วยงานนั้น ผู้สั่งซื้อช่วยจัดเตรียมเอกสารที่เกี่ยวข้อง'],
  ['การรับประกัน', 'ประกันงานติดตั้ง 2 ปี และล้างแผงฟรี 1 ครั้ง/ปี นาน 2 ปี ส่วนตัวอุปกรณ์รับประกันตามเงื่อนไขของผู้ผลิต'],
  ['ข้อมูลส่วนบุคคล', 'ผู้สั่งซื้อยินยอมให้บริษัทเก็บ ใช้ และเปิดเผยข้อมูลเท่าที่จำเป็น เพื่อดำเนินการตามใบจองนี้ รวมถึงการขออนุญาตและสิทธิต่อหน่วยงานที่เกี่ยวข้อง'],
];

/* ───────── ราคา (จาก SharePoint) ───────── */

/** โครงตั้งต้นว่าง ๆ (ไม่มีราคา) — ผู้ดูแลกรอกในหน้า 💲 ราคาโซลาร์เซลล์ */
export const EMPTY_PRICES = () => ({
  vat: 7, deposit: 2000, optimizerUnit: 0, touPrice: 0, card: '',
  pv: { 1: [], 3: [] },            // [{ kwp, list, discount, min }]
  battery: [],                     // [{ kwh, model, parts, list, discount, min }]
  structure: [],                   // [{ kwp, panels, list, min }] โครงสร้างพิเศษ (ลูกปูนบนดาดฟ้า)
  smartguard: { 1: { model: 'SMARTGUARD-63A-S0', list: 0, min: 0 }, 3: { model: 'SMARTGUARD-63A-T0', list: 0, min: 0 } },
});

let priceCache = null;
/** ราคาจากตั้งค่าระบบ · ยังไม่ได้ตั้ง → null */
export async function loadSolarPrices({ fresh = false } = {}) {
  if (priceCache && !fresh) return priceCache;
  try {
    const { settings, clearSettings } = await import('../utils/settings.js');
    if (fresh) clearSettings();
    const raw = String((await settings())[PRICE_SETTING] || '').trim();
    if (!raw) return null;
    priceCache = normalizePrices(JSON.parse(raw));
    return priceCache;
  } catch (e) {
    console.warn('อ่านราคาโซลาร์ไม่สำเร็จ:', e.message);
    return null;
  }
}
export const clearSolarPrices = () => { priceCache = null; };

const num = (v) => { const n = +String(v ?? '').replace(/[,\s]/g, ''); return Number.isFinite(n) ? n : 0; };
export function normalizePrices(p = {}) {
  const e = EMPTY_PRICES();
  const rows = (a, keys) => (Array.isArray(a) ? a : []).map((r) => Object.fromEntries(keys.map((k) => [k, k === 'model' || k === 'parts' ? String(r[k] ?? '') : num(r[k])])))
    .filter((r) => r.kwp || r.kwh);
  return {
    vat: p.vat != null ? num(p.vat) : e.vat,
    deposit: p.deposit != null ? num(p.deposit) : e.deposit,
    optimizerUnit: num(p.optimizerUnit),
    touPrice: num(p.touPrice),
    card: String(p.card || ''),
    pv: { 1: rows(p.pv && p.pv[1], ['kwp', 'list', 'discount', 'min']).sort((a, b) => a.kwp - b.kwp),
          3: rows(p.pv && p.pv[3], ['kwp', 'list', 'discount', 'min']).sort((a, b) => a.kwp - b.kwp) },
    battery: rows(p.battery, ['kwh', 'model', 'parts', 'list', 'discount', 'min']).sort((a, b) => a.kwh - b.kwh),
    structure: rows(p.structure, ['kwp', 'panels', 'list', 'min']).sort((a, b) => a.kwp - b.kwp),
    smartguard: {
      1: { ...e.smartguard[1], ...(p.smartguard && p.smartguard[1]), list: num(p.smartguard?.[1]?.list), min: num(p.smartguard?.[1]?.min) },
      3: { ...e.smartguard[3], ...(p.smartguard && p.smartguard[3]), list: num(p.smartguard?.[3]?.list), min: num(p.smartguard?.[3]?.min) },
    },
  };
}

/** ขนาดระบบที่มีราคาของแต่ละเฟส */
export const sizesFor = (prices, phase) => ((prices && prices.pv[phase]) || []).map((r) => r.kwp);
/** จำนวนแผงจากขนาดระบบ (แผง 650 W) */
export const panelsFor = (kwp) => (num(kwp) ? Math.round((num(kwp) * 1000) / PANEL_W) : 0);
const same = (a, b) => Math.abs(num(a) - num(b)) < 0.001;

/**
 * คำนวณราคาจากคำตอบในฟอร์ม
 * คืน { lines:[{key,label,list,discount,min}], gross, discount, net, vat, total, minimum, belowMin, deposit, balance, schedule, missing }
 * ส่วนลด: ส่วนลดในงานตามราคา (แก้ได้ที่ช่องส่วนลดโปรโมชั่น) + ส่วนลดเพิ่ม (extra_discount)
 */
export function computeQuote(v = {}, prices) {
  const p = prices || EMPTY_PRICES();
  const phase = String(v.phase || '1').startsWith('3') ? 3 : 1;
  const kwp = num(v.size === 'other' ? v.size_other : v.size);
  const panels = num(v.panels) || panelsFor(kwp);
  const lines = [];
  const missing = [];
  const pv = (p.pv[phase] || []).find((r) => same(r.kwp, kwp));
  if (kwp) {
    if (pv) lines.push({ key: 'pv', label: `ระบบโซลาร์เซลล์ ${kwp.toFixed(2)} kWp (${phase} เฟส)`, list: pv.list, discount: pv.discount, min: pv.min });
    else missing.push(`ราคาระบบ ${kwp} kWp ${phase} เฟส`);
  }
  if (v.system_type === 'Hybrid' && num(v.battery_kwh)) {
    const b = p.battery.find((r) => same(r.kwh, v.battery_kwh));
    if (b) lines.push({ key: 'battery', label: `แบตเตอรี่ ${b.kwh} kWh${b.model ? ` (${b.model})` : ''}`, list: b.list, discount: b.discount, min: b.min });
    else missing.push(`ราคาแบตเตอรี่ ${v.battery_kwh} kWh`);
  }
  const extra = (key, label, price, min = price) => { if (v[key]) lines.push({ key, label, list: num(price), discount: 0, min: num(min) }); };
  extra('opt_tou', 'มิเตอร์ TOU', v.price_tou !== undefined && v.price_tou !== '' ? v.price_tou : p.touPrice);
  extra('opt_optimizer', `Optimizer ${panels} ตัว`, v.price_optimizer !== undefined && v.price_optimizer !== '' ? v.price_optimizer : panels * p.optimizerUnit, panels * p.optimizerUnit);
  const sg = p.smartguard[phase] || {};
  extra('opt_smartguard', `Smart Guard ${sg.model || ''} (${phase} เฟส)`, v.price_smartguard !== undefined && v.price_smartguard !== '' ? v.price_smartguard : sg.list, sg.min || sg.list);
  const st = p.structure.find((r) => same(r.kwp, kwp));
  extra('opt_structure', 'โครงสร้างพิเศษ', v.price_structure !== undefined && v.price_structure !== '' ? v.price_structure : (st ? st.list : 0), st ? st.min : 0);

  const gross = lines.reduce((s, l) => s + num(l.list), 0);
  const autoDisc = lines.reduce((s, l) => s + num(l.discount), 0);
  const discount = v.discount !== undefined && v.discount !== '' ? num(v.discount) : autoDisc;
  const net = Math.max(0, gross - discount);
  const vat = Math.round(net * (num(p.vat) / 100) * 100) / 100;
  const total = Math.round((net + vat) * 100) / 100;
  const minimum = lines.reduce((s, l) => s + num(l.min), 0);
  const deposit = v.deposit_amount !== undefined && v.deposit_amount !== '' ? num(v.deposit_amount) : num(p.deposit);
  const balance = Math.max(0, total - deposit);
  const schedule = SCHEDULE.map((s) => ({ ...s, amount: s.pct == null ? deposit : Math.round(balance * s.pct) / 100 }));
  return { phase, kwp, panels, lines, gross, autoDisc, discount, net, vat, total, minimum, belowMin: !!minimum && net < minimum, deposit, balance, schedule, missing };
}

/* ───────── เลขที่ใบเสนอราคา ───────── */

const clean = (v) => String(v ?? '').trim();
const dataOf = (r) => { try { return JSON.parse((r && r.FormData) || '{}') || {}; } catch (e) { return {}; } };
export const isSolarRequest = (r) => !!r && (isSolar(r.FormCode) || /^FM-SMD-001-/i.test(clean(r.Title)));
export const quotePeriod = (d = new Date()) => `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
const normQ = (s) => clean(s).toUpperCase().replace(/\s+/g, '');

/** เลขที่ใบเสนอราคาถัดไปของเดือนนี้ */
export function nextQuoteNo(rows, { date = new Date(), excludeId = null } = {}) {
  const per = quotePeriod(date);
  const re = new RegExp(`^SMD-001-${per}(\\d{3,})$`);
  let max = 0;
  rows.filter((r) => isSolarRequest(r) && String(r.id) !== String(excludeId)).forEach((r) => {
    const m = normQ(dataOf(r).q_no).match(re);
    if (m) max = Math.max(max, +m[1]);
  });
  return `SMD-001-${per}${String(max + 1).padStart(3, '0')}`;
}

/** คำขอของเดือนนี้ทั้งหมด (อ่านสด) — ใช้ชุดคำขอล่าสุด 62 วัน ไม่ต้องโหลดทั้ง List ตอนคนจองพร้อมกันเยอะ */
const recentFresh = async () => {
  clearDataCache('requests');
  return listRecent('requests', { days: 62, statuses: [] }).catch(() => list('requests'));
};
export const previewQuoteNo = async () => nextQuoteNo(await recentFresh());

/**
 * ออกเลขให้คำขอที่เพิ่งบันทึก (id) แล้วตรวจซ้ำ · ชนกับใบที่บันทึกก่อน (id น้อยกว่า) → ขยับเลขถัดไป
 * หลายคนกดพร้อมกัน: ทุกคนตรวจซ้ำหลังบันทึก คนที่บันทึกทีหลังเป็นฝ่ายขยับ
 */
export async function assignQuoteNo(id, { tries = 6 } = {}) {
  const { get, update } = await import('./data.js');
  for (let i = 0; i < tries; i++) {
    const all = await recentFresh();
    const me = all.find((r) => String(r.id) === String(id)) || await get('requests', id);
    const v = dataOf(me);
    let no = normQ(v.q_no);
    const clash = no && all.some((r) => isSolarRequest(r) && String(r.id) !== String(id)
      && normQ(dataOf(r).q_no) === no && +r.id < +id);
    if (no && !clash) return no;
    no = nextQuoteNo(all, { excludeId: id });
    await update('requests', id, { FormData: JSON.stringify({ ...v, q_no: no }) });
    // ถอยสุ่มเล็กน้อย กันหลายเครื่องขยับเลขชนกันซ้ำ
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 400));
  }
  clearDataCache('requests');
  return normQ(dataOf(await get('requests', id)).q_no);
}

/* ───────── ช่องข้อมูล (ใช้แสดงในหน้าติดตามสถานะ ทะเบียน คู่มือ) ───────── */
const F = (FieldKey, Title, FieldType = 'text', Section = '', extra = {}) => ({ FieldKey, Title, FieldType, Section, IsActive: true, ...extra });
export const SOLAR_FIELDS = [
  F('q_no', 'เลขที่ใบเสนอราคา', 'text', 'ใบเสนอราคา'),
  F('q_date', 'วันที่', 'date', 'ใบเสนอราคา', { IsRequired: 'Yes' }),
  F('sales_name', 'ที่ปรึกษาการขาย', 'text', 'ใบเสนอราคา', { IsRequired: 'Yes' }),
  F('sales_tel', 'โทร (ที่ปรึกษาการขาย)', 'text', 'ใบเสนอราคา'),
  F('c_title', 'คำนำหน้า', 'choice', '1. ข้อมูลผู้สั่งซื้อ', { Options: 'นาย\nนาง\nนางสาว' }),
  F('c_type', 'ประเภท', 'choice', '1. ข้อมูลผู้สั่งซื้อ', { Options: 'บุคคลธรรมดา\nนิติบุคคล' }),
  F('c_name', 'ชื่อ-นามสกุล / ชื่อนิติบุคคล', 'text', '1. ข้อมูลผู้สั่งซื้อ', { IsRequired: 'Yes' }),
  F('c_id', 'เลขบัตรประชาชน / เลขผู้เสียภาษี', 'text', '1. ข้อมูลผู้สั่งซื้อ'),
  F('c_phone', 'โทรศัพท์', 'text', '1. ข้อมูลผู้สั่งซื้อ', { IsRequired: 'Yes' }),
  F('c_address', 'ที่อยู่ตามบัตรประชาชน', 'textarea', '1. ข้อมูลผู้สั่งซื้อ'),
  F('site_same', 'ที่อยู่ติดตั้งเดียวกับบัตรประชาชน', 'yesno', '1. ข้อมูลผู้สั่งซื้อ'),
  F('site_address', 'ที่อยู่สถานที่ติดตั้ง', 'textarea', '1. ข้อมูลผู้สั่งซื้อ'),
  F('meter_owner', 'เจ้าของมิเตอร์ไฟฟ้า', 'choice', '1. ข้อมูลผู้สั่งซื้อ', { Options: 'ผู้สั่งซื้อเอง\nผู้อื่น' }),
  F('meter_owner_name', 'ชื่อเจ้าของมิเตอร์', 'text', '1. ข้อมูลผู้สั่งซื้อ'),
  F('c_email', 'อีเมล', 'text', '1. ข้อมูลผู้สั่งซื้อ'),
  F('c_line', 'ไอดีไลน์', 'text', '1. ข้อมูลผู้สั่งซื้อ'),
  F('size', 'ขนาดระบบ (kWp)', 'text', '2. รายการสั่งซื้อ', { IsRequired: 'Yes' }),
  F('size_other', 'ขนาดระบบอื่น (kWp)', 'text', '2. รายการสั่งซื้อ'),
  F('system_type', 'ประเภทระบบ', 'choice', '2. รายการสั่งซื้อ', { Options: 'On-Grid\nHybrid' }),
  F('phase', 'ระบบไฟฟ้า', 'choice', '2. รายการสั่งซื้อ', { Options: '1 เฟส\n3 เฟส' }),
  F('roof', 'ชนิดหลังคา', 'choice', '2. รายการสั่งซื้อ', { Options: ROOF_TYPES.join('\n') }),
  F('roof_other', 'ชนิดหลังคาอื่น', 'text', '2. รายการสั่งซื้อ'),
  F('panels', 'แผงโซลาร์เซลล์ Jinko 650 W (แผง)', 'number', '3. อุปกรณ์หลัก'),
  F('inverter_qty', 'อินเวอร์เตอร์ Huawei (เครื่อง)', 'number', '3. อุปกรณ์หลัก'),
  F('inverter_kw', 'อินเวอร์เตอร์ (kW / เครื่อง)', 'number', '3. อุปกรณ์หลัก'),
  F('battery_kwh', 'แบตเตอรี่ Huawei (kWh)', 'number', '3. อุปกรณ์หลัก'),
  F('opt_tou', 'มิเตอร์ TOU', 'yesno', '4. อุปกรณ์เสริม'),
  F('opt_optimizer', 'Optimizer', 'yesno', '4. อุปกรณ์เสริม'),
  F('opt_smartguard', 'Smart Guard', 'yesno', '4. อุปกรณ์เสริม'),
  F('opt_structure', 'โครงสร้างพิเศษ', 'yesno', '4. อุปกรณ์เสริม'),
  F('incentives', 'สิทธิประโยชน์ภาครัฐที่ประสงค์ใช้', 'multichoice', '5. สิทธิประโยชน์ภาครัฐ', { Options: INCENTIVES.join('\n') }),
  F('pay_option', 'วิธีชำระค่าระบบ', 'choice', '6. วิธีชำระค่าระบบ', { Options: 'ชำระเงินเอง\nเครื่องรูดบัตร k-bank 0% 10 เดือน\nขอสินเชื่อธนาคาร' }),
  F('loan_bank', 'ธนาคาร (สินเชื่อ)', 'text', '6. วิธีชำระค่าระบบ'),
  F('q_gross', 'ราคาก่อนส่วนลด (บาท)', 'currency', '7. ราคาและส่วนลด'),
  F('q_discount', 'ส่วนลดโปรโมชั่น (บาท)', 'currency', '7. ราคาและส่วนลด'),
  F('q_net', 'ราคาสุทธิ ก่อน VAT (บาท)', 'currency', '7. ราคาและส่วนลด'),
  F('q_vat', 'VAT 7% (บาท)', 'currency', '7. ราคาและส่วนลด'),
  F('q_total', 'รวมทั้งสิ้น (บาท)', 'currency', '7. ราคาและส่วนลด'),
  F('deposit_method', 'วิธีชำระเงินจอง', 'choice', '8. เงินจอง', { Options: 'เงินสด\nโอนผ่านธนาคาร\nบัตรเครดิต' }),
  F('deposit_account_name', 'ชื่อบัญชีผู้โอน', 'text', '8. เงินจอง'),
  F('deposit_amount', 'จำนวนเงินจอง (บาท)', 'currency', '8. เงินจอง'),
  F('deposit_date', 'วันที่ชำระเงินจอง', 'date', '8. เงินจอง'),
  F('deposit_receiver', 'ผู้รับเงิน', 'text', '8. เงินจอง'),
  F('survey_date', 'วันที่นัดสำรวจ', 'date', '9. งวดการชำระเงิน'),
];
