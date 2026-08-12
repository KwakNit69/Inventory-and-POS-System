import { auth, db } from "../../Firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
const todaySalesElement = document.getElementById("todaySales");
const todayTransactionsElement = document.getElementById("todayTransactions");
const transactionCountElement = document.getElementById("transactionCount");
const itemsSoldElement = document.getElementById("itemsSold");
const lowStockElement = document.getElementById("lowStock");
const recentSalesBody = document.getElementById("recentSalesBody");
const inventoryAlerts = document.getElementById("inventoryAlerts");
const dashboardError = document.getElementById("dashboardError");
const dashboardErrorMessage = document.getElementById("dashboardErrorMessage");
const retryDashboard = document.getElementById("retryDashboard");
const welcomeName = document.getElementById("welcomeName");
const topbarName = document.getElementById("topbarName");
const topbarAvatar = document.getElementById("topbarAvatar");
const currentDate = document.getElementById("currentDate");
const activitySales = document.getElementById("activitySales");
const activityTransactions = document.getElementById("activityTransactions");
const activityItems = document.getElementById("activityItems");
const activityAverage = document.getElementById("activityAverage");
const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
const getDateValue = value => {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "string") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "number") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
};
const getInitials = name => {
    const clean = String(name || "Staff").trim();
    const parts = clean.split(/\s+/);
    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return clean.substring(0, 2).toUpperCase();
};
const getSaleTotal = sale => {
    return Number(sale.total ?? sale.amount ?? sale.grandTotal ?? sale.totalAmount ?? 0);
};
const getSaleItems = sale => {
    if (Array.isArray(sale.items)) {
        return sale.items.reduce((total, item) => total + Number(item.quantity ?? item.qty ?? 1), 0);
    }
    return Number(sale.itemCount ?? sale.itemsCount ?? sale.quantity ?? 0);
};
const getSaleDate = sale => {
    return getDateValue(sale.createdAt ?? sale.dateTime ?? sale.timestamp ?? sale.date ?? sale.created_at);
};
const getSalePayment = sale => {
    return String(sale.paymentMethod ?? sale.payment ?? sale.method ?? "Unknown");
};
const getSaleCashier = sale => {
    return String(sale.cashierUid ?? sale.cashierId ?? sale.userId ?? sale.createdBy ?? sale.staffUid ?? "");
};
const isSameDay = (date, target) => {
    return date && date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() && date.getDate() === target.getDate();
};
const showError = error => {
    console.error("Staff dashboard error:", error);
    dashboardError.classList.add("show");
    dashboardErrorMessage.textContent = error?.message || "Unable to load dashboard data from Firebase.";
};
const hideError = () => {
    dashboardError.classList.remove("show");
};
const loadUserInfo = user => {
    const storedName = sessionStorage.getItem("userName") || user.displayName || user.email?.split("@")[0] || "Staff";
    welcomeName.textContent = storedName;
    topbarName.textContent = storedName;
    topbarAvatar.textContent = getInitials(storedName);
};
const loadDashboard = async user => {
    hideError();
    recentSalesBody.innerHTML = '<tr><td colspan="5" class="empty-cell">Loading sales...</td></tr>';
    inventoryAlerts.innerHTML = '<div class="empty-message">Loading inventory...</div>';
    const now = new Date();
    currentDate.textContent = now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const salesSnapshot = await getDocs(collection(db, "sales"));
    const productSnapshot = await getDocs(collection(db, "products"));
    const sales = [];
    salesSnapshot.forEach(document => {
        const data = document.data();
        sales.push({ id: document.id, ...data });
    });
    const products = [];
    productSnapshot.forEach(document => {
        const data = document.data();
        products.push({ id: document.id, ...data });
    });
    const mySales = sales.filter(sale => {
        const cashier = getSaleCashier(sale);
        return !cashier || cashier === user.uid;
    });
    const todaysSales = mySales.filter(sale => isSameDay(getSaleDate(sale), now));
    const totalSales = todaysSales.reduce((sum, sale) => sum + getSaleTotal(sale), 0);
    const transactionCount = todaysSales.length;
    const totalItems = todaysSales.reduce((sum, sale) => sum + getSaleItems(sale), 0);
    todaySalesElement.textContent = money(totalSales);
    todayTransactionsElement.textContent = `${transactionCount} Transaction${transactionCount === 1 ? "" : "s"}`;
    transactionCountElement.textContent = transactionCount;
    itemsSoldElement.textContent = totalItems;
    activitySales.textContent = money(totalSales);
    activityTransactions.textContent = transactionCount;
    activityItems.textContent = totalItems;
    activityAverage.textContent = money(transactionCount ? totalSales / transactionCount : 0);
    const sortedSales = [...mySales].sort((a, b) => {
        const dateA = getSaleDate(a)?.getTime() || 0;
        const dateB = getSaleDate(b)?.getTime() || 0;
        return dateB - dateA;
    });
    const recentSales = sortedSales.slice(0, 8);
    if (!recentSales.length) {
        recentSalesBody.innerHTML = '<tr><td colspan="5" class="empty-cell">No sales recorded yet.</td></tr>';
    } else {
        recentSalesBody.innerHTML = recentSales.map(sale => {
            const date = getSaleDate(sale);
            const time = date ? date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "—";
            const transaction = sale.transactionNumber ?? sale.transactionId ?? sale.referenceNumber ?? sale.id;
            const items = getSaleItems(sale);
            const payment = getSalePayment(sale);
            const total = money(getSaleTotal(sale));
            return `<tr><td>${transaction}</td><td>${time}</td><td>${items}</td><td>${payment}</td><td><strong>${total}</strong></td></tr>`;
        }).join("");
    }
    const lowStockProducts = products.filter(product => {
        const stock = Number(product.stock ?? product.currentStock ?? product.quantity ?? 0);
        const alertLevel = Number(product.lowStockAlert ?? product.lowStockThreshold ?? product.reorderLevel ?? 10);
        return stock <= alertLevel;
    }).sort((a, b) => {
        const stockA = Number(a.stock ?? a.currentStock ?? a.quantity ?? 0);
        const stockB = Number(b.stock ?? b.currentStock ?? b.quantity ?? 0);
        return stockA - stockB;
    });
    lowStockElement.textContent = lowStockProducts.length;
    const alerts = lowStockProducts.slice(0, 6);
    if (!alerts.length) {
        inventoryAlerts.innerHTML = '<div class="empty-message">No low-stock products.</div>';
    } else {
        inventoryAlerts.innerHTML = alerts.map(product => {
            const stock = Number(product.stock ?? product.currentStock ?? product.quantity ?? 0);
            const name = product.name ?? product.productName ?? "Unnamed Product";
            const sku = product.sku ?? product.SKU ?? "";
            const out = stock <= 0;
            const className = out ? "stock-out" : "stock-low";
            const label = out ? "Out of Stock" : `${stock} left`;
            return `<div class="inventory-alert"><div class="inventory-product"><strong>${name}</strong><span>${sku}</span></div><span class="stock-badge ${className}">${label}</span></div>`;
        }).join("");
    }
};
document.getElementById("openPOS").addEventListener("click", () => window.location.href = "pos.html");
document.getElementById("viewSales").addEventListener("click", () => window.location.href = "sales.html");
document.getElementById("viewInventory").addEventListener("click", () => window.location.href = "inventory.html");
document.getElementById("salesLink").addEventListener("click", () => window.location.href = "sales.html");
document.getElementById("inventoryLink").addEventListener("click", () => window.location.href = "inventory.html");
retryDashboard.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
        await loadDashboard(user);
    } catch (error) {
        showError(error);
    }
});
onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "../login.html?role=staff";
        return;
    }
    loadUserInfo(user);
    try {
        await loadDashboard(user);
    } catch (error) {
        showError(error);
    }
});