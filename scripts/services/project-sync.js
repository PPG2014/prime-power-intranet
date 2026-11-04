/**
 * ผูกโครงการ ↔ บุคลากร ให้ตรงกันสองทาง
 *
 *   โครงการ (Owner + Team)  ⟷  บุคลากร (ช่องโครงการ Project)
 *
 * - แก้ทีมในโครงการ (เพิ่ม/ลบ/ย้ายคน) → ช่องโครงการของคนนั้นเพิ่ม/ลบชื่อโครงการตาม
 * - แก้ช่องโครงการของบุคลากร       → ทีมของโครงการนั้นเพิ่ม/ลบชื่อคนตาม
 * - เปลี่ยนชื่อโครงการ/ชื่อคน          → แก้ชื่อในอีกฝั่งให้ทั้งหมด
 * - ลบโครงการ/ลบคน                  → เอาชื่อออกจากอีกฝั่ง
 *
 * ประวัติ: คนที่ออกจากโครงการ (เอาออกจากทีม / เอาติ๊กออก / ลบโครงการ) → ชื่อโครงการไปอยู่ในช่อง PastProjects ของคนนั้น
 *   บรรทัดละโครงการ รูปแบบ "ชื่อโครงการ | วันที่ย้ายออก (YYYY-MM-DD)" (ใส่เองไม่มีวันที่ก็ได้)
 *   กลับเข้าโครงการเดิม → เอาออกจากประวัติ · ไม่มีคอลัมน์ PastProjects ใน SharePoint = ระบบข้ามไปเอง
 *
 * เขียนตรงด้วย update() ไม่ผ่านหน้าบันทึก จึงไม่วนกลับมาเรียกซ้ำ
 * คืนรายการข้อความสั้น ๆ ว่าแก้อะไรไปบ้าง และรายการที่แก้ไม่สำเร็จ
 */
import { list, update, clearDataCache } from './data.js';
import { toArray } from '../admin/entity-form.js';

const key = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const names = (v) => toArray(v).map(key).filter(Boolean);
const uniq = (a) => [...new Set(a)];
const has = (arr, v) => arr.some((x) => key(x) === key(v));
const without = (arr, v) => arr.filter((x) => key(x) !== key(v));

