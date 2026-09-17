# คู่มือ Power Automate ฉบับคนไม่เคยใช้ — เริ่มใหม่ตั้งแต่ศูนย์
### ระบบอนุมัติคำขอ Prime Power (อนุมัติ / ส่งกลับแก้ไข / ไม่อนุมัติ ผ่านอีเมล–Teams–เว็บ)

> อ่านช้า ๆ ทำตามทีละข้อ ห้ามข้าม เมื่อทำเสร็จแต่ละส่วนให้ **บันทึก** แล้วค่อยไปส่วนถัดไป
> ถ้าติดตรงไหน แคปหน้าจอส่งมาถามได้ตลอด · สิ่งไหนต้อง **ล็อกอิน / กดอนุญาต / กดยืนยัน** ให้คุณกดเอง

---

## ส่วนที่ 0 — อ่านก่อนเริ่ม (สำคัญ)

### 0.1 โฟลว์นี้ทำอะไร
เมื่อมีคนยื่นคำขอในเว็บ → หุ่นยนต์ตัวนี้จะส่งเรื่องให้ผู้อนุมัติทีละลำดับโดยอัตโนมัติ
ผู้อนุมัติกด **อนุมัติ / ส่งกลับแก้ไข / ไม่อนุมัติ** (พร้อมพิมพ์เหตุผล) ได้จากทั้งอีเมล การ์ดใน Teams หรือหน้าเว็บ
แล้วหุ่นยนต์จะเขียนผลกลับไปที่ SharePoint เอง และวิ่งไปหาผู้อนุมัติลำดับถัดไปจนจบ

### 0.2 ศัพท์ที่ต้องรู้ (มีแค่ 5 คำ)
- **Flow (โฟลว์)** = ตัวหุ่นยนต์ 1 ตัว = งานอัตโนมัติ 1 ชุด
- **Trigger (ทริกเกอร์)** = "จุดจุดชนวน" กล่องบนสุดเสมอ เช่น "เมื่อมีคำขอใหม่"
- **Action (แอ็กชัน)** = ขั้นตอนที่ทำต่อ ๆ กันจากบนลงล่าง เหมือนต่อบล็อก
- **Connector (คอนเนกเตอร์)** = สะพานไปแอปอื่น (SharePoint / อีเมล / Teams) ครั้งแรกจะให้ **Sign in** ครั้งเดียว
- **Dynamic content / Expression** = ค่าที่ดึงมาจากขั้นก่อน (Dynamic content) หรือสูตรที่ขึ้นต้นด้วย `@` (Expression)

### 0.3 กติกาทองของมือใหม่
1. ทำ **ทีละส่วน** แล้วกด **บันทึก (Save)** ทุกครั้ง — ไม่ต้องรอทำครบแล้วค่อยเซฟ
2. **ชื่อของแต่ละ Action ต้องตรงกับในคู่มือ** เพราะสูตรอ้างถึงชื่อพวกนี้ ถ้าคุณตั้งชื่อเอง ต้องแก้ในสูตรให้ตรงด้วย
   (วิธีเปลี่ยนชื่อ Action: คลิกจุดสามจุด ⋯ บนกล่อง → เปลี่ยนชื่อ / Rename)
3. สูตรในกรอบโค้ด ให้ **คัดลอกทั้งบรรทัด** ไปวาง อย่าพิมพ์เอง (กันพิมพ์ตก)
4. ค่าภาษาไทย (เช่น `รออนุมัติ`) ต้องสะกดตรงเป๊ะ เว้นวรรคห้ามเกิน

### 0.4 ของที่ต้องมีก่อน
- บัญชี Microsoft 365 ที่เข้า Power Automate ได้ (คุณล็อกอินอยู่แล้ว: สภาพแวดล้อม PRIME POWER CONSTR…)
- สิทธิ์เข้าถึงไซต์ SharePoint: `Intranet_PrimePower`
- คอลัมน์ใน SharePoint ครบตามส่วนที่ 1 (ถ้ายังไม่ครบ ทำส่วนที่ 1 ให้เสร็จก่อน)

