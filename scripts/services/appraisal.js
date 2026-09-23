/**
 * ระบบประเมินผลบุคลากร — ตรรกะกลาง
 *
 * แปลงจากต้นแบบ (เก็บใน localStorage) มาใช้ข้อมูลจริงของ intranet:
 *   - ผู้ใช้/ผู้บังคับบัญชา ใช้ทะเบียนบุคลากรเดิม (ช่อง Manager)
 *   - เก็บข้อมูลใน SharePoint 3 ลิสต์: AppraisalCycles / AppraisalCriteria / Appraisals
 *   - สิทธิ์อิงจากข้อมูลจริง ไม่มีการเลือกบทบาทเอง
 *
 * ขั้นตอน: ประเมินตนเอง → หัวหน้าประเมิน → ผู้บริหารอนุมัติ → พนักงานรับทราบ
 */
import { list, create, update } from './data.js';

export const STAGES = ['ประเมินตนเอง', 'หัวหน้าประเมิน', 'ผู้บริหารอนุมัติ', 'พนักงานรับทราบ'];
export const DONE = 'เสร็จสมบูรณ์';

/** เกรดตามคะแนนถ่วงน้ำหนัก 0–100 */
export const GRADES = [[90, 'A', 'ดีเยี่ยม'], [80, 'B+', 'ดีมาก'], [70, 'B', 'ดี'],
  [60, 'C', 'พอใช้'], [0, 'D', 'ต้องปรับปรุง']];
export const gradeOf = (score) => GRADES.find((g) => score >= g[0]) || GRADES[GRADES.length - 1];

export const clean = (v) => (v && typeof v === 'object'
  ? String(v.LookupValue ?? v.Title ?? '') : String(v ?? '')).trim();

const num = (v) => (isNaN(+v) ? 0 : +v);

/** รอบประเมินที่เปิดใช้งานอยู่ (เอาแถวที่ IsActive ไม่ใช่ false และสถานะเปิด) */
export async function activeCycle() {
  const rows = await list('appraisalCycles').catch(() => []);
  const open = rows.filter((c) => c.IsActive !== false);
  return open.find((c) => clean(c.Status) === 'เปิด') || open[0] || null;
}

/** หัวข้อประเมิน จัดกลุ่มตามหมวด พร้อมน้ำหนัก */
export async function criteria() {
  const rows = (await list('appraisalCriteria').catch(() => []))
    .filter((c) => c.IsActive !== false)
    .sort((a, b) => (+a.SortOrder || 0) - (+b.SortOrder || 0));

  const secs = [];
  rows.forEach((r) => {
    const name = clean(r.Section) || 'หัวข้อประเมิน';
    let sec = secs.find((s) => s.name === name);
    if (!sec) { sec = { name, weight: num(r.SectionWeight), items: [] }; secs.push(sec); }
    if (num(r.SectionWeight)) sec.weight = num(r.SectionWeight);
    sec.items.push({ id: String(r.id), title: clean(r.Title), weight: num(r.Weight) });
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
    const v = +answers[it.id];
    if (!w) return;
    total += w;
    if (v >= 1 && v <= 5) got += (v / 5) * w;
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
export function stageOpen(cycle, stage) {
  if (!cycle) return { ok: false, why: 'ยังไม่ได้เปิดรอบประเมิน' };
  if (clean(cycle.Status) !== 'เปิด') return { ok: false, why: `รอบ ${clean(cycle.Title)} ปิดรับข้อมูลแล้ว` };
  const cur = clean(cycle.Stage) || STAGES[0];
  if (cur !== stage) return { ok: false, why: `ขณะนี้ระบบเปิดเฉพาะขั้นตอน "${cur}"` };
  return { ok: true };
}

/** บันทึกประวัติการดำเนินการลงใบประเมิน */
export function addLog(row, action, by, note = '') {
  const items = logOf(row);
  items.push({ action, by, note, at: new Date().toISOString() });
  return JSON.stringify({ items });
}

/** สร้างใบประเมินให้บุคลากรทุกคนที่ยังไม่มีในรอบนี้ (ผู้ดูแลระบบกดสร้าง) */
export async function generateSheets(cycle, onProgress = () => {}) {
  const [dir, existing] = await Promise.all([
    list('directory').catch(() => []),
    sheets(clean(cycle.Title)),
  ]);
  const have = new Set(existing.map((r) => clean(r.EmployeeEmail).toLowerCase()));
  const staff = dir.filter((p) => p.IsActive !== false && clean(p.Email)
    && !have.has(clean(p.Email).toLowerCase()));

  const byName = new Map(dir.map((p) => [clean(p.Title), p]));
  let done = 0;
  const made = [];
  for (const p of staff) {
    const mgr = byName.get(clean(p.Manager));
    // eslint-disable-next-line no-await-in-loop
    const row = await create('appraisals', {
      Title: `${clean(cycle.Title)} · ${clean(p.Title)}`,
      CycleName: clean(cycle.Title),
      EmployeeName: clean(p.Title), EmployeeEmail: clean(p.Email),
      Department: clean(p.Department), Section: clean(p.Section),
      EvaluatorName: clean(p.Manager), EvaluatorEmail: mgr ? clean(mgr.Email) : '',
      Status: STAGES[0], SelfScore: 0, MgrScore: 0, FinalScore: 0, Grade: '',
      SelfData: '{}', MgrData: '{}', Log: '{"items":[]}',
    }).catch(() => null);
    if (row) made.push(row);
    done += 1;
    onProgress(done, staff.length);
  }
  return { created: made.length, skipped: existing.length, noManager: staff.filter((p) => !clean(p.Manager)).length };
}

/** บันทึกผลการประเมินตนเอง */
export async function submitSelf(row, answers, comment, score, by) {
  return update('appraisals', row.id, {
    SelfData: JSON.stringify(answers), SelfComment: comment,
    SelfScore: score, Status: STAGES[1],
    Log: addLog(row, 'ส่งแบบประเมินตนเอง', by),
  });
}

/** บันทึกผลการประเมินของหัวหน้า */
export async function submitManager(row, answers, comment, score, by) {
  return update('appraisals', row.id, {
    MgrData: JSON.stringify(answers), MgrComment: comment,
    MgrScore: score, Status: STAGES[2],
    Log: addLog(row, 'หัวหน้าประเมินแล้ว', by),
  });
}

/** ผู้บริหารอนุมัติผล (ปรับคะแนนสุดท้ายได้) */
export async function approveSheet(row, finalScore, note, by) {
  const g = gradeOf(finalScore);
  return update('appraisals', row.id, {
    FinalScore: finalScore, Grade: g[1], HeadComment: note, Status: STAGES[3],
    Log: addLog(row, 'ผู้บริหารอนุมัติผล', by, note),
  });
}

/** ส่งกลับให้แก้ไข ระบุขั้นที่ต้องการให้กลับไป */
export async function sendBack(row, toStage, note, by) {
  return update('appraisals', row.id, {
    Status: toStage,
    Log: addLog(row, `ส่งกลับขั้น "${toStage}"`, by, note),
  });
}

/** พนักงานรับทราบผล */
export async function acknowledge(row, note, by) {
  return update('appraisals', row.id, {
    Status: DONE, AckDate: new Date().toISOString(),
    Log: addLog(row, 'พนักงานรับทราบผล', by, note),
  });
}
