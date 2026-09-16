# คู่มือ Power Automate — เส้นทางอนุมัติครบวงจร (Prime Power Intranet)

โฟลว์นี้ทำให้ผู้อนุมัติ **อนุมัติ / ส่งกลับแก้ไข / ไม่อนุมัติ พร้อมเหตุผล** ได้จากทั้ง
**อีเมล, การ์ด Teams และหน้าเว็บ** โดยโฟลว์เขียนสถานะกลับ SharePoint เอง แล้ววิ่งไป
ลำดับถัดไปอัตโนมัติจนจบ ทั้งสามช่องทางเขียนลง List `Requests` ที่เดียวกัน ประวัติจึงตรงกันเสมอ

> โฟลว์มี **ตัวเดียว** ใช้ร่วมทุกฟอร์ม อ่านเส้นทางจาก `ApprovalMatrix` ห้ามสร้างแยกรายฟอร์ม
> ทุก action ใช้ตัวเชื่อม **มาตรฐาน** เท่านั้น (SharePoint, Approvals, Teams, Office 365 Outlook)
> อย่าใช้ HTTP หรือ Dataverse เพราะจะกลายเป็น Premium ทันที

---

## 0) ภาพรวมทั้งโฟลว์ (อ่านรอบเดียวให้เห็นทั้งเส้น)

```
Trigger: เมื่อ Requests ถูกสร้าง/แก้ไข
  └─ (Trigger Condition) ทำงานเฉพาะเมื่อ Status = "รออนุมัติ" เท่านั้น
       │
       1. Initialize ตัวแปร  varNames=[]  varEmails=[]  varLog=(ประวัติเดิม)
       2. Get items ApprovalMatrix  (FormCode + StepOrder = CurrentStep)  → ขั้นปัจจุบัน
       3. Switch ตาม ApproverType → เติมชื่อผู้อนุมัติลง varNames
       4. Apply to each varNames → หา Email จาก Directory → varEmails
       5. Start and wait for an approval (Custom: อนุมัติ/ส่งกลับแก้ไข/ไม่อนุมัติ + ช่องเหตุผล)
       6. ต่อประวัติลง varLog (รูปแบบที่เว็บอ่านได้)
       7. Switch ตามผลตอบกลับ:
            อนุมัติ      → มีลำดับถัดไป? → CurrentStep=ถัดไป (Status คงรออนุมัติ, โฟลว์วนเอง)
                                        ไม่มี → Status="อนุมัติแล้ว"
            ส่งกลับแก้ไข → Status="ส่งกลับแก้ไข" (คง CurrentStep) แจ้งผู้ยื่นให้แก้
            ไม่อนุมัติ   → Status="ไม่อนุมัติ"
       8. แจ้งผู้ยื่นผลลัพธ์ทาง Teams + อีเมล
```

**การแบ่งงานเว็บ ↔ โฟลว์**
- เว็บ: กรอกฟอร์ม, ยื่น (ตั้ง Status=รออนุมัติ, CurrentStep=1), กดอนุมัติได้เอง, แนบสลิป/ปิดงานฟอร์มเบิกเงิน, **ยกเลิกคำขอ** (Status=ยกเลิก)
- โฟลว์: ส่งการ์ด/อีเมลขออนุมัติ, รับผล, เขียนสถานะกลับ, เดินลำดับ, แจ้งเตือน
- ทั้งคู่ใช้คอลัมน์เดียวกัน จึงสลับกันทำได้ เช่น ผู้อนุมัติกดในเว็บ โฟลว์ก็ไม่ต้องทำอะไรเพราะ Status เปลี่ยนไปแล้ว

---

## 1) เตรียมก่อนเริ่ม

**GUID / ไซต์**
- ไซต์: `primepowertl.sharepoint.com/sites/Intranet_PrimePower`
- Requests: `09a369a9-0d42-44f5-bec8-644c78ec1d10`
- ApprovalMatrix: `fc1465b8-a4fc-4055-b20a-7e3712a592fe`

