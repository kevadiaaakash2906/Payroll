/* =====================================================================
   Utilities — shared helpers used across pages
   ===================================================================== */

function safeFloat(s) {
  if (s === null || s === undefined || s === "") return 0.0;
  try { return parseFloat(String(s).replace(/,/g, "")); }
  catch (e) { return 0.0; }
}

class ValidationError extends Error {}

function parseNonNegFloat(s, fieldName) {
  const text = String(s).trim();
  if (!text) return null;
  const val = parseFloat(text.replace(/,/g, ""));
  if (isNaN(val)) throw new ValidationError(`${fieldName} must be a number (got '${text}').`);
  if (val < 0) throw new ValidationError(`${fieldName} cannot be negative (got ${val}).`);
  return val;
}

function fmtMoney(n) {
  if (n === null || n === undefined) return "";
  return Math.round(n).toLocaleString("en-IN");
}

function getMonthInput(el) {
  const v = el.value; // "2026-07"
  return v ? v + "-01" : "";
}
function setMonthInput(el, month) {
  el.value = month ? month.slice(0, 7) : "";
}
function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
}

function toast(message, type="info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showModal(title, bodyHtml, actionsHtml) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-actions").innerHTML = actionsHtml;
  document.getElementById("modal-overlay").classList.add("active");
  // Auto-focus first input in modal, or first button if no input
  setTimeout(() => {
    const input = document.querySelector("#modal-body input, #modal-body select");
    if (input) input.focus();
    else {
      const btn = document.querySelector("#modal-actions button");
      if (btn) btn.focus();
    }
  }, 50);
}
function closeModal() {
  document.getElementById("modal-overlay").classList.remove("active");
}

document.getElementById("modal-overlay").addEventListener("click", e => {
  if (e.target.id === "modal-overlay") closeModal();
});

// Escape closes modal; Enter in modal inputs triggers primary action
document.addEventListener("keydown", e => {
  const overlay = document.getElementById("modal-overlay");
  if (!overlay.classList.contains("active")) return;

  if (e.key === "Escape") {
    e.preventDefault();
    closeModal();
  }
  if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
    const primaryBtn = document.querySelector("#modal-actions .btn-filled");
    if (primaryBtn) primaryBtn.click();
  }
});