> โฟลว์เดิมชื่อ "Prime Power" ที่ทำค้างไว้ — จะลบทิ้งแล้วเริ่มใหม่ก็ได้ (โฟลว์ของฉัน → ⋯ ที่ชื่อโฟลว์ → ลบ)
> หรือจะเก็บไว้เป็นตัวอย่างแล้วสร้างตัวใหม่ก็ได้ ไม่กระทบกัน

---

## ส่วนที่ 1 — เตรียม SharePoint ให้พร้อม (ทำครั้งเดียว)

โฟลว์จะอ่าน/เขียนคอลัมน์เหล่านี้ **ชนิดคอลัมน์ต้องถูก** ไม่งั้นจะเขียนไม่ลงหรือ error
เปิดแต่ละ List → ตั้งค่า (Settings) → ตรวจ/สร้างคอลัมน์ตามนี้

**List `Requests` (คำขอ)**
| คอลัมน์ | ชนิด |
|---|---|
| Status | Single line of text |
| CurrentStep | Number |
| ApprovalLog | **Multiple lines of text** (ข้อความหลายบรรทัด) |
| FormCode, RequesterName, RequesterEmail, RequesterDept | Single line of text |
| FormData | Multiple lines of text |

**List `ApprovalMatrix` (เส้นทางอนุมัติ)**
| คอลัมน์ | ชนิด |
|---|---|
| FormCode, StepName, ApproverType, ApproveMode | Single line of text |
| StepOrder | Number |
| Approvers | Lookup ไป Directory (หลายค่า) |

**List `Directory` (ทะเบียนบุคลากร)**
| คอลัมน์ | ชนิด |
|---|---|
| Title, Email, Department, Position | Single line of text |
| Manager | Single line of text ← หัวหน้าโดยตรง (ใส่ชื่อให้ตรงกับ Title) |
| BackupManager | Single line of text (สำรอง) |

**List `Projects`**: มี `Title`, `ProjectCode`, `Owner`

> ⚠️ อย่าตั้งคอลัมน์พวกนี้เป็นชนิด Choice / Person / Lookup (ยกเว้น Approvers) — จะเขียนผ่านโฟลว์ไม่ได้
> ค่ามาตรฐานที่ระบบใช้ (สะกดตามนี้เป๊ะ):
> - Status: `รออนุมัติ` `อนุมัติแล้ว` `ไม่อนุมัติ` `ส่งกลับแก้ไข` `เสร็จสิ้น` `ยกเลิก`
> - ApproverType: `ระบุชื่อเจาะจง` `ผู้บังคับบัญชาของผู้ยื่น` `ผู้จัดการฝ่ายของผู้ยื่น` `หัวหน้าฝ่ายตามสังกัด` `ผู้รับผิดชอบหลักของโครงการ`
> - ApproveMode: `คนใดคนหนึ่งอนุมัติก็ผ่าน` `ต้องอนุมัติครบทุกคน`

**ค่า GUID/ไซต์ (เก็บไว้ใช้ตอนเลือก List)**
- ไซต์: `primepowertl.sharepoint.com/sites/Intranet_PrimePower`
- Requests: `09a369a9-0d42-44f5-bec8-644c78ec1d10`
- ApprovalMatrix: `fc1465b8-a4fc-4055-b20a-7e3712a592fe`

---

## ส่วนที่ 2 — สร้างโฟลว์ + ทริกเกอร์

### 2.1 สร้างโฟลว์เปล่า
1. เมนูซ้าย **สร้าง (Create)** → เลือก **โฟลว์ระบบคลาวด์อัตโนมัติ (Automated cloud flow)**
2. ช่อง "ชื่อโฟลว์" พิมพ์: `Prime Power - อนุมัติคำขอ`
3. ช่องค้นหาทริกเกอร์ พิมพ์: `when an item is created or modified`
4. เลือกอันของ **SharePoint** ที่ชื่อ "เมื่อมีการสร้างหรือแก้ไขรายการ" → กด **สร้าง**

