/**
 * แผนผังองค์กร (แท็บ "แผนผังองค์กร" ในหน้าบุคลากร)
 *
 * วาดตามผังฉบับประกาศ (ประกาศ ณ วันที่ 5 สิงหาคม พ.ศ.2569) ให้เหมือนต้นฉบับทุกตำแหน่ง
 * พิกัดทุกกล่องวัดจากไฟล์ต้นฉบับขนาด 2000 × 1415 px — ห้ามขยับเอง
 * ถ้าผังองค์กรเปลี่ยน ให้แก้รายการ BOXES / เส้นเชื่อม ตามฉบับประกาศใหม่
 *
 * วาดเป็น SVG (ไม่ใช่รูป) เพื่อให้ตัวหนังสือคมทุกขนาดจอ และกดแต่ละกล่องได้
 *   กดฝ่าย/แผนก → รายชื่อบุคลากรในหน่วยนั้น · กดตำแหน่งผู้บริหาร → ข้อมูลผู้ดำรงตำแหน่ง
 */
import { esc } from '../core/dom.js';

const W = 2000;
const H = 1415;

/* สีตามต้นฉบับ */
const C = {
  exec: '#004f7a',      // ประธาน รองประธาน กรรมการผู้จัดการ
  dept: '#0081ce',      // ฝ่าย / เลขานุการ
  dir: '#0076b5',       // ผู้อำนวยการ
  line: '#26516d',
  title: '#22537a',
};

/**
 * กล่องทั้งหมด [x, y, w, h, ชนิด, บรรทัดภาษาไทย, บรรทัดภาษาอังกฤษ]
 * ชนิด: exec | dept | dir | sec (ไล่สีฟ้าอมเขียว→เขียว) | top-sec (ไล่สี ตัวใหญ่) | pm
 */
