/* =====================================================================
   Payslips
   ===================================================================== */

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
  const srNoMap = getActiveSrNoMap();

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

      const emps = cache.employees.filter(e => e.departmentId === d.id && e.isActive !== false).sort((a,b)=>a.name.localeCompare(b.name));
      let deptTotal = 0;
      for (const e of emps) {
        const p = payroll.find(x => x.employeeId === e.id);
        if (!p) continue;
        if (isPiece) {
          const lines = (p.rateLines || []).filter(l => l.deptId === d.id);
          const nSub = Math.max(lines.length, 1);
          for (let i = 0; i < nSub; i++) {
            const row = ["", "", "", "", "", "", "", "", ""];
            if (i === 0) { row[0] = srNoMap.get(e.id) ?? ""; row[1] = e.name; }
            if (i < lines.length) { row[2] = lines[i].rate; row[3] = lines[i].pieces; }
            data.push(row);
          }
          // Gross, withdrawal, net due, net recov on last row of block
          // Simplified: just add summary row
          data.push(["", "", "", "", p.grossSalary, p.withdrawal, "", p.netPayDue, p.netRecoverable]);
        } else {
          data.push([srNoMap.get(e.id) ?? "", e.name, p.basicSalary, p.grossSalary, "", p.withdrawal, "", p.netPayDue, p.netRecoverable]);
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
