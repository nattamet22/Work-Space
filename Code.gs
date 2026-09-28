/**
 * ================================================================
 * ระบบบริหารจัดการกำลังพล การฝึกอบรม และงานราชการ
 * Backend: Google Apps Script (อ่าน/เขียนข้อมูลใน Google Sheets)
 * ================================================================
 * วิธีติดตั้ง:
 * 1. สร้าง Google Sheets เปล่าๆ ขึ้นมาใหม่ 1 ไฟล์
 * 2. เมนู ส่วนขยาย (Extensions) > Apps Script
 * 3. วางไฟล์นี้ทับ Code.gs เดิม แล้วเพิ่มไฟล์ HTML ชื่อ "Index" (วางเนื้อหาจาก Index.html)
 * 4. บันทึก แล้วกลับไปที่หน้า Google Sheets แล้ว "รีเฟรชหน้าเว็บ" (สำคัญ!)
 *    จะมีเมนูใหม่ขึ้นชื่อ "⚙️ ตั้งค่าระบบ" โผล่ขึ้นมาข้างเมนู Help
 * 5. กดเมนู "⚙️ ตั้งค่าระบบ" > "1) สร้างโครงสร้างชีททั้งหมด"
 * 6. กดเมนู "⚙️ ตั้งค่าระบบ" > "3) ตั้ง/รีเซ็ต PIN ผู้ใช้งานเว็บแอป" เพื่อสร้างผู้ใช้งานคนแรก
 *    (ต้องมีอย่างน้อย 1 คนเป็นสิทธิ์ "ผู้แก้ไข" ก่อนใครจะเข้าเว็บแอปได้เลย)
 * 7. Deploy > New deployment > Web app > Execute as: Me,
 *    Who has access: Anyone (จำเป็น เพราะผู้ใช้งานล็อกอินด้วยชื่อ+PIN ของระบบเอง ไม่ใช่บัญชี Google)
 * ================================================================
 * ระบบสิทธิ์ผู้ใช้งาน (เพิ่มล่าสุด)
 * - ผู้ใช้งานเป็น Gmail ส่วนตัว ไม่มีโดเมนองค์กร จึงใช้ Session.getActiveUser() ระบุตัวตนอัตโนมัติไม่ได้
 *   ระบบจึงทำหน้าล็อกอินของตัวเอง (ชื่อ + PIN) เก็บ PIN แบบเข้ารหัส (hash) ไว้ในชีท Users เท่านั้น
 * - ทุกฟังก์ชันที่หน้าเว็บเรียกใช้ ต้องแนบ token ที่ได้จากการล็อกอินมาด้วยเสมอ และเซิร์ฟเวอร์ตรวจสิทธิ์ซ้ำ
 *   ทุกครั้งก่อนทำงานจริง (ไม่ได้พึ่งแค่การซ่อนปุ่มฝั่งหน้าเว็บ)
 * - 2 สิทธิ์: "ผู้แก้ไข" (ทำได้ทุกอย่าง) และ "เจ้าหน้าที่" (เพิ่มกำลังพลใหม่/เพิ่มหลักสูตรใหม่/ติ๊กงานเสร็จ เท่านั้น)
 * - คนที่ไม่มีชื่ออยู่ในชีท Users (หรือถูกปิดใช้งาน) เข้าเว็บแอปไม่ได้เลย แม้แต่ดูข้อมูลก็ไม่ได้
 * ================================================================
 */

// ================= CONFIG =================
const SHEET_NAMES = {
  PERSONNEL: "Personnel",
  COURSES: "Courses",
  TRAINING_HISTORY: "TrainingHistory",
  TASKS: "Tasks",
  UNITS: "Units",
  RANK_HISTORY: "RankHistory",
  ACTIVITY_LOG: "ActivityLog",
  USERS: "Users"
};

// ระดับสิทธิ์ผู้ใช้งาน
// - "ผู้แก้ไข"    : แก้ไข/ลบ/เพิ่มได้ทุกอย่าง (รวมถึงจัดการรายชื่อผู้ใช้งานเองผ่านเมนูในชีท)
// - "เจ้าหน้าที่" : ทำได้แค่ 3 อย่าง คือ เพิ่มกำลังพลใหม่, เพิ่มหลักสูตร/การฝึกใหม่, ติ๊กงาน/งานย่อยว่าเสร็จ
//                 แก้ไข/ลบข้อมูลอื่นใดไม่ได้ทั้งสิ้น
const USER_ROLES = ["ผู้แก้ไข", "เจ้าหน้าที่"];
const SESSION_TTL_SECONDS = 21600; // 6 ชั่วโมง (ค่าสูงสุดที่ CacheService รองรับ) ต่ออายุอัตโนมัติทุกครั้งที่ใช้งาน

const STAFF_LIST = [
  "ส.อ.วชิรวิชญ์ เศวตเจริญรัตน์",
  "ส.อ.รุ่งฟ้า เป็งโม๊ะ",
  "ส.อ.ศุภชัย ถนอมจิตร"
];

const COURSE_TYPES = [
  "หลักสูตรเพิ่มพูนความรู้",
  "หลักสูตรตามแนวทางรับราชการ",
  "การฝึกอบรมภายในหน่วย",
  "การฝึกประจำปี"
];

const PERSONNEL_STATUSES = ["ปกติ", "มีแผนเข้ารับการฝึก", "อยู่ระหว่างการฝึก", "ช่วยราชการ"];

// ยศทหารบก เรียงจากชั้นประทวนถึงชั้นนายพล (ส.ต. - พล.อ.)
const RANK_LIST = [
  "ส.ต.", "ส.ท.", "ส.อ.", "จ.ส.ต.", "จ.ส.ท.", "จ.ส.อ.", "จ.ส.อ.(พ)",
  "ร.ต.", "ร.ท.", "ร.อ.", "พ.ต.", "พ.ท.", "พ.อ.", "พ.อ.(พ)",
  "พล.ต.", "พล.ท.", "พล.อ."
];

// สังกัดในหน่วย (ใช้เป็นดรอปดาวน์ของข้อมูลหลักกำลังพล)
const UNIT_LIST = [
  "ฝกพ.พัน.ซบร.ฯ",
  "ฝกง.พัน.ซบร.ฯ",
  "ฝขว.พัน.ซบร.ฯ",
  "ฝยก.พัน.ซบร.ฯ",
  "ฝกบ.พัน.ซบร.ฯ",
  "ฝกร.พัน.ซบร.ฯ",
  "ฝกม.พัน.ซบร.ฯ",
  "ร้อย.บก.พัน.ซบร.ฯ",
  "ร้อย.สน.พัน.ซบร.ฯ",
  "ร้อย.สน.ส่วนหน้า 1 พัน.ซบร.ฯ",
  "ร้อย.สน.ส่วนหน้า 2 พัน.ซบร.ฯ"
];

// ธนาคารสำหรับดรอปดาวน์บัญชีธนาคารของกำลังพล
const BANK_LIST = [
  "ธนาคารกรุงไทย",
  "ธนาคารทหารไทยธนชาต (ทีทีบี)",
  "ธนาคารกรุงเทพ",
  "ธนาคารกสิกรไทย",
  "ธนาคารไทยพาณิชย์",
  "ธนาคารกรุงศรีอยุธยา",
  "ธนาคารออมสิน",
  "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)",
  "ธนาคารอาคารสงเคราะห์",
  "ธนาคารซีไอเอ็มบีไทย",
  "ธนาคารยูโอบี",
  "ธนาคารอิสลามแห่งประเทศไทย",
  "ธนาคารเกียรตินาคินภัทร",
  "ธนาคารแลนด์ แอนด์ เฮ้าส์"
];

function doGet() {
  // Frontend stays in the Apps Script origin so google.script.run retains authentication.
  const sourceUrl = 'https://raw.githubusercontent.com/nattamet22/Work-Space/main/App.html';
  let output;
  try {
    const response = UrlFetchApp.fetch(sourceUrl, {
      followRedirects: true, muteHttpExceptions: true
    });
    const html = response.getContentText('UTF-8');
    if (response.getResponseCode() !== 200 || html.indexOf('build 7.0') === -1 || html.indexOf('function gsRun(') === -1) {
      throw new Error('Frontend source unavailable');
    }
    output = HtmlService.createHtmlOutput(html);
  } catch (error) {
    console.warn('GitHub frontend unavailable; using local Index fallback.');
    output = HtmlService.createHtmlOutputFromFile('Index');
  }
  return output.setTitle('ระบบบริหารจัดการกำลังพล')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================= SETUP: เรียกจากเมนูใน Google Sheets =================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ ตั้งค่าระบบ')
    .addItem('1) สร้างโครงสร้างชีททั้งหมด (ทำครั้งแรก)', 'setupSpreadsheet')
    .addSeparator()
    .addItem('3) ตั้ง/รีเซ็ต PIN ผู้ใช้งานเว็บแอป', 'manageUserPin')
    .addItem('4) อัปเดตโครงสร้างสำหรับรุ่นและผู้ทำรายการ', 'upgradeSchema')
    .addSeparator()
    .addItem('ล้างข้อมูลทั้งหมด (เก็บแค่หัวคอลัมน์)', 'clearAllData')
    .addToUi();
}

