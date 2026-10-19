/**
 * ตรรกะเส้นทางอนุมัติของคำขอ
 *
 * คำขอหนึ่งใบมีสถานะรวม (Status) และเก็บว่าอยู่ลำดับไหน (CurrentStep)
 * เส้นทางแต่ละฟอร์มมาจาก ApprovalMatrix เรียงตาม StepOrder
 * ประวัติการอนุมัติแต่ละครั้งเก็บใน ApprovalLog ของคำขอนั้น (JSON)
 */
import { list, update } from './data.js';

/** ประเภทผู้อนุมัติที่เป็นตำแหน่งผู้บริหาร — ชื่อประเภทตรงกับตำแหน่งในทะเบียนบุคลากร */
export const EXEC_TYPES = ['กรรมการผู้จัดการ', 'รองกรรมการผู้จัดการด้านปฏิบัติการ', 'รองกรรมการผู้จัดการด้านการเงิน'];

/**
 * หาผู้อนุมัติจริงของลำดับหนึ่ง
 * ถ้าเป็นประเภทตามตำแหน่ง จะหาจากสายบังคับบัญชาหรือผังฝ่ายของผู้ยื่น
 * req = คำขอ (มี RequesterName, RequesterDept)
 */
/**
 * ผู้อนุมัติของลำดับนี้ หลังสลับคนที่ "ไม่อยู่" เป็นผู้ปฏิบัติแทน
 * คนที่ตั้งช่วงไม่อยู่ (AwayFrom–AwayTo) ในทะเบียนบุคลากร และวันนี้อยู่ในช่วงนั้น
 *   → ใช้ Delegate (ผู้ปฏิบัติแทน) ของคนนั้น
 *   → ถ้าไม่ได้ตั้ง และเป็นลำดับ "ผู้บังคับบัญชาของผู้ยื่น" ใช้ BackupManager ของผู้ยื่น
 *   → ไม่มีทั้งคู่ คงชื่อเดิม (ยังอนุมัติได้เมื่อกลับมา)
 */
export async function resolveApprovers(step, req) {
  // ประเภทหลัก + ประเภทเพิ่มเติม (AlsoTypes) รวมกัน เช่น ผู้จัดการฝ่ายวิศวกรรม หรือ ผู้จัดการโครงการ หรือ ผู้รับผิดชอบโครงการ
  // ประเภทเพิ่มเติมไม่ใช้ชื่อสำรอง (Approvers) ซ้ำ กันชื่อสำรองโผล่ทั้งที่ประเภทหลักหาเจอแล้ว
  const also = String(step.AlsoTypes || '').split(',').map((x) => x.trim()).filter(Boolean);
  const names = [...new Set([
    ...(await resolveRaw(step, req)),
    ...(await Promise.all(also.map((t) => resolveRaw({ ...step, ApproverType: t, Approvers: [] }, req)))).flat(),
  ])];
  // ลำดับที่ใช้ผู้อนุมัติจากโครงการ (ผู้จัดการ/ผู้รับผิดชอบโครงการ): ถ้าไม่ได้เลือกโครงการ
  // หรือผู้ยื่นไม่ได้อยู่ในทีมโครงการที่เลือก → ให้ผู้บังคับบัญชาของผู้ยื่นอนุมัติได้ด้วย (คนใดคนหนึ่ง)
  if ([step.ApproverType, ...also].some((t) => PROJECT_APPROVER_TYPES.includes(t))) {
    const proj = await projectOfRequest(req);
    if (!proj || !(await inProjectTeam(proj, req))) {
      const boss = await resolveRaw({ ApproverType: 'ผู้บังคับบัญชาของผู้ยื่น', Approvers: [] }, req);
      boss.forEach((b) => { if (!names.includes(b)) names.unshift(b); });
    }
  }
  // ชื่อบุคคลที่ระบุเพิ่ม (ExtraApprovers) อนุมัติขั้นนี้ได้เสมอ นอกจากคนที่ระบบหาเองตามตำแหน่ง/ฝ่าย/โครงการ
  String(step.ExtraApprovers || '').split(',').map((x) => x.trim()).filter(Boolean)
    .forEach((n) => { if (!names.includes(n)) names.push(n); });
  if (!names.length) return names;
  const dir = await list('directory').catch(() => []);
  const em = String(req.RequesterEmail || '').trim().toLowerCase();
  const me = (em && dir.find((p) => String(p.Email || '').trim().toLowerCase() === em))
    || dir.find((p) => String(p.Title).trim() === String(req.RequesterName || '').trim());
  const isBoss = (step.ApproverType || '') === 'ผู้บังคับบัญชาของผู้ยื่น';
  const out = names.map((n) => {
    const p = dir.find((x) => String(x.Title).trim() === String(n).trim());
    if (!p || !isAway(p)) return n;
    const sub = nameOf(p.Delegate) || (isBoss && me ? nameOf(me.BackupManager) : '');
    return sub && sub !== String(n).trim() ? sub : n;
  });
  return [...new Set(out)];
}

