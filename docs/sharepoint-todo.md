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

### `FormCatalog` — เพิ่มคอลัมน์เลขที่ ISO

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| ISODocNo | Single line of text | เลขที่เอกสารตาม ISO 9001 |
| ISORevision | Single line of text | ฉบับแก้ไข เช่น Rev.01 |
| UseStandardHeader | Yes/No | เว้นว่าง=ใช้หัวข้อมาตรฐาน |

### `FormFields` — นิยามช่องของแต่ละแบบฟอร์ม

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| Title | Single line of text | ชื่อช่องที่ผู้ใช้เห็น |
| FormCode | Single line of text | เช่น FM-HR-001 |
| FieldKey | Single line of text | ชื่อช่องในระบบ อังกฤษตัวเล็ก |
| FieldType | **Single line of text** | ค่ามาจาก dropdown ในเว็บ · อย่าใช้ Choice จะพังถ้าตัวเลือกไม่ครบ |
| Options | Multiple lines of text (plain) | บรรทัดละหนึ่งตัวเลือก |
| IsRequired | Yes/No | |
| DefaultValue | Single line of text | `{today}` `{me.Title}` `{me.Position}` `{me.Department}` `{me.EmployeeCode}` |
| HelpText | Single line of text | |
| Section | Single line of text | หัวข้อที่จัดกลุ่มช่อง |
| ColumnWidth | **Single line of text** | `half` / `full` · อย่าใช้ Choice |
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
| ApproverType | Choice | `ระบุชื่อเจาะจง` / `ผู้บังคับบัญชาของผู้ยื่น` / `ผู้จัดการฝ่ายของผู้ยื่น` / `หัวหน้าฝ่ายตามสังกัด` |
| Approvers | Lookup → Directory.Title (**Allow multiple values**) | ใช้เมื่อเลือกระบุชื่อเจาะจง 2-3 คน |
| ApproveMode | Choice | `คนใดคนหนึ่งอนุมัติก็ผ่าน` / `ต้องอนุมัติครบทุกคน` |
| SortOrder | Number | |
| IsActive | Yes/No | |

### FormCatalog — เพิ่มคอลัมน์

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| FormNote | Multiple lines of text (plain) | หมายเหตุสำคัญ แสดงเป็นกล่องเตือนในหน้ากรอก เช่นเงื่อนไขเวลาตัดรอบ |

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
| Status | Choice | `ร่าง` `รออนุมัติ` `อนุมัติแล้ว` `ไม่อนุมัติ` `เสร็จสิ้น` `ยกเลิก` |
| CurrentStep | Number | ลำดับที่กำลังรออนุมัติ |
| ApprovalLog | Multiple lines of text (plain) | ประวัติการอนุมัติ เก็บเป็น JSON |
| PaymentSlip | Multiple lines of text (plain) | สลิปโอนเงินขั้นสุดท้าย |
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

**คอลัมน์ `Level` (Choice) — ตัวเลือกชุดใหม่ 8 ระดับ** ต้องเพิ่มใน SharePoint ไม่งั้นบันทึกระดับใหม่ไม่ได้
(ถ้าคอลัมน์เป็น Single line of text ไม่ต้องทำอะไร)
Column settings → Edit → Choices ใส่ตามลำดับนี้ (ค่าเก่าเก็บไว้ก่อนได้จนแก้ทุกคนครบ):

```
ผู้บริหาร
รองผู้บริหาร
เลขานุการ
ผู้อำนวยการ
ผู้จัดการฝ่าย
รองผู้จัดการฝ่าย
ผู้จัดการแผนก
บุคลากรในแผนก
```

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
| **HR** | hr@primepower.co.th | อีเมลฝ่ายบุคคล คั่นด้วยจุลภาค — ทำงานระบบประเมินได้ทั้งหมด และเห็นเฉพาะชุดข้อมูลระบบประเมินในหน้าจัดการข้อมูล (ต้องให้สิทธิ์ Edit ใน 3 List ของระบบประเมินด้วย) |
| ExecutiveGroup | ผู้บริหาร | ชื่อกลุ่มที่ปักไว้บนสุดของหน้าบุคลากร |
| ProjectDepartments | ฝ่ายบริหารโครงการ, ฝ่ายความปลอดภัย อาชีวอนามัยและสิ่งแวดล้อม | ฝ่ายที่ช่องโครงการจะแสดง (คั่นด้วยจุลภาค ชื่อต้องตรงกับหน้าหน่วยงาน) |
| OrgChartUrl | (ลิงก์ไฟล์ PDF/รูป ใน SharePoint) | เว้นว่างได้ · ใส่แล้วแท็บแผนผังองค์กรในหน้าบุคลากรจะมีปุ่ม "📄 ผังองค์กรฉบับประกาศ" เปิดไฟล์ที่ลงนามแล้ว |
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

