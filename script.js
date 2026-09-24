/**
 * Survey Form — Frosted Glass
 * Submits text answers to Google Apps Script (which can write to Google Sheets / Drive)
 *
 * SETUP (one-time):
 * 1. Create a Google Sheet.
 * 2. Extensions → Apps Script. Paste the doPost function below (see comment at bottom).
 * 3. Deploy → New deployment → Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web App URL and paste it into GOOGLE_SCRIPT_URL below.
 *
 * @format
 */

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwC-fV_uUUAXZ0gL7DWpw4alg8zBPzFKtwVmJOWae2rcXrRTEBSeXbATAGuRvUBxCT86g/exec"; // ← paste your Apps Script Web App URL here

// Fields that use "Tulis Jawaban Anda" (radio value === "__other__")
const OTHER_FIELDS = ["q1_2", "q2_1", "q3_2"];

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("surveyForm");
  const statusEl = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");

  // Show/hide custom text inputs when "Tulis Jawaban Anda" is selected
  OTHER_FIELDS.forEach((name) => {
    const radios = form.querySelectorAll(`input[name="${name}"]`);
    const otherWrap = document.getElementById(`other_${name}`);
    const otherInput = otherWrap?.querySelector("input");

    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.value === "__other__" && radio.checked) {
          otherWrap.classList.remove("hidden");
          otherInput?.setAttribute("required", "required");
          otherInput?.focus();
        } else if (radio.checked) {
          otherWrap.classList.add("hidden");
          otherInput?.removeAttribute("required");
          if (otherInput) otherInput.value = "";
        }
      });
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    statusEl.textContent = "";
    statusEl.className = "form-status";

    if (!validateForm()) {
      statusEl.textContent = "Mohon lengkapi semua field yang wajib diisi.";
      statusEl.classList.add("error");
      return;
    }

    const data = collectData();

    // If no Google Script URL configured, fall back to downloadable JSON
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.trim() === "") {
      downloadAsJson(data);
      statusEl.textContent =
        "URL Google Apps Script belum dikonfigurasi. Jawaban diunduh sebagai file JSON. Lihat petunjuk di script.js.";
      statusEl.classList.add("success");
      return;
    }

    submitBtn.disabled = true;
    document.querySelector(".btn-text").classList.add("hidden");
    document.querySelector(".btn-loading").classList.remove("hidden");

    try {
      // Apps Script expects form-urlencoded or JSON; we send as form data for simplicity
      const formBody = new URLSearchParams();
      Object.entries(data).forEach(([k, v]) => formBody.append(k, v));

      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", // Apps Script web apps often need no-cors; response will be opaque
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString(),
      });

      // With no-cors we can't read the response; assume success if no network error
      statusEl.textContent =
        "Jawaban berhasil dikirim. Terima kasih! (File lampiran tidak terkirim otomatis — kirim manual jika perlu.)";
      statusEl.classList.add("success");
      form.reset();
      // Hide any open "other" inputs after reset
      OTHER_FIELDS.forEach((name) => {
        document.getElementById(`other_${name}`)?.classList.add("hidden");
      });
    } catch (err) {
      console.error(err);
      statusEl.textContent =
        "Gagal mengirim. Periksa koneksi atau konfigurasi URL Apps Script. Jawaban juga bisa diunduh sebagai JSON.";
      statusEl.classList.add("error");
      downloadAsJson(data); // safety net
    } finally {
      submitBtn.disabled = false;
      document.querySelector(".btn-text").classList.remove("hidden");
      document.querySelector(".btn-loading").classList.add("hidden");
    }
  });
});

function validateForm() {
  let valid = true;
  const form = document.getElementById("surveyForm");

  // Required text / textarea
  const requiredText = ["respondentName", "q1_1", "q2_2", "q3_1"];
  requiredText.forEach((id) => {
    const el = document.getElementById(id);
    const val = (el.value || "").trim();
    if (!val) {
      showError(id, "Field ini wajib diisi.");
      valid = false;
    }
  });

  // Radio groups + optional other
  OTHER_FIELDS.forEach((name) => {
    const selected = form.querySelector(`input[name="${name}"]:checked`);
    if (!selected) {
      showError(name, "Pilih salah satu opsi.");
      valid = false;
      return;
    }
    if (selected.value === "__other__") {
      const otherInput = form.querySelector(`input[name="${name}_other"]`);
      if (!otherInput || !(otherInput.value || "").trim()) {
        showError(name, "Tulis jawaban Anda.");
        valid = false;
      }
    }
  });

  return valid;
}

