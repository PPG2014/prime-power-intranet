# โฟลว์แจ้งเตือนความคิดเห็นใหม่ (กล่องรับฟังความคิดเห็น)

> ส่งอีเมลหาผู้รับที่กำหนด **เฉพาะตอนมีคนส่งความคิดเห็นเข้ามา** ไม่ส่งซ้ำ ไม่มีเมลรายวัน
> ผู้รับแก้ได้เองจากในเว็บ ไม่ต้องกลับมาแก้โฟลว์ — มีแค่ **4 กล่อง**
> โฟลว์นี้แยกจากโฟลว์อนุมัติ ไม่กระทบกันเลย

---

## ขั้นที่ 0 — กำหนดผู้รับ (ทำในเว็บ ครั้งเดียว)

1. เว็บ → **จัดการข้อมูล** → **🛟 ตั้งค่าระบบ** → **+ เพิ่มรายการ**
2. กรอก
   - **ชื่อค่า:** `FeedbackRecipients`
   - **ค่า:** อีเมลผู้รับ คั่นด้วยจุลภาค เช่น
     ```
     hr@primepower.co.th, admin@primepower.co.th
     ```
   - **ความหมาย:** ผู้รับแจ้งเตือนความคิดเห็นใหม่
3. บันทึก

> เปลี่ยนคนรับภายหลัง แก้ที่แถวนี้แถวเดียว โฟลว์จะใช้ค่าใหม่ทันที

---

## กล่อง 1 — ทริกเกอร์
**Create → Automated cloud flow** → ชื่อ `Prime Power - แจ้งเตือนความคิดเห็นใหม่`
- เลือกทริกเกอร์ **When an item is created** (SharePoint) ← ตัวที่ไม่มีคำว่า modified
- Site Address = `Intranet_Prime Power` · List Name = **`Feedback`**

## กล่อง 2 — อ่านรายชื่อผู้รับจากตั้งค่าระบบ
**+** → **Get items** (SharePoint) → Rename `recipients`
- List = **`Settings`**
- **Filter Query** (ช่องปกติ):
```
Title eq 'FeedbackRecipients'
```
- Show all → **Top Count** `1`

## กล่อง 3 — เผื่อกรณียังไม่ได้ตั้งค่า
**+** → **Condition** → Rename `hasRecipient`
- ซ้าย (fx): `length(outputs('recipients')?['body/value'])`
- **is greater than** · ขวา: `0`

**กล่อง 4 ใส่ในสาขา True** · สาขา False ปล่อยว่าง

## กล่อง 4 — ส่งอีเมล (ในสาขา True)
**Send an email (V2)** → Rename `mailFeedback`
- **To** (fx):
```
replace(replace(replace(replace(replace(coalesce(first(outputs('recipients')?['body/value'])?['Value'], ''), ' ', ''), decodeUriComponent('%0D'), ''), decodeUriComponent('%0A'), ','), ',,', ','), ',', ';')
```
> ช่อง To ของ Outlook ต้องคั่นหลายอีเมลด้วย **;** และห้ามมีการขึ้นบรรทัดใหม่ — สูตรนี้ตัดเว้นวรรค/บรรทัดใหม่ แล้วแปลงจุลภาคเป็น ; ให้เอง
- **Subject** (fx):
```
concat('[ความคิดเห็นใหม่] ', coalesce(triggerOutputs()?['body/Title'], 'ไม่ระบุเรื่อง'))
```
- **Body**: เลือก **Outputs** ของกล่อง `bodyHtml` จาก Dynamic content (สร้างในข้อ 4.1 ด้านล่าง)
  > ⚠ **อย่าวางสูตรยาวลงช่อง Body ตรง ๆ** — ช่อง Body เป็นตัวแก้ไขแบบ HTML จะแปลง `<br>` `<b>` ในสูตรเป็นรหัส HTML
  > แล้วขึ้น error *"The input parameter(s) of operation 'mailFeedback' contains invalid expression(s)"*