const BOXES = [
  // ── ผู้บริหาร
  [969, 94, 203, 59, 'exec', ['ประธานบริษัท'], ['PRESIDENT']],
  [523, 205, 290, 65, 'exec', ['รองประธานด้านปฏิบัติการ'], ['VICE PRESIDENT OF OPERATIONS']],
  [1366, 208, 292, 65, 'exec', ['รองประธานด้านการเงิน'], ['VICE PRESIDENT OF FINANCE']],
  [969, 254, 203, 62, 'exec', ['กรรมการผู้จัดการ'], ['MANAGING DIRECTOR']],
  [523, 327, 429, 58, 'dept', ['ฝ่ายระบบบริหารคุณภาพ'], ['QUALITY MANAGEMENT SYSTEM DEPARTMENT']],
  [1386, 354, 390, 58, 'dept', ['เลขานุการกรรมการผู้จัดการ'], ['SECRETARY TO THE MANAGING DIRECTOR']],
  [329, 433, 356, 58, 'top-sec', ['แผนกระบบมาตรฐานและการรับรอง'], ['STANDARD AND CERTIFICATION DIVISION'], 'ฝ่ายระบบบริหารคุณภาพ'],
  [708, 433, 335, 83, 'top-sec', ['แผนกตรวจประเมินและควบคุมคุณภาพโครงการ'], ['PROJECT QUALITY AUDIT', 'AND CONTROL DIVISION'], 'ฝ่ายระบบบริหารคุณภาพ'],
  [1451, 456, 291, 58, 'top-sec', ['ผู้ช่วยเลขานุการ'], ['ASSISTANT SECRETARY']],

  // ── ผู้อำนวยการ
  [172, 624, 489, 78, 'dir', ['ผู้อำนวยการด้านวิศวกรรมและพัฒนาธุรกิจ'], ['DIRECTOR OF ENGINEERING AND BUSINESS', 'DEVELOPMENT']],
  [748, 625, 515, 79, 'dir', ['ผู้อำนวยการด้านบริหารโครงการและควบคุมการเดินระบบ'], ['DIRECTOR OF PROJECT MANAGEMENT AND SYSTEM', 'OPERATION']],
  [1485, 624, 416, 78, 'dir', ['ผู้อำนวยการด้านการเงินและสนับสนุนองค์กร'], ['DIRECTOR OF FINANCE AND CORPORATE', 'SERVICES']],

  // ── ฝ่าย
  [23, 761, 135, 141, 'dept', ['ฝ่ายขาย', 'และการตลาด'], ['SALES AND', 'MARKETING', 'DEPARTMENT']],
  [175, 757, 153, 146, 'dept', ['ฝ่ายวิศวกรรม', 'และพัฒนาโครงการ'], ['ENGINEERING', 'AND PROJECT', 'DEVELOPMENT', 'DEPARTMENT']],
  [347, 760, 137, 143, 'dept', ['ฝ่ายเขียนแบบ'], ['DRAWING', 'DEPARTMENT']],
  [499, 760, 142, 146, 'dept', ['ฝ่ายจัดซื้อ', 'และคลังสินค้า'], ['PROCUREMENT', 'AND', 'WAREHOUSE', 'DEPARTMENT']],
  [655, 760, 150, 147, 'dept', ['ฝ่ายขออนุญาต', 'และใบอนุญาต'], ['PERMITTING', 'AND LICENSING', 'DEPARTMENT']],
  [820, 761, 149, 141, 'dept', ['ฝ่ายบริหารโครงการ'], ['PROJECT', 'MANAGEMENT', 'DEPARTMENT']],
  [983, 759, 180, 140, 'dept', ['ฝ่ายควบคุมการเดินระบบ', 'และบำรุงรักษา'], ['SYSTEM OPERATION', 'AND MAINTENANCE', 'DEPARTMENT']],
  [1179, 758, 223, 141, 'dept', ['ฝ่ายความปลอดภัย อาชีวอนามัย', 'และสิ่งแวดล้อม'], ['HEALTH, SAFETY AND', 'ENVIRONMENT', 'DEPARTMENT']],
  [1418, 756, 165, 143, 'dept', ['ฝ่ายบัญชีและการเงิน'], ['ACCOUNTING AND', 'FINANCE', 'DEPARTMENT']],
  [1600, 757, 171, 142, 'dept', ['ฝ่ายทรัพยากรบุคคล'], ['HUMAN RESOURCE', 'DEPARTMENT']],
  [1791, 757, 185, 142, 'dept', ['ฝ่ายประสานงาน', 'และอำนวยการ'], ['COORDINATION AND', 'ADMINISTRATION', 'DEPARTMENT']],

  // ── แผนก: ฝ่ายขายและการตลาด
  [47, 918, 106, 105, 'sec', ['แผนก', 'ขายโครงการ'], ['PROJECT', 'SALES', 'DIVISION'], 'ฝ่ายขายและการตลาด'],
  [46, 1039, 107, 86, 'sec', ['แผนกขายสินค้า'], ['PRODUCT', 'SALES', 'DIVISION'], 'ฝ่ายขายและการตลาด'],
  [47, 1141, 105, 67, 'sec', ['แผนกการตลาด'], ['MARKETING', 'DIVISION'], 'ฝ่ายขายและการตลาด'],
  // ฝ่ายวิศวกรรมและพัฒนาโครงการ
  [199, 918, 124, 86, 'sec', ['แผนกพัฒนาโครงการ'], ['PROJECT', 'DEVELOPMENT', 'DIVISION'], 'ฝ่ายวิศวกรรมและพัฒนาโครงการ'],
  [201, 1020, 122, 86, 'sec', ['แผนกวิศวกรรมไฟฟ้า'], ['ELECTRICAL', 'ENGINEERING', 'DIVISION'], 'ฝ่ายวิศวกรรมและพัฒนาโครงการ'],
  [202, 1122, 119, 86, 'sec', ['แผนกวิศวกรรมโยธา'], ['CIVIL', 'ENGINEERING', 'DIVISION'], 'ฝ่ายวิศวกรรมและพัฒนาโครงการ'],
  // ฝ่ายเขียนแบบ
  [366, 918, 116, 123, 'sec', ['แผนกเขียนแบบ', 'นำเสนอโครงการ'], ['PROPOSAL AND', 'CONCEPTUAL', 'DRAWING', 'DIVISION'], 'ฝ่ายเขียนแบบ'],
  [367, 1050, 117, 105, 'sec', ['แผนก', 'เขียนแบบก่อสร้าง'], ['CONSTRUCTION', 'DRAWING', 'DIVISION'], 'ฝ่ายเขียนแบบ'],
  [366, 1162, 116, 86, 'sec', ['แผนกเขียนแบบ', 'โยธา'], ['CIVIL DRAWING', 'DIVISION'], 'ฝ่ายเขียนแบบ'],
  // ฝ่ายจัดซื้อและคลังสินค้า
  [521, 918, 120, 105, 'sec', ['แผนกจัดซื้อ', 'ภายในประเทศ'], ['LOCAL', 'PROCUREMENT', 'DIVISION'], 'ฝ่ายจัดซื้อและคลังสินค้า'],
  [523, 1037, 122, 104, 'sec', ['แผนกจัดซื้อ', 'ต่างประเทศ'], ['OVERSEAS', 'PROCUREMENT', 'DIVISION'], 'ฝ่ายจัดซื้อและคลังสินค้า'],
  [524, 1157, 122, 104, 'sec', ['แผนกนำเข้า', 'และการจัดการขนส่ง'], ['IMPORT &', 'LOGISTICS', 'DIVISION'], 'ฝ่ายจัดซื้อและคลังสินค้า'],
  [523, 1276, 123, 74, 'sec', ['แผนกคลังสินค้า'], ['WAREHOUSE', 'DIVISION'], 'ฝ่ายจัดซื้อและคลังสินค้า'],
  // ฝ่ายขออนุญาตและใบอนุญาต
  [679, 918, 130, 134, 'sec', ['แผนกงานขออนุญาต', 'และใบอนุญาต', '(เขตพื้นที่ทั่วไป)'], ['PERMITTING AND', 'LICENSING', 'DIVISION', '(GENERAL AREA)'], 'ฝ่ายขออนุญาตและใบอนุญาต'],
  [680, 1070, 130, 151, 'sec', ['แผนกงานขออนุญาต', 'และใบอนุญาต', '(เขตนิคมอุตสาหกรรม)'], ['PERMITTING AND', 'LICENSING', 'DIVISION', '(INDUSTRIAL', 'ESTATE AREA)'], 'ฝ่ายขออนุญาตและใบอนุญาต'],
  // ฝ่ายบริหารโครงการ
  [841, 918, 137, 57, 'pm', ['ผู้จัดการโครงการ 1'], ['PROJECT MANAGER 1'], 'ฝ่ายบริหารโครงการ'],
  [840, 989, 136, 58, 'pm', ['ผู้จัดการโครงการ 2'], ['PROJECT MANAGER 2'], 'ฝ่ายบริหารโครงการ'],
  [838, 1060, 137, 58, 'pm', ['ผู้จัดการโครงการ 3'], ['PROJECT MANAGER 3'], 'ฝ่ายบริหารโครงการ'],
  [838, 1134, 137, 58, 'pm', ['ผู้จัดการโครงการ 4'], ['PROJECT MANAGER 4'], 'ฝ่ายบริหารโครงการ'],
  [838, 1205, 137, 58, 'pm', ['ผู้จัดการโครงการ 5'], ['PROJECT MANAGER 5'], 'ฝ่ายบริหารโครงการ'],
  // ฝ่ายควบคุมการเดินระบบและบำรุงรักษา
  [1008, 913, 164, 80, 'sec', ['แผนก', 'ควบคุมการเดินระบบ'], ['SYSTEM OPERATION', 'DIVISION'], 'ฝ่ายควบคุมการเดินระบบและบำรุงรักษา'],
  [1008, 1011, 163, 81, 'sec', ['แผนก', 'บำรุงรักษา (ส่วนกลาง)'], ['MAINTENANCE DIVISION', '(CENTRAL REGION)'], 'ฝ่ายควบคุมการเดินระบบและบำรุงรักษา'],
  [1011, 1112, 160, 80, 'sec', ['แผนก', 'บำรุงรักษา (ภาคตะวันออก)'], ['MAINTENANCE DIVISION', '(EASTERN REGION)'], 'ฝ่ายควบคุมการเดินระบบและบำรุงรักษา'],
  [1008, 1209, 166, 81, 'sec', ['แผนก', 'ควบคุมคุณภาพงานติดตั้ง'], ['INSTALLATION QUALITY', 'CONTROL DIVISION'], 'ฝ่ายควบคุมการเดินระบบและบำรุงรักษา'],
  [1012, 1299, 162, 99, 'sec', ['แผนก', 'ทดสอบและเริ่มเดินระบบ'], ['TEST AND', 'COMMISSIONING', 'DIVISION'], 'ฝ่ายควบคุมการเดินระบบและบำรุงรักษา'],
  // ฝ่ายความปลอดภัย อาชีวอนามัยและสิ่งแวดล้อม
  [1215, 918, 163, 70, 'sec', ['แผนก HSE (ส่วนกลาง)'], ['HSE DIVISION', '(CENTRAL REGION)'], 'ฝ่ายความปลอดภัย อาชีวอนามัยและสิ่งแวดล้อม'],
  [1216, 1017, 161, 67, 'sec', ['แผนก HSE (ภาคตะวันออก)'], ['HSE DIVISION', '(EASTERN REGION)'], 'ฝ่ายความปลอดภัย อาชีวอนามัยและสิ่งแวดล้อม'],
  // ฝ่ายบัญชีและการเงิน
  [1443, 918, 138, 67, 'sec', ['แผนกบัญชี'], ['ACCOUNTING', 'DIVISION'], 'ฝ่ายบัญชีและการเงิน'],
  [1443, 1015, 143, 67, 'sec', ['แผนกการเงิน'], ['FINANCE', 'DIVISION'], 'ฝ่ายบัญชีและการเงิน'],
  // ฝ่ายทรัพยากรบุคคล
  [1627, 913, 140, 104, 'sec', ['แผนกบริหาร', 'ทรัพยากรบุคคล'], ['HUMAN RESOURCE', 'MANAGEMENT', 'DIVISION'], 'ฝ่ายทรัพยากรบุคคล'],
  [1626, 1025, 141, 105, 'sec', ['แผนกพัฒนา', 'และยกระดับบุคลากร'], ['HUMAN RESOURCE', 'DEVELOPMENT', 'DIVISION'], 'ฝ่ายทรัพยากรบุคคล'],
  // ฝ่ายประสานงานและอำนวยการ
  [1823, 918, 155, 85, 'sec', ['แผนกอำนวยการสำนักงาน'], ['OFFICE', 'ADMINISTRATION', 'DIVISION'], 'ฝ่ายประสานงานและอำนวยการ'],
  [1821, 1022, 157, 124, 'sec', ['แผนกประสานงาน', 'และอำนวยการโครงการ'], ['PROJECT', 'COORDINATION AND', 'ADMINISTRATION', 'DIVISION'], 'ฝ่ายประสานงานและอำนวยการ'],
  [1821, 1165, 155, 86, 'sec', ['แผนกเทคโนโลยีสารสนเทศ'], ['INFORMATION', 'TECHNOLOGY', 'DIVISION'], 'ฝ่ายประสานงานและอำนวยการ'],
];