const nameOf = (v) => String((v && typeof v === 'object' ? (v.LookupValue ?? v.Title) : v) || '').trim();

/** วันนี้อยู่ในช่วงไม่อยู่ของคนนี้ไหม (นับทั้งวันแรกและวันสุดท้าย) */
export function isAway(p, now = new Date()) {
  if (!p || !p.AwayFrom) return false;
  const day = (v) => { const d = new Date(v); return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const from = day(p.AwayFrom);
  const to = p.AwayTo ? day(p.AwayTo) : from;
  const today = day(now);
  return !!(from && to && today >= from && today <= to);
}

async function resolveRaw(step, req) {
  const type = step.ApproverType || 'ระบุชื่อเจาะจง';
  const listed = Array.isArray(step.Approvers)
    ? step.Approvers.map((x) => (x && typeof x === 'object' ? (x.LookupValue ?? x.Title) : x)).filter(Boolean)
    : String(step.Approvers || '').split(',').map((x) => x.trim()).filter(Boolean);

  if (type === 'ระบุชื่อเจาะจง') return listed;
  // ประเภทตามตำแหน่ง/ฝ่าย/โครงการ: ไม่ใช้ชื่อในช่อง Approvers เป็นตัวสำรองแล้ว
  // (ช่องนี้แก้ได้เฉพาะตอนเป็น "ระบุชื่อเจาะจง" — เปลี่ยนประเภทแล้วชื่อเดิมค้างอยู่ ทำให้คำขอไปหาคนเก่าโดยมองไม่เห็น)
  // หาไม่เจอ = ไม่มีผู้อนุมัติ → ขั้นไม่บังคับข้ามให้เอง · ขั้นบังคับ ตรวจสุขภาพระบบ/หน้าคำขอจะแจ้ง
  const named = [];

  const dir = await list('directory').catch(() => []);
  // หาตัวผู้ยื่นด้วยอีเมลก่อน (ชื่อจาก Microsoft 365 มักเป็นภาษาอังกฤษ ไม่ตรงกับชื่อไทยในทะเบียน)
  const em = String(req.RequesterEmail || '').trim().toLowerCase();
  const me = (em && dir.find((p) => String(p.Email || '').trim().toLowerCase() === em))
    || dir.find((p) => String(p.Title).trim() === String(req.RequesterName || '').trim());

  if (type === 'ผู้บังคับบัญชาของผู้ยื่น') {
    // อ่านหัวหน้าจากทะเบียนบุคลากรก่อน (แก้ได้ที่หน้าแก้ไขบุคลากร) แล้วค่อยเผื่อลิสต์เก่า
    const mgr = me && me.Manager
      ? (typeof me.Manager === 'object' ? (me.Manager.LookupValue ?? me.Manager.Title) : me.Manager)
      : '';
    if (mgr) return [mgr];
    const rl = await list('reportingLine').catch(() => []);
    const row = rl.find((r) => r.Title === req.RequesterName);
    return row && row.Manager ? [row.Manager] : named;
  }

  if (type === 'ผู้รับผิดชอบหลักของโครงการ') {
    // อ่านชื่อโครงการจากคำตอบในฟอร์ม แล้วหา Owner จากทะเบียนโครงการ
    const proj = await projectOfRequest(req);
    if (!proj) return named;

    // Owner อาจมาเป็นออบเจ็กต์ (Lookup) หรือข้อความ
    const owner = proj.Owner && typeof proj.Owner === 'object'
      ? (proj.Owner.LookupValue ?? proj.Owner.Title ?? '')
      : proj.Owner;
    return owner ? [owner] : named;
  }

  // คนในทีมโครงการ (ผู้รับผิดชอบหลัก + ทีมงาน) ที่ตำแหน่งตรง เช่น ผู้จัดการโครงการ / ผู้อำนวยการโครงการ
  if (type === 'ผู้จัดการโครงการ' || type === 'ผู้อำนวยการโครงการ') {
    const proj = await projectOfRequest(req);
    if (!proj) return named;
    const team = new Set([nameOf(proj.Owner), ...asList(proj.Team).map(nameOf)].filter(Boolean));
    const re = type === 'ผู้จัดการโครงการ' ? /ผู้จัดการโครงการ/ : /ผู้อำนวยการโครงการ/;
    const hit = dir.filter((p) => p.IsActive !== false && team.has(String(p.Title).trim()) && re.test(p.Position || ''));
    return hit.length ? hit.map((p) => p.Title) : named;
  }

  // ฝ่ายที่ระบุในลำดับนี้ (ApproverDept) — ทุกคนในฝ่าย หรือเฉพาะผู้จัดการ/หัวหน้าฝ่าย
  if (type === 'ทุกคนในฝ่ายที่ระบุ' || type === 'ผู้จัดการฝ่ายที่ระบุ') {
    const dept = nameOf(step.ApproverDept);
    if (!dept) return named;
    const inDept = dir.filter((p) => p.IsActive !== false && String(p.Department || '').trim() === dept);
    const hit = type === 'ทุกคนในฝ่ายที่ระบุ' ? inDept
      : inDept.filter((p) => /ผู้จัดการฝ่าย|หัวหน้าฝ่าย/.test(p.Position || '') || p.Level === 'ผู้จัดการฝ่าย');
    return hit.length ? hit.map((p) => p.Title) : named;
  }

  // ผู้บริหารตามตำแหน่ง — หาจากช่องตำแหน่งในทะเบียนบุคลากร (ต้องตรงทั้งคำ
  // เพราะ "รองกรรมการผู้จัดการ…" มีคำว่า "กรรมการผู้จัดการ" อยู่ด้วย) · ไม่พบใครใช้ชื่อที่ระบุไว้แทน
  if (EXEC_TYPES.includes(type)) {
    const hit = dir.filter((p) => p.IsActive !== false && String(p.Position || '').trim() === type);
    return hit.length ? hit.map((p) => p.Title) : named;
  }

  if (type === 'ผู้จัดการฝ่ายของผู้ยื่น' || type === 'หัวหน้าฝ่ายตามสังกัด') {
    // หาคนระดับหัวหน้าสูงสุดของฝ่ายเดียวกับผู้ยื่น
    const dept = req.RequesterDept || (me && me.Department);
    const heads = dir.filter((p) => p.Department === dept
      && /ผู้จัดการฝ่าย|หัวหน้าฝ่าย|ผู้อำนวยการ/.test(p.Position || ''));
    return heads.length ? heads.map((p) => p.Title) : named;
  }

  return named;
}

const asList = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;\n]/)).map((x) => x).filter(Boolean);