---

## คอลัมน์เพิ่มใน `Departments` — อีเมลของหน่วยงาน

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| Emails | Multiple lines of text (**Plain text**) | ใส่ได้หลายอีเมล บรรทัดละ 1 อีเมล · แก้ได้ที่ จัดการข้อมูล → หน่วยงานและเบอร์ต่อ · แสดงในสมุดโทรศัพท์หน้าติดต่อ |


---

## List ใหม่ `AuditLog` — บันทึกการใช้งาน

ระบบเขียนให้เองทุกครั้งที่มีการเพิ่ม แก้ไข หรือลบข้อมูล ดูได้ที่ จัดการข้อมูล → 🔍 บันทึกการใช้งาน (เฉพาะผู้ดูแลระบบ)
ถ้ายังไม่สร้าง List นี้ ระบบยังทำงานได้ปกติ แค่ไม่มีบันทึก (มีคำเตือนใน Console)

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| Title | Single line of text | สรุป เช่น `ลบ · departments · ฝ่ายเขียนแบบ` |
| Action | Single line of text | เพิ่ม / แก้ไข / ลบ |
| ListName | Single line of text | ชุดข้อมูลที่ถูกแก้ |
| ItemId | Single line of text | |
| ItemTitle | Single line of text | ชื่อรายการ |
| ByName | Single line of text | ผู้ทำ |
| ByEmail | Single line of text | |
| At | Date and Time (**รวมเวลา**) | |
| Details | Multiple lines of text (**Plain text**) | ค่าที่บันทึก (ย่อค่าที่ยาวเกิน) |

**สิทธิ์ที่แนะนำ** (Stop inheriting permissions ที่ List นี้) — ให้เขียนได้แต่แก้หรือลบบันทึกไม่ได้
1. Site settings → Site permissions → Permission Levels → **Add a Permission Level** ชื่อ `Add only`
   ติ๊กเฉพาะ **Add Items**, **View Items**, **Open** (ไม่ติ๊ก Edit Items / Delete Items)
   (วิธีง่ายสุด: เปิดระดับ **Read** → Copy Permission Level → ติ๊ก **Add Items** เพิ่ม · ต้องคง **Use Remote Interfaces** ไว้ ไม่งั้นเว็บเขียนไม่ได้)
2. ที่ List AuditLog → Permissions for this list → **Stop Inheriting Permissions**
   → ลบกลุ่ม Members / Visitors ที่ติดมา → Grant ให้พนักงานทุกคน = `Add only` · ผู้ดูแลระบบอยู่ในกลุ่ม Owners (Full Control)
3. (แนะนำ) List settings → Advanced settings → Item-level Permissions → Read access = **Read items that were created by the user**
   พนักงานจะเห็นแค่บันทึกของตัวเอง ส่วน Owners / Full Control ยังเห็นทั้งหมด (สิทธิ์ Read อย่างเดียวจะเห็นแค่ของตัวเอง)

---

## `ApprovalMatrix` — ตัวเลือกใหม่ในคอลัมน์ ApproverType

ตั้งเส้นทางอนุมัติได้ที่ จัดการข้อมูล → แบบฟอร์ม → ✎ แก้ไข (ส่วน "เส้นทางอนุมัติ") ระบบเขียนลง List นี้ให้เอง
ถ้าคอลัมน์ **ApproverType** เป็นชนิด Choice ต้องเพิ่มตัวเลือก 3 ค่านี้ (หรือเปลี่ยนเป็น Single line of text)
ไม่งั้น SharePoint จะไม่รับค่า และระบบจะเตือนหลังกดบันทึก

- `กรรมการผู้จัดการ`
- `รองกรรมการผู้จัดการด้านปฏิบัติการ`
- `รองกรรมการผู้จัดการด้านการเงิน`

ระบบหาตัวคนจากช่อง **ตำแหน่ง (Position)** ในทะเบียนบุคลากร ต้องสะกดตรงกับ 3 ค่านี้ทุกตัวอักษร