/* ขนาดตัวอักษร/ระยะบรรทัด ตามชนิดกล่อง (หน่วย px ของต้นฉบับ) */
const TYPE = {
  exec: [17.2, 22], dept: [17.2, 22.6], dir: [17.2, 22], 'top-sec': [17.2, 23], sec: [13, 18.8], pm: [11.8, 16.5],
};

/* แผนกในฝ่าย: เส้นตั้งด้านซ้ายของฝ่าย แล้วแตกขีดสั้นไปหาแต่ละแผนก (พิกัด x ของเส้นตั้ง) */
const SEC_SPINE = {
  'ฝ่ายขายและการตลาด': 29,
  'ฝ่ายวิศวกรรมและพัฒนาโครงการ': 184,
  'ฝ่ายเขียนแบบ': 350,
  'ฝ่ายจัดซื้อและคลังสินค้า': 506,
  'ฝ่ายขออนุญาตและใบอนุญาต': 663,
  'ฝ่ายบริหารโครงการ': 826,
  'ฝ่ายควบคุมการเดินระบบและบำรุงรักษา': 993,
  'ฝ่ายความปลอดภัย อาชีวอนามัยและสิ่งแวดล้อม': 1198,
  'ฝ่ายบัญชีและการเงิน': 1425,
  'ฝ่ายทรัพยากรบุคคล': 1609,
  'ฝ่ายประสานงานและอำนวยการ': 1802,
};