/** ประเภทผู้อนุมัติที่มาจากโครงการ (ไม่รวมผู้อำนวยการโครงการ ซึ่งเป็นขั้นไม่บังคับ) */
const PROJECT_APPROVER_TYPES = ['ผู้จัดการโครงการ', 'ผู้รับผิดชอบหลักของโครงการ'];

/** ผู้ยื่นอยู่ในทีมโครงการนี้ไหม (ผู้รับผิดชอบหลัก + ทีมงาน + ช่องโครงการในทะเบียนบุคลากร) */
async function inProjectTeam(proj, req) {
  const dir = await list('directory').catch(() => []);
  const em = String(req.RequesterEmail || '').trim().toLowerCase();
  const me = (em && dir.find((p) => String(p.Email || '').trim().toLowerCase() === em))
    || dir.find((p) => String(p.Title).trim() === String(req.RequesterName || '').trim());
  const name = String((me && me.Title) || req.RequesterName || '').trim();
  const title = String(proj.Title || '').trim();
  const team = [nameOf(proj.Owner), ...asList(proj.Team).map(nameOf)];
  const mine = me ? asList(me.Project).map(nameOf) : [];
  return (!!name && team.filter(Boolean).includes(name)) || (!!title && mine.includes(title));
}

/** โครงการที่เลือกในคำขอ (ช่อง project ในฟอร์ม) จากทะเบียนโครงการ · ไม่พบ/ไม่เกี่ยวกับโครงการ คืน null */
async function projectOfRequest(req) {
  let name = '';
  try {
    const d = JSON.parse(req.FormData || '{}');
    name = String(d.project || d.project_name || d.ProjectName || '').trim();
  } catch (e) { /* ข้อมูลเสีย */ }
  if (!name) return null;
  const projects = await list('projects').catch(() => []);
  return projects.find((p) => String(p.Title).trim() === name || String(p.ProjectCode || '').trim() === name) || null;
}

/**
 * ขั้นฝ่ายจัดซื้อของใบขอสั่งซื้อ: แทนปุ่มอนุมัติ/ส่งกลับ/ไม่อนุมัติ ด้วยการอัปเดตสถานะงานจัดซื้อ
 * เลือก "ส่งของแล้ว" = ปิดคำขอ
 */
export const PURCHASE_ACTION = 'อัปเดตสถานะ';
export const PURCHASE_DONE = 'ส่งของแล้ว';
export const PURCHASE_CANCEL = 'Cancel';
export const PURCHASE_STATUSES = ['-', 'เบิก Store', 'Cancel', 'รับ PR', 'รับใบเสนอราคา', 'ออก PO แล้ว', 'ส่ง Sup แล้ว', PURCHASE_DONE];
/** สถานะจัดซื้อล่าสุดของคำขอ (จากประวัติ) · ไม่มีคืน '' */
export const purchaseStatusOf = (req) => {
  // ตัดหมายเหตุที่ต่อท้ายออก · บันทึกที่แก้แค่เลข PR (ไม่ได้เปลี่ยนสถานะ) ไม่นับ
  const sts = parseLog(req && req.ApprovalLog).filter((x) => x.action === PURCHASE_ACTION)
    .map((x) => String(x.note || '').split(' — ')[0].trim()).filter((x) => PURCHASE_STATUSES.includes(x) && x !== '-');
  return sts.slice(-1)[0] || '';
};

