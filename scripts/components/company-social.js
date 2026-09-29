/**
 * ข้อมูลติดต่อและช่องทางโซเชียลของบริษัท
 * ใช้ในหน้าติดต่อ (ใต้กล่องผู้ดูแลระบบ) และหน้าแรก (ใต้กล่องจองคิว Messenger)
 * แก้ที่อยู่หรือลิงก์ได้ที่ COMPANY ด้านล่างที่เดียว
 */
import { esc } from '../core/dom.js';

export const COMPANY = {
  nameTH: 'บริษัท ไพร์ม พาวเวอร์ คอนสตรัคชั่น จำกัด',
  nameEN: 'PRIME POWER CONSTRUCTION CO., LTD.',
  address: 'เลขที่ 99 หมู่ที่ 7 ตำบลบางตลาด อำเภอปากเกร็ด จังหวัดนนทบุรี 11120',
  links: [
    { key: 'web', label: 'เว็บไซต์บริษัท', text: 'primepowerconstruction.com',
      url: 'https://www.primepowerconstruction.com/' },
    { key: 'facebook', label: 'Facebook', text: 'Primepowergroup',
      url: 'https://www.facebook.com/Primepowergroup/' },
    { key: 'linkedin', label: 'LinkedIn', text: 'Prime Power Construction',
      url: 'https://th.linkedin.com/company/prime-power-construction' },
    { key: 'tiktok', label: 'TikTok', text: '@primepowergroup',
      url: 'https://www.tiktok.com/@primepowergroup' },
  ],
};

/** ไอคอนสีขาว วางบนวงกลมไล่สี */
const ICON = {
  pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>',
  web: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zM8 8H5.1a8 8 0 0 1 4.3-3.6C8.8 5.5 8.3 6.7 8 8zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.7-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z"/>',
  facebook: '<path d="M14 8V6.3c0-.8.2-1.3 1.4-1.3H17V2h-2.5C11.6 2 10.5 3.6 10.5 6.1V8H8v3h2.5v11H14V11h2.6l.4-3H14z"/>',
  linkedin: '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3V9.5zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4V9.5z"/>',
  tiktok: '<path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.3v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.5a6 6 0 0 0-.8-.1 5.9 5.9 0 1 0 5.9 5.9V9a7.5 7.5 0 0 0 4.4 1.4V7.1a4.4 4.4 0 0 1-3.3-1.3z"/>',
};
const icon = (k) => `<span class="cs-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON[k]}</svg></span>`;

/** กล่องข้อมูลบริษัท · compact = แบบแคบสำหรับแถบข้างหน้าแรก */
export function companySocial({ compact = false } = {}) {
  const c = COMPANY;
  return `
  <div class="panel cs-panel${compact ? ' side-panel cs-compact' : ''}">
    <div class="panel-head">🏢 ติดต่อบริษัท</div>
    <div class="cs-body">
      <div class="cs-name">${esc(c.nameTH)}</div>
      <div class="cs-en">${esc(c.nameEN)}</div>
      <div class="cs-item cs-addr">${icon('pin')}
        <span><b>ที่อยู่</b><small>${esc(c.address)}</small></span></div>
      <div class="cs-links">
        ${c.links.map((l) => `<a class="cs-item" href="${esc(l.url)}" target="_blank" rel="noopener"
            title="${esc(l.label)} — ${esc(l.url)}">${icon(l.key)}
          <span><b>${esc(l.label)}</b><small>${esc(l.text)}</small></span></a>`).join('')}
      </div>
    </div>
  </div>`;
}