**คอลัมน์ที่ต้องมี (ชนิดสำคัญมาก)**
- ใน `Requests`: `FormCode`(text), `Status`(text), `CurrentStep`(Number), `ApprovalLog`(**Multiple lines of text**), `RequesterName`(text), `RequesterEmail`(text), `RequesterDept`(text), `FormData`(**Multiple lines of text**)
- ใน `ApprovalMatrix`: `FormCode`(text), `StepOrder`(Number), `StepName`(text), `ApproverType`(text), `ApproveMode`(text), `Approvers`
- ใน `Directory`: `Title`, `Email`, `Department`, `Position`, `Manager`, `BackupManager` (Manager/BackupManager เป็น text)
- ใน `Projects`: `Title`, `ProjectCode`, `Owner`
- `ReportingLine`: ไม่จำเป็นแล้ว — ย้ายมาเก็บ Manager ที่ Directory (โฟลว์ยังอ่านลิสต์เก่าเป็น fallback ได้ถ้ามี)

**ค่าที่ระบบใช้ (สะกดต้องตรงเป๊ะ)**
- `Status`: `รออนุมัติ` · `อนุมัติแล้ว` · `ไม่อนุมัติ` · `ส่งกลับแก้ไข` · `เสร็จสิ้น` · `ยกเลิก`
- `ApproverType`: `ระบุชื่อเจาะจง` · `ผู้บังคับบัญชาของผู้ยื่น` · `ผู้จัดการฝ่ายของผู้ยื่น` · `หัวหน้าฝ่ายตามสังกัด` · `ผู้รับผิดชอบหลักของโครงการ`
- `ApproveMode`: `คนใดคนหนึ่งอนุมัติก็ผ่าน` · `ต้องอนุมัติครบทุกคน`

> ⚠️ ถ้าคอลัมน์เป็น Choice/Lookup/Person แทน text จะเจอ error 500 หรือเขียนไม่ลง — บทเรียนเดิมที่เจอกับ FormCode/ApproverType

---

## 2) สร้างโฟลว์ + Trigger + Trigger Condition (จุดนี้แก้บั๊ก Condition=False เดิม)

1. make.powerautomate.com → **My flows → New flow → Automated cloud flow**
2. ชื่อ `Prime Power - เส้นทางอนุมัติคำขอ`
3. Trigger: **SharePoint — When an item is created or modified**
   - Site Address: Intranet_PrimePower · List Name: Requests
4. **สำคัญ:** ที่การ์ด Trigger กด **… → Settings → Trigger Conditions → Add** ใส่:
   ```
   @equals(triggerOutputs()?['body/Status'], 'รออนุมัติ')
   ```

> ทำไมใช้ Trigger Condition แทน Condition action: โฟลว์จะ **ไม่ทำงานเลย** กับคำขอที่ Status ไม่ใช่ "รออนุมัติ"
> — รวมถึงคำขอเก่าที่ Status เขียนไม่ลง (ค่าว่าง) ที่เคยทำให้ติด False ตอนก่อน — และกันโฟลว์วนไม่รู้จบ
> เวลาเราเขียน Status เป็น "อนุมัติแล้ว/ไม่อนุมัติ/ส่งกลับแก้ไข" มันจะไม่ retrigger
> ส่วนตอนตั้ง CurrentStep=ถัดไปโดยคง Status="รออนุมัติ" มันจะ retrigger เพื่อทำลำดับต่อไป (ตามที่ต้องการ)

---

## 3) Initialize ตัวแปร (ต้องอยู่บนสุด ก่อนทุก action อื่น)

เพิ่ม 3 action **Initialize variable** เรียงกัน:

| ชื่อ | Type | Value |
|---|---|---|
| `varNames` | Array | (เว้นว่าง) |
| `varEmails` | Array | (เว้นว่าง) |
| `varLog` | Array | ใส่ expression ด้านล่าง |

varLog Value (อ่านประวัติเดิมมาต่อ):
```
@{if(empty(triggerOutputs()?['body/ApprovalLog']), json('[]'), json(triggerOutputs()?['body/ApprovalLog']))}
```

---

## 4) ดึงขั้นปัจจุบันจาก ApprovalMatrix