/** ลำดับนี้ขอรับแจ้งตั้งแต่มีคำขอเข้ามาไหม (เช่น ฝ่ายจัดซื้อ) */
export const isNotifyEarly = (s) => !!s && (s.NotifyAtSubmit === true || s.NotifyAtSubmit === 'Yes' || s.NotifyAtSubmit === 'ใช่');

/** ลำดับนี้ "ไม่บังคับ" ไหม (ข้ามได้ · ไม่มีผู้อนุมัติจะข้ามให้อัตโนมัติ) */
export const isOptionalStep = (s) => !!s && (s.Optional === true || s.Optional === 'Yes' || s.Optional === 'ใช่');

/** ฟอร์มที่ต้องให้ผู้อนุมัติ "ทุกลำดับ" ลงลายเซ็นในเอกสาร (ไม่ใช่แค่ลำดับสุดท้าย) */
export const SIGN_EVERY_STEP = ['FM-PUR-004'];
const signsEveryStep = (code) => SIGN_EVERY_STEP.includes(String(code || '').trim().toUpperCase());

/**
 * ลำดับนี้ใช้กับคำขอนี้ไหม — ตามเงื่อนไขในเส้นทางอนุมัติ
 *   ConditionField  = ชื่อช่องในฟอร์ม (FieldKey) เช่น repair_type
 *   ConditionValues = ค่าที่ทำให้ใช้ลำดับนี้ คั่นด้วยจุลภาค เช่น คอมพิวเตอร์/อุปกรณ์ IT
 * ไม่ได้ตั้งเงื่อนไข = ใช้ทุกคำขอ · ช่องเลือกได้หลายข้อ = ติ๊กค่าใดค่าหนึ่งก็ใช้
 * ไม่สนช่องว่าง (อื่นๆ = อื่น ๆ)
 */
const condNorm = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
export function stepApplies(step, req) {
  const field = String((step && step.ConditionField) || '').trim();
  const want = String((step && step.ConditionValues) || '').split(',').map(condNorm).filter(Boolean);
  if (!field || !want.length) return true;
  let data = {};
  try { data = (typeof req.FormData === 'string' ? JSON.parse(req.FormData || '{}') : req.FormData) || {}; } catch (e) { data = {}; }
  const got = data[field];
  return (Array.isArray(got) ? got : [got]).map(condNorm).some((g) => g && want.includes(g));
}
/** ลำดับที่ใช้กับคำขอนี้ (ตัดลำดับที่เงื่อนไขไม่ตรงออก) */
export const applicableSteps = (steps, req) => steps.filter((s) => stepApplies(s, req));

/** เติมรายชื่อผู้อนุมัติจริงลงในแต่ละลำดับ ตามผู้ยื่นของคำขอนั้น · ลำดับที่เงื่อนไขไม่ตรงถูกตัดออก */
export async function loadResolved(steps, req) {
  const use = applicableSteps(steps, req);
  for (const s of use) s._resolved = await resolveApprovers(s, req);
  return use;
}

/** ทำให้ค่าเป็นข้อความล้วน ตัดช่องว่าง เผื่อ FormCode มาเป็นออบเจ็กต์หรือมีช่องว่างเกิน */
const plainCode = (v) => String(
  (v && typeof v === 'object') ? (v.LookupValue ?? v.Value ?? v.Title ?? '') : (v ?? '')
).trim();

/**
 * หาค่า FormCode ของแถว — เผื่อชื่อภายในของคอลัมน์ไม่ใช่ "FormCode" ตรง ๆ
 * (ลบคอลัมน์แล้วสร้างใหม่ชื่อเดิม SharePoint จะตั้งชื่อภายในเป็น FormCode0)
 */
const codeOfRow = (s) => {
  if (s.FormCode !== undefined) return plainCode(s.FormCode);
  const k = Object.keys(s).find((x) => /^FormCode\d*$/i.test(x) || /^Form_x0020_Code/i.test(x));
  return k ? plainCode(s[k]) : '';
};

/** IsActive ปิดเฉพาะเมื่อตั้งเป็น "ไม่" ชัดเจน ค่าว่างถือว่าใช้งาน */
const isOff = (v) => v === false || /^(no|false|0|ไม่)$/i.test(String(v ?? '').trim());

/** ผลตรวจล่าสุดของแต่ละฟอร์ม ใช้แสดงสาเหตุเมื่อหาเส้นทางไม่เจอ */
export const stepDiag = {};

