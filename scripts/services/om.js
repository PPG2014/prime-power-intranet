/**
 * งาน O&M (บำรุงรักษาโรงไฟฟ้าที่ส่งมอบแล้ว) — ตัวเลือกพิเศษในช่องโครงการของแบบฟอร์มเบิกเงิน/ใบขอสั่งซื้อ
 *
 * เลือก "งาน O&M" ในช่องโครงการ → ต้องเลือกโครงการ O&M ต่อ (จัดกลุ่มตามลูกค้า)
 * ไม่มีในรายการ → เลือก "อื่นๆ" แล้วพิมพ์ชื่อเอง
 * คำตอบเก็บใน FormData: om_site (ชื่อโครงการ O&M) · om_group (กลุ่มลูกค้า หรือ "อื่นๆ")
 *
 * แก้รายการได้ที่ จัดการข้อมูล → 🔧 โครงการ O&M (เก็บในตั้งค่าระบบ OMSites) ถ้ายังไม่ได้ตั้งใช้ DEFAULT_OM_SITES
 */
import { PPE_PROJECT } from './ppe.js';

export const OM_PROJECT = 'งาน O&M';
export const OM_OTHER = 'อื่นๆ';
/** แบบฟอร์มที่มีตัวเลือก งาน O&M */
export const OM_FORMS = ['FM-ACC-002', 'FM-ACC-003', 'FM-ACC-004', 'FM-PUR-004'];

export const DEFAULT_OM_SITES = [
  ['WHA Group', ['โครงการ ALS', 'โครงการ FTM1', 'โครงการ FTM2', 'โครงการ GC13', 'โครงการ Jelly Berry',
    'โครงการ Prinx Phase 2', 'โครงการ SFT', 'โครงการ TFS2', 'โครงการ FTS2']],
  ['Gulf Solar', ['โครงการ Sini-Thai', 'โครงการ Aoto Interior', 'โครงการ SET Industries', 'โครงการ Air imternational',
    'โครงการ Steel Alliance', 'โครงการ Toyo Filling', 'โครงการ Siam Tohcello', 'โครงการ summit laemchabang auto body work co. ltd',
    'โครงการ T.I.T International', 'โครงการ Nawaplastic (Rayong)', 'โครงการ Platinum Pro Plastic (Phase 1 )',
    'โครงการ Platinum Pro Plastic (Phase 2 )', 'โครงการ Hanon Systems Thailand Phase 1']],
];

/** ชื่อค่าในตั้งค่าระบบที่เก็บรายการโครงการ O&M (แก้ผ่านเมนู 🔧 โครงการ O&M ในหน้าจัดการข้อมูล) */
export const OM_SETTING = 'OMSites';

/**
 * อ่านรายการทั้งหมด รวมที่ซ่อนไว้ → [{ group, items: [{ name, on }] }]
 * รูปแบบที่เก็บ: บรรทัดละรายการ กลุ่ม|ชื่อโครงการ · ขึ้นต้นด้วย # = ซ่อน (ไม่แสดงในแบบฟอร์ม)
 */
export function parseOmSites(raw) {
  const groups = [];
  String(raw || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).forEach((line) => {
    const on = !line.startsWith('#');
    const body = on ? line : line.replace(/^#+\s*/, '');
    const [g, n] = body.includes('|') ? body.split('|').map((x) => x.trim()) : [OM_OTHER, body];
    if (!n) return;
    let row = groups.find((x) => x.group === (g || OM_OTHER));
    if (!row) groups.push((row = { group: g || OM_OTHER, items: [] }));
    row.items.push({ name: n, on });
  });
  return groups;
}
export const formatOmSites = (groups) => groups
  .flatMap((g) => g.items.map((it) => `${it.on ? '' : '#'}${g.group}|${it.name}`)).join('\n');
export const defaultOmGroups = () => DEFAULT_OM_SITES.map(([group, names]) => ({ group, items: names.map((name) => ({ name, on: true })) }));

/** รายการสำหรับผู้ดูแลแก้ไข (รวมที่ซ่อน) — ยังไม่เคยตั้ง ใช้รายการตั้งต้น */
export async function omGroupsForEdit() {
  const { settings } = await import('../utils/settings.js');
  const raw = String((await settings())[OM_SETTING] || '').trim();
  const g = raw ? parseOmSites(raw) : [];
  return g.length ? g : defaultOmGroups();
}

/** รายการโครงการ O&M [[กลุ่ม, [ชื่อ…]], …] ที่แสดงในแบบฟอร์ม (ไม่รวมที่ซ่อน) */
export async function omSites() {
  try {
    const { settings } = await import('../utils/settings.js');
    const raw = String((await settings())[OM_SETTING] || '').trim();
    if (!raw) return DEFAULT_OM_SITES;
    const parsed = parseOmSites(raw);
    if (!parsed.length) return DEFAULT_OM_SITES;
    // ซ่อนทุกรายการ = ตั้งใจไม่ให้มีรายการ (เหลือแค่ "อื่นๆ") ไม่ย้อนกลับไปใช้รายการตั้งต้น
    return parsed.map((g) => [g.group, g.items.filter((it) => it.on).map((it) => it.name)])
      .filter(([, names]) => names.length);
  } catch (e) { return DEFAULT_OM_SITES; }
}

/** ข้อความโครงการสำหรับแสดง/ทะเบียน: "งาน O&M · โครงการ ALS" · "Prime Power Engineering Pro Co., Ltd · บ้านคุณ…" */
export const projectText = (v = {}) => {
  const p = String(v.project ?? '').trim();
  if (p === OM_PROJECT && String(v.om_site || '').trim()) return `${p} · ${String(v.om_site).trim()}`;
  if (p === PPE_PROJECT && String(v.ppe_site || '').trim()) return `${p} · ${String(v.ppe_site).trim()}`;
  return p;
};