// สร้างแผ่นงานพร้อมหัวคอลัมน์ ล็อกแถวหัว ใส่ dropdown ตรวจสอบข้อมูล
// เรียกซ้ำได้อย่างปลอดภัย — จะไม่ลบข้อมูลที่มีอยู่แล้ว
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const sheetsConfig = {};
  sheetsConfig[SHEET_NAMES.PERSONNEL] = [
    "PersonnelID", "ยศ", "ชื่อ", "สกุล", "ตำแหน่ง", "สังกัด", "รูปภาพ", "สถานะ",
    "เบอร์โทรศัพท์", "ธนาคาร", "เลขที่บัญชี", "เลขประจำตัวประชาชน", "เลขประจำตัวทหาร", "วันเกิด"
  ];
  sheetsConfig[SHEET_NAMES.COURSES] = ["CourseID", "ชื่อหลักสูตร", "ประเภทหลักสูตร", "วันเริ่ม", "วันสิ้นสุด", "หน่วยจัดฝึก", "สถานะ", "รุ่น"];
  sheetsConfig[SHEET_NAMES.TRAINING_HISTORY] = ["RecordID", "PersonnelID", "CourseID", "สถานะการฝึก"];
  sheetsConfig[SHEET_NAMES.TASKS] = ["TaskID", "ParentTaskID", "ชื่องาน", "ผู้รับผิดชอบ", "วันที่สั่งการ", "วันกำหนดส่ง", "หน่วยปลายทาง", "ความคืบหน้า", "ลิงก์", "สถานะ", "วันที่ปิดงาน"];
  sheetsConfig[SHEET_NAMES.UNITS] = ["UnitName"];
  sheetsConfig[SHEET_NAMES.RANK_HISTORY] = ["RecordID", "PersonnelID", "ยศ", "วันที่ติดยศ"];
  sheetsConfig[SHEET_NAMES.ACTIVITY_LOG] = ["LogID", "Timestamp", "ActionType", "Description", "RelatedID", "ActorUsername", "ActorFullName", "ActorRole"];
  // ชีทผู้ใช้งานเว็บแอป — PinHash ห้ามพิมพ์เอง ต้องตั้งผ่านเมนู "3) ตั้ง/รีเซ็ต PIN" เท่านั้น (จะเข้ารหัสให้อัตโนมัติ)
  sheetsConfig[SHEET_NAMES.USERS] = ["Name", "Role", "PinHash", "Active", "FirstName", "LastName"];

  let createdCount = 0;
  Object.keys(sheetsConfig).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      createdCount++;
    }
    const headers = ensureColumns_(sheet, sheetsConfig[name]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold').setBackground('#0F2A43').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    headers.forEach((h, i) => sheet.autoResizeColumn(i + 1));
  });

  applySheetValidation_();

  ["Sheet1", "แผ่นงาน1"].forEach(defaultName => {
    const s = ss.getSheetByName(defaultName);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  ui.alert('ตั้งค่าโครงสร้างชีทเรียบร้อย', 'สร้างแผ่นงานใหม่ ' + createdCount + ' แผ่น (แผ่นที่มีอยู่แล้วจะไม่ถูกลบข้อมูล)\nขั้นตอนถัดไป: เมนู "3) ตั้ง/รีเซ็ต PIN" เพื่อเพิ่มผู้ใช้งานคนแรก (ต้องมีอย่างน้อย 1 คนเป็น "ผู้แก้ไข" ก่อนใครจะเข้าเว็บแอปได้)', ui.ButtonSet.OK);
}

// ใส่ dropdown ตรวจสอบข้อมูล + จัดฟอร์แมตวันที่ให้เป็น yyyy-mm-dd
function applySheetValidation_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ROWS = 1000;
  ss.getSheets().forEach(sheet => { if (sheet.getMaxRows() < ROWS + 1) sheet.insertRowsAfter(sheet.getMaxRows(), ROWS + 1 - sheet.getMaxRows()); });

  const personnelSheet = ss.getSheetByName(SHEET_NAMES.PERSONNEL);
  const rankRule = SpreadsheetApp.newDataValidation().requireValueInList(RANK_LIST, true).setAllowInvalid(true).build();
  personnelSheet.getRange(2, 2, ROWS, 1).setDataValidation(rankRule);
  const unitRule = SpreadsheetApp.newDataValidation().requireValueInList(UNIT_LIST, true).setAllowInvalid(true).build();
  personnelSheet.getRange(2, 6, ROWS, 1).setDataValidation(unitRule);
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(PERSONNEL_STATUSES, true).setAllowInvalid(true).build();
  personnelSheet.getRange(2, 8, ROWS, 1).setDataValidation(statusRule);
  personnelSheet.getRange(2, 14, ROWS, 1).setNumberFormat("yyyy-mm-dd");

  const coursesSheet = ss.getSheetByName(SHEET_NAMES.COURSES);
  const typeRule = SpreadsheetApp.newDataValidation().requireValueInList(COURSE_TYPES, true).setAllowInvalid(true).build();
  coursesSheet.getRange(2, 3, ROWS, 1).setDataValidation(typeRule);
  coursesSheet.getRange(2, 4, ROWS, 2).setNumberFormat("yyyy-mm-dd");
  const batchColumn = coursesSheet.getRange(1, 1, 1, coursesSheet.getLastColumn()).getValues()[0].indexOf("รุ่น") + 1;
  if (batchColumn) coursesSheet.getRange(2, batchColumn, ROWS, 1).setNumberFormat("@");

  const tasksSheet = ss.getSheetByName(SHEET_NAMES.TASKS);
  const assigneeRule = SpreadsheetApp.newDataValidation().requireValueInList(STAFF_LIST, true).setAllowInvalid(true).build();
  tasksSheet.getRange(2, 4, ROWS, 1).setDataValidation(assigneeRule);
  tasksSheet.getRange(2, 5, ROWS, 2).setNumberFormat("yyyy-mm-dd");
  tasksSheet.getRange(2, 11, ROWS, 1).setNumberFormat("yyyy-mm-dd");

  const rankHistorySheet = ss.getSheetByName(SHEET_NAMES.RANK_HISTORY);
  rankHistorySheet.getRange(2, 3, ROWS, 1).setDataValidation(rankRule);
  rankHistorySheet.getRange(2, 4, ROWS, 1).setNumberFormat("yyyy-mm-dd");

  const logSheet = ss.getSheetByName(SHEET_NAMES.ACTIVITY_LOG);
  if (logSheet) logSheet.getRange(2, 2, ROWS, 1).setNumberFormat("yyyy-mm-dd hh:mm");

  const usersSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (usersSheet) {
    const roleRule = SpreadsheetApp.newDataValidation().requireValueInList(USER_ROLES, true).setAllowInvalid(true).build();
    usersSheet.getRange(2, 2, ROWS, 1).setDataValidation(roleRule);
    const activeRule = SpreadsheetApp.newDataValidation().requireValueInList(["TRUE", "FALSE"], true).setAllowInvalid(true).build();
    usersSheet.getRange(2, 4, ROWS, 1).setDataValidation(activeRule);
  }
}

// ล้างข้อมูลทั้งหมด (เก็บไว้แค่หัวคอลัมน์แถวที่ 1)
function clearAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert('ยืนยันการล้างข้อมูล', 'จะลบข้อมูลทุกแถว (เหลือแค่หัวคอลัมน์) ในทุกแผ่นงาน ยกเว้นรายชื่อผู้ใช้งาน (Users) ต้องการดำเนินการต่อหรือไม่?', ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  Object.values(SHEET_NAMES).forEach(name => {
    if (name === SHEET_NAMES.USERS) return; // ไม่ล้างบัญชีผู้ใช้งาน กันคนใช้งานถูกล็อกเอาต์ทั้งหมดโดยไม่ตั้งใจ
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
  });
  ui.alert('ล้างข้อมูลเรียบร้อยแล้ว');
}