export async function stepsOf(formCode) {
  const target = plainCode(formCode);
  const diag = { target, total: 0, codes: [], keys: [], inactive: 0, error: '' };
  stepDiag[target] = diag;

  let all = [];
  try {
    all = await list('approvalMatrix');
  } catch (err) {
    diag.error = err.message || String(err);
    console.warn('[ApprovalMatrix] อ่านไม่สำเร็จ:', err);
    return [];
  }

  diag.total = all.length;
  diag.codes = [...new Set(all.map(codeOfRow))];
  diag.keys = all[0] ? Object.keys(all[0]) : [];

  const matched = all.filter((s) => codeOfRow(s) === target);
  diag.inactive = matched.filter((s) => isOff(s.IsActive)).length;

  const steps = matched
    .filter((s) => !isOff(s.IsActive))
    .sort((a, b) => (+a.StepOrder || 0) - (+b.StepOrder || 0));

  if (!steps.length) console.warn('[ApprovalMatrix] ไม่พบเส้นทางของ', target, diag);
  return steps;
}

const toArr = (v) => Array.isArray(v)
  ? v.map((x) => (x && typeof x === 'object' ? (x.LookupValue ?? x.Title ?? '') : x)).filter(Boolean)
  : String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

export const parseLog = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };

/**
 * บทบาทของผู้ใช้ต่อคำขอใบหนึ่ง
 * คืน canActNow ว่ากดอนุมัติได้ตอนนี้ไหม, isInvolved ว่าเกี่ยวข้องไหม,
 * myStep ลำดับที่ผู้ใช้อยู่, isFinanceFinal ว่าเป็นการเงินขั้นสุดท้ายไหม
 */
export function roleOnRequest(req, steps, userName) {
  const cur = +req.CurrentStep || 1;
  // ตัวตนผู้ใช้ รับได้ทั้งชื่อเดียวหรือหลายชื่อ (ชื่อไทยในทะเบียน + ชื่อจาก Microsoft 365)
  const ids = (Array.isArray(userName) ? userName : [userName])
    .map((x) => String(x || '').trim()).filter(Boolean);
  // ผู้อนุมัติที่ resolve ไว้ล่วงหน้าใน step._resolved (เติมโดย loadResolved)
  const myStepNums = steps
    .filter((s) => (s._resolved || toArr(s.Approvers)).some((a) => ids.includes(String(a).trim())))
    .map((s) => +s.StepOrder);

  const isInvolved = myStepNums.length > 0;
  const done = ['อนุมัติแล้ว', 'ไม่อนุมัติ', 'เสร็จสิ้น', 'ยกเลิก', 'ส่งกลับแก้ไข'].includes(req.Status);
  const lastStep = steps.length ? +steps[steps.length - 1].StepOrder : 1;
  // ใบขอสั่งซื้อ: ลำดับฝ่ายจัดซื้อ = ชื่อขั้นมีคำว่า "จัดซื้อ" (ไม่มีใช้ลำดับสุดท้าย)
  const buyStep = signsEveryStep(req.FormCode)
    ? +((steps.find((s) => /จัดซื้อ/.test(String(s.StepName || ''))) || {}).StepOrder || lastStep) : 0;
  // ฝ่ายจัดซื้อเริ่มอัปเดตสถานะได้เลย ถ้าลำดับที่ค้างอยู่ก่อนถึงจัดซื้อเป็นลำดับ "ไม่บังคับ" ทั้งหมด
  // (เช่น รอผู้อำนวยการโครงการ ซึ่งบางคำขอไม่ต้องใช้) — บันทึกแล้วข้ามลำดับนั้นให้
  const early = !!buyStep && !done && cur < buyStep && myStepNums.includes(buyStep)
    && steps.filter((s) => +s.StepOrder >= cur && +s.StepOrder < buyStep).every(isOptionalStep);
  const canActNow = isInvolved && !done && (myStepNums.includes(cur) || early);
  // ลำดับที่ผู้ใช้กำลังดำเนินการ (ปกติ = ลำดับปัจจุบัน · จัดซื้อเริ่มก่อน = ลำดับจัดซื้อ)
  const actStep = early && !myStepNums.includes(cur) ? buyStep : cur;

  return {
    isInvolved,
    canActNow,
    actStep,
    waiting: isInvolved && !canActNow && !done && Math.min(...myStepNums) > cur,
    // ขั้นสุดท้ายแบบแนบสลิป + ปิดงาน ใช้เฉพาะฟอร์มเบิกจ่ายเงิน
    // ฟอร์มอื่นขั้นสุดท้ายเป็นการอนุมัติปกติ แล้วสถานะเป็น "อนุมัติแล้ว"
    isFinalStep: canActNow && cur === lastStep && needsSlip(req.FormCode, req.FormName),
    // ลำดับอนุมัติสุดท้าย (ทุกฟอร์ม) — ให้ผู้อนุมัติลงลายเซ็นในเอกสารได้
    isLastStep: canActNow && cur === lastStep,
    // ช่องลายเซ็นตอนอนุมัติ: ลำดับสุดท้ายทุกฟอร์ม + ทุกลำดับของฟอร์มที่ต้องเซ็นทุกขั้น (ใบขอสั่งซื้อ)
    wantsSign: canActNow && (cur === lastStep || signsEveryStep(req.FormCode)),
    // ลำดับไม่บังคับ — ผู้อนุมัติของลำดับนั้นกด "ข้าม" ได้
    canSkip: canActNow && isOptionalStep(steps.find((s) => +s.StepOrder === cur)),
    // ใบขอสั่งซื้อ ลำดับฝ่ายจัดซื้อ (ชื่อขั้นมีคำว่า "จัดซื้อ" หรือเป็นลำดับสุดท้าย) → ใช้อัปเดตสถานะแทนอนุมัติ
    isPurchasing: canActNow && !!buyStep && actStep === buyStep,
  };
}

