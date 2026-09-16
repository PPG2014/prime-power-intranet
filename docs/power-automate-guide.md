# คู่มือตั้งค่า Power Automate — เส้นทางอนุมัติ Prime Power Intranet

คู่มือนี้ทำให้ระบบส่งแจ้งเตือนและอนุมัติผ่าน Teams และอีเมลได้ โดยที่หน้าเว็บยังกดอนุมัติได้เหมือนเดิม ทั้งสองทางเขียนสถานะกลับ List `Requests` ที่เดียวกัน

**สิ่งที่จะได้เมื่อทำเสร็จ**
- มีคนยื่นคำขอ → ผู้อนุมัติลำดับแรกได้การ์ดใน Teams และอีเมลทันที
- กดอนุมัติ/ไม่อนุมัติจากในการ์ดได้เลย ไม่ต้องเปิดเว็บ
- อนุมัติแล้ววิ่งไปลำดับถัดไปอัตโนมัติ จนครบทุกลำดับ
- ปิดงานแล้วผู้ยื่นได้แจ้งเตือนใน Teams

**เวลาที่ใช้** ประมาณ 1-2 ชั่วโมงสำหรับ Flow แรก

---

## สิ่งที่ต้องมีก่อนเริ่ม

1. บัญชี Microsoft 365 ที่มีสิทธิ์สร้าง Flow (ตรวจที่ make.powerautomate.com ว่าเข้าได้)
2. List `Requests` และ `ApprovalMatrix` สร้างครบตามเอกสาร sharepoint-todo.md แล้ว
3. คอลัมน์ใน `Requests` ต้องมีครบ โดยเฉพาะ `CurrentStep`, `Status`, `ApprovalLog`, `FormCode`, `RequesterEmail`

**GUID ที่ต้องใช้**
- Requests: `09a369a9-0d42-44f5-bec8-644c78ec1d10`
- ApprovalMatrix: `fc1465b8-a4fc-4055-b20a-7e3712a592fe`
- ไซต์: `primepowertl.sharepoint.com/sites/Intranet_PrimePower`

---

## ตัวอย่างเส้นทางเบิกเงินทดรองจ่าย

```
ผู้ยื่นส่งฟอร์ม
  → 1. ผู้รับผิดชอบหลักโครงการ   อนุมัติ
  → 2. ผู้บริหารอนุมัติจ่าย       อนุมัติ
  → 3. ฝ่ายบัญชี                 อนุมัติ
  → 4. ฝ่ายการเงิน   แนบสลิป → เสร็จสิ้น → ส่ง Teams หาผู้ยื่น
```

ลำดับ 1 ใช้ ApproverType = ผู้รับผิดชอบหลักของโครงการ · ลำดับ 4 เป็นขั้นสุดท้าย
ระบบบังคับแนบสลิปก่อนปิดงาน แล้วส่งแจ้งผู้ยื่นใน Teams อัตโนมัติ

## ภาพรวมโครงสร้าง

ระบบทำงานร่วมกันสองส่วน

**หน้าเว็บ** เขียนคำขอลง Requests พร้อม Status = "รออนุมัติ" และ CurrentStep = 1

**Power Automate** เฝ้าดู Requests เมื่อมีคำขอใหม่หรือ CurrentStep เปลี่ยน ก็หาผู้อนุมัติของลำดับนั้นจาก ApprovalMatrix แล้วส่งการ์ดไปขออนุมัติ พอได้คำตอบก็เขียนกลับ Requests

เราจะสร้าง **Flow เดียว** ที่ทำงานทุกลำดับ ไม่ต้องแยก Flow ต่อฟอร์ม

---

## ขั้นที่ 1 — สร้าง Flow และตั้ง Trigger

1. เข้า make.powerautomate.com ล็อกอินด้วยบัญชีบริษัท
2. เมนูซ้าย **My flows** → **New flow** → **Automated cloud flow**
3. ตั้งชื่อ `Prime Power - เส้นทางอนุมัติคำขอ`
4. ช่องค้นหา trigger พิมพ์ `when an item is created or modified`
5. เลือก **SharePoint — When an item is created or modified** แล้วกด Create
6. ในการ์ด trigger
   - **Site Address:** เลือก Intranet_PrimePower
   - **List Name:** เลือก Requests

