/* =====================================================================
   Global cross-page behavior
   ===================================================================== */

// Keep the report/payslip month pickers in sync with the dashboard's global month
document.getElementById("global-month").addEventListener("change", () => {
  const m = document.getElementById("global-month").value;
  setMonthInput(document.getElementById("report-month"), m + "-01");
  setMonthInput(document.getElementById("payslip-month"), m + "-01");
});
