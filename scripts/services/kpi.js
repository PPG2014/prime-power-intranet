/**
 * ประเมิน KPI ประจำปี — คิดคะแนน เกรด สิทธิ์โบนัส และขั้นตอนของใบ
 *
 * วิธีคิดคะแนน (ตามไฟล์ Excel ของฝ่ายบุคคล):
 *   ให้คะแนนรายข้อ 0–10 (ทีละ 0.5) ตามเกณฑ์การประเมิน
 *   คะแนนของข้อ   = คะแนน ÷ 10 × น้ำหนักรายข้อ
 *   คะแนนของหมวด  = ผลรวมคะแนนของข้อ × (น้ำหนักหมวด ÷ น้ำหนักรายข้อรวมของหมวด)
 *   คะแนนของ Part = ผลรวมทุกหมวด (เต็ม 100)
 *   ผลสุดท้ายของแต่ละ Part = ผู้บังคับบัญชา 50% + ผู้บริหาร (MD) 50% · คะแนนประเมินตนเองไม่นำมาคิด
 *   คะแนนสุดท้าย = Part 1 50% + Part 2 50%
 *
 * ขั้นตอนของใบ KPI (ต่างจากแบบผ่านงาน):
 *   หัวหน้ากำหนดหัวข้อเฉพาะตำแหน่ง → ฝ่ายบุคคลตรวจหัวข้อ + เปิดให้ประเมินตนเอง → บุคลากรประเมินตนเอง
 *   → ผู้บังคับบัญชาประเมินและลงนาม → ฝ่ายบุคคลตรวจสอบ ส่งให้ผู้บริหาร → ผู้บริหาร (MD) ประเมินและลงนาม
 *   → ฝ่ายบุคคลลงนาม (HR Final Check) → บุคลากรลงนามรับทราบ → เสร็จสมบูรณ์
 *   ใช้ชื่อสถานะเดิมของระบบ + ขั้นย่อยใน Extra.kpi.phase (ดู kpiPhase ใน appraisal.js)
 */
import { update } from './data.js';
import { kpiDef, resolveVer, loadKpiConfig } from './kpi-config.js';
import {
  clean, extraOf, addLog, answersOf, logOf, kpiFormOf, kpiCustomSet, kpiPhase, kpiFcBySelf, kpiFcWho, noSelf, S_SELF, S_MGR, S_HR, S_BOSS, S_ACK, DONE,
} from './appraisal.js';

export { loadKpiConfig, kpiPhase, kpiFcBySelf, kpiFcWho };
export const KPI_SET = 'ประเมิน KPI ประจำปี';
export const PARTS = [
  ['skill', 'Part 1: Skill / Functional Competency ผลสัมฤทธิ์งาน', 'ด้านสมรรถนะ'],
  ['behavior', 'Part 2: Behavioral Competency แบบประเมินพฤติกรรม', 'ด้านพฤติกรรม'],
];
export const FORM_LABEL = { GA: 'ฉบับบุคลากรทั่วไป (GA)', MG: 'ฉบับหัวหน้างาน / ผู้จัดการ (MG)' };
/** คะแนนที่เลือกได้รายข้อ 10, 9.5 … 0 */
export const SCALE = Array.from({ length: 21 }, (_, i) => (20 - i) / 2);

const num = (v) => (v === '' || v === null || v === undefined || isNaN(+v) ? null : +v);
const r2 = (n) => Math.round(n * 100) / 100;

/** แบบ MG หรือ GA จากระดับ/ตำแหน่งในทะเบียนบุคลากร */
export const formTypeOf = kpiFormOf;
export const kpiOf = (row) => extraOf(row || {}).kpi || {};
export const formOfRow = (row) => (kpiOf(row).form === 'MG' ? 'MG' : 'GA');
/** ชุดเกณฑ์ (รายปี) ที่ใบนี้ใช้ — จำไว้ตอนสร้างใบ · ใบเก่าที่ไม่ได้ระบุใช้ชุดปัจจุบัน */
export const verOf = (row) => resolveVer(kpiOf(row).ver);
/** เกณฑ์ให้คะแนนรายข้อ · ช่วงเกรด · เกณฑ์โบนัส ของชุดนั้น */
export const rubricOf = (ver) => kpiDef(ver).rubric;
export const gradesOf = (ver) => kpiDef(ver).grades;
export const bonusOf = (ver) => kpiDef(ver).bonus;