> ใช้ "created or modified" ไม่ใช่แค่ "created" เพราะต้องจับตอน CurrentStep เปลี่ยนไปลำดับถัดไปด้วย

---

## ขั้นที่ 2 — กรองเฉพาะคำขอที่ต้องอนุมัติ

Flow จะทำงานทุกครั้งที่แถวเปลี่ยน แต่เราสนใจเฉพาะที่ Status = "รออนุมัติ" เท่านั้น

1. **+ New step** → ค้นหา `condition` → เลือก **Condition**
2. ตั้งเงื่อนไข
   - ช่องซ้าย: กด **Add dynamic content** เลือก `Status Value`
   - กลาง: `is equal to`
   - ขวา: พิมพ์ `รออนุมัติ`
3. ทุกขั้นต่อจากนี้ทำใน **If yes**

---

## ขั้นที่ 3 — หาผู้อนุมัติของลำดับปัจจุบัน

ดึงแถวจาก ApprovalMatrix ที่ตรงกับฟอร์มและลำดับปัจจุบัน

1. ใน If yes → **Add an action** → **SharePoint — Get items**
2. ตั้งค่า
   - **Site Address:** Intranet_PrimePower
   - **List Name:** ApprovalMatrix
   - กด **Show advanced options** → **Filter Query** ใส่
     ```
     FormCode eq '@{triggerOutputs()?['body/FormCode']}' and StepOrder eq @{triggerOutputs()?['body/CurrentStep']}
     ```
   > บรรทัดนี้แปลว่า เอาแถวที่ FormCode ตรงกับคำขอ และ StepOrder ตรงกับ CurrentStep

3. เพิ่ม action **Compose** ชื่อ `ขั้นปัจจุบัน` ใส่ค่า
   ```
   @{first(outputs('Get_items')?['body/value'])}
   ```
   > เก็บแถวลำดับปัจจุบันไว้ใช้ต่อ

---

## ขั้นที่ 4 — หาอีเมลผู้อนุมัติ

ApprovalMatrix เก็บผู้อนุมัติสองแบบ ระบุชื่อ กับ ตามตำแหน่ง ต้องแปลงเป็นอีเมล

### กรณีระบุชื่อเจาะจง (ApproverType = ระบุชื่อเจาะจง)

ผู้อนุมัติอยู่ในคอลัมน์ Approvers เป็น Lookup ไปทะเบียนบุคลากร ต้องดึงอีเมลจาก Directory

1. **Get items** จาก List Directory
2. Filter Query: `Title eq '<ชื่อผู้อนุมัติ>'`
3. เอา field Email มาใช้

### กรณีผู้รับผิดชอบหลักของโครงการ (ApproverType = ผู้รับผิดชอบหลักของโครงการ)

ใช้กับฟอร์มเบิกเงินที่ต้องให้หัวหน้าโครงการอนุมัติก่อน ผู้อนุมัติขึ้นกับโครงการที่เลือกในฟอร์ม

1. **Parse JSON** จาก FormData เพื่อดึงชื่อโครงการ (field `project`)
2. **Get items** จาก List Projects, Filter: `Title eq '<ชื่อโครงการ>'`
3. เอา field **Owner** ที่ได้ ไปหาอีเมลใน Directory อีกที (Owner เก็บชื่อ ต้องแปลงเป็นอีเมล)

> นี่คือเหตุผลที่ต้องให้หัวหน้าโครงการอยู่ลำดับแรกของเส้นทาง คนทีมเดียวกันเบิกคนละโครงการจะไปหาหัวหน้าคนละคนอัตโนมัติ

### กรณีผู้บังคับบัญชา (ApproverType = ผู้บังคับบัญชาของผู้ยื่น)

ใช้ action สำเร็จรูป

1. **Add an action** → ค้นหา `get manager` → **Office 365 Users — Get manager (V2)**
2. **User (UPN):** ใส่ `RequesterEmail` จาก trigger
3. อีเมลผู้อนุมัติคือ Mail ที่ได้กลับมา

> แนะนำเริ่มจากแบบระบุชื่อเจาะจงก่อน ให้ Flow ทำงานได้ แล้วค่อยเพิ่มกรณีตามตำแหน่งทีหลังด้วย Switch แยกตาม ApproverType

