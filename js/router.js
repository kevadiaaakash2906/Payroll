/* =====================================================================
   Router
   ===================================================================== */

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
