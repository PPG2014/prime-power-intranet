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
};
export const GRADES = GRADE_SCHEMES['มาตรฐาน'];
export const gradeOf = (score, scheme = 'มาตรฐาน') => {
  const t = GRADE_SCHEMES[clean(scheme)] || GRADES;
  return t.find((g) => score >= g[0]) || t[t.length - 1];
};

export const clean = (v) => (v && typeof v === 'object'
  ? String(v.LookupValue ?? v.Title ?? '') : String(v ?? '')).trim();

const num = (v) => (isNaN(+v) ? 0 : +v);

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
  if (cur !== stage) return { ok: false, why: `ขณะนี้ระบบเปิดเฉพาะขั้นตอน "${cur}"` };
  return { ok: true };
}

/** ระดับที่อนุมัติผลประเมินได้: ผู้จัดการฝ่ายขึ้นไป */
export const isApproverLevel = (level) =>
  /ผู้อำนวยการ|ผู้บริหารสูงสุด|ผู้จัดการฝ่าย|รองผู้บริหาร/.test(String(level || ''));

/**
 * ใบที่รอผู้ใช้คนนี้ทำอยู่ตอนนี้ แยกตามแท็บของหน้าประเมิน — ใช้แสดงตัวเลขเตือน
 *   me      ใบของฉันที่ต้องประเมินตนเอง หรือรอลงนามรับทราบ
 *   team    ลูกทีมที่รอฉันให้คะแนน
 *   approve ใบในฝ่ายของฉันที่รอผู้บริหารอนุมัติ (ผู้ดูแลเห็นทุกฝ่าย)
 *   all     ใบที่รอฝ่ายบุคคลตรวจสอบ (เฉพาะฝ่ายบุคคล)
 */
export function appraisalTodo({ cycle, rows, email, person = null, isAdmin = false, isHR = false }) {
  const out = { me: 0, team: 0, approve: 0, all: 0, total: 0 };
  if (!cycle || clean(cycle.Status) !== 'เปิด') return out;
  const st = (r) => clean(r.Status);

  const mine = mineOf(rows, email);
  if (mine && ((st(mine) === S_SELF && stageOpen(cycle, S_SELF).ok) || st(mine) === S_ACK)) out.me = 1;

  out.team = stageOpen(cycle, S_MGR).ok ? teamOf(rows, email).filter((r) => st(r) === S_MGR).length : 0;

  if (isAdmin || isApproverLevel(person && person.Level)) {
    const dept = clean(person && person.Department);
    out.approve = rows.filter((r) => st(r) === S_BOSS && (isAdmin || clean(r.Department) === dept)).length;
  }
  if (isHR) out.all = rows.filter((r) => st(r) === S_HR).length;

  out.total = out.me + out.team + out.approve + out.all;
  return out;
}

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

  const staff = dir.filter((p) => p.IsActive !== false && clean(p.Email)
    && !have.has(clean(p.Email).toLowerCase())
    && (!onlyList || wanted.has(clean(p.Email).toLowerCase()) || wanted.has(clean(p.Title).toLowerCase())));

  const byName = new Map(dir.map((p) => [clean(p.Title), p]));
  let done = 0;
  const made = [];
  const failed = [];      // สร้างไม่สำเร็จ: "ชื่อ — สาเหตุ" แจ้งผู้ใช้ ไม่เก็บเงียบ
  for (const p of staff) {
    const mgr = byName.get(clean(p.Manager));
    // eslint-disable-next-line no-await-in-loop
    const row = await create('appraisals', {
      Title: `${clean(cycle.Title)} · ${clean(p.Title)}`,
      CycleName: clean(cycle.Title), FormSet: clean(cycle.FormSet),
      EmployeeName: clean(p.Title), EmployeeEmail: clean(p.Email),
      Department: clean(p.Department), Section: clean(p.Section),
      EvaluatorName: clean(p.Manager), EvaluatorEmail: mgr ? clean(mgr.Email) : '',
      Status: STAGES[0], SelfScore: 0, MgrScore: 0, FinalScore: 0, Grade: '',
      SelfData: '{}', MgrData: '{}', Log: '{"items":[]}',
      // ดึงวันเริ่มงานจากทะเบียนบุคลากร · วันประเมินแต่ละครั้งฝ่ายบุคคลกำหนดเอง
      Extra: JSON.stringify({
        startDate: p.StartDate ? String(p.StartDate).slice(0, 10) : '',
        rounds: mergeRounds(p.StartDate, cycle,
          allSheets.filter((r) => clean(r.EmployeeEmail).toLowerCase() === clean(p.Email).toLowerCase())),
      }),
    }).catch((e) => { failed.push(`${clean(p.Title)} — ${e.message}`); return null; });
    if (row) made.push(row);
    done += 1;
    onProgress(done, staff.length);
  }
  return { created: made.length, skipped: existing.length, failed,
    noManager: staff.filter((p) => !clean(p.Manager)).length };
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

  const byName = new Map(dir.map((p) => [clean(p.Title), p]));
  const mgr = byName.get(clean(me.Manager));
  const prev = (await sheets('')).filter((r) =>
    clean(r.EmployeeEmail).toLowerCase() === clean(me.Email).toLowerCase());

  await create('appraisals', {
    Title: `${clean(cycle.Title)} · ${clean(me.Title)}`,
    CycleName: clean(cycle.Title), FormSet: clean(cycle.FormSet),
    EmployeeName: clean(me.Title), EmployeeEmail: clean(me.Email),
    Department: clean(me.Department), Section: clean(me.Section),
    EvaluatorName: clean(me.Manager), EvaluatorEmail: mgr ? clean(mgr.Email) : '',
    Status: STAGES[0], SelfScore: 0, MgrScore: 0, FinalScore: 0, Grade: '',
    SelfData: '{}', MgrData: '{}', Log: '{"items":[]}',
    Extra: JSON.stringify({
      startDate: me.StartDate ? String(me.StartDate).slice(0, 10) : '',
      rounds: mergeRounds(me.StartDate, cycle, prev),
    }),
  });
  return 1;
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
    Log: addLog(row, 'ผู้ประเมินสรุปผลและลงนาม ส่งให้ฝ่ายบุคคล', by, sign?.note || ''),
  });
}

