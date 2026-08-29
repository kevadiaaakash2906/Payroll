/* =====================================================================
   Data Service — Firestore reads/writes
   ===================================================================== */

async function loadDepartments() {
  const snap = await db.collection("departments").orderBy("name").get();
  cache.departments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return cache.departments;
}

async function loadEmployees() {
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
    .where("month", "<", month)
    .orderBy("month", "desc")
    .limit(1)
    .get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function savePayroll(data) {
  const docId = `${data.employeeId}_${data.month}`;
  await db.collection("payroll").doc(docId).set(data, { merge: true });
}

async function deletePayroll(employeeId, month) {
  const docId = `${employeeId}_${month}`;
  await db.collection("payroll").doc(docId).delete();
}