function showError(nameOrId, message) {
  const msgEl = document.querySelector(`.error-msg[data-for="${nameOrId}"]`);
  if (msgEl) msgEl.textContent = message;

  // Highlight the field container
  const field =
    document.getElementById(nameOrId)?.closest(".field") ||
    document.querySelector(`input[name="${nameOrId}"]`)?.closest(".field");
  field?.classList.add("has-error");
}

function clearErrors() {
  document
    .querySelectorAll(".error-msg")
    .forEach((el) => (el.textContent = ""));
  document
    .querySelectorAll(".field.has-error")
    .forEach((el) => el.classList.remove("has-error"));
}

function collectData() {
  const form = document.getElementById("surveyForm");
  const data = {
    timestamp: new Date().toISOString(),
    respondentName: form.respondentName.value.trim(),
    q1_1: form.q1_1.value.trim(),
    q1_2: getRadioValue("q1_2"),
    q1_2_note: form.q1_2_note.value.trim(),
    q2_1: getRadioValue("q2_1"),
    q2_2: form.q2_2.value.trim(),
    q3_1: form.q3_1.value.trim(),
    q3_2: getRadioValue("q3_2"),
  };

  // Note about files (files are not uploaded automatically)
  const fileNotes = [];
  [
    "file_1_1",
    "file_1_2",
    "file_2_1",
    "file_2_2",
    "file_3_1",
    "file_3_2",
  ].forEach((id) => {
    const input = document.getElementById(id);
    if (input?.files?.length) {
      const names = Array.from(input.files)
        .map((f) => f.name)
        .join(", ");
      fileNotes.push(`${id}: ${names}`);
    }
  });
  if (fileNotes.length) data.fileAttachmentsNote = fileNotes.join(" | ");

  return data;
}

function getRadioValue(name) {
  const form = document.getElementById("surveyForm");
  const selected = form.querySelector(`input[name="${name}"]:checked`);
  if (!selected) return "";
  if (selected.value === "__other__") {
    const other = form.querySelector(`input[name="${name}_other"]`);
    return (other?.value || "").trim() || "(jawaban kustom kosong)";
  }
  return selected.value;
}

function downloadAsJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `survei-email-${data.respondentName || "anonim"}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/*
 * ===== Google Apps Script (paste into script.google.com) =====
 *
 * function doPost(e) {
 *   try {
 *     var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *     // Optional: create header row if empty
 *     if (sheet.getLastRow() === 0) {
 *       sheet.appendRow([
 *         "Timestamp", "Nama", "1.1 Lokasi Sistem", "1.2 Ketersediaan HW",
 *         "1.2 Catatan", "2.1 Akses Admin", "2.2 Konfigurasi",
 *         "3.1 Penanggung traffic@", "3.2 Volume Email", "File Note"
 *       ]);
 *     }
 *     var p = e.parameter;
 *     sheet.appendRow([
 *       p.timestamp || new Date().toISOString(),
 *       p.respondentName || "",
 *       p.q1_1 || "",
 *       p.q1_2 || "",
 *       p.q1_2_note || "",
 *       p.q2_1 || "",
 *       p.q2_2 || "",
 *       p.q3_1 || "",
 *       p.q3_2 || "",
 *       p.fileAttachmentsNote || ""
 *     ]);
 *     return ContentService
 *       .createTextOutput(JSON.stringify({ status: "ok" }))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   } catch (err) {
 *     return ContentService
 *       .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
 *       .setMimeType(ContentService.MimeType.JSON);
 *   }
 * }
 *
 * Deploy as Web App → Execute as Me → Anyone → copy URL into GOOGLE_SCRIPT_URL
 */