### 2.2 ตั้งค่าทริกเกอร์
1. ในกล่องทริกเกอร์: **Site Address** เลือก `Intranet_PrimePower`
2. **List Name** เลือก `Requests`
   - ถ้าครั้งแรกมันให้ Sign in → กดล็อกอินด้วยบัญชีบริษัท (คุณกดเอง)

### 2.3 ใส่ "เงื่อนไขทริกเกอร์" — ขั้นนี้แก้ปัญหาที่เคยติด
เราจะบอกหุ่นยนต์ว่า "ตื่นเฉพาะตอน Status = รออนุมัติ" เพื่อไม่ให้ไปจับคำขอเก่าที่ยังไม่ยื่น และไม่วนซ้ำ
1. บนกล่องทริกเกอร์ กด **⋯ (จุดสามจุด) → การตั้งค่า (Settings)**
2. หา **เงื่อนไขทริกเกอร์ (Trigger Conditions)** → กด **+ เพิ่ม**
3. วางสูตรนี้ แล้วกด **เสร็จสิ้น (Done)**:
```
@equals(triggerOutputs()?['body/Status'], 'รออนุมัติ')
```
4. กด **บันทึก (Save)** มุมขวาบน

✅ จบส่วนนี้ หุ่นยนต์พร้อมเฝ้าดูคำขอที่ "รออนุมัติ" แล้ว

---

## ส่วนที่ 3 — เตรียมกล่องเก็บค่า (Initialize variables)

**ตัวแปร** คือกล่องเปล่าไว้พักข้อมูลระหว่างทาง เราสร้าง 3 กล่อง ต้องอยู่ **บนสุดก่อนทุก Action**

ทำซ้ำ 3 รอบ: กด **+ ขั้นตอนใหม่ (New step)** → ค้นหา `Initialize variable` → เลือก

| รอบ | ชื่อ (Name) | ชนิด (Type) | ค่า (Value) |
|---|---|---|---|
| 1 | `varNames` | Array | ปล่อยว่าง |
| 2 | `varEmails` | Array | ปล่อยว่าง |
| 3 | `varLog` | Array | ใส่สูตรด้านล่าง |

สูตรของ `varLog` (กดที่ช่อง Value → แท็บ **Expression** (นิพจน์) → วาง → OK):
```
if(empty(triggerOutputs()?['body/ApprovalLog']), json('[]'), json(triggerOutputs()?['body/ApprovalLog']))
```
> กล่องนี้ไว้เก็บ "ประวัติการอนุมัติ" เราอ่านของเดิมมาต่อ ไม่ให้ประวัติหาย

กด **บันทึก**

---

## ส่วนที่ 4 — ดึงว่าตอนนี้ถึงลำดับอนุมัติที่เท่าไหร่

1. **+ ขั้นตอนใหม่** → ค้นหา `Get items` → เลือกของ **SharePoint**
2. ตั้งค่า: Site = `Intranet_PrimePower`, List = `ApprovalMatrix`
3. กด **แสดงตัวเลือกขั้นสูง (Show advanced options)** → ช่อง **Filter Query** วาง:
```
FormCode eq '@{triggerOutputs()?['body/FormCode']}' and StepOrder eq @{triggerOutputs()?['body/CurrentStep']}
```
4. ช่อง **Top Count** ใส่ `1`
5. **เปลี่ยนชื่อกล่องนี้เป็น** `ขั้นปัจจุบัน` (⋯ → เปลี่ยนชื่อ)

จากนั้นเพิ่มกล่องพักค่า 1 อัน:
6. **+ ขั้นตอนใหม่** → ค้นหา `Compose` → เลือก → **เปลี่ยนชื่อเป็น** `stepNow`
7. ช่อง Inputs ใส่ (แท็บ Expression):
```
first(outputs('ขั้นปัจจุบัน')?['body/value'])
```
> ต่อจากนี้เราจะอ้างค่าของลำดับปัจจุบันด้วย `outputs('stepNow')?['ApproverType']` เป็นต้น

กด **บันทึก**

