/**
 * เมนู 🧩 ฟังก์ชันเสริม ในหน้าจัดการข้อมูล — เปิด/ปิดฟังก์ชันที่ใช้เป็นช่วง ๆ เช่นระบบประกวดปีใหม่
 * เก็บในตั้งค่าระบบ Addons (services/addons.js)
 */
import { esc, $ } from '../core/dom.js';
import { list, create, update } from '../services/data.js';
import { toast } from '../components/toast.js';
import { renderNav } from '../core/render.js';
import { ADDONS_SETTING, CONTEST_DEFAULT, addonsConfig, formatAddons, parseFirebaseSnippet, loadAddons } from '../services/addons.js';

let draft = null;
let saved = '';
let people = [];
let fbText = '';
let fbError = '';

const dirty = () => !!draft && (formatAddons(draft) !== saved || !!fbError);
const fbToText = (fb) => (fb ? `const firebaseConfig = ${JSON.stringify(fb, null, 2)};` : '');

export async function addonsEditorHtml() {
  const [cfg, dir] = await Promise.all([addonsConfig({ fresh: true }), list('directory').catch(() => [])]);
  people = dir.filter((p) => p.IsActive !== false && p.Title).map((p) => String(p.Title).trim()).sort((a, b) => a.localeCompare(b, 'th'));
  draft = { contest: { ...cfg.contest, managers: [...cfg.contest.managers] } };
  saved = formatAddons(draft);
  fbText = fbToText(draft.contest.fb);
  fbError = '';
  return `<div class="panel-head">🧩 ฟังก์ชันเสริม · เปิดใช้เฉพาะช่วงที่ต้องการ</div>
    <div class="om-intro">
      ฟังก์ชันที่ใช้เป็นครั้งคราว เช่นกิจกรรมปีใหม่ เปิดเมื่อต้องการแล้วปิดเมื่อจบงาน
      <ul>
        <li><b>เปิด</b> = มีแถบเมนูของฟังก์ชันนั้นด้านบน · <b>ปิด</b> = แถบหายไป และเปิดลิงก์ตรงก็เข้าไม่ได้</li>
        <li>ปิดแล้วข้อมูลยังอยู่ครบ เปิดใหม่ใช้ต่อได้ทันที</li>
        <li>แก้เสร็จกด <b>💾 บันทึก</b> — ทุกคนเห็นผลเมื่อเปิดหน้าเว็บครั้งถัดไป</li>
      </ul>
    </div>
    <datalist id="ad-people">${people.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="ad-editor"></div>`;
}

