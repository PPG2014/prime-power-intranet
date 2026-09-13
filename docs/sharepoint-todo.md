# สิ่งที่ต้องทำใน SharePoint

ไซต์ `https://primepowertl.sharepoint.com/sites/Intranet_PrimePower`
สรุปจากโค้ดที่ใช้งานจริง ณ ปัจจุบัน

---

## ก. สร้าง List ใหม่ 3 ตัว

### 1. `Projects` — ทะเบียนโครงการ

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| Title | Single line of text | ชื่อโครงการ (มีมาให้แล้ว) |
| ProjectCode | Single line of text | เช่น PJ-2569-01 |
| Department | Lookup → Departments.Title | |
| Status | Choice | `เตรียมงาน` `กำลังดำเนินการ` `ส่งมอบแล้ว` `ปิดโครงการ` |
| Capacity | Number | kWp |
| StartDate | Date and Time | |
| EndDate | Date and Time | |
| PlanProgress | Number | 0–100 |
| ActualProgress | Number | 0–100 |
| ActualPayment | Number | 0–100 |
| Owner | Lookup → Directory.Title | ผู้รับผิดชอบหลัก |
| Team | Lookup → Directory.Title | **ติ๊ก Allow multiple values** |
| Detail | Multiple lines of text (plain) | |
| UpdatedDate | Date and Time | ระบบเขียนให้เอง |
| SortOrder | Number | |
| IsActive | Yes/No | |

### 2. `ProjectHistory` — ประวัติความคืบหน้า

ระบบเขียนให้เองทุกครั้งที่แก้ไขโครงการ ไม่ต้องกรอกเอง

| คอลัมน์ | ชนิด |
|---|---|
| Title | Single line of text |
| ProjectCode | Single line of text |
| RecordedDate | Date and Time |
| PlanProgress | Number |
| ActualProgress | Number |
| ActualPayment | Number |
| Detail | Multiple lines of text (plain) |
| RecordedBy | Single line of text |

### 3. `Feedback` — กล่องรับฟังความคิดเห็น

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| Title | Single line of text | เรื่องที่เสนอ |
| Content | Multiple lines of text (plain) | |
| SubmittedBy | Single line of text | เว้นว่าง = ไม่ระบุชื่อ |
| SubmittedEmail | Single line of text | |
| IsAnonymous | Yes/No | |
| Status | Choice | `ยังไม่ได้อ่าน` `รับทราบแล้ว` `กำลังดำเนินการ` `ดำเนินการแล้ว` `ไม่ดำเนินการ` |
| Reply | Multiple lines of text (plain) | บันทึกภายใน ผู้ส่งไม่เห็น |

---

## ข-0. คอลัมน์ที่ต้องมีใน `FormFields` และ `Requests`

### `FormFields` — นิยามช่องของแต่ละแบบฟอร์ม

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| Title | Single line of text | ชื่อช่องที่ผู้ใช้เห็น |
| FormCode | Single line of text | เช่น FM-HR-001 |
| FieldKey | Single line of text | ชื่อช่องในระบบ อังกฤษตัวเล็ก |
| FieldType | Choice | text, textarea, number, currency, date, time, choice, multichoice, lookup, person, yesno, file, readonly |
| Options | Multiple lines of text (plain) | บรรทัดละหนึ่งตัวเลือก |
| IsRequired | Yes/No | |
| DefaultValue | Single line of text | `{today}` `{me.Title}` `{me.Position}` `{me.Department}` `{me.EmployeeCode}` |
| HelpText | Single line of text | |
| Section | Single line of text | หัวข้อที่จัดกลุ่มช่อง |
| ColumnWidth | Choice | `half` / `full` |
| ShowIf | Single line of text | เช่น `subject=เรื่องอื่น ๆ` |
| SortOrder | Number | |
| IsActive | Yes/No | |