const R = 9;   // รัศมีมุมโค้งของเส้น

/** เส้นหักมุมโค้ง ผ่านจุดตามลำดับ */
function path(pts, arrow = false) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i += 1) {
    const [x, y] = pts[i];
    const next = pts[i + 1];
    if (!next) { d += ` L${x},${y}`; break; }
    const [px, py] = pts[i - 1];
    const inX = Math.sign(x - px), inY = Math.sign(y - py);
    const outX = Math.sign(next[0] - x), outY = Math.sign(next[1] - y);
    d += ` L${x - inX * R},${y - inY * R} Q${x},${y} ${x + outX * R},${y + outY * R}`;
  }
  return `<path d="${d}"${arrow ? ' marker-end="url(#cc-arrow)"' : ''}/>`;
}

/** เส้นเชื่อมทั้งหมดตามต้นฉบับ */
function connectors() {
  const out = [
    // ประธาน → กรรมการผู้จัดการ และแยกซ้าย-ขวาไปรองประธาน
    path([[1078, 153], [1078, 254]]),
    path([[1078, 174], [669, 174], [669, 203]], true),
    path([[1078, 174], [1538, 174], [1538, 206]], true),
    // กรรมการผู้จัดการ → ลำต้นหลัก
    path([[1080, 316], [1080, 553]]),
    // → ฝ่ายระบบบริหารคุณภาพ และแผนกใต้ฝ่าย
    path([[1080, 358], [955, 358]], true),
    path([[715, 385], [715, 404]]),
    path([[715, 404], [508, 404], [508, 431]], true),
    path([[715, 404], [875, 404], [875, 431]], true),
    // → เลขานุการ → ผู้ช่วยเลขานุการ
    path([[1172, 293], [1582, 293], [1582, 352]], true),
    path([[1584, 412], [1584, 454]], true),
    // ลำต้นหลัก → ผู้อำนวยการ 3 ท่าน และฝ่ายความปลอดภัยฯ (ขึ้นตรงกรรมการผู้จัดการ)
    path([[1080, 553], [418, 553], [418, 622]], true),
    path([[1080, 553], [1691, 553], [1691, 622]], true),
    path([[985, 553], [985, 623]], true),
    path([[1290, 553], [1290, 756]], true),
    // ผู้อำนวยการด้านวิศวกรรมฯ → 5 ฝ่าย
    path([[416, 702], [416, 758]], true),
    path([[416, 719], [90, 719], [90, 759]], true),
    path([[416, 719], [730, 719], [730, 758]], true),
    path([[259, 719], [259, 755]], true),
    path([[567, 719], [567, 758]], true),
    // ผู้อำนวยการด้านบริหารโครงการฯ → 2 ฝ่าย
    path([[985, 704], [985, 719]]),
    path([[985, 719], [881, 719], [881, 759]], true),
    path([[985, 719], [1072, 719], [1072, 757]], true),
    // ผู้อำนวยการด้านการเงินฯ → 3 ฝ่าย
    path([[1693, 702], [1693, 755]], true),
    path([[1693, 716], [1508, 716], [1508, 754]], true),
    path([[1693, 716], [1884, 716], [1884, 755]], true),
  ];
  // ฝ่าย → แผนก: เส้นตั้ง + ขีดสั้นเข้าแต่ละแผนก
  Object.entries(SEC_SPINE).forEach(([dept, x]) => {
    const d = BOXES.find((b) => b[4] === 'dept' && b[5].join('') === dept);
    const secs = BOXES.filter((b) => b[7] === dept);
    if (!d || !secs.length) return;
    const ys = secs.map((b) => Math.round(b[1] + b[3] / 2));
    out.push(path([[x, d[1] + d[3]], [x, Math.max(...ys)]]));
    ys.forEach((y) => out.push(`<path d="M${x},${y} L${x + 11},${y}"/>`));
  });
  return out.join('');
}