1. **SharePoint — Get items** ตั้งชื่อ `ขั้นปัจจุบัน`
   - List: ApprovalMatrix
   - **Filter Query:**
     ```
     FormCode eq '@{triggerOutputs()?['body/FormCode']}' and StepOrder eq @{triggerOutputs()?['body/CurrentStep']}
     ```
   - Top Count: 1
2. **Compose** ชื่อ `stepNow`:
   ```
   @{first(outputs('ขั้นปัจจุบัน')?['body/value'])}
   ```

จากนี้อ้างค่าในขั้นได้เช่น `outputs('stepNow')?['ApproverType']`, `outputs('stepNow')?['StepOrder']`, `outputs('stepNow')?['ApproveMode']`

---

## 5) หา "ชื่อผู้อนุมัติ" ตาม ApproverType → เก็บลง varNames

เพิ่ม **Switch** บน `@{outputs('stepNow')?['ApproverType']}`
ทุกกรณี ถ้าหาตามตำแหน่งไม่เจอ ให้ **fallback ไปใช้รายชื่อในช่อง Approvers** (เหมือนเว็บ) จึงควรกรอก Approvers เป็นตัวสำรองเสมอ

**Case `ระบุชื่อเจาะจง`**
- Approvers เป็น multi-lookup → ใช้ **Select**: From = `outputs('stepNow')?['Approvers']`, Map (โหมด text) = `@{item()?['Value']}`
- **Set variable** varNames = `@{body('Select')}`

**Case `ผู้บังคับบัญชาของผู้ยื่น`**
- ข้อมูลหัวหน้าอยู่ในทะเบียนบุคลากรแล้ว (คอลัมน์ `Manager` แก้ที่หน้าแก้ไขบุคลากรของเว็บ)
- **Get items** Directory, Filter: `Title eq '@{triggerOutputs()?['body/RequesterName']}'`, Top 1
- **Set variable** varNames =
  ```
  @{if(empty(first(outputs('Get_items_Dir_me')?['body/value'])?['Manager']),
        json('[]'),
        createArray(first(outputs('Get_items_Dir_me')?['body/value'])?['Manager']))}
  ```
  (ถ้า Manager ว่างจะปล่อยว่างไปเข้า fallback ท้ายสุด)

**Case `ผู้รับผิดชอบหลักของโครงการ`**
- **Parse JSON** Content = `triggerOutputs()?['body/FormData']` (Schema กด Generate จากตัวอย่าง JSON ของฟอร์มนั้น) → ได้ field `project`
- **Get items** Projects, Filter: `Title eq '@{body('Parse_JSON')?['project']}'`, Top 1
- **Set variable** varNames = `@{createArray(first(outputs('Get_items_Projects')?['body/value'])?['Owner'])}`
  > ถ้า Owner เป็น Lookup ให้ใช้ `...?['Owner']?['Value']`

**Case `ผู้จัดการฝ่ายของผู้ยื่น` และ `หัวหน้าฝ่ายตามสังกัด`** (ทำเหมือนกัน)
- **Get items** Directory, Filter: `Department eq '@{triggerOutputs()?['body/RequesterDept']}'`
- **Filter array**: From = `outputs('Get_items_Dir')?['body/value']`, สลับเป็น **Edit in advanced mode** ใส่:
  ```
  @or(contains(item()?['Position'],'ผู้จัดการฝ่าย'), contains(item()?['Position'],'หัวหน้าฝ่าย'), contains(item()?['Position'],'ผู้อำนวยการ'))
  ```
- **Select** (ชื่อ `Select_heads`): From = `body('Filter_array')`, Map = `@{item()?['Title']}`
- **Set variable** varNames = `@{body('Select_heads')}`

**Default (fallback):** varNames = ค่าจาก Approvers เหมือน case แรก

> **fallback กันผู้อนุมัติว่าง:** หลัง Switch เพิ่ม **Condition** `length(variables('varNames')) is equal to 0`
> ถ้าใช่ → Set varNames จาก Approvers (Select แบบ case แรก)

---

## 6) แปลงชื่อ → อีเมล (Directory)

1. **Apply to each** on `@{variables('varNames')}`
2. ข้างใน: **Get items** Directory (ชื่อ `Get_email`), Filter: `Title eq '@{item()}'`, Top 1
3. **Append to array variable** varEmails = `@{first(outputs('Get_email')?['body/value'])?['Email']}`

