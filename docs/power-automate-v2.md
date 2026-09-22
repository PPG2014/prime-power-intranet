# Power Automate ฉบับใหม่ (v2) — อนุมัติผ่านอีเมลและ Teams

## ผู้อนุมัติทำอะไรได้บ้าง
- ได้รับคำขอเป็น **การ์ดใน Teams** (แอป Approvals) และ **อีเมลใน Outlook** พร้อมกัน
- กดได้ 3 ปุ่ม: **1. อนุมัติ · 2. ส่งกลับแก้ไข · 3. ไม่อนุมัติ** พร้อม **ช่องพิมพ์เหตุผล** ในการ์ดเลย
- **ไม่ต้องเข้าเว็บ** · กดที่ไหนก็ได้ ผลเขียนกลับเข้าระบบเหมือนกัน · ลำดับถัดไปได้การ์ดอัตโนมัติ
- รองรับทั้งลำดับแบบ **ใครคนหนึ่งกดก็ผ่าน** และ **ต้องกดครบทุกคน**
- ผู้ยื่นได้แจ้งผลทาง **อีเมลและ Teams**

> **ทำไมฉบับนี้พังยาก:** เว็บคำนวณผู้อนุมัติ + อีเมลของทุกลำดับไว้ในคำขอแล้วตอนกดส่ง
> โฟลว์แค่อ่านจากคำขอ ไม่ต้องค้น List อื่น · เงื่อนไขทริกเกอร์และการตัดสินผลใช้ **ตัวอักษรอังกฤษ/ตัวเลข** ไม่ต้องเทียบคำไทย

---

## ขั้นที่ 0 — เตรียมก่อน (ห้ามข้าม)

**0.1** อัป ZIP ล่าสุดขึ้น GitHub → Ctrl+Shift+R → F12 ต้องเห็น `build 2026-09-17-3btn`

**0.2** เพิ่ม 3 คอลัมน์ใน SharePoint List **Requests**
| ชื่อคอลัมน์ (พิมพ์ตามนี้เป๊ะ) | ชนิด |
|---|---|
| `PAState` | Single line of text |
| `CurrentApprovers` | Multiple lines of text → **Plain text** |
| `Route` | Multiple lines of text → **Plain text** |

ตรวจของเดิม: `Status` = Single line of text · `CurrentStep` = Number · `ApprovalLog` = Multiple lines of text (**Plain text**)
> Multiple lines ต้องปิด "Use enhanced rich text" (คอลัมน์ → Edit → More options) ไม่งั้นมี HTML ปน

**0.3** ทะเบียนบุคลากร: ทุกคนต้องมี **Email** และช่อง **Manager** (ถ้าฟอร์มมีขั้นผู้บังคับบัญชา) · ApprovalMatrix ควรกรอก **Approvers** เป็นตัวสำรองทุกลำดับ

**0.4** **Turn off โฟลว์ "Prime Power" ตัวเก่า** (ถ้าเปิดไว้จะส่งซ้ำ และตอนนี้มันไม่มีเงื่อนไขทริกเกอร์)

**0.5** ยื่นคำขอทดสอบ 1 ใบ → เปิด List Requests ดูใบนั้น ต้องเห็น
- `PAState` = `PENDING` หรือ `PENDING_ALL`
- `CurrentApprovers` = อีเมลผู้อนุมัติ
- `Route` = ขึ้นต้นด้วย `[{"step":`

ถ้าเป็น `NOAPPROVER` = ลำดับแรกไม่มีอีเมล (หน้าจอหลังส่งจะบอกชื่อที่ขาด) → แก้ตาม 0.3 → เปิดคำขอในหน้าติดตามสถานะ (บัญชีแอดมิน) → **↻ ส่งแจ้งอนุมัติใหม่**

---

## กฎ 3 ข้อ
1. **(fx)** = คลิกช่อง → กดปุ่ม **fx** → วางสูตร **ไม่มี `@{ }`** → Add
2. **(พิมพ์)** = พิมพ์ลงช่องตรง ๆ
3. ตั้งชื่อกล่องตามที่บอกเป๊ะ (⋯ → Rename) · **คัดลอกข้อความจากคู่มือไปวาง อย่าพิมพ์เอง**

---

## กล่อง 1 — ทริกเกอร์
1. **Create → Automated cloud flow** → ชื่อ `Prime Power Approval v2`
2. เลือก **When an item is created or modified** (SharePoint)
3. Site Address = `Intranet_Prime Power` · List Name = `Requests`
4. แท็บ **Settings** → Split on = **Off** → Trigger conditions → **+ Add** → วาง:
```
@startsWith(coalesce(triggerOutputs()?['body/PAState'], ''), 'PENDING')
```

