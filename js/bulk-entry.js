/* =====================================================================
   Bulk Entry (AG Grid)
   ===================================================================== */

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
