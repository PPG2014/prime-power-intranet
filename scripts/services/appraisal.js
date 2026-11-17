/**
 * ระบบประเมินผลบุคลากร — ตรรกะกลาง
 *
 * แปลงจากต้นแบบ (เก็บใน localStorage) มาใช้ข้อมูลจริงของ intranet:
 *   - ผู้ใช้/ผู้บังคับบัญชา ใช้ทะเบียนบุคลากรเดิม (ช่อง Manager)
 *   - เก็บข้อมูลใน SharePoint 3 ลิสต์: AppraisalCycles / AppraisalCriteria / Appraisals
 *   - สิทธิ์อิงจากข้อมูลจริง ไม่มีการเลือกบทบาทเอง
 *
 * ขั้นตอน: (ประเมินตนเอง) → หัวหน้าประเมินและลงนาม
 *        → พนักงานรับทราบและลงนาม + ฝ่ายบุคคลตรวจสอบและลงนาม (ทำพร้อมกันได้ · สถานะ "ฝ่ายบุคคลตรวจสอบ")
 *        → ฝ่ายบุคคลส่งให้ผู้บริหาร (เมื่อครบ 3 ลายเซ็น) → ผู้บริหารรับทราบ/อนุมัติ (ลงนามหรือไม่ก็ได้) → เสร็จสมบูรณ์
 * สถานะ "พนักงานรับทราบ" เหลือไว้สำหรับใบเก่าที่ผู้บริหารอนุมัติไปก่อนพนักงานเซ็น
 */
import { list, create, update } from './data.js';
import { loadKpiConfig, currentKpiVer } from './kpi-config.js';

export const STAGES = ['ประเมินตนเอง', 'หัวหน้าประเมิน', 'ฝ่ายบุคคลตรวจสอบ', 'ผู้บริหารอนุมัติ', 'พนักงานรับทราบ'];
export const [S_SELF, S_MGR, S_HR, S_BOSS, S_ACK] = STAGES;
export const DONE = 'เสร็จสมบูรณ์';

/** เกรดตามคะแนนถ่วงน้ำหนัก 0–100 */
export const GRADE_SCHEMES = {
  // เกณฑ์ทั่วไป
  'มาตรฐาน': [[90, 'A', 'ดีเยี่ยม'], [80, 'B+', 'ดีมาก'], [70, 'B', 'ดี'],
    [60, 'C', 'พอใช้'], [0, 'D', 'ต้องปรับปรุง']],
  // ตาม FM-HRM-004 Rev.02 แบบประเมินผลระหว่างทดลองงาน
  'ทดลองงาน': [[91, 'A', 'ดีเยี่ยม'], [86, 'B+', 'ดีมาก'], [81, 'B', 'ดี'],
    [70, 'C', 'พอใช้'], [0, 'F', 'ไม่ผ่านเกณฑ์']],
  // ประเมิน KPI ประจำปี (คำอธิบายเกณฑ์การประเมิน 2569)
  KPI: [[92, 'A', 'ดีเยี่ยม'], [85.5, 'B+', 'ดีมาก'], [75, 'B', 'ดี'], [64.5, 'C+', 'ค่อนข้างดี'],
    [55, 'C', 'พอใช้'], [45.5, 'D+', 'เกือบพอใช้'], [40, 'D', 'ต่ำกว่าเกณฑ์ ควรปรับปรุงอย่างยิ่ง'],
    [0, 'F', 'ต่ำกว่าเกณฑ์ที่กำหนด และไม่เป็นที่น่าพอใจ']],
};
/** แบบประเมิน KPI ประจำปี (ใช้หัวข้อ/วิธีคิดคะแนนของ services/kpi.js) */
export const isKpiSet = (formSet) => /KPI/i.test(String(formSet || ''));
/**
 * ใบนี้เป็นใบ KPI หรือไม่ — ดูข้อมูล KPI ในใบ (Extra.kpi) ก่อน เพราะถ้าคอลัมน์ FormSet ใน SharePoint เป็น Choice
 * ที่ไม่มีตัวเลือก KPI ระบบจะบันทึกช่องนั้นไม่ได้ ใบจะได้ค่าเริ่มต้นของคอลัมน์แทน
 */
export const sheetIsKpi = (row) => !!(row && extraOf(row).kpi) || isKpiSet(row && row.FormSet);
/** เกณฑ์เกรดของชุดแบบประเมิน */
export const schemeOf = (formSet) => (isKpiSet(formSet) ? 'KPI' : /ทดลองงาน|ผ่านงาน/.test(String(formSet || '')) ? 'ทดลองงาน' : 'มาตรฐาน');
/**
 * แบบ KPI ที่ใช้: MG = หัวหน้างาน/ผู้จัดการขึ้นไป · GA = บุคลากรทั่วไป
 * ดูจากระดับในผังฝ่ายก่อน ไม่ได้ตั้งระดับดูจากชื่อตำแหน่ง
 */