// ตั้ง/รีเซ็ตรหัสผ่าน (PIN) ให้ผู้ใช้งานเว็บแอป — เรียกจากเมนูใน Google Sheets เท่านั้น
// ไม่ให้พิมพ์ PIN ลงในเซลล์ตรงๆ เพราะใครก็เปิดดูช่องนั้นได้ ต้องผ่านเมนูนี้เพื่อเข้ารหัสก่อนบันทึกเสมอ
// ใช้ได้ทั้งเพิ่มผู้ใช้งานใหม่ (ถ้ายังไม่มีชื่อนี้) และรีเซ็ต PIN/เปลี่ยนสิทธิ์ของคนเดิม (ถ้ามีชื่อนี้อยู่แล้ว)
function manageUserPin() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (!sheet) {
    ui.alert('ยังไม่ได้สร้างโครงสร้างชีท', 'กรุณากดเมนู "1) สร้างโครงสร้างชีททั้งหมด" ก่อน', ui.ButtonSet.OK);
    return;
  }

  ensureColumns_(sheet, ["FirstName", "LastName"]);
  const nameResp = ui.prompt('ตั้ง/รีเซ็ต PIN ผู้ใช้งาน (1/3)', 'พิมพ์ชื่อผู้ใช้งาน (ชื่อบัญชีที่จะใช้ล็อกอินเข้าเว็บแอป)\nถ้าพิมพ์ชื่อที่มีอยู่แล้ว จะเป็นการรีเซ็ต PIN/เปลี่ยนสิทธิ์ของคนนั้น', ui.ButtonSet.OK_CANCEL);
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  const name = nameResp.getResponseText().trim();
  if (!name) { ui.alert('กรุณาระบุชื่อ'); return; }

  const firstResp = ui.prompt('ชื่อจริง', 'กรอกชื่อจริงของเจ้าของบัญชี', ui.ButtonSet.OK_CANCEL);
  if (firstResp.getSelectedButton() !== ui.Button.OK) return;
  const lastResp = ui.prompt('นามสกุล', 'กรอกนามสกุลของเจ้าของบัญชี', ui.ButtonSet.OK_CANCEL);
  if (lastResp.getSelectedButton() !== ui.Button.OK) return;
  const firstName = firstResp.getResponseText().trim(), lastName = lastResp.getResponseText().trim();
  if (!firstName || !lastName) { ui.alert('กรุณากรอกชื่อจริงและนามสกุลให้ครบ'); return; }

  const roleResp = ui.prompt('ตั้ง/รีเซ็ต PIN ผู้ใช้งาน (2/3)', 'กำหนดสิทธิ์ของ "' + name + '"\nพิมพ์ 1 = ผู้แก้ไข (แก้ไขได้ทุกอย่าง)\nพิมพ์ 2 = เจ้าหน้าที่ (เพิ่มกำลังพล/เพิ่มหลักสูตร/ติ๊กงานเสร็จ เท่านั้น)', ui.ButtonSet.OK_CANCEL);
  if (roleResp.getSelectedButton() !== ui.Button.OK) return;
  const roleChoice = roleResp.getResponseText().trim();
  const role = roleChoice === '1' ? USER_ROLES[0] : (roleChoice === '2' ? USER_ROLES[1] : null);
  if (!role) { ui.alert('กรุณาพิมพ์ 1 หรือ 2 เท่านั้น'); return; }

  const pinResp = ui.prompt('ตั้ง/รีเซ็ต PIN ผู้ใช้งาน (3/3)', 'ตั้งรหัส PIN ใหม่ให้ "' + name + '" (ตัวเลขล้วน 4-8 หลัก)', ui.ButtonSet.OK_CANCEL);
  if (pinResp.getSelectedButton() !== ui.Button.OK) return;
  const pin = pinResp.getResponseText().trim();
  if (!/^\d{4,8}$/.test(pin)) { ui.alert('PIN ต้องเป็นตัวเลขล้วน 4-8 หลักเท่านั้น'); return; }

  const hash = hashPin_(pin);
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === name) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) {
    appendObject_(sheet, {Name:name, Role:role, PinHash:hash, Active:true, FirstName:firstName, LastName:lastName});
  } else {
    const values = {Role:role, PinHash:hash, Active:true, FirstName:firstName, LastName:lastName};
    Object.keys(values).forEach(k => sheet.getRange(rowIndex, data[0].indexOf(k)+1).setValue(values[k]));
  }
  ui.alert('ตั้งรหัสผ่านเรียบร้อย', 'ผู้ใช้งาน "' + name + '" (สิทธิ์: ' + role + ') พร้อมเข้าสู่ระบบด้วย PIN ที่เพิ่งตั้งได้ทันที', ui.ButtonSet.OK);
}

// สุ่ม salt เก็บไว้ครั้งเดียวต่อการติดตั้ง 1 ชุด (ไม่ใช่ sheet) กันคนละสเปรดชีทใช้ salt ชนกัน
function getPinSalt_() {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty('PIN_SALT');
  if (!salt) {
    salt = Utilities.getUuid();
    props.setProperty('PIN_SALT', salt);
  }
  return salt;
}

function hashPin_(pin) {
  const salt = getPinSalt_();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin);
  return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function isActiveFlag_(v) {
  if (v === true) return true;
  if (typeof v === 'string' && v.trim().toUpperCase() === 'TRUE') return true;
  return false;
}

// อ่าน session จาก token (ถ้ายังไม่หมดอายุ จะต่ออายุให้อัตโนมัติ = sliding expiration)
function getSession_(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('sess_' + token);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    cache.put('sess_' + token, raw, SESSION_TTL_SECONDS);
    return session;
  } catch (e) {
    return null;
  }
}

// ด่านตรวจสิทธิ์หลักของระบบ — ทุกฟังก์ชันที่หน้าเว็บเรียกใช้ (อ่านหรือเขียนก็ตาม) ต้องผ่านด่านนี้ก่อนเสมอ
// allowedRoles ไม่ใส่ = แค่ต้องล็อกอินอยู่ (ทั้งสองสิทธิ์ผ่านได้); ใส่ = ต้องมีสิทธิ์ตรงตามที่ระบุเท่านั้น
function requireRole_(token, allowedRoles) {
  const session = getSession_(token);
  if (!session) throw new Error("กรุณาเข้าสู่ระบบก่อนใช้งาน (เซสชันหมดอายุหรือยังไม่ได้ล็อกอิน)");
  const user = sheetToObjects_(SHEET_NAMES.USERS).find(u => String(u.Name).trim() === session.name);
  if (!user || !isActiveFlag_(user.Active)) throw new Error("กรุณาเข้าสู่ระบบก่อนใช้งาน (บัญชีถูกปิดใช้งาน)");
  session.role = user.Role;
  session.fullName = [user.FirstName, user.LastName].filter(Boolean).join(" ") || user.Name;
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(session), SESSION_TTL_SECONDS);
  if (allowedRoles && allowedRoles.indexOf(session.role) === -1) {
    throw new Error("คุณไม่มีสิทธิ์ทำรายการนี้ (สิทธิ์ปัจจุบันของคุณ: " + session.role + ")");
  }
  return session;
}

// เข้าสู่ระบบด้วยชื่อ + PIN คืนค่า token ให้หน้าเว็บเก็บไว้เรียกฟังก์ชันอื่นต่อไป
function login(name, pin) {
  const cleanName = String(name || "").trim();
  const cleanPin = String(pin || "").trim();
  if (!cleanName || !cleanPin) throw new Error("กรุณากรอกชื่อและรหัสผ่านให้ครบ");

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.USERS);
  if (!sheet) throw new Error("ระบบยังไม่ได้ตั้งค่าผู้ใช้งาน กรุณาติดต่อผู้ดูแลระบบ");

  const user = sheetToObjects_(SHEET_NAMES.USERS).find(u => String(u.Name || "").trim() === cleanName);
  // ไม่บอกว่าผิดที่ชื่อหรือ PIN โดยเฉพาะ เพื่อกันคนสุ่มเดาว่าชื่อไหนมีอยู่จริงในระบบ
  if (!user || !isActiveFlag_(user.Active)) {
    throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }
  if (hashPin_(cleanPin) !== user.PinHash) {
    throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }

  const token = Utilities.getUuid();
  const session = { name: user.Name, role: user.Role, fullName: [user.FirstName, user.LastName].filter(Boolean).join(" ") || user.Name };
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify(session), SESSION_TTL_SECONDS);
  logActivity_("เข้าสู่ระบบ", user.Name + " เข้าสู่ระบบ (สิทธิ์: " + user.Role + ")", "", token);
  return { token: token, name: user.Name, role: user.Role };
}

