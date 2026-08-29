/* =====================================================================
   Reports
   ===================================================================== */

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