---

## ขั้นที่ 5 — ส่งการ์ดขออนุมัติ

1. **Add an action** → ค้นหา `start and wait for an approval`
2. เลือก **Approvals — Start and wait for an approval**
3. ตั้งค่า
   - **Approval type:** `Approve/Reject – First to respond`
     (ถ้าลำดับนี้ต้องอนุมัติครบทุกคน เลือก `Everyone must approve`)
   - **Title:** `ขออนุมัติ @{triggerOutputs()?['body/FormName']} เลขที่ @{triggerOutputs()?['body/Title']}`
   - **Assigned to:** อีเมลผู้อนุมัติจากขั้นที่ 4 (หลายคนคั่นด้วย `;`)
   - **Details:** ใส่รายละเอียดคำขอ ดูวิธีดึง FormData ด้านล่าง
   - **Item link:** `https://ppg2014.github.io/prime-power-intranet/#/requests`

> action นี้ส่งการ์ดเข้า Teams อัตโนมัติ และค้างรอจนกว่าจะมีคนตอบ

### ทำให้ Details อ่านง่าย

FormData เก็บเป็น JSON ถ้าอยากแสดงสวย ให้เพิ่ม action **Parse JSON** ก่อน โดยใช้ Content = FormData และ Schema generate จากตัวอย่าง แล้วดึงทีละช่องมาใส่ Details

ขั้นแรกใส่ดิบ ๆ ไปก่อนก็ได้
```
ผู้ยื่น: @{triggerOutputs()?['body/RequesterName']}
ฝ่าย: @{triggerOutputs()?['body/RequesterDept']}
ข้อมูล: @{triggerOutputs()?['body/FormData']}
```

---

## ขั้นที่ 6 — ส่งอีเมลด้วย (นอกจาก Teams)

การ์ด Approvals เข้า Teams อยู่แล้ว ถ้าต้องการอีเมลเพิ่ม

1. หลัง action approval เพิ่ม **Office 365 Outlook — Send an email (V2)**
2. **To:** อีเมลผู้อนุมัติ
3. **Subject:** `ขออนุมัติ เลขที่ @{triggerOutputs()?['body/Title']}`
4. **Body:** ใส่รายละเอียด + ลิงก์ไปหน้าติดตามสถานะ
   ```
   https://ppg2014.github.io/prime-power-intranet/#/requests
   ```

> อีเมลนี้เป็นการแจ้งเฉย ๆ ให้กดอนุมัติในเว็บหรือ Teams · ถ้าต้องการปุ่มอนุมัติในอีเมลโดยตรง ใช้ Approval type แล้ว Power Automate จะแนบปุ่มในอีเมลให้เอง ไม่ต้องส่งอีเมลแยก

---

## ขั้นที่ 7 — เขียนผลกลับ SharePoint

หลัง approval ได้คำตอบ ให้ตรวจว่าอนุมัติหรือไม่ แล้วเขียนกลับ

1. เพิ่ม **Condition** ตรวจ `Outcome` (จาก approval) `is equal to` `Approve`

### ถ้า Approve (If yes)

ต้องดูว่ามีลำดับถัดไปไหม

1. **Get items** จาก ApprovalMatrix, Filter: `FormCode eq '...' and StepOrder gt @{...CurrentStep}`
2. **Condition:** length ของผลลัพธ์ มากกว่า 0 หรือไม่
   - **มีลำดับถัดไป:** SharePoint **Update item** ตั้ง CurrentStep = ลำดับถัดไปที่น้อยที่สุด, Status คงเป็น "รออนุมัติ"
     → Flow จะ trigger ตัวเองอีกรอบ วนหาผู้อนุมัติลำดับใหม่
   - **ไม่มีแล้ว:** Update item ตั้ง Status = "อนุมัติแล้ว"

### ถ้า Reject (If no)

**Update item** ตั้ง Status = "ไม่อนุมัติ"

### บันทึกประวัติทุกครั้ง

ทั้งสองกรณี ให้ต่อ ApprovalLog ด้วยผลล่าสุด อ่าน ApprovalLog เดิม แปลงเป็น array เพิ่มรายการใหม่ แล้ว Update กลับ (ใช้ Compose + expression `json()`)

