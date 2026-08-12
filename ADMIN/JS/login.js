import { loginUser, resetPassword, logout } from "../../FIREBASE/auth.js";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const message = document.getElementById("message");
const forgotPassword = document.getElementById("forgotPassword");
const contactAdmin = document.getElementById("contactAdmin");
const backHome = document.getElementById("backHome");

function normalizeRole(role) {
    const value = String(role || "").trim().toLowerCase();
    if (value === "admin" || value === "administrator" || value === "administrator / admin") return "admin";
    if (value === "staff" || value === "cashier" || value === "staff / cashier") return "staff";
    return value;
}

const urlParams = new URLSearchParams(window.location.search);
const selectedRole = normalizeRole(urlParams.get("role") || localStorage.getItem("selectedRole") || "admin");

if (selectedRole) localStorage.setItem("selectedRole", selectedRole);

if (backHome) {
    backHome.addEventListener("click", () => {
        localStorage.removeItem("selectedRole");
        window.location.href = "index.html";
    });
}

if (togglePassword) {
    togglePassword.addEventListener("click", () => {
        const isPassword = passwordInput.type === "password";
        passwordInput.type = isPassword ? "text" : "password";
        togglePassword.textContent = "◉";
        togglePassword.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
}

loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    message.textContent = "";
    message.style.color = "#c0392b";
    if (!email || !password) {
        message.textContent = "Please enter your email and password.";
        return;
    }
    const loginButton = loginForm.querySelector('button[type="submit"]');
    const originalText = loginButton.textContent;
    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";
    try {
        const result = await loginUser(email, password);
        const actualRole = normalizeRole(result.role);
        if (selectedRole && actualRole !== selectedRole) {
            await logout();
            message.style.color = "#c0392b";
            message.textContent = `This account is registered as ${result.profile.role || actualRole}.`;
            loginButton.disabled = false;
            loginButton.textContent = originalText;
            return;
        }
        message.style.color = "#16803c";
        message.textContent = "Login successful. Redirecting...";
        sessionStorage.setItem("userRole", actualRole);
        sessionStorage.setItem("userName", result.profile.fullName || result.profile.name || result.user.email);
        sessionStorage.setItem("userEmail", result.user.email);
        sessionStorage.setItem("userUid", result.user.uid);
        setTimeout(() => {
            if (actualRole === "admin") {
                window.location.href = "admin-dashboard.html";
                return;
            }
            if (actualRole === "staff") {
                window.location.href = "STAFF/dashboard.html";
                return;
            }
        }, 500);
    } catch (error) {
        console.error("Login error:", error);
        message.style.color = "#c0392b";
        message.textContent = error.message || "Unable to log in. Please try again.";
        loginButton.disabled = false;
        loginButton.textContent = originalText;
    }
});

forgotPassword.addEventListener("click", async event => {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
        message.style.color = "#c0392b";
        message.textContent = "Enter your email address first.";
        emailInput.focus();
        return;
    }
    try {
        await resetPassword(email);
        message.style.color = "#16803c";
        message.textContent = "Password reset email sent. Please check your inbox.";
    } catch (error) {
        console.error("Password reset error:", error);
        message.style.color = "#c0392b";
        message.textContent = error.message || "Unable to send password reset email.";
    }
});

contactAdmin.addEventListener("click", event => {
    event.preventDefault();
    message.style.color = "#0069d9";
    message.textContent = "Please contact your StockMaster administrator for an account.";
});