/**
 * ฝ่ายบุคคลตรวจสอบและลงนาม แล้วเลือกส่งต่อ
 * to = ผู้บริหารอนุมัติ (ปกติ) หรือ พนักงานรับทราบ (ข้ามผู้บริหาร)
 */
export async function hrReview(row, { sign, to = S_BOSS, by, note = '' }) {
  const x = { ...extraOf(row) };
  if (sign) x.sign = { ...(x.sign || {}), hr: { ...sign, at: new Date().toISOString() } };
  return update('appraisals', row.id, {
    Status: to, Extra: JSON.stringify(x),
    Log: addLog(row, to === S_ACK
      ? 'ฝ่ายบุคคลตรวจสอบแล้ว ส่งให้พนักงานรับทราบ'
      : 'ฝ่ายบุคคลตรวจสอบแล้ว ส่งให้ผู้บริหารอนุมัติ', by, note),
  });
}

/** ผู้บริหารอนุมัติ / ไม่อนุมัติ พร้อมลงนาม */
export async function executiveDecide(row, { approved, finalScore, sign, by, note = '', scheme = 'มาตรฐาน' }) {
  const x = { ...extraOf(row) };
  x.sign = { ...(x.sign || {}), approver: { ...sign, approved, at: new Date().toISOString() } };
  const g = gradeOf(finalScore, scheme);
  return update('appraisals', row.id, {
    FinalScore: finalScore, Grade: g[1], HeadComment: note,
    Status: approved ? S_ACK : S_MGR, Extra: JSON.stringify(x),
    Log: addLog(row, approved ? 'ผู้บริหารอนุมัติผล' : 'ผู้บริหารไม่อนุมัติ ส่งกลับให้ทบทวน', by, note),
  });
}

/** (เดิม) ผู้บริหารอนุมัติผลแบบไม่ลงนาม — คงไว้เพื่อความเข้ากันได้ */
export const approveSheet = (row, finalScore, note, by) =>
  executiveDecide(row, { approved: true, finalScore, sign: { name: by }, by, note });

/** ส่งกลับให้แก้ไข ระบุขั้นที่ต้องการให้กลับไป */
export async function sendBack(row, toStage, note, by) {
  return update('appraisals', row.id, {
    Status: toStage,
    Log: addLog(row, `ส่งกลับขั้น "${toStage}"`, by, note),
  });
}

/** พนักงานรับทราบผล พร้อมลงลายเซ็น */
export async function acknowledge(row, note, by, sigUrl = '') {
  const x = { ...extraOf(row) };
  x.sign = { ...(x.sign || {}), employee: { name: by, note, url: sigUrl, at: new Date().toISOString() } };
  return update('appraisals', row.id, {
    Status: DONE, AckDate: new Date().toISOString(), Extra: JSON.stringify(x),
    Log: addLog(row, 'พนักงานรับทราบผล', by, note),
  });
}
