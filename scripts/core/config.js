/**
 * ค่าตั้งต้นของระบบ — แก้ที่นี่ที่เดียว
 * ห้ามใส่รหัสผ่านหรือ client secret ในไฟล์นี้
 * เพราะเว็บบน GitHub Pages เปิดสาธารณะ ใครก็อ่านโค้ดได้
 */
export const CONFIG = {
  appName: 'Prime Power Group',

  /** 'mock' = อ่านจาก data/mock ตอนพัฒนา | 'sharepoint' = ของจริง */
  dataSource: 'sharepoint',

  /** ได้จากการจดทะเบียนแอปใน Entra ID — ค่าสองตัวนี้ไม่ใช่ความลับ */
  auth: {
    clientId: '4e75dabb-44b1-486f-bc4f-82ee14be22ea',
    tenantId: '2ca2640f-6b35-45d1-930b-9b4ee11fb711',
    /** ขอเท่าที่ใช้จริงตอนนี้ — เพิ่ม Calendars.Read.Shared ตอนทำหน้าห้องประชุมแบบดึงสด */
    scopes: ['User.Read', 'Sites.ReadWrite.All'],
    /**
     * URL ที่เด้งกลับหลังล็อกอิน — คำนวณจากที่อยู่ปัจจุบัน จึงใช้ได้ทั้งบน GitHub Pages
     * และบน localhost โดยไม่ต้องแก้โค้ด ค่าที่ได้จะลงท้ายด้วย / เสมอ
     * ต้องลงทะเบียน URL แบบมี / ปิดท้ายไว้ใน Entra ID ให้ตรงกัน
     */
    get redirectUri() {
      return typeof location === 'undefined'
        ? ''
        : location.origin + location.pathname.replace(/[^/]*$/, '');
    },
  },

  sharepoint: {
    hostname: 'primepowertl.sharepoint.com',
    sitePath: '/sites/Intranet_PrimePower',

    /** site id เต็ม — เสถียรกว่า path ถ้าวันหนึ่งมีการย้ายหรือเปลี่ยนชื่อไซต์ */
    siteId: 'primepowertl.sharepoint.com,e481f722-4912-4179-b0a5-c10aec848455,6df21c66-f30e-4ead-8063-227aca2ea3d1',

    /**
     * อ้าง List ด้วย GUID ไม่ใช่ชื่อ ด้วยสองเหตุผล
     * 1. ไซต์นี้มี "Documents" ซ้ำกันสองตัว — List ที่เราสร้าง กับคลังเอกสารที่ติดมากับไซต์
     *    ถ้าอ้างด้วยชื่อ ระบบอาจหยิบผิดตัวโดยไม่มีข้อความเตือน
     * 2. ใครเปลี่ยนชื่อ List ในอนาคต ระบบยังทำงานได้เหมือนเดิม
     */
    lists: {
      departments:    '0963b2d2-7519-467e-8dc1-59b7f102b94b',
      directory:      '6cf0471b-85a4-403f-84aa-07f6fc200bb8',
      approvalMatrix: 'fc1465b8-a4fc-4055-b20a-7e3712a592fe',
      reportingLine:  'aad62b58-f63c-46b4-88be-b436aa615bc0',
      formCatalog:    '03984a70-eade-4334-9e52-c90273560868',
      formFields:     'b34c2b04-4b73-4a09-a512-2b51f63ce122',
      requests:       '09a369a9-0d42-44f5-bec8-644c78ec1d10',
      requestHistory: '426b2721-db57-47db-83b9-888dff4b27a1',
      policies:       'b18baffa-d8d7-4183-8b87-735310919398',
      documents:      '0a41f646-cfff-44c4-b0fd-782cb61e19db',
      announcements:  'e023bbe8-3278-41de-becf-5b14413ef53b',
      news:           'affaf4c2-1334-4c6c-8b1d-715c52cea788',
      rooms:          '2ea30ef2-89dd-4064-b021-4f9c8c664d8d',
      settings:       '84daeac7-b49e-4ea4-99d2-1c7a1523aace',
    },
  },

  /** กลุ่มใน SharePoint ที่ถือว่าเป็นผู้ดูแลระบบ */
  adminGroup: 'Intranet Owners',

  ui: {
    popupIntervalSeconds: 5,
    maxPhotoBytes: 2 * 1024 * 1024,
    maxAttachmentBytes: 8 * 1024 * 1024,
  },
};