export function kpiFormOf(person) {
  const lv = clean(person && person.Level);
  const pos = clean(person && person.Position);
  if (['ผู้บริหาร', 'รองผู้บริหาร', 'ผู้อำนวยการ', 'ผู้จัดการฝ่าย', 'รองผู้จัดการฝ่าย', 'ผู้จัดการแผนก'].includes(lv)) return 'MG';
  if (lv === 'เลขานุการ') return 'GA';
  return /หัวหน้า|ผู้จัดการ|ผู้อำนวยการ|กรรมการ|Supervisor|Manager/i.test(pos) ? 'MG' : 'GA';
}
/** เริ่มงานหลังวันตัดรอบ (CutoffDate ของรอบ KPI) → ไม่ต้องประเมินในรอบนี้ */
export const afterCutoff = (person, cycle) => {
  const cut = cycle && cycle.CutoffDate ? new Date(cycle.CutoffDate) : null;
  const start = person && person.StartDate ? new Date(person.StartDate) : null;
  return !!(cut && start && !isNaN(cut) && !isNaN(start) && start > cut);
};
export const GRADES = GRADE_SCHEMES['มาตรฐาน'];
export const gradeOf = (score, scheme = 'มาตรฐาน') => {
  const t = GRADE_SCHEMES[clean(scheme)] || GRADES;
  return t.find((g) => score >= g[0]) || t[t.length - 1];
};

export const clean = (v) => (v && typeof v === 'object'
  ? String(v.LookupValue ?? v.Title ?? '') : String(v ?? '')).trim();

const num = (v) => (isNaN(+v) ? 0 : +v);

/** ทุกรอบที่เปิดอยู่พร้อมกัน (เช่น ประเมินทดลองงานครั้งที่ 1 ของคนหนึ่ง กับครั้งที่ 2 ของอีกคน) */
export async function openCycles() {
  const rows = await list('appraisalCycles').catch(() => []);
  return rows.filter((c) => c.IsActive !== false && clean(c.Status) === 'เปิด');
}

/** รอบของใบประเมินใบหนึ่ง (จับจากชื่อรอบในใบ) */
export const cycleOfSheet = (row, cycles = []) =>
  cycles.find((c) => clean(c.Title) === clean(row && row.CycleName)) || null;

/** รอบประเมินที่เปิดใช้งานอยู่ (เอาแถวที่ IsActive ไม่ใช่ false และสถานะเปิด) */
export async function activeCycle() {
  const rows = await list('appraisalCycles').catch(() => []);
  const open = rows.filter((c) => c.IsActive !== false);
  return open.find((c) => clean(c.Status) === 'เปิด') || open[0] || null;
}


/**
 * แบบประเมินทดลองงาน FM-HRM-004 Rev.02 — ติดมากับระบบถาวร ไม่ต้องเพิ่มหัวข้อเอง
 * ถ้าอยากแก้หัวข้อหรือน้ำหนัก ให้เพิ่มแถวใน "หัวข้อประเมิน" โดยตั้งชุดให้ตรงกับรอบ
 * ระบบจะใช้หัวข้อที่เพิ่มเองแทนชุดมาตรฐานนี้ทันที
 */
export const PROBATION_FORM = [
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

/** ชุดหัวข้อมาตรฐานของแบบทดลองงาน (id คงที่ เพื่อให้คะแนนเก่าอ่านได้เสมอ) */
export function builtinProbation() {
  let n = 0;
  return PROBATION_FORM.map((sec) => ({
    name: sec.name, weight: sec.weight,
    items: sec.items.map((title) => {
      n += 1;
      return { id: `pb${n}`, title, weight: n <= 11 ? 8.33 : 8.37, scale: 10, hint: '' };
    }),
  }));
}

export const isProbationSet = (formSet) => /ทดลองงาน|ผ่านงาน/.test(String(formSet || ''));

/** หัวข้อประเมิน จัดกลุ่มตามหมวด พร้อมน้ำหนัก */
export async function criteria(formSet = '') {
  const rows = (await list('appraisalCriteria').catch(() => []))
    .filter((c) => c.IsActive !== false)
    .filter((c) => !formSet || clean(c.FormSet) === clean(formSet))
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));

  // ไม่มีหัวข้อที่ตั้งเอง และเป็นแบบทดลองงาน → ใช้ชุดมาตรฐานที่ติดมากับระบบ
  if (!rows.length && isProbationSet(formSet)) return builtinProbation();

  const secs = [];
  rows.forEach((r) => {
    const name = clean(r.Section) || 'หัวข้อประเมิน';
    let sec = secs.find((s) => s.name === name);
    if (!sec) { sec = { name, weight: num(r.SectionWeight), items: [] }; secs.push(sec); }
    if (num(r.SectionWeight)) sec.weight = num(r.SectionWeight);
    sec.items.push({
      id: String(r.id), title: clean(r.Title), weight: num(r.Weight),
      scale: num(r.Scale) === 10 ? 10 : 5,          // สเกลให้คะแนน 1–5 หรือ 1–10
      hint: clean(r.Hint),
    });
  });
  return secs;
}

/**
 * คะแนนถ่วงน้ำหนัก: ให้คะแนนข้อละ 1–5 แล้วเทียบเป็น 100 ตามน้ำหนักข้อ
 * ข้อที่ยังไม่ให้คะแนนจะไม่ถูกนับ (ใช้สัดส่วนของน้ำหนักที่ตอบแล้ว)
 */
export function scoreOf(secs, answers = {}) {
  let got = 0; let total = 0;
  secs.forEach((s) => s.items.forEach((it) => {
    const w = it.weight || 0;
    const max = it.scale || 5;
    const v = +answers[it.id];
    if (!w) return;
    total += w;
    if (v >= 1 && v <= max) got += (v / max) * w;
  }));
  const answeredW = secs.reduce((t, s) => t + s.items
    .filter((it) => +answers[it.id] >= 1).reduce((x, it) => x + (it.weight || 0), 0), 0);
  return {
    score: total ? Math.round((got / total) * 10000) / 100 : 0,
    answered: answeredW, totalWeight: total,
    complete: total > 0 && Math.abs(answeredW - total) < 0.001,
  };
}

