/* =====================================================================
   Departments
   ===================================================================== */

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