### 4.1 — ประกอบเนื้อหาอีเมล (ทำก่อนกล่อง mailFeedback)
ในสาขา True กด **+** เหนือ `mailFeedback` → **Compose** (Data Operation) → Rename `bodyHtml`
- **Inputs** (fx) — อีเมลแบบทางการ: หัวข้อสีน้ำเงินเข้ม ตัวหนา · กรอบรายละเอียด · ลายเซ็น Intranet Prime Power Group ท้ายอีเมล
```
concat('<div style="font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.7">', '<p style="margin:0 0 12px">เรียน ผู้เกี่ยวข้อง</p>', '<p style="margin:0 0 16px">ระบบ Intranet Prime Power Group ได้รับข้อเสนอแนะใหม่ผ่านกล่องรับฟังความคิดเห็น โดยมีรายละเอียดดังนี้</p>', '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:0 0 16px">', '<tr><td style="padding:3px 18px 3px 0;color:#0B3A75;font-weight:bold;white-space:nowrap;vertical-align:top">เรื่องที่ต้องการเสนอ</td><td style="padding:3px 0">', replace(replace(coalesce(triggerOutputs()?['body/Title'], '-'), '&', '&amp;'), '<', '&lt;'), '</td></tr>', '<tr><td style="padding:3px 18px 3px 0;color:#0B3A75;font-weight:bold;white-space:nowrap;vertical-align:top">ผู้เสนอ</td><td style="padding:3px 0">', if(empty(triggerOutputs()?['body/SubmittedBy']), 'ไม่ประสงค์ระบุชื่อ', triggerOutputs()?['body/SubmittedBy']), '</td></tr>', '<tr><td style="padding:3px 18px 3px 0;color:#0B3A75;font-weight:bold;white-space:nowrap;vertical-align:top">อีเมล</td><td style="padding:3px 0">', coalesce(triggerOutputs()?['body/SubmittedEmail'], '-'), '</td></tr>', '<tr><td style="padding:3px 18px 3px 0;color:#0B3A75;font-weight:bold;white-space:nowrap;vertical-align:top">วันที่ส่ง</td><td style="padding:3px 0">', convertFromUtc(triggerOutputs()?['body/Created'], 'SE Asia Standard Time', 'dd/MM/yyyy HH:mm'), ' น.</td></tr>', '</table>', '<p style="margin:0 0 6px;color:#0B3A75;font-weight:bold">รายละเอียด</p>', '<div style="margin:0 0 20px;padding:12px 16px;background:#F3F7FC;border-left:4px solid #0B3A75">', replace(replace(replace(coalesce(triggerOutputs()?['body/Content'], '-'), '&', '&amp;'), '<', '&lt;'), decodeUriComponent('%0A'), '<br>'), '</div>', '<p style="margin:0 0 28px">จึงเรียนมาเพื่อโปรดพิจารณาดำเนินการต่อไป</p>', '<p style="margin:0 0 6px;font-family:Arial,sans-serif">Best Regards,</p>', '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>', '<td style="padding:0 26px 0 0;vertical-align:top"><img src="https://ppg2014.github.io/prime-power-intranet/assets/img/email-signature.png" width="280" height="135" alt="Prime Power Group" style="display:block;border:0"></td>', '<td style="vertical-align:top;font-family:Arial,sans-serif;font-size:13px;color:#333333;line-height:1.6">', '<b style="font-size:15px;color:#111111">Intranet Prime Power Group</b><br><br>', 'Prime Power Construction Co., Ltd.<br>99 Moo. 7 T. Bang Talat, A. Pak Kret, Nonthaburi 11120<br><br>', '+66 2 147 5098-99<br><br>', '<a href="https://www.primepowerconstruction.com" style="color:#1f4e79;text-decoration:none">www.primepowerconstruction.com</a>', '</td></tr></table>', '</div>')
```
- เวลาใน "วันที่ส่ง" แปลงเป็นเวลาไทยแล้ว (`convertFromUtc` … `SE Asia Standard Time`) — เดิมแสดงเป็นเวลา UTC (ช้ากว่าจริง 7 ชั่วโมง)
- รูปลายเซ็นอยู่ที่ `assets/img/email-signature.png` ในเว็บ (รูปลายเซ็นของบริษัท) — เปลี่ยนรูปได้โดยแทนไฟล์นี้ ไม่ต้องแก้โฟลว์
- ถ้า Outlook ไม่แสดงรูป ให้กด "ดาวน์โหลดรูปภาพ" ครั้งแรก (รูปมาจากเว็บภายนอกกล่องจดหมาย)