const parse = (v) => { try { const x = JSON.parse(v || '{}'); return x && typeof x === 'object' ? x : {}; } catch (e) { return {}; } };
export const answersOf = (row, who) => parse(who === 'self' ? row.SelfData : row.MgrData);
export const extraOf = (row) => parse(row.Extra);
export const logOf = (row) => { const x = parse(row.Log); return Array.isArray(x.items) ? x.items : []; };

/** ใบประเมินทั้งหมดของรอบที่ระบุ */
export async function sheets(cycleName) {
  const rows = await list('appraisals').catch(() => []);
  return rows.filter((r) => !cycleName || clean(r.CycleName) === clean(cycleName));
}

/** ใบประเมินของฉัน / ของลูกทีม (เทียบด้วยอีเมล ชื่อไทยอาจสะกดต่างกัน) */
export const mineOf = (rows, email) => rows.find((r) =>
  clean(r.EmployeeEmail).toLowerCase() === String(email || '').toLowerCase());
export const teamOf = (rows, email) => rows.filter((r) =>
  clean(r.EvaluatorEmail).toLowerCase() === String(email || '').toLowerCase());

/** ขั้นตอนที่รออยู่ตรงกับรอบหรือไม่ (รอบล็อกขั้นไหน ทำได้เฉพาะขั้นนั้น) */
/**
 * ขั้นตอนที่ตั้งในรอบใช้ควบคุมแค่ 2 ขั้นแรก (ประเมินตนเอง / หัวหน้าประเมิน)
 * ขั้นฝ่ายบุคคล ผู้บริหาร และพนักงานรับทราบ ดูจากสถานะของใบนั้นโดยตรง
 * เพราะแต่ละใบเดินไม่พร้อมกัน ไม่ต้องรอ HR เลื่อนขั้นทั้งรอบ
 */
export function stageOpen(cycle, stage) {
  if (!cycle) return { ok: false, why: 'ยังไม่ได้เปิดรอบประเมิน' };
  if (clean(cycle.Status) !== 'เปิด') return { ok: false, why: `รอบ ${clean(cycle.Title)} ปิดรับข้อมูลแล้ว` };
  if (stage !== S_SELF && stage !== S_MGR) return { ok: true };
  const cur = clean(cycle.Stage) || S_SELF;
  if (cur === stage) return { ok: true };
  // เปิดขั้นหัวหน้าประเมินแล้ว คนที่ยังไม่ได้ประเมินตนเองยังส่งตามหลังได้
  // ไม่งั้นใบนั้นค้าง: พนักงานทำไม่ได้ หัวหน้าก็ยังทำไม่ได้เพราะใบยังไม่ถึงขั้นหัวหน้า
  if (stage === S_SELF && cur === S_MGR) return { ok: true, late: true };
  return { ok: false, why: `ขณะนี้ระบบเปิดเฉพาะขั้นตอน "${cur}"` };
}

/**
 * ระดับที่อนุมัติผลประเมินได้ (ใช้เมื่อใบนั้นไม่ได้กำหนดผู้อนุมัติไว้): ผู้จัดการฝ่ายขึ้นไป ยกเว้นเลขานุการ
 * "รองผู้จัดการฝ่าย" มีคำว่า ผู้จัดการฝ่าย อยู่ด้วย จึงต้องกันไว้ไม่ให้ผ่าน
 */
export const isApproverLevel = (level) =>
  /ผู้อำนวยการ|ผู้บริหาร|(?<!รอง)ผู้จัดการฝ่าย/.test(String(level || ''));

const lowEmail = (v) => clean(v).toLowerCase();

/** ผู้ตรวจสอบฝ่ายบุคคล / ผู้บริหารที่กำหนดไว้ในใบนี้ { hr: {name,email}, approver: {name,email} } */
export const rolesOf = (row) => extraOf(row || {}).roles || {};

/** ลายเซ็นในใบ { evaluator, employee, hr, approver } — แต่ละอันมี at เมื่อลงนามแล้ว */
export const signsOf = (row) => extraOf(row || {}).sign || {};
const signed = (x) => !!(x && x.at);
export const empSigned = (row) => signed(signsOf(row).employee);
export const hrSigned = (row) => signed(signsOf(row).hr);

/** รอพนักงานลงนามรับทราบอยู่หรือไม่ (ทำได้ตั้งแต่หัวหน้าประเมินเสร็จ พร้อมกับฝ่ายบุคคล) */
export const needsEmpSign = (row) => {
  const st = clean(row && row.Status);
  if (sheetIsKpi(row)) return st === S_ACK;
  return st === S_ACK || (st === S_HR && !empSigned(row));
};

/**
 * ใครตรวจสอบใบนี้ในขั้นฝ่ายบุคคลได้
 * กำหนดตัวไว้ในใบ → คนนั้น (และผู้ดูแลระบบ) · ไม่ได้กำหนด → ทุกคนในรายชื่อฝ่ายบุคคล
 */
export function canHrReview(row, { email, isHR = false, isAdmin = false }) {
  const hr = rolesOf(row).hr;
  if (hr && hr.email) return isAdmin || lowEmail(hr.email) === lowEmail(email);
  return isHR;
}

/**
 * ใครอนุมัติใบนี้ในขั้นผู้บริหารได้
 * กำหนดตัวไว้ในใบ → คนนั้น (และผู้ดูแลระบบ)
 * ไม่ได้กำหนด → ผู้จัดการฝ่ายขึ้นไปของฝ่ายเดียวกัน ยกเว้นคนที่เป็นผู้ประเมินใบนั้นเอง
 */
