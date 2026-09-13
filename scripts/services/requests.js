/**
 * ตรรกะเส้นทางอนุมัติของคำขอ
 *
 * คำขอหนึ่งใบมีสถานะรวม (Status) และเก็บว่าอยู่ลำดับไหน (CurrentStep)
 * เส้นทางแต่ละฟอร์มมาจาก ApprovalMatrix เรียงตาม StepOrder
 * ประวัติการอนุมัติแต่ละครั้งเก็บใน ApprovalLog ของคำขอนั้น (JSON)
 */
import { list, update } from './data.js';

/** อ่านลำดับอนุมัติของฟอร์ม เรียงจากน้อยไปมาก */
export async function stepsOf(formCode) {
  const all = await list('approvalMatrix').catch(() => []);
  return all
    .filter((s) => s.FormCode === formCode && s.IsActive !== false)
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
  const myStepNums = steps
    .filter((s) => toArr(s.Approvers).includes(userName))
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
    const approvers = toArr(step && step.Approvers);
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
