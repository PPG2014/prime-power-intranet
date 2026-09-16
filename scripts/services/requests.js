/**
 * ตรรกะเส้นทางอนุมัติของคำขอ
 *
 * คำขอหนึ่งใบมีสถานะรวม (Status) และเก็บว่าอยู่ลำดับไหน (CurrentStep)
 * เส้นทางแต่ละฟอร์มมาจาก ApprovalMatrix เรียงตาม StepOrder
 * ประวัติการอนุมัติแต่ละครั้งเก็บใน ApprovalLog ของคำขอนั้น (JSON)
 */
import { list, update } from './data.js';

/**
 * หาผู้อนุมัติจริงของลำดับหนึ่ง
 * ถ้าเป็นประเภทตามตำแหน่ง จะหาจากสายบังคับบัญชาหรือผังฝ่ายของผู้ยื่น
 * req = คำขอ (มี RequesterName, RequesterDept)
 */
export async function resolveApprovers(step, req) {
  const type = step.ApproverType || 'ระบุชื่อเจาะจง';
  const named = Array.isArray(step.Approvers)
    ? step.Approvers.map((x) => (x && typeof x === 'object' ? (x.LookupValue ?? x.Title) : x)).filter(Boolean)
    : String(step.Approvers || '').split(',').map((x) => x.trim()).filter(Boolean);

  if (type === 'ระบุชื่อเจาะจง') return named;

  const dir = await list('directory').catch(() => []);
  const me = dir.find((p) => p.Title === req.RequesterName);

  if (type === 'ผู้บังคับบัญชาของผู้ยื่น') {
    const rl = await list('reportingLine').catch(() => []);
    const row = rl.find((r) => r.Title === req.RequesterName);
    return row && row.Manager ? [row.Manager] : named;
  }

  if (type === 'ผู้รับผิดชอบหลักของโครงการ') {
    // อ่านชื่อโครงการจากคำตอบในฟอร์ม แล้วหา Owner จากทะเบียนโครงการ
    let projectName = '';
    try {
      const d = JSON.parse(req.FormData || '{}');
      projectName = d.project || d.project_name || d.ProjectName || '';
    } catch (e) { /* ข้อมูลเสีย */ }
    if (!projectName) return named;

    const projects = await list('projects').catch(() => []);
    const proj = projects.find((p) => p.Title === projectName || p.ProjectCode === projectName);
    if (!proj) return named;

    // Owner อาจมาเป็นออบเจ็กต์ (Lookup) หรือข้อความ
    const owner = proj.Owner && typeof proj.Owner === 'object'
      ? (proj.Owner.LookupValue ?? proj.Owner.Title ?? '')
      : proj.Owner;
    return owner ? [owner] : named;
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

/** อ่านลำดับอนุมัติของฟอร์ม เรียงจากน้อยไปมาก */
/** เติมรายชื่อผู้อนุมัติจริงลงในแต่ละลำดับ ตามผู้ยื่นของคำขอนั้น */
export async function loadResolved(steps, req) {
  for (const s of steps) s._resolved = await resolveApprovers(s, req);
  return steps;
}

/** ทำให้ค่าเป็นข้อความล้วน ตัดช่องว่าง เผื่อ FormCode มาเป็นออบเจ็กต์หรือมีช่องว่างเกิน */
const plainCode = (v) => String(
  (v && typeof v === 'object') ? (v.LookupValue ?? v.Value ?? v.Title ?? '') : (v ?? '')
).trim();

export async function stepsOf(formCode) {
  const all = await list('approvalMatrix').catch(() => []);
  const target = plainCode(formCode);
  return all
    .filter((s) => plainCode(s.FormCode) === target && s.IsActive !== false)
    .sort((a, b) => (+a.StepOrder || 0) - (+b.StepOrder || 0));
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
  // ผู้อนุมัติที่ resolve ไว้ล่วงหน้าใน step._resolved (เติมโดย loadResolved)
  const myStepNums = steps
    .filter((s) => (s._resolved || toArr(s.Approvers)).includes(userName))
    .map((s) => +s.StepOrder);

  const isInvolved = myStepNums.length > 0;
  const done = ['อนุมัติแล้ว', 'ไม่อนุมัติ', 'เสร็จสิ้น', 'ยกเลิก'].includes(req.Status);
  const canActNow = isInvolved && myStepNums.includes(cur) && !done;
  const lastStep = steps.length ? +steps[steps.length - 1].StepOrder : 1;

  return {
    isInvolved,
    canActNow,
    waiting: isInvolved && !canActNow && !done && Math.min(...myStepNums) > cur,
    isFinalStep: canActNow && cur === lastStep,
  };
}

/** บันทึกการตัดสินใจของผู้อนุมัติ แล้วเลื่อนสถานะคำขอ */
export async function decide(req, steps, { action, by, note = '', slip = null }) {
  const log = parseLog(req.ApprovalLog);
  const cur = +req.CurrentStep || 1;
  const step = steps.find((s) => +s.StepOrder === cur);
  const mode = step ? step.ApproveMode : 'คนใดคนหนึ่งอนุมัติก็ผ่าน';

  log.push({ step: cur, action, by, note, at: new Date().toISOString() });

  const patch = { ApprovalLog: JSON.stringify(log) };

  if (action === 'ไม่อนุมัติ') {
    patch.Status = 'ไม่อนุมัติ';
  } else if (action === 'อนุมัติ') {
    // ถ้าลำดับนี้ต้องครบทุกคน ตรวจว่าอนุมัติกันครบหรือยัง
    const approvers = (step && step._resolved) || toArr(step && step.Approvers);
    const approvedBy = log.filter((l) => l.step === cur && l.action === 'อนุมัติ').map((l) => l.by);
    const stepDone = mode === 'ต้องอนุมัติครบทุกคน'
      ? approvers.every((a) => approvedBy.includes(a))
      : true;

    if (stepDone) {
      const next = steps.filter((s) => +s.StepOrder > cur).map((s) => +s.StepOrder).sort((a, b) => a - b)[0];
      if (next) { patch.CurrentStep = next; patch.Status = 'รออนุมัติ'; }
      else patch.Status = 'อนุมัติแล้ว';
    }
  }

  if (slip) patch.PaymentSlip = JSON.stringify(slip);
  if (action === 'ปิดงาน') patch.Status = 'เสร็จสิ้น';

  await update('requests', req.id, patch);
  return { ...req, ...patch };
}
