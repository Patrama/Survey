/**
 * Survey Form — Frosted Glass
 * Submits text + base64 files to Google Apps Script → Sheet + Drive folder
 *
 * SETUP:
 * 1. Create a Google Sheet, open Extensions → Apps Script.
 * 2. Paste the full doPost from apps.script.js (the version that creates subfolders).
 * 3. Deploy → New deployment → Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Paste the Web App URL below.
 * 5. In the Apps Script, set PARENT_FOLDER_ID to your Drive folder ID.
 *
 * IMPORTANT LIMITS:
 * - Google Apps Script POST body practical limit ~5–10 MB after URL-encoding.
 * - Keep each file under ~3 MB. Prefer screenshots / compressed PDFs.
 */

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwC-fV_uUUAXZ0gL7DWpw4alg8zBPzFKtwVmJOWae2rcXrRTEBSeXbATAGuRvUBxCT86g/exec";

const OTHER_FIELDS = ["q1_2", "q2_1", "q3_2"];
const FILE_FIELDS = [
  "file_1_1",
  "file_1_2",
  "file_2_1",
  "file_2_2",
  "file_3_1",
  "file_3_2",
];
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB soft limit per file

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result;
      const base64 = typeof result === "string" ? result.split(",")[1] : "";
      resolve(base64 || "");
    };
    reader.onerror = (error) => reject(error);
  });

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("surveyForm");
  const statusEl = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");

  // Show/hide "Tulis Jawaban Anda" text inputs
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

    // Soft size check before encoding
    const sizeError = checkFileSizes();
    if (sizeError) {
      statusEl.textContent = sizeError;
      statusEl.classList.add("error");
      return;
    }

    submitBtn.disabled = true;
    document.querySelector(".btn-text").classList.add("hidden");
    document.querySelector(".btn-loading").classList.remove("hidden");

    try {
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

      // Encode files to base64 (unique IDs now match the HTML)
      for (const id of FILE_FIELDS) {
        const input = document.getElementById(id);
        if (input && input.files && input.files[0]) {
          const file = input.files[0];
          data[id] = await toBase64(file);
          data[`${id}_name`] = file.name;
          data[`${id}_type`] = file.type || "application/octet-stream";
        }
      }

      if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.trim() === "") {
        downloadAsJson(data);
        statusEl.textContent =
          "URL Google Apps Script belum dikonfigurasi. Jawaban diunduh sebagai JSON.";
        statusEl.classList.add("success");
        return;
      }

      const formBody = new URLSearchParams();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) formBody.append(k, String(v));
      });

      // no-cors is required for many Apps Script deployments; response is opaque.
      // We still treat network success as "sent". Check the Sheet + Drive folder to confirm.
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString(),
      });

      statusEl.innerHTML =
        "Permintaan terkirim. Periksa Google Sheet dan folder Drive " +
        "(nama folder: <strong>Survey – [Nama]</strong>). " +
        "Jika baris tidak muncul, file mungkin terlalu besar atau script belum di-deploy ulang.";
      statusEl.classList.add("success");
      form.reset();
      OTHER_FIELDS.forEach((name) => {
        document.getElementById(`other_${name}`)?.classList.add("hidden");
      });
    } catch (err) {
      console.error(err);
      statusEl.textContent =
        "Gagal mengirim (network/error). Coba lagi atau kurangi ukuran file.";
      statusEl.classList.add("error");
    } finally {
      submitBtn.disabled = false;
      document.querySelector(".btn-text").classList.remove("hidden");
      document.querySelector(".btn-loading").classList.add("hidden");
    }
  });
});

function checkFileSizes() {
  for (const id of FILE_FIELDS) {
    const input = document.getElementById(id);
    if (input && input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > MAX_FILE_BYTES) {
        return `File "${file.name}" terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimal disarankan 3 MB.`;
      }
    }
  }
  return null;
}

function validateForm() {
  let valid = true;
  const form = document.getElementById("surveyForm");

  const requiredText = ["respondentName", "q1_1", "q2_2", "q3_1"];
  requiredText.forEach((id) => {
    const el = document.getElementById(id);
    const val = (el.value || "").trim();
    if (!val) {
      showError(id, "Field ini wajib diisi.");
      valid = false;
    }
  });

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
  const field =
    document.getElementById(nameOrId)?.closest(".field") ||
    document.querySelector(`input[name="${nameOrId}"]`)?.closest(".field");
  field?.classList.add("has-error");
}

function clearErrors() {
  document.querySelectorAll(".error-msg").forEach((el) => (el.textContent = ""));
  document.querySelectorAll(".field.has-error").forEach((el) => el.classList.remove("has-error"));
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
  // Strip huge base64 before download for readability
  const safe = { ...data };
  FILE_FIELDS.forEach((id) => {
    if (safe[id]) safe[id] = `[base64 ${safe[id].length} chars]`;
  });
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `survei-email-${data.respondentName || "anonim"}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
