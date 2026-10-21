import { list, listRecent, RECENT_REQUESTS } from './services/data.js';
/** จุดเริ่มต้นของแอป — โหลดไฟล์เดียวนี้จาก index.html */
import { startRouter } from './core/router.js';
import { render, startRendering } from './core/render.js';
import { setState } from './core/state.js';
import { currentUser, startLogin, signOut, ALLOWED_DOMAIN } from './services/auth.js';
import { renderLogin, clearLogin } from './components/login-screen.js';
import { showAnnouncements } from './components/announcement-popup.js';
import { CONFIG } from './core/config.js';
import { resolveAdmin } from './utils/admin.js';
import { esc, $ } from './core/dom.js';
import { watchVersion } from './core/version-check.js';
import { startIdleLogout, IDLE_FLAG } from './services/idle-logout.js';

console.info('[Prime Power] build', CONFIG.build);
watchVersion();

/** แสดงหน้าเข้าสู่ระบบ พร้อมข้อความผิดพลาดถ้ามี */
function showLogin(error) {
  renderLogin({
    error,
    onSignIn: async () => {
      try {
        const user = await startLogin();
        if (user) await enter(user);      // โหมดข้อมูลตัวอย่าง ไม่ต้องเด้งออกไป
      } catch (err) {
        console.error(err);
        showLogin(explain(err));
      }
    },
  });
}

/** เข้าสู่หน้าเว็บหลักหลังยืนยันตัวตนแล้ว */
async function enter(user) {
  clearLogin();

  // โหมดข้อมูลตัวอย่างให้เป็นผู้ดูแลเสมอ จะได้ทดสอบหน้าจัดการข้อมูลได้
  const role = CONFIG.dataSource === 'mock'
    ? { isAdmin: true, isHR: true, isViewer: true, unconfigured: false }
    : await resolveAdmin(user.email);

  // อีเมลอื่นของบัญชี (ใช้จับคู่กับทะเบียนบุคลากรเมื่ออีเมลที่ล็อกอินไม่ตรงกับช่อง Email)
  if (CONFIG.dataSource !== 'mock') {
    const { loadMyEmails } = await import('./services/me.js');
    user.emails = await loadMyEmails(user);
  }
  setState({ user, isAdmin: role.isAdmin, isHR: role.isHR, isViewer: role.isViewer, adminUnconfigured: role.unconfigured }, { silent: true });

  $('#topbar-actions').innerHTML = `
    ${CONFIG.dataSource === 'mock' ? '<span class="mode-tag">โหมดข้อมูลตัวอย่าง</span>' : ''}
    ${role.unconfigured ? '<span class="mode-tag">ยังไม่ได้กำหนดผู้ดูแลระบบ</span>' : ''}
    <form class="top-search" id="top-search" role="search">
      <input id="top-search-q" type="search" placeholder="🔍 ค้นหาทั้งเว็บ" aria-label="ค้นหาทั้งเว็บ" autocomplete="off">
    </form>
    <span class="who">👤 ${esc(user.name)}</span>
    <button id="signout" class="signout-btn">ออกจากระบบ</button>`;
  $('#signout').onclick = () => signOut();
  $('#top-search').onsubmit = (e) => {
    e.preventDefault();
    const q = $('#top-search-q').value.trim();
    location.hash = '#/search' + (q ? '/' + encodeURIComponent(q) : '');
    $('#top-search-q').value = '';
  };
  // กด / ที่ไหนก็ได้ (นอกช่องพิมพ์) เพื่อไปช่องค้นหา
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    $('#top-search-q').focus();
  });

  $('#burger').onclick = function () {
    const open = $('#nav').classList.toggle('open');
    this.setAttribute('aria-expanded', open);
  };
  // เลือกเมนูแล้วต้องปิดแผงเมนูเอง (มือถือ) — รวมกรณีกดหน้าเดิมซ้ำซึ่งไม่เกิด hashchange
  const closeNav = () => {
    $('#nav').classList.remove('open');
    $('#burger').setAttribute('aria-expanded', 'false');
  };
  $('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) closeNav(); });
  addEventListener('hashchange', closeNav);

  startRendering();
  startRouter(render);
  startIdleLogout();

  // ข้อผิดพลาดที่ผู้ใช้เจอ → บันทึกลง AuditLog ให้ผู้ดูแลตามแก้ได้ (services/data.js logError)
  import('./services/data.js').then(({ logError }) => {
    window.addEventListener('error', (e) => {
      // รูป/สคริปต์โหลดไม่ขึ้น (ไม่มี error object) ไม่ต้องบันทึก
      if (e.error) logError(e.error);
    });
    window.addEventListener('unhandledrejection', (e) => logError(e.reason));
  });

  // ตัวเลขเตือนบนเมนู: นับทันทีที่เข้าระบบ แล้วนับซ้ำราวทุก 5 นาที เผื่อมีคำขอใหม่ระหว่างเปิดค้าง
  // สุ่มรอบละ 5–6 นาที ไม่ให้ทุกเครื่องในบริษัทดึงข้อมูลพร้อมกันเป๊ะ
  // แท็บที่ซ่อนอยู่ (ไม่ได้ดู) ไม่ดึง — พอกลับมาดูแท็บ ถ้าเลยรอบแล้วค่อยนับใหม่ทันที
  import('./services/badges.js').then((m) => {
    m.refreshBadges({ force: true });
    let lastAt = Date.now();
    const recount = () => {
      lastAt = Date.now();
      // ดึงใหม่เบื้องหลังแทนการล้างแคช → เมนูที่กดระหว่างนั้นยังขึ้นทันที
      import('./services/data.js')
        .then((d) => Promise.all(['requests', 'appraisals', 'appraisalCycles'].map((n) => d.revalidate(n))))
        .catch(() => {})
        .then(() => m.refreshBadges({ force: true }));
    };
    const tick = () => {
      if (!document.hidden) recount();
      setTimeout(tick, 5 * 60 * 1000 + Math.random() * 60 * 1000);
    };
    setTimeout(tick, 5 * 60 * 1000 + Math.random() * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastAt > 5 * 60 * 1000) recount();
    });
  });

  // ประกาศเด้งขึ้นหลังหน้าแรกวาดเสร็จ เพื่อไม่ให้บังตอนหน้ายังโหลดไม่เสร็จ
  showAnnouncements();

  // โหลดข้อมูลของทุกเมนูรอไว้เบื้องหลัง พอกดเมนูไหนก็ขึ้นได้ทันที
  // ทยอยทีละ 3 ชุด ไม่ยิง SharePoint พร้อมกันทีเดียว · หน่วงแบบสุ่ม 1.5–3.5 วินาที กระจายภาระช่วงเช้าที่คนเข้าพร้อมกัน
  const WARM = [
    ['directory', 'formCatalog', 'departments'], ['sections', 'settings', 'approvalMatrix'],
    ['documents', 'policies', 'news'], ['rooms', 'projects', 'formFields'],
    ['appraisalCycles', 'appraisalCriteria', 'appraisals'],
  ];
  const warm = async () => {
    await listRecent('requests', RECENT_REQUESTS).catch(() => {});
    for (const batch of WARM) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(batch.map((n) => list(n).catch(() => {})));
    }
  };
  setTimeout(() => (window.requestIdleCallback || ((f) => f()))(warm), 1500 + Math.random() * 2000);
}

