/**
 * แผนผังคอลัมน์ Lookup ของแต่ละ List
 *
 * SharePoint เก็บคอลัมน์ Lookup เป็นเลข id ในคีย์ที่ลงท้ายด้วย LookupId
 * ไม่ใช่ชื่อที่คนอ่าน เวลาอ่านจึงต้องแปลงเลขเป็นชื่อ
 * และเวลาเขียนต้องแปลงชื่อกลับเป็นเลข ไม่งั้น Graph จะตอบ invalidRequest
 *
 * รูปแบบ: ชื่อ List → { ชื่อคอลัมน์: [List ปลายทาง, เลือกได้หลายค่าหรือไม่] }
 */
export const LOOKUPS = {
  directory: {
    Department: ['departments', false],
    Section:    ['sections', false],
    Project:    ['projects', true],
    Oversees:   ['departments', true],
  },
  sections:      { Department: ['departments', false] },
  projects:      { Department: ['departments', false] },
  formCatalog:   { Department: ['departments', false] },
  policies:      { Department: ['departments', false] },
  documents:     { Department: ['departments', false] },
  announcements: { Department: ['departments', false] },
};
