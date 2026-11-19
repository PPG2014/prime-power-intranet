/**
 * เกณฑ์ประเมินบุคลากรผ่านงาน (FM-HRM-004) แบบแก้ได้ — แยกเป็นชุด เหมือนเกณฑ์ KPI
 * เก็บในตั้งค่าระบบ ProbationCriteria (JSON):
 *   { current: 'ชื่อชุดที่ใช้กับรอบใหม่', sets: { 'ชื่อชุด': { secs, grades, scale, note } } }
 *     secs   = [{ name, weight, items: [{ id, title, weight }] }]   (ให้คะแนนรายข้อ 1–10)
 *     grades = [[คะแนนขั้นต่ำ, เกรด, ความหมาย, ผ่านทดลองงาน(true/false)]] เรียงจากสูงไปต่ำ
 *     scale  = { '10': 'คำอธิบาย', … }  คำอธิบายคะแนนที่ผู้ประเมินเห็นในใบ
 * ชุด "มาตรฐาน" = ตามเอกสาร Rev.02 ที่ติดมากับระบบ (แก้ไม่ได้ · คัดลอกไปแก้)
 * ใบประเมินจำชุดที่ใช้ตอนสร้างใบ (Extra.pbVer) — แก้ชุดใหม่ไม่กระทบใบเก่า
 */
export const PB_SETTING = 'ProbationCriteria';
export const PB_BUILTIN = 'มาตรฐาน';
export const PB_SCHEME = 'ทดลองงาน';

const PB_ITEMS = [
  { name: 'ผลลัพธ์ของงาน', weight: 50, items: [
    'ความรู้และทักษะในงาน (Technical / Job Knowledge)',
    'คุณภาพและความถูกต้องของงาน',
    'การวิเคราะห์และแก้ไขปัญหา (Problem Solving)',
    'การวางแผนและจัดลำดับความสำคัญ',
    'การใช้ระบบ เครื่องมือ และการจัดทำข้อมูล/เอกสาร',
    'การเรียนรู้และพัฒนางานอย่างต่อเนื่อง'] },
  { name: 'ผลพฤติกรรม', weight: 50, items: [
    'การปฏิบัติตามกฎ ระเบียบ และวินัยในการทำงาน',
    'ความมีประสิทธิภาพและประสิทธิผลในการทำงาน',
    'ความรู้ความสามารถในการเรียนรู้งานและพัฒนาตนเอง',
    'ภาวะผู้นำในตนเองและการบริหารงาน',
    'การสร้างความสัมพันธ์ที่ดีกับเพื่อนร่วมงานและการติดต่อสื่อสาร',
    'การมีส่วนร่วมกับองค์กร (ความมุ่งมั่นและตั้งใจ)'] },
];
export const PB_DEFAULT_GRADES = [[91, 'A', 'ดีเยี่ยม', true], [86, 'B+', 'ดีมาก', true], [81, 'B', 'ดี', true],
  [70, 'C', 'พอใช้', true], [0, 'F', 'ไม่ผ่านเกณฑ์', false]];
export const PB_DEFAULT_SCALE = { 10: 'ดีมาก', 1: 'ไม่ดี' };

const txt = (v) => String(v ?? '').trim();
const n = (v) => (isNaN(+v) ? 0 : +v);
const copy = (x) => JSON.parse(JSON.stringify(x));

/** ชุดมาตรฐาน (รหัสข้อ pb1–pb12 คงที่ ใบเก่าที่ไม่ได้จำชุดอ่านคะแนนได้เสมอ) */
export function builtinPb() {
  let k = 0;
  return {
    secs: PB_ITEMS.map((s) => ({ name: s.name, weight: s.weight, items: s.items.map((title) => {
      k += 1;
      return { id: `pb${k}`, title, weight: k <= 11 ? 8.33 : 8.37 };
    }) })),
    grades: copy(PB_DEFAULT_GRADES), scale: { ...PB_DEFAULT_SCALE }, note: '',
  };
}