/** แปลรหัสผิดพลาดของไมโครซอฟท์เป็นข้อความที่บอกได้ว่าต้องทำอะไรต่อ */
function explain(err) {
  const msg = String(err && (err.errorCode || err.message) || err);

  if (/AADSTS50011|redirect_uri/i.test(msg))
    return `URL ที่เด้งกลับไม่ตรงกับที่ลงทะเบียนไว้ใน Entra ID<br>
            ต้องเพิ่ม <b>${location.origin + location.pathname.replace(/[^/]*$/, '')}</b>
            ไว้ในหน้า Authentication แบบ Single-page application`;

  if (/AADSTS65001|consent_required|interaction_required/i.test(msg))
    return `ยังไม่ได้รับอนุมัติสิทธิ์เข้าถึงข้อมูล — ต้องให้ผู้ดูแล Microsoft 365 ขององค์กรอนุมัติสิทธิ์ให้ระบบก่อน
            จึงจะใช้งานได้`;

  if (/access_denied/i.test(msg))
    return `การเข้าสู่ระบบถูกปฏิเสธ เป็นได้สองกรณี<br>
            <b>1.</b> กดยกเลิกในหน้าขออนุญาตของไมโครซอฟท์ — ลองกดปุ่มด้านล่างอีกครั้งแล้วกดยอมรับ<br>
            <b>2.</b> องค์กรกำหนดให้ผู้ดูแลเป็นผู้อนุมัติเท่านั้น — ต้องส่งเรื่องให้ฝ่ายไอที`;

  if (/AADSTS50020|AADSTS50105|user_not_in/i.test(msg))
    return `บัญชีนี้ไม่มีสิทธิ์เข้าใช้ระบบ ต้องใช้บัญชีอีเมลของบริษัทที่ลงท้ายด้วย @primepower.co.th`;

  if (/msal-browser|โหลดไลบรารี/i.test(msg))
    return `โหลดไลบรารีเข้าสู่ระบบไม่สำเร็จ — ตรวจว่าไฟล์ assets/vendor/msal-browser.min.js
            อัปโหลดขึ้นเซิร์ฟเวอร์ครบแล้ว`;

  return esc(msg);
}

async function boot() {
  try {
    const user = await currentUser();
    if (user) await enter(user);
    else {
      // กลับมาจากการออกจากระบบอัตโนมัติ บอกเหตุผลบนหน้าเข้าสู่ระบบ
      let idle = false;
      try { idle = sessionStorage.getItem(IDLE_FLAG) === '1'; sessionStorage.removeItem(IDLE_FLAG); } catch (e) { /* ข้าม */ }
      showLogin(idle ? `ออกจากระบบอัตโนมัติ เพราะไม่มีการใช้งานนานเกิน ${Number(CONFIG.idleMinutes) || 60} นาที
        เพื่อความปลอดภัยของข้อมูล · กดเข้าสู่ระบบอีกครั้งเพื่อใช้งานต่อ` : undefined);
    }
  } catch (err) {
    console.error(err);
    showLogin(explain(err));
  }
}

boot();