## กล่อง 2–4 — ตัวแปร 3 ตัว (ใต้ทริกเกอร์ ต่อกันเรียงลงมา)
**+** → **Initialize variable** ทำ 3 ครั้ง (Value ปล่อยว่าง)
| Name | Type |
|---|---|
| `varCode` | String |
| `varBy` | String |
| `varNote` | String |

## กล่อง 5 — ล็อกคำขอ (กันส่งการ์ดซ้ำ)
**+** → **Update item** → Rename `lockItem`
- Site = Intranet_Prime Power · List = Requests
- **Id** (fx) `triggerOutputs()?['body/ID']`
- **Title** (fx) `triggerOutputs()?['body/Title']`
- Show all → **PAState** (พิมพ์) `WAITING`

**Save**

---

## กล่อง 6 — แยกแบบ "ครบทุกคน" หรือ "คนเดียวพอ"
**+** → **Condition** → Rename `isAll`
- ซ้าย (fx) `triggerOutputs()?['body/PAState']` · **is equal to** · ขวา (พิมพ์) `PENDING_ALL`

ในทั้งสองสาขาจะใส่การ์ดขออนุมัติ **ตั้งค่าเหมือนกัน ต่างกันแค่ Approval type** ค่าที่ใช้ร่วมกันคือ:

> **ค่าการ์ด (ใช้ทั้งสองสาขา)**
> - **Response options Item** (พิมพ์ 3 รายการ กด Add new item เพิ่ม · คัดลอกไปวางทีละบรรทัด):
>   ```
>   1. อนุมัติ
>   ```
>   ```
>   2. ส่งกลับแก้ไข
>   ```
>   ```
>   3. ไม่อนุมัติ
>   ```
> - **Title** (fx) `concat('ขออนุมัติ ', triggerOutputs()?['body/Title'])`
> - **Assigned to** (fx) `triggerOutputs()?['body/CurrentApprovers']`
> - **Details** (fx)
>   ```
>   concat('ผู้ยื่น: ', triggerOutputs()?['body/RequesterName'], ' (', coalesce(triggerOutputs()?['body/RequesterDept'], '-'), ')', decodeUriComponent('%0A%0A'), 'แบบฟอร์ม: ', coalesce(triggerOutputs()?['body/FormName'], '-'), decodeUriComponent('%0A%0A'), 'กรุณาพิมพ์เหตุผลในช่องความคิดเห็น เมื่อกด ส่งกลับแก้ไข หรือ ไม่อนุมัติ')
>   ```
> - **Item link** (พิมพ์) `https://ppg2014.github.io/prime-power-intranet/#/requests`
> - **Item link description** (พิมพ์) `เปิดดูรายละเอียดคำขอ`

### สาขา **False** (คนใดคนหนึ่งกดก็ผ่าน)
**A)** **Start and wait for an approval** → Rename `approvalOne`
- **Approval type**: `Custom Responses - Wait for one response` · ที่เหลือใช้ **ค่าการ์ด** ด้านบน

**B)** **Set variable** → Name `varCode` · Value (fx)
```
substring(first(body('approvalOne')?['responses'])?['responseValue'], 0, 1)
```
**C)** **Set variable** → Name `varBy` · Value (fx)
```
first(body('approvalOne')?['responses'])?['responder']?['displayName']
```
**D)** **Set variable** → Name `varNote` · Value (fx)
```
coalesce(first(body('approvalOne')?['responses'])?['comments'], '')
```

### สาขา **True** (ต้องกดครบทุกคน)
**A)** **Start and wait for an approval** → Rename `approvalAll`
- **Approval type**: `Custom Responses - Wait for all responses` · ที่เหลือใช้ **ค่าการ์ด** ด้านบน

**B)** **Select** → Rename `allCodes`
- From (fx) `body('approvalAll')?['responses']`
- Map: กดปุ่มสลับด้านขวาเป็น **โหมดข้อความ** → (fx) `substring(item()?['responseValue'], 0, 1)`

**C)** **Select** → Rename `allText`
- From (fx) `body('approvalAll')?['responses']`
- Map: โหมดข้อความ → (fx) `concat(item()?['responder']?['displayName'], ': ', coalesce(item()?['comments'], '-'))`

**D)** **Set variable** → Name `varCode` · Value (fx)
```
if(contains(body('allCodes'), '3'), '3', if(contains(body('allCodes'), '2'), '2', '1'))
```
> มีคนกดไม่อนุมัติแม้คนเดียว = ไม่อนุมัติ · มีคนส่งกลับ = ส่งกลับแก้ไข · ทุกคนอนุมัติ = อนุมัติ

**E)** **Set variable** → Name `varBy` · Value (พิมพ์) `ผู้อนุมัติทุกคนในลำดับนี้`

**F)** **Set variable** → Name `varNote` · Value (fx) `join(body('allText'), ' | ')`

**Save**

---