export function canBossApprove(row, { email, person = null, isAdmin = false }) {
  const ap = rolesOf(row).approver;
  if (ap && ap.email) return isAdmin || lowEmail(ap.email) === lowEmail(email);
  if (isAdmin) return true;
  // KPI ประจำปี: ผู้บริหารที่ประเมินคือ MD (ไม่ได้กำหนดตัวในใบ → กรรมการผู้จัดการ)
  if (sheetIsKpi(row)) return clean(person && person.Position) === 'กรรมการผู้จัดการ';
  return isApproverLevel(person && person.Level)
    && clean(row.Department) === clean(person && person.Department)
    && lowEmail(row.EvaluatorEmail) !== lowEmail(email);
}

/** ใบที่ผู้ใช้คนนี้ควรเห็นในแท็บ "อนุมัติผล" (รออนุมัติ + ผ่านแล้ว) */
export function inApproveScope(row, who) {
  const r = rolesOf(row);
  const me = lowEmail(who.email);
  if ((r.hr && lowEmail(r.hr.email) === me) || (r.approver && lowEmail(r.approver.email) === me)) return true;
  return canBossApprove(row, who);
}

/**
 * ใบที่รอผู้ใช้คนนี้ทำอยู่ตอนนี้ แยกตามแท็บของหน้าประเมิน — ใช้แสดงตัวเลขเตือน
 *   me      ใบของฉันที่ต้องประเมินตนเอง หรือรอลงนามรับทราบ
 *   team    ลูกทีมที่รอฉันให้คะแนน
 *   approve ใบที่รอฉันอนุมัติ หรือรอฉันตรวจสอบในฐานะฝ่ายบุคคลที่ถูกกำหนดตัวไว้
 *   all     ใบที่รอฝ่ายบุคคลตรวจสอบและไม่ได้กำหนดผู้ตรวจไว้ (เฉพาะฝ่ายบุคคล)
 */
export function appraisalTodo({ cycle, cycles = null, rows, email, person = null, isAdmin = false, isHR = false }) {
  const out = { me: 0, team: 0, approve: 0, all: 0, total: 0 };
  // หลายรอบเปิดพร้อมกันได้ — แต่ละใบใช้รอบของตัวเอง (ไม่ส่ง cycles มา ใช้รอบเดียวตามเดิม)
  const cyc = (r) => (cycles ? cycleOfSheet(r, cycles) : cycle);
  const open = (r) => { const c = cyc(r); return !!c && clean(c.Status) === 'เปิด'; };
  rows = rows.filter(open);
  const st = (r) => clean(r.Status);
  const who = { email, person, isAdmin, isHR };
  const me = lowEmail(email);

  // KPI: ขั้นประเมินตนเองแบ่งเป็น หัวหน้ากำหนดหัวข้อ → ฝ่ายบุคคลตรวจหัวข้อ → พนักงานประเมิน
  const ph = (r) => (sheetIsKpi(r) ? kpiPhase(r) : '');
  out.me = rows.filter((r) => lowEmail(r.EmployeeEmail) === me
    && ((st(r) === S_SELF && !noSelf(r) && stageOpen(cyc(r), S_SELF).ok && (!sheetIsKpi(r) || ph(r) === 'self'))
      // KPI แบบ MG: ผู้จัดการกำหนดหัวข้อเฉพาะตำแหน่งของตัวเอง
      || (st(r) === S_SELF && ph(r) === 'fc' && kpiFcBySelf(r))
      || needsEmpSign(r))).length;

  out.team = teamOf(rows, email).filter((r) => (st(r) === S_MGR && stageOpen(cyc(r), S_MGR).ok)
    // KPI แบบ GA: หัวหน้ากำหนด Functional Competency เฉพาะตำแหน่ง แล้วส่งให้ฝ่ายบุคคลตรวจ
    || (st(r) === S_SELF && ph(r) === 'fc' && !kpiFcBySelf(r))).length;

  // ฝ่ายบุคคลตรวจ: ตรวจหัวข้อ (KPI) · ตรวจผลก่อนส่งผู้บริหาร (KPI) · ตรวจสอบและลงนาม
  const hrTurn = (r) => st(r) === S_HR || (st(r) === S_SELF && ph(r) === 'fcHr');
  out.approve = rows.filter((r) => (st(r) === S_BOSS && canBossApprove(r, who))
    || (hrTurn(r) && lowEmail((rolesOf(r).hr || {}).email) === me)).length;
  out.all = isHR ? rows.filter((r) => hrTurn(r) && !(rolesOf(r).hr || {}).email).length : 0;

  out.total = out.me + out.team + out.approve + out.all;
  return out;
}

/**
 * ขั้นย่อยของใบ KPI (เก็บใน Extra.kpi.phase ไม่เพิ่มค่าในคอลัมน์ Status)
 *   สถานะ "ประเมินตนเอง":    fc   = หัวหน้ากำหนดหัวข้อเฉพาะตำแหน่ง
 *                            fcHr = ฝ่ายบุคคลตรวจหัวข้อ แล้วเปิดให้ประเมินตนเอง
 *                            self = พนักงานประเมินตนเอง
 *   สถานะ "ฝ่ายบุคคลตรวจสอบ": mid   = หลังผู้บังคับบัญชาประเมิน → ฝ่ายบุคคลตรวจแล้วส่งให้ผู้บริหาร
 *                            final = หลังผู้บริหารประเมิน → ฝ่ายบุคคลลงนาม ส่งให้พนักงานรับทราบ
 *   สถานะอื่นคืนชื่อสถานะเดิม
 */
