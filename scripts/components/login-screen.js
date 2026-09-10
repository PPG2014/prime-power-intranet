/**
 * หน้าเข้าสู่ระบบ — แสดงเต็มจอเมื่อยังไม่ได้ล็อกอิน
 * ไม่มีช่องกรอกรหัสผ่านโดยตั้งใจ เพราะระบบใช้บัญชี Microsoft 365
 * รหัสผ่านต้องกรอกบนหน้าของไมโครซอฟท์เท่านั้น
 */
import { CONFIG } from '../core/config.js';
import { $ } from '../core/dom.js';

const MS_MARK = `<svg viewBox="0 0 23 23" width="18" height="18" aria-hidden="true">
  <rect x="1"  y="1"  width="10" height="10" fill="#f25022"/>
  <rect x="12" y="1"  width="10" height="10" fill="#7fba00"/>
  <rect x="1"  y="12" width="10" height="10" fill="#00a4ef"/>
  <rect x="12" y="12" width="10" height="10" fill="#ffb900"/></svg>`;

export function renderLogin({ onSignIn, error }) {
  document.body.classList.add('login-mode');
  $('#app').innerHTML = `
    <div class="login-stage">
      <div class="login-orb orb-a"></div>
      <div class="login-orb orb-b"></div>

      <main class="login-card">
        <div class="login-banner">
          <div class="login-logo"><img src="assets/img/logo-ppg.png" alt="Prime Power Group"></div>
          <h1>ระบบ Intranet Prime Power Group</h1>
          <p>ยื่นคำขอ ติดตามสถานะ และค้นหาเอกสารภายในองค์กร</p>
        </div>

        <div class="login-body">
          <h2>Account Login</h2>
          <p class="login-sub">เข้าสู่ระบบด้วยบัญชีอีเมลของบริษัท</p>

          ${error ? `<div class="login-error">${error}</div>` : ''}

          <button class="ms-button" id="ms-signin">
            ${MS_MARK}<span>เข้าสู่ระบบด้วยบัญชี Microsoft 365</span>
          </button>

          <div class="login-note">
            <span class="note-icon">🔒</span>
            <div>
              <b>เฉพาะบัญชี @primepower.co.th เท่านั้น</b>
              บัญชีส่วนตัวหรืออีเมลจากโดเมนอื่นจะเข้าใช้งานไม่ได้
              หากยังไม่มีบัญชีบริษัท ติดต่อฝ่ายทรัพยากรบุคคล
            </div>
          </div>

          <div class="login-divider"><span>ข้อมูลของคุณปลอดภัย</span></div>
          <p class="login-fine">
            ระบบไม่เก็บรหัสผ่านของคุณ การกรอกรหัสผ่านเกิดขึ้นบนหน้าเข้าสู่ระบบของ Microsoft
            และแสดงข้อมูลตามสิทธิ์ที่บัญชีของคุณมีอยู่แล้วเท่านั้น
          </p>
        </div>

        <footer class="login-foot">
          © 2569 Prime Power Group
          ${CONFIG.dataSource === 'mock' ? '<span class="mode-pill">โหมดข้อมูลตัวอย่าง</span>' : ''}
        </footer>
      </main>
    </div>`;

  $('#ms-signin').onclick = (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>กำลังพาไปหน้าเข้าสู่ระบบ…</span>';
    onSignIn();
  };
}

export function clearLogin() {
  document.body.classList.remove('login-mode');
}