function paint() {
  const box = $('#ad-editor');
  if (!box) return;
  const c = draft.contest;
  const fbState = fbError ? `<div class="ad-fb bad">⚠ ${esc(fbError)}</div>`
    : c.fb ? `<div class="ad-fb ok">✓ เชื่อมต่อโปรเจกต์ <b>${esc(c.fb.projectId || c.fb.databaseURL)}</b></div>`
      : '<div class="ad-fb">ยังไม่ได้วางค่า → ระบบประกวดทำงานใน <b>โหมดทดลอง</b> (ข้อมูลอยู่ในเบราว์เซอร์เครื่องเดียว ใช้ซ้อมได้ ใช้งานจริงไม่ได้)</div>';
  box.innerHTML = `
    <div class="om-bar">
      <span class="dim">${c.enabled ? 'ระบบประกวด: เปิดอยู่' : 'ระบบประกวด: ปิดอยู่'}</span>
      <button class="btn-mini" data-ad="reset" ${dirty() ? '' : 'disabled'}>↺ ยกเลิกที่แก้</button>
      <button class="btn btn-primary om-save" data-ad="save" ${dirty() && !fbError ? '' : 'disabled'}>💾 บันทึก</button>
    </div>
    ${dirty() ? '<div class="om-unsaved">มีการแก้ไขที่ยังไม่บันทึก</div>' : ''}

    <div class="ad-card${c.enabled ? '' : ' off'}">
      <div class="ad-top">
        <div class="ad-ic">🏆</div>
        <div><h3>ระบบประกวด / โหวต (กิจกรรมปีใหม่)</h3>
          <p>กรรมการให้คะแนนจากมือถือ คะแนนขึ้นจอใหญ่ทันที · ประกาศผลทีละอันดับ · พนักงานโหวตขวัญใจได้คนละ 1 สิทธิ์</p></div>
        <label class="ad-sw" title="เปิด/ปิดฟังก์ชันนี้"><input type="checkbox" data-adf="enabled" ${c.enabled ? 'checked' : ''}><i></i><b>${c.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</b></label>
      </div>
      <div class="ad-opts">
        <div><label class="ad-l" for="ad-label">ชื่อแถบเมนู</label>
          <input type="text" id="ad-label" data-adf="label" value="${esc(c.label)}" placeholder="${esc(CONTEST_DEFAULT.label)}" maxlength="30"></div>
        <div><label class="ad-l" for="ad-title">ชื่องาน (หน้าเลือกบทบาท)</label>
          <input type="text" id="ad-title" data-adf="title" value="${esc(c.title)}" placeholder="เช่น Prime Power New Year 2027" maxlength="80"></div>
        <div><span class="ad-l">ใครเห็นแถบนี้</span>
          <div class="ad-radio">
            <label><input type="radio" name="ad-aud" value="all" ${c.audience === 'all' ? 'checked' : ''}> พนักงานทุกคน</label>
            <label><input type="radio" name="ad-aud" value="managers" ${c.audience === 'managers' ? 'checked' : ''}> เฉพาะผู้ดูแลการประกวด (ช่วงเตรียมงาน)</label>
          </div></div>
        <div><label class="ad-l" for="ad-until">ปิดแถบเองหลังวันที่ (ไม่บังคับ)</label>
          <input type="date" id="ad-until" data-adf="until" value="${esc(c.until)}"></div>
        <div class="full"><span class="ad-l">ผู้ดูแลการประกวด <span class="dim" style="font-weight:400">— เห็นปุ่มจอแสดงผลและควบคุมการประกวด · ผู้ดูแลระบบและฝ่ายบุคคลเป็นอยู่แล้ว</span></span>
          <div class="ppe-pick">
            ${c.managers.map((n, i) => `<span class="ppe-chip">${esc(n)}<button type="button" data-ad="unpick" data-i="${i}" title="เอาออก">✕</button></span>`).join('')}
            <input class="ppe-add ad-add" list="ad-people" placeholder="พิมพ์ชื่อเพื่อค้นหา แล้วเลือก" autocomplete="off">
          </div></div>
        <div class="full"><label class="ad-l" for="ad-fb">ค่า Firebase (ฐานข้อมูลสำหรับส่งคะแนนแบบทันที)</label>
          <textarea id="ad-fb" data-adf="fb" spellcheck="false" placeholder="วางก้อน firebaseConfig จาก Firebase Console ทั้งก้อน เช่น&#10;const firebaseConfig = {&#10;  apiKey: &quot;AIza...&quot;,&#10;  databaseURL: &quot;https://xxx-default-rtdb.asia-southeast1.firebasedatabase.app&quot;,&#10;  ...&#10;};">${esc(fbText)}</textarea>
          ${fbState}
          <details class="ad-help"><summary><b>วิธีตั้งค่า Firebase (ครั้งเดียว ประมาณ 10 นาที · ฟรี)</b></summary>
            <ol>
              <li>เข้า <b>console.firebase.google.com</b> → Create a project (ปิด Google Analytics ได้)</li>
              <li>Build → <b>Authentication</b> → Get started → Sign-in method → <b>Anonymous</b> → Enable</li>
              <li>Build → <b>Realtime Database</b> → Create Database → เลือก <b>Singapore</b> → Start in <b>locked mode</b></li>
              <li>แท็บ <b>Rules</b> → ลบของเดิม → วางเนื้อหาจากไฟล์ <a href="contest/database.rules.json" target="_blank" rel="noopener">contest/database.rules.json</a> → Publish</li>
              <li>⚙ Project settings → Your apps → ไอคอน <b>&lt;/&gt;</b> → ตั้งชื่อ → คัดลอกก้อน <b>firebaseConfig</b> มาวางในช่องด้านบน (ต้องมี databaseURL)</li>
              <li>Authentication → Settings → Authorized domains → เพิ่มโดเมนของเว็บนี้ (<b>${esc(location.hostname)}</b>)</li>
              <li>เปิดแถบประกวด → ควบคุมการประกวด → <b>ตั้งรหัสผู้ดูแลทันที</b> (ใครตั้งก่อนคนนั้นเป็นผู้ดูแล)</li>
            </ol>
          </details></div>
      </div>
      ${c.enabled ? `<div class="ad-links">
        <a class="btn-mini" href="#/contest">🎉 ไปที่แถบประกวด</a>
        <a class="btn-mini" href="contest/admin.html" target="_blank" rel="noopener">⚙ ควบคุมการประกวด ↗</a>
        <a class="btn-mini" href="contest/display.html" target="_blank" rel="noopener">🖥 จอแสดงผล ↗</a>
      </div>` : ''}
      <div class="ad-help">ทีม กรรมการ เกณฑ์คะแนน ดาวน์โหลดผลเป็น CSV และล้างข้อมูลเตรียมปีหน้า ทำได้ที่ <b>ควบคุมการประกวด</b>
        · ข้อมูลประกวดอยู่ใน Firebase ของบริษัท ไม่ได้อยู่ใน SharePoint</div>
    </div>
    <div class="panel-note">เก็บในตั้งค่าระบบ <b>${ADDONS_SETTING}</b> (JSON) — แก้ที่หน้านี้สะดวกกว่า</div>`;
}