## กล่อง 7 — แปลงรหัสเป็นคำ (ใต้กล่อง isAll · นอกกรอบ)
**+** → **Compose** → Rename `resultText` · Inputs (fx)
```
if(equals(variables('varCode'), '1'), 'อนุมัติ', if(equals(variables('varCode'), '2'), 'ส่งกลับแก้ไข', 'ไม่อนุมัติ'))
```

## กล่อง 8 — อ่านคำขอล่าสุด
**+** → **Get item** (ตัวที่ไม่มี s) → Rename `latest`
- Site = Intranet_Prime Power · List = Requests · **Id** (fx) `triggerOutputs()?['body/ID']`

## กล่อง 9 — ตรวจว่ายังเป็นลำดับเดิม
**+** → **Condition** → Rename `stillValid`
- แถว 1: ซ้าย (fx) `outputs('latest')?['body/PAState']` · is equal to · ขวา (พิมพ์) `WAITING`
- **+ New row** (And)
- แถว 2: ซ้าย (fx) `string(outputs('latest')?['body/CurrentStep'])` · is equal to · ขวา (fx) `string(triggerOutputs()?['body/CurrentStep'])`
- **+ New row** (And)
- แถว 3 (จำนวนบรรทัดประวัติต้องเท่าเดิม):
  - ซ้าย (fx)
    ```
    length(json(if(empty(outputs('latest')?['body/ApprovalLog']), '[]', outputs('latest')?['body/ApprovalLog'])))
    ```
  - **is equal to**
  - ขวา (fx)
    ```
    length(json(if(empty(triggerOutputs()?['body/ApprovalLog']), '[]', triggerOutputs()?['body/ApprovalLog'])))
    ```

> ถ้ามีคนดำเนินการในเว็บไปก่อน หรือผู้ยื่นแก้ไขและยื่นใหม่ระหว่างที่การ์ดเก่ายังค้าง = False → ผลจากการ์ดเก่าถูกข้าม ไม่เขียนทับ · **กล่อง 10–13 ใส่ในสาขา True ทั้งหมด** · สาขา False ปล่อยว่าง

---

## กล่อง 10 — บรรทัดประวัติ (สาขา True)
**+** → **Compose** → Rename `newLog` · Inputs (fx)
```
string(union(json(if(empty(outputs('latest')?['body/ApprovalLog']), '[]', outputs('latest')?['body/ApprovalLog'])), createArray(addProperty(addProperty(addProperty(addProperty(addProperty(json('{}'), 'step', int(triggerOutputs()?['body/CurrentStep'])), 'action', outputs('resultText')), 'by', variables('varBy')), 'note', variables('varNote')), 'at', utcNow()))))
```

## กล่อง 11 — หาลำดับถัดไป (สาขา True)
**+** → **Filter array** → Rename `nextSteps`
- From (fx) `json(if(empty(triggerOutputs()?['body/Route']), '[]', triggerOutputs()?['body/Route']))`
- **Edit in advanced mode** → วาง
```
@greater(int(item()?['step']), int(triggerOutputs()?['body/CurrentStep']))
```

## กล่อง 12 — เขียนผลกลับ (สาขา True)
**+** → **Switch** → Rename `byResult` · On (fx) `int(variables('varCode'))` ⚠️ ต้องครอบ int() เพราะช่อง Case ที่พิมพ์ 1/2/3 จะถูกแปลงเป็นตัวเลข ถ้าไม่ครอบจะพังหลังผู้อนุมัติกด

### Case `1` (Equals พิมพ์ `1`) — อนุมัติ
**Condition** → Rename `hasNext` · ซ้าย (fx) `length(body('nextSteps'))` · **is greater than** · ขวา (พิมพ์) `0`

- **True** → **Update item** → Rename `goNext`
  - Id (fx) `triggerOutputs()?['body/ID']` · Title (fx) `triggerOutputs()?['body/Title']` · Show all
  - **Status** (พิมพ์) `รออนุมัติ`
  - **CurrentStep** (fx) `first(body('nextSteps'))?['step']`
  - **CurrentApprovers** (fx) `first(body('nextSteps'))?['emails']`
  - **ApprovalLog** (fx) `outputs('newLog')`
  - **PAState** (fx) `if(empty(first(body('nextSteps'))?['emails']), 'NOAPPROVER', if(equals(first(body('nextSteps'))?['all'], true), 'PENDING_ALL', 'PENDING'))`
  > โฟลว์เริ่มรอบใหม่เอง ส่งการ์ดให้ลำดับถัดไป
- **False** → **Update item** → Rename `finish`
  - Id, Title · **Status** (พิมพ์) `อนุมัติแล้ว` · **ApprovalLog** (fx) `outputs('newLog')` · **PAState** (พิมพ์) `DONE`

