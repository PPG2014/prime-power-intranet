/**
 * ตรวจคิวชนของฟอร์มที่จองเป็นช่วงเวลา (เช่น จองคิว Messenger)
 *
 * ถือว่าชนเมื่อ "วันเดียวกัน" และ "ช่วงเวลาเหลื่อมกัน" แม้จะไม่ตรงกันเป๊ะ
 * เช่น 09:00–10:00 ชนกับ 09:30–10:30 แต่ไม่ชนกับ 10:00–11:00 (ต่อท้ายพอดี)
 * ไม่นับใบที่ยกเลิกหรือไม่อนุมัติ
 */
import { list } from './data.js';

/** ช่องที่ใช้ตรวจ ถ้าฟอร์มไหนมีครบสามช่องนี้ ระบบจะตรวจคิวชนให้อัตโนมัติ */
export const QUEUE_FIELDS = { date: 'service_date', from: 'time_from', to: 'time_to' };

const DEAD = ['ยกเลิก', 'ไม่อนุมัติ'];
const mins = (t) => {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : null;
};
const dayOf = (v) => String(v || '').slice(0, 10);

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
    .filter((r) => String(r.FormCode || '').trim() === String(formCode || '').trim())
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
      title: r.Title, by: d.requester || r.RequesterName || '',
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
