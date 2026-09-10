/** ตารางห้องประชุมจากปฏิทิน Outlook */
import { CONFIG } from '../core/config.js';
import { getToken } from './auth.js';

/** อ่านช่วงเวลาที่ห้องไม่ว่าง จาก Room Mailbox */
export async function getRoomSchedule(roomMailbox, startISO, endISO) {
  const token = await getToken();
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
