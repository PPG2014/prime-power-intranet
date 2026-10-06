/**
 * แจ้งผู้ยื่นทาง Microsoft Teams พร้อมรูปสลิป เมื่อการเงินอนุมัติโอนเงิน (ฟอร์มเบิกเงินทดรองจ่าย / เงินสำรองโครงการ)
 *
 * ส่งเป็นแชต 1:1 จากบัญชีผู้อนุมัติ (การเงิน) ถึงผู้ยื่น ผ่าน Microsoft Graph
 * รูปสลิปฝังในข้อความ (hostedContents) — ผู้ยื่นเห็นรูปใน Teams ได้ทันที ไม่ต้องมีสิทธิ์ SharePoint
 * สลิปเป็น PDF → แนบเป็นลิงก์แทน
 *
 * ต้องเพิ่มสิทธิ์แบบ Delegated ในแอป Entra ID: Chat.Create, ChatMessage.Send (ผู้ดูแลกด Grant admin consent)
 * ถ้ายังไม่ได้อนุมัติสิทธิ์ การอนุมัติคำขอยังสำเร็จตามปกติ แค่ไม่มีข้อความ Teams
 */
import { CONFIG } from '../core/config.js';
import { esc } from '../core/dom.js';
import { getTokenFor } from './auth.js';
import { graphFetch } from './graph-fetch.js';

const G = 'https://graph.microsoft.com/v1.0';
const MAX_SIDE = 1280;

/** ขอสิทธิ์ Teams ไว้ก่อน — เรียกทันทีหลังผู้ใช้กดปุ่ม เผื่อต้องเด้งหน้าต่างขอสิทธิ์ (เบราว์เซอร์บล็อกถ้าช้า) */
export async function teamsToken() {
  return getTokenFor(CONFIG.auth.teamsScopes, 'Teams (Chat.Create, ChatMessage.Send)');
}

const member = (user) => ({
  '@odata.type': '#microsoft.graph.aadUserConversationMember',
  roles: ['owner'],
  'user@odata.bind': `${G}/users('${String(user).replace(/'/g, '')}')`,
});

/** ย่อรูปสลิปเป็น JPEG ด้านยาวไม่เกิน MAX_SIDE → { b64, w, h } */
function imageToJpeg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k));
      const h = Math.max(1, Math.round(img.height * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // PNG โปร่งใส → พื้นขาว
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ b64: c.toDataURL('image/jpeg', 0.85).split(',')[1], w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านรูปสลิปไม่ได้')); };
    img.src = url;
  });
}

/**
 * ส่งข้อความแจ้งโอนเงินถึงผู้ยื่น
 * req = คำขอ · slip = { name, url, kind, file? } · by = ชื่อผู้อนุมัติ · note = ความเห็น
 * คืน { sent: true } / { skipped: 'self' | 'mock' }
 */
export async function notifySlipPaid({ req, slip, by, note = '', token }) {
  if (CONFIG.dataSource === 'mock') return { skipped: 'mock' };
  const to = String(req.RequesterEmail || '').trim();
  if (!to) throw new Error('คำขอนี้ไม่มีอีเมลผู้ยื่น');

  const auth = { Authorization: `Bearer ${token || await teamsToken()}` };
  const post = async (path, body) => {
    const res = await graphFetch(G + path, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (res.status === 403) throw new Error('ยังไม่ได้รับสิทธิ์ส่งข้อความ Teams (Chat.Create, ChatMessage.Send) — แจ้งผู้ดูแล Microsoft 365');
      throw new Error(`Teams ตอบกลับ ${res.status} ${t.slice(0, 160)}`);
    }
    return res.json();
  };

  const meRes = await graphFetch(`${G}/me?$select=id,mail,userPrincipalName`, { headers: auth });
  if (!meRes.ok) throw new Error(`อ่านข้อมูลบัญชีไม่ได้ (${meRes.status})`);
  const me = await meRes.json();
  // ผู้อนุมัติกับผู้ยื่นเป็นคนเดียวกัน — แชตกับตัวเองไม่ได้ ไม่ต้องแจ้ง
  if ([me.mail, me.userPrincipalName].some((x) => x && x.toLowerCase() === to.toLowerCase())) return { skipped: 'self' };

  const chat = await post('/chats', { chatType: 'oneOnOne', members: [member(me.id), member(to)] });

  let data = {};
  try { data = JSON.parse(req.FormData || '{}'); } catch (e) { data = {}; }
  const link = `${location.origin}${location.pathname}#/requests`;
  const isImg = slip.file && /^image\//.test(slip.file.type);
  const pic = isImg ? await imageToJpeg(slip.file).catch(() => null) : null;
  // แสดงในแชตกว้างไม่เกิน 480px คงสัดส่วนเดิม
  const dw = pic ? Math.min(480, pic.w) : 0;
  const dh = pic ? Math.round(pic.h * (dw / pic.w)) : 0;

  const html = `
    <p><b>💸 โอนเงินเรียบร้อยแล้ว</b> — คำขอ <b>${esc(req.Title || '')}</b></p>
    <p>แบบฟอร์ม: ${esc(req.FormName || '')}${data.std_subject ? `<br>เรื่อง: ${esc(data.std_subject)}` : ''}
    <br>อนุมัติและโอนโดย: ${esc(by || '')}${note ? `<br>ความเห็น: ${esc(note)}` : ''}</p>
    <p><b>หลักฐานการโอนเงิน</b>${pic ? '' : `: <a href="${esc(slip.url || link)}">${esc(slip.name || 'เปิดไฟล์สลิป')}</a>`}</p>
    ${pic ? `<p><img src="../hostedContents/1/$value" alt="สลิปโอนเงิน" style="width:${dw}px;height:${dh}px"></p>` : ''}
    <p><a href="${esc(link)}">เปิดดูคำขอในระบบ Intranet</a></p>`;

  await post(`/chats/${chat.id}/messages`, {
    body: { contentType: 'html', content: html },
    ...(pic ? { hostedContents: [{ '@microsoft.graph.temporaryId': '1', contentBytes: pic.b64, contentType: 'image/jpeg' }] } : {}),
  });
  return { sent: true };
}
