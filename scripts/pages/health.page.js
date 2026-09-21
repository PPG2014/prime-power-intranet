import { esc, $, onClick } from '../core/dom.js';
import { list, schemaOf } from '../services/data.js';
import { toArray } from '../admin/entity-form.js';
import { toCsv, downloadText } from '../utils/csv.js';

export const meta = { route: 'health', title: 'ตรวจสุขภาพระบบ', nav: false, order: 12, adminOnly: true };

/** ผลตรวจล่าสุด เก็บไว้ระดับโมดูลเพื่อให้ปุ่มส่งออกใช้ได้ */
let findings = [];

const clean = (v) => (v && typeof v === 'object'
  ? String(v.LookupValue ?? v.Title ?? v.Value ?? '')
  : String(v ?? '')).trim();

/**
 * ตรวจข้อมูลตั้งต้นทั้งระบบ แล้วคืนรายการปัญหาที่พบ
 * ระดับ: stop = ระบบทำงานผิดแน่นอน · warn = ควรแก้ · info = ข้อสังเกต
 */
async function runChecks() {
  const [dir, matrix, catalog, fields, projects, rooms, settings, requests] = await Promise.all([
    list('directory').catch(() => []),
    list('approvalMatrix').catch(() => []),
    list('formCatalog').catch(() => []),
    list('formFields').catch(() => []),
    list('projects').catch(() => []),
    list('rooms').catch(() => []),
    list('settings').catch(() => []),
    list('requests').catch(() => []),
  ]);

  const out = [];
  const add = (level, area, issue, detail, fix) => out.push({ level, area, issue, detail, fix });

  const names = new Set(dir.map((p) => clean(p.Title)).filter(Boolean));
  const emailOf = (name) => {
    const p = dir.find((x) => clean(x.Title) === clean(name));
    return p ? clean(p.Email) : '';
  };

  // ── สิทธิ์แอดมิน ─────────────────────────────────────────
  const admins = settings.find((s) => clean(s.Title) === 'Admins');
  if (!admins || !clean(admins.Value)) {
    add('stop', 'ความปลอดภัย', 'ยังไม่ได้กำหนดผู้ดูแลระบบ (Admins)',
      'ตอนนี้ทุกคนที่ล็อกอินแก้ข้อมูลหลักได้ทั้งหมด',
      'ไปที่ SharePoint List Settings แล้วใส่อีเมลผู้ดูแลในแถว Admins คั่นด้วยจุลภาค');
  }

  // ── ทะเบียนบุคลากร ───────────────────────────────────────
  const noEmail = dir.filter((p) => p.IsActive !== false && !clean(p.Email));
  if (noEmail.length) {
    add('stop', 'บุคลากร', `ไม่มีอีเมล ${noEmail.length} คน`,
      noEmail.slice(0, 8).map((p) => clean(p.Title)).join(', ') + (noEmail.length > 8 ? ' …' : ''),
      'คนที่ไม่มีอีเมลจะไม่ได้รับการ์ดอนุมัติทาง Teams/อีเมล');
  }
  const noMgr = dir.filter((p) => p.IsActive !== false && !clean(p.Manager));
  if (noMgr.length) {
    add('warn', 'บุคลากร', `ไม่ได้กำหนดผู้บังคับบัญชา ${noMgr.length} คน`,
      noMgr.slice(0, 8).map((p) => clean(p.Title)).join(', ') + (noMgr.length > 8 ? ' …' : ''),
      'ขั้นอนุมัติแบบ "ผู้บังคับบัญชาของผู้ยื่น" จะตกไปใช้รายชื่อสำรองแทน');
  }
  const badMgr = dir.filter((p) => clean(p.Manager) && !names.has(clean(p.Manager)));
  if (badMgr.length) {
    add('stop', 'บุคลากร', `ชื่อผู้บังคับบัญชาไม่ตรงกับทะเบียน ${badMgr.length} รายการ`,
      badMgr.slice(0, 6).map((p) => `${clean(p.Title)} → ${clean(p.Manager)}`).join(' · '),
      'ต้องสะกดตรงกับช่องชื่อในทะเบียนบุคลากรเป๊ะ แนะนำเลือกจากช่องค้นหา');
  }
  const selfMgr = dir.filter((p) => clean(p.Manager) && clean(p.Manager) === clean(p.Title));
  if (selfMgr.length) {
    add('warn', 'บุคลากร', `ตั้งตัวเองเป็นผู้บังคับบัญชา ${selfMgr.length} คน`,
      selfMgr.map((p) => clean(p.Title)).join(', '),
      'จะกลายเป็นอนุมัติคำขอของตัวเอง');
  }

  // ── เส้นทางอนุมัติ ───────────────────────────────────────
  const active = catalog.filter((f) => f.IsActive !== false);
  active.forEach((f) => {
    const code = clean(f.FormCode);
    const steps = matrix.filter((m) => clean(m.FormCode) === code);
    if (!steps.length) {
      add('stop', 'เส้นทางอนุมัติ', `ฟอร์ม ${code} ยังไม่มีเส้นทางอนุมัติ`,
        clean(f.Title), 'ยื่นแล้วจะไม่มีใครได้รับคำขอ');
      return;
    }
    steps.forEach((m) => {
      const type = clean(m.ApproverType) || 'ระบุชื่อเจาะจง';
      const people = toArray(m.Approvers).map(clean).filter(Boolean);
      if (type === 'ระบุชื่อเจาะจง' && !people.length) {
        add('stop', 'เส้นทางอนุมัติ', `${code} ลำดับ ${m.StepOrder} ไม่มีผู้อนุมัติ`,
          clean(m.StepName), 'ขั้นแบบระบุชื่อต้องกรอกรายชื่อผู้อนุมัติ');
      }
      if (type !== 'ระบุชื่อเจาะจง' && !people.length) {
        add('warn', 'เส้นทางอนุมัติ', `${code} ลำดับ ${m.StepOrder} ไม่มีรายชื่อสำรอง`,
          `${clean(m.StepName)} (${type})`, 'ถ้าหาผู้อนุมัติตามตำแหน่งไม่เจอ จะไม่มีใครได้รับคำขอ');
      }
      people.forEach((n) => {
        if (!names.has(n)) {
          add('stop', 'เส้นทางอนุมัติ', `${code} ลำดับ ${m.StepOrder} ชื่อผู้อนุมัติไม่อยู่ในทะเบียน`,
            n, 'ต้องสะกดให้ตรงกับทะเบียนบุคลากร');
        } else if (!emailOf(n)) {
          add('stop', 'เส้นทางอนุมัติ', `${code} ลำดับ ${m.StepOrder} ผู้อนุมัติไม่มีอีเมล`,
            n, 'จะส่งการ์ดอนุมัติไม่ได้');
        }
      });
    });
    const orders = steps.map((m) => +m.StepOrder || 0);
    if (new Set(orders).size !== orders.length) {
      add('stop', 'เส้นทางอนุมัติ', `${code} มีเลขลำดับซ้ำกัน`,
        orders.join(', '), 'ลำดับต้องไม่ซ้ำ ไม่งั้นระบบเดินขั้นผิด');
    }
    if (!fields.some((x) => clean(x.FormCode) === code)) {
      add('warn', 'แบบฟอร์ม', `ฟอร์ม ${code} ยังไม่มีช่องกรอก`, clean(f.Title),
        'เพิ่มช่องกรอกในเมนูจัดการข้อมูล → ช่องกรอกของฟอร์ม');
    }
  });

  // ── โครงการ ─────────────────────────────────────────────
  const openProjects = projects.filter((p) => !/^ปิดโครงการ/.test(clean(p.Status)));
  const noOwner = openProjects.filter((p) => !clean(p.Owner));
  if (noOwner.length) {
    add('warn', 'โครงการ', `ไม่ได้ระบุผู้รับผิดชอบ ${noOwner.length} โครงการ`,
      noOwner.slice(0, 8).map((p) => clean(p.Title)).join(', ') + (noOwner.length > 8 ? ' …' : ''),
      'ขั้นอนุมัติแบบ "ผู้รับผิดชอบหลักของโครงการ" จะหาคนอนุมัติไม่ได้');
  }
  const ownerBad = openProjects.filter((p) => clean(p.Owner) && !names.has(clean(p.Owner)));
  if (ownerBad.length) {
    add('stop', 'โครงการ', `ผู้รับผิดชอบไม่อยู่ในทะเบียน ${ownerBad.length} โครงการ`,
      ownerBad.slice(0, 6).map((p) => `${clean(p.Title)} → ${clean(p.Owner)}`).join(' · '),
      'ต้องเลือกชื่อจากทะเบียนบุคลากร');
  }
  const stale = openProjects.filter((p) => {
    const d = new Date(p.UpdatedDate);
    return !isNaN(d) && (Date.now() - d) / 86400000 > 45;
  });
  if (stale.length) {
    add('info', 'โครงการ', `ไม่ได้อัปเดตเกิน 45 วัน ${stale.length} โครงการ`,
      stale.slice(0, 8).map((p) => clean(p.Title)).join(', ') + (stale.length > 8 ? ' …' : ''),
      'ข้อมูลความคืบหน้าอาจไม่ตรงกับหน้างาน');
  }

  // ── ห้องประชุม ──────────────────────────────────────────
  const noMailbox = rooms.filter((r) => r.IsActive !== false && !clean(r.RoomMailbox));
  if (noMailbox.length) {
    add('warn', 'ห้องประชุม', `ไม่มี Room Mailbox ${noMailbox.length} ห้อง`,
      noMailbox.map((r) => clean(r.Title)).join(', '),
      'จองผ่านเว็บจะสร้างนัดหมายได้แต่ไม่ได้จองห้องจริง');
  }

  // ── คำขอที่กำลังเดินอยู่ ─────────────────────────────────
  const waiting = requests.filter((r) => clean(r.Status) === 'รออนุมัติ');
  const stuck = waiting.filter((r) => {
    const d = new Date(r.SubmittedDate);
    return !isNaN(d) && (Date.now() - d) / 86400000 > 7;
  });
  if (stuck.length) {
    add('warn', 'คำขอ', `ค้างเกิน 7 วัน ${stuck.length} ใบ`,
      stuck.slice(0, 8).map((r) => clean(r.Title)).join(', ') + (stuck.length > 8 ? ' …' : ''),
      'ตรวจว่าผู้อนุมัติได้รับการ์ดหรือไม่ แล้วกด ↻ ส่งแจ้งอนุมัติใหม่');
  }
  const noState = waiting.filter((r) => !clean(r.PAState));
  if (noState.length) {
    add('stop', 'คำขอ', `ไม่มีสถานะแจ้งเตือนอัตโนมัติ ${noState.length} ใบ`,
      noState.slice(0, 8).map((r) => clean(r.Title)).join(', ') + (noState.length > 8 ? ' …' : ''),
      'ยื่นก่อนอัปเดตระบบ หรือคอลัมน์ PAState ยังไม่มี — เปิดคำขอแล้วกด ↻ ส่งแจ้งอนุมัติใหม่');
  }
  const noApprover = waiting.filter((r) => clean(r.PAState) === 'NOAPPROVER');
  if (noApprover.length) {
    add('stop', 'คำขอ', `หาผู้อนุมัติไม่ได้ ${noApprover.length} ใบ`,
      noApprover.slice(0, 8).map((r) => clean(r.Title)).join(', ') + (noApprover.length > 8 ? ' …' : ''),
      'แก้อีเมล/ผู้บังคับบัญชาให้ครบ แล้วกด ↻ ส่งแจ้งอนุมัติใหม่');
  }

  // ── คอลัมน์ที่ระบบใหม่ต้องใช้ ────────────────────────────
  // อ่านโครงสร้างคอลัมน์จริงจาก SharePoint ไม่เดาจากข้อมูลในแถว
  // (คอลัมน์ที่เพิ่งสร้างและยังไม่มีข้อมูล จะไม่ปรากฏในผลอ่านรายการ)
  const need = [
    ['PAState', 'แจ้งเตือนอัตโนมัติ'], ['CurrentApprovers', 'อีเมลผู้อนุมัติปัจจุบัน'],
    ['Route', 'เส้นทางสำเร็จรูป'], ['SummaryText', 'สรุปคำขอในการ์ด'],
    ['ApprovalLog', 'ประวัติการอนุมัติ'], ['CurrentStep', 'ลำดับปัจจุบัน'],
  ];
  try {
    const cols = await schemaOf('requests');
    if (cols) {
      need.forEach(([col, use]) => {
        if (!cols.has(col)) {
          add('stop', 'คอลัมน์ SharePoint', `ยังไม่มีคอลัมน์ ${col}`, `ใช้สำหรับ${use}`,
            'สร้างใน List Requests ตามคู่มือ (ข้อความหลายบรรทัดต้องเป็น Plain text)');
        }
      });
      // ชนิดคอลัมน์ที่ผิดจะทำให้เขียนไม่ลงแบบเงียบ ๆ
      ['Status', 'FormCode'].forEach((col) => {
        const c = cols.get(col);
        if (c && c.choice) {
          add('stop', 'คอลัมน์ SharePoint', `คอลัมน์ ${col} เป็นชนิด Choice`,
            'ค่าที่ไม่ตรงตัวเลือกจะถูกตัดทิ้งโดยไม่แจ้งเตือน',
            'เปลี่ยนเป็น Single line of text');
        }
      });
      ['ApprovalLog', 'Route', 'CurrentApprovers', 'SummaryText'].forEach((col) => {
        const c = cols.get(col);
        if (c && c.text && c.text.allowMultipleLines === false) {
          add('warn', 'คอลัมน์ SharePoint', `คอลัมน์ ${col} เป็นข้อความบรรทัดเดียว`,
            'ข้อมูลยาวเกิน 255 อักขระจะบันทึกไม่ได้',
            'เปลี่ยนเป็น Multiple lines of text แบบ Plain text');
        }
      });
    }
  } catch (e) {
    add('info', 'คอลัมน์ SharePoint', 'ตรวจโครงสร้างคอลัมน์ไม่ได้', e.message,
      'ข้ามการตรวจส่วนนี้ ไม่กระทบการใช้งาน');
  }

  return out;
}

