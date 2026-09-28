/** @format */

function doPost(e) {
  try {
    // Parse JSON payload or fallback to parameter
    var p = {};
    if (e && e.postData && e.postData.contents) {
      p = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      p = e.parameter;
    }

    var SPREADSHEET_ID = "1_8OVN1eZSVctG2IL3y5hhEQfPiBtr3Kw5vLI9nqWUiI";
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();

    // 1. Setup Header Row dynamically if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
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
      ]);
      sheet.getRange(1, 1, 1, 11).setFontWeight("bold");
    }

    var respondentName = p.respondentName || "Anonymous";

    // 2. Drive Folder Handling
    var PARENT_FOLDER_ID = "1Lwbvmf_dkms7FAhqZaXUReSBULkhRbcG";
    var parentFolder;

    try {
      if (
        PARENT_FOLDER_ID &&
        PARENT_FOLDER_ID !== "YOUR_ACTUAL_FOLDER_ID_STRING"
      ) {
        parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
      } else {
        parentFolder = DriveApp.getRootFolder();
      }
    } catch (folderErr) {
      parentFolder = DriveApp.getRootFolder();
    }

    var timestampString = new Date().toLocaleDateString();
    var newFolder = parentFolder.createFolder(
      "Survey - " + respondentName + " (" + timestampString + ")",
    );
    var folderUrl = newFolder.getUrl();

    // 3. Process base64 files
    var fileNotes = [];
    var fileFields = [
      "file_1_1",
      "file_1_2",
      "file_2_1",
      "file_2_2",
      "file_3_1",
      "file_3_2",
    ];

    fileFields.forEach(function (fieldId) {
      if (p[fieldId] && p[fieldId + "_name"]) {
        try {
          var fileData = Utilities.base64Decode(p[fieldId]);
          var blob = Utilities.newBlob(
            fileData,
            p[fieldId + "_type"] || "application/octet-stream",
            p[fieldId + "_name"],
          );
          newFolder.createFile(blob);
          fileNotes.push(p[fieldId + "_name"]);
        } catch (fileErr) {
          fileNotes.push(fieldId + " failed: " + fileErr.toString());
        }
      }
    });

    var finalFileNote =
      fileNotes.length > 0 ? fileNotes.join(", ") : "No files uploaded";

    // 4. Save entry to Sheet (bypassing Google Sheet Table blank-row skipping)
    var rowData = [
      p.timestamp || new Date().toISOString(),
      respondentName,
      p.q1_1 || "",
      p.q1_2 || "",
      p.q1_2_note || "",
      p.q2_1 || "",
      p.q2_2 || "",
      p.q3_1 || "",
      p.q3_2 || "",
      finalFileNote,
      folderUrl,
    ];

    var colA = sheet.getRange("A:A").getValues();
    var lastRow = 0;
    for (var i = 0; i < colA.length; i++) {
      if (colA[i][0] !== "") {
        lastRow = i + 1;
      }
    }

    sheet.getRange(lastRow + 1, 1, 1, rowData.length).setValues([rowData]);

    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", folderUrl: folderUrl }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.toString() }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
