/**
 * งาน O&M (บำรุงรักษาโรงไฟฟ้าที่ส่งมอบแล้ว) — ตัวเลือกพิเศษในช่องโครงการของแบบฟอร์มเบิกเงิน/ใบขอสั่งซื้อ
 *
 * เลือก "งาน O&M" ในช่องโครงการ → ต้องเลือกโครงการ O&M ต่อ (จัดกลุ่มตามลูกค้า)
 * ไม่มีในรายการ → เลือก "อื่นๆ" แล้วพิมพ์ชื่อเอง
 * คำตอบเก็บใน FormData: om_site (ชื่อโครงการ O&M) · om_group (กลุ่มลูกค้า หรือ "อื่นๆ")
 *
 * แก้รายการได้ที่ ตั้งค่าระบบ → OMSites (บรรทัดละรายการ รูปแบบ กลุ่ม|ชื่อโครงการ) ถ้าไม่ได้ตั้งใช้ DEFAULT_OM_SITES
 */
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

/** รายการโครงการ O&M [[กลุ่ม, [ชื่อ…]], …] จากตั้งค่าระบบ OMSites หรือค่าเริ่มต้น */
export async function omSites() {
  try {
    const { settings } = await import('../utils/settings.js');
    const raw = String((await settings()).OMSites || '').trim();
    if (!raw) return DEFAULT_OM_SITES;
    const groups = [];
    raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).forEach((line) => {
      const [g, n] = line.includes('|') ? line.split('|').map((x) => x.trim()) : [OM_OTHER, line];
      if (!n) return;
      let row = groups.find((x) => x[0] === g);
      if (!row) groups.push((row = [g, []]));
      row[1].push(n);
    });
    return groups.length ? groups : DEFAULT_OM_SITES;
  } catch (e) { return DEFAULT_OM_SITES; }
}

/** ข้อความโครงการสำหรับแสดง/ทะเบียน: "งาน O&M · โครงการ ALS" */
export const projectText = (v = {}) => {
  const p = String(v.project ?? '').trim();
  return p === OM_PROJECT && String(v.om_site || '').trim() ? `${p} · ${String(v.om_site).trim()}` : p;
};