const LEVEL = {
  stop: { label: 'ต้องแก้ทันที', cls: 'hl-stop' },
  warn: { label: 'ควรแก้', cls: 'hl-warn' },
  info: { label: 'ข้อสังเกต', cls: 'hl-info' },
};

export async function render(ctx) {
  findings = await runChecks();
  const by = (lv) => findings.filter((f) => f.level === lv);

  const card = (f) => `
    <div class="hl-item ${LEVEL[f.level].cls}">
      <div class="hl-top">
        <span class="hl-tag">${esc(LEVEL[f.level].label)}</span>
        <span class="hl-area">${esc(f.area)}</span>
      </div>
      <div class="hl-issue">${esc(f.issue)}</div>
      ${f.detail ? `<div class="hl-detail">${esc(f.detail)}</div>` : ''}
      <div class="hl-fix">→ ${esc(f.fix)}</div>
    </div>`;

  return `
  <section class="page page-health">
    <div class="wrap">
      <h1 class="page-title">${esc(meta.title)}</h1>
      <p class="page-lead">ตรวจข้อมูลตั้งต้นที่ทำให้ระบบอนุมัติทำงานผิดพลาด — ตรวจสดทุกครั้งที่เปิดหน้านี้</p>

      <div class="hl-summary">
        <div class="hl-kpi stop"><b>${by('stop').length}</b><span>ต้องแก้ทันที</span></div>
        <div class="hl-kpi warn"><b>${by('warn').length}</b><span>ควรแก้</span></div>
        <div class="hl-kpi info"><b>${by('info').length}</b><span>ข้อสังเกต</span></div>
        <div class="hl-actions">
          <a class="btn-mini" href="#/admin">← กลับไปจัดการข้อมูล</a>
          <button class="btn-mini" id="hl-csv">⭳ ส่งออก CSV</button>
          <button class="btn btn-primary" id="hl-again">↻ ตรวจอีกครั้ง</button>
        </div>
      </div>

      ${findings.length
        ? `<div class="hl-list">${[...by('stop'), ...by('warn'), ...by('info')].map(card).join('')}</div>`
        : `<div class="panel"><div class="empty">✓ ไม่พบปัญหา ข้อมูลตั้งต้นครบถ้วน</div></div>`}
    </div>
  </section>`;
}

export function mount(ctx) {
  const again = $('#hl-again');
  if (again) {
    again.onclick = async () => {
      const { render: rerender } = await import('../core/render.js');
      rerender();
    };
  }
  const csv = $('#hl-csv');
  if (csv) {
    csv.onclick = () => {
      const keys = ['ระดับ', 'หมวด', 'ปัญหา', 'รายละเอียด', 'วิธีแก้'];
      const rows = findings.map((f) => ({
        'ระดับ': LEVEL[f.level].label, 'หมวด': f.area, 'ปัญหา': f.issue,
        'รายละเอียด': f.detail, 'วิธีแก้': f.fix,
      }));
      downloadText(`ตรวจสุขภาพระบบ-${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(keys, rows));
    };
  }
}