### `ApprovalMatrix` — เส้นทางอนุมัติของแต่ละฟอร์ม

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| Title | Single line of text | ชื่อขั้น เช่น ผู้บังคับบัญชา |
| FormCode | Single line of text | รหัสฟอร์มที่ใช้เส้นทางนี้ |
| StepOrder | Number | ลำดับ เริ่มจาก 1 |
| StepName | Single line of text | |
| Approvers | Lookup → Directory.Title (**Allow multiple values**) | ผู้อนุมัติในลำดับนี้ 2-3 คน |
| ApproveMode | Choice | `คนใดคนหนึ่งอนุมัติก็ผ่าน` / `ต้องอนุมัติครบทุกคน` |
| SortOrder | Number | |
| IsActive | Yes/No | |

### หมายเหตุ FormCatalog — ช่องหัวข้อมาตรฐาน

ทุกแบบฟอร์มได้ช่องหัวข้อ 7 ช่องนี้ให้อัตโนมัติ ไม่ต้องเพิ่มใน FormFields
รหัสพนักงาน ชื่อ-นามสกุล อีเมล ฝ่าย แผนก (ดึงข้อมูลผู้ใช้เอง) · ชื่อเรื่อง · วันที่

ถ้าฟอร์มไหนไม่ต้องการ ให้เพิ่มคอลัมน์ `UseStandardHeader` ชนิด Yes/No ใน FormCatalog
แล้วตั้งเป็น No เฉพาะฟอร์มนั้น (ค่าว่างหรือ Yes = ใช้หัวข้อมาตรฐาน)

### `Requests` — คำขอที่ยื่นเข้ามา

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| Title | Single line of text | เลขที่คำขอ เช่น REQ-2569-0001 |
| FormCode | Single line of text | |
| FormName | Single line of text | |
| RequesterName | Single line of text | |
| RequesterEmail | Single line of text | |
| RequesterDept | Single line of text | |
| Status | Choice | `ร่าง` `รออนุมัติ` `อนุมัติแล้ว` `ไม่อนุมัติ` `ยกเลิก` |
| SubmittedDate | Date and Time | |
| FormData | Multiple lines of text (plain) | คำตอบทุกช่องเก็บเป็น JSON |
| Files | Multiple lines of text (plain) | ไฟล์แนบ |

**ต้องเพิ่มคอลัมน์ `EmployeeCode` ใน `Directory`** ชนิด Single line of text
เพราะฟอร์มดึงรหัสบุคลากรมากรอกให้อัตโนมัติ ไฟล์ CSV บุคลากรมีรหัสครบทั้ง 159 คนแล้ว

---

## ข. เพิ่มคอลัมน์ใน List เดิม

### `Directory`

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| Project | Lookup → Projects.Title | **Allow multiple values** · ต้องสร้าง Projects ก่อน |

ตรวจว่ามีครบแล้วหรือยัง — `Section` (Lookup → Sections), `Level` (Choice),
`Oversees` (Lookup → Departments แบบหลายค่า), `PhotoUrl`

### `Policies` · `News` · `Documents`

ทั้งสาม List เพิ่มคอลัมน์เดียวกัน

| คอลัมน์ | ชนิด |
|---|---|
| Files | **Multiple lines of text (plain)** |

`Documents` ที่ต้องแก้คือตัวที่เราสร้างเอง GUID `0a41f646-cfff-44c4-b0fd-782cb61e19db`
ไม่ใช่คลังเอกสารที่ติดมากับไซต์ซึ่งชื่อซ้ำกัน

---

## ค. เปลี่ยนชนิดคอลัมน์ 2 ตัว

ทั้งสองตัวเก็บลิงก์ไฟล์ที่มีชื่อฝ่ายภาษาไทยอยู่ในเส้นทาง
ภาษาไทยถูกแปลงเป็นรหัสตัวละ 9 อักขระ ทำให้ยาวเกิน 255 ที่คอลัมน์บรรทัดเดียวรับได้

| List | คอลัมน์ | เปลี่ยนเป็น |
|---|---|---|
| Directory | PhotoUrl | Multiple lines of text (plain) |
| Announcements | ImageUrl | Multiple lines of text (plain) |