/**
 * ฟอร์มที่ขั้นสุดท้ายต้องแนบสลิปการโอนก่อนปิดงาน (ฟอร์มเบิกจ่ายเงินเท่านั้น)
 * FM-ACC-002 เบิกเงินทดรองจ่าย · FM-ACC-003 เบิกเงินสำรองโครงการ
 */
export const SLIP_FORMS = ['FM-ACC-002', 'FM-ACC-003'];
/** ฟอร์มเบิกเงินที่ขั้นสุดท้ายต้องแนบสลิปการโอน: ตามรหัส หรือชื่อฟอร์มที่เป็นการเบิกเงินสำรอง/ทดรองจ่าย */
export const needsSlip = (code, name = '') => SLIP_FORMS.includes(String(code || '').trim().toUpperCase())
  || /เงินสำรอง|ทดรองจ่าย/.test(String(name || ''));

/** บันทึกการตัดสินใจของผู้อนุมัติ แล้วเลื่อนสถานะคำขอ */

/* ─────────────────────────────────────────────────────────────
 * เส้นทางสำเร็จรูปสำหรับ Power Automate
 * เว็บคำนวณผู้อนุมัติ + อีเมล ของทุกลำดับไว้ล่วงหน้า แล้วเขียนลงคำขอ
 * โฟลว์จึงไม่ต้องค้น List อื่นเลย อ่านจากคำขอใบเดียวจบ
 *   Route            = JSON [{step, name, mode, emails}]
 *   CurrentApprovers = อีเมลของลำดับปัจจุบัน คั่นด้วย ;
 *   PAState          = PENDING / PENDING_ALL (ให้โฟลว์ส่งการ์ด) / WAITING / DONE / NOAPPROVER
 * ───────────────────────────────────────────────────────────── */
export async function buildRoute(req) {
  const steps = applicableSteps(await stepsOf(req.FormCode), req);
  const dir = await list('directory').catch(() => []);
  const emailOf = (name) => {
    const p = dir.find((x) => String(x.Title).trim() === String(name).trim());
    return p && p.Email ? String(p.Email).trim() : '';
  };
  const route = [];
  const missing = [];
  for (const s of steps) {
    const names = await resolveApprovers(s, req).catch(() => []);
    const emails = names.map(emailOf).filter(Boolean);
    names.forEach((n) => { if (!emailOf(n)) missing.push(n); });
    // ลำดับไม่บังคับที่หาผู้อนุมัติไม่เจอ ไม่ใส่ในเส้นทาง → โฟลว์ข้ามไปลำดับถัดไปเอง
    if (isOptionalStep(s) && !emails.length) continue;
    route.push({
      step: +s.StepOrder || route.length + 1,
      name: String(s.StepName || s.Title || ''),
      mode: String(s.ApproveMode || ''),
      all: String(s.ApproveMode || '').trim() === 'ต้องอนุมัติครบทุกคน',
      // แจ้งให้ทราบตั้งแต่ยื่น (ดูอย่างเดียว) แล้วได้การ์ด "ถึงคิวคุณ" อีกครั้งเมื่อถึงลำดับนี้
      watch: isNotifyEarly(s),
      emails: [...new Set(emails)].join(';'),
    });
  }
  return { route, missing: [...new Set(missing)] };
}

