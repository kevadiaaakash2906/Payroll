/* =====================================================================
   Data Service — Firebase Firestore helpers
   ===================================================================== */

async function loadDepartments() {
  if (cache.departments.length) return cache.departments;
  const snap = await db.collection("departments").orderBy("name").get();
  cache.departments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return cache.departments;
}

async function loadEmployees() {
  if (cache.employees.length) return cache.employees;
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
    .orderBy("month", "desc")
    .limit(5)
    .get();
  const rows = snap.docs.map(d => d.data()).filter(r => r.month < month);
  return rows.length ? rows[0] : null;
}

async function savePayroll(data) {
  const docId = `${data.employeeId}_${data.month}`;
  await db.collection("payroll").doc(docId).set(data, { merge: true });
}

async function deletePayroll(employeeId, month) {
  const docId = `${employeeId}_${data.month}`;
  await db.collection("payroll").doc(docId).delete();
}

function getActiveSrNoMap() {
  const active = cache.employees.filter(e => e.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));
  const map = new Map();
  active.forEach((e, i) => map.set(e.id, i + 1));
  return map;
}
