/* =====================================================================
   Global State
   ===================================================================== */

let currentUser = null;
let currentPage = "dashboard";
let cache = { departments: [], employees: [], payroll: {} };
let undoStack = [];
let bulkGridApi = null;
let selectedEmpId = null;