async function save(btn) {
  if (fbError) { toast(fbError, 'bad'); return; }
  const value = formatAddons(draft);
  btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
  try {
    const rows = await list('settings', { fresh: true });
    const row = rows.find((r) => String(r.Title || '').trim() === ADDONS_SETTING);
    if (row) await update('settings', row.id, { Value: value });
    else await create('settings', { Title: ADDONS_SETTING, Value: value, Description: 'ฟังก์ชันเสริมที่เปิด/ปิดได้ (ระบบประกวดปีใหม่) — แก้ที่ จัดการข้อมูล → 🧩 ฟังก์ชันเสริม' });
    const { clearSettings } = await import('../utils/settings.js'); clearSettings();
    saved = value;
    await loadAddons({ fresh: true });
    renderNav();
    toast(draft.contest.enabled ? '✓ บันทึกแล้ว — แถบประกวดเปิดอยู่' : '✓ บันทึกแล้ว — แถบประกวดปิดแล้ว');
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message, 'bad');
  }
  paint();
}

export function bindAddonsEditor() {
  const box = $('#ad-editor');
  if (!box) return;
  paint();
  const refresh = () => {
    box.querySelectorAll('[data-ad="reset"]').forEach((b) => { b.disabled = !dirty(); });
    box.querySelectorAll('[data-ad="save"]').forEach((b) => { b.disabled = !dirty() || !!fbError; });
  };
  const pick = (n) => {
    if (!people.includes(n)) return false;
    if (!draft.contest.managers.includes(n)) draft.contest.managers.push(n);
    paint();
    box.querySelector('.ad-add')?.focus();
    return true;
  };
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'ad-aud') { draft.contest.audience = t.value; paint(); return; }
    if (t.dataset.adf === 'enabled') { draft.contest.enabled = t.checked; paint(); return; }
    if (t.dataset.adf === 'until') { draft.contest.until = t.value; refresh(); return; }
    if (t.dataset.adf === 'fb') {
      fbText = t.value;
      const r = parseFirebaseSnippet(fbText);
      fbError = r.error || '';
      if (!r.error) { draft.contest.fb = r.fb; fbText = fbToText(r.fb); }
      paint();
    }
  });
  box.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.adf === 'label' || t.dataset.adf === 'title') { draft.contest[t.dataset.adf] = t.value.trim(); refresh(); return; }
    if (t.dataset.adf === 'fb') { fbText = t.value; return; }
    if (t.classList.contains('ad-add')) pick(t.value.trim());
  });
  box.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t.classList.contains('ad-add') || e.key !== 'Enter') return;
    e.preventDefault();
    const n = t.value.trim();
    if (n && !pick(n)) toast(`ไม่พบ “${n}” ในทะเบียนบุคลากร — เลือกจากรายชื่อที่ขึ้นมา`, 'bad');
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ad]');
    if (!b || b.disabled) return;
    const a = b.dataset.ad;
    if (a === 'save') { save(b); return; }
    if (a === 'unpick') { draft.contest.managers.splice(+b.dataset.i, 1); paint(); return; }
    if (a === 'reset') {
      if (!confirm('ยกเลิกทุกอย่างที่แก้ไว้ กลับไปเป็นค่าที่บันทึกล่าสุด?')) return;
      addonsConfig({ fresh: true }).then((cfg) => {
        draft = { contest: { ...cfg.contest, managers: [...cfg.contest.managers] } };
        fbText = fbToText(draft.contest.fb); fbError = '';
        paint();
      });
    }
  });
}

export const addonsHasUnsaved = () => !!$('#ad-editor') && dirty();
