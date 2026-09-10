/**
 * ทะเบียนชุดข้อมูลสำหรับหน้าจัดการข้อมูล
 * บอกว่าแต่ละชุดเก็บใน List ไหน ตารางแสดงคอลัมน์อะไร และฟอร์มแก้ไขมีช่องอะไร
 *
 * เพิ่มชุดข้อมูลใหม่ = เพิ่มหนึ่งก้อนในไฟล์นี้ ไม่ต้องแก้หน้า admin
 *
 * ชนิดช่อง: text | textarea | number | choice | lookup | yesno
 */
export const SCHEMA = {
  departments: {
    title: 'หน่วยงานและเบอร์ต่อ', icon: '📞', list: 'departments', spName: 'Departments', sortField: 'SortOrder',
    hint: 'ลำดับในตารางนี้คือลำดับที่แสดงบนหน้าบุคลากร หน้าแบบฟอร์ม และสมุดโทรศัพท์',
    columns: ['Title', 'Extension'],
    labels:  { Title: 'ชื่อหน่วยงาน', Extension: 'เบอร์ต่อ' },
    fields: [
      { key: 'Title', label: 'ชื่อหน่วยงาน', type: 'text', required: true },
      { key: 'Extension', label: 'เบอร์ต่อ', type: 'text', help: 'เว้นว่างได้หากยังไม่มีเบอร์' },
      { key: 'IsActive', label: 'เปิดใช้งาน', type: 'yesno' },
    ],
  },

  sections: {
    title: 'แผนก', icon: '🗂', list: 'sections', spName: 'Sections', sortField: 'SortOrder',
    hint: 'ทะเบียนแผนกย่อยภายในฝ่าย ใช้เป็นตัวเลือกในหน้าบุคลากร เพื่อไม่ให้พิมพ์ชื่อแผนกไม่ตรงกัน',
    columns: ['Title', 'Department'],
    labels: { Title: 'ชื่อแผนก', Department: 'อยู่ใต้ฝ่าย' },
    fields: [
      { key: 'Title', label: 'ชื่อแผนก', type: 'text', required: true,
        help: 'เช่น แผนกออกแบบระบบไฟฟ้า' },
      { key: 'Department', label: 'อยู่ใต้ฝ่าย', type: 'lookup', from: 'departments' },
      { key: 'IsActive', label: 'เปิดใช้งาน', type: 'yesno' },
    ],
  },

  projects: {
    title: 'โครงการ', icon: '🏗', list: 'projects', spName: 'Projects', sortField: 'SortOrder',
    hint: 'ทะเบียนโครงการ ใช้เป็นตัวเลือกให้บุคลากรในฝ่ายที่ทำงานแบบแยกตามโครงการ',
    columns: ['ProjectCode', 'Title', 'Department', 'Status'],
    labels: { ProjectCode: 'รหัสโครงการ', Title: 'ชื่อโครงการ',
              Department: 'ฝ่ายเจ้าของ', Status: 'สถานะ' },
    fields: [
      { key: 'ProjectCode', label: 'รหัสโครงการ', type: 'text', help: 'เช่น PJ-2569-01' },
      { key: 'Title', label: 'ชื่อโครงการ', type: 'text', required: true },
      { key: 'Department', label: 'ฝ่ายเจ้าของ', type: 'lookup', from: 'departments' },
      { key: 'Status', label: 'สถานะ', type: 'choice',
        options: ['เตรียมงาน', 'กำลังดำเนินการ', 'ส่งมอบแล้ว', 'ปิดโครงการ'] },
      { key: 'IsActive', label: 'แสดงเป็นตัวเลือก', type: 'yesno' },
    ],
  },

  directory: {
    title: 'บุคลากร', icon: '👥', list: 'directory', spName: 'Directory', sortField: 'SortOrder',
    hint: 'ลำดับนี้ใช้เรียงคนภายในฝ่ายเดียวกัน ส่วนลำดับของฝ่ายตั้งที่หน่วยงานและเบอร์ต่อ',
    columns: ['PhotoUrl', 'Title', 'Position', 'Department', 'Section', 'Project'],
    labels: { PhotoUrl: 'รูป', Title: 'ชื่อ-สกุล', Position: 'ตำแหน่ง',
              Department: 'ฝ่าย', Section: 'แผนก', Project: 'โครงการ' },
    fields: [
      { key: 'PhotoUrl', label: 'รูปภาพ', type: 'photo' },
      { key: 'Title', label: 'ชื่อ-สกุล (ไทย)', type: 'text', required: true },
      { key: 'Nickname', label: 'ชื่อเล่น', type: 'text' },
      { key: 'NameEN', label: 'ชื่อ-สกุล (อังกฤษ)', type: 'text' },
      { key: 'Position', label: 'ตำแหน่ง', type: 'text' },
      { key: 'Department', label: 'ฝ่าย', type: 'lookup', from: 'departments' },
      { key: 'Section', label: 'แผนก', type: 'lookup', from: 'sections',
        dependsOn: 'Department', matchField: 'Department', matchList: 'departments', allowEmpty: true,
        emptyHint: '— ฝ่ายนี้ยังไม่มีแผนกย่อย —',
        help: 'แสดงเฉพาะแผนกที่อยู่ใต้ฝ่ายที่เลือกไว้ · เพิ่มแผนกใหม่ได้ที่เมนู 🗂 แผนก' },
      { key: 'Project', label: 'โครงการ (เลือกได้หลายโครงการ)', type: 'multilookup', from: 'projects',
        dependsOn: 'Department', matchField: 'Department', matchList: 'departments',
        showIfDeptIn: 'ProjectDepartments',
        emptyHint: '— ฝ่ายนี้ยังไม่มีโครงการในทะเบียน —',
        help: 'ติ๊กได้หลายโครงการสำหรับคนที่ทำงานข้ามโครงการ · เพิ่มโครงการใหม่ได้ที่เมนู 🏗 โครงการ' },
      { key: 'Oversees', label: 'ดูแลฝ่าย (เลือกได้หลายฝ่าย)', type: 'multilookup', from: 'departments',
        help: 'ใช้กับผู้อำนวยการที่ดูแลมากกว่าหนึ่งฝ่าย ระบบจะแสดงบนสุดของทุกฝ่ายที่เลือก โดยเก็บข้อมูลไว้ที่เดียว' },
      { key: 'Level', label: 'ระดับในผังฝ่าย', type: 'choice',
        options: ['1 — ผู้อำนวยการฝ่าย / ผู้บริหารสูงสุด',
                  '2 — ผู้จัดการฝ่าย / รองผู้บริหาร',
                  '3 — รองผู้จัดการฝ่าย',
                  '4 — ผู้จัดการแผนก / เลขานุการ',
                  '5 — บุคลากรในแผนก'],
        help: 'ระดับ 1–4 แสดงกึ่งกลางเรียงจากบนลงล่าง ระดับ 5 เรียงเป็นตารางใต้ผัง' },
      { key: 'Email', label: 'อีเมล', type: 'text', help: 'name@primepower.co.th' },
      { key: 'Extension', label: 'เบอร์ต่อ', type: 'text' },
      { key: 'IsActive', label: 'ยังทำงานอยู่', type: 'yesno' },
    ],
  },

  formCatalog: {
    title: 'แบบฟอร์ม', icon: '📋', list: 'formCatalog', spName: 'FormCatalog', sortField: 'SortOrder',
    columns: ['Icon', 'FormCode', 'Title', 'Department', 'Badge'],
    labels: { Icon: 'ไอคอน', FormCode: 'รหัส', Title: 'ชื่อแบบฟอร์ม',
              Department: 'ฝ่าย', Badge: 'ป้ายกำกับ' },
    fields: [
      { key: 'Title', label: 'ชื่อแบบฟอร์ม', type: 'text', required: true },
      { key: 'FormCode', label: 'รหัสแบบฟอร์ม', type: 'text', help: 'เช่น FM-HR-001 ต้องไม่ซ้ำ' },
      { key: 'Icon', label: 'ไอคอน', type: 'text', help: 'วางอิโมจิได้ เช่น 📅 🔧 💰' },
      { key: 'Description', label: 'คำอธิบาย', type: 'textarea' },
      { key: 'Department', label: 'ฝ่ายเจ้าของ', type: 'lookup', from: 'departments' },
      { key: 'Badge', label: 'ป้ายกำกับ', type: 'choice',
        options: ['', 'ใช้บ่อย', 'ใหม่', 'ต้องอนุมัติ'] },
      { key: 'MetaTags', label: 'ข้อมูลย่อบนการ์ด', type: 'text',
        help: 'คั่นด้วยจุลภาค เช่น ⏱ 2 นาที, ✍ อนุมัติ 2 ขั้น' },
      { key: 'ExternalUrl', label: 'ลิงก์ระบบภายนอก', type: 'text',
        help: 'ใส่เมื่อฟอร์มอยู่คนละระบบ เว้นว่างถ้าเป็นฟอร์มในระบบนี้' },
      { key: 'IsActive', label: 'เปิดใช้งาน', type: 'yesno' },
    ],
  },

  policies: {
    title: 'นโยบายบริษัท', icon: '📕', list: 'policies', spName: 'Policies', sortField: 'SortOrder',
    columns: ['DocCode', 'Title', 'Revision', 'EffectiveDate'],
    labels: { DocCode: 'เลขที่', Title: 'ชื่อเอกสาร', Revision: 'ฉบับแก้ไข', EffectiveDate: 'ประกาศใช้' },
    fields: [
      { key: 'DocCode', label: 'เลขที่เอกสาร', type: 'text', help: 'เช่น PO-007' },
      { key: 'Title', label: 'ชื่อเอกสาร', type: 'text', required: true },
      { key: 'Revision', label: 'ฉบับแก้ไข', type: 'text', help: 'เช่น ฉบับที่ 3' },
      { key: 'EffectiveDate', label: 'วันที่ประกาศใช้', type: 'text', help: 'เช่น 12 ม.ค. 2569' },
      { key: 'Department', label: 'ฝ่ายเจ้าของ', type: 'lookup', from: 'departments' },
      { key: 'Content', label: 'เนื้อหานโยบาย', type: 'textarea',
        help: 'พิมพ์เนื้อหาเต็มได้ที่นี่ ผู้ใช้กดชื่อเอกสารแล้วจะเห็น' },
      { key: 'IsActive', label: 'ยังบังคับใช้', type: 'yesno' },
    ],
  },

  documents: {
    title: 'เอกสารและคู่มือ', icon: '📚', list: 'documents', spName: 'Documents', sortField: 'SortOrder',
    columns: ['Icon', 'Title', 'DocType', 'Department', 'LastUpdated'],
    labels: { Icon: 'ไอคอน', Title: 'ชื่อเอกสาร', DocType: 'ประเภท',
              Department: 'ฝ่าย', LastUpdated: 'อัปเดต' },
    fields: [
      { key: 'Title', label: 'ชื่อเอกสาร', type: 'text', required: true },
      { key: 'DocType', label: 'ประเภท', type: 'choice', options: ['คู่มือ', 'ไฟล์ดาวน์โหลด'] },
      { key: 'Department', label: 'ฝ่ายเจ้าของ', type: 'lookup', from: 'departments' },
      { key: 'Icon', label: 'ไอคอน', type: 'text' },
      { key: 'Description', label: 'คำอธิบาย', type: 'textarea' },
      { key: 'FileFormat', label: 'ชนิดไฟล์', type: 'text', help: 'เช่น PDF, XLSX, ZIP' },
      { key: 'FileSize', label: 'ขนาดไฟล์', type: 'text', help: 'เช่น 3.1 MB' },
      { key: 'LastUpdated', label: 'อัปเดตล่าสุด', type: 'text' },
      { key: 'IsActive', label: 'เปิดใช้งาน', type: 'yesno' },
    ],
  },

  news: {
    title: 'ข่าวประกาศ', icon: '📢', list: 'news', spName: 'News',
    columns: ['Title', 'PublishDate', 'IsPinned'],
    labels: { Title: 'หัวข้อ', PublishDate: 'วันที่', IsPinned: 'ปักหมุด' },
    fields: [
      { key: 'Title', label: 'หัวข้อประกาศ', type: 'text', required: true },
      { key: 'Content', label: 'เนื้อหา', type: 'textarea' },
      { key: 'PublishDate', label: 'วันที่ประกาศ', type: 'text', help: 'เช่น 2 กันยายน 2569' },
      { key: 'IsPinned', label: 'ปักหมุดไว้บนสุด', type: 'yesno' },
      { key: 'IsActive', label: 'แสดงบนหน้าแรก', type: 'yesno' },
    ],
  },

  announcements: {
    title: 'ประกาศเด้งหน้าแรก', icon: '🔔', list: 'announcements', spName: 'Announcements', sortField: 'SortOrder',
    columns: ['Title', 'AnnounceType', 'Department', 'PublishDate'],
    labels: { Title: 'หัวข้อ', AnnounceType: 'รูปแบบ', Department: 'ฝ่าย', PublishDate: 'วันที่' },
    fields: [
      { key: 'Title', label: 'หัวข้อประกาศ', type: 'text', required: true },
      { key: 'AnnounceType', label: 'รูปแบบประกาศ', type: 'choice',
        options: ['ข้อความ', 'รูปภาพเต็มใบ'],
        help: 'รูปภาพแนะนำ 1080 × 1350 px แนวตั้ง หรือ 1080 × 1080 px จัตุรัส ไม่เกิน 2 MB' },
      { key: 'Department', label: 'ฝ่ายที่ประกาศ', type: 'lookup', from: 'departments' },
      { key: 'Content', label: 'เนื้อหา', type: 'textarea' },
      { key: 'ImageUrl', label: 'รูปประกาศ', type: 'photo',
        help: 'แนะนำแนวตั้ง 1080 × 1350 px หรือจัตุรัส 1080 × 1080 px · ตัวหนังสือในรูปควรใหญ่พอที่จะอ่านบนมือถือ' },
      { key: 'PublishDate', label: 'วันที่ประกาศ', type: 'text' },
      { key: 'StartDate', label: 'เริ่มแสดง', type: 'text' },
      { key: 'EndDate', label: 'หยุดแสดง', type: 'text', help: 'ถึงวันนี้แล้วระบบจะซ่อนให้เอง' },
      { key: 'IsActive', label: 'แสดงบนหน้าแรก', type: 'yesno' },
    ],
  },

  rooms: {
    title: 'ห้องประชุม', icon: '📆', list: 'rooms', spName: 'Rooms', sortField: 'SortOrder',
    columns: ['Title', 'Location', 'Capacity'],
    labels: { Title: 'ชื่อห้อง', Location: 'ที่ตั้ง', Capacity: 'ความจุ' },
    fields: [
      { key: 'Title', label: 'ชื่อห้อง', type: 'text', required: true },
      { key: 'Location', label: 'ที่ตั้ง', type: 'text', help: 'เช่น อาคาร 2 ชั้น 1' },
      { key: 'Capacity', label: 'ความจุ (ที่นั่ง)', type: 'number' },
      { key: 'Equipment', label: 'อุปกรณ์ในห้อง', type: 'text', help: 'คั่นด้วย · เช่น จอ 65 นิ้ว · Teams' },
      { key: 'RoomMailbox', label: 'อีเมลของ Room Mailbox', type: 'text' },
      { key: 'PublishedCalendarUrl', label: 'ลิงก์ปฏิทินที่เผยแพร่', type: 'textarea' },
      { key: 'IsActive', label: 'เปิดให้จอง', type: 'yesno' },
    ],
  },

  settings: {
    title: 'ตั้งค่าระบบ', icon: '🛟', list: 'settings', spName: 'Settings',
    columns: ['Title', 'Value', 'Description'],
    labels: { Title: 'ชื่อค่า', Value: 'ค่า', Description: 'ความหมาย' },
    fields: [
      { key: 'Title', label: 'ชื่อค่า', type: 'text', required: true },
      { key: 'Value', label: 'ค่า', type: 'textarea' },
      { key: 'Description', label: 'ความหมาย', type: 'text' },
    ],
  },
};