/** หมวดที่ให้หัวหน้ากำหนดหัวข้อเพิ่มเอง (key, ชื่อ, น้ำหนักสูงสุดที่เพิ่มได้) */
export const customSlots = (form, ver) => (kpiDef(ver).forms[form] || kpiDef(ver).forms.GA).skill
  .filter((c) => c.budget).map((c) => ({ key: `s${c.no}`, no: c.no, name: c.name, budget: c.budget }));

/**
 * หมวดและหัวข้อของ Part หนึ่ง พร้อมหัวข้อที่หัวหน้าเพิ่มเอง
 * คืน [{ key, no, name, weight, budget, items: [{ id, code, title, weight, custom }] }]
 */
export function catsOf(form, part, custom = {}, ver) {
  const p = part === 'skill' ? 's' : 'b';
  const F = kpiDef(ver).forms;
  return (F[form] || F.GA)[part].map((c) => {
    const key = `${p}${c.no}`;
    const items = c.items.map(([code, title, weight]) => ({ id: `${key}_${code}`, code, title, weight, custom: false }));
    (custom[key] || []).forEach((x, i) => {
      items.push({ id: x.id, code: `${c.no}.${c.items.length + i + 1}`, title: x.title, weight: +x.weight || 0, custom: true });
    });
    return { key, no: c.no, name: c.name, weight: c.weight, budget: c.budget || 0, items };
  });
}

/** คะแนนของ Part หนึ่งจากคะแนนรายข้อ { id: 0–10 } — คืน { score, complete, rated, total, cats: { key: คะแนนหมวด } } */
export function partScore(cats, ans = {}) {
  let score = 0; let rated = 0; let total = 0;
  const per = {};
  cats.forEach((c) => {
    const sumW = c.items.reduce((t, it) => t + (it.weight || 0), 0);
    let got = 0;
    c.items.forEach((it) => {
      total += 1;
      const v = num(ans[it.id]);
      if (v === null) return;
      rated += 1;
      got += (v / 10) * (it.weight || 0);
    });
    per[c.key] = sumW ? r2(got * (c.weight / sumW)) : 0;
    score += per[c.key];
  });
  return { score: r2(score), complete: total > 0 && rated === total, rated, total, cats: per };
}

/** เกรดตามช่วงคะแนนของชุดเกณฑ์ (มาตรฐาน: A 92–100 · B+ 85.5 · B 75 · C+ 64.5 · C 55 · D+ 45.5 · D 40 · F ต่ำกว่า 40) */
export const kpiGrade = (score, ver) => {
  const t = gradesOf(ver);
  return (t.find((g) => score >= g[0]) || t[t.length - 1]);
};
/** เกรด a ดีเท่ากับหรือดีกว่า b */
export const gradeAtLeast = (a, b, ver) => {
  const rank = gradesOf(ver).map((g) => g[1]);
  return rank.indexOf(a) > -1 && rank.indexOf(a) <= rank.indexOf(b);
};

/** คะแนนของผู้ประเมินแต่ละคนในใบนี้ */
export const ratingsOf = (row, who) => (who === 'md' ? (kpiOf(row).md || {}) : answersOf(row, who === 'self' ? 'self' : 'mgr'));

/**
 * สรุปคะแนนทั้งใบ (ใช้ทั้งตอนแสดงผลและตอนบันทึก)
 * ratings = { self, sup, md } (ไม่ส่งมา = อ่านจากใบ) · custom = หัวข้อเพิ่ม (ไม่ส่งมา = อ่านจากใบ)
 */
