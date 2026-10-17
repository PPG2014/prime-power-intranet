/**
 * อ่านสิทธิ์จริงของ SharePoint Site ว่าใครเข้าถึงเว็บนี้ได้บ้าง (หน้า #/access)
 *
 * ใช้ SharePoint REST ด้วยสิทธิ์ของผู้ดูแลที่เปิดหน้านี้
 *   - ผู้เปิดต้องเป็น Owner / Full Control ของ Site (สิทธิ์ดูรายการสิทธิ์มีเฉพาะระดับนี้)
 *   - แอปต้องได้สิทธิ์ SharePoint → Delegated → AllSites.FullControl (ผู้ดูแล Microsoft 365 กดอนุมัติครั้งเดียว)
 * สมาชิกของกลุ่ม Microsoft 365 / Security group อ่านผ่าน Graph (GroupMember.Read.All) — ถ้ายังไม่ได้สิทธิ์
 * จะแสดงเป็นกลุ่มหนึ่งแถวพร้อมบอกให้ดูสมาชิกใน Entra แทน
 *
 * หน้านี้อ่านอย่างเดียว ไม่แก้สิทธิ์ใด ๆ
 */
import { CONFIG } from '../core/config.js';
import { getTokenFor } from './auth.js';

const HOST = CONFIG.sharepoint.hostname;
const SITE = `https://${HOST}${CONFIG.sharepoint.sitePath}`;
export const SP_SCOPE = `https://${HOST}/AllSites.FullControl`;
export const GROUP_SCOPE = 'GroupMember.Read.All';

/** ระดับสิทธิ์ที่ SharePoint ตั้งชื่อเป็นภาษาอังกฤษ → คำอธิบายสั้น */
export const LEVEL_TH = {
  'Full Control': 'ควบคุมทั้งหมด (แก้สิทธิ์ได้)', Design: 'ออกแบบ', Edit: 'แก้ไข', Contribute: 'เพิ่ม/แก้รายการ',
  Read: 'อ่านอย่างเดียว', 'Limited Access': 'เข้าถึงบางส่วน', 'View Only': 'ดูอย่างเดียว',
};