> สูตรทุกตัวต้องใช้เครื่องหมาย `'` ตรง ๆ — ถ้าคัดลอกจากแอปที่เปลี่ยนเป็น ‘ ’ (ตัวโค้ง) สูตรจะ error · วางในแท็บ **fx** แล้วกด Add/Update

**Save** แล้วกด **Test → Manually** → ไปเมนู 💬 กล่องรับฟังความคิดเห็น ในเว็บ ส่งความคิดเห็นทดสอบ 1 ใบ → ตรวจกล่องจดหมาย

---

## หมายเหตุ
- ถ้าผู้ส่งติ๊ก **"ไม่ต้องการระบุชื่อผู้เสนอ"** อีเมลจะขึ้นว่า "ไม่ระบุชื่อ" ตามที่ผู้ส่งเลือก — ระบบไม่เปิดเผยชื่อให้
- อยากให้ส่งเข้า Teams ด้วย เพิ่ม **Post message in a chat or channel** ต่อท้ายในสาขา True โดยใช้ Recipient สูตรเดียวกับ To
- ถ้าไม่ได้ตั้งค่า `FeedbackRecipients` โฟลว์จะจบเงียบ ๆ ไม่ error

---

## ส่งความคิดเห็นแล้วไม่ได้รับอีเมล — ตรวจทีละข้อ
| ตรวจ | ถ้าไม่ใช่ |
|---|---|
| 1. เว็บ → จัดการข้อมูล → **ความคิดเห็นที่ได้รับ** มีรายการที่เพิ่งส่ง | ปัญหาอยู่ที่เว็บ/สิทธิ์ List Feedback — ไม่ใช่โฟลว์ |
| 2. Power Automate → **My flows** มีโฟลว์ `Prime Power - แจ้งเตือนความคิดเห็นใหม่` และสถานะ **On** | ยังไม่ได้สร้าง → ทำตามคู่มือนี้ · ถ้า Off → Turn on |
| 3. เปิดโฟลว์ → **Run history** มีรอบตรงกับเวลาที่ส่ง | ทริกเกอร์ผิด List — ต้องเป็น List **Feedback** และ "When an item is **created**" |
| 3.1 กด Save แล้วขึ้น *contains invalid expression(s)* | ย้ายสูตร Body ไปไว้ใน Compose `bodyHtml` ตามข้อ 4.1 · ตรวจว่า `'` ไม่ใช่ตัวโค้ง ‘ ’ |
| 4. รอบนั้น **Succeeded** | กดเข้าไปดูกล่องที่แดง แล้วส่งภาพมาให้ผู้ดูแลเว็บ |
| 5. Succeeded แต่ `hasRecipient` ไป **False** | ชื่อค่าใน Settings ต้องสะกด `FeedbackRecipients` ตรงทุกตัว ไม่มีช่องว่างหัวท้าย |
| 5.1 `mailFeedback` แดง: *Input parameter 'emailMessage/To' is required to be of type 'String/email'* | ค่าผู้รับมีการขึ้นบรรทัดใหม่ปน (เช่น พิมพ์อีเมลละบรรทัด) → เปิดแถว `FeedbackRecipients` ในตั้งค่าระบบแล้วกดบันทึกอีกครั้ง (เว็บจัดให้เป็นบรรทัดเดียวคั่นด้วย `, ` เอง) · และเปลี่ยนสูตร To ในกล่อง 4 เป็นสูตรล่าสุดด้านบน แล้วกด **Resubmit** |
| 6. Succeeded และส่งเมลแล้ว แต่ไม่เจอ | ดูโฟลเดอร์ **Junk/Other** และ Quarantine ของ Microsoft 365 |
