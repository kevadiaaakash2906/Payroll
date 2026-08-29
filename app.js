/* =====================================================================
   Piecework Payroll Manager — Web App (Firebase + AG Grid + SheetJS)
   ===================================================================== */

// ==================== FIREBASE CONFIG ====================
// REPLACE THESE with your own Firebase project settings
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==================== UTILITIES ====================
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
}
function closeModal() {
  document.getElementById("modal-overlay").classList.remove("active");
}

document.getElementById("modal-overlay").addEventListener("click", e => {
  if (e.target.id === "modal-overlay") closeModal();
});

// ==================== STATE ====================
let currentUser = null;
let currentPage = "dashboard";
let cache = { departments: [], employees: [], payroll: {} };
let undoStack = [];
let bulkGridApi = null;
let selectedEmpId = null;

// ==================== AUTH ====================
auth.onAuthStateChanged(user => {
  currentUser = user;
  if (user) {
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("app-shell").classList.add("active");
    document.getElementById("user-email").textContent = user.email;
    initApp();
  } else {
    document.getElementById("login-screen").classList.add("active");
    document.getElementById("app-shell").classList.remove("active");
  }
});

document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    document.getElementById("login-error").textContent = err.message;
  }
});

document.getElementById("btn-logout").addEventListener("click", () => auth.signOut());

// ==================== DATA SERVICE ====================
async function loadDepartments() {
  const snap = await db.collection("departments").orderBy("name").get();
  cache.departments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return cache.departments;
}

async function loadEmployees() {
  const snap = await db.collection("employees").orderBy("name").get();
  cache.employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return cache.employees;
}