async function spGet(path, token) {
  const r = await fetch(SITE + path, { headers: { Accept: 'application/json;odata=nometadata', Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    const e = new Error(`SharePoint ${r.status} — ${(t.match(/"message":\{?"?(?:lang"[^}]*"value":)?"([^"]+)/) || [])[1] || r.statusText}`);
    e.status = r.status; throw e;
  }
  return r.json();
}

async function graphAll(url, token) {
  const out = [];
  let next = url;
  while (next) {
    const r = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { const e = new Error(`Graph ${r.status}`); e.status = r.status; throw e; }
    const j = await r.json();
    out.push(...(j.value || []));
    next = j['@odata.nextLink'] || null;
  }
  return out;
}

/** ประเภทของผู้ได้สิทธิ์จาก LoginName ของ SharePoint */
export function principalKind(login = '', type = 0) {
  const l = String(login).toLowerCase();
  if (l === 'c:0(.s|true') return 'everyone';                                      // Everyone (รวมคนนอก)
  if (l.includes('spo-grid-all-users')) return 'everyone-internal';                  // Everyone except external users
  if (l.includes('federateddirectoryclaimprovider|')) return 'm365group';            // กลุ่ม Microsoft 365
  if (l.startsWith('c:0t.c|tenant|')) return 'secgroup';                             // Security group ใน Entra
  if (type === 8) return 'spgroup';
  if (type === 4) return 'secgroup';
  return 'user';
}
const groupIdOf = (login) => (String(login).match(/\|([0-9a-f-]{36})(_o)?$/i) || [])[1] || '';

const levelsOf = (ra) => (ra.RoleDefinitionBindings || []).map((d) => d.Name).filter((n) => n && n !== 'Limited Access');

/**
 * อ่านสิทธิ์ทั้งหมด
 * คืน { grants: [{ scope, via, kind, name, login, email, levels, members? }], lists: [...], admins: [...], notes: [] }
 *   scope = 'site' หรือชื่อ List ที่ตั้งสิทธิ์แยก
 */
export async function readSiteAccess() {
  if (CONFIG.dataSource === 'mock') return mockAccess();
  const token = await getTokenFor([SP_SCOPE], 'อ่านสิทธิ์ SharePoint (AllSites.FullControl)');
  const notes = [];

  const expand = '?$expand=Member,RoleDefinitionBindings';
  const [web, lists, admins] = await Promise.all([
    spGet(`/_api/web/roleassignments${expand}`, token),
    spGet('/_api/web/lists?$select=Id,Title,HasUniqueRoleAssignments,Hidden&$filter=Hidden eq false', token),
    spGet('/_api/web/siteusers?$filter=IsSiteAdmin eq true&$select=Title,Email,LoginName,PrincipalType', token),
  ]);

  const grants = [];
  const groupUsers = new Map();      // id กลุ่ม SharePoint → สมาชิก (อ่านครั้งเดียว)
  const addAssignments = async (value, scope) => {
    for (const ra of value || []) {
      const m = ra.Member || {};
      const levels = levelsOf(ra);
      if (!levels.length) continue;                        // Limited Access อย่างเดียว = ไม่ได้เข้าถึงจริง
      const kind = principalKind(m.LoginName, m.PrincipalType);
      const g = { scope, kind, name: m.Title || m.LoginName, login: m.LoginName || '', email: m.Email || '', levels, via: '' };
      if (kind === 'spgroup') {
        if (!groupUsers.has(m.Id)) {
          groupUsers.set(m.Id, await spGet(`/_api/web/sitegroups(${m.Id})/users?$select=Title,Email,LoginName,PrincipalType`, token)
            .then((j) => j.value || []).catch((e) => { notes.push(`อ่านสมาชิกกลุ่ม "${m.Title}" ไม่ได้ (${e.message})`); return []; }));
        }
        g.members = groupUsers.get(m.Id).map((u) => ({
          kind: principalKind(u.LoginName, u.PrincipalType), name: u.Title, login: u.LoginName, email: u.Email || '',
        })).filter((u) => !/^SHAREPOINT\\system$/i.test(u.login) && !/app@sharepoint/i.test(u.login));
      }
      grants.push(g);
    }
  };
  await addAssignments(web.value, 'site');

  // List ที่ตั้งสิทธิ์แยกจาก Site (อาจมีคนที่ไม่ได้อยู่ในกลุ่มของ Site แต่เข้าถึง List นั้นได้)
  const unique = (lists.value || []).filter((l) => l.HasUniqueRoleAssignments);
  for (const l of unique) {
    const j = await spGet(`/_api/web/lists(guid'${l.Id}')/roleassignments${expand}`, token).catch((e) => {
      notes.push(`อ่านสิทธิ์ของ List "${l.Title}" ไม่ได้ (${e.message})`); return { value: [] };
    });
    await addAssignments(j.value, l.Title);
  }

  // ขยายสมาชิกของกลุ่ม Microsoft 365 / Security group (เช่น "Intranet Members" ที่ผูกกับกลุ่ม 365)
  const dirGroups = new Set();
  grants.forEach((g) => [g, ...(g.members || [])].forEach((x) => {
    if (x.kind === 'm365group' || x.kind === 'secgroup') dirGroups.add(x.login);
  }));
  if (dirGroups.size) {
    let gtoken = null;
    try { gtoken = await getTokenFor([GROUP_SCOPE], 'อ่านสมาชิกกลุ่ม (GroupMember.Read.All)'); } catch (e) {
      notes.push(`ยังขยายรายชื่อสมาชิกกลุ่ม Microsoft 365 / Security group ไม่ได้ — ${e.message} · ดูสมาชิกได้ที่ Entra admin center → Groups`);
    }
    if (gtoken) {
      const cache = new Map();
      for (const login of dirGroups) {
        const id = groupIdOf(login);
        if (!id) continue;
        const owners = /_o$/i.test(login);
        try {
          const users = await graphAll(`https://graph.microsoft.com/v1.0/groups/${id}/${owners ? 'owners' : 'transitiveMembers'}/microsoft.graph.user?$select=displayName,mail,userPrincipalName,accountEnabled,userType&$top=999`, gtoken);
          cache.set(login, users.map((u) => ({ kind: 'user', name: u.displayName, email: u.mail || u.userPrincipalName || '',
            login: u.userPrincipalName || '', disabled: u.accountEnabled === false, guest: u.userType === 'Guest' })));
        } catch (e) { notes.push(`อ่านสมาชิกกลุ่ม ${login} ไม่ได้ (${e.message})`); }
      }
      const expandOne = (x) => (cache.has(x.login) ? cache.get(x.login).map((u) => ({ ...u, viaGroup: x.name })) : [x]);
      grants.forEach((g) => {
        if (g.members) g.members = g.members.flatMap(expandOne);
        else if (cache.has(g.login)) g.members = cache.get(g.login);
      });
    }
  }

  return {
    grants, notes,
    uniqueLists: unique.map((l) => l.Title),
    admins: (admins.value || []).map((u) => ({ name: u.Title, email: u.Email || '', login: u.LoginName })),
  };
}

/** ข้อมูลตัวอย่างสำหรับโหมด mock */
function mockAccess() {
  const u = (name, email, extra = {}) => ({ kind: 'user', name, email, login: `i:0#.f|membership|${email}`, ...extra });
  return Promise.resolve({
    notes: [],
    uniqueLists: ['Feedback'],
    admins: [u('ผู้ใช้ทดสอบ', 'demo@primepower.co.th')],
    grants: [
      { scope: 'site', kind: 'spgroup', name: 'Intranet_PrimePower Owners', levels: ['Full Control'], members: [u('ผู้ใช้ทดสอบ', 'demo@primepower.co.th')] },
      { scope: 'site', kind: 'spgroup', name: 'Intranet_PrimePower Members', levels: ['Edit'], members: [
        u('ธีรพงศ์ สายทอง', 'user20@primepower.co.th'), u('อรวรรณ พงษ์เจริญ', 'user8@primepower.co.th'),
        u('สมศักดิ์ ลาออกแล้ว', 'old.staff@primepower.co.th'),
        { kind: 'everyone-internal', name: 'Everyone except external users', login: 'c:0-.f|rolemanager|spo-grid-all-users/x', email: '' },
      ] },
      { scope: 'site', kind: 'spgroup', name: 'Intranet_PrimePower Visitors', levels: ['Read'], members: [
        u('ที่ปรึกษาภายนอก', 'consult@hotmail.com', { login: 'i:0#.f|membership|consult_hotmail.com#ext#@primepowertl.onmicrosoft.com', guest: true }),
      ] },
      { scope: 'Feedback', kind: 'user', name: 'นิติ ขุนเพ็ง', email: 'nobody@primepower.co.th', login: 'i:0#.f|membership|nobody@primepower.co.th', levels: ['Contribute'] },
    ],
  });
}
