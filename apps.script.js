/** @format */

// ==========================================
// CONFIGURATION (single source of truth)
// ==========================================
const CONFIG = {
  SPREADSHEET_ID: "1_8OVN1eZSVctG2IL3y5hhEQfPiBtr3Kw5vLI9nqWUiI",
  PARENT_FOLDER_ID: "1Lwbvmf_dkms7FAhqZaXUReSBULkhRbcG",
  SHEET_NAME: "Survey",
  DEFAULT_RESPONDENT: "Anonymous",
  DEFAULT_MIME_TYPE: "application/octet-stream",
  LOCK_TIMEOUT_MS: 20000, // Short critical section; 20s is ample
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
  try {
    const payload = parsePayload(e);

    // --- Phase 1: Work that does NOT need the lock ---
    const respondentName = sanitizeInput(
      payload.respondentName || CONFIG.DEFAULT_RESPONDENT,
    );
    const timestampStr = payload.timestamp || new Date().toISOString();

    const folderData = createRespondentFolder(respondentName, timestampStr);
    const fileNote = processFileUploads(payload, folderData.folder);

    const rowData = buildRowData(
      payload,
      timestampStr,
      respondentName,
      fileNote,
      folderData.url,
    );

    // --- Phase 2: Narrow critical section (sheet only) ---
    appendRowWithLock(rowData);

    return createJsonResponse("success", "Data saved successfully", {
      folderId: folderData.id,
      folderUrl: folderData.url,
    });
  } catch (err) {
    return createJsonResponse("error", err.message || err.toString());
  }
}

// ==========================================
// LOCKED SHEET WRITE (minimal critical section)
// ==========================================
function appendRowWithLock(rowData) {
  const lock = LockService.getScriptLock();

  if (!lock.waitLock(CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error("Server busy. Please try again in a moment.");
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = getOrCreateSheet(spreadsheet, CONFIG.SHEET_NAME);
    ensureHeaders(sheet, HEADERS);
    sheet.appendRow(rowData);
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// FILE & FOLDER HELPERS (no lock)
// ==========================================
/**
 * Creates a sub-folder under the configured parent.
 * Fails fast if the parent folder is inaccessible — no root-folder fallback
 * (root requires broader scopes and is rarely the desired location).
 */
function createRespondentFolder(respondentName, timestampStr) {
  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
  } catch (err) {
    throw new Error(
      "Tidak dapat mengakses folder induk (PARENT_FOLDER_ID). " +
        "Pastikan ID benar dan skrip memiliki izin Drive. Detail: " +
        (err.message || err),
    );
  }

  const dateStr = Utilities.formatDate(
    new Date(timestampStr),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm",
  );

  const folder = parentFolder.createFolder(
    `Survey - ${respondentName} (${dateStr})`,
  );

  return {
    id: folder.getId(),
    url: folder.getUrl(),
    folder: folder,
  };
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

// ==========================================
// DATA BUILDERS
// ==========================================
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

// ==========================================
// UTILITIES
// ==========================================
function parsePayload(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  if (e && e.parameter) {
    return e.parameter;
  }
  return {};
}

function sanitizeInput(value) {
  if (typeof value !== "string") return value || "";
  const trimmed = value.trim();
  // Prevent formula injection in Sheets
  return /^[=+\-@]/.test(trimmed) ? "'" + trimmed : trimmed;
}

function getOrCreateSheet(spreadsheet, sheetName) {
  return (
    spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName)
  );
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
}

function createJsonResponse(status, message, extraData = {}) {
  return ContentService.createTextOutput(
    JSON.stringify(Object.assign({ status, message }, extraData)),
  ).setMimeType(ContentService.MimeType.JSON);
}