async function getPayroll(employeeId, month) {
  const docId = `${employeeId}_${month}`;
  const doc = await db.collection("payroll").doc(docId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getPayrollForMonth(month) {
  const snap = await db.collection("payroll").where("month", "==", month).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getLastPayrollBefore(employeeId, month) {
  const snap = await db.collection("payroll")
    .where("employeeId", "==", employeeId)
    .where("month", "<", month)
    .orderBy("month", "desc")
    .limit(1)
    .get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function savePayroll(data) {
  const docId = `${data.employeeId}_${data.month}`;
  await db.collection("payroll").doc(docId).set(data, { merge: true });
}

async function deletePayroll(employeeId, month) {
  const docId = `${employeeId}_${month}`;
  await db.collection("payroll").doc(docId).delete();
}

// ==================== ROUTER ====================
function navigate(page) {
  currentPage = page;
  document.querySelectorAll(".page-section").forEach(s => s.classList.remove("active"));
  document.getElementById(`page-${page}`)?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.page === page));
  const titles = {
    dashboard: "Dashboard", employees: "Employees", departments: "Departments",
    payroll: "Payroll Entry", bulk: "Bulk Entry", reports: "Reports", payslips: "Payslips"
  };
  document.getElementById("page-title").textContent = titles[page] || "";
  if (page === "dashboard") renderDashboard();
  if (page === "employees") renderEmployees();
  if (page === "departments") renderDepartments();
  if (page === "payroll") renderPayrollEntry();
  if (page === "bulk") renderBulkEntry();
  if (page === "reports") renderReports();
  if (page === "payslips") renderPayslips();
}

window.addEventListener("hashchange", () => {
  const page = location.hash.slice(1) || "dashboard";
  navigate(page);
});

function initApp() {
  setMonthInput(document.getElementById("global-month"), todayMonth());
  setMonthInput(document.getElementById("report-month"), todayMonth());
  setMonthInput(document.getElementById("payslip-month"), todayMonth());
  const page = location.hash.slice(1) || "dashboard";
  navigate(page);
}

// ==================== DASHBOARD ====================
async function renderDashboard() {
  const month = getMonthInput(document.getElementById("global-month"));
  await Promise.all([loadDepartments(), loadEmployees()]);
  const payroll = await getPayrollForMonth(month);

  const activeEmps = cache.employees.filter(e => e.isActive !== false);
  const depts = cache.departments;

  document.getElementById("dash-active").textContent = activeEmps.length;
  document.getElementById("dash-depts").textContent = depts.length;

  const totalGross = payroll.reduce((s, p) => s + (p.grossSalary || 0), 0);
  const totalWithdrawal = payroll.reduce((s, p) => s + (p.withdrawal || 0), 0);
  document.getElementById("dash-gross").textContent = fmtMoney(totalGross);
  document.getElementById("dash-withdrawal").textContent = fmtMoney(totalWithdrawal);

  const empIdsWithPayroll = new Set(payroll.map(p => p.employeeId));
  const pending = activeEmps.filter(e => !empIdsWithPayroll.has(e.id));
  document.getElementById("dash-pending").textContent = pending.length;

  // Department breakdown
  const tbody = document.querySelector("#dash-dept-table tbody");
  tbody.innerHTML = "";
  for (const d of depts) {
    const empCount = activeEmps.filter(e => e.departmentId === d.id).length;
    const deptGross = payroll
      .filter(p => activeEmps.find(e => e.id === p.employeeId && e.departmentId === d.id))
      .reduce((s, p) => s + (p.grossSalary || 0), 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.name}</td><td>${d.payType}</td><td>${empCount}</td><td>${deptGross ? fmtMoney(deptGross) : "-"}</td>`;
    tbody.appendChild(tr);
  }

  // Missing entries
  const mtbody = document.querySelector("#dash-missing-table tbody");
  mtbody.innerHTML = "";
  for (const e of pending) {
    const d = depts.find(x => x.id === e.departmentId) || {};
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${e.srNo || ""}</td><td>${e.name}</td><td>${d.name || ""}</td><td>${d.payType || ""}</td>`;
    tr.addEventListener("dblclick", () => {
      setMonthInput(document.getElementById("global-month"), month);
      location.hash = "payroll";
      setTimeout(() => selectEmployeeInPayroll(e.id), 300);
    });
    mtbody.appendChild(tr);
  }
}

// ==================== EMPLOYEES ====================
async function renderEmployees() {
  await loadDepartments();
  const deptSel = document.getElementById("emp-dept");
  deptSel.innerHTML = cache.departments.map(d => `<option value="${d.id}">${d.name} (${d.payType})</option>`).join("");
  refreshEmployeeTable();
}

async function refreshEmployeeTable() {
  await loadEmployees();
  const showInactive = document.getElementById("emp-show-inactive").checked;
  const search = document.getElementById("emp-search").value.trim().toLowerCase();
  const tbody = document.querySelector("#emp-table tbody");
  tbody.innerHTML = "";

  let rows = cache.employees;
  if (!showInactive) rows = rows.filter(e => e.isActive !== false);
  if (search) rows = rows.filter(e => e.name.toLowerCase().includes(search));

  rows.forEach((e, i) => {
    const d = cache.departments.find(x => x.id === e.departmentId) || {};
    const tr = document.createElement("tr");
    tr.dataset.id = e.id;
    tr.innerHTML = `<td>${e.srNo || ""}</td><td>${e.name}</td><td>${d.name || ""}</td><td>${d.payType || ""}</td><td>${e.isActive === false ? "Left" : "Active"}</td>`;
    if (e.isActive === false) tr.style.opacity = "0.6";
    tr.addEventListener("click", () => {
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
      selectedEmpId = e.id;
    });
    tbody.appendChild(tr);
  });
}

document.getElementById("emp-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("emp-name").value.trim();
  const srNo = parseInt(document.getElementById("emp-srno").value) || null;
  const deptId = document.getElementById("emp-dept").value;
  if (!name) return toast("Name is required", "error");
  await db.collection("employees").add({ name, srNo, departmentId: deptId, isActive: true });
  document.getElementById("emp-form").reset();
  toast("Employee added");
  refreshEmployeeTable();
});

document.getElementById("emp-search").addEventListener("input", () => refreshEmployeeTable());
document.getElementById("emp-show-inactive").addEventListener("change", () => refreshEmployeeTable());

document.getElementById("btn-deactivate-emp").addEventListener("click", async () => {
  if (!selectedEmpId) return toast("Select an employee first", "error");
  if (!confirm("Mark as no longer working here? Past records stay intact.")) return;
  await db.collection("employees").doc(selectedEmpId).update({ isActive: false });
  toast("Employee marked as left");
  refreshEmployeeTable();
});

document.getElementById("btn-reactivate-emp").addEventListener("click", async () => {
  if (!selectedEmpId) return toast("Select an employee first", "error");
  await db.collection("employees").doc(selectedEmpId).update({ isActive: true });
  toast("Employee reactivated");
  refreshEmployeeTable();
});

document.getElementById("btn-edit-emp").addEventListener("click", async () => {
  if (!selectedEmpId) return toast("Select an employee first", "error");
  const emp = cache.employees.find(e => e.id === selectedEmpId);
  if (!emp) return;
  showModal("Edit Employee", `
    <div class="field"><label>Name</label><input type="text" id="edit-emp-name" value="${emp.name}" readonly style="background:#f5f5f5"></div>
    <div class="field"><label>Sr No</label><input type="number" id="edit-emp-srno" value="${emp.srNo || ""}"></div>
    <div class="field"><label>Department</label><select id="edit-emp-dept">${cache.departments.map(d => `<option value="${d.id}" ${d.id===emp.departmentId?"selected":""}>${d.name}</option>`).join("")}</select></div>
  `, `
    <button class="btn-tonal" onclick="closeModal()">Cancel</button>
    <button class="btn-filled" onclick="saveEditEmployee()">Save</button>
  `);
});

window.saveEditEmployee = async function() {
  const srNo = parseInt(document.getElementById("edit-emp-srno").value) || null;
  const deptId = document.getElementById("edit-emp-dept").value;
  await db.collection("employees").doc(selectedEmpId).update({ srNo, departmentId: deptId });
  closeModal();
  toast("Employee updated");
  refreshEmployeeTable();
};

// ==================== DEPARTMENTS ====================
async function renderDepartments() {
  refreshDeptTable();
}

async function refreshDeptTable() {
  await loadDepartments();
  const tbody = document.querySelector("#dept-table tbody");
  tbody.innerHTML = "";
  for (const d of cache.departments) {
    const tr = document.createElement("tr");
    tr.dataset.id = d.id;
    tr.innerHTML = `
      <td>${d.name}</td>
      <td>${d.payType}</td>
      <td>${d.defaultRate !== undefined && d.defaultRate !== null ? d.defaultRate : "-"}</td>
      <td><button class="btn-text" onclick="promptSetRate('${d.id}')">Set Rate</button></td>
    `;
    tbody.appendChild(tr);
  }
}

document.getElementById("dept-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("dept-name").value.trim();
  const payType = document.getElementById("dept-type").value;
  const rate = document.getElementById("dept-rate").value.trim();
  if (!name) return toast("Department name required", "error");
  try {
    await db.collection("departments").add({
      name, payType, defaultRate: rate ? parseFloat(rate) : null
    });
    document.getElementById("dept-form").reset();
    toast("Department added");
    refreshDeptTable();
  } catch (err) {
    toast(err.message, "error");
  }
});

