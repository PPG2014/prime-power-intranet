import { esc, $ } from '../core/dom.js';
import { list, create } from '../services/data.js';
import { settings } from '../utils/settings.js';
import { state, setState } from '../core/state.js';

export const meta = { route: 'contact', title: 'ติดต่อ', nav: true, order: 10, adminOnly: false };

export async function render(ctx) {
  const [depts, cfg] = await Promise.all([list('departments'), settings()]);
  const active = depts.filter((d) => d.IsActive !== false)
                      .sort((a, b) => (a.SortOrder || 0) - (b.SortOrder || 0));

  return `
  <section class="page page-contact">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">ค้นหาเบอร์ต่อภายใน หรือติดต่อผู้ดูแลระบบเมื่อพบปัญหาการใช้งาน</p>

      <div class="contact-cols">
        <div class="panel">
          <div class="panel-head">📞 สมุดโทรศัพท์ภายใน
            <span class="panel-meta">${active.length} หน่วยงาน</span></div>
          <ul class="ext-list">
            ${active.map((d, i) => `<li>
              <span class="ext-no">${i + 1}</span>
              <span class="ext-name">${esc(d.Title)}</span>
              <span class="ext-dots"></span>
              <span class="ext-num${d.Extension ? '' : ' none'}">${
                d.Extension ? 'ต่อ ' + esc(d.Extension) : 'ยังไม่มีเบอร์ต่อ'}</span>
            </li>`).join('')}
          </ul>
          <div class="panel-note">
            โทรเข้าหมายเลขกลางแล้วกดหมายเลขต่อตามฝ่าย ·
            ฝ่ายที่ยังไม่มีเบอร์ต่อ ให้ติดต่อผ่านฝ่ายประสานงานและอำนวยการ ต่อ 216
          </div>
        </div>

        <div class="panel panel-support">
          <div class="panel-head">🛟 ผู้ดูแลระบบ</div>
          <div class="support-body">
            <div class="support-line">${esc(cfg.SupportDept)}</div>
            <div class="support-name">${esc(cfg.SupportName)}</div>
            <div class="support-line">โทรภายใน <b>${esc(cfg.SupportExt)}</b></div>
            <a class="support-mail" href="mailto:${esc(cfg.SupportEmail)}">✉ ${esc(cfg.SupportEmail)}</a>
            <div class="support-line">เวลาให้บริการ ${esc(cfg.SupportHours)}</div>
            <div class="support-note">${esc(cfg.SupportNote)}</div>
          </div>
        </div>
      </div>

      <div class="panel feedback-panel">
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
