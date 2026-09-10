# Prime Power Group — ระบบภายในองค์กร

เว็บหน้าบ้านของระบบภายใน โฮสต์บน GitHub Pages ดึงข้อมูลจาก SharePoint ผ่าน Microsoft Graph

## เริ่มพัฒนา

โปรเจกต์นี้ใช้ ES Modules ซึ่งเปิดจากไฟล์โดยตรง (`file://`) ไม่ได้ ต้องเปิดผ่านเซิร์ฟเวอร์

```bash
python3 -m http.server 8080
# แล้วเปิด http://localhost:8080
```

หรือใช้ส่วนขยาย Live Server ใน VS Code

ตอนพัฒนาระบบอ่านข้อมูลจาก `data/mock/*.json` โดยไม่ต้องล็อกอิน
พอต่อ SharePoint ได้แล้วให้เปลี่ยน `dataSource` ใน `scripts/core/config.js` เป็น `'sharepoint'`

## นำขึ้น GitHub Pages

ดูขั้นตอนละเอียดที่ [docs/github-setup.md](docs/github-setup.md)

## ผังโฟลเดอร์

```
├── index.html              หน้าเปลือกหน้าเดียว ไม่มีเนื้อหา
├── 404.html                พากลับหน้าแรกเมื่อเปิดลิงก์ที่ไม่มี
├── assets/
│   ├── img/                รูปและโลโก้
│   └── vendor/             ไลบรารีภายนอกที่เก็บไว้เอง (MSAL) ไม่พึ่ง CDN
├── styles/
│   ├── main.css            ไฟล์เดียวที่ถูกโหลด รวม @import ทั้งหมด
│   ├── base/               reset, ตัวแปรสี, ตัวอักษร
│   ├── layout/             หัวเว็บ ท้ายเว็บ โครงหน้า
│   ├── components/         ปุ่ม ตาราง หน้าต่างลอย ฟอร์ม
│   └── pages/              สไตล์เฉพาะหน้า หนึ่งไฟล์ต่อหนึ่งหน้า
├── scripts/
│   ├── main.js             จุดเริ่มต้น
│   ├── core/               เราเตอร์ สถานะ การวาดหน้า ค่าตั้งต้น
│   ├── services/           ชั้นข้อมูล — Graph, SharePoint, ปฏิทิน, ล็อกอิน
│   ├── components/         ชิ้นส่วนที่ใช้ซ้ำหลายหน้า
│   ├── pages/              หนึ่งไฟล์ต่อหนึ่งหน้า
│   ├── admin/              หน้าจัดการข้อมูลและทะเบียนโครงสร้าง
│   └── utils/              ตัวช่วยเล็ก ๆ
├── data/mock/              ข้อมูลจำลองตอนพัฒนา
└── docs/                   เอกสารออกแบบ
```

## กฎการตั้งชื่อ

| สิ่งที่ตั้งชื่อ | รูปแบบ | ตัวอย่าง |
|---|---|---|
| โฟลเดอร์ | ตัวเล็กทั้งหมด พหูพจน์ | `pages/` `components/` |
| ไฟล์หน้า | `<ชื่อหน้า>.page.js` | `directory.page.js` |
| ไฟล์ทั่วไป | kebab-case | `form-renderer.js` |
| ไฟล์ CSS | ชื่อเดียวกับไฟล์ JS ที่คู่กัน | `pages/directory.css` |
| ตัวแปรและฟังก์ชัน | camelCase | `getRoomSchedule` |
| ค่าคงที่ | UPPER_SNAKE | `CONFIG` `SCHEMA` |
| คลาส CSS | kebab-case | `.page-title` `.data-table` |
| คลาสเฉพาะหน้า | `.page-<ชื่อหน้า>` นำหน้า | `.page-directory .card` |

## เพิ่มหน้าใหม่

1. คัดลอก `scripts/pages/_template.page.js` เป็น `<ชื่อ>.page.js`
2. แก้ `meta` ให้ครบ
3. เพิ่มหนึ่งบรรทัดใน `scripts/pages/index.js`
4. ถ้ามีสไตล์เฉพาะหน้า สร้าง `styles/pages/<ชื่อ>.css` แล้ว `@import` ใน `main.css`

เมนูบนหัวเว็บสร้างจาก `meta` อัตโนมัติ ไม่ต้องไปแก้ `index.html`

## สัญญาของหน้า

ทุกไฟล์ใน `pages/` ต้องส่งออกสามอย่างนี้เท่านั้น

```js
export const meta = { route, title, nav, order, adminOnly };
export async function render(ctx) { return '<html string>'; }
export function mount(ctx) {}   // ไม่มีก็ได้
```

**ห้ามหน้าหนึ่ง import อีกหน้าหนึ่ง** ถ้าต้องใช้ของร่วมกันให้ย้ายไป `components/` หรือ `utils/`
กฎข้อนี้คือเหตุผลที่แก้หน้าเดียวแล้วหน้าอื่นไม่พัง

## ข้อควรรู้

- ใช้ hash routing (`#/policies`) เพราะ GitHub Pages ไม่มีเซิร์ฟเวอร์คอยส่งคำขอกลับมาที่ `index.html` ถ้าใช้ path ปกติ ผู้ใช้กด refresh กลางทางจะเจอ 404
- ห้ามใส่ client secret หรือรหัสผ่านในโค้ด เว็บนี้เปิดสาธารณะ ใครก็อ่านได้
- หน้าเว็บห้ามเรียก Graph ตรง ให้เรียกผ่าน `services/data.js` เท่านั้น เวลาสลับแหล่งข้อมูลจะได้แก้ที่เดียว