window.promptSetRate = async function(deptId) {
  const d = cache.departments.find(x => x.id === deptId);
  showModal("Set Default Rate", `
    <p>Department: <strong>${d.name}</strong></p>
    <div class="field"><label>New default rate</label><input type="number" step="0.01" id="edit-dept-rate" value="${d.defaultRate || ""}"></div>
  `, `
    <button class="btn-tonal" onclick="closeModal()">Cancel</button>
    <button class="btn-filled" onclick="saveDeptRate('${deptId}')">Save</button>
  `);
};

window.saveDeptRate = async function(deptId) {
  const val = document.getElementById("edit-dept-rate").value.trim();
  const rate = val ? parseFloat(val) : null;
  await db.collection("departments").doc(deptId).update({ defaultRate: rate });
  closeModal();
  toast("Rate updated");
  refreshDeptTable();
};

// ==================== PAYROLL ENTRY ====================
let currentPayrollMode = "Piecework";
let currentPayrollEmpId = null;
let currentPayrollMonth = "";
let rateLines = [];

async function renderPayrollEntry() {
  await loadDepartments();
  const filterSel = document.getElementById("pay-dept-filter");
  filterSel.innerHTML = '<option>All departments</option>' + cache.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  filterPayrollEmployees();
}

function filterPayrollEmployees() {
  const deptId = document.getElementById("pay-dept-filter").value;
  const empSel = document.getElementById("pay-emp");
  let emps = cache.employees.filter(e => e.isActive !== false);
  if (deptId && deptId !== "All departments") {
    emps = emps.filter(e => e.departmentId === deptId);
  }
  empSel.innerHTML = emps.map(e => {
    const d = cache.departments.find(x => x.id === e.departmentId) || {};
    return `<option value="${e.id}">${e.name} — ${d.name || ""}</option>`;
  }).join("");
}

document.getElementById("pay-dept-filter").addEventListener("change", filterPayrollEmployees);

document.getElementById("pay-load").addEventListener("click", loadPayrollEmployee);

document.getElementById("pay-emp").addEventListener("change", loadPayrollEmployee);

async function loadPayrollEmployee() {
  const empId = document.getElementById("pay-emp").value;
  if (!empId) return;
  currentPayrollEmpId = empId;
  const emp = cache.employees.find(e => e.id === empId);
  const dept = cache.departments.find(d => d.id === emp.departmentId) || {};
  currentPayrollMode = dept.payType || "Piecework";

  document.getElementById("pay-piecework-panel").style.display = currentPayrollMode === "Piecework" ? "" : "none";
  document.getElementById("pay-fixed-panel").style.display = currentPayrollMode === "Fixed" ? "" : "none";

  const month = getMonthInput(document.getElementById("global-month"));
  currentPayrollMonth = month;

  // Load existing payroll
  const payroll = await getPayroll(empId, month);
  if (currentPayrollMode === "Piecework") {
    renderRateLines(payroll?.rateLines || [], dept.name);
  } else {
    document.getElementById("pay-basic").value = payroll?.basicSalary ?? "";
    document.getElementById("pay-earned").value = payroll?.grossSalary ?? "";
  }
  document.getElementById("pay-withdrawal").value = payroll?.withdrawal ?? "0";

  // Auto-fill previous balance from last month's recoverable
  const lastPay = await getLastPayrollBefore(empId, month);
  const prevBal = lastPay?.netRecoverable || 0;
  document.getElementById("pay-prev").value = prevBal;

  recalcPayroll();
}