/**
 * ผู้ดำรงตำแหน่งผู้บริหาร — ไม่แสดงบนผัง ใช้ตอนคลิกกล่องเพื่อเปิดข้อมูลคนนั้น (ไม่แก้ข้อมูลในทะเบียนบุคลากร)
 * ค่าว่าง = ตำแหน่งว่าง · ไม่อยู่ในรายการนี้ = ไม่แสดงชื่อ (คลิกแล้วหาจากช่องตำแหน่งในทะเบียน)
 */
export const HOLDERS = {
  'ประธานบริษัท': 'ไพรัช เขียนเขว้า',
  'กรรมการผู้จัดการ': '',
  'รองประธานด้านปฏิบัติการ': 'อาทิตย์ กรแก้ว',
  'รองประธานด้านการเงิน': 'กานต์ธิดา ใสสะอาด',
};

const unitName = (b) => (b[4] === 'pm' ? b[7] : b[5].join(''));

/** ตัวหนังสือในกล่อง จัดกลางแนวตั้ง-แนวนอน */
function label(b) {
  const [x, y, w, h, kind, th, en] = b;
  const [fs, lh] = TYPE[kind];
  const lines = [...th, ...en];
  const top = y + h / 2 - ((lines.length - 1) * lh) / 2;
  const cx = x + w / 2;
  return `<text x="${cx}" y="${top}" font-size="${fs}" dominant-baseline="central" data-w="${w - 8}">${lines.map((t, i) =>
    `<tspan x="${cx}" y="${(top + i * lh).toFixed(1)}"${i < th.length ? ' class="th"' : ''}>${esc(t)}</tspan>`).join('')}</text>`;
}

