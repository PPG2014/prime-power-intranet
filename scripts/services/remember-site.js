/**
 * จำชื่อโครงการที่ผู้ยื่นพิมพ์เพิ่มเอง → เพิ่มเข้ารายการในหน้าจัดการข้อมูลให้อัตโนมัติ
 *   - โครงการ PPE ("➕ เพิ่มชื่อโครงการเอง") → จัดการข้อมูล → 🏠 โครงการ PPE (ตั้งค่าระบบ PPEProjects)
 *   - โครงการ O&M ("➕ อื่นๆ — เพิ่มโครงการที่ไม่มีในรายการ") → จัดการข้อมูล → 🔧 โครงการ O&M กลุ่ม "อื่นๆ" (OMSites)
 * ครั้งหน้าเลือกจากรายการได้เลย ไม่ต้องพิมพ์ใหม่
 *
 * เรียกหลังส่งคำขอสำเร็จ · เพิ่มไม่สำเร็จ (เช่นไม่มีสิทธิ์แก้ตั้งค่าระบบ) ไม่กระทบการส่งคำขอ
 * ชื่อที่มีอยู่แล้ว (รวมที่ผู้ดูแลซ่อนไว้) ไม่เพิ่มซ้ำ — ผู้ดูแลซ่อน/ลบ/แก้ชื่อได้ที่หน้าจัดการข้อมูล
 */
import { list, create, update } from './data.js';
import { PPE_PROJECT, PPE_SETTING, parsePpe, formatPpe } from './ppe.js';
import { PPC_PROJECT, PPC_SETTING, PPC_OTHER, PPC_GROUPS, PPC_GROUP_LABEL } from './ppc.js';
import { OM_PROJECT, OM_OTHER, OM_SETTING, parseOmSites, formatOmSites, defaultOmGroups } from './om.js';

const key = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

async function writeSetting(title, value, description) {
  const rows = await list('settings', { fresh: true });
  const row = rows.find((r) => String(r.Title || '').trim() === title);
  if (row) await update('settings', row.id, { Value: value });
  else await create('settings', { Title: title, Value: value, Description: description });
  const { clearSettings } = await import('../utils/settings.js');
  clearSettings();
}

async function rawSetting(title) {
  const rows = await list('settings', { fresh: true });
  const row = rows.find((r) => String(r.Title || '').trim() === title);
  return row ? String(row.Value || '') : '';
}

/** คืนข้อความบอกผู้ใช้ (เช่น "เพิ่มโครงการ … ในรายการแล้ว") หรือ '' ถ้าไม่ได้เพิ่ม */
export async function rememberTypedSite(values = {}) {
  const project = String(values.project || '').trim();
  try {
    if (project === PPE_PROJECT) {
      const site = String(values.ppe_site || '').trim().replace(/\s+/g, ' ');
      if (!site) return '';
      const cfg = parsePpe(await rawSetting(PPE_SETTING));
      if (cfg.projects.some((p) => key(p.name) === key(site))) return '';
      cfg.projects.push({ name: site, on: true, approvers: [] });
      await writeSetting(PPE_SETTING, formatPpe(cfg),
        'โครงการของ Prime Power Engineering Pro (PPE) + ผู้อนุมัติ — แก้ที่ จัดการข้อมูล → 🏠 โครงการ PPE');
      return `เพิ่ม "${site}" ในรายการโครงการ PPE แล้ว ครั้งหน้าเลือกจากรายการได้เลย`;
    }
    // Prime Power Construction: งานที่ไม่ใช่โครงการหลัก (โครงการหลักไม่ได้เก็บใน ppc_site)
    if (project === PPC_PROJECT) {
      const site = String(values.ppc_site || '').trim().replace(/\s+/g, ' ');
      if (!site) return '';
      const cfg = parsePpe(await rawSetting(PPC_SETTING));
      if (cfg.projects.some((p) => key(p.name) === key(site))) return '';
      const g = PPC_GROUPS.includes(String(values.ppc_group || '').trim()) ? String(values.ppc_group).trim() : PPC_OTHER;
      cfg.projects.push({ name: site, on: true, approvers: [], group: g });
      await writeSetting(PPC_SETTING, formatPpe(cfg),
        'งานของ Prime Power Construction ที่ไม่ใช่โครงการหลัก + ผู้อนุมัติ — แก้ที่ จัดการข้อมูล → 🏗️ งาน PPC');
      return `เพิ่ม "${site}" ในรายการ PPC · ${PPC_GROUP_LABEL[g] || g} แล้ว ครั้งหน้าเลือกจากรายการได้เลย`;
    }
    if (project === OM_PROJECT && String(values.om_group || '').trim() === OM_OTHER) {
      const site = String(values.om_site || '').trim().replace(/\s+/g, ' ');
      if (!site) return '';
      const raw = (await rawSetting(OM_SETTING)).trim();
      const groups = raw ? parseOmSites(raw) : [];
      const all = groups.length ? groups : defaultOmGroups();
      if (all.some((g) => g.items.some((it) => key(it.name) === key(site)))) return '';
      let g = all.find((x) => x.group === OM_OTHER);
      if (!g) all.push((g = { group: OM_OTHER, items: [] }));
      g.items.push({ name: site, on: true });
      await writeSetting(OM_SETTING, formatOmSites(all),
        'รายการโครงการ O&M (กลุ่ม|ชื่อโครงการ บรรทัดละรายการ) — แก้ที่ จัดการข้อมูล → 🔧 โครงการ O&M');
      return `เพิ่ม "${site}" ในรายการโครงการ O&M (กลุ่ม ${OM_OTHER}) แล้ว ครั้งหน้าเลือกจากรายการได้เลย`;
    }
  } catch (e) {
    // ไม่มีสิทธิ์แก้ตั้งค่าระบบ ฯลฯ — คำขอส่งสำเร็จแล้ว แค่ไม่ได้จำชื่อไว้
    console.warn('จำชื่อโครงการที่พิมพ์เองไม่สำเร็จ:', e.message);
  }
  return '';
}
