/**
 * Survey Form Controller — Modular & DRY
 * @format
 */

const CONFIG = {
  SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbwC-fV_uUUAXZ0gL7DWpw4alg8zBPzFKtwVmJOWae2rcXrRTEBSeXbATAGuRvUBxCT86g/exec",
  MAX_FILE_BYTES: 3 * 1024 * 1024,
  MAX_RETRIES: 2, // total attempts = 1 original + MAX_RETRIES
  RETRY_DELAY_MS: 2500,
  OTHER_FIELDS: ["q1_2", "q2_1", "q3_2"],
  REQUIRED_TEXT_FIELDS: ["respondentName", "q1_1", "q2_2", "q3_1"],
  FILE_FIELDS: [
    "file_1_1",
    "file_1_2",
    "file_2_1",
    "file_2_2",
    "file_3_1",
    "file_3_2",
  ],
};

// ==========================================
// INITIALISATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("surveyForm");
  initDynamicOtherFields(form, CONFIG.OTHER_FIELDS);
  initFormSubmit(form);
});

// ==========================================
// DYNAMIC "OTHER" RADIO HANDLING
// ==========================================
function initDynamicOtherFields(form, fields) {
  fields.forEach((fieldName) => {
    const radios = form.querySelectorAll(`input[name="${fieldName}"]`);
    const otherWrap = document.getElementById(`other_${fieldName}`);
    const otherInput = otherWrap?.querySelector("input");

    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        const isOther = radio.value === "__other__" && radio.checked;
        if (otherWrap) otherWrap.classList.toggle("hidden", !isOther);
        if (otherInput) {
          if (isOther) {
            otherInput.setAttribute("required", "required");
            otherInput.focus();
          } else {
            otherInput.removeAttribute("required");
            otherInput.value = "";
          }
        }
      });
    });
  });
}

// ==========================================
// FORM SUBMIT + RETRY LOGIC
// ==========================================
function initFormSubmit(form) {
  const statusEl = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    updateStatus(statusEl, "");

    if (!validateForm(form)) {
      updateStatus(
        statusEl,
        "Mohon lengkapi semua field yang wajib diisi.",
        "error",
      );
      return;
    }

    const sizeError = validateFileSizes(
      CONFIG.FILE_FIELDS,
      CONFIG.MAX_FILE_BYTES,
    );
    if (sizeError) {
      updateStatus(statusEl, sizeError, "error");
      return;
    }

    setLoadingState(submitBtn, true);

    try {
      updateStatus(statusEl, "Memproses data dan lampiran...", "info");
      const payload = await buildFormPayload(form);

      const resData = await sendWithRetry(payload, statusEl);

      if (resData.status === "error") {
        throw new Error(resData.message || "Gagal menyimpan data.");
      }

      const successMsg = `Jawaban berhasil disimpan! <a href="${resData.folderUrl}" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline;">Buka Folder Google Drive</a>`;
      updateStatus(statusEl, successMsg, "success");
      form.reset();
      resetOtherFields(CONFIG.OTHER_FIELDS);
    } catch (err) {
      console.error(err);
      updateStatus(
        statusEl,
        `Gagal mengirim: ${err.message || "Network error"}. Coba lagi.`,
        "error",
      );
    } finally {
      setLoadingState(submitBtn, false);
    }
  });
}

/**
 * Sends the payload. On "Server busy" responses, waits and retries
 * up to CONFIG.MAX_RETRIES times.
 */
async function sendWithRetry(payload, statusEl) {
  let lastError = null;

  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      updateStatus(
        statusEl,
        `Server sibuk. Mencoba lagi (${attempt}/${CONFIG.MAX_RETRIES})...`,
        "info",
      );
      await delay(CONFIG.RETRY_DELAY_MS);
    } else {
      updateStatus(statusEl, "Mengirim jawaban ke server...", "info");
    }

    try {
      const resData = await sendPayload(CONFIG.SCRIPT_URL, payload);

      // Retry only on explicit busy signal
      if (
        resData.status === "error" &&
        isBusyMessage(resData.message) &&
        attempt < CONFIG.MAX_RETRIES
      ) {
        lastError = new Error(resData.message);
        continue;
      }

      return resData;
    } catch (networkErr) {
      // Network / parse failures: retry as well
      lastError = networkErr;
      if (attempt < CONFIG.MAX_RETRIES) continue;
      throw networkErr;
    }
  }

  throw lastError || new Error("Server busy. Please try again in a moment.");
}

function isBusyMessage(message) {
  if (!message || typeof message !== "string") return false;
  const lower = message.toLowerCase();
  return lower.includes("server busy") || lower.includes("sibuk");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================
// PAYLOAD BUILDER
// ==========================================
async function buildFormPayload(form) {
  const data = {
    timestamp: new Date().toISOString(),
    respondentName: form.respondentName.value.trim(),
    q1_1: form.q1_1.value.trim(),
    q1_2: getRadioValue(form, "q1_2"),
    q1_2_note: form.q1_2_note.value.trim(),
    q2_1: getRadioValue(form, "q2_1"),
    q2_2: form.q2_2.value.trim(),
    q3_1: form.q3_1.value.trim(),
    q3_2: getRadioValue(form, "q3_2"),
  };

  await Promise.all(
    CONFIG.FILE_FIELDS.map(async (fieldId) => {
      const input = document.getElementById(fieldId);
      if (input?.files?.[0]) {
        const file = input.files[0];
        data[fieldId] = await toBase64(file);
        data[`${fieldId}_name`] = file.name;
        data[`${fieldId}_type`] = file.type || "application/octet-stream";
      }
    }),
  );

  return data;
}

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === "string" ? result.split(",")[1] : "");
    };
    reader.onerror = (error) => reject(error);
  });

async function sendPayload(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

// ==========================================
// VALIDATION
// ==========================================
function validateForm(form) {
  let valid = true;

  CONFIG.REQUIRED_TEXT_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || !(el.value || "").trim()) {
      showError(id, "Field ini wajib diisi.");
      valid = false;
    }
  });

  CONFIG.OTHER_FIELDS.forEach((name) => {
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

function validateFileSizes(fields, maxBytes) {
  for (const id of fields) {
    const input = document.getElementById(id);
    if (input?.files?.[0]) {
      const file = input.files[0];
      if (file.size > maxBytes) {
        return `File "${file.name}" terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimal 3 MB.`;
      }
    }
  }
  return null;
}

function getRadioValue(form, name) {
  const selected = form.querySelector(`input[name="${name}"]:checked`);
  if (!selected) return "";
  if (selected.value === "__other__") {
    const other = form.querySelector(`input[name="${name}_other"]`);
    return (other?.value || "").trim() || "";
  }
  return selected.value;
}

// ==========================================
// UI HELPERS
// ==========================================
function showError(nameOrId, message) {
  const msgEl = document.querySelector(`.error-msg[data-for="${nameOrId}"]`);
  if (msgEl) msgEl.textContent = message;

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

function resetOtherFields(fields) {
  fields.forEach((name) => {
    document.getElementById(`other_${name}`)?.classList.add("hidden");
  });
}

function setLoadingState(buttonEl, isLoading) {
  buttonEl.disabled = isLoading;
  document.querySelector(".btn-text")?.classList.toggle("hidden", isLoading);
  document.querySelector(".btn-loading")?.classList.toggle("hidden", !isLoading);
}

function updateStatus(el, message, type = "info") {
  el.innerHTML = message;
  el.className = `form-status ${type}`;
}
