/**
 * เกณฑ์การประเมิน KPI ประจำปี — แก้ได้ที่ จัดการข้อมูล → 🎯 เกณฑ์ประเมิน KPI (เปลี่ยนทุกปี)
 *
 * เก็บในตั้งค่าระบบ KpiCriteria เป็น JSON
 *   { current: '2569', sets: { '2569': { forms, rubric, grades, bonus, note } } }
 *     forms  = { GA|MG: { skill|behavior: [{ no, name, weight, budget?, items: [[รหัส, ข้อความ, น้ำหนัก]] }] } }
 *     rubric = [[คะแนน, คำอธิบาย, ช่วงระดับ, เกรดเทียบ]]
 *     grades = [[คะแนนขั้นต่ำ, เกรด, ความหมาย]] เรียงจากสูงไปต่ำ
 *     bonus  = { skill: เกรดขั้นต่ำ Part 1, behavior: เกรดขั้นต่ำ Part 2 }
 *
 * แยกเป็นชุดรายปี: ใบประเมินจำชุดที่ใช้ตอนสร้าง (Extra.kpi.ver) — แก้ชุดปีใหม่ไม่กระทบใบของปีก่อน
 * ยังไม่มีค่าในตั้งค่าระบบ → ใช้ชุดมาตรฐานที่ติดมากับระบบ (services/kpi-forms.js)
 */
import { KPI_FORMS, KPI_RUBRIC } from './kpi-forms.js';

export const KPI_SETTING = 'KpiCriteria';
export const BUILTIN_VER = 'มาตรฐาน';
export const DEFAULT_GRADES = [[92, 'A', 'ดีเยี่ยม'], [85.5, 'B+', 'ดีมาก'], [75, 'B', 'ดี'], [64.5, 'C+', 'ค่อนข้างดี'],
  [55, 'C', 'พอใช้'], [45.5, 'D+', 'เกือบพอใช้'], [40, 'D', 'ต่ำกว่าเกณฑ์ ควรปรับปรุงอย่างยิ่ง'],
  [0, 'F', 'ต่ำกว่าเกณฑ์ที่กำหนด และไม่เป็นที่น่าพอใจ']];
export const DEFAULT_BONUS = { skill: 'C+', behavior: 'B' };

const copy = (o) => JSON.parse(JSON.stringify(o));
export const builtinSet = () => ({ forms: copy(KPI_FORMS), rubric: copy(KPI_RUBRIC), grades: copy(DEFAULT_GRADES), bonus: { ...DEFAULT_BONUS }, note: '' });

const num = (v, d = 0) => (isFinite(+v) && v !== '' && v !== null ? +v : d);
const txt = (v) => String(v ?? '').trim();

/** จัดรูปชุดเกณฑ์ให้ถูกต้องเสมอ (ข้อมูลเสีย/ขาด → ใช้ค่ามาตรฐานส่วนนั้น) */
export function normSet(s = {}) {
  const b = builtinSet();
  const cats = (arr, def) => (Array.isArray(arr) && arr.length ? arr : def).map((c, i) => ({
    no: num(c.no, i + 1), name: txt(c.name), weight: num(c.weight),
    ...(num(c.budget) > 0 ? { budget: num(c.budget) } : {}),
    items: (Array.isArray(c.items) ? c.items : []).map((it) => [txt(it[0]), txt(it[1]), num(it[2])]).filter((it) => it[1]),
  }));
  const forms = {};
  ['GA', 'MG'].forEach((f) => {
    const src = (s.forms && s.forms[f]) || {};
    forms[f] = { skill: cats(src.skill, b.forms[f].skill), behavior: cats(src.behavior, b.forms[f].behavior) };
  });
  const rubric = (Array.isArray(s.rubric) && s.rubric.length ? s.rubric : b.rubric)
    .map((r) => [num(r[0]), txt(r[1]), txt(r[2]), txt(r[3])]).sort((x, y) => x[0] - y[0]);
  const grades = (Array.isArray(s.grades) && s.grades.length ? s.grades : b.grades)
    .map((g) => [num(g[0]), txt(g[1]), txt(g[2])]).filter((g) => g[1]).sort((x, y) => y[0] - x[0]);
  if (!grades.length || grades[grades.length - 1][0] > 0) grades.push([0, 'F', '']);
  const ok = (g) => grades.some((x) => x[1] === g);
  const bonus = {
    skill: ok(s.bonus && s.bonus.skill) ? s.bonus.skill : (ok(DEFAULT_BONUS.skill) ? DEFAULT_BONUS.skill : grades[0][1]),
    behavior: ok(s.bonus && s.bonus.behavior) ? s.bonus.behavior : (ok(DEFAULT_BONUS.behavior) ? DEFAULT_BONUS.behavior : grades[0][1]),
  };
  return { forms, rubric, grades, bonus, note: txt(s.note) };
}

export function parseKpiConfig(raw) {
  let d = {};
  try { d = JSON.parse(String(raw || '').trim() || '{}') || {}; } catch (e) { d = {}; }
  const sets = {};
  Object.entries(d.sets || {}).forEach(([k, v]) => { if (txt(k)) sets[txt(k)] = normSet(v); });
  const current = sets[txt(d.current)] ? txt(d.current) : (Object.keys(sets).sort().pop() || BUILTIN_VER);
  return { current, sets };
}
export const formatKpiConfig = (cfg) => JSON.stringify(parseKpiConfig(JSON.stringify(cfg)));

let CFG = { current: BUILTIN_VER, sets: {} };
let BUILTIN = null;

/** อ่านเกณฑ์จากตั้งค่าระบบ — เรียกก่อนวาดหน้าที่ใช้ KPI (ผลถูกจำไว้ ใช้แบบ sync ได้) */
export async function loadKpiConfig({ fresh = false } = {}) {
  try {
    const { settings, clearSettings } = await import('../utils/settings.js');
    if (fresh) clearSettings();
    CFG = parseKpiConfig((await settings())[KPI_SETTING]);
  } catch (e) { /* ใช้ค่าเดิม */ }
  return CFG;
}
export const kpiConfig = () => CFG;
/** ชุดที่ใช้กับใบที่สร้างใหม่ */
export const currentKpiVer = () => CFG.current;
/** ชื่อชุดที่ใช้จริง (ชุดที่ระบุไม่มีแล้ว → ชุดปัจจุบัน) */
export const resolveVer = (ver) => (ver && (CFG.sets[ver] || ver === BUILTIN_VER) ? ver : CFG.current);
/** ชุดเกณฑ์ตามชื่อชุด */
export function kpiDef(ver) {
  const v = resolveVer(ver);
  if (CFG.sets[v]) return CFG.sets[v];
  if (!BUILTIN) BUILTIN = normSet(builtinSet());
  return BUILTIN;
}
