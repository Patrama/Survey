/** @format */

// ==========================================
// CONFIGURATION & MODULAR CONSTANTS (NO HARDCODING)
// ==========================================
const CONFIG = {
  SPREADSHEET_ID: "1_8OVN1eZSVctG2IL3y5hhEQfPiBtr3Kw5vLI9nqWUiI",
  PARENT_FOLDER_ID: "1Lwbvmf_dkms7FAhqZaXUReSBULkhRbcG",
  SHEET_NAME: "Survey",
  DEFAULT_RESPONDENT: "Anonymous",
  DEFAULT_MIME_TYPE: "application/octet-stream",
  LOCK_TIMEOUT_MS: 30000, // Increased to 30 seconds for heavy concurrency buffering
};

const HEADERS = [
  "Timestamp",
  "Nama",
  "1.1 Lokasi Sistem",
  "1.2 Ketersediaan HW",
  "1.2 Catatan",
  "2.1 Akses Admin",
  "2.2 Konfigurasi",
  "3.1 Penanggung traffic@",
  "3.2 Volume Email",
  "File Note",
  "Folder Link",
];

const FILE_FIELDS = [
  "file_1_1",
  "file_1_2",
  "file_2_1",
  "file_2_2",
  "file_3_1",
  "file_3_2",
];

// ==========================================
// MAIN ENTRY POINT
// ==========================================
function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    // 1. Acquire Concurrency Lock
    if (!lock.waitLock(CONFIG.LOCK_TIMEOUT_MS)) {
      return createJsonResponse(
        "error",
        "Server busy. Please try again in a moment.",
      );
    }

    const payload = parsePayload(e);
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = getOrCreateSheet(spreadsheet, CONFIG.SHEET_NAME);

    // Ensure headers exist dynamically
    ensureHeaders(sheet, HEADERS);

    // 2. Prepare Data and Write to Sheet Safely (Critical Section)
    const respondentName = sanitizeInput(
      payload.respondentName || CONFIG.DEFAULT_RESPONDENT,
    );
    const timestampStr = payload.timestamp || new Date().toISOString();

    // Create Folder & Process Files (Isolated inside try-catch to manage locks cleanly)
    let folderUrl = "";
    let fileNotes = "No files uploaded";

    try {
      const folderData = createRespondentFolder(respondentName);
      folderUrl = folderData.url;
      fileNotes = processFileUploads(payload, folderData.folder);
    } catch (fileErr) {
      fileNotes = "File processing failed: " + fileErr.message;
    }

    const rowData = buildRowData(
      payload,
      timestampStr,
      respondentName,
      fileNotes,
      folderUrl,
    );

    // Write row to sheet
    sheet.appendRow(rowData);
  } catch (err) {
    return createJsonResponse("error", err.toString());
  } finally {
    // 3. Release Lock Immediately After Critical Section
    lock.releaseLock();
  }

  return createJsonResponse("success", "Data saved successfully", {
    folderUrl: folderUrl,
  });
}

// ==========================================
// HELPER & UTILITY MODULES
// ==========================================

function parsePayload(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  } else if (e && e.parameter) {
    return e.parameter;
  }
  return {};
}

function sanitizeInput(value) {
  if (typeof value !== "string") return value || "";
  const trimmed = value.trim();
  // Prevent Formula Injection in Google Sheets
  if (/^[=+=\-@]/.test(trimmed)) {
    return "'" + trimmed;
  }
  return trimmed;
}

function getOrCreateSheet(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
}

function createRespondentFolder(respondentName) {
  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
  } catch (err) {
    parentFolder = DriveApp.getRootFolder();
  }

  const dateStr = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm",
  );
  const folder = parentFolder.createFolder(
    `Survey - ${respondentName} (${dateStr})`,
  );
  return { folder: folder, url: folder.getUrl() };
}

function processFileUploads(payload, targetFolder) {
  const notes = [];

  FILE_FIELDS.forEach((fieldId) => {
    const fileData = payload[fieldId];
    const fileName = payload[`${fieldId}_name`];
    const mimeType = payload[`${fieldId}_type`] || CONFIG.DEFAULT_MIME_TYPE;

    if (fileData && fileName) {
      try {
        const blob = Utilities.newBlob(
          Utilities.base64Decode(fileData),
          mimeType,
          fileName,
        );
        targetFolder.createFile(blob);
        notes.push(fileName);
      } catch (err) {
        notes.push(`${fieldId} failed: ${err.message}`);
      }
    }
  });

  return notes.length > 0 ? notes.join(", ") : "No files uploaded";
}

function buildRowData(p, timestamp, respondentName, fileNote, folderUrl) {
  return [
    timestamp,
    respondentName,
    sanitizeInput(p.q1_1),
    sanitizeInput(p.q1_2),
    sanitizeInput(p.q1_2_note),
    sanitizeInput(p.q2_1),
    sanitizeInput(p.q2_2),
    sanitizeInput(p.q3_1),
    sanitizeInput(p.q3_2),
    fileNote,
    folderUrl,
  ];
}

function createJsonResponse(status, message, extraData = {}) {
  const responseObj = Object.assign(
    { status: status, message: message },
    extraData,
  );
  return ContentService.createTextOutput(
    JSON.stringify(responseObj),
  ).setMimeType(ContentService.MimeType.JSON);
}
