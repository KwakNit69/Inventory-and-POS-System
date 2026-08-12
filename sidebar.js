(async function () {
    "use strict";
    function getCurrentPage() {
        let file = window.location.pathname.split("/").pop().toLowerCase();
        if (!file) file = "admin-dashboard.html";
        return file;
    }
    function setActiveSidebarItem() {
        const currentPage = getCurrentPage();
        document.querySelectorAll("#sidebarNav .nav-item").forEach(item => {
            const target = (item.getAttribute("data-page") || "").toLowerCase();
            const active = target === currentPage;
            item.classList.toggle("active", active);
            if (active) item.setAttribute("aria-current", "page");
            else item.removeAttribute("aria-current");
        });
    }
    function setupSidebarActions() {
        const settings = document.getElementById("settingsLink");
        const help = document.getElementById("helpLink");
        const logout = document.getElementById("logoutLink");
        if (settings) {
            settings.addEventListener("click", event => {
                event.preventDefault();
            });
        }
        if (help) {
            help.addEventListener("click", event => {
                event.preventDefault();
            });
        }
        if (logout) {
            logout.addEventListener("click", event => {
                event.preventDefault();
                window.location.href = "login.html";
            });
        }
    }
    async function loadSidebar() {
        const container = document.getElementById("sidebar-container");
        if (!container) return;
        try {
            const response = await fetch("sidebar.html?v=21", { cache: "no-store" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const html = await response.text();
            container.innerHTML = html;
            setActiveSidebarItem();
            setupSidebarActions();
        } catch (error) {
            console.error("Sidebar loading error:", error);
            container.innerHTML = '<aside class="sidebar sidebar-error"><div>Unable to load sidebar.</div></aside>';
        }
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadSidebar, { once: true });
    } else {
        loadSidebar();
    }
    window.addEventListener("pageshow", function () {
        setTimeout(setActiveSidebarItem, 50);
    });
})();