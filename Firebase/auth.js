import { signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

function normalizeRole(role) {
    const value = String(role || "").trim().toLowerCase();
    if (value === "admin" || value === "administrator" || value === "administrator / admin") return "admin";
    if (value === "staff" || value === "cashier" || value === "staff / cashier") return "staff";
    return value;
}

function normalizeStatus(status) {
    return String(status || "").trim().toLowerCase();
}

async function loginUser(email, password) {
    if (!email || !password) {
        throw new Error("Please enter your email and password.");
    }
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user = credential.user;
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        await signOut(auth);
        throw new Error("User profile was not found. Please contact the administrator.");
    }
    const profile = userSnap.data();
    const status = normalizeStatus(profile.status);
    if (status !== "active") {
        await signOut(auth);
        throw new Error("Your account is inactive. Please contact the administrator.");
    }
    const role = normalizeRole(profile.role);
    if (role !== "admin" && role !== "staff") {
        await signOut(auth);
        throw new Error("Your account does not have a valid system role. Please contact the administrator.");
    }
    return {
        success: true,
        user: user,
        profile: profile,
        role: role
    };
}

async function logout() {
    await signOut(auth);
    sessionStorage.clear();
    localStorage.removeItem("selectedRole");
}

function getCurrentUser() {
    return auth.currentUser;
}

function watchAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}

async function getUserProfile(uid) {
    if (!uid) {
        return null;
    }
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        return null;
    }
    return userSnap.data();
}

async function resetPassword(email) {
    if (!email) {
        throw new Error("Please enter your email address.");
    }
    await sendPasswordResetEmail(auth, email);
}

export {
    loginUser,
    logout,
    getCurrentUser,
    watchAuthState,
    getUserProfile,
    resetPassword
};