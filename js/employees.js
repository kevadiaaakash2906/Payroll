/* =====================================================================
   Employees
   ===================================================================== */

async function renderEmployees() {
  cache.employees = [];
  await loadDepartments();

  // Add-form dropdown
  const deptSel = document.getElementById("emp-dept");
  deptSel.innerHTML = cache.departments.map(d => `<option value="${d.id}">${d.name} (${d.payType})</option>`).join("");

  // Filter dropdown
  const filterSel = document.getElementById("emp-dept-filter");
  if (filterSel) {
    filterSel.innerHTML = '<option value="">All departments</option>' +
      cache.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  }

  refreshEmployeeTable();
  document.getElementById("emp-name").focus();
}

async function refreshEmployeeTable() {
  await loadEmployees();
  const showInactive = document.getElementById("emp-show-inactive").checked;
  const search = document.getElementById("emp-search").value.trim().toLowerCase();
  const deptFilter = document.getElementById("emp-dept-filter")?.value || "";
  const tbody = document.querySelector("#emp-table tbody");
  tbody.innerHTML = "";

  let rows = cache.employees;
  if (!showInactive) rows = rows.filter(e => e.isActive !== false);
  if (search) rows = rows.filter(e => e.name.toLowerCase().includes(search));
  if (deptFilter) rows = rows.filter(e => e.departmentId === deptFilter);

  const srNoMap = getActiveSrNoMap();
  rows.forEach((e, i) => {
    const d = cache.departments.find(x => x.id === e.departmentId) || {};
    const tr = document.createElement("tr");
    tr.dataset.id = e.id;
    tr.tabIndex = 0;
    tr.innerHTML = `<td>${srNoMap.get(e.id) ?? "-"}</td><td>${e.name}</td><td>${d.name || ""}</td><td>${d.payType || ""}</td><td>${e.isActive === false ? "Left" : "Active"}</td>`;
    if (e.isActive === false) tr.style.opacity = "0.6";
    tr.addEventListener("click", () => {
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
      selectedEmpId = e.id;
    });
    // Keyboard: Enter or Space selects row
    tr.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        tr.click();
      }
    });
    tbody.appendChild(tr);
  });
}

document.getElementById("emp-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("emp-name").value.trim();
  const deptId = document.getElementById("emp-dept").value;
  if (!name) return toast("Name is required", "error");
  await db.collection("employees").add({ name, departmentId: deptId, isActive: true });
  document.getElementById("emp-form").reset();
  toast("Employee added");
  cache.employees = [];
  refreshEmployeeTable();
  document.getElementById("emp-name").focus();
});

// Enter in search box filters immediately
document.getElementById("emp-search").addEventListener("keydown", e => {
  if (e.key === "Enter") refreshEmployeeTable();
});
document.getElementById("emp-search").addEventListener("input", () => refreshEmployeeTable());
document.getElementById("emp-show-inactive").addEventListener("change", () => refreshEmployeeTable());
document.getElementById("emp-dept-filter")?.addEventListener("change", () => refreshEmployeeTable());

document.getElementById("btn-deactivate-emp").addEventListener("click", async () => {
  if (!selectedEmpId) return toast("Select an employee first", "error");
  if (!confirm("Mark as no longer working here? Past records stay intact.")) return;
  await db.collection("employees").doc(selectedEmpId).update({ isActive: false });
  toast("Employee marked as left");
  cache.employees = [];
  refreshEmployeeTable();
});

document.getElementById("btn-reactivate-emp").addEventListener("click", async () => {
  if (!selectedEmpId) return toast("Select an employee first", "error");
  await db.collection("employees").doc(selectedEmpId).update({ isActive: true });
  toast("Employee reactivated");
  cache.employees = [];
  refreshEmployeeTable();
});

document.getElementById("btn-edit-emp").addEventListener("click", async () => {
  if (!selectedEmpId) return toast("Select an employee first", "error");
  const emp = cache.employees.find(e => e.id === selectedEmpId);
  if (!emp) return;
  showModal("Edit Employee", `
    <div class="field"><label>Name</label><input type="text" id="edit-emp-name" value="${emp.name}" readonly style="background:#f5f5f5" tabindex="0"></div>
    <div class="field"><label>Department</label><select id="edit-emp-dept" tabindex="0">${cache.departments.map(d => `<option value="${d.id}" ${d.id===emp.departmentId?"selected":""}>${d.name}</option>`).join("")}</select></div>
  `, `
    <button class="btn-tonal" onclick="closeModal()" tabindex="0">Cancel</button>
    <button class="btn-filled" onclick="saveEditEmployee()" tabindex="0">Save</button>
  `);
});

window.saveEditEmployee = async function() {
  const deptId = document.getElementById("edit-emp-dept").value;
  await db.collection("employees").doc(selectedEmpId).update({ departmentId: deptId });
  closeModal();
  toast("Employee updated");
  cache.employees = [];
  refreshEmployeeTable();
};
