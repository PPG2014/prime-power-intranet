/**
 * ตรวจคิวชนของฟอร์มที่จองเป็นช่วงเวลา (เช่น จองคิว Messenger)
 *
 * ถือว่าชนเมื่อ "วันเดียวกัน" และ "ช่วงเวลาเหลื่อมกัน" แม้จะไม่ตรงกันเป๊ะ
 * เช่น 09:00–10:00 ชนกับ 09:30–10:30 แต่ไม่ชนกับ 10:00–11:00 (ต่อท้ายพอดี)
 * ไม่นับใบที่ยกเลิกหรือไม่อนุมัติ · ชนแล้วยังจองทับได้หลังผู้ยื่นยืนยัน (ปฏิทินแสดงเป็นสีคิวชน)
 */
import { list } from './data.js';
import { localDay } from './car.js';

/** ช่องที่ใช้ตรวจ ถ้าฟอร์มไหนมีครบสามช่องนี้ ระบบจะตรวจคิวชนให้อัตโนมัติ */
export const QUEUE_FIELDS = { date: 'service_date', from: 'time_from', to: 'time_to' };

export const DEAD = ['ยกเลิก', 'ไม่อนุมัติ'];

/** รหัสฟอร์มของคำขอ (คอลัมน์อาจเป็น Lookup หรือว่าง → ดูจากเลขที่เอกสาร FM-XXX-000-nnn-yyyy) */
export const codeOf = (r) => {
  const v = r.FormCode;
  const c = String((v && typeof v === 'object') ? (v.LookupValue ?? v.Title ?? '') : (v ?? '')).trim();
  return c || (String(r.Title || '').match(/^([A-Z]+-[A-Z]+-\d+)-/) || [])[1] || '';
};

/** สีตามสถานะ: wait รออนุมัติ · back ส่งกลับแก้ไข · ok อนุมัติแล้ว/เสร็จสิ้น · done คืนรถแล้ว · dead ยกเลิก/ไม่อนุมัติ */
export const stTone = (s) => (s === 'รออนุมัติ' ? 'wait' : s === 'ส่งกลับแก้ไข' ? 'back' : s === 'คืนรถแล้ว' ? 'done'
  : DEAD.includes(s) ? 'dead' : 'ok');
const mins = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : null;
};
const dayOf = localDay;   // ช่องวันที่เก็บเป็น ISO เที่ยงคืนเวลาไทย ตัด 10 ตัวแรกจะได้วันก่อนหน้า

/** คิวที่เวลาเหลื่อมกับคิวอื่นในวันเดียวกัน (ไม่นับใบยกเลิก/ไม่อนุมัติ) → ตั้ง b.clash = true */
export function markClashes(list, { day = (b) => b.day, from = (b) => b.from, to = (b) => b.to, live = () => true } = {}) {
  const byDay = {};
  list.filter(live).forEach((b) => { (byDay[day(b)] = byDay[day(b)] || []).push(b); });
  Object.values(byDay).forEach((xs) => xs.forEach((a) => {
    const a1 = mins(from(a)); const a2 = mins(to(a));
    if (a1 == null || a2 == null) return;
    a.clash = xs.some((b) => b !== a && mins(from(b)) != null && mins(to(b)) != null && a1 < mins(to(b)) && a2 > mins(from(b)));
  }));
  return list;
}

/** ฟอร์มนี้ต้องตรวจคิวชนไหม (ดูจากช่องกรอกที่มี) */
export const isQueueForm = (fields = []) => {
  const keys = new Set(fields.map((f) => f.FieldKey));
  return keys.has(QUEUE_FIELDS.date) && keys.has(QUEUE_FIELDS.from) && keys.has(QUEUE_FIELDS.to);
};

/**
 * คืนรายการคำขอที่คิวชนกับช่วงที่ขอ
 * @returns [{ title, by, from, to }]
 */
export async function queueConflicts({ formCode, date, from, to, excludeId = null }) {
  const a1 = mins(from); const a2 = mins(to);
  if (!date || a1 == null || a2 == null) return [];

  const rows = await list('requests').catch(() => []);
  return rows
    .filter((r) => codeOf(r) === String(formCode || '').trim())
    .filter((r) => !DEAD.includes(String(r.Status || '').trim()))
    .filter((r) => String(r.id) !== String(excludeId))
    .map((r) => {
      let d = {};
      try { d = JSON.parse(r.FormData || '{}'); } catch (e) { return null; }
      return { r, d };
    })
    .filter(Boolean)
    .filter(({ d }) => dayOf(d[QUEUE_FIELDS.date]) === dayOf(date))
    .map(({ r, d }) => ({
      title: r.Title, by: d.requester || r.RequesterName || '', status: String(r.Status || '').trim(),
      what: String(d.std_subject || d.job_detail || d.subject || '').trim(), place: String(d.place || '').trim(),
      from: d[QUEUE_FIELDS.from], to: d[QUEUE_FIELDS.to],
      f: mins(d[QUEUE_FIELDS.from]), t: mins(d[QUEUE_FIELDS.to]),
    }))
    .filter((x) => x.f != null && x.t != null && a1 < x.t && a2 > x.f)   // เหลื่อมกันจริง
    .sort((x, y) => x.f - y.f);
}

/** ช่วงเวลาที่ยังว่างของวันนั้น จากตัวเลือกเวลาในฟอร์ม (ไว้แนะนำผู้ใช้) */
export async function freeSlots({ formCode, date, slots = [], minSpan = 30 }) {
  const taken = await queueConflicts({
    formCode, date, from: slots[0], to: slots[slots.length - 1],
  });
  const busy = taken.map((x) => [x.f, x.t]);
  const out = [];
  for (let i = 0; i < slots.length - 1; i += 1) {
    const s = mins(slots[i]); const e = s + minSpan;
    if (!busy.some(([bf, bt]) => s < bt && e > bf)) out.push(slots[i]);
  }
  return out;
}