---

## ส่วนที่ 5 — หาว่า "ใครต้องอนุมัติ" ลำดับนี้ (Switch)

ผู้อนุมัติมี 5 แบบ เราใช้กล่อง **Switch** แยกกรณีตามค่า `ApproverType`

1. **+ ขั้นตอนใหม่** → ค้นหา `Switch` → เลือก
2. ช่อง **On** ใส่ (Expression): `@{outputs('stepNow')?['ApproverType']}`
3. กด **+ เพิ่ม Case** ให้ครบตามด้านล่าง (พิมพ์ค่าในช่อง Equals ให้ตรงเป๊ะ)

**Case 1 — `ระบุชื่อเจาะจง`** (ระบุตัวคนไว้แล้วใน Approvers)
- ใน Case ใส่ Action **Select** (ค้นหา "Select" ของ Data Operation)
  - From: `@{outputs('stepNow')?['Approvers']}`
  - Map (สลับเป็นโหมด text ปุ่มสลับด้านขวา): `@{item()?['Value']}`
- ใส่ Action **Set variable**: Name = `varNames`, Value = `@{body('Select')}`

**Case 2 — `ผู้บังคับบัญชาของผู้ยื่น`** (อ่านหัวหน้าจากทะเบียนบุคลากร)
- **Get items** (Directory) → Filter Query: `Title eq '@{triggerOutputs()?['body/RequesterName']}'`, Top 1
  - เปลี่ยนชื่อกล่องเป็น `Get_me`
- **Set variable** `varNames` = (Expression):
```
if(empty(first(outputs('Get_me')?['body/value'])?['Manager']), json('[]'), createArray(first(outputs('Get_me')?['body/value'])?['Manager']))
```

**Case 3 — `ผู้รับผิดชอบหลักของโครงการ`**
- **Parse JSON**: Content = `@{triggerOutputs()?['body/FormData']}` → กด "Generate from sample" แล้ววาง JSON ตัวอย่างของฟอร์มนั้น (ให้มี field `project`)
- **Get items** (Projects) → Filter: `Title eq '@{body('Parse_JSON')?['project']}'`, Top 1 → ชื่อกล่อง `Get_project`
- **Set variable** `varNames` = `@{createArray(first(outputs('Get_project')?['body/value'])?['Owner'])}`

**Case 4 และ 5 — `ผู้จัดการฝ่ายของผู้ยื่น` / `หัวหน้าฝ่ายตามสังกัด`** (ทำเหมือนกัน สร้าง 2 Case ชี้มาชุด Action เดียวกันได้)
- **Get items** (Directory) → Filter: `Department eq '@{triggerOutputs()?['body/RequesterDept']}'` → ชื่อ `Get_dept`
- **Filter array**: From = `@{outputs('Get_dept')?['body/value']}` → กดปุ่ม "แก้ไขในโหมดขั้นสูง" แล้ววาง:
```
@or(contains(item()?['Position'],'ผู้จัดการฝ่าย'), contains(item()?['Position'],'หัวหน้าฝ่าย'), contains(item()?['Position'],'ผู้อำนวยการ'))
```
- **Select** (ชื่อ `Select_heads`): From = `@{body('Filter_array')}`, Map = `@{item()?['Title']}`
- **Set variable** `varNames` = `@{body('Select_heads')}`

**ช่องสำรอง (กันผู้อนุมัติว่าง) — ทำต่อจาก Switch**
หลังกล่อง Switch เพิ่ม **Condition**: ซ้าย `@{length(variables('varNames'))}` / เท่ากับ / `0`
- ในสาขา **ถ้าใช่ (If yes)**: Select จาก `@{outputs('stepNow')?['Approvers']}` (map `@{item()?['Value']}`) แล้ว Set `varNames`
> แปลว่า: ถ้าหาตามตำแหน่งไม่เจอ ให้ใช้รายชื่อสำรองในช่อง Approvers เสมอ

กด **บันทึก**

---

## ส่วนที่ 6 — เปลี่ยน "ชื่อ" เป็น "อีเมล"

