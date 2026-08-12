import { auth } from "../Firebase/firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
const navigation = document.querySelectorAll(".staff-navigation a");
const currentFile = window.location.pathname.split("/").pop().toLowerCase();
navigation.forEach(link => {
    const target = (link.getAttribute("data-page") || link.getAttribute("href") || "").toLowerCase();
    if (currentFile === target) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
    }
});
if (!currentFile) {
    const dashboard = document.querySelector('[data-page="dashboard.html"]');
    if (dashboard) {
        dashboard.classList.add("active");
        dashboard.setAttribute("aria-current", "page");
    }
}
const userNameElement = document.getElementById("staffAccountName");
const userRoleElement = document.getElementById("staffAccountRole");
const avatarElement = document.getElementById("staffAccountAvatar");
const storedName = sessionStorage.getItem("userName") || localStorage.getItem("userName") || "Staff";
const storedRole = (sessionStorage.getItem("userRole") || "staff").toLowerCase();
if (userNameElement) userNameElement.textContent = storedName;
if (userRoleElement) userRoleElement.textContent = storedRole === "staff" || storedRole === "cashier" ? "Staff / Cashier" : "Administrator";
if (avatarElement) {
    const nameParts = storedName.trim().split(/\s+/).filter(Boolean);
    if (nameParts.length > 1) {
        avatarElement.textContent = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
    } else {
        avatarElement.textContent = storedName.substring(0, 2).toUpperCase();
    }
}
const newTransaction = document.getElementById("staffNewTransaction");
if (newTransaction) {
    newTransaction.addEventListener("click", () => {
        window.location.href = "pos.html";
    });
}
const logoutButton = document.getElementById("staffLogout");
if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        const label = logoutButton.querySelector("span:last-child");
        if (label) label.textContent = "Logging out...";
        try {
            await signOut(auth);
            sessionStorage.clear();
            window.location.href = "../login.html?role=staff";
        } catch (error) {
            console.error("Logout error:", error);
            logoutButton.disabled = false;
            if (label) label.textContent = "Logout";
            alert("Unable to log out. Please try again.");
        }
    });
}