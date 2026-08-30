/* =====================================================================
   Payroll Entry (single employee)
   ===================================================================== */

let currentPayrollMode = "Piecework";
let currentPayrollEmpId = null;
let currentPayrollMonth = "";
let rateLines = [];

async function renderPayrollEntry() {
  cache.departments = [];
  cache.employees = [];
  await Promise.all([loadDepartments(), loadEmployees()]);

  const filterSel = document.getElementById("pay-dept-filter");
  filterSel.innerHTML = '<option value="ALL">All departments</option>' +
    cache.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  filterPayrollEmployees();

  // Auto-focus employee select for rapid keyboard entry
  setTimeout(() => document.getElementById("pay-emp").focus(), 50);
}

function filterPayrollEmployees() {
  const deptId = document.getElementById("pay-dept-filter").value;
  const empSel = document.getElementById("pay-emp");
  let emps = cache.employees.filter(e => e.isActive !== false);
  if (deptId && deptId !== "ALL") {
    emps = emps.filter(e => e.departmentId === deptId);
  }
  empSel.innerHTML = '<option value="">— Select —</option>' +
    emps.map(e => {
      const d = cache.departments.find(x => x.id === e.departmentId) || {};
      return `<option value="${e.id}">${e.name} — ${d.name || ""}</option>`;
    }).join("");
}

document.getElementById("pay-dept-filter").addEventListener("change", () => {
  filterPayrollEmployees();
  document.getElementById("pay-emp").focus();
});

document.getElementById("pay-load").addEventListener("click", loadPayrollEmployee);
document.getElementById("pay-emp").addEventListener("change", loadPayrollEmployee);

// Keyboard: Enter on employee select loads employee
document.getElementById("pay-emp").addEventListener("keydown", e => {
  if (e.key === "Enter") loadPayrollEmployee();
});

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

  // Auto-focus first editable field
  setTimeout(() => {
    const firstInput = document.querySelector("#pay-rate-lines input, #pay-basic");
    if (firstInput) firstInput.focus();
  }, 50);
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
        <select class="rl-dept" tabindex="0">${deptNames.map(n => `<option ${n===(ln.deptName||defaultDeptName)?"selected":""}>${n}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label>Rate</label>
        <input type="number" step="0.01" class="rl-rate" value="${rateVal}" tabindex="0">
      </div>
      <div class="field">
        <label>Pieces</label>
        <input type="number" step="0.01" class="rl-pieces" value="${ln.pieces ?? ""}" tabindex="0">
      </div>
      <button class="btn-error" onclick="removeRateLine(${idx})" style="height:36px;padding:0 12px" tabindex="0" title="Remove line (Del)">Remove</button>
    `;
    container.appendChild(row);
    rateLines.push(row);

    // Recalc on any input
    row.querySelector(".rl-rate").addEventListener("input", recalcPayroll);
    row.querySelector(".rl-pieces").addEventListener("input", recalcPayroll);

    // Enter in pieces field adds a new line (convenient for rapid entry)
    row.querySelector(".rl-pieces").addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("pay-add-line").click();
        // Focus the new line's pieces input
        setTimeout(() => {
          const allPieces = container.querySelectorAll(".rl-pieces");
          if (allPieces.length) allPieces[allPieces.length - 1].focus();
        }, 50);
      }
    });
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
    <div class="field"><label>Dept</label><select class="rl-dept" tabindex="0">${deptNames.map(n => `<option ${n===(ln.deptName||defaultDeptName)?"selected":""}>${n}</option>`).join("")}</select></div>
    <div class="field"><label>Rate</label><input type="number" step="0.01" class="rl-rate" value="${rateVal}" tabindex="0"></div>
    <div class="field"><label>Pieces</label><input type="number" step="0.01" class="rl-pieces" value="${ln.pieces ?? ""}" tabindex="0"></div>
    <button class="btn-error" style="height:36px;padding:0 12px" tabindex="0" title="Remove line">Remove</button>
  `;
  container.appendChild(row);
  const idx = rateLines.length;
  rateLines.push(row);

  row.querySelector(".rl-rate").addEventListener("input", recalcPayroll);
  row.querySelector(".rl-pieces").addEventListener("input", recalcPayroll);

  // Enter in pieces adds another line
  row.querySelector(".rl-pieces").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("pay-add-line").click();
      setTimeout(() => {
        const allPieces = container.querySelectorAll(".rl-pieces");
        if (allPieces.length) allPieces[allPieces.length - 1].focus();
      }, 50);
    }
  });

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

// Keyboard: Enter in withdrawal or prev-balance saves
document.getElementById("pay-withdrawal").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("pay-save").click();
});
document.getElementById("pay-prev").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("pay-save").click();
});

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
  document.getElementById("pay-emp").focus();
}

function advanceToNextEmployee() {
  const sel = document.getElementById("pay-emp");
  if (sel.selectedIndex < sel.options.length - 1) {
    sel.selectedIndex++;
    loadPayrollEmployee();
  } else {
    // At end of list, reset and focus select for next manual pick
    resetPayrollForm();
  }
}

window.selectEmployeeInPayroll = async function(empId) {
  cache.employees = [];
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
  // Focus first pieces input
  setTimeout(() => {
    const firstPieces = document.querySelector(".rl-pieces");
    if (firstPieces) firstPieces.focus();
  }, 50);
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
  document.getElementById("pay-earned").focus();
});

// Global keyboard shortcuts for Payroll Entry
document.addEventListener("keydown", e => {
  if (currentPage !== "payroll") return;
  // Ctrl+S or Ctrl+Enter = Save
  if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "Enter")) {
    e.preventDefault();
    document.getElementById("pay-save").click();
  }
  // Ctrl+Shift+A = Add rate line
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "A") {
    e.preventDefault();
    document.getElementById("pay-add-line").click();
  }
});