การ์ดอนุมัติต้องส่งด้วยอีเมล เราวนหาอีเมลของแต่ละชื่อจาก Directory

1. **+ ขั้นตอนใหม่** → ค้นหา `Apply to each` → เลือก
2. ช่อง "เลือกเอาต์พุตจากขั้นก่อนหน้า" ใส่: `@{variables('varNames')}`
3. ข้างใน Apply to each: **Get items** (Directory) → Filter: `Title eq '@{items('Apply_to_each')}'`, Top 1 → ชื่อ `Get_email`
4. ยังข้างในอยู่: **Append to array variable** → Name `varEmails`, Value:
```
@{first(outputs('Get_email')?['body/value'])?['Email']}
```
> ตอนส่งการ์ดเราจะรวมอีเมลด้วย `@{join(variables('varEmails'), ';')}`

กด **บันทึก**

---

## ส่วนที่ 7 — ส่งการ์ดขออนุมัติ (โผล่ทั้งใน Teams และอีเมล)

1. **+ ขั้นตอนใหม่** → ค้นหา `Start and wait for an approval` (คอนเนกเตอร์ **Approvals**)
   - ครั้งแรกจะให้ Sign in Approvals → คุณกดเอง
2. **Approval type**: เลือก **Custom Responses – Wait for one response**
   - (ถ้าลำดับนั้นต้องอนุมัติครบทุกคน ให้เลือก Wait for all responses — ดูหมายเหตุท้ายคู่มือ)
3. **Response options** ใส่ทีละบรรทัด:
```
อนุมัติ
ส่งกลับแก้ไข
ไม่อนุมัติ
```
4. **Title**: `ขออนุมัติ @{triggerOutputs()?['body/FormName']} เลขที่ @{triggerOutputs()?['body/Title']}`
5. **Assigned to**: `@{join(variables('varEmails'), ';')}`
6. **Details** (พิมพ์ผสม Dynamic content ได้):
```
ผู้ยื่น: @{triggerOutputs()?['body/RequesterName']} (@{triggerOutputs()?['body/RequesterDept']})
เรื่อง: @{triggerOutputs()?['body/Title']}
ลำดับ: @{outputs('stepNow')?['StepName']}
โปรดพิมพ์เหตุผลในช่องความคิดเห็นเมื่อ "ส่งกลับแก้ไข" หรือ "ไม่อนุมัติ"
```
7. **Item link**: `https://ppg2014.github.io/prime-power-intranet/#/requests`
8. **เปลี่ยนชื่อกล่องนี้เป็น** `ขออนุมัติ`

> การ์ดนี้จะเด้งใน Teams และในอีเมลจะมีปุ่มให้กดเลือกได้เลย พร้อมช่องพิมพ์เหตุผล — ไม่ต้องส่งอีเมลแยก

กด **บันทึก**

---

## ส่วนที่ 8 — จดผลการกดลงประวัติ (ApprovalLog)

1. **+ ขั้นตอนใหม่** → **Append to array variable** → Name `varLog`
2. Value กดแท็บ Expression ไม่ได้ (เป็นก้อน JSON) ให้สลับช่องเป็นโหมดข้อความแล้ววางก้อนนี้:
```
{
  "step": @{outputs('stepNow')?['StepOrder']},
  "action": "@{first(body('ขออนุมัติ')?['responses'])?['responseValue']}",
  "by": "@{first(body('ขออนุมัติ')?['responses'])?['responder']?['displayName']}",
  "note": "@{first(body('ขออนุมัติ')?['responses'])?['comments']}",
  "at": "@{utcNow()}"
}
```
> 5 คีย์นี้ (step, action, by, note, at) คือรูปแบบที่หน้าเว็บอ่านได้ ไทม์ไลน์ในเว็บจะขึ้นเหมือนกดในเว็บเอง
> ถ้าระบบฟ้องตรง `step` ให้ใส่คำพูดครอบเป็น `"@{outputs('stepNow')?['StepOrder']}"` ก็ได้

กด **บันทึก**