/** ช่องที่ต้องเขียนเพื่อให้โฟลว์ส่งการ์ดของลำดับ stepNo */
export function flowFieldsFor(route, stepNo) {
  const cur = route.find((r) => r.step === +stepNo);
  // คนที่ขอทราบตั้งแต่ยื่น (ไม่รวมคนที่อยู่ลำดับแรกอยู่แล้ว) — โฟลว์ส่งแจ้งเฉพาะตอนเริ่มลำดับแรก
  const firstEmails = new Set(String((route[0] && route[0].emails) || '').toLowerCase().split(';').filter(Boolean));
  const watch = [...new Set(route.filter((r) => r.watch).flatMap((r) => String(r.emails || '').split(';'))
    .map((e) => e.trim()).filter((e) => e && !firstEmails.has(e.toLowerCase())))];
  return {
    WatchEmails: watch.join(';'),
    Route: JSON.stringify(route),
    CurrentApprovers: cur ? cur.emails : '',
    // PENDING = ใครคนใดคนหนึ่งกดก็ผ่าน · PENDING_ALL = ต้องกดครบทุกคน
    PAState: !(cur && cur.emails) ? 'NOAPPROVER' : (cur.all ? 'PENDING_ALL' : 'PENDING'),
  };
}


/** ข้อผิดพลาดเมื่อมีคนอื่นดำเนินการไปก่อนแล้ว (กันอนุมัติซ้ำข้ามช่องทาง) */
export class AlreadyActedError extends Error {
  constructor(msg) { super(msg); this.name = 'AlreadyActedError'; }
}

/**
 * อ่านคำขอสดจาก SharePoint แล้วตรวจว่ายังเป็นสถานะเดิมอยู่ไหม
 * กันกรณีมีคนกดจากการ์ด Teams/อีเมล หรืออีกหน้าจอไปก่อนหน้า
 */
async function assertFresh(req) {
  const all = await list('requests').catch(() => null);
  if (!all) return req;                        // อ่านไม่ได้ ปล่อยผ่าน ไม่บล็อกงาน
  const now = all.find((r) => String(r.id) === String(req.id));
  if (!now) return req;

  const same = String(now.Status) === String(req.Status)
    && (+now.CurrentStep || 1) === (+req.CurrentStep || 1)
    && parseLog(now.ApprovalLog).length === parseLog(req.ApprovalLog).length;

  if (!same) {
    const last = parseLog(now.ApprovalLog).slice(-1)[0];
    throw new AlreadyActedError(
      'คำขอนี้มีผู้ดำเนินการไปแล้ว'
      + (last ? ` — ${last.action} โดย ${last.by || '-'}` : '')
      + ` (สถานะล่าสุด: ${now.Status})\nระบบจึงไม่บันทึกซ้ำ กรุณาปิดหน้าต่างแล้วเปิดใหม่เพื่อดูสถานะล่าสุด`);
  }
  return now;
}

/**
 * closeAfter = ขั้นสุดท้ายของฟอร์มเบิกเงิน: อนุมัติ + แนบสลิป + ปิดงาน ในการบันทึกครั้งเดียว
 * (เดิมเรียก decide สองครั้ง ครั้งที่สองชนด่านกันอนุมัติซ้ำเสมอ สลิปจึงไม่ถูกบันทึกและไม่ปิดงาน)
 */
