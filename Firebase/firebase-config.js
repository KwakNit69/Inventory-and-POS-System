import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "AIzaSyDDrwLvQpLwQaO0W0epKF2ZIsXfo9nvIAY",
  authDomain: "inventory-89f4d.firebaseapp.com",
  projectId: "inventory-89f4d",
  storageBucket: "inventory-89f4d.firebasestorage.app",
  messagingSenderId: "690042789682",
  appId: "1:690042789682:web:496e6afa393a6d0c9a012b",
  measurementId: "G-YFSNT9P6EL"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
export { app, auth, db };