---

## ขั้นที่ 8 — แจ้งผู้ยื่นเมื่อจบ

หลัง Status เป็น "อนุมัติแล้ว" หรือ "ไม่อนุมัติ"

1. **Microsoft Teams — Post message in a chat or channel**
2. **Post as:** Flow bot
3. **Recipient:** `RequesterEmail`
4. **Message:**
   ```
   คำขอเลขที่ @{triggerOutputs()?['body/Title']} @{outputs...Outcome เป็นภาษาไทย}
   ดูรายละเอียด: https://ppg2014.github.io/prime-power-intranet/#/requests
   ```

---

## ขั้นที่ 9 — ทดสอบ

1. กด **Save** มุมขวาบน
2. เปิดเว็บ ยื่นคำขอทดสอบหนึ่งใบ
3. กลับมาที่ Flow กด **Test** → **Manually** ดูว่าแต่ละขั้นเขียว
4. เช็กว่าผู้อนุมัติได้การ์ดใน Teams
5. กดอนุมัติในการ์ด แล้วดูว่า Requests เปลี่ยน CurrentStep หรือ Status ถูกต้อง

**ถ้าขั้นไหนแดง** กดเข้าไปดู error ส่วนใหญ่เป็นชื่อคอลัมน์ไม่ตรง หรือ Filter Query พิมพ์ผิด

---

## เรื่องที่ต้องระวัง

**เขียนกลับแล้ว Flow trigger ตัวเองซ้ำ** เป็นเรื่องปกติของ trigger "created or modified" เราคุมด้วยการเช็ก Status = "รออนุมัติ" ตอนต้น ถ้าไม่ใช่ก็ไม่ทำอะไร แต่ถ้ากังวลเรื่องวนไม่รู้จบ เพิ่ม **Trigger condition** ที่ตั้งค่า trigger ให้ทำงานเฉพาะเมื่อ Status = รออนุมัติ

**การ์ด Teams ไปหาคนที่ไม่มีสิทธิ์** ถ้าอีเมลผู้อนุมัติผิดหรือว่าง การ์ดจะไม่ถึง ตรวจ ApprovalMatrix ว่ากรอกผู้อนุมัติครบ

**ผู้อนุมัติคนเดียวกันในหลายลำดับ** Approvals ไม่ให้ใช้อีเมลซ้ำในลำดับติดกัน ถ้าออกแบบเส้นทางให้คนเดิมอนุมัติสองลำดับ ต้องรวมเป็นลำดับเดียว

**สิทธิ์ Premium** action Approvals กับ Get manager อยู่ในชุดมาตรฐาน ใช้ได้กับ license ทั่วไป ไม่ต้อง Premium สำหรับงานพื้นฐานนี้

---

## ลำดับที่แนะนำให้ทำ

1. ทำ Flow ให้ครบขั้นที่ 1-3 ก่อน แล้ว Test ดูว่าหาแถว ApprovalMatrix เจอ
2. เพิ่มขั้นที่ 4-5 แบบระบุชื่อเจาะจงอย่างเดียว ให้การ์ดส่งได้
3. เพิ่มขั้นที่ 7 เขียนกลับ ให้วงจรครบหนึ่งลำดับ
4. ทดสอบฟอร์มที่มีลำดับเดียวก่อน (เช่น Memo ลืมลงเวลา)
5. เพิ่มการวนหลายลำดับ แล้วทดสอบเบิกเงิน 3 ลำดับ
6. เพิ่มกรณีผู้บังคับบัญชา (ขั้น 4 แบบ Get manager)
7. เพิ่มแจ้งผู้ยื่นตอนจบ (ขั้น 8)

ทำทีละส่วนแล้วทดสอบ จะหา error ง่ายกว่าทำทั้งหมดแล้วค่อยรัน

---

## ถ้าติดขัด

ส่งภาพหน้าจอ Flow ที่ขั้นที่แดง พร้อมข้อความ error มาได้ ผมช่วยดูว่าตรงไหนพลาด แม้จะตั้งค่าเองไม่ได้ แต่ชี้จุดผิดจาก error ได้