export async function decide(req, steps, { action, by, note = '', slip = null, sig = '', closeAfter = false, actStep = 0, formPatch = null }) {
  req = await assertFresh(req);                // ด่านกันอนุมัติซ้ำ
  const log = parseLog(req.ApprovalLog);
  const reqStep = +req.CurrentStep || 1;
  // ฝ่ายจัดซื้อเริ่มก่อน: ข้ามลำดับไม่บังคับที่ค้างอยู่ แล้วย้ายคำขอมาที่ลำดับจัดซื้อ
  const jump = action === PURCHASE_ACTION && +actStep > reqStep;
  if (jump) {
    steps.filter((s) => +s.StepOrder >= reqStep && +s.StepOrder < +actStep).forEach((s) => {
      log.push({ step: +s.StepOrder, action: 'ข้าม', by, note: 'ฝ่ายจัดซื้อเริ่มดำเนินการ (ลำดับไม่บังคับ)', at: new Date().toISOString() });
    });
  }
  const cur = jump ? +actStep : reqStep;
  const step = steps.find((s) => +s.StepOrder === cur);
  const mode = step ? step.ApproveMode : 'คนใดคนหนึ่งอนุมัติก็ผ่าน';

  // sig = ลายเซ็นที่ผู้อนุมัติเซ็นตอนกด (ถ้ามี) ใช้ในเอกสารส่งออก
  log.push({ step: cur, action, by, note, at: new Date().toISOString(), ...(sig ? { sig } : {}) });

  // คนเดิมกดซ้ำในลำดับเดียวกัน (เช่น กดในเว็บแล้วมากดในการ์ดอีก)
  // อัปเดตสถานะจัดซื้อทำได้หลายครั้งในลำดับเดียวกัน (รับ PR → ออก PO → ส่งของ) ไม่นับว่าซ้ำ
  const already = action !== PURCHASE_ACTION && parseLog(req.ApprovalLog)
    .some((l) => l.step === cur && String(l.by) === String(by) && l.action === action);
  if (already) {
    throw new AlreadyActedError(`คุณได้${action}คำขอนี้ในลำดับนี้ไปแล้ว ระบบจึงไม่บันทึกซ้ำ`);
  }

  const patch = { ApprovalLog: JSON.stringify(log) };

  if (jump) {
    patch.CurrentStep = cur;
    // คำนวณเส้นทางใหม่ทุกครั้งที่เลื่อนลำดับ — ใช้ผู้อนุมัติ/ชื่อที่เพิ่ม/ผู้ปฏิบัติแทนล่าสุด
    // (ไม่ใช้ Route ที่เก็บไว้ตอนยื่น ซึ่งอาจเก่าแล้วถ้าแอดมินแก้เส้นทางระหว่างทาง)
    const route = (await buildRoute(req)).route;
    // ไม่ส่งการ์ดใหม่ให้จัดซื้อ (เขาเริ่มทำในเว็บแล้ว) — การ์ดของลำดับที่ถูกข้ามจะกลายเป็นการ์ดเก่า
    Object.assign(patch, flowFieldsFor(route, cur), { PAState: 'DONE' });
  }
  if (action === PURCHASE_ACTION) {
    // ฝ่ายจัดซื้อ: บันทึกสถานะไว้ในประวัติ · "ส่งของแล้ว" = ปิดคำขอ
    // "ส่งของแล้ว" = ปิดเป็นเสร็จสิ้น · "Cancel" = ปิดเป็นยกเลิก (note อาจมีหมายเหตุต่อท้ายด้วย " — ")
    const st = String(note).split(' — ')[0].trim();
    if (st === PURCHASE_DONE) { patch.Status = 'เสร็จสิ้น'; patch.PAState = 'DONE'; }
    if (st === PURCHASE_CANCEL) { patch.Status = 'ยกเลิก'; patch.PAState = 'DONE'; }
  } else if (action === 'ไม่อนุมัติ') {
    patch.Status = 'ไม่อนุมัติ';
    patch.PAState = 'DONE';
  } else if (action === 'ส่งกลับแก้ไข') {
    patch.Status = 'ส่งกลับแก้ไข';
    patch.PAState = 'DONE';
  } else if (action === 'อนุมัติ' || action === 'ข้าม') {
    // ถ้าลำดับนี้ต้องครบทุกคน ตรวจว่าอนุมัติกันครบหรือยัง
    const approvers = (step && step._resolved) || toArr(step && step.Approvers);
    const approvedBy = log.filter((l) => l.step === cur && l.action === 'อนุมัติ').map((l) => l.by);
    // คนเดิมกดอนุมัติซ้ำในลำดับเดียวกัน ไม่นับเพิ่ม
    const stepDone = action === 'ข้าม' || mode !== 'ต้องอนุมัติครบทุกคน'
      || approvers.every((a) => approvedBy.includes(a));

    if (stepDone) {
      // ลำดับไม่บังคับที่ไม่มีผู้อนุมัติ (เช่นโครงการไม่มีผู้อำนวยการ) ข้ามให้อัตโนมัติ
      const next = steps.filter((s) => +s.StepOrder > cur && !(isOptionalStep(s) && Array.isArray(s._resolved) && !s._resolved.length))
        .map((s) => +s.StepOrder).sort((a, b) => a - b)[0];
      if (next) {
        patch.CurrentStep = next; patch.Status = 'รออนุมัติ';
        // ให้โฟลว์ส่งการ์ดลำดับถัดไป
        const route = (await buildRoute(req)).route;   // คำนวณใหม่ ไม่ใช้ Route เก่าที่เก็บไว้ตอนยื่น
        Object.assign(patch, flowFieldsFor(route, next));
      } else {
        patch.Status = 'อนุมัติแล้ว';
        patch.PAState = 'DONE';
      }
    }
  }

  if (slip) patch.PaymentSlip = JSON.stringify(slip);
  // ช่องเพิ่มในคำตอบของฟอร์ม (เช่น เลข PR ที่ฝ่ายจัดซื้อกรอก) · รวมกับข้อมูลสดล่าสุด ไม่ทับช่องอื่น
  if (formPatch) {
    let data = {};
    try { data = JSON.parse(req.FormData || '{}') || {}; } catch (e) { data = {}; }
    patch.FormData = JSON.stringify({ ...data, ...formPatch });
  }
  if (action === 'ปิดงาน') { patch.Status = 'เสร็จสิ้น'; patch.PAState = 'DONE'; }
  if (closeAfter && action === 'อนุมัติ' && patch.Status === 'อนุมัติแล้ว') {
    log.push({ step: 999, action: 'ปิดงาน', by, note: slip ? 'แนบสลิปการโอนเงิน' : '', at: new Date().toISOString() });
    patch.ApprovalLog = JSON.stringify(log);
    patch.Status = 'เสร็จสิ้น';
    patch.PAState = 'DONE';
  }

  await update('requests', req.id, patch);
  return { ...req, ...patch };
}