/** รหัสข้อใหม่ (ไม่ซ้ำกับของเดิม เพื่อให้คะแนนในใบเก่าไม่ปน) */
export const newItemId = () => `pi${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function normPb(s = {}) {
  const b = builtinPb();
  const secs = (Array.isArray(s.secs) ? s.secs : b.secs).map((c) => ({
    name: txt(c.name), weight: n(c.weight),
    items: (Array.isArray(c.items) ? c.items : []).map((it) => ({ id: txt(it.id) || newItemId(), title: txt(it.title), weight: n(it.weight) })),
  }));
  const grades = (Array.isArray(s.grades) && s.grades.length ? s.grades : b.grades)
    .map((g) => [n(g[0]), txt(g[1]), txt(g[2]), g[3] !== false]).sort((x, y) => y[0] - x[0]);
  if (!grades.length || grades[grades.length - 1][0] > 0) grades.push([0, 'F', '', false]);
  const scale = {};
  Object.entries(s.scale && typeof s.scale === 'object' ? s.scale : b.scale).forEach(([k, v]) => {
    if (+k >= 1 && +k <= 10 && txt(v)) scale[+k] = txt(v);
  });
  return { secs, grades, scale, note: txt(s.note) };
}

export function parsePbConfig(raw) {
  let d = {};
  try { d = JSON.parse(txt(raw) || '{}') || {}; } catch (e) { d = {}; }
  const sets = {};
  Object.entries(d.sets || {}).forEach(([k, v]) => { if (txt(k) && txt(k) !== PB_BUILTIN) sets[txt(k)] = normPb(v); });
  const current = sets[txt(d.current)] ? txt(d.current) : PB_BUILTIN;
  return { current, sets };
}
export const formatPbConfig = (cfg) => JSON.stringify(parsePbConfig(JSON.stringify(cfg)));

let CFG = { current: PB_BUILTIN, sets: {} };
let BUILTIN = null;

/** อ่านเกณฑ์จากตั้งค่าระบบ (ผลถูกจำไว้ ใช้แบบ sync ได้) */
export async function loadPbConfig({ fresh = false } = {}) {
  try {
    const { settings, clearSettings } = await import('../utils/settings.js');
    if (fresh) clearSettings();
    CFG = parsePbConfig((await settings())[PB_SETTING]);
  } catch (e) { /* ใช้ค่าเดิม */ }
  return CFG;
}
export const pbConfig = () => CFG;
/** ชุดที่ใช้กับใบที่สร้างใหม่ */
export const currentPbVer = () => CFG.current;
/** ชื่อชุดที่ใช้จริง (ชุดที่ถูกลบไปแล้ว → ชุดปัจจุบัน) */
export const resolvePbVer = (ver) => (ver && (CFG.sets[ver] || ver === PB_BUILTIN) ? ver : CFG.current);
/** ชุดเกณฑ์ตามชื่อชุด */
export function pbDef(ver) {
  const v = resolvePbVer(ver);
  if (CFG.sets[v]) return CFG.sets[v];
  if (!BUILTIN) BUILTIN = normPb(builtinPb());
  return BUILTIN;
}
/** หัวข้อของชุด ในรูปแบบเดียวกับ criteria() ของหน้าประเมิน */
export const pbSecs = (ver) => pbDef(ver).secs.map((s) => ({
  name: s.name, weight: s.weight, items: s.items.map((it) => ({ ...it, scale: 10, hint: '' })),
}));
/** ชื่อเกณฑ์เกรดของชุด (ใช้กับ gradeOf) — "ทดลองงาน" = ชุดมาตรฐาน */
export const pbSchemeKey = (ver) => (resolvePbVer(ver) === PB_BUILTIN ? PB_SCHEME : `${PB_SCHEME}@${resolvePbVer(ver)}`);
/** ผลทดลองงานตามเกรด (true ผ่าน · false ไม่ผ่าน · null ไม่ทราบ) */
export function pbPass(ver, grade) {
  const g = pbDef(ver).grades.find((x) => x[1] === txt(grade));
  return g ? g[3] !== false : null;
}
/** ข้อความหัวตาราง "ให้คะแนน 1–10 (10 = …, 1 = …)" */
export function pbScaleText(ver) {
  const sc = pbDef(ver).scale;
  const parts = Object.keys(sc).map(Number).sort((a, b) => b - a).map((k) => `${k} = ${sc[k]}`);
  return parts.length ? parts.join(', ') : '10 = ดีมาก, 1 = ไม่ดี';
}