export function kpiPhase(row) {
  const st = clean(row && row.Status);
  const x = extraOf(row || {});
  const k = x.kpi || {};
  if (st === S_SELF) {
    if (['fc', 'fcHr', 'self'].includes(k.phase)) return k.phase;
    return Object.keys(answersOf(row, 'self')).length ? 'self' : 'fc';
  }
  if (st === S_HR) return (x.sign && x.sign.approver && x.sign.approver.at) ? 'final' : 'mid';
  return st;
}

/**
 * ใครกำหนดหัวข้อเฉพาะตำแหน่ง (Functional Competency ตัวแดง)
 *   แบบ MG (หัวหน้างาน/ผู้จัดการ) → ผู้ถูกประเมินกำหนดเอง ผู้บังคับบัญชาแก้ไม่ได้
 *   แบบ GA (บุคลากรทั่วไป)       → ผู้บังคับบัญชากำหนด
 */
export const kpiFcBySelf = (row) => (extraOf(row || {}).kpi || {}).form === 'MG';
export const kpiFcWho = (row) => (kpiFcBySelf(row) ? 'ผู้จัดการ (ผู้ถูกประเมิน)' : 'หัวหน้างาน');

/** ใบ KPI นี้กำหนดหัวข้อเฉพาะตำแหน่งแล้ว */
export const kpiCustomSet = (row) => Object.values((extraOf(row).kpi || {}).custom || {}).some((a) => (a || []).length);

/** บันทึกประวัติการดำเนินการลงใบประเมิน */
export function addLog(row, action, by, note = '') {
  const items = logOf(row);
  items.push({ action, by, note, at: new Date().toISOString() });
  return JSON.stringify({ items });
}

/** กำหนดประเมินทดลองงาน นับจากวันเริ่มงาน */
export const ROUND_DAYS = [
  { key: 'r1', label: 'ประเมินครั้งที่ 1 (30 วัน)', days: 30 },
  { key: 'r2', label: 'ประเมินครั้งที่ 2 (60 วัน)', days: 60 },
  { key: 'r3', label: 'ประเมินครั้งที่ 3 (90 วัน)', days: 90 },
  { key: 'r4', label: 'ครบทดลองงาน 120 วัน', days: 120 },
];

/** กำหนดวันประเมินทุกครั้งจากวันเริ่มงาน (คืนค่าว่างถ้าไม่มีวันเริ่มงาน) */
export function roundsFrom(startDate) {
  const base = startDate ? new Date(startDate) : null;
  return ROUND_DAYS.map((r) => {
    if (!base || isNaN(base)) return { key: r.key, label: r.label, date: '' };
    const d = new Date(base);
    d.setDate(d.getDate() + r.days);
    return { key: r.key, label: r.label, date: d.toLocaleDateString('sv-SE') };
  });
}

/** แปลงชื่อครั้งที่ในรอบประเมิน เป็นคีย์ของวันในเอกสาร */
export const roundKey = (round) => {
  // จับเฉพาะ "ครั้งที่ 1–4" ของแบบผ่านงาน ค่าที่กำหนดเอง เช่น "ไตรมาส 1" ไม่ผูกกับช่องวันใด
  const m = String(round || '').match(/ครั้งที่\s*([1-4])/);
  return m ? `r${m[1]}` : '';
};

/**
 * วันที่ประเมินแต่ละครั้งของใบใหม่ — ไม่คำนวณจากวันเริ่มงาน ฝ่ายบุคคลเป็นผู้กำหนดเอง
 *   ครั้งนี้   → ใช้ "วันที่ประเมินครั้งนี้" ของรอบ
 *   ครั้งก่อน → ดึงจากใบเก่าของคนเดิม (เอกสาร FM-HRM-004 มีช่องวันที่ทั้ง 4 ครั้งในใบเดียว)
 *   ครั้งถัดไป → เว้นว่าง
 * startDate ไม่ได้ใช้แล้ว เก็บไว้ให้ผู้เรียกเดิมใช้ได้เหมือนเดิม
 */
export function mergeRounds(startDate, cycle, previousSheets = []) {
  const out = roundsFrom('');
  const now = ROUND_DAYS.findIndex((r) => r.key === roundKey(cycle.Round));
  previousSheets.forEach((r) => {
    let x = {};
    try { x = JSON.parse(r.Extra || '{}'); } catch (e) { x = {}; }
    (x.rounds || []).forEach((old) => {
      if (!old.date) return;
      const i = out.findIndex((o) => o.key === old.key);
      if (i > -1 && i < now) out[i].date = old.date;
    });
  });
  const k = roundKey(cycle.Round);
  const d = cycle.RoundDate ? String(cycle.RoundDate).slice(0, 10) : '';
  if (k && d) {
    const hit = out.find((o) => o.key === k);
    if (hit) hit.date = d;
  }
  return out;
}

