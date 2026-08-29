/* =====================================================================
   Dashboard
   ===================================================================== */

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
