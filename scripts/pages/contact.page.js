import { esc, $ } from '../core/dom.js';
import { list } from '../services/data.js';
import { settings } from '../utils/settings.js';
import { companySocial } from '../components/company-social.js';
import { copyButton, bindCopyButtons } from '../utils/clipboard.js';

/** อีเมลของหน่วยงาน — เก็บบรรทัดละอีเมล หรือคั่นด้วยจุลภาค/เว้นวรรค ตัดค่าที่ไม่ใช่อีเมลทิ้ง */
const emailsOf = (v) => [...new Set(String(v || '').split(/[\s,;]+/)
  .map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];

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
              ${emailsOf(d.Emails).length ? `<div class="ext-mails">${emailsOf(d.Emails).map((m) => `
                <span class="ext-mail"><a href="mailto:${esc(m)}">✉ ${esc(m)}</a>${copyButton(m, '')}</span>`).join('')}
              </div>` : ''}
            </li>`).join('')}
          </ul>
          <div class="panel-note">
            โทรเข้าหมายเลขกลางแล้วกดหมายเลขต่อตามฝ่าย ·
            ฝ่ายที่ยังไม่มีเบอร์ต่อ ให้ติดต่อผ่านฝ่ายประสานงานและอำนวยการ ต่อ 216
          </div>
        </div>

        <div class="contact-side">
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
        ${companySocial()}
        </div>
      </div>

      <a class="panel feedback-link" href="#/feedback">
        <span class="fb-link-ic">💬</span>
        <span><b>กล่องรับฟังความคิดเห็น</b><br><span class="dim">มีข้อเสนอแนะถึงฝ่ายบริหาร กดที่นี่ — เลือกได้ว่าจะระบุชื่อหรือไม่</span></span>
        <span class="fb-link-go">›</span>
      </a>
    </div>
  </section>`;
}

export function mount(ctx) {
  bindCopyButtons($('#app'));
}
