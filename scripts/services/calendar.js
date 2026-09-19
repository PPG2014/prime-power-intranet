/** ตารางห้องประชุมจากปฏิทิน Outlook */
import { CONFIG } from '../core/config.js';
import { getToken, getTokenFor } from './auth.js';

/** อ่านช่วงเวลาที่ห้องไม่ว่าง จาก Room Mailbox */
export async function getRoomSchedule(roomMailbox, startISO, endISO) {
  const token = await getTokenFor(CONFIG.auth.calendarScopes);
  const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schedules: [roomMailbox],
      startTime: { dateTime: startISO, timeZone: 'Asia/Bangkok' },
      endTime:   { dateTime: endISO,   timeZone: 'Asia/Bangkok' },
      availabilityViewInterval: 30,
    }),
  });
  if (!res.ok) throw new Error('อ่านตารางห้องไม่สำเร็จ');
  return (await res.json()).value[0];
}

/** ลิงก์เปิดปฏิทินของผู้ใช้เองพร้อมกรอกชื่อห้องไว้ให้ */
export const composeBookingUrl = (room) =>
  'https://outlook.office.com/calendar/action/compose?rru=addevent' +
  '&subject=' + encodeURIComponent(`จองห้องประชุม — ${room.Title}`) +
  '&location=' + encodeURIComponent(`${room.Title} (${room.Location})`);

/**
 * จองห้องผ่านเว็บ โดยสร้างนัดหมายในปฏิทิน Outlook ของผู้ใช้เอง
 * และเชิญ Room Mailbox เป็นห้อง (ห้องจะตอบรับอัตโนมัติตามนโยบายของห้อง)
 * ผลลัพธ์จึงเหมือนจองจาก Outlook ทุกประการ เห็นได้ทั้งใน Outlook และ Teams
 */
export async function createRoomBooking({ room, subject, startISO, endISO, attendees = [], note = '' }) {
  const token = await getTokenFor(CONFIG.auth.calendarScopes);

  const people = attendees
    .map((e) => String(e).trim()).filter(Boolean)
    .map((e) => ({ emailAddress: { address: e }, type: 'required' }));

  if (room.RoomMailbox) {
    people.push({ emailAddress: { address: room.RoomMailbox, name: room.Title }, type: 'resource' });
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject,
      body: { contentType: 'text', content: note || 'จองผ่านระบบภายในองค์กร Prime Power' },
      start: { dateTime: startISO, timeZone: 'Asia/Bangkok' },
      end:   { dateTime: endISO,   timeZone: 'Asia/Bangkok' },
      location: { displayName: `${room.Title}${room.Location ? ' · ' + room.Location : ''}` },
      attendees: people,
      allowNewTimeProposals: false,
    }),
  });

  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error?.message || ''; } catch (e) { /* ไม่มีรายละเอียด */ }
    if (res.status === 403 || /scope|permission/i.test(msg)) {
      throw new Error('ยังไม่ได้รับสิทธิ์เขียนปฏิทิน — ผู้ดูแลต้องอนุมัติสิทธิ์ Calendars.ReadWrite ก่อน');
    }
    throw new Error('จองห้องไม่สำเร็จ' + (msg ? ` — ${msg}` : ` (${res.status})`));
  }
  return res.json();
}

/** ตรวจว่าช่วงเวลาที่ขอจองชนกับนัดเดิมของห้องไหม */
export async function isRoomFree(room, startISO, endISO) {
  if (!room.RoomMailbox) return { free: true, unknown: true };
  try {
    const sch = await getRoomSchedule(room.RoomMailbox, startISO, endISO);
    const busy = (sch.scheduleItems || []).filter((x) => x.status !== 'free');
    return { free: busy.length === 0, busy };
  } catch (e) {
    return { free: true, unknown: true };   // อ่านตารางไม่ได้ ไม่บล็อกการจอง
  }
}