export function summarize(row, { ratings = {}, custom = null, form = null } = {}) {
  const f = form || formOfRow(row);
  const ver = verOf(row);
  const BONUS_RULE = bonusOf(ver);
  const cu = custom || kpiOf(row).custom || {};
  const r = {
    self: ratings.self || ratingsOf(row, 'self'),
    sup: ratings.sup || ratingsOf(row, 'sup'),
    md: ratings.md || ratingsOf(row, 'md'),
  };
  const out = { form: f, ver, parts: {} };
  PARTS.forEach(([part]) => {
    const cats = catsOf(f, part, cu, ver);
    const s = {};
    ['self', 'sup', 'md'].forEach((w) => { s[w] = partScore(cats, r[w]); });
    const has = (x) => x.rated > 0;
    const fin = has(s.sup) && has(s.md) ? r2((s.sup.score + s.md.score) / 2) : null;
    out.parts[part] = { cats, ...s, final: fin };
  });
  const sk = out.parts.skill; const bh = out.parts.behavior;
  const tot = (w) => (sk[w].rated || bh[w].rated ? r2((sk[w].score + bh[w].score) / 2) : null);
  out.total = { self: tot('self'), sup: tot('sup'), md: tot('md') };
  out.final = sk.final !== null && bh.final !== null ? r2((sk.final + bh.final) / 2) : null;
  out.grade = out.final !== null ? kpiGrade(out.final, ver)[1] : '';
  // สิทธิ์โบนัส: ผ่านเกณฑ์ขั้นต่ำครบทุกด้าน จากผู้ประเมินทั้งสองระดับ
  const g = (part, w) => (out.parts[part][w].rated ? kpiGrade(out.parts[part][w].score, ver)[1] : '');
  out.grades = {
    skill: { sup: g('skill', 'sup'), md: g('skill', 'md') },
    behavior: { sup: g('behavior', 'sup'), md: g('behavior', 'md') },
  };
  const ready = ['skill', 'behavior'].every((p) => out.grades[p].sup && out.grades[p].md);
  out.eligible = ready ? ['skill', 'behavior'].every((p) =>
    gradeAtLeast(out.grades[p].sup, BONUS_RULE[p], ver) && gradeAtLeast(out.grades[p].md, BONUS_RULE[p], ver)) : null;
  out.bonus = BONUS_RULE;
  return out;
}

/** หัวข้อเฉพาะตำแหน่ง: ตรวจว่าครบและน้ำหนักไม่เกิน · คืนข้อความปัญหา (ว่าง = ผ่าน) */
export function customProblems(form, custom = {}, ver) {
  const out = [];
  customSlots(form, ver).forEach((s) => {
    const rows = custom[s.key] || [];
    const sum = rows.reduce((t, x) => t + (+x.weight || 0), 0);
    rows.forEach((x, i) => {
      if (!clean(x.title)) out.push(`ข้อ ${s.no}: แถวที่ ${i + 1} ยังไม่ได้ใส่หัวข้อ`);
      if (!(+x.weight > 0)) out.push(`ข้อ ${s.no}: "${clean(x.title) || `แถวที่ ${i + 1}`}" ยังไม่ได้ใส่น้ำหนัก`);
    });
    if (sum > s.budget + 1e-9) out.push(`ข้อ ${s.no} ${s.name}: น้ำหนักรวม ${sum} เกินที่กำหนด ${s.budget}`);
  });
  return out;
}
/** หัวหน้ากำหนดหัวข้อเฉพาะตำแหน่งแล้วอย่างน้อย 1 ข้อ */
export const hasCustom = kpiCustomSet;

/* ───────── บันทึก ───────── */

const putKpi = (row, patch) => ({ ...extraOf(row), kpi: { ...kpiOf(row), ...patch } });

/** บันทึกหัวข้อเฉพาะตำแหน่ง (หัวหน้างาน / ฝ่ายบุคคล) */
export async function saveCustom(row, custom, by) {
  const bad = customProblems(formOfRow(row), custom, verOf(row));
  if (bad.length) throw new Error(bad.join('\n'));
  const n = Object.values(custom).reduce((t, a) => t + a.length, 0);
  return update('appraisals', row.id, {
    Extra: JSON.stringify(putKpi(row, { custom, customAt: new Date().toISOString(), customBy: by })),
    Log: addLog(row, `กำหนด Functional Competency เฉพาะตำแหน่ง ${n} ข้อ`, by),
  });
}

/** หัวหน้าส่งหัวข้อเฉพาะตำแหน่งให้ฝ่ายบุคคลตรวจสอบ */
export async function submitCustom(row, custom, by) {
  const bad = customProblems(formOfRow(row), custom, verOf(row));
  if (bad.length) throw new Error(bad.join('\n'));
  const n = Object.values(custom).reduce((t, a) => t + a.length, 0);
  return update('appraisals', row.id, {
    Extra: JSON.stringify(putKpi(row, { custom, customAt: new Date().toISOString(), customBy: by, phase: 'fcHr' })),
    Log: addLog(row, `${kpiFcWho(row)}กำหนด Functional Competency เฉพาะตำแหน่ง ${n} ข้อ ส่งให้ฝ่ายบุคคลตรวจสอบ`, by),
  });
}

