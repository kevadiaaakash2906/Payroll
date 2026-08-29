/* =====================================================================
   Auth — login, logout, auth-state driven screen switching
   ===================================================================== */

auth.onAuthStateChanged(user => {
  currentUser = user;
  if (user) {
    document.getElementById("login-screen").classList.remove("active");
    document.getElementById("app-shell").classList.add("active");
    document.getElementById("user-email").textContent = user.email;
    initApp();
  } else {
    document.getElementById("login-screen").classList.add("active");
    document.getElementById("app-shell").classList.remove("active");
  }
});

document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    document.getElementById("login-error").textContent = err.message;
  }
});

document.getElementById("btn-logout").addEventListener("click", () => auth.signOut());