function box(b, i) {
  const [x, y, w, h, kind] = b;
  const fill = kind === 'exec' ? C.exec : kind === 'dir' ? C.dir : kind === 'dept' ? C.dept : 'url(#cc-grad)';
  // ชื่อขึ้นต้น "ฝ่าย" = รายชื่อทั้งฝ่าย · "แผนก" = รายชื่อในแผนก · ผู้จัดการโครงการ = ฝ่ายบริหารโครงการ
  // นอกนั้นเป็นตำแหน่ง (ประธาน รองประธาน กรรมการผู้จัดการ ผู้อำนวยการ เลขานุการ) → ข้อมูลผู้ดำรงตำแหน่ง
  const name = unitName(b);
  const attrs = /^ฝ่าย/.test(name) ? `data-ccunit="${esc(name)}"`
    : /^แผนก/.test(name) ? `data-ccunit="${esc(b[7] || '')}" data-ccsec="${esc(name)}"`
    : `data-ccpos="${esc(name)}"`;
  return `<g class="cc-box cc-${kind}" ${attrs} data-i="${i}" tabindex="0" role="button"
      aria-label="${esc([...b[5], ...b[6]].join(' '))}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>
    ${label(b)}</g>`;
}

/** HTML ของแผนผัง (SVG ขนาดต้นฉบับ ย่อ-ขยายตามความกว้างจอ) */
export function renderCompanyChart({ officialUrl = '' } = {}) {
  return `
    <div class="cc-bar">
      <span class="cc-hint">คลิกฝ่ายหรือแผนกเพื่อดูรายชื่อบุคลากร · คลิกตำแหน่งผู้บริหารเพื่อดูข้อมูลผู้ดำรงตำแหน่ง<span class="cc-swipe"> · ↔ เลื่อนซ้าย-ขวาในกรอบเพื่อดูทั้งผัง</span></span>
      ${officialUrl ? `<a class="btn-mini" href="${esc(officialUrl)}" target="_blank" rel="noopener">📄 ผังองค์กรฉบับประกาศ</a>` : ''}
    </div>
    <div class="cc-scroll">
      <svg class="company-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="แผนผังองค์กร Company Organizational Chart">
        <defs>
          <linearGradient id="cc-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#f6fcfc"/><stop offset="1" stop-color="#ecf3ff"/>
          </linearGradient>
          <linearGradient id="cc-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#0099ae"/><stop offset="1" stop-color="#7ad85a"/>
          </linearGradient>
          <marker id="cc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2"
                  orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M1,1 L8,5 L1,9" fill="none" stroke="${C.line}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </marker>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#cc-bg)"/>
        <text class="cc-title" x="1037" y="47" text-anchor="middle" dominant-baseline="central"
              textLength="786" lengthAdjust="spacingAndGlyphs">COMPANY ORGANIZATIONAL CHART</text>
        <g class="cc-lines">${connectors()}</g>
        <g class="cc-boxes">${BOXES.map(box).join('')}</g>
        <g class="cc-sign">
          <text x="1638" y="1310" text-anchor="middle" dominant-baseline="central">นายไพรัช เขียนเขว้า</text>
          <text x="1638" y="1343" text-anchor="middle" dominant-baseline="central">กรรมการผู้จัดการ</text>
          <text x="1638" y="1376" text-anchor="middle" dominant-baseline="central">ประกาศ ณ วันที่ 5 สิงหาคม พ.ศ.2569</text>
        </g>
      </svg>
    </div>`;
}

/**
 * ผูกการคลิกกล่องในผัง
 * onUnit(ฝ่าย, แผนก) · onPosition(ชื่อตำแหน่ง) — คืน false ถ้าหาผู้ดำรงตำแหน่งไม่เจอ
 */
export function bindCompanyChart(root, { onUnit, onPosition }) {
  // บรรทัดที่ยาวเกินกล่อง (แล้วแต่ฟอนต์ของเครื่อง) บีบให้พอดีกรอบ ไม่ล้นออกนอกกล่องเหมือนต้นฉบับ
  const fit = () => root.querySelectorAll('.cc-box text').forEach((t) => {
    const max = +t.dataset.w;
    t.querySelectorAll('tspan').forEach((s) => {
      s.removeAttribute('textLength');
      if (s.getComputedTextLength() > max) {
        s.setAttribute('textLength', max);
        s.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
  });
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  root.querySelectorAll('.cc-box').forEach((g) => {
    const go = () => {
      if (g.dataset.ccpos !== undefined) return onPosition(g.dataset.ccpos);
      return onUnit(g.dataset.ccunit, g.dataset.ccsec || '');
    };
    g.addEventListener('click', go);
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
  });
}
