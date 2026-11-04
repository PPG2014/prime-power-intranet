/**
 * กล่องรับฟังความคิดเห็น — เมนูถัดจาก "ติดต่อ" (เดิมอยู่ท้ายหน้าติดต่อ ย้ายมาให้เจอง่าย กดเข้าได้ทันที)
 * บันทึกลง List Feedback · โฟลว์ "แจ้งเตือนความคิดเห็นใหม่" ส่งอีเมลหาผู้รับในตั้งค่าระบบ FeedbackRecipients
 */
import { esc, $ } from '../core/dom.js';
import { create } from '../services/data.js';
import { state, setState } from '../core/state.js';

// navTitle = ชื่อสั้นบนแถบเมนูของผู้ดูแล (มีเมนูจัดการข้อมูลเพิ่ม ชื่อเต็มยาวจนเมนูพับเป็น ☰) · ผู้ใช้ทั่วไปเห็นชื่อเต็ม
export const meta = { route: 'feedback', title: '💬 กล่องรับฟังความคิดเห็น', navTitle: '💬 ความคิดเห็น', nav: true, order: 10.5, adminOnly: false };

export async function render(ctx) {
  return `
  <section class="page page-contact page-feedback">
    <div class="wrap narrow">
      <h1 class="page-title">${esc(meta.title)}</h1>

      <div class="panel feedback-panel fb-page-panel">
        <div class="panel-head">💬 กล่องรับฟังความคิดเห็น</div>
        ${state.feedbackSent ? `
          <div class="feedback-done">
            <b>ส่งความคิดเห็นเรียบร้อยแล้ว</b>
            ฝ่ายบริหารจะอ่านทุกฉบับ และสรุปประเด็นที่ดำเนินการได้ในการประชุมประจำเดือน
            <button class="btn-mini" id="fb-again">เขียนอีกฉบับ</button>
          </div>`
        : `
          <div class="feedback-body">
            <p class="feedback-lead">
              ข้อเสนอแนะส่งถึงฝ่ายบริหารโดยตรง เลือกได้ว่าจะระบุชื่อหรือไม่
            </p>

            <div class="field">
              <label for="fb-topic">เรื่องที่ต้องการเสนอ</label>
              <select id="fb-topic">
                <option>สภาพแวดล้อมในการทำงาน</option>
                <option>สวัสดิการ</option>
                <option>ขั้นตอนการทำงานและเอกสาร</option>
                <option>ความปลอดภัย</option>
                <option>ระบบภายในองค์กร</option>
                <option>อื่น ๆ</option>
              </select>
            </div>

            <div class="field">
              <label for="fb-msg">รายละเอียด</label>
              <div class="field-help">
                เล่าสถานการณ์ที่เจอและสิ่งที่อยากให้เปลี่ยน จะช่วยให้ดำเนินการต่อได้เร็วขึ้น
              </div>
              <textarea id="fb-msg" rows="5" placeholder="พิมพ์ข้อความที่นี่"></textarea>
            </div>

            <div class="field">
              <label class="switch">
                <input type="checkbox" id="fb-anon">
                <span>ไม่ต้องการระบุชื่อผู้เสนอ</span>
              </label>
              <div class="field-help">
                ถ้าไม่ติ๊ก ระบบจะแนบชื่อและอีเมลของคุณไปด้วย เพื่อให้ติดต่อกลับได้
              </div>
            </div>

            <div class="field-error" id="fb-error" hidden></div>
            <button class="btn btn-primary" id="fb-send">ส่งความคิดเห็น</button>
          </div>`}
        <div class="panel-note">
          ระบบบันทึกวันเวลาที่ส่งไว้เพื่อจัดลำดับการติดตาม
          แม้เลือกไม่ระบุชื่อ ผู้ดูแล SharePoint ก็ยังตรวจสอบย้อนหลังได้ตามระบบบันทึกของ Microsoft 365
        </div>
      </div>
    </div>
  </section>`;
}

export function mount(ctx) {
  const again = $('#fb-again');
  if (again) again.onclick = () => setState({ feedbackSent: false });

  const send = $('#fb-send');
  if (!send) return;

  send.onclick = async () => {
    const msg = $('#fb-msg').value.trim();
    const err = $('#fb-error');

    if (msg.length < 10) {
      err.textContent = 'กรุณาเขียนรายละเอียดอย่างน้อย 10 ตัวอักษร';
      err.hidden = false;
      $('#fb-msg').focus();
      return;
    }

    const anon = $('#fb-anon').checked;
    send.disabled = true;
    send.textContent = 'กำลังส่ง…';

    try {
      await create('feedback', {
        Title: $('#fb-topic').value,
        Content: msg,
        SubmittedBy: anon ? '' : (state.user?.name || ''),
        SubmittedEmail: anon ? '' : (state.user?.email || ''),
        IsAnonymous: anon,
        Status: 'ยังไม่ได้อ่าน',
      });
      setState({ feedbackSent: true });
    } catch (e) {
      console.error(e);
      err.innerHTML = `ส่งไม่สำเร็จ<br>${esc(e.message)}`;
      err.hidden = false;
      send.disabled = false;
      send.textContent = 'ส่งความคิดเห็น';
    }
  };
}
