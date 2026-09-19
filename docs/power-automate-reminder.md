# โฟลว์ตัวที่ 2 — เตือนคำขอค้าง (ส่งทุกเช้าวันทำการ)

> โฟลว์นี้**แยกจากโฟลว์อนุมัติ** ไม่แตะของเดิมเลย ถ้าลบทิ้งทีหลังก็ไม่กระทบระบบอนุมัติ
> ทำงาน: ทุกเช้า 08:30 ไล่ดูคำขอที่ยังรออนุมัติเกิน 2 วัน แล้วส่งเตือน **ผู้อนุมัติที่ถือคำขออยู่** และแจ้ง **ผู้ยื่น** ว่าค้างที่ใคร
> ใช้ข้อมูลที่เว็บเตรียมไว้ให้แล้ว (`CurrentApprovers`) จึงไม่ต้องค้นหาผู้อนุมัติซ้ำ — มีแค่ 7 กล่อง

---

## กล่อง 1 — ตัวจับเวลา
**Create → Scheduled cloud flow** → ชื่อ `Prime Power - เตือนคำขอค้าง`
- ทำซ้ำทุก **1 วัน** เวลา **08:30**
- ในกล่อง Recurrence กด **Show all** → **On these days** เลือก จันทร์–ศุกร์ · **Time zone** = Bangkok

## กล่อง 2 — ดึงคำขอที่ยังรออนุมัติ
**+** → **Get items** (SharePoint) → Rename `waiting`
- Site = Intranet_Prime Power · List = `Requests`
- **Filter Query** (พิมพ์ในช่องปกติ):
```
Status eq 'รออนุมัติ'
```
- **Top Count** `500`

## กล่อง 3 — คัดเฉพาะที่ค้างเกิน 2 วัน
**+** → **Filter array** → Rename `overdue`
- From (fx): `outputs('waiting')?['body/value']`
- กด **Edit in advanced mode** แล้ววาง:
```
@and(less(item()?['SubmittedDate'], addDays(utcNow(), -2)), not(empty(item()?['CurrentApprovers'])))
```
> `-2` คือค้างเกิน 2 วัน ปรับเป็น `-3` หรือ `-1` ได้ตามต้องการ
> เงื่อนไขหลังกันกรณีไม่มีอีเมลผู้อนุมัติ (จะส่งไม่ได้อยู่แล้ว)

## กล่อง 4 — วนทีละใบ
**+** → **Apply to each** → เลือกเอาต์พุต (fx): `body('overdue')`

**กล่อง 5–7 อยู่ข้างในลูปนี้ทั้งหมด**

## กล่อง 5 — เตือนผู้อนุมัติ (อีเมล)
**Send an email (V2)** → Rename `mailApprover`
- **To** (fx): `items('Apply_to_each')?['CurrentApprovers']`
- **Subject** (fx):
```
concat('[เตือน] คำขอรออนุมัติ ', items('Apply_to_each')?['Title'])
```
- **Body** (fx):
```
concat('คำขอนี้รอการพิจารณาของคุณอยู่<br><br>เลขที่: ', items('Apply_to_each')?['Title'], '<br>ผู้ยื่น: ', coalesce(items('Apply_to_each')?['RequesterName'], '-'), '<br>ยื่นเมื่อ: ', formatDateTime(items('Apply_to_each')?['SubmittedDate'], 'dd/MM/yyyy'), '<br>ค้างมาแล้ว: ', string(div(sub(ticks(utcNow()), ticks(items('Apply_to_each')?['SubmittedDate'])), 864000000000)), ' วัน<br><br>', coalesce(items('Apply_to_each')?['SummaryText'], ''), '<br><br><a href="https://ppg2014.github.io/prime-power-intranet/#/requests">เปิดดูคำขอ</a><br>หรือกดอนุมัติจากการ์ดใน Teams ได้เลย')
```

## กล่อง 6 — เตือนผู้อนุมัติ (Teams)
**Post message in a chat or channel** → Rename `teamsApprover`
- Post as **Flow bot** · Post in **Chat with Flow bot**
- **Recipient** (fx): `items('Apply_to_each')?['CurrentApprovers']`
- **Message** (fx):
```
concat('⏰ คำขอ ', items('Apply_to_each')?['Title'], ' รออนุมัติของคุณมา ', string(div(sub(ticks(utcNow()), ticks(items('Apply_to_each')?['SubmittedDate'])), 864000000000)), ' วันแล้ว — กดอนุมัติได้จากการ์ดเดิม หรือที่ https://ppg2014.github.io/prime-power-intranet/#/requests')
```

## กล่อง 7 — แจ้งผู้ยื่นว่าค้างที่ใคร
**Send an email (V2)** → Rename `mailRequester`
- **To** (fx): `items('Apply_to_each')?['RequesterEmail']`
- **Subject** (fx): `concat('คำขอ ', items('Apply_to_each')?['Title'], ' ยังรออนุมัติ')`
- **Body** (fx):
```
concat('คำขอของคุณยังรอการพิจารณาอยู่ที่ลำดับ ', string(items('Apply_to_each')?['CurrentStep']), '<br>ผู้อนุมัติ: ', items('Apply_to_each')?['CurrentApprovers'], '<br>ระบบได้ส่งเตือนให้แล้ว')
```
> ถ้าไม่อยากรบกวนผู้ยื่นทุกวัน ลบกล่องนี้ทิ้งได้ หรือเปลี่ยนตัวจับเวลาเป็นสัปดาห์ละครั้ง

**Save** แล้วกด **Test → Manually** เพื่อลองยิงทันที ไม่ต้องรอเช้าวันถัดไป

---

## ข้อควรรู้
- โฟลว์นี้**อ่านอย่างเดียว ไม่แก้ข้อมูลคำขอ** จึงไม่ไปกวนโฟลว์อนุมัติและไม่ทำให้เกิดการวนซ้ำ
- ถ้าคำขอไม่มี `CurrentApprovers` จะถูกข้าม ให้ไปดูที่หน้า **ตรวจสุขภาพระบบ** ว่าติดเพราะอะไร
- อยากให้เตือนเฉพาะใบที่เกินกำหนดของฟอร์ม แทนการนับ 2 วันเท่ากันหมด ค่อยเพิ่มคอลัมน์ DueDate ทีหลังแล้วแก้เงื่อนไขในกล่อง 3