/** สร้างใบประเมินให้บุคลากรทุกคนที่ยังไม่มีในรอบนี้ (ผู้ดูแลระบบกดสร้าง) */
export async function generateSheets(cycle, onProgress = () => {}) {
  const [dir, existing, allSheets] = await Promise.all([
    list('directory').catch(() => []),
    sheets(clean(cycle.Title)),
    sheets(''),                       // ใบของรอบก่อน ๆ ไว้ดึงวันที่ประเมินครั้งก่อนมาต่อ
  ]);
  const have = new Set(existing.map((r) => clean(r.EmployeeEmail).toLowerCase()));

  // รอบที่ระบุรายชื่อ (เช่น ประเมินทดลองงาน) จะสร้างเฉพาะคนในรายการเท่านั้น
  const onlyList = clean(cycle.Scope) === 'เฉพาะรายชื่อที่ระบุ';
  const wanted = new Set(String(cycle.Members || '').split(/\r?\n/)
    .map((x) => x.trim().toLowerCase()).filter(Boolean));

  const kpi = isKpiSet(cycle.FormSet);
  if (kpi) await loadKpiConfig({ fresh: true });     // ใบใหม่จำชุดเกณฑ์ปัจจุบันไว้
  const staff = dir.filter((p) => p.IsActive !== false && clean(p.Email)
    && !have.has(clean(p.Email).toLowerCase())
    && (!onlyList || wanted.has(clean(p.Email).toLowerCase()) || wanted.has(clean(p.Title).toLowerCase()))
    && !(kpi && afterCutoff(p, cycle)));

  const byName = new Map(dir.map((p) => [clean(p.Title), p]));
  let done = 0;
  let formSetDropped = 0;    // SharePoint ไม่รับค่า FormSet (คอลัมน์ Choice ไม่มีตัวเลือกนี้)
  const made = [];
  const failed = [];      // สร้างไม่สำเร็จ: "ชื่อ — สาเหตุ" แจ้งผู้ใช้ ไม่เก็บเงียบ
  for (const p of staff) {
    const ev = evaluatorFor(p, byName, kpi);
    // eslint-disable-next-line no-await-in-loop
    const row = await create('appraisals', {
      Title: `${clean(cycle.Title)} · ${clean(p.Title)}`,
      CycleName: clean(cycle.Title), FormSet: clean(cycle.FormSet),
      EmployeeName: clean(p.Title), EmployeeEmail: clean(p.Email),
      Department: clean(p.Department), Section: clean(p.Section),
      EvaluatorName: ev.name, EvaluatorEmail: ev.email,
      Status: firstStage(cycle), SelfScore: 0, MgrScore: 0, FinalScore: 0, Grade: '',
      SelfData: '{}', MgrData: '{}', Log: '{"items":[]}',
      // ดึงวันเริ่มงานจากทะเบียนบุคลากร · วันประเมินแต่ละครั้งฝ่ายบุคคลกำหนดเอง
      Extra: JSON.stringify({
        ...(firstStage(cycle) === S_MGR ? { noSelf: true } : {}),
        startDate: p.StartDate ? String(p.StartDate).slice(0, 10) : '',
        rounds: mergeRounds(p.StartDate, cycle,
          allSheets.filter((r) => clean(r.EmployeeEmail).toLowerCase() === clean(p.Email).toLowerCase())),
        ...(kpi ? { kpi: { form: kpiFormOf(p), ver: currentKpiVer() } } : {}),
      }),
    }).catch((e) => { failed.push(`${clean(p.Title)} — ${e.message}`); return null; });
    if (row) made.push(row);
    if (row && (row.dropped || []).some((d) => /^FormSet/.test(d))) formSetDropped += 1;
    done += 1;
    onProgress(done, staff.length);
  }
  const warn = formSetDropped ? [formSetWarn(cycle.FormSet, formSetDropped)] : [];
  return { created: made.length, skipped: existing.length, failed, warn,
    noManager: staff.filter((p) => !evaluatorFor(p, byName, kpi).name).length,
    cutoff: kpi ? dir.filter((p) => p.IsActive !== false && afterCutoff(p, cycle)).length : 0 };
}

/** ข้อความเตือนเมื่อ SharePoint ไม่รับค่าชุดแบบประเมินในใบ */
export const formSetWarn = (set, n) => `⚠️ SharePoint ไม่รับค่า "${clean(set)}" ในคอลัมน์ FormSet ของ List Appraisals (${n} ใบ)\n`
  + `  ให้เพิ่มตัวเลือก "${clean(set)}" ในคอลัมน์นี้ (List settings → FormSet) — ระหว่างนี้ระบบยังเปิดเป็นแบบที่ถูกต้องให้`;

/**
 * ผู้ประเมินของใบใหม่ = ผู้บังคับบัญชาในทะเบียนบุคลากร
 * KPI: ผู้บังคับบัญชาเป็นตัวเอง (ตั้งผิด) → เว้นว่างไว้ ให้ฝ่ายบุคคลกำหนดในหน้าสร้างแบบประเมิน ไม่ให้ประเมินตัวเอง
 */
function evaluatorFor(p, byName, kpi) {
  const name = clean(p.Manager);
  if (!name || (kpi && name === clean(p.Title))) return { name: '', email: '' };
  const mgr = byName.get(name);
  if (kpi && mgr && clean(mgr.Email).toLowerCase() === clean(p.Email).toLowerCase()) return { name: '', email: '' };
  return { name, email: mgr ? clean(mgr.Email) : '' };
}

/**
 * สร้างใบประเมินที่ยังขาดให้อัตโนมัติเมื่อเปิดหน้าประเมิน
 * ผู้ดูแลระบบ → สร้างให้ครบทุกคนในขอบเขตของรอบ
 * ผู้ใช้ทั่วไป → สร้างเฉพาะใบของตัวเอง ถ้าอยู่ในขอบเขตของรอบ
 * คืนจำนวนใบที่สร้าง (0 = ไม่มีอะไรต้องสร้าง)
 */