อีเมลรวมสำหรับส่งการ์ด = `@{join(variables('varEmails'), ';')}`

---

## 7) ส่งการ์ดขออนุมัติ (ได้ทั้ง Teams และอีเมล ในตัวเดียว)

1. **Approvals — Start and wait for an approval**
2. **Approval type:** `Custom Responses – Wait for one response`
   - ถ้า ApproveMode = "ต้องอนุมัติครบทุกคน" ใช้ `Custom Responses – Wait for all responses` (เลือกอัตโนมัติดูข้อ 12)
3. **Response options — Item:** ใส่ 3 บรรทัด
   ```
   อนุมัติ
   ส่งกลับแก้ไข
   ไม่อนุมัติ
   ```
4. **Title:** `ขออนุมัติ @{triggerOutputs()?['body/FormName']} เลขที่ @{triggerOutputs()?['body/Title']}`
5. **Assigned to:** `@{join(variables('varEmails'), ';')}`
6. **Details:** สรุปคำขอ (Markdown ได้) เช่น
   ```
   **ผู้ยื่น:** @{triggerOutputs()?['body/RequesterName']} (@{triggerOutputs()?['body/RequesterDept']})
   **เรื่อง:** @{triggerOutputs()?['body/Title']}
   **ลำดับ:** @{outputs('stepNow')?['StepName']}

   กรุณาระบุเหตุผลในช่องความคิดเห็นเมื่อ "ส่งกลับแก้ไข" หรือ "ไม่อนุมัติ"
   ```
7. **Item link:** `https://ppg2014.github.io/prime-power-intranet/#/requests`

> การ์ดนี้เข้า **Teams** อัตโนมัติ และใน**อีเมล** ก็มีปุ่ม อนุมัติ/ส่งกลับแก้ไข/ไม่อนุมัติ พร้อมช่องพิมพ์เหตุผลในตัว ไม่ต้องส่งอีเมลแยก

**อ่านผลตอบกลับ** (ใช้ต่อ)
- ผลที่เลือก: `@{first(body('Start_and_wait_for_an_approval')?['responses'])?['responseValue']}`
- เหตุผล: `@{first(body('Start_and_wait_for_an_approval')?['responses'])?['comments']}`
- ผู้ตอบ: `@{first(body('Start_and_wait_for_an_approval')?['responses'])?['responder']?['displayName']}`

---

## 8) ต่อประวัติลง ApprovalLog (รูปแบบที่เว็บอ่านได้)

**Append to array variable** varLog — Value (สลับเป็น expression/JSON):
```
{
  "step": @{outputs('stepNow')?['StepOrder']},
  "action": "@{first(body('Start_and_wait_for_an_approval')?['responses'])?['responseValue']}",
  "by": "@{first(body('Start_and_wait_for_an_approval')?['responses'])?['responder']?['displayName']}",
  "note": "@{first(body('Start_and_wait_for_an_approval')?['responses'])?['comments']}",
  "at": "@{utcNow()}"
}
```

> เว็บอ่าน 5 คีย์นี้พอดี: `step, action, by, note, at` — ไทม์ไลน์ในหน้าติดตามสถานะจะขึ้นเหมือนกดในเว็บ
> ถ้า PA ฟ้อง type ที่ `step` ให้ครอบเป็น `"@{...StepOrder}"` ก็ได้ ไม่กระทบการทำงาน

---

## 9) เขียนสถานะกลับ + เดินลำดับ (Switch ตามผลตอบกลับ)

เพิ่ม **Switch** บน `@{first(body('Start_and_wait_for_an_approval')?['responses'])?['responseValue']}`

**Case `อนุมัติ`**
1. **Get items** ApprovalMatrix ชื่อ `หาลำดับถัดไป`
   - Filter: `FormCode eq '@{triggerOutputs()?['body/FormCode']}' and StepOrder gt @{outputs('stepNow')?['StepOrder']}`
   - Order By: `StepOrder asc` · Top 1