function logout(token) {
  if (getSession_(token)) logActivity_("ออกจากระบบ", "ออกจากระบบ", "", token);
  if (token) CacheService.getScriptCache().remove('sess_' + token);
  return "Success";
}

// เรียกตอนเปิดหน้าเว็บ เพื่อเช็คว่า token ที่เก็บไว้ฝั่งเบราว์เซอร์ยังใช้ได้อยู่ไหม (กันต้องล็อกอินใหม่ทุกครั้งที่รีเฟรช)
function checkSession(token) {
  const session = getSession_(token);
  if (!session) return null;
  return { token: token, name: session.name, role: session.role };
}

// ================= UTILITIES =================

function sheetToObjects_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].join("") === "") continue;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = data[i][j]; });
    obj._row = i + 1;
    rows.push(obj);
  }
  return rows;
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === "[object Date]";
}

/**
 * สำคัญ: google.script.run ส่งค่า Date ข้ามไปหน้าบ้านไม่ได้
 * ถ้าส่งไป call จะล้มเหลวเงียบๆ (withFailureHandler ทำงาน) ทำให้หน้าเว็บว่างเปล่า
 * ทุกฟังก์ชันที่คืนค่าให้หน้าบ้าน ต้องผ่านตัวนี้ก่อนเสมอ
 */
function plainRow_(obj) {
  const out = {};
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if (isDate_(v)) out[k] = formatDate_(v);
    else if (v === null || v === undefined) out[k] = "";
    else out[k] = v;
  });
  return out;
}

function generateId_(prefix) {
  return prefix + Utilities.getUuid().split("-")[0].toUpperCase();
}

function formatDate_(d) {
  if (!d) return "";
  if (isDate_(d)) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(d);
}

function formatDateTime_(d) {
  if (!d) return "";
  if (isDate_(d)) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  return String(d);
}

function parseProgress_(v) {
  if (typeof v === "number") return Math.max(0, Math.min(100, Math.round(v)));
  if (typeof v === "string") {
    const n = parseFloat(v.replace("%", ""));
    return isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n)));
  }
  return 0;
}

function findRowIndexById_(sheet, idColName, idValue) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf(idColName);
  if (idCol === -1) return null;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === idValue) return { rowIndex: i + 1, headers: headers, row: data[i] };
  }
  return null;
}

function updateFieldById_(sheetName, idColName, idValue, fieldName, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error("ไม่พบแผ่นงาน: " + sheetName);
  const found = findRowIndexById_(sheet, idColName, idValue);
  if (!found) throw new Error("ไม่พบข้อมูล: " + idValue);
  const col = found.headers.indexOf(fieldName);
  if (col === -1) throw new Error("ไม่พบคอลัมน์: " + fieldName);
  sheet.getRange(found.rowIndex, col + 1).setValue(value);
}

// บันทึกประวัติการดำเนินการ (ไม่ให้ทำให้ฟังก์ชันหลักพังถ้า log พลาด)
function logActivity_(actionType, description, relatedId, token) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ACTIVITY_LOG);
    if (!sheet) return;
    const actor = token ? getSession_(token) : null;
    ensureColumns_(sheet, ["ActorUsername", "ActorFullName", "ActorRole"]);
    appendObject_(sheet, {LogID: generateId_("LOG"), Timestamp: new Date(),
      ActionType: actionType, Description: description, RelatedID: relatedId || "",
      ActorUsername: actor ? actor.name : "",
      ActorFullName: actor ? (actor.fullName || actor.name) : "ระบบ/เมนู Google Sheets",
      ActorRole: actor ? actor.role : "ระบบ"});
  } catch (e) {
    console.error("Activity log failed: " + e.message);
  }
}

function getActivityLog(token, limit) {
  requireRole_(token, USER_ROLES);
  const rows = sheetToObjects_(SHEET_NAMES.ACTIVITY_LOG);
  const sorted = rows.slice().sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  const max = limit || 200;
  return sorted.slice(0, max).map(r => ({
    logId: r.LogID,
    timestamp: formatDateTime_(r.Timestamp),
    actionType: r.ActionType,
    description: r.Description,
    actorUsername: r.ActorUsername || "",
    actorFullName: r.ActorFullName || "ไม่ทราบผู้ดำเนินการ (ข้อมูลเดิม)",
    actorRole: r.ActorRole || "",
    relatedId: r.RelatedID
  }));
}

function deleteRowsByField_(sheetName, fieldName, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return 0;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return 0;
  const headers = data[0];
  const col = headers.indexOf(fieldName);
  if (col === -1) return 0;
  let deletedCount = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][col] === value) {
      sheet.deleteRow(i + 1);
      deletedCount++;
    }
  }
  return deletedCount;
}

function computeDurationFromDate_(dateStr) {
  if (!dateStr) return null;
  const start = new Date(dateStr);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return null;
  return { years: years, months: months, text: years + " ปี " + months + " เดือน" };
}

function computeAgeYears_(birthDateStr) {
  if (!birthDateStr) return null;
  const start = new Date(birthDateStr);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  const beforeBirthday = (now.getMonth() < start.getMonth()) || (now.getMonth() === start.getMonth() && now.getDate() < start.getDate());
  if (beforeBirthday) years--;
  return years >= 0 ? years : null;
}

// ================= รายการค่าคงที่ =================

function getStaffList() { return STAFF_LIST; }
function getCourseTypes() { return COURSE_TYPES; }
function getPersonnelStatuses() { return PERSONNEL_STATUSES; }
function getRankList() { return RANK_LIST; }

function getUnits() { return UNIT_LIST; }
function getBankList() { return BANK_LIST; }

function getInitialData() {
  return {
    staffList: getStaffList(),
    courseTypes: getCourseTypes(),
    personnelStatuses: getPersonnelStatuses(),
    units: getUnits(),
    rankList: getRankList(),
    bankList: getBankList()
  };
}

// ================= สถานะที่คำนวณอัตโนมัติ =================

function computeCourseStatus_(startDate, endDate) {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate || startDate);
  if (isNaN(start.getTime())) return "ไม่ทราบสถานะ";
  now.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (now < start) return "กำลังจะฝึก";
  if (now > end) return "ผ่านแล้ว";
  return "กำลังดำเนินการ";
}

// ================= กำลังพล (Personnel) =================

// คำนวณสถานะการฝึกของกำลังพล 1 คน จากหลักสูตรที่ลงทะเบียนไว้ ณ ปัจจุบัน (ไม่ใช่ค่าที่บันทึกตายตัว)
// ป้องกันปัญหาคนในหลักสูตรเดียวกันมีสถานะไม่ตรงกัน เพราะแต่ก่อนคำนวณแค่ตอนเพิ่ม/ลงทะเบียนครั้งเดียว
// แล้วไม่อัปเดตอีกเลยแม้วันที่ของหลักสูตรจะเปลี่ยนสถานะไปแล้ว (เช่น จากกำลังจะฝึก -> กำลังดำเนินการ)
function computeTrainingStatus_(personId, trainingRows, coursesRows) {
  let hasOngoing = false, hasUpcoming = false;
  trainingRows.forEach(h => {
    if (h.PersonnelID !== personId) return;
    const c = coursesRows.find(x => x.CourseID === h.CourseID);
    if (!c || !c["วันเริ่ม"]) return;
    const st = computeCourseStatus_(c["วันเริ่ม"], c["วันสิ้นสุด"]);
    if (st === "กำลังดำเนินการ") hasOngoing = true;
    else if (st === "กำลังจะฝึก") hasUpcoming = true;
  });
  if (hasOngoing) return "อยู่ระหว่างการฝึก";
  if (hasUpcoming) return "มีแผนเข้ารับการฝึก";
  return "ปกติ";
}

function getPersonnelList() {
  const rows = sheetToObjects_(SHEET_NAMES.PERSONNEL).map(plainRow_);
  const trainingRows = sheetToObjects_(SHEET_NAMES.TRAINING_HISTORY);
  const coursesRows = sheetToObjects_(SHEET_NAMES.COURSES);
  rows.forEach(p => {
    // "ช่วยราชการ" เป็นค่าที่ตั้งเองและต้องการให้ค้างไว้ (ไม่ให้ระบบคำนวณทับ) ส่วนอย่างอื่นคำนวณสดเสมอ
    if (p["สถานะ"] !== "ช่วยราชการ") {
      p["สถานะ"] = computeTrainingStatus_(p.PersonnelID, trainingRows, coursesRows);
    }
  });
  return rows;
}