function renderRateLines(lines, defaultDeptName) {
  const container = document.getElementById("pay-rate-lines");
  container.innerHTML = "";
  rateLines = [];
  if (!lines.length) lines = [{}];
  lines.forEach((ln, idx) => {
    const row = document.createElement("div");
    row.className = "rate-line";
    const deptNames = cache.departments.filter(d => d.payType === "Piecework").map(d => d.name);
    const defaultRate = cache.departments.find(d => d.name === (ln.deptName || defaultDeptName))?.defaultRate;
    const rateVal = ln.rate !== undefined ? ln.rate : (defaultRate ?? "");
    row.innerHTML = `
      <div class="field">
        <label>Dept</label>
        <select class="rl-dept">${deptNames.map(n => `<option ${n===(ln.deptName||defaultDeptName)?"selected":""}>${n}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label>Rate</label>
        <input type="number" step="0.01" class="rl-rate" value="${rateVal}">
      </div>
      <div class="field">
        <label>Pieces</label>
        <input type="number" step="0.01" class="rl-pieces" value="${ln.pieces ?? ""}">
      </div>
      <button class="btn-error" onclick="removeRateLine(${idx})" style="height:36px;padding:0 12px">Remove</button>
    `;
    container.appendChild(row);
    rateLines.push(row);
    row.querySelector(".rl-rate").addEventListener("input", recalcPayroll);
    row.querySelector(".rl-pieces").addEventListener("input", recalcPayroll);
  });
}

window.removeRateLine = function(idx) {
  if (rateLines.length <= 1) return;
  rateLines[idx].remove();
  rateLines.splice(idx, 1);
  recalcPayroll();
};

document.getElementById("pay-add-line").addEventListener("click", () => {
  const empId = document.getElementById("pay-emp").value;
  if (!empId) return toast("Select an employee first", "error");
  const emp = cache.employees.find(e => e.id === empId);
  const dept = cache.departments.find(d => d.id === emp.departmentId) || {};
  addRateLineRow({}, dept.name);
});

function addRateLineRow(ln, defaultDeptName) {
  const container = document.getElementById("pay-rate-lines");
  const row = document.createElement("div");
  row.className = "rate-line";
  const deptNames = cache.departments.filter(d => d.payType === "Piecework").map(d => d.name);
  const defaultRate = cache.departments.find(d => d.name === (ln.deptName || defaultDeptName))?.defaultRate;
  const rateVal = ln.rate !== undefined ? ln.rate : (defaultRate ?? "");
  row.innerHTML = `
    <div class="field"><label>Dept</label><select class="rl-dept">${deptNames.map(n => `<option ${n===(ln.deptName||defaultDeptName)?"selected":""}>${n}</option>`).join("")}</select></div>
    <div class="field"><label>Rate</label><input type="number" step="0.01" class="rl-rate" value="${rateVal}"></div>
    <div class="field"><label>Pieces</label><input type="number" step="0.01" class="rl-pieces" value="${ln.pieces ?? ""}"></div>
    <button class="btn-error" style="height:36px;padding:0 12px">Remove</button>
  `;
  container.appendChild(row);
  const idx = rateLines.length;
  rateLines.push(row);
  row.querySelector(".rl-rate").addEventListener("input", recalcPayroll);
  row.querySelector(".rl-pieces").addEventListener("input", recalcPayroll);
  row.querySelector(".btn-error").addEventListener("click", () => {
    if (rateLines.length <= 1) return;
    row.remove();
    rateLines = rateLines.filter(r => r !== row);
    recalcPayroll();
  });
}

function recalcPayroll() {
  let gross = 0;
  if (currentPayrollMode === "Piecework") {
    rateLines.forEach(row => {
      const r = safeFloat(row.querySelector(".rl-rate")?.value);
      const p = safeFloat(row.querySelector(".rl-pieces")?.value);
      gross += r * p;
    });
  } else {
    gross = safeFloat(document.getElementById("pay-earned").value);
  }
  document.getElementById("pay-gross").textContent = fmtMoney(gross);

  const withdrawal = safeFloat(document.getElementById("pay-withdrawal").value);
  const prevBal = safeFloat(document.getElementById("pay-prev").value);
  const diff = gross - withdrawal - prevBal;
  if (diff >= 0) {
    document.getElementById("pay-net-due").textContent = fmtMoney(diff);
    document.getElementById("pay-net-recov").textContent = "-";
  } else {
    document.getElementById("pay-net-due").textContent = "-";
    document.getElementById("pay-net-recov").textContent = fmtMoney(-diff);
  }
}

document.getElementById("pay-basic").addEventListener("input", recalcPayroll);
document.getElementById("pay-earned").addEventListener("input", recalcPayroll);
document.getElementById("pay-withdrawal").addEventListener("input", recalcPayroll);
document.getElementById("pay-prev").addEventListener("input", recalcPayroll);

document.getElementById("pay-save").addEventListener("click", async () => {
  if (!currentPayrollEmpId) return toast("Select an employee first", "error");
  const month = getMonthInput(document.getElementById("global-month"));
  if (!month || !/^\d{4}-\d{2}-01$/.test(month)) return toast("Month must be YYYY-MM-01", "error");

  try {
    const withdrawal = parseNonNegFloat(document.getElementById("pay-withdrawal").value, "Withdrawal") || 0;
    let basic = null, gross = 0, rateLinesData = [];

    if (currentPayrollMode === "Piecework") {
      rateLines.forEach((row, i) => {
        const rate = parseNonNegFloat(row.querySelector(".rl-rate").value, `Rate line ${i+1}`);
        const pieces = parseNonNegFloat(row.querySelector(".rl-pieces").value, `Pieces line ${i+1}`);
        if (rate !== null || pieces !== null) {
          const deptName = row.querySelector(".rl-dept").value;
          const dept = cache.departments.find(d => d.name === deptName);
          rateLinesData.push({ deptId: dept?.id || null, deptName, rate, pieces });
          gross += (rate || 0) * (pieces || 0);
        }
      });
    } else {
      basic = parseNonNegFloat(document.getElementById("pay-basic").value, "Basic salary");
      gross = parseNonNegFloat(document.getElementById("pay-earned").value, "Earned amount") || 0;
    }

    const prevBal = safeFloat(document.getElementById("pay-prev").value);
    const diff = gross - withdrawal - prevBal;
    const netDue = diff >= 0 ? diff : null;
    const netRecov = diff < 0 ? -diff : null;

    // Snapshot for undo
    const old = await getPayroll(currentPayrollEmpId, month);
    undoStack.push({ employeeId: currentPayrollEmpId, month, old });
    if (undoStack.length > 3) undoStack.shift();

    await savePayroll({
      employeeId: currentPayrollEmpId,
      month,
      basicSalary: basic,
      grossSalary: gross,
      withdrawal,
      netPayDue: netDue,
      netRecoverable: netRecov,
      prevBalance: prevBal,
      rateLines: rateLinesData,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    toast("Payroll entry saved");
    advanceToNextEmployee();
  } catch (err) {
    if (err instanceof ValidationError) toast(err.message, "error");
    else toast("Save failed: " + err.message, "error");
  }
});

document.getElementById("pay-delete").addEventListener("click", async () => {
  if (!currentPayrollEmpId) return toast("Select an employee first", "error");
  const month = getMonthInput(document.getElementById("global-month"));
  if (!confirm(`Delete payroll entry for this employee for ${month}?`)) return;
  await deletePayroll(currentPayrollEmpId, month);
  toast("Entry deleted");
  resetPayrollForm();
});

document.getElementById("pay-undo").addEventListener("click", async () => {
  if (!undoStack.length) return toast("Nothing to undo", "error");
  const snap = undoStack.pop();
  if (snap.old) {
    await savePayroll(snap.old);
  } else {
    await deletePayroll(snap.employeeId, snap.month);
  }
  toast("Undo successful");
  if (currentPayrollEmpId === snap.employeeId) loadPayrollEmployee();
});

function resetPayrollForm() {
  document.getElementById("pay-emp").value = "";
  currentPayrollEmpId = null;
  document.getElementById("pay-rate-lines").innerHTML = "";
  rateLines = [];
  document.getElementById("pay-basic").value = "";
  document.getElementById("pay-earned").value = "";
  document.getElementById("pay-withdrawal").value = "0";
  document.getElementById("pay-prev").value = "0";
  document.getElementById("pay-gross").textContent = "0";
  document.getElementById("pay-net-due").textContent = "-";
  document.getElementById("pay-net-recov").textContent = "-";
}

function advanceToNextEmployee() {
  const sel = document.getElementById("pay-emp");
  if (sel.selectedIndex < sel.options.length - 1) {
    sel.selectedIndex++;
    loadPayrollEmployee();
  }
}

window.selectEmployeeInPayroll = async function(empId) {
  await loadEmployees();
  const emp = cache.employees.find(e => e.id === empId);
  if (!emp) return;
  document.getElementById("pay-dept-filter").value = emp.departmentId;
  filterPayrollEmployees();
  document.getElementById("pay-emp").value = empId;
  loadPayrollEmployee();
};

document.getElementById("pay-copy-prev").addEventListener("click", async () => {
  if (!currentPayrollEmpId) return toast("Select an employee first", "error");
  const month = getMonthInput(document.getElementById("global-month"));
  const prev = await getLastPayrollBefore(currentPayrollEmpId, month);
  if (!prev || !prev.rateLines?.length) return toast("No earlier entry found", "error");
  const emp = cache.employees.find(e => e.id === currentPayrollEmpId);
  const dept = cache.departments.find(d => d.id === emp.departmentId) || {};
  renderRateLines(prev.rateLines.map(l => ({ rate: l.rate, deptName: l.deptName, pieces: "" })), dept.name);
  recalcPayroll();
  toast(`Copied ${prev.rateLines.length} rate line(s)`);
});

document.getElementById("pay-copy-prev-fixed").addEventListener("click", async () => {
  if (!currentPayrollEmpId) return toast("Select an employee first", "error");
  const month = getMonthInput(document.getElementById("global-month"));
  const prev = await getLastPayrollBefore(currentPayrollEmpId, month);
  if (!prev || prev.basicSalary == null) return toast("No earlier basic salary found", "error");
  document.getElementById("pay-basic").value = prev.basicSalary;
  document.getElementById("pay-earned").value = "";
  recalcPayroll();
  toast("Basic salary copied");
});

// ==================== BULK ENTRY ====================
let bulkRowData = [];

async function renderBulkEntry() {
  await loadDepartments();
  const sel = document.getElementById("bulk-dept");
  const pwDepts = cache.departments.filter(d => d.payType === "Piecework");
  sel.innerHTML = pwDepts.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

document.getElementById("bulk-load").addEventListener("click", loadBulkGrid);

async function loadBulkGrid() {
  const deptId = document.getElementById("bulk-dept").value;
  const month = getMonthInput(document.getElementById("global-month"));
  if (!deptId) return toast("Select a department", "error");

  await loadEmployees();
  const dept = cache.departments.find(d => d.id === deptId);
  const emps = cache.employees.filter(e => e.departmentId === deptId && e.isActive !== false).sort((a,b)=>(a.srNo||0)-(b.srNo||0));

  bulkRowData = [];
  for (const e of emps) {
    const payroll = await getPayroll(e.id, month);
    const lastPay = await getLastPayrollBefore(e.id, month);
    const prevBal = lastPay?.netRecoverable || 0;
    bulkRowData.push({
      empId: e.id,
      srNo: e.srNo || "",
      name: e.name,
      rate: dept.defaultRate ?? "",
      pieces: "",
      gross: 0,
      withdrawal: payroll?.withdrawal ?? 0,
      netDue: 0,
      prevBal: prevBal,
      deptId: deptId
    });
  }

  updateBulkSummary();
  initBulkGrid();
}

function initBulkGrid() {
  const eDiv = document.getElementById("bulk-grid");
  if (bulkGridApi) { bulkGridApi.destroy(); }

  const columnDefs = [
    { field: "srNo", headerName: "SrNo", width: 80, editable: false },
    { field: "name", headerName: "Employee", width: 200, editable: false },
    { field: "rate", headerName: "Rate", width: 100, editable: true, cellEditor: "agNumberCellEditor" },
    { field: "pieces", headerName: "Pieces", width: 100, editable: true, cellEditor: "agNumberCellEditor" },
    { field: "gross", headerName: "Gross", width: 100, editable: false,
      valueGetter: p => {
        const r = safeFloat(p.data.rate);
        const pcs = safeFloat(p.data.pieces);
        return Math.round(r * pcs);
      }
    },
    { field: "withdrawal", headerName: "Withdrawal", width: 120, editable: true, cellEditor: "agNumberCellEditor" },
    { field: "netDue", headerName: "Net Due", width: 100, editable: false,
      valueGetter: p => {
        const gross = safeFloat(p.data.rate) * safeFloat(p.data.pieces);
        const w = safeFloat(p.data.withdrawal);
        const prev = safeFloat(p.data.prevBal);
        const diff = gross - w - prev;
        return diff >= 0 ? Math.round(diff) : "-" + Math.round(-diff);
      }
    },
    { field: "prevBal", headerName: "Prev Bal", width: 100, editable: true, cellEditor: "agNumberCellEditor" },
  ];

  const gridOptions = {
    columnDefs,
    rowData: bulkRowData,
    defaultColDef: { sortable: false, resizable: true },
    onCellValueChanged: () => {
      bulkGridApi.refreshCells({ force: true });
      updateBulkSummary();
    },
    singleClickEdit: true,
    stopEditingWhenCellsLoseFocus: true,
  };

  bulkGridApi = new agGrid.Grid(eDiv, gridOptions).api;
}

function updateBulkSummary() {
  const filled = bulkRowData.filter(r => String(r.pieces).trim() !== "").length;
  const total = bulkRowData.reduce((s, r) => s + safeFloat(r.rate) * safeFloat(r.pieces), 0);
  document.getElementById("bulk-summary").textContent = `${bulkRowData.length} employee(s) — ${filled} with data — Total gross: ${fmtMoney(total)}`;
}

document.getElementById("bulk-fill-rate").addEventListener("click", () => {
  if (!bulkRowData.length) return;
  const first = bulkRowData[0].rate;
  for (let i = 1; i < bulkRowData.length; i++) bulkRowData[i].rate = first;
  if (bulkGridApi) bulkGridApi.refreshCells();
  updateBulkSummary();
});

document.getElementById("bulk-save").addEventListener("click", async () => {
  const month = getMonthInput(document.getElementById("global-month"));
  if (!/^\d{4}-\d{2}-01$/.test(month)) return toast("Month must be YYYY-MM-01", "error");
  const deptId = document.getElementById("bulk-dept").value;
  if (!deptId) return toast("Select a department", "error");

  const toSave = [];
  for (let i = 0; i < bulkRowData.length; i++) {
    const r = bulkRowData[i];
    if (!String(r.pieces).trim()) continue;
    try {
      const rate = parseNonNegFloat(r.rate, `Rate row ${i+1}`);
      const pieces = parseNonNegFloat(r.pieces, `Pieces row ${i+1}`);
      const withdrawal = parseNonNegFloat(r.withdrawal, `Withdrawal row ${i+1}`) || 0;
      if (rate === null) throw new ValidationError(`Rate row ${i+1}: rate required when pieces are entered.`);
      const gross = rate * pieces;
      const prevBal = safeFloat(r.prevBal);
      const diff = gross - withdrawal - prevBal;
      toSave.push({
        employeeId: r.empId,
        month,
        grossSalary: gross,
        withdrawal,
        netPayDue: diff >= 0 ? diff : null,
        netRecoverable: diff < 0 ? -diff : null,
        prevBalance: prevBal,
        rateLines: [{ deptId, rate, pieces }],
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      if (err instanceof ValidationError) return toast(err.message, "error");
      throw err;
    }
  }

  if (!toSave.length) return toast("No rows with pieces entered", "error");

  const batch = db.batch();
  for (const item of toSave) {
    const ref = db.collection("payroll").doc(`${item.employeeId}_${item.month}`);
    batch.set(ref, item, { merge: true });
  }
  await batch.commit();
  toast(`Saved ${toSave.length} payroll entries`);
  loadBulkGrid();
});

// ==================== REPORTS ====================
async function renderReports() {
  // month handled by input
}

document.getElementById("report-refresh").addEventListener("click", loadReportTable);
document.getElementById("report-export-csv").addEventListener("click", exportReportCSV);
document.getElementById("report-export-excel").addEventListener("click", exportReportExcel);

async function loadReportTable() {
  const month = getMonthInput(document.getElementById("report-month"));
  await Promise.all([loadDepartments(), loadEmployees()]);
  const payroll = await getPayrollForMonth(month);

  const tbody = document.querySelector("#report-table tbody");
  tbody.innerHTML = "";
  let totalGross = 0;

  payroll.sort((a, b) => {
    const ea = cache.employees.find(e => e.id === a.employeeId);
    const eb = cache.employees.find(e => e.id === b.employeeId);
    const da = cache.departments.find(d => d.id === ea?.departmentId)?.name || "";
    const db_ = cache.departments.find(d => d.id === eb?.departmentId)?.name || "";
    return da.localeCompare(db_) || (ea?.name || "").localeCompare(eb?.name || "");
  });

  for (const p of payroll) {
    const emp = cache.employees.find(e => e.id === p.employeeId);
    const dept = cache.departments.find(d => d.id === emp?.departmentId);
    const tr = document.createElement("tr");
    if (p.netRecoverable > 0) tr.classList.add("recoverable");
    tr.innerHTML = `
      <td>${dept?.name || ""}</td>
      <td>${emp?.name || ""}</td>
      <td>${fmtMoney(p.grossSalary)}</td>
      <td>${fmtMoney(p.withdrawal)}</td>
      <td>${fmtMoney(p.netPayDue)}</td>
      <td>${fmtMoney(p.netRecoverable)}</td>
    `;
    tbody.appendChild(tr);
    totalGross += p.grossSalary || 0;
  }
  document.getElementById("report-total-gross").textContent = `Total gross: ${fmtMoney(totalGross)}`;
}

function exportReportCSV() {
  const month = getMonthInput(document.getElementById("report-month"));
  const rows = [];
  document.querySelectorAll("#report-table tbody tr").forEach(tr => {
    const tds = tr.querySelectorAll("td");
    rows.push([tds[0].textContent, tds[1].textContent, tds[2].textContent, tds[3].textContent, tds[4].textContent, tds[5].textContent]);
  });
  let csv = "Department,Employee,Gross Salary,Withdrawal,Net Pay Due,Net Recoverable\n";
  rows.forEach(r => csv += r.join(",") + "\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `payroll_report_${month}.csv`;
  a.click();
}

function exportReportExcel() {
  const month = getMonthInput(document.getElementById("report-month"));
  const rows = [];
  document.querySelectorAll("#report-table tbody tr").forEach(tr => {
    const tds = tr.querySelectorAll("td");
    rows.push({
      Department: tds[0].textContent,
      Employee: tds[1].textContent,
      "Gross Salary": safeFloat(tds[2].textContent),
      Withdrawal: safeFloat(tds[3].textContent),
      "Net Pay Due": safeFloat(tds[4].textContent),
      "Net Recoverable": safeFloat(tds[5].textContent),
    });
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `payroll_report_${month}.xlsx`);
}

// ==================== PAYSLIPS ====================
async function renderPayslips() {
  await loadDepartments();
  const sel = document.getElementById("payslip-dept");
  sel.innerHTML = '<option>All departments</option>' + cache.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
}

document.getElementById("payslip-generate").addEventListener("click", generatePayslipsHTML);
document.getElementById("payslip-excel-reg").addEventListener("click", exportExcelRegister);
document.getElementById("payslip-excel-adv").addEventListener("click", exportOutstandingAdvances);

async function generatePayslipsHTML() {
  const month = getMonthInput(document.getElementById("payslip-month"));
  const deptFilter = document.getElementById("payslip-dept").value;
  await Promise.all([loadDepartments(), loadEmployees()]);
  let payroll = await getPayrollForMonth(month);
  if (deptFilter && deptFilter !== "All departments") {
    payroll = payroll.filter(p => {
      const emp = cache.employees.find(e => e.id === p.employeeId);
      return emp?.departmentId === deptFilter;
    });
  }
  if (!payroll.length) return toast("No payroll entries found", "error");

  const dateLabel = new Date(month).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  // Group by department
  const byDept = {};
  for (const p of payroll) {
    const emp = cache.employees.find(e => e.id === p.employeeId);
    const dept = cache.departments.find(d => d.id === emp?.departmentId);
    const key = dept?.name || "Unknown";
    if (!byDept[key]) byDept[key] = [];
    byDept[key].push({ ...p, empName: emp?.name || "", deptName: key });
  }

  let cards = [];
  for (const [dept, rows] of Object.entries(byDept)) {
    cards.push(`<div class="dept-heading">${dept}</div><div class="grid">`);
    for (const p of rows) {
      const lines = p.rateLines || [{}];
      const piecesCells = lines.map(l => `<td>${l.pieces !== undefined ? Math.round(l.pieces) : ""}</td>`).join("") || "<td></td>";
      const rateCells = lines.map(l => `<td>${l.rate !== undefined ? l.rate : ""}</td>`).join("") || "<td></td>";
      const cs = Math.max(lines.length, 1);
      const payClass = p.netRecoverable != null ? "pink" : "";
      const payValue = p.netRecoverable != null ? `-${fmtMoney(p.netRecoverable)}` : fmtMoney(p.netPayDue);
      cards.push(`
        <div class="slip">
          <table>
            <tr><th colspan="${cs}">SALARY SLIP</th></tr>
            <tr><td class="label">${p.deptName}</td><td colspan="${Math.max(cs-1,1)}">${dateLabel}</td></tr>
            <tr><td colspan="${cs}" class="name">${p.empName}</td></tr>
            <tr><td class="label">નંગ</td>${piecesCells}</tr>
            <tr><td class="label">ભાવ</td>${rateCells}</tr>
            <tr><td class="label">ટોટલ</td><td colspan="${cs}">${fmtMoney(p.grossSalary)}</td></tr>
            <tr><td class="label">ઉપાડ</td><td colspan="${cs}">${fmtMoney(p.withdrawal)}</td></tr>
            <tr class="${payClass}"><td class="label">પગાર</td><td colspan="${cs}">${payValue}</td></tr>
          </table>
        </div>`);
    }
    cards.push("</div>");
  }

  const html = `<!DOCTYPE html>
<html lang="gu">
<head><meta charset="utf-8"><title>Salary Slips - ${dateLabel}</title>
<style>
body { font-family: Arial, "Noto Sans Gujarati", sans-serif; margin: 20px; }
.dept-heading { font-size: 18px; font-weight: bold; margin: 20px 0 10px; }
.grid { display: flex; flex-wrap: wrap; gap: 14px; }
.slip { border: 1px solid #999; width: 220px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
td, th { border: 1px solid #999; padding: 4px 6px; text-align: center; }
th { background: #eee; }
td.label { text-align: left; font-weight: bold; background: #f7f7f7; }
td.name { font-weight: bold; background: #f0f0f0; }
tr.pink td { background: #f8d0d0; }
@media print { .dept-heading { break-before: page; } .dept-heading:first-of-type { break-before: auto; } }
</style></head><body>${cards.join("")}</body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
}

async function exportExcelRegister() {
  const month = getMonthInput(document.getElementById("payslip-month"));
  await Promise.all([loadDepartments(), loadEmployees()]);
  const payroll = await getPayrollForMonth(month);

  // Build dept stats
  const deptStats = cache.departments.map(d => {
    const emps = cache.employees.filter(e => e.departmentId === d.id && e.isActive !== false);
    return { ...d, empCount: emps.length };
  }).sort((a, b) => b.empCount - a.empCount);

  // Split into two parts (balanced by employee count)
  const part1 = [], part2 = [];
  let t1 = 0, t2 = 0;
  for (const d of deptStats) {
    if (t1 <= t2) { part1.push(d); t1 += d.empCount; }
    else { part2.push(d); t2 += d.empCount; }
  }
  part1.sort((a,b) => a.name.localeCompare(b.name));
  part2.sort((a,b) => a.name.localeCompare(b.name));

  const dateLabel = new Date(month).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }).replace(" ", "-");
  const wb = XLSX.utils.book_new();

  function buildSheet(ws, depts, title) {
    const data = [];
    data.push([title]);
    data.push([]);

    for (const d of depts) {
      data.push([d.name, "", "", "", "", "", "", "", ""]);
      const isPiece = d.payType === "Piecework";
      data.push(isPiece
        ? ["", "", "ભાવ", "નંગ", "પગાર", "ઉપાડ", "", "પગાર", "ઉપાડ"]
        : ["", "", "પગાર", "પગાર", "", "ઉપાડ", "", "પગાર", "ઉપાડ"]);

      const emps = cache.employees.filter(e => e.departmentId === d.id && e.isActive !== false).sort((a,b)=>(a.srNo||0)-(b.srNo||0));
      let deptTotal = 0;
      for (const e of emps) {
        const p = payroll.find(x => x.employeeId === e.id);
        if (!p) continue;
        if (isPiece) {
          const lines = (p.rateLines || []).filter(l => l.deptId === d.id);
          const nSub = Math.max(lines.length, 1);
          for (let i = 0; i < nSub; i++) {
            const row = ["", "", "", "", "", "", "", "", ""];
            if (i === 0) { row[0] = e.srNo || ""; row[1] = e.name; }
            if (i < lines.length) { row[2] = lines[i].rate; row[3] = lines[i].pieces; }
            data.push(row);
          }
          // Gross, withdrawal, net due, net recov on last row of block
          // Simplified: just add summary row
          data.push(["", "", "", "", p.grossSalary, p.withdrawal, "", p.netPayDue, p.netRecoverable]);
        } else {
          data.push([e.srNo || "", e.name, p.basicSalary, p.grossSalary, "", p.withdrawal, "", p.netPayDue, p.netRecoverable]);
        }
        deptTotal += p.grossSalary || 0;
      }
      // Blank rows
      for (let i = 0; i < 3; i++) data.push(["", "", "", "", "", "", "", "", ""]);
      // Total row
      const totalRow = ["Total", "", "", "", "", "", "", "", ""];
      totalRow[4] = Math.round(deptTotal);
      data.push(totalRow);
      data.push([]);
    }

    const wsNew = XLSX.utils.aoa_to_sheet(data);
    // Basic styling via cell objects
    for (const addr in wsNew) {
      if (addr[0] === "!" || !wsNew[addr]) continue;
      const cell = wsNew[addr];
      if (!cell.s) cell.s = {};
      cell.s.font = { name: "Calibri", sz: 10 };
      cell.s.alignment = { horizontal: "center", vertical: "center" };
      cell.s.border = { left: { style: "thin", color: "999999" }, right: { style: "thin", color: "999999" }, top: { style: "thin", color: "999999" }, bottom: { style: "thin", color: "999999" } };
    }
    return wsNew;
  }

  const ws1 = buildSheet(null, part1, dateLabel);
  XLSX.utils.book_append_sheet(wb, ws1, "Part 1");
  const ws2 = buildSheet(null, part2, dateLabel);
  XLSX.utils.book_append_sheet(wb, ws2, "Part 2");
  XLSX.writeFile(wb, `payroll_register_${month}.xlsx`);
  toast("Excel register exported");
}

async function exportOutstandingAdvances() {
  const month = getMonthInput(document.getElementById("payslip-month"));
  await Promise.all([loadDepartments(), loadEmployees()]);
  const payroll = await getPayrollForMonth(month);
  const rows = [];
  for (const p of payroll) {
    if (!p.netRecoverable || p.netRecoverable <= 0) continue;
    const emp = cache.employees.find(e => e.id === p.employeeId);
    if (emp?.isActive === false) continue;
    const dept = cache.departments.find(d => d.id === emp?.departmentId);
    rows.push({ Department: dept?.name || "", Employee: emp?.name || "", "Amount Owed": Math.round(p.netRecoverable) });
  }
  if (!rows.length) return toast("No outstanding advances", "error");
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Outstanding Advances");
  XLSX.writeFile(wb, `outstanding_advances_${month}.xlsx`);
  toast("Outstanding advances exported");
}

// ==================== GLOBAL MONTH SYNC ====================
document.getElementById("global-month").addEventListener("change", () => {
  const m = document.getElementById("global-month").value;
  setMonthInput(document.getElementById("report-month"), m + "-01");
  setMonthInput(document.getElementById("payslip-month"), m + "-01");
});
