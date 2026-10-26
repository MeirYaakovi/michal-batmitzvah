// RSVP backend for the Bat Mitzvah site. Paste into Extensions > Apps Script of a Google Sheet.
// 1) Run setup() once (authorize when asked)  2) Deploy > New deployment > Web app
//    Execute as: Me, Who has access: Anyone  3) Copy the Web app URL into docs/config.json (rsvpEndpoint)

const SHEET = 'אישורים';
const SUMMARY = 'סיכום';
const STATUS = { yes: 'מגיעים', maybe: 'אולי', no: 'לא מגיעים' };
const MAX_GUESTS = 10;

function setup() {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (s.getLastRow() === 0) {
    s.appendRow(['תאריך', 'שם', 'טלפון', 'סטטוס', 'אורחים', 'הערה']);
    s.getRange('A1:F1').setFontWeight('bold').setBackground('#3a1f3d').setFontColor('#ffffff');
    s.setFrozenRows(1);
    s.setColumnWidths(1, 6, 140);
    s.setColumnWidth(6, 320);
    s.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(Object.values(STATUS), true).build());
    s.getRange('A2:A').setNumberFormat('dd/MM/yyyy HH:mm');
    s.getRange('C2:C').setNumberFormat('@');
  }
  s.setRightToLeft(true);

  let t = ss.getSheetByName(SUMMARY) || ss.insertSheet(SUMMARY, 0);
  t.clear();
  t.setRightToLeft(true);
  const rows = [
    ['🌸 בת מצווה מיכל — סיכום', ''],
    ['אורחים מאושרים', `=SUMIF('${SHEET}'!D:D,"${STATUS.yes}",'${SHEET}'!E:E)`],
    ['משפחות שאישרו', `=COUNTIF('${SHEET}'!D:D,"${STATUS.yes}")`],
    ['אולי — מספר פניות', `=COUNTIF('${SHEET}'!D:D,"${STATUS.maybe}")`],
    ['אולי — אורחים', `=SUMIF('${SHEET}'!D:D,"${STATUS.maybe}",'${SHEET}'!E:E)`],
    ['לא מגיעים', `=COUNTIF('${SHEET}'!D:D,"${STATUS.no}")`],
    ['סה"כ פניות', `=COUNTA('${SHEET}'!B2:B)`],
  ];
  t.getRange(1, 1, rows.length, 2).setValues(rows);
  t.getRange('A1').setFontSize(16).setFontWeight('bold');
  t.getRange('A2:A7').setFontWeight('bold');
  t.getRange('B2:B7').setFontSize(14).setHorizontalAlignment('right');
  t.setColumnWidth(1, 220);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.website) return ok_();                                  // honeypot
    const name = clean_(b.name, 80);
    const phone = clean_(b.phone, 20).replace(/[^\d+\-\s]/g, '');
    const status = STATUS[b.attending];
    if (name.length < 2 || !status || phone.replace(/\D/g, '').length < 9) return ok_();
    let guests = status === STATUS.no ? 0 : Math.min(Math.max(parseInt(b.guests, 10) || 1, 1), MAX_GUESTS);
    const note = clean_(b.note, 500);

    lock.waitLock(10000);
    SpreadsheetApp.getActive().getSheetByName(SHEET)
      .appendRow([new Date(), name, "'" + phone, status, guests, note]);
    lock.releaseLock();

    try {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
        `אישור הגעה חדש: ${name} — ${status}`,
        `${name}\n${phone}\n${status}${guests ? ' · ' + guests + ' אורחים' : ''}\n${note}`);
    } catch (err) { /* mail quota or permission — ignore */ }
  } catch (err) {
    console.error(err);
  }
  return ok_();
}

function doGet() { return ok_(); }

function ok_() {
  return ContentService.createTextOutput('ok');
}

// strip control chars and angle brackets; neutralise spreadsheet formulas
function clean_(s, max) {
  s = String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