function addPersonnel(token, p) {
  requireRole_(token, USER_ROLES); // เพิ่มกำลังพลใหม่ได้ทั้งสองสิทธิ์
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PERSONNEL);
  const id = generateId_("P");
  sheet.appendRow([
    id, p.rank, p.firstName, p.lastName, p.position, p.unit,
    p.photoUrl || "", p.status || "ปกติ",
    p.phone || "", p.bank || "", p.accountNumber || "",
    p.nationalId || "", p.militaryId || "", p.birthDate || ""
  ]);
  logActivity_("เพิ่มกำลังพล", "เพิ่มกำลังพลใหม่: " + p.rank + p.firstName + " " + p.lastName, id, token);
  return id;
}

function updatePersonnelStatus(token, personId, status) {
  requireRole_(token, ["ผู้แก้ไข"]);
  updateFieldById_(SHEET_NAMES.PERSONNEL, "PersonnelID", personId, "สถานะ", status);
  logActivity_("เปลี่ยนสถานะกำลังพล", "เปลี่ยนสถานะเป็น " + status, personId, token);
  return "Success";
}

function updatePersonnelCore(token, personId, data) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const fieldMap = {
    rank: "ยศ", firstName: "ชื่อ", lastName: "สกุล",
    position: "ตำแหน่ง", unit: "สังกัด", photoUrl: "รูปภาพ", status: "สถานะ"
  };
  Object.keys(fieldMap).forEach(key => {
    if (data[key] !== undefined) {
      updateFieldById_(SHEET_NAMES.PERSONNEL, "PersonnelID", personId, fieldMap[key], data[key]);
    }
  });
  logActivity_("แก้ไขกำลังพล", "แก้ไขข้อมูลหลักของกำลังพล: " + (data.rank || "") + (data.firstName || "") + " " + (data.lastName || ""), personId, token);
  return "Success";
}

function deletePersonnel(token, personId) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const person = getPersonnelList().find(p => p.PersonnelID === personId);
  deleteRowsByField_(SHEET_NAMES.PERSONNEL, "PersonnelID", personId);
  deleteRowsByField_(SHEET_NAMES.TRAINING_HISTORY, "PersonnelID", personId);
  deleteRowsByField_(SHEET_NAMES.RANK_HISTORY, "PersonnelID", personId);
  const name = person ? (person["ยศ"] + person["ชื่อ"] + " " + person["สกุล"]) : personId;
  logActivity_("ลบกำลังพล", "ลบข้อมูลกำลังพล: " + name + " (พร้อมประวัติการฝึก/ประวัติยศที่เกี่ยวข้อง)", personId, token);
  return "Success";
}

function updatePersonnelExtra(token, personId, extra) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const fieldMap = {
    phone: "เบอร์โทรศัพท์",
    bank: "ธนาคาร",
    accountNumber: "เลขที่บัญชี",
    nationalId: "เลขประจำตัวประชาชน",
    militaryId: "เลขประจำตัวทหาร",
    birthDate: "วันเกิด"
  };
  Object.keys(fieldMap).forEach(key => {
    if (extra[key] !== undefined) {
      updateFieldById_(SHEET_NAMES.PERSONNEL, "PersonnelID", personId, fieldMap[key], extra[key]);
    }
  });
  logActivity_("แก้ไขข้อมูลส่วนตัว", "แก้ไขข้อมูลติดต่อ/บัญชี/บัตรประจำตัวของกำลังพล", personId, token);
  return "Success";
}

// รายละเอียดกำลังพลรายบุคคล — ค่าทุกตัวเป็น string/number เท่านั้น
function getPersonnelDetail(token, personId) {
  requireRole_(token, USER_ROLES);
  const person = getPersonnelList().find(p => p.PersonnelID === personId);
  if (!person) return null;

  const courses = sheetToObjects_(SHEET_NAMES.COURSES);
  const history = sheetToObjects_(SHEET_NAMES.TRAINING_HISTORY)
    .filter(h => h.PersonnelID === personId)
    .map(h => {
      const course = courses.find(c => c.CourseID === h.CourseID) || {};
      const status = course["วันเริ่ม"]
        ? computeCourseStatus_(course["วันเริ่ม"], course["วันสิ้นสุด"])
        : "ไม่ทราบสถานะ";
      return {
        recordId: h.RecordID,
        courseId: h.CourseID,
        courseName: course["ชื่อหลักสูตร"] || "(ไม่พบหลักสูตรนี้แล้ว)",
        courseType: course["ประเภทหลักสูตร"] || "",
        batch: String(course["รุ่น"] || ""),
        unit: course["หน่วยจัดฝึก"] || "",
        startDate: formatDate_(course["วันเริ่ม"]),
        endDate: formatDate_(course["วันสิ้นสุด"]),
        status: status
      };
    });

  const order = { "กำลังจะฝึก": 0, "กำลังดำเนินการ": 1, "ผ่านแล้ว": 2, "ไม่ทราบสถานะ": 3 };
  history.sort((a, b) => (order[a.status] === undefined ? 9 : order[a.status]) - (order[b.status] === undefined ? 9 : order[b.status]));

  const rankHistory = sheetToObjects_(SHEET_NAMES.RANK_HISTORY)
    .filter(r => r.PersonnelID === personId)
    .map(r => ({ recordId: r.RecordID, rank: r["ยศ"], date: formatDate_(r["วันที่ติดยศ"]) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const serviceDuration = rankHistory.length ? computeDurationFromDate_(rankHistory[0].date) : null;
  const birthDate = formatDate_(person["วันเกิด"]);
  const age = computeAgeYears_(birthDate);

  return {
    person: person,
    history: history,
    rankHistory: rankHistory,
    serviceDuration: serviceDuration,
    age: age,
    birthDate: birthDate
  };
}

function addRankRecord(token, personId, rank, date) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RANK_HISTORY);
  const id = generateId_("R");
  sheet.appendRow([id, personId, rank, date]);
  const person = getPersonnelList().find(p => p.PersonnelID === personId);
  logActivity_("เพิ่มประวัติยศ", (person ? person["ชื่อ"] + " " + person["สกุล"] : personId) + " ติดยศ " + rank + " เมื่อ " + date, personId, token);
  return id;
}

// แก้ไขประวัติการติดยศรายการเดิม (แก้ยศ และ/หรือ วันที่ติดยศ)
function updateRankRecord(token, recordId, rank, date) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RANK_HISTORY);
  const found = findRowIndexById_(sheet, "RecordID", recordId);
  if (!found) throw new Error("ไม่พบประวัติการติดยศนี้");
  if (rank !== undefined) updateFieldById_(SHEET_NAMES.RANK_HISTORY, "RecordID", recordId, "ยศ", rank);
  if (date !== undefined) updateFieldById_(SHEET_NAMES.RANK_HISTORY, "RecordID", recordId, "วันที่ติดยศ", date);
  logActivity_("แก้ไขประวัติยศ", "แก้ไขประวัติการติดยศเป็น " + rank + " เมื่อ " + date, recordId, token);
  return "Success";
}

// ลบประวัติการติดยศรายการหนึ่ง (ใช้ตอนกรอกผิดหรือไม่ต้องการแล้ว)
function deleteRankRecord(token, recordId) {
  requireRole_(token, ["ผู้แก้ไข"]);
  deleteRowsByField_(SHEET_NAMES.RANK_HISTORY, "RecordID", recordId);
  logActivity_("ลบประวัติยศ", "ลบประวัติการติดยศ (ID: " + recordId + ")", recordId, token);
  return "Success";
}