### Case `2` — ส่งกลับแก้ไข
**Update item** → Rename `sendBack`
- Id, Title · **Status** (พิมพ์) `ส่งกลับแก้ไข` · **ApprovalLog** (fx) `outputs('newLog')` · **PAState** (พิมพ์) `DONE`

### Case `3` — ไม่อนุมัติ
**Update item** → Rename `reject`
- Id, Title · **Status** (พิมพ์) `ไม่อนุมัติ` · **ApprovalLog** (fx) `outputs('newLog')` · **PAState** (พิมพ์) `DONE`

## กล่อง 13 — แจ้งผู้ยื่น ทางอีเมลและ Teams (สาขา True · ใต้ byResult นอกกรอบ)
**A) Send an email (V2)**
- **To** (fx) `triggerOutputs()?['body/RequesterEmail']`
- **Subject** (fx) `concat('ผลคำขอ ', triggerOutputs()?['body/Title'], ': ', outputs('resultText'))`
- **Body** (fx)
```
concat('ผลการพิจารณา: <b>', outputs('resultText'), '</b><br>โดย: ', variables('varBy'), '<br>เหตุผล: ', if(empty(variables('varNote')), '-', variables('varNote')), '<br><br><a href="https://ppg2014.github.io/prime-power-intranet/#/requests">เปิดดูคำขอ</a>')
```

**B) Post message in a chat or channel** (Microsoft Teams)
- **Post as** Flow bot · **Post in** Chat with Flow bot
- **Recipient** (fx) `triggerOutputs()?['body/RequesterEmail']`
- **Message** (fx) ใช้สูตรเดียวกับ Body ด้านบน

**Save** · คำเตือน "circular loop" = ปกติ ปิดได้ (เงื่อนไข PENDING + lockItem กันวนไว้แล้ว)

---

## ทดสอบ
1. ยื่นคำขอใหม่ในเว็บ — หน้าส่งสำเร็จต้อง**ไม่มี**กล่องเตือนสีเหลือง
2. รอ 1–3 นาที → Run history ต้องมีรอบ **Running** (= รอคนกด · ปกติ ไม่ใช่ค้าง)
3. ผู้อนุมัติเปิด **Teams → Approvals** หรือ **อีเมล** → กด **1. อนุมัติ**
4. รอบนั้นเป็น **Succeeded** · ถ้ามีลำดับถัดไป จะมีรอบใหม่ Running และคนถัดไปได้การ์ด
5. ทดสอบ **2. ส่งกลับแก้ไข** พร้อมพิมพ์เหตุผล → ผู้ยื่นได้อีเมล/Teams และเห็นปุ่ม "แก้ไขและยื่นใหม่" ในเว็บ → ยื่นใหม่ → การ์ดลำดับแรกถูกส่งใหม่
6. ทดสอบ **3. ไม่อนุมัติ**

---

## ถ้ามีปัญหา
| อาการ | ทำอย่างไร |
|---|---|
| Run history ว่าง | ดูคำขอใน SharePoint: PAState ต้องขึ้นต้นด้วย `PENDING` · `NOAPPROVER` = แก้อีเมล/Manager แล้วกด ↻ ส่งแจ้งอนุมัติใหม่ · ว่าง = ยังไม่ทำ 0.1 หรือ 0.2 |
| รอบ Running นาน | ปกติ รอคนกด (สูงสุด 30 วัน) |
| กล่อง newLog / nextSteps แดง เรื่อง JSON | ApprovalLog / Route ยังเป็น Rich text → เปลี่ยนเป็น Plain text |
| กล่อง approval แดงที่ Assigned to | CurrentApprovers ว่างหรืออีเมลผิด → แก้ทะเบียนบุคลากร → ↻ ส่งแจ้งอนุมัติใหม่ |
| ไม่เห็นปุ่มในอีเมล | เปิดใน Outlook (ปุ่มแบบกดได้ทำงานใน Outlook) หรือใช้ Teams → Approvals / ลิงก์ในอีเมลที่พาไปหน้า Approvals |
| ได้การ์ดซ้ำ | โฟลว์เก่ายังเปิด → Turn off |
| กดแล้วสถานะไม่เปลี่ยน | เป็นการ์ดใบเก่า — มีคนดำเนินการในเว็บไปก่อน หรือคำขอถูกยื่นใหม่แล้ว (stillValid = False) ถูกต้องตามออกแบบ ให้ใช้การ์ดใบล่าสุด |

**ข้อจำกัดที่ต้องรู้:** ขั้นสุดท้ายของฟอร์มเบิกเงินที่ต้อง **แนบสลิป** — การ์ด Approvals ในอีเมล/Teams รับไฟล์แนบไม่ได้ ฝ่ายการเงินกด "1. อนุมัติ" ในการ์ดเพื่อปิดลำดับได้ แต่การแนบสลิปต้องทำในเว็บ