---

## ส่วนที่ 9 — เขียนสถานะกลับ + เดินลำดับถัดไป (หัวใจของระบบ)

1. **+ ขั้นตอนใหม่** → **Switch** → On ใส่:
```
@{first(body('ขออนุมัติ')?['responses'])?['responseValue']}
```

**Case `อนุมัติ`**
- **Get items** (ApprovalMatrix) หาลำดับถัดไป → ชื่อ `หาถัดไป`
  - Filter: `FormCode eq '@{triggerOutputs()?['body/FormCode']}' and StepOrder gt @{outputs('stepNow')?['StepOrder']}`
  - Order By: `StepOrder asc` · Top 1
- **Condition**: ซ้าย `@{length(outputs('หาถัดไป')?['body/value'])}` / มากกว่า / `0`
  - **ถ้าใช่ (ยังมีลำดับต่อไป)** → **Update item** (Requests, Id = `@{triggerOutputs()?['body/ID']}`):
    - CurrentStep = `@{first(outputs('หาถัดไป')?['body/value'])?['StepOrder']}`
    - Status = `รออนุมัติ`
    - ApprovalLog = `@{string(variables('varLog'))}`
    - *(หุ่นยนต์จะตื่นเองอีกรอบเพื่อทำลำดับถัดไป)*
  - **ถ้าไม่ใช่ (หมดลำดับแล้ว)** → **Update item**:
    - Status = `อนุมัติแล้ว` · ApprovalLog = `@{string(variables('varLog'))}`

**Case `ส่งกลับแก้ไข`**
- **Update item** (Requests): Status = `ส่งกลับแก้ไข` · ApprovalLog = `@{string(variables('varLog'))}`
  - *(ไม่ต้องแตะ CurrentStep — เว็บจะให้ผู้ยื่นกด "แก้ไขและยื่นใหม่" เห็นเหตุผลที่ส่งกลับ)*

**Case `ไม่อนุมัติ`**
- **Update item** (Requests): Status = `ไม่อนุมัติ` · ApprovalLog = `@{string(variables('varLog'))}`

กด **บันทึก**

---

## ส่วนที่ 10 — แจ้งผลให้ผู้ยื่น

ทำต่อท้าย (นอก Switch หรือใส่ในแต่ละ Case ก็ได้)
1. **Post message in a chat or channel** (Teams) → Post as: Flow bot, Recipient: `@{triggerOutputs()?['body/RequesterEmail']}`, ข้อความ:
```
คำขอ @{triggerOutputs()?['body/Title']} — ผล: @{first(body('ขออนุมัติ')?['responses'])?['responseValue']}
เหตุผล: @{first(body('ขออนุมัติ')?['responses'])?['comments']}
ดูรายละเอียด: https://ppg2014.github.io/prime-power-intranet/#/requests
```
2. (จะเพิ่ม **Send an email (V2)** เนื้อหาเดียวกัน ส่งไป RequesterEmail ด้วยก็ได้)

กด **บันทึก**

---

## ส่วนที่ 11 — ทดสอบ (ทำทีละขั้น จะหาปัญหาง่าย)

อย่าเพิ่งทดสอบทั้งเส้นรวดเดียว ทำเป็นด่าน ๆ:
1. ทำถึงส่วนที่ 4 แล้วกด **ทดสอบ (Test) → ด้วยตนเอง (Manually)** → ไปยื่นใบทดสอบในเว็บ 1 ใบ → ดูว่ากล่อง `stepNow` ได้ข้อมูลลำดับถูกต้อง
2. ทำถึงส่วนที่ 7 (เฉพาะ Case ระบุชื่อเจาะจงก่อน) → ทดสอบว่าการ์ดเด้งเข้า Teams/อีเมลจริง
3. ทำถึงส่วนที่ 9 ครบ 1 ลำดับ → ลองกดทั้ง 3 ปุ่ม:
   - **อนุมัติ** → สถานะเปลี่ยนถูก
   - **ส่งกลับแก้ไข** (พิมพ์เหตุผล) → กลับไปเว็บ ต้องเห็นปุ่ม "แก้ไขและยื่นใหม่" พร้อมเหตุผล
   - **ไม่อนุมัติ** → สถานะเป็นไม่อนุมัติ