// ผูกหลักสูตรที่มีอยู่แล้วเข้ากับกำลังพล "1 คน" จากหน้ารายละเอียด
// กันลงทะเบียนหลักสูตร/รุ่นเดียวกันซ้ำ (แต่คนละรุ่น/CourseID คนละตัว ลงได้ตามปกติ)
function addTrainingRecord(token, personId, courseId) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const existing = sheetToObjects_(SHEET_NAMES.TRAINING_HISTORY)
    .some(h => h.PersonnelID === personId && h.CourseID === courseId);
  if (existing) throw new Error("กำลังพลนายนี้ลงทะเบียนหลักสูตร/รุ่นนี้ไปแล้ว");

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TRAINING_HISTORY);
  const id = generateId_("T");
  sheet.appendRow([id, personId, courseId, "บันทึกแล้ว"]);
  const person = getPersonnelList().find(p => p.PersonnelID === personId);
  const course = sheetToObjects_(SHEET_NAMES.COURSES).find(c => c.CourseID === courseId);
  logActivity_("เพิ่มหลักสูตรให้กำลังพล", (person ? person["ยศ"] + person["ชื่อ"] + " " + person["สกุล"] : personId) + " เข้ารับการฝึก " + (course ? course["ชื่อหลักสูตร"] : courseId), personId, token);
  return id;
}

// ผูกหลักสูตรกับกำลังพล "หลายคนพร้อมกัน" จากหน้าหลักสูตร (bulk assign)
// ข้ามคนที่ลงทะเบียนหลักสูตร/รุ่นนี้ไปแล้วอย่างเงียบๆ (ไม่ทำให้ทั้งชุดล้มเหลว)
function assignTrainees(token, courseId, personnelIds) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TRAINING_HISTORY);
  const already = new Set(
    sheetToObjects_(SHEET_NAMES.TRAINING_HISTORY)
      .filter(h => h.CourseID === courseId)
      .map(h => h.PersonnelID)
  );
  let addedCount = 0;
  (personnelIds || []).forEach(pId => {
    if (already.has(pId)) return;
    const id = generateId_("T");
    sheet.appendRow([id, pId, courseId, "บันทึกแล้ว"]);
    already.add(pId);
    addedCount++;
  });
  const course = sheetToObjects_(SHEET_NAMES.COURSES).find(c => c.CourseID === courseId);
  logActivity_("เพิ่มหลักสูตรให้กำลังพล(หลายคน)", "จัดกำลังพล " + addedCount + " นาย เข้ารับการฝึก " + (course ? course["ชื่อหลักสูตร"] : courseId), courseId, token);
  return "Success";
}

// ================= หลักสูตร (Courses) =================

function getCoursesList() {
  return sheetToObjects_(SHEET_NAMES.COURSES).map(c => ({
    CourseID: c.CourseID,
    "ชื่อหลักสูตร": c["ชื่อหลักสูตร"],
    "รุ่น": String(c["รุ่น"] || ""),
    "ประเภทหลักสูตร": c["ประเภทหลักสูตร"],
    "วันเริ่ม": formatDate_(c["วันเริ่ม"]),
    "วันสิ้นสุด": formatDate_(c["วันสิ้นสุด"]),
    "หน่วยจัดฝึก": c["หน่วยจัดฝึก"],
    computedStatus: c["วันเริ่ม"] ? computeCourseStatus_(c["วันเริ่ม"], c["วันสิ้นสุด"]) : "ไม่ทราบสถานะ"
  }));
}

function addCourse(token, c) {
  requireRole_(token, USER_ROLES); // เพิ่มหลักสูตร/การฝึกใหม่ได้ทั้งสองสิทธิ์
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.COURSES);
  const id = generateId_("C");
  ensureColumns_(sheet, ["รุ่น"]);
  appendObject_(sheet, {CourseID:id, "ชื่อหลักสูตร":c.name, "ประเภทหลักสูตร":c.type,
    "วันเริ่ม":c.startDate, "วันสิ้นสุด":c.endDate, "หน่วยจัดฝึก":c.unit, "สถานะ":"อัตโนมัติ", "รุ่น":c.batch || ""});
  logActivity_("เพิ่มหลักสูตร", "เพิ่มหลักสูตรใหม่: " + c.name, id, token);
  return id;
}

function updateCourse(token, courseId, data) {
  requireRole_(token, ["ผู้แก้ไข"]);
  ensureColumns_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.COURSES), ["รุ่น"]);
  const fieldMap = { name: "ชื่อหลักสูตร", batch: "รุ่น", type: "ประเภทหลักสูตร", startDate: "วันเริ่ม", endDate: "วันสิ้นสุด", unit: "หน่วยจัดฝึก" };
  Object.keys(fieldMap).forEach(key => {
    if (data[key] !== undefined) updateFieldById_(SHEET_NAMES.COURSES, "CourseID", courseId, fieldMap[key], data[key]);
  });
  logActivity_("แก้ไขหลักสูตร", "แก้ไขข้อมูลหลักสูตร: " + (data.name || courseId), courseId, token);
  return "Success";
}

function deleteCourse(token, courseId) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const course = getCoursesList().find(c => c.CourseID === courseId);
  deleteRowsByField_(SHEET_NAMES.COURSES, "CourseID", courseId);
  deleteRowsByField_(SHEET_NAMES.TRAINING_HISTORY, "CourseID", courseId);
  const name = course ? course["ชื่อหลักสูตร"] : courseId;
  logActivity_("ลบหลักสูตร", "ลบหลักสูตร: " + name + " (พร้อมประวัติการฝึกที่เกี่ยวข้อง)", courseId, token);
  return "Success";
}

function getCourseDetail(token, courseId) {
  requireRole_(token, USER_ROLES);
  const course = getCoursesList().find(c => c.CourseID === courseId);
  if (!course) return null;
  const personnel = getPersonnelList();
  const trainees = sheetToObjects_(SHEET_NAMES.TRAINING_HISTORY)
    .filter(h => h.CourseID === courseId)
    .map(h => {
      const p = personnel.find(x => x.PersonnelID === h.PersonnelID) || {};
      return {
        personnelId: h.PersonnelID,
        rank: p["ยศ"] || "",
        firstName: p["ชื่อ"] || "",
        lastName: p["สกุล"] || "",
        position: p["ตำแหน่ง"] || "",
        unit: p["สังกัด"] || ""
      };
    });
  return { course: course, trainees: trainees };
}

// ================= งาน (Tasks) =================

/**
 * กติกาความคืบหน้า
 * - ถ้างานหลักมีงานย่อย: ความคืบหน้ารวม = ค่าเฉลี่ยของงานย่อยทั้งหมด (คำนวณเอง ปรับมือไม่ได้)
 * - ถ้าไม่มีงานย่อย: ใช้ค่าความคืบหน้าของงานหลักเอง (ปรับด้วยแถบเลื่อนได้)
 */
function computeOverallProgress_(mainProgress, subProgressList) {
  if (subProgressList && subProgressList.length) {
    const sum = subProgressList.reduce((a, b) => a + Number(b || 0), 0);
    return Math.round(sum / subProgressList.length);
  }
  return Math.round(Number(mainProgress || 0));
}

function normalizeTaskRow_(t) {
  return {
    TaskID: t.TaskID,
    ParentTaskID: t.ParentTaskID || "",
    "ชื่องาน": t["ชื่องาน"] || "",
    "ผู้รับผิดชอบ": t["ผู้รับผิดชอบ"] || "",
    "วันที่สั่งการ": formatDate_(t["วันที่สั่งการ"]),
    "วันกำหนดส่ง": formatDate_(t["วันกำหนดส่ง"]),
    "หน่วยปลายทาง": t["หน่วยปลายทาง"] || "",
    "ความคืบหน้า": parseProgress_(t["ความคืบหน้า"]),
    "ลิงก์": t["ลิงก์"] || "",
    "สถานะ": t["สถานะ"] || "กำลังดำเนินการ",
    "วันที่ปิดงาน": formatDate_(t["วันที่ปิดงาน"])
  };
}

function getTasksList() {
  const raw = sheetToObjects_(SHEET_NAMES.TASKS).map(normalizeTaskRow_);
  const mainTasks = raw.filter(t => !t.ParentTaskID);

  return mainTasks.map(mt => {
    const subtasks = raw.filter(t => t.ParentTaskID === mt.TaskID);
    const overall = computeOverallProgress_(mt["ความคืบหน้า"], subtasks.map(s => s["ความคืบหน้า"]));
    const out = {};
    Object.keys(mt).forEach(k => { out[k] = mt[k]; });
    out.subtasks = subtasks;
    out.overallProgress = overall;
    return out;
  });
}

function addTask(token, t) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TASKS);
  const id = generateId_("TSK");
  sheet.appendRow([
    id, t.parentTaskId || "", t.name, t.assignee, t.orderDate, t.dueDate,
    t.destinationUnit, 0, "", "กำลังดำเนินการ", ""
  ]);
  logActivity_(t.parentTaskId ? "เพิ่มงานย่อย" : "เพิ่มงาน", (t.parentTaskId ? "งานย่อย: " : "งาน: ") + t.name, id, token);
  return id;
}

