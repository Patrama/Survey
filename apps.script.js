function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // 1. Setup Header Row dynamically if the sheet is brand new
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp", "Nama", "1.1 Lokasi Sistem", "1.2 Ketersediaan HW",
        "1.2 Catatan", "2.1 Akses Admin", "2.2 Konfigurasi",
        "3.1 Penanggung traffic@", "3.2 Volume Email", "File Note", "Folder Link"
      ]);
      sheet.getRange(1, 1, 1, 11).setFontWeight("bold");
    }
    
    // Parse incoming data parameters
    var p = e.parameter;
    var respondentName = p.respondentName || "Anonymous";
    
    // =========================================================================
    // DRIVE STRUCTURE CONFIGURATION
    // =========================================================================
    // 2. Safely retrieve the target parent folder
    var PARENT_FOLDER_ID = "1Lwbvmf_dkms7FAhqZaXUReSBULkhRbcG"; // ← Insert your Drive folder ID here
    var parentFolder;
    
    try {
      if (PARENT_FOLDER_ID && PARENT_FOLDER_ID !== "YOUR_ACTUAL_FOLDER_ID_STRING") {
        parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
      } else {
        parentFolder = DriveApp.getRootFolder();
      }
    } catch(folderErr) {
      parentFolder = DriveApp.getRootFolder(); // Fallback to Root if folder ID is invalid or access denied
    }

    // Create a unique subfolder inside that parent folder for this individual submission
    var timestampString = new Date().toLocaleDateString();
    var newFolder = parentFolder.createFolder("Survey - " + respondentName + " (" + timestampString + ")");
    var folderUrl = newFolder.getUrl(); // Direct folder link written to the sheet
    
    // 3. Process base64 file payloads packaged from the frontend layout
    var fileNotes = [];
    var fileFields = ["file_1_1", "file_1_2", "file_2_1", "file_2_2", "file_3_1", "file_3_2"];
    
    fileFields.forEach(function(fieldId) {
      if (p[fieldId] && p[fieldId + "_name"]) {
        try {
          var fileData = Utilities.base64Decode(p[fieldId]);
          var blob = Utilities.newBlob(fileData, p[fieldId + "_type"], p[fieldId + "_name"]);
          newFolder.createFile(blob);
          fileNotes.push(p[fieldId + "_name"]);
        } catch(fileErr) {
          fileNotes.push(fieldId + " failed: " + fileErr.toString());
        }
      }
    });
    
    var finalFileNote = fileNotes.length > 0 ? fileNotes.join(", ") : "No files uploaded";
    
    // 4. Save form entries along with the new direct Folder Link into your row
    sheet.appendRow([
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
      folderUrl
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", folderUrl: folderUrl }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