4. เพิ่มการวนหลายลำดับ (ฟอร์มเบิกเงิน FM-ACC-002 มี 3–4 ลำดับ)
5. เพิ่ม Case ตามตำแหน่ง (ผู้บังคับบัญชา/หัวหน้าฝ่าย/โครงการ) ทีละอัน

---

## ส่วนที่ 12 — เมื่อพัง ให้ดูตรงไหน

- **การ์ดไม่เข้าใคร** → ส่วนที่ 6 อีเมลว่าง: ชื่อใน Approvers/Manager ต้องตรงกับ Title ใน Directory เป๊ะ
- **โฟลว์วนไม่หยุด** → ลืมใส่เงื่อนไขทริกเกอร์ (ส่วน 2.3) หรือตอนอนุมัติแล้วยังมีลำดับต่อ ให้ตั้ง Status เป็น `รออนุมัติ` อย่างเดียว
- **ประวัติหาย/เพี้ยน** → ApprovalLog ต้องเป็น Multiple lines of text และเขียนกลับด้วย `@{string(variables('varLog'))}` เสมอ
- **สูตรหากล่องไม่เจอ (สีแดง)** → ชื่อ Action ในสูตรไม่ตรงกับชื่อจริง ให้แก้ชื่อในสูตรให้ตรง (เช่น `body('ขออนุมัติ')`)
- **ดูว่าพังขั้นไหน** → เมนู "แก้ไขล่าสุด/ประวัติการเรียกใช้ (Run history)" → เปิดรอบที่แดง → กล่องไหนติด ✗ จะบอกสาเหตุ

---

## ภาคผนวก A — ค่าที่คัดลอกบ่อย
- เงื่อนไขทริกเกอร์: `@equals(triggerOutputs()?['body/Status'], 'รออนุมัติ')`
- ลำดับปัจจุบัน: `first(outputs('ขั้นปัจจุบัน')?['body/value'])`
- รวมอีเมล: `@{join(variables('varEmails'), ';')}`
- ผลที่กด: `@{first(body('ขออนุมัติ')?['responses'])?['responseValue']}`
- เหตุผล: `@{first(body('ขออนุมัติ')?['responses'])?['comments']}`
- เขียนประวัติกลับ: `@{string(variables('varLog'))}`

## ภาคผนวก B — เรื่องที่มือใหม่ไม่ต้องทำตอนนี้ (ไว้ค่อยเพิ่ม)
- **ต้องอนุมัติครบทุกคน**: เปลี่ยน Approval type เป็น Wait for all responses (หรือทำ Condition แยกตาม ApproveMode)
- **ฟอร์มเบิกเงินขั้นสุดท้าย** (แนบสลิป→ปิดงาน): ทำบนเว็บ เพราะการ์ด Teams แนบไฟล์ไม่ได้ ให้ขั้นสุดท้ายจบที่ `อนุมัติแล้ว` แล้วการเงินเข้าเว็บไปปิดงาน (เว็บตั้ง `เสร็จสิ้น` ให้เอง)
- **ยกเลิกคำขอ**: ผู้ยื่นกดในเว็บเอง (Status=`ยกเลิก`) หุ่นยนต์มองข้ามอัตโนมัติ

---

### ถ้ารู้สึกว่าเยอะไป
โฟลว์นี้จัดว่าระดับกลาง ไม่ใช่ของง่ายสำหรับครั้งแรก ถ้าอยากเริ่มจากแบบง่ายสุดก่อน (แค่ "แจ้งเตือนให้ไปกดอนุมัติในเว็บ" ไม่มีการเขียนกลับ) บอกได้ ผมทำคู่มือฉบับสั้นให้ หรือจะให้ผมเชื่อมเบราว์เซอร์เข้าไปคลิกทำให้ดูทีละขั้นก็ได้เช่นกัน