function createTaskWithSubtasks(token, mainTask, subtasks) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const mainId = addTask(token, mainTask);
  (subtasks || []).forEach(st => addTask(token, Object.assign({}, st, { parentTaskId: mainId })));
  return mainId;
}

function updateTaskProgress(token, taskId, progress) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const p = Math.max(0, Math.min(100, Number(progress)));
  updateFieldById_(SHEET_NAMES.TASKS, "TaskID", taskId, "ความคืบหน้า", p);
  logActivity_("อัปเดตความคืบหน้า", "อัปเดตความคืบหน้างาน (ID: " + taskId + ") เป็น " + p + "%", taskId, token);
  return "Success";
}

// ติ๊ก/เอาติ๊กออกของ "งานย่อย" — ความคืบหน้ารวมของงานหลักคำนวณจาก % ของงานย่อยที่เสร็จอัตโนมัติ
// ไม่มีการเลื่อนความคืบหน้าเองแล้ว มีแค่ เสร็จ (100%) หรือยังไม่เสร็จ (0%) ต่อรายการ
function setSubtaskStatus(token, taskId, done) {
  requireRole_(token, USER_ROLES); // เจ้าหน้าที่ติ๊กงานเสร็จได้
  const status = done ? "เสร็จสิ้น" : "กำลังดำเนินการ";
  const progress = done ? 100 : 0;
  updateFieldById_(SHEET_NAMES.TASKS, "TaskID", taskId, "สถานะ", status);
  updateFieldById_(SHEET_NAMES.TASKS, "TaskID", taskId, "ความคืบหน้า", progress);
  logActivity_(done ? "ติ๊กงานย่อยเสร็จ" : "เปิดงานย่อยอีกครั้ง", (done ? "ทำงานย่อยเสร็จแล้ว (ID: " : "เปิดงานย่อยอีกครั้ง (ID: ") + taskId + ")", taskId, token);
  return "Success";
}

/**
 * แก้ไขงานหลัก + งานย่อยเดิม + เพิ่มงานย่อยใหม่ + ลบงานย่อย ในการเรียกครั้งเดียว
 * payload = {
 *   taskId, main:{name,assignee,orderDate,dueDate,destinationUnit},
 *   subtasks:[{taskId, name, assignee, orderDate, dueDate, destinationUnit}],
 *   newSubtasks:[{name, assignee, orderDate, dueDate, destinationUnit}],
 *   deletedIds:[taskId,...]
 * }
 */
function saveTaskEdits(token, payload) {
  requireRole_(token, ["ผู้แก้ไข"]);
  if (!payload || !payload.taskId) throw new Error("ข้อมูลไม่ครบ: ไม่ระบุงานที่จะแก้ไข");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.TASKS);
  if (!sheet) throw new Error("ไม่พบแผ่นงาน Tasks");

  // 1) ลบงานย่อยที่สั่งลบก่อน (ลบจากล่างขึ้นบน)
  (payload.deletedIds || []).forEach(id => deleteRowsByField_(SHEET_NAMES.TASKS, "TaskID", id));

  // 2) อ่านชีทครั้งเดียว แก้ในหน่วยความจำ แล้วเขียนกลับรวดเดียว (เร็วกว่าเขียนทีละช่อง)
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
  const fieldMap = {
    name: "ชื่องาน", assignee: "ผู้รับผิดชอบ", orderDate: "วันที่สั่งการ",
    dueDate: "วันกำหนดส่ง", destinationUnit: "หน่วยปลายทาง"
  };
  const rowOf = {};
  for (let i = 1; i < data.length; i++) rowOf[data[i][idx["TaskID"]]] = i;

  function applyTo(rowIndex, d) {
    if (rowIndex === undefined || !d) return;
    Object.keys(fieldMap).forEach(k => {
      if (d[k] !== undefined) data[rowIndex][idx[fieldMap[k]]] = d[k];
    });
  }

  applyTo(rowOf[payload.taskId], payload.main);
  (payload.subtasks || []).forEach(s => applyTo(rowOf[s.taskId], s));
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);

  // 3) เพิ่มงานย่อยใหม่
  (payload.newSubtasks || []).forEach(s => {
    if (!s.name) return;
    addTask(token, Object.assign({}, s, { parentTaskId: payload.taskId }));
  });

  logActivity_("แก้ไขงาน", "แก้ไขงาน: " + ((payload.main && payload.main.name) || payload.taskId), payload.taskId, token);
  return "Success";
}

// ลบงานหลักพร้อมงานย่อยทั้งหมด
function deleteTask(token, taskId) {
  requireRole_(token, ["ผู้แก้ไข"]);
  const raw = sheetToObjects_(SHEET_NAMES.TASKS);
  const task = raw.find(t => t.TaskID === taskId);
  const children = raw.filter(t => t.ParentTaskID === taskId).map(t => t.TaskID);
  children.forEach(id => deleteRowsByField_(SHEET_NAMES.TASKS, "TaskID", id));
  deleteRowsByField_(SHEET_NAMES.TASKS, "TaskID", taskId);
  logActivity_("ลบงาน", "ลบงาน: " + (task ? task["ชื่องาน"] : taskId) + (children.length ? " (พร้อมงานย่อย " + children.length + " รายการ)" : ""), taskId, token);
  return "Success";
}

function markTaskComplete(token, taskId, link) {
  requireRole_(token, USER_ROLES); // เจ้าหน้าที่ติ๊กงานเสร็จได้
  if (!link) throw new Error("ต้องแนบลิงก์เอกสาร/หลักฐานก่อนปิดงาน");

  const raw = sheetToObjects_(SHEET_NAMES.TASKS).map(normalizeTaskRow_);
  const task = raw.find(t => t.TaskID === taskId);
  if (!task) throw new Error("ไม่พบงานนี้");

  const subtasks = raw.filter(t => t.ParentTaskID === taskId);
  const overall = computeOverallProgress_(task["ความคืบหน้า"], subtasks.map(s => s["ความคืบหน้า"]));
  if (overall < 100) throw new Error("ความคืบหน้ารวมยังไม่ครบ 100% (ปัจจุบัน " + overall + "%)");

  updateFieldById_(SHEET_NAMES.TASKS, "TaskID", taskId, "ลิงก์", link);
  updateFieldById_(SHEET_NAMES.TASKS, "TaskID", taskId, "สถานะ", "เสร็จสิ้น");
  updateFieldById_(SHEET_NAMES.TASKS, "TaskID", taskId, "ความคืบหน้า", 100);
  updateFieldById_(SHEET_NAMES.TASKS, "TaskID", taskId, "วันที่ปิดงาน", new Date());
  logActivity_("ปิดงาน", "ปิดงาน: " + task["ชื่องาน"], taskId, token);
  return "Success";
}

// เปิดงานที่เคยปิดแล้วกลับมาดำเนินการใหม่ (ใช้ตอนติ๊กเช็คบ็อกซ์ออกจากงานที่เสร็จแล้ว)
// คงค่าความคืบหน้าและลิงก์หลักฐานเดิมไว้ เปลี่ยนแค่สถานะและล้างวันที่ปิดงาน
function reopenTask(token, taskId) {
  requireRole_(token, USER_ROLES); // เจ้าหน้าที่เปิดงานที่ตัวเองติ๊กเสร็จกลับมาแก้ได้
  const raw = sheetToObjects_(SHEET_NAMES.TASKS);
  const task = raw.find(t => t.TaskID === taskId);
  if (!task) throw new Error("ไม่พบงานนี้");
  updateFieldById_(SHEET_NAMES.TASKS, "TaskID", taskId, "สถานะ", "กำลังดำเนินการ");
  updateFieldById_(SHEET_NAMES.TASKS, "TaskID", taskId, "วันที่ปิดงาน", "");
  logActivity_("เปิดงานอีกครั้ง", "เปิดงานอีกครั้ง: " + task["ชื่องาน"], taskId, token);
  return "Success";
}

// ================= หน้าสรุป (Dashboard) =================