/** ฝ่ายบุคคลส่งหัวข้อกลับให้หัวหน้าแก้ */
export async function returnCustom(row, note, by) {
  return update('appraisals', row.id, {
    Extra: JSON.stringify(putKpi(row, { phase: 'fc' })),
    Log: addLog(row, `ฝ่ายบุคคลส่งหัวข้อเฉพาะตำแหน่งกลับให้${kpiFcWho(row)}แก้`, by, note),
  });
}

/**
 * ฝ่ายบุคคลตรวจหัวข้อแล้ว เปิดให้บุคลากรประเมินตนเอง (กำหนดวันสุดท้ายได้)
 * รอบที่ไม่มีขั้นประเมินตนเอง → ส่งให้ผู้บังคับบัญชาประเมินเลย
 */
export async function approveCustom(row, { by, due = '', note = '' }) {
  const skip = noSelf(row);
  return update('appraisals', row.id, {
    ...(skip ? { Status: S_MGR } : {}),
    Extra: JSON.stringify(putKpi(row, { phase: 'self', selfDue: due || '', fcOk: { by, at: new Date().toISOString() } })),
    Log: addLog(row, skip ? 'ฝ่ายบุคคลตรวจหัวข้อแล้ว ส่งให้ผู้บังคับบัญชาประเมิน'
      : `ฝ่ายบุคคลตรวจหัวข้อแล้ว เปิดให้ประเมินตนเอง${due ? ` (ภายใน ${due})` : ''}`, by, note),
  });
}

/** ฝ่ายบุคคลตรวจผลของผู้บังคับบัญชาแล้ว ส่งให้ผู้บริหาร (MD) ประเมิน */
export async function hrToMd(row, { by, note = '' }) {
  return update('appraisals', row.id, {
    Status: S_BOSS,
    Extra: JSON.stringify(putKpi(row, { hrMid: { by, at: new Date().toISOString(), note } })),
    Log: addLog(row, 'ฝ่ายบุคคลตรวจสอบผลผู้บังคับบัญชา ส่งให้ผู้บริหารประเมิน', by, note),
  });
}

/**
 * บันทึกคะแนน — who: self | sup | md · submit = ส่งต่อขั้นถัดไป (ไม่ส่ง = บันทึกร่าง)
 * data = { ratings, rec: { skill:{s,i,d}, behavior:{…} }, comment, sign }
 */
export async function saveScores(row, who, data, by, submit = false) {
  const sum = summarize(row, { ratings: { [who]: data.ratings } });
  const x = extraOf(row);
  const k = { ...(x.kpi || {}) };
  if (data.rec) k.rec = { ...(k.rec || {}), [who]: data.rec };
  if (who === 'md') k.md = data.ratings;
  k.scores = { total: sum.total, final: sum.final, grade: sum.grade, grades: sum.grades, eligible: sum.eligible };
  const nx = { ...x, kpi: k };
  if (submit && data.sign) {
    const role = who === 'sup' ? 'evaluator' : who === 'md' ? 'approver' : '';
    if (role) nx.sign = { ...(x.sign || {}), [role]: { ...data.sign, at: new Date().toISOString(), ...(who === 'md' ? { approved: true } : {}) } };
  }
  const patch = { Extra: JSON.stringify(nx) };
  if (who === 'self') { patch.SelfData = JSON.stringify(data.ratings); patch.SelfScore = sum.total.self || 0; patch.SelfComment = data.comment || ''; }
  if (who === 'sup') { patch.MgrData = JSON.stringify(data.ratings); patch.MgrScore = sum.total.sup || 0; patch.MgrComment = data.comment || ''; }
  if (who === 'md') { patch.HeadComment = data.comment || ''; }
  if (sum.final !== null) { patch.FinalScore = sum.final; patch.Grade = sum.grade; }
  const next = { self: S_MGR, sup: S_HR, md: S_HR }[who];
  const label = { self: 'ส่งแบบประเมินตนเอง', sup: 'ผู้บังคับบัญชาประเมินและลงนาม ส่งให้ฝ่ายบุคคลตรวจสอบ', md: 'ผู้บริหารประเมินและลงนาม ส่งให้ฝ่ายบุคคลลงนาม' }[who];
  if (submit) { patch.Status = next; patch.Log = addLog(row, label, by, (data.sign && data.sign.note) || ''); }
  return update('appraisals', row.id, patch);
}

