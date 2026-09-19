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
     hr@primepower.co.th, narakorn.pa@primepower.co.th
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
first(outputs('recipients')?['body/value'])?['Value']
```
- **Subject** (fx):
```
concat('[ความคิดเห็นใหม่] ', coalesce(triggerOutputs()?['body/Title'], 'ไม่ระบุเรื่อง'))
```
- **Body** (fx):
```
concat('มีความคิดเห็นใหม่ส่งเข้ามาในระบบ<br><br><b>เรื่อง:</b> ', coalesce(triggerOutputs()?['body/Title'], '-'), '<br><b>ผู้เสนอ:</b> ', if(empty(triggerOutputs()?['body/SubmittedBy']), 'ไม่ระบุชื่อ', triggerOutputs()?['body/SubmittedBy']), '<br><b>อีเมล:</b> ', coalesce(triggerOutputs()?['body/SubmittedEmail'], '-'), '<br><b>ส่งเมื่อ:</b> ', formatDateTime(triggerOutputs()?['body/Created'], 'dd/MM/yyyy HH:mm'), '<br><br><b>รายละเอียด</b><br>', replace(coalesce(triggerOutputs()?['body/Content'], '-'), decodeUriComponent('%0A'), '<br>'), '<br><br>เปิดดูและบันทึกการดำเนินการได้ที่ <a href="https://ppg2014.github.io/prime-power-intranet/#/admin">หน้าจัดการข้อมูล → ความคิดเห็นที่ได้รับ</a>')
```

**Save** แล้วกด **Test → Manually** → ไปหน้าติดต่อในเว็บ ส่งความคิดเห็นทดสอบ 1 ใบ → ตรวจกล่องจดหมาย

---

## หมายเหตุ
- ถ้าผู้ส่งติ๊ก **"ไม่ต้องการระบุชื่อผู้เสนอ"** อีเมลจะขึ้นว่า "ไม่ระบุชื่อ" ตามที่ผู้ส่งเลือก — ระบบไม่เปิดเผยชื่อให้
- อยากให้ส่งเข้า Teams ด้วย เพิ่ม **Post message in a chat or channel** ต่อท้ายในสาขา True โดยใช้ Recipient สูตรเดียวกับ To
- ถ้าไม่ได้ตั้งค่า `FeedbackRecipients` โฟลว์จะจบเงียบ ๆ ไม่ error