2. **Condition:** `length(outputs('หาลำดับถัดไป')?['body/value'])` **is greater than** `0`
   - **ถ้ามี (True):** **Update item** (Requests, Id = `triggerOutputs()?['body/ID']`)
     - CurrentStep = `@{first(outputs('หาลำดับถัดไป')?['body/value'])?['StepOrder']}`
     - Status = `รออนุมัติ`
     - ApprovalLog = `@{string(variables('varLog'))}`
     → โฟลว์ retrigger เอง ไปทำลำดับใหม่
   - **ถ้าไม่มี (False):** **Update item**
     - Status = `อนุมัติแล้ว` · ApprovalLog = `@{string(variables('varLog'))}`
     → ไปข้อ 10 (ฟอร์มเบิกเงินดูข้อ 11)

**Case `ส่งกลับแก้ไข`**
- **Update item**: Status = `ส่งกลับแก้ไข` · ApprovalLog = `@{string(variables('varLog'))}` · **ไม่แตะ CurrentStep**
- ไปข้อ 10 (เว็บจะให้ผู้ยื่นกด "แก้ไขและยื่นใหม่" ได้ทันที เห็นเหตุผลที่ส่งกลับด้วย)
  > ผู้ยื่นแก้แล้วยื่นใหม่ เว็บตั้ง Status=รออนุมัติ, CurrentStep=1 → เริ่มอนุมัติใหม่ตั้งแต่ต้น

**Case `ไม่อนุมัติ`**
- **Update item**: Status = `ไม่อนุมัติ` · ApprovalLog = `@{string(variables('varLog'))}`
- ไปข้อ 10

---

## 10) แจ้งผู้ยื่นผลลัพธ์ (Teams + อีเมล)

1. **Teams — Post message in a chat or channel** · Post as: Flow bot · Recipient: `@{triggerOutputs()?['body/RequesterEmail']}`
   ```
   คำขอเลขที่ @{triggerOutputs()?['body/Title']} — ผลล่าสุด: @{first(body('Start_and_wait_for_an_approval')?['responses'])?['responseValue']}
   โดย: @{first(body('Start_and_wait_for_an_approval')?['responses'])?['responder']?['displayName']}
   เหตุผล: @{first(body('Start_and_wait_for_an_approval')?['responses'])?['comments']}
   ดูรายละเอียด: https://ppg2014.github.io/prime-power-intranet/#/requests
   ```
2. **Office 365 Outlook — Send an email (V2)** (เนื้อหาเดียวกัน) To = RequesterEmail

---

## 11) กรณีพิเศษ — ฟอร์มเบิกเงิน ขั้นสุดท้าย (การเงิน)

ขั้นสุดท้ายเบิกเงินคือการเงิน **แนบสลิป → ปิดงาน** ซึ่งต้องอัปโหลดไฟล์ ทำในการ์ด Teams ไม่ได้ จึงทำ **บนเว็บ**:
- โฟลว์เดินจนขั้นก่อนสุดท้ายอนุมัติเสร็จ ขั้นการเงินตั้ง Status = `อนุมัติแล้ว`
- แจ้งการเงินเข้าเว็บ แนบสลิปแล้วกด **ปิดงาน** (เว็บตั้ง Status = `เสร็จสิ้น` และบันทึก action `ปิดงาน`)
- ถ้าไม่บังคับสลิป จะให้ขั้นสุดท้ายจบที่ `อนุมัติแล้ว` เลยก็ได้

> ยกเลิกคำขอ = ผู้ยื่นกดบนเว็บ (Status=`ยกเลิก`) โฟลว์มองข้ามอัตโนมัติเพราะ Trigger Condition จับเฉพาะ "รออนุมัติ"

---

## 12) (ทางเลือก) รองรับ "ต้องอนุมัติครบทุกคน" อัตโนมัติ

Approval type เลือกตอนออกแบบ เปลี่ยนตามข้อมูลตรง ๆ ไม่ได้ ถ้าต้องรองรับทั้งสองแบบ:
- ครอบข้อ 7 ด้วย **Condition** `@{outputs('stepNow')?['ApproveMode']}` = `ต้องอนุมัติครบทุกคน`
  - True: approval แบบ **Wait for all responses** · False: **Wait for one response**
- ข้อ 8–10 อ่านผลจาก action สาขาที่ตรงกัน (ตั้งชื่อ action ต่างกัน)