export async function autoCreate(cycle, { isAdmin = false, email = '' } = {}) {
  if (!cycle || clean(cycle.Status) !== 'เปิด') return 0;

  if (isAdmin) {
    const res = await generateSheets(cycle);
    return res.created;
  }

  const mine = (await sheets(clean(cycle.Title)))
    .some((r) => clean(r.EmployeeEmail).toLowerCase() === String(email).toLowerCase());
  if (mine || !email) return 0;

  const dir = await list('directory').catch(() => []);
  const me = dir.find((p) => clean(p.Email).toLowerCase() === String(email).toLowerCase());
  if (!me) return 0;

  // อยู่ในขอบเขตของรอบไหม
  const onlyList = clean(cycle.Scope) === 'เฉพาะรายชื่อที่ระบุ';
  const wanted = new Set(String(cycle.Members || '').split(/\r?\n/)
    .map((x) => x.trim().toLowerCase()).filter(Boolean));
  if (onlyList && !wanted.has(clean(me.Email).toLowerCase()) && !wanted.has(clean(me.Title).toLowerCase())) return 0;
  const kpi = isKpiSet(cycle.FormSet);
  if (kpi && afterCutoff(me, cycle)) return 0;
  if (kpi) await loadKpiConfig();

  const byName = new Map(dir.map((p) => [clean(p.Title), p]));
  const ev = evaluatorFor(me, byName, kpi);
  const prev = (await sheets('')).filter((r) =>
    clean(r.EmployeeEmail).toLowerCase() === clean(me.Email).toLowerCase());

  await create('appraisals', {
    Title: `${clean(cycle.Title)} · ${clean(me.Title)}`,
    CycleName: clean(cycle.Title), FormSet: clean(cycle.FormSet),
    EmployeeName: clean(me.Title), EmployeeEmail: clean(me.Email),
    Department: clean(me.Department), Section: clean(me.Section),
    EvaluatorName: ev.name, EvaluatorEmail: ev.email,
    Status: firstStage(cycle), SelfScore: 0, MgrScore: 0, FinalScore: 0, Grade: '',
    SelfData: '{}', MgrData: '{}', Log: '{"items":[]}',
    Extra: JSON.stringify({
      ...(firstStage(cycle) === S_MGR ? { noSelf: true } : {}),
      startDate: me.StartDate ? String(me.StartDate).slice(0, 10) : '',
      rounds: mergeRounds(me.StartDate, cycle, prev),
      ...(kpi ? { kpi: { form: kpiFormOf(me), ver: currentKpiVer() } } : {}),
    }),
  });
  return 1;
}

/**
 * ขั้นแรกของใบที่สร้างใหม่: รอบที่ตั้งขั้นตอนเป็น "หัวหน้าประเมิน" (เช่นประเมินทดลองงาน)
 * เริ่มที่หัวหน้าเลย ไม่ต้องให้พนักงานประเมินตนเองก่อน
 */
export const firstStage = (cycle) => (clean(cycle && cycle.Stage) === S_MGR ? S_MGR : S_SELF);

/** ใบนี้ไม่มีขั้นประเมินตนเอง (สร้างในรอบที่เริ่มที่หัวหน้า หรือถูกข้ามขั้นแล้ว) */
export function noSelf(row) {
  if (!row) return false;
  if (extraOf(row).noSelf) return true;
  const log = logOf(row);
  if (log.some((l) => /ข้ามขั้นประเมินตนเอง/.test(l.action || ''))) return true;
  // ใบที่เลยขั้นประเมินตนเองไปแล้วโดยไม่เคยส่งแบบประเมินตนเอง (สร้างที่ขั้นหัวหน้าก่อนมีตัวบอก noSelf)
  return clean(row.Status) !== S_SELF && !(+row.SelfScore > 0)
    && !log.some((l) => /ส่งแบบประเมินตนเอง/.test(l.action || ''));
}

/** ใบที่ยังรอประเมินตนเองและยังไม่ได้ส่ง (ใช้ตอนรอบเปลี่ยนเป็นขั้นหัวหน้าประเมิน) */
export const waitingSelf = (rows) => rows.filter((r) => clean(r.Status) === S_SELF && !(+r.SelfScore > 0));

/** ข้ามขั้นประเมินตนเอง ส่งใบไปให้หัวหน้าประเมินเลย */
export async function skipSelf(rows, by, onProgress = () => {}) {
  let done = 0;
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await update('appraisals', r.id, {
      Status: S_MGR, Log: addLog(r, 'ข้ามขั้นประเมินตนเอง ส่งให้หัวหน้าประเมิน', by),
      Extra: JSON.stringify({ ...extraOf(r), noSelf: true }),
    });
    done += 1;
    onProgress(done, rows.length);
  }
  return done;
}

/** บันทึกผลการประเมินตนเอง */
export async function submitSelf(row, answers, comment, score, by) {
  return update('appraisals', row.id, {
    SelfData: JSON.stringify(answers), SelfComment: comment,
    SelfScore: score, Status: STAGES[1],
    Log: addLog(row, 'ส่งแบบประเมินตนเอง', by),
  });
}

/**
 * ผู้ประเมินบันทึกผล + สรุปผล + ลงนาม แล้วส่งต่อให้ฝ่ายบุคคล
 * sign = { name, note, date, url } ของผู้ประเมิน
 */