/** ฝ่ายบุคคลตรวจสอบขั้นสุดท้าย (HR Final Check) แล้วส่งให้บุคลากรรับทราบ */
export async function hrFinal(row, { sign, by, note = '' }) {
  const sum = summarize(row);
  if (sum.final === null) throw new Error('ยังไม่มีคะแนนครบทั้งผู้บังคับบัญชาและผู้บริหาร');
  const x = extraOf(row);
  x.sign = { ...(x.sign || {}), hr: { ...sign, at: new Date().toISOString() } };
  x.kpi = { ...(x.kpi || {}), scores: { total: sum.total, final: sum.final, grade: sum.grade, grades: sum.grades, eligible: sum.eligible } };
  return update('appraisals', row.id, {
    Status: S_ACK, FinalScore: sum.final, Grade: sum.grade, Extra: JSON.stringify(x),
    Log: addLog(row, 'ฝ่ายบุคคลลงนาม (HR Final Check) ส่งให้บุคลากรรับทราบ', by, note),
  });
}

/** ลำดับขั้นของใบ KPI (key ของ kpiSteps) */
export const KPI_ORDER = ['fc', 'fcHr', 'self', 'sup', 'hrMid', 'md', 'hr', 'ack', 'done'];
/** ขั้นปัจจุบันของใบ (key ใน KPI_ORDER) */
export function kpiStepKey(row) {
  const ph = kpiPhase(row);
  return { fc: 'fc', fcHr: 'fcHr', self: 'self', [S_MGR]: 'sup', mid: 'hrMid', [S_BOSS]: 'md', final: 'hr', [S_ACK]: 'ack', [DONE]: 'done' }[ph] || 'fc';
}

/** ขั้นตอนของใบ KPI สำหรับแถบสถานะ/Dashboard — คืน [{ key, label, state: done|now|wait|na, by, at }] */
export function kpiSteps(row, { noSelf: skipSelf = false } = {}) {
  const x = extraOf(row);
  const sg = x.sign || {};
  const k = x.kpi || {};
  const last = (re) => logOf(row).filter((l) => re.test(l.action || '')).slice(-1)[0] || {};
  const cur = KPI_ORDER.indexOf(kpiStepKey(row));
  const state = (key) => { const i = KPI_ORDER.indexOf(key); return i < cur ? 'done' : i === cur ? 'now' : 'wait'; };
  const steps = [
    { key: 'fc', label: `${kpiFcBySelf(row) ? 'ผู้จัดการ' : 'หัวหน้า'}กำหนด Functional Competency`, ...pick({ by: k.customBy, at: k.customAt }) },
    { key: 'fcHr', label: 'ฝ่ายบุคคลตรวจหัวข้อ · เปิดประเมินตนเอง', ...pick(k.fcOk) },
    ...(skipSelf ? [] : [{ key: 'self', label: 'บุคลากรประเมินตนเอง', ...pick(last(/ส่งแบบประเมินตนเอง/)) }]),
    { key: 'sup', label: 'ผู้บังคับบัญชาประเมินและลงนาม', ...pick(sg.evaluator, 'name') },
    { key: 'hrMid', label: 'ฝ่ายบุคคลตรวจสอบ · ส่งผู้บริหาร', ...pick(k.hrMid) },
    { key: 'md', label: 'ผู้บริหาร (MD) ประเมินและลงนาม', ...pick(sg.approver, 'name') },
    { key: 'hr', label: 'ฝ่ายบุคคลลงนาม (HR Final Check)', ...pick(sg.hr, 'name') },
    { key: 'ack', label: 'บุคลากรลงนามรับทราบ', ...pick(sg.employee, 'name') },
  ];
  return steps.map((s) => ({ ...s, state: state(s.key) }));
}
const pick = (o = {}, nameKey = 'by') => ({ by: o[nameKey] || o.by || '', at: o.at || '' });
