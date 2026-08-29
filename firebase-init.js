/* =====================================================================
   Firebase Initialization
   ===================================================================== */

// REPLACE THESE with your own Firebase project settings
// Project Settings → General → scroll down to "Your apps" → click the </> (Web) icon
// Copy the firebaseConfig object and paste it here, replacing the placeholders below.

const firebaseConfig = {
  apiKey: "AIzaSyCHiejDTE6WBmihLpOz8a1bZH9b9_u34cc",
  authDomain: "payroll-423de.firebaseapp.com",
  projectId: "payroll-423de",
  storageBucket: "payroll-423de.firebasestorage.app",
  messagingSenderId: "218493880656",
  appId: "1:218493880656:web:4ef93328965ab0fc378455"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