export async function submitManager(row, answers, comment, score, by, extra = null, sign = null) {
  const x = { ...extraOf(row), ...(extra || {}) };
  if (sign) x.sign = { ...(x.sign || {}), evaluator: { ...sign, at: new Date().toISOString() } };
  return update('appraisals', row.id, {
    MgrData: JSON.stringify(answers), MgrComment: comment,
    MgrScore: score, Status: S_HR,
    Extra: JSON.stringify(x),
    Log: addLog(row, 'ผู้ประเมินสรุปผลและลงนาม ส่งให้พนักงานรับทราบและฝ่ายบุคคลตรวจสอบ', by, sign?.note || ''),
  });
}

/** ฝ่ายบุคคลตรวจสอบและลงนาม (ยังไม่ส่งต่อ ใช้ตอนรอพนักงานลงนาม) */
export async function hrSign(row, { sign, by, note = '', summary = null }) {
  const x = { ...extraOf(row), ...(summary ? { summary } : {}) };
  x.sign = { ...(x.sign || {}), hr: { ...sign, at: new Date().toISOString() } };
  return update('appraisals', row.id, {
    Extra: JSON.stringify(x),
    Log: addLog(row, 'ฝ่ายบุคคลตรวจสอบและลงนาม', by, note),
  });
}

/**
 * ฝ่ายบุคคลส่งให้ผู้บริหาร — ต้องมีลายเซ็นผู้ประเมิน พนักงาน และฝ่ายบุคคลครบ
 * sign = ลายเซ็นฝ่ายบุคคลที่เพิ่งลง (ถ้าลงไว้แล้วไม่ต้องส่ง)
 */
export async function hrReview(row, { sign = null, by, note = '', summary = null }) {
  const x = { ...extraOf(row), ...(summary ? { summary } : {}) };
  if (sign) x.sign = { ...(x.sign || {}), hr: { ...sign, at: new Date().toISOString() } };
  const sg = x.sign || {};
  const missing = [!signed(sg.evaluator) && 'ผู้ประเมิน', !signed(sg.employee) && 'พนักงาน',
    !signed(sg.hr) && 'ฝ่ายบุคคล'].filter(Boolean);
  if (missing.length) throw new Error(`ยังขาดลายเซ็น: ${missing.join(', ')}`);
  return update('appraisals', row.id, {
    Status: S_BOSS, Extra: JSON.stringify(x),
    Log: addLog(row, 'ฝ่ายบุคคลตรวจสอบแล้ว ส่งให้ผู้บริหาร', by, note),
  });
}

/** ผู้บริหารอนุมัติ / ไม่อนุมัติ พร้อมลงนาม */
export async function executiveDecide(row, { approved, finalScore, sign, by, note = '', scheme = 'มาตรฐาน', summary = null }) {
  const x = { ...extraOf(row), ...(summary ? { summary } : {}) };
  // ลายเซ็นผู้บริหารไม่บังคับ — ไม่ได้เซ็นก็บันทึกชื่อผู้กดและเวลาไว้
  x.sign = { ...(x.sign || {}), approver: { ...(sign || {}), name: (sign && sign.name) || by, approved, at: new Date().toISOString() } };
  const g = gradeOf(finalScore, scheme);
  // ใบเก่าที่พนักงานยังไม่ได้เซ็น ส่งต่อให้พนักงานรับทราบ · ใบตามขั้นตอนใหม่พนักงานเซ็นไว้แล้ว จบเลย
  const next = !approved ? S_MGR : (signed((x.sign || {}).employee) ? DONE : S_ACK);
  return update('appraisals', row.id, {
    FinalScore: finalScore, Grade: g[1], HeadComment: note,
    Status: next, Extra: JSON.stringify(x),
    Log: addLog(row, approved ? 'ผู้บริหารอนุมัติผล' : 'ผู้บริหารไม่อนุมัติ ส่งกลับให้ทบทวน', by, note),
  });
}

/** (เดิม) ผู้บริหารอนุมัติผลแบบไม่ลงนาม — คงไว้เพื่อความเข้ากันได้ */
export const approveSheet = (row, finalScore, note, by) =>
  executiveDecide(row, { approved: true, finalScore, sign: { name: by }, by, note });

/** ส่งกลับให้แก้ไข ระบุขั้นที่ต้องการให้กลับไป */
export async function sendBack(row, toStage, note, by) {
  // กลับไปให้หัวหน้าแก้ ผลอาจเปลี่ยน → ลายเซ็นพนักงาน ฝ่ายบุคคล ผู้บริหารต้องลงใหม่
  const x = { ...extraOf(row) };
  if (toStage === S_MGR || toStage === S_SELF) {
    const { evaluator } = x.sign || {};
    x.sign = toStage === S_MGR && evaluator ? { evaluator } : {};
  }
  return update('appraisals', row.id, {
    Status: toStage, Extra: JSON.stringify(x),
    Log: addLog(row, `ส่งกลับขั้น "${toStage}"`, by, note),
  });
}

/** พนักงานรับทราบผล พร้อมลงลายเซ็น */
export async function acknowledge(row, note, by, sigUrl = '') {
  const x = { ...extraOf(row) };
  x.sign = { ...(x.sign || {}), employee: { name: by, note, url: sigUrl, at: new Date().toISOString() } };
  return update('appraisals', row.id, {
    // ใบเก่า (ผู้บริหารอนุมัติแล้ว) จบที่นี่ · ขั้นตอนใหม่ยังอยู่ขั้นฝ่ายบุคคล รอฝ่ายบุคคลส่งผู้บริหาร
    Status: clean(row.Status) === S_ACK ? DONE : clean(row.Status),
    AckDate: new Date().toISOString(), Extra: JSON.stringify(x),
    Log: addLog(row, 'พนักงานรับทราบผลและลงนาม', by, note),
  });
}