**ห้ามใช้ชนิด Image** กับคอลัมน์รูป เพราะ Microsoft Graph เขียนไม่ได้
ถ้าเผลอสร้างเป็น Image ให้ลบแล้วสร้างใหม่ด้วย**ชื่ออื่น** เพราะ SharePoint จองชื่อภายในเดิมไว้

---

## ง. เพิ่มข้อมูลใน `Settings`

กรอกทีละแถว ช่อง Title ต้องพิมพ์เป็นอังกฤษตรงตัว ตัวใหญ่ตัวเล็กต้องตรง

| Title | Value ตัวอย่าง | ใช้ทำอะไร |
|---|---|---|
| **Admins** | intranet.pr@primepower.co.th | **สำคัญที่สุด** — อีเมลผู้ดูแล คั่นด้วยจุลภาค เฉพาะคนในรายชื่อนี้เห็นเมนูจัดการข้อมูล |
| ExecutiveGroup | ผู้บริหาร | ชื่อกลุ่มที่ปักไว้บนสุดของหน้าบุคลากร |
| ProjectDepartments | ฝ่ายบริหารโครงการ | ฝ่ายที่ช่องโครงการจะแสดง |
| AllowedEmails | (เว้นว่างได้) | อีเมลนอกโดเมนบริษัทที่อนุญาตให้เข้าระบบ คั่นด้วยจุลภาค เช่นที่ปรึกษาที่ใช้ @hotmail.com |
| SupportDept | ฝ่ายประสานงานและอำนวยการ — งานเทคโนโลยีสารสนเทศ | แสดงในหน้าติดต่อ |
| SupportName | ชื่อผู้ดูแล | |
| SupportExt | 216 | |
| SupportEmail | it@primepower.co.th | |
| SupportHours | จันทร์–ศุกร์ 08:30–17:30 น. | |
| SupportNote | ข้อความหมายเหตุ | |
| PopupInterval | 5 | วินาทีต่อการเลื่อนประกาศหนึ่งใบ · 0 = ไม่เลื่อนอัตโนมัติ |

ใส่อีเมลตัวเองใน `Admins` ด้วย ไม่งั้นจะล็อกตัวเองออกจากหน้าจัดการข้อมูล

---

## จ. เพิ่มแถวใน `Departments`

เพิ่มแถวชื่อ **`ผู้บริหาร`** ไว้บนสุด (SortOrder = 1)

มีบุคลากร 14 คนที่ไม่ได้สังกัดฝ่ายใด คือกรรมการผู้จัดการ รองกรรมการฯ ผู้อำนวยการ และเลขานุการ
ถ้าไม่มีแถวนี้ คนกลุ่มนี้จะจับคู่ฝ่ายไม่ได้ตอนนำเข้าข้อมูล

---

## ฉ. GUID ครบแล้ว

`Projects` `ProjectHistory` `Feedback` ใส่ GUID ลงในโค้ดเรียบร้อย
ตอนนี้ทุก List อ้างด้วย GUID ทั้งหมด 18 ตัว เปลี่ยนชื่อ List ในอนาคตก็ไม่กระทบระบบ

---

## ลำดับที่แนะนำ

1. `Settings` ใส่ `Admins` ก่อน — ถ้าไม่มี ทุกคนที่ล็อกอินจะแก้ข้อมูลได้หมด
2. `Departments` เพิ่มแถว `ผู้บริหาร`
3. เปลี่ยนชนิด `PhotoUrl` และ `ImageUrl`
4. เพิ่มคอลัมน์ `Files` ใน 3 List
5. สร้าง `Projects` แล้วค่อยเพิ่มคอลัมน์ `Project` ใน `Directory`
6. สร้าง `ProjectHistory` และ `Feedback`
7. นำเข้าข้อมูลบุคลากรจากไฟล์ CSV

---

## วิธีตรวจว่าครบหรือยัง

ไม่ต้องไล่เทียบเอง เปิดเว็บแล้วลองบันทึกข้อมูลสักรายการในแต่ละชุด
ถ้าคอลัมน์ไหนขาด ระบบจะบันทึกส่วนที่เหลือให้ก่อน แล้วขึ้นข้อความบอกชื่อคอลัมน์ที่ยังไม่มี
