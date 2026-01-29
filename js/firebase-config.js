// Firebase Configuration
// Replace with your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyAfPhh_8WB9x7s8lMvy7Raqcs2A81nC_E8",
  authDomain: "integra-2026-60e94.firebaseapp.com",
  projectId: "integra-2026-60e94",
  // Use default Firebase Storage bucket format: <project-id>.appspot.com
  storageBucket: "integra-2026-60e94.appspot.com",
  messagingSenderId: "899285584680",
  appId: "1:899285584680:web:41ca7990e18e3066ee9e1d",
  measurementId: "G-0XFD0FDJS2"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// Export for use in other files
window.db = db;
window.auth = auth;
window.storage = storage;
window.firebaseConfig = firebaseConfig;