function buildDashboard_(personnel, courses, tasks, completedYear) {
  const statusCount = {};
  personnel.forEach(p => {
    const s = p["สถานะ"] || "ไม่ระบุ";
    statusCount[s] = (statusCount[s] || 0) + 1;
  });

  const now = new Date();
  const year = completedYear || now.getFullYear();

  const completedCoursesCount = courses.filter(c => {
    if (!c["วันสิ้นสุด"]) return false;
    const end = new Date(c["วันสิ้นสุด"]);
    return end.getFullYear() === year && end < now;
  }).length;

  const notDone = tasks.filter(t => t["สถานะ"] !== "เสร็จสิ้น");
  const taskUpcomingCount = notDone.filter(t => t["วันที่สั่งการ"] && new Date(t["วันที่สั่งการ"]) > now).length;
  const taskInProgressCount = notDone.length - taskUpcomingCount;
  const taskCompletedCount = tasks.filter(t => {
    if (t["สถานะ"] !== "เสร็จสิ้น") return false;
    if (!t["วันที่ปิดงาน"]) return false;
    return new Date(t["วันที่ปิดงาน"]).getFullYear() === year;
  }).length;

  const overdueTasks = notDone.filter(t => t["วันกำหนดส่ง"] && new Date(t["วันกำหนดส่ง"]) < now);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);
  const nearDueCount = notDone.filter(t => {
    if (!t["วันกำหนดส่ง"]) return false;
    const due = new Date(t["วันกำหนดส่ง"]);
    return due >= now && due <= sevenDaysFromNow;
  }).length;

  const upcomingDeadlineTasks = notDone
    .slice()
    .sort((a, b) => new Date(a["วันกำหนดส่ง"]) - new Date(b["วันกำหนดส่ง"]))
    .slice(0, 5)
    .map(t => ({
      taskId: t.TaskID,
      name: t["ชื่องาน"],
      dueDate: t["วันกำหนดส่ง"],
      progress: t.overallProgress,
      assignee: t["ผู้รับผิดชอบ"]
    }));

  return {
    totalPersonnel: personnel.length,
    statusCount: statusCount,
    ongoingCoursesCount: courses.filter(c => c.computedStatus === "กำลังดำเนินการ").length,
    upcomingCoursesCount: courses.filter(c => c.computedStatus === "กำลังจะฝึก").length,
    completedCoursesCount: completedCoursesCount,
    completedYear: year,
    taskInProgressCount: taskInProgressCount,
    taskUpcomingCount: taskUpcomingCount,
    taskCompletedCount: taskCompletedCount,
    overdueTasksCount: overdueTasks.length,
    overdueTaskIds: overdueTasks.map(t => t.TaskID),
    nearDueCount: nearDueCount,
    upcomingDeadlineTasks: upcomingDeadlineTasks
  };
}

function getDashboardSummary(token, completedYear) {
  requireRole_(token, USER_ROLES);
  return buildDashboard_(getPersonnelList(), getCoursesList(), getTasksList(), completedYear);
}

// ================= ปฏิทินรวม (Calendar) =================

function buildCalendarEvents_(courses, tasks) {
  const courseEvents = courses.map(c => ({
    id: c.CourseID,
    title: c["ชื่อหลักสูตร"] + (c["รุ่น"] ? " รุ่น " + c["รุ่น"] : ""),
    status: c.computedStatus,
    start: c["วันเริ่ม"],
    end: c["วันสิ้นสุด"],
    type: "course"
  }));

  const taskEvents = [];
  tasks.forEach(t => {
    taskEvents.push({
      id: t.TaskID,
      title: t["ชื่องาน"],
      start: t["วันที่สั่งการ"],
      end: t["วันกำหนดส่ง"],
      type: t["สถานะ"] === "เสร็จสิ้น" ? "task-done" : "task"
    });
    (t.subtasks || []).forEach(s => {
      taskEvents.push({
        id: s.TaskID,
        title: s["ชื่องาน"] + " (งานย่อย)",
        start: s["วันที่สั่งการ"],
        end: s["วันกำหนดส่ง"],
        type: s["สถานะ"] === "เสร็จสิ้น" ? "task-done" : "subtask"
      });
    });
  });

  return courseEvents.concat(taskEvents).filter(e => e.start);
}

function getCalendarEvents() {
  return buildCalendarEvents_(getCoursesList(), getTasksList());
}

// ================= โหลดข้อมูลทั้งระบบในครั้งเดียว =================
// เดิมหน้าบ้านยิง 6 คำขอพร้อมกัน แต่ละคำขออ่านชีทซ้ำหลายรอบ ทำให้หน่วงมาก
// ตัวนี้อ่านชีทชุดเดียวแล้วประกอบผลลัพธ์ทั้งหมด เหลือ 1 คำขอต่อการรีเฟรช
function getBootstrapData(token, completedYear) {
  requireRole_(token, USER_ROLES);
  const personnel = getPersonnelList();
  const courses = getCoursesList();
  const tasks = getTasksList();
  return {
    initial: getInitialData(),
    personnel: personnel,
    courses: courses,
    tasks: tasks,
    dashboard: buildDashboard_(personnel, courses, tasks, completedYear),
    events: buildCalendarEvents_(courses, tasks)
  };
}

// v7: additive migration; never clears existing data or shifts columns.
function ensureColumns_(sheet, required) {
  const headers = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  required.forEach(h => { if (headers.indexOf(h) < 0) headers.push(h); });
  if (headers.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return headers;
}
function appendObject_(sheet, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => obj[h] === undefined ? "" : obj[h]));
}
function upgradeSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [[SHEET_NAMES.COURSES, ["รุ่น"]], [SHEET_NAMES.USERS, ["FirstName", "LastName"]],
   [SHEET_NAMES.ACTIVITY_LOG, ["ActorUsername", "ActorFullName", "ActorRole"]]].forEach(item => {
    const sheet = ss.getSheetByName(item[0]);
    if (!sheet) throw new Error("ไม่พบชีท " + item[0] + " กรุณาตั้งค่าโครงสร้างชีทก่อน");
    ensureColumns_(sheet, item[1]);
  });
  applySheetValidation_();
  SpreadsheetApp.getUi().alert('อัปเดตเรียบร้อย ข้อมูลเดิมยังอยู่ครบ: กรอก FirstName และ LastName ใน Users แล้วเข้าสู่ระบบใหม่');
}
// Read each relationship table once; only return IDs selected by the visible filters.
function getExportData(token, selection) {
  requireRole_(token, USER_ROLES);
  selection = selection || {};
  const people = getPersonnelList(), courses = getCoursesList();
  const training = sheetToObjects_(SHEET_NAMES.TRAINING_HISTORY);
  const ranks = sheetToObjects_(SHEET_NAMES.RANK_HISTORY);
  const personById = new Map(people.map(p => [p.PersonnelID,p]));
  const courseById = new Map(courses.map(c => [c.CourseID,c]));
  const personnel = [...new Set(selection.personnelIds || [])].map(id => {
    const person = personById.get(id);
    if (!person) return null;
    const rankHistory = ranks.filter(r => r.PersonnelID === id).map(r => ({recordId:r.RecordID,rank:r['ยศ'],date:formatDate_(r['วันที่ติดยศ'])})).sort((a,b) => a.date.localeCompare(b.date));
    const history = training.filter(h => h.PersonnelID === id).map(h => {
      const c = courseById.get(h.CourseID) || {};
      return {recordId:h.RecordID,courseId:h.CourseID,courseName:c['ชื่อหลักสูตร'] || '(ไม่พบหลักสูตรนี้แล้ว)',batch:c['รุ่น'] || '',courseType:c['ประเภทหลักสูตร'] || '',unit:c['หน่วยจัดฝึก'] || '',startDate:c['วันเริ่ม'] || '',endDate:c['วันสิ้นสุด'] || '',status:c.computedStatus || 'ไม่ทราบสถานะ'};
    });
    return {person,rankHistory,history,age:computeAgeYears_(person['วันเกิด']),serviceDuration:rankHistory.length ? computeDurationFromDate_(rankHistory[0].date) : null};
  }).filter(Boolean);
  const courseDetails = [...new Set(selection.courseIds || [])].map(id => {
    const course = courseById.get(id);
    if (!course) return null;
    const trainees = training.filter(h => h.CourseID === id).map(h => {
      const p = personById.get(h.PersonnelID) || {};
      return {personnelId:h.PersonnelID,rank:p['ยศ'] || '',firstName:p['ชื่อ'] || '',lastName:p['สกุล'] || '',position:p['ตำแหน่ง'] || '',unit:p['สังกัด'] || ''};
    });
    return {course,trainees};
  }).filter(Boolean);
  logActivity_('ส่งออกข้อมูล', 'เตรียมส่งออกกำลังพล ' + personnel.length + ' นาย และหลักสูตร ' + courseDetails.length + ' รายการ', '', token);
  return {personnel, courses:courseDetails};
}