/** โครงการที่เคยรับผิดชอบ (ช่อง PastProjects เก็บบรรทัดละโครงการ) */
export const PAST_KEY = 'PastProjects';
/** ประวัติเป็นรายการ { title, date } · date = วันที่ย้ายออก (YYYY-MM-DD) หรือ '' ถ้าไม่ทราบ */
export function pastEntries(person) {
  const seen = new Map();
  String((person && person[PAST_KEY]) || '').split(/\r?\n/).forEach((line) => {
    const [t, d] = line.split('|');
    const title = key(t);
    if (!title) return;
    const date = (String(d || '').match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
    seen.set(title, { title, date: date || (seen.get(title) || {}).date || '' });
  });
  return [...seen.values()];
}
export const pastOf = (person) => pastEntries(person).map((e) => e.title);
const pastText = (entries) => entries.map((e) => (e.date ? `${e.title} | ${e.date}` : e.title)).join('\n');
const today = () => new Date().toLocaleDateString('sv-SE');
const dropPast = (entries, title) => entries.filter((e) => e.title !== key(title));
const addPast = (entries, title) => [...dropPast(entries, title), { title: key(title), date: today() }];
/** โครงการที่ยังดำเนินงานอยู่ (ไม่ใช่ส่งมอบแล้ว / ปิดโครงการ) */
export const isActiveProject = (pj) => !!pj && !/^(ส่งมอบแล้ว|ปิดโครงการ)/.test(String(pj.Status || '').trim());

/** คนทั้งหมดของโครงการ = ผู้รับผิดชอบหลัก + ทีมงาน */
const peopleOf = (p) => uniq([...names(p && p.Owner), ...names(p && p.Team)]);

async function apply(jobs) {
  const done = [], failed = [];
  for (const j of jobs) {
    try {
      const res = await update(j.list, j.id, j.data);
      const lost = (res && res.dropped) || [];   // SharePoint ไม่รับบางช่อง/ล้างค่าไม่ได้ → ถือว่าไม่สำเร็จ ไม่ใช่เงียบ
      if (lost.length) failed.push(`${j.note} — ${lost.join(' · ')}`); else done.push(j.note);
    } catch (e) { failed.push(`${j.note} — ${e.message}`); }
  }
  if (jobs.length) { clearDataCache('directory'); clearDataCache('projects'); }
  return { done, failed };
}

/**
 * หลังบันทึกโครงการ: before = ค่าเดิม (null ถ้าสร้างใหม่) · after = ค่าที่บันทึก (null ถ้าลบ)
 */
export async function syncFromProject(before, after) {
  const oldTitle = key(before && before.Title);
  const newTitle = key(after && after.Title);
  const renamed = !!oldTitle && oldTitle !== newTitle;          // เปลี่ยนชื่อ หรือ ลบโครงการ (newTitle ว่าง)
  const was = before ? peopleOf(before) : [];
  const now = after ? peopleOf(after) : [];
  const dir = await list('directory').catch(() => []);
  const jobs = [];

  dir.forEach((person) => {
    const name = key(person.Title);
    const cur = names(person.Project);
    let next = cur;
    const hadOld = renamed && has(next, oldTitle);
    if (hadOld) next = without(next, oldTitle);
    if (newTitle) {
      const inTeam = has(now, name);
      if ((inTeam || hadOld) && !has(next, newTitle)) next = [...next, newTitle];           // เพิ่มเข้าทีม / ตามชื่อใหม่
      else if (!inTeam && has(was, name) && has(next, newTitle)) next = without(next, newTitle); // เอาออกจากทีม
    }
    // ประวัติ: เปลี่ยนชื่อโครงการ → แก้ชื่อในประวัติด้วย · ออกจากโครงการ → เก็บไว้ในประวัติ · กลับเข้า → เอาออกจากประวัติ
    const past = pastEntries(person);
    let nextPast = renamed ? past.map((e) => (e.title === oldTitle ? { ...e, title: newTitle || e.title } : e)) : past;
    const label = newTitle || oldTitle;
    const left = (has(cur, label) || (renamed && has(cur, oldTitle))) && !has(next, label);
    if (left) nextPast = addPast(nextPast, label);
    if (newTitle && has(next, newTitle)) nextPast = dropPast(nextPast, newTitle);
    const pastChanged = pastText(nextPast) !== pastText(past);
    const projChanged = !(next.length === cur.length && next.every((x, i) => key(x) === key(cur[i])));
    if (!projChanged && !pastChanged) return;
    const added = newTitle && has(next, newTitle) && !has(cur, newTitle);
    const data = {};
    if (projChanged) data.Project = next;
    if (pastChanged) data[PAST_KEY] = pastText(nextPast);
    jobs.push({ list: 'directory', id: person.id, data,
      note: projChanged ? `${added ? 'เพิ่ม' : renamed && newTitle ? 'แก้ชื่อ' : 'เอา'}โครงการ${added || (renamed && newTitle) ? 'ให้' : 'ออกจาก'} ${name}${left ? ' (เก็บในประวัติ)' : ''}`
        : `แก้ประวัติโครงการของ ${name}` });
  });
  return apply(jobs);
}

/**
 * หลังบันทึกบุคลากร: before = ค่าเดิม (null ถ้าเพิ่มใหม่) · after = ค่าที่บันทึก (null ถ้าลบ)
 */
export async function syncFromPerson(before, after) {
  const oldName = key(before && before.Title);
  const newName = key(after && after.Title);
  const renamed = !!oldName && oldName !== newName;             // เปลี่ยนชื่อ หรือ ลบคน (newName ว่าง)
  const was = before ? names(before.Project) : [];
  const now = after ? names(after.Project) : [];
  const projects = await list('projects').catch(() => []);
  const jobs = [];

  projects.forEach((pj) => {
    const title = key(pj.Title);
    const team = names(pj.Team);
    const owner = names(pj.Owner)[0] || '';
    let nextTeam = team, nextOwner = owner;
    if (renamed) {
      nextTeam = newName ? nextTeam.map((x) => (key(x) === oldName ? newName : x)) : without(nextTeam, oldName);
      if (nextOwner === oldName) nextOwner = newName;
    }
    if (newName) {
      const ticked = has(now, title);
      if (ticked && nextOwner !== newName && !has(nextTeam, newName)) nextTeam = [...nextTeam, newName]; // ติ๊กโครงการ → เข้าทีม
      if (!ticked && has(was, title)) {                                                              // เอาติ๊กออก → ออกจากทีม
        nextTeam = without(nextTeam, newName);
        if (nextOwner === newName) nextOwner = '';
      }
    }
    const data = {};
    nextTeam = uniq(nextTeam);
    if (nextTeam.length !== team.length || nextTeam.some((x, i) => key(x) !== key(team[i]))) data.Team = nextTeam;
    if (nextOwner !== owner) data.Owner = nextOwner;
    if (!Object.keys(data).length) return;
    const joined = newName && (has(nextTeam, newName) || nextOwner === newName) && !(has(team, newName) || owner === newName)
      && !(renamed && (has(team, oldName) || owner === oldName));
    jobs.push({ list: 'projects', id: pj.id, data,
      note: `${joined ? 'เพิ่มเข้า' : renamed && newName ? 'แก้ชื่อใน' : 'เอาออกจาก'}ทีมโครงการ ${title}`
        + ('Owner' in data && !data.Owner ? ' (ผู้รับผิดชอบหลักว่างลง)' : '') });
  });
  // ประวัติของคนนี้: โครงการที่เอาติ๊กออก → เก็บใน PastProjects · ติ๊กกลับ → เอาออกจากประวัติ
  const id = (after && after.id) || (before && before.id);
  if (after && id) {
    const past = pastEntries(after.PastProjects != null ? after : before);
    let nextPast = past;
    was.filter((t) => !has(now, t)).forEach((t) => { nextPast = addPast(nextPast, t); });
    now.forEach((t) => { nextPast = dropPast(nextPast, t); });
    if (pastText(nextPast) !== pastText(past)) {
      jobs.push({ list: 'directory', id, data: { [PAST_KEY]: pastText(nextPast) }, note: `บันทึกประวัติโครงการของ ${newName}` });
    }
  }
  return apply(jobs);
}

/** ข้อความสรุปสำหรับแจ้งผู้ใช้หลังบันทึก */
export function syncSummary(r, label) {
  if (!r || (!r.done.length && !r.failed.length)) return '';
  const lines = [];
  if (r.done.length) lines.push(`อัปเดต${label}ให้ตรงกันแล้ว ${r.done.length} รายการ\n  ` + r.done.slice(0, 12).join('\n  ')
    + (r.done.length > 12 ? `\n  …และอีก ${r.done.length - 12} รายการ` : ''));
  if (r.failed.length) lines.push(`อัปเดต${label}ไม่สำเร็จ ${r.failed.length} รายการ\n  ` + r.failed.slice(0, 8).join('\n  '));
  return lines.join('\n\n');
}

/**
 * ตรวจทั้งหมดครั้งเดียว: ทำให้สองฝั่งตรงกันโดย "เติมที่ขาด" เท่านั้น ไม่ลบอะไรออก
 *   คนที่ติ๊กโครงการไว้แต่ไม่อยู่ในทีม → เพิ่มเข้าทีม
 *   คนที่อยู่ในทีม/เป็นผู้รับผิดชอบ แต่ช่องโครงการไม่มี → เพิ่มโครงการให้
 * onProgress(done, total) ใช้แสดงความคืบหน้า
 */
export async function reconcileAll(onProgress = () => {}) {
  clearDataCache('directory'); clearDataCache('projects');
  const [dir, projects] = await Promise.all([list('directory'), list('projects')]);
  const jobs = [];
  projects.forEach((pj) => {
    const title = key(pj.Title);
    const inTeam = peopleOf(pj);
    const tickers = dir.filter((p) => has(names(p.Project), title)).map((p) => key(p.Title));
    const missing = tickers.filter((n) => !has(inTeam, n));
    if (missing.length) jobs.push({ list: 'projects', id: pj.id, data: { Team: uniq([...names(pj.Team), ...missing]) },
      note: `โครงการ ${title}: เพิ่มเข้าทีม ${missing.join(', ')}` });
  });
  dir.forEach((p) => {
    const name = key(p.Title);
    const mine = names(p.Project);
    const missing = projects.filter((pj) => has(peopleOf(pj), name) && !has(mine, pj.Title)).map((pj) => key(pj.Title));
    if (missing.length) jobs.push({ list: 'directory', id: p.id, data: { Project: uniq([...mine, ...missing]) },
      note: `${name}: เพิ่มโครงการ ${missing.join(', ')}` });
  });
  const done = [], failed = [];
  for (let i = 0; i < jobs.length; i += 1) {
    const j = jobs[i];
    try { await update(j.list, j.id, j.data); done.push(j.note); }
    catch (e) { failed.push(`${j.note} — ${e.message}`); }
    onProgress(i + 1, jobs.length);
  }
  clearDataCache('directory'); clearDataCache('projects');
  return { done, failed };
}