---

## 13) (ทางเลือก) โฟลว์ตัวที่สอง — เตือนคำขอค้าง

**Recurrence** วันละครั้ง → **Get items** Requests Filter `Status eq 'รออนุมัติ'` และ DueDate เลยกำหนด →
Apply to each → หาอีเมลผู้อนุมัติลำดับปัจจุบัน (ตรรกะเดียวกับข้อ 5–6) → ส่งเตือน Teams/อีเมล

---

## 14) ทดสอบตามลำดับ (ทำทีละส่วน หา error ง่ายกว่า)

1. ข้อ 2–4 ก่อน แล้ว **Test → Manually** ยื่นใบทดสอบ ดูว่า `stepNow` ได้แถวถูกต้อง
2. เพิ่มข้อ 5–7 เฉพาะ case `ระบุชื่อเจาะจง` → ดูว่าการ์ดเข้า Teams/อีเมล
3. เพิ่มข้อ 8–9 ให้ครบหนึ่งลำดับ ทดสอบฟอร์มลำดับเดียวก่อน (เช่น FM-HRM-008 ลืมลงเวลา)
4. ทดสอบครบสามผล: อนุมัติ / ส่งกลับแก้ไข (ใส่เหตุผล แล้วดูว่าเว็บขึ้นปุ่ม "แก้ไขและยื่นใหม่" พร้อมเหตุผล) / ไม่อนุมัติ
5. เพิ่มการวนหลายลำดับ ทดสอบเบิกเงิน (FM-ACC-002) 3–4 ลำดับ
6. เพิ่ม case ตามตำแหน่ง (ผู้บังคับบัญชา/หัวหน้าฝ่าย/ผู้รับผิดชอบโครงการ) ทีละอัน
7. เพิ่มแจ้งผู้ยื่น (ข้อ 10) และโฟลว์เตือน (ข้อ 13)

---

## 15) ข้อควรระวัง / ที่เจอบ่อย

- **การ์ดไม่ถึงผู้อนุมัติ:** varEmails ว่าง — ชื่อใน Approvers/ReportingLine ต้องตรงกับ Title ใน Directory เป๊ะ และดู fallback ข้อ 5
- **โฟลว์วนไม่จบ:** ต้องมี Trigger Condition ข้อ 2 · ตอนยังมีลำดับถัดไปให้คง Status="รออนุมัติ" อย่างเดียว
- **ApprovalLog เพี้ยน:** ต้องเป็น Multiple lines of text และเขียนกลับด้วย `string(variables('varLog'))` เสมอ ห้ามทับด้วยค่าว่าง
- **ผู้อนุมัติคนเดียวติดกันสองลำดับ:** Approvals ไม่ให้อีเมลซ้ำในลำดับติดกัน — รวมเป็นลำดับเดียวใน ApprovalMatrix
- **ชื่อ action ในสูตรไม่ตรง:** ถ้าตั้งชื่อ action ต่างจากคู่มือ ต้องแก้ชื่อในทุก expression ให้ตรง
- **Filter Query:** ค่า Number (StepOrder/CurrentStep) ไม่ต้องมีคำพูด · ค่า text (FormCode/Title/Department) ต้องมี `'...'`

---

## ภาคผนวก — ออกเลขเอกสารกันซ้ำ 100% ด้วยโฟลว์ (ทางเลือก)

หน้าเว็บออกเลข (FM-ACC-002-001-2026) พร้อมกันเลขซ้ำอยู่แล้ว ถ้าต้องการกัน 100% แม้ยื่นพร้อมกันเป๊ะ
ให้สร้าง List `DocCounter` (Title=คีย์รวม เช่น `FM-ACC-002-2026`, LastNo=Number) แล้วให้โฟลว์
Get→ถ้าไม่มี Create(LastNo=1)→ถ้ามี Update(+1) ประกอบเลขเติมศูนย์ 3 หลัก ตั้ง Title ให้คำขอ
(ต้องปรับเว็บให้ส่งคำขอโดยยังไม่ใส่ Title) — สำหรับงานทั่วไป วิธีที่เว็บทำอยู่เพียงพอแล้ว
