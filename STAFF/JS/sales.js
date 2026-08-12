import { auth, db } from "../../Firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const salesBody = document.getElementById("salesBody");
const salesSearch = document.getElementById("salesSearch");
const dateFilter = document.getElementById("dateFilter");
const paymentFilter = document.getElementById("paymentFilter");
const resetFilters = document.getElementById("resetFilters");
const refreshSales = document.getElementById("refreshSales");
const todaySales = document.getElementById("todaySales");
const transactionCount = document.getElementById("transactionCount");
const itemsSold = document.getElementById("itemsSold");
const averageSale = document.getElementById("averageSale");
const resultCount = document.getElementById("resultCount");
const previousPage = document.getElementById("previousPage");
const nextPage = document.getElementById("nextPage");
const pageNumber = document.getElementById("pageNumber");
const salesError = document.getElementById("salesError");
const salesErrorMessage = document.getElementById("salesErrorMessage");
const retryButton = document.getElementById("retryButton");
const staffName = document.getElementById("staffName");
const staffAvatar = document.getElementById("staffAvatar");
const saleModal = document.getElementById("saleModal");
const closeModal = document.getElementById("closeModal");
const modalTransaction = document.getElementById("modalTransaction");
const modalDate = document.getElementById("modalDate");
const modalPayment = document.getElementById("modalPayment");
const modalStatus = document.getElementById("modalStatus");
const modalSubtotal = document.getElementById("modalSubtotal");
const modalDiscount = document.getElementById("modalDiscount");
const modalTotal = document.getElementById("modalTotal");
const modalItems = document.getElementById("modalItems");
const modalPaid = document.getElementById("modalPaid");
const modalChange = document.getElementById("modalChange");

let currentUser = null;
let sales = [];
let filteredSales = [];
let currentPage = 1;
const pageSize = 10;

const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);

const initials = name => {
    const parts = String(name || "Staff").trim().split(/\s+/);
    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return String(name || "ST").substring(0, 2).toUpperCase();
};

const getDate = value => {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "string") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "number") return new Date(value);
    return null;
};

const getTotal = sale => Number(sale.total ?? sale.amount ?? sale.grandTotal ?? sale.totalAmount ?? 0);

const getDiscount = sale => Number(sale.discountAmount ?? sale.discount ?? sale.discountValue ?? sale.discountPrice ?? 0);

const getSubtotal = sale => {
    const direct = Number(sale.subtotal ?? sale.subTotal ?? sale.beforeDiscount ?? sale.amountBeforeDiscount ?? 0);
    if (direct > 0) return direct;
    const total = getTotal(sale);
    const discount = getDiscount(sale);
    return total + discount;
};

const getItems = sale => {
    if (Array.isArray(sale.items)) return sale.items.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 1), 0);
    return Number(sale.itemCount ?? sale.itemsCount ?? sale.quantity ?? 0);
};

const getPayment = sale => String(sale.paymentMethod ?? sale.payment ?? sale.method ?? "Unknown");

const getCashier = sale => String(sale.cashierUid ?? sale.cashierId ?? sale.userId ?? sale.createdBy ?? sale.staffUid ?? "");

const getSaleDate = sale => getDate(sale.createdAt ?? sale.dateTime ?? sale.timestamp ?? sale.date ?? sale.created_at);

const getTransaction = sale => String(sale.transactionNumber ?? sale.transactionId ?? sale.referenceNumber ?? sale.id);

const getStatus = sale => String(sale.status ?? "Completed");

const showError = error => {
    console.error("Sales error:", error);
    salesError.classList.add("show");
    salesErrorMessage.textContent = error?.message || "Unable to load sales from Firebase.";
};

const hideError = () => salesError.classList.remove("show");

const isToday = date => {
    const now = new Date();
    return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};

const isThisWeek = date => {
    if (!date) return false;
    const now = new Date();
    const start = new Date(now);
    const day = start.getDay();
    const difference = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - difference);
    start.setHours(0, 0, 0, 0);
    return date >= start && date <= now;
};

const isThisMonth = date => {
    const now = new Date();
    return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

const loadStaffInfo = user => {
    const name = sessionStorage.getItem("userName") || user.displayName || user.email?.split("@")[0] || "Staff";
    staffName.textContent = name;
    staffAvatar.textContent = initials(name);
};

const loadSales = async () => {
    hideError();
    salesBody.innerHTML = '<tr><td colspan="9" class="empty-cell">Loading sales...</td></tr>';
    const snapshot = await getDocs(collection(db, "sales"));
    sales = [];
    snapshot.forEach(document => {
        sales.push({ id: document.id, ...document.data() });
    });
    sales = sales.filter(sale => {
        const cashier = getCashier(sale);
        return !cashier || cashier === currentUser.uid;
    });
    sales.sort((a, b) => (getSaleDate(b)?.getTime() || 0) - (getSaleDate(a)?.getTime() || 0));
    updateSummary();
    applyFilters();
};

const updateSummary = () => {
    const today = sales.filter(sale => isToday(getSaleDate(sale)));
    const total = today.reduce((sum, sale) => sum + getTotal(sale), 0);
    const count = today.length;
    const items = today.reduce((sum, sale) => sum + getItems(sale), 0);
    todaySales.textContent = money(total);
    transactionCount.textContent = count;
    itemsSold.textContent = items;
    averageSale.textContent = money(count ? total / count : 0);
};

const applyFilters = () => {
    const search = salesSearch.value.trim().toLowerCase();
    const date = dateFilter.value;
    const payment = paymentFilter.value;
    filteredSales = sales.filter(sale => {
        const transaction = getTransaction(sale).toLowerCase();
        const paymentText = getPayment(sale).toLowerCase();
        const status = getStatus(sale).toLowerCase();
        const matchesSearch = !search || transaction.includes(search) || paymentText.includes(search) || status.includes(search);
        const saleDate = getSaleDate(sale);
        let matchesDate = true;
        if (date === "today") matchesDate = isToday(saleDate);
        if (date === "week") matchesDate = isThisWeek(saleDate);
        if (date === "month") matchesDate = isThisMonth(saleDate);
        const matchesPayment = payment === "all" || getPayment(sale).toLowerCase() === payment.toLowerCase();
        return matchesSearch && matchesDate && matchesPayment;
    });
    currentPage = 1;
    renderTable();
};

const renderTable = () => {
    const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * pageSize;
    const rows = filteredSales.slice(start, start + pageSize);
    pageNumber.textContent = currentPage;
    resultCount.textContent = `Showing ${filteredSales.length ? start + 1 : 0}-${Math.min(start + pageSize, filteredSales.length)} of ${filteredSales.length} transaction${filteredSales.length === 1 ? "" : "s"}`;
    previousPage.disabled = currentPage <= 1;
    nextPage.disabled = currentPage >= totalPages;
    if (!rows.length) {
        salesBody.innerHTML = '<tr><td colspan="9" class="empty-cell">No sales found.</td></tr>';
        return;
    }
    salesBody.innerHTML = rows.map(sale => {
        const date = getSaleDate(sale);
        const dateText = date ? date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";
        const timeText = date ? date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "";
        const payment = getPayment(sale);
        const paymentClass = payment.toLowerCase() === "cash" ? "payment-cash" : payment.toLowerCase() === "card" ? "payment-card" : payment.toLowerCase() === "gcash" ? "payment-gcash" : "payment-other";
        const transaction = getTransaction(sale);
        const subtotal = getSubtotal(sale);
        const discount = getDiscount(sale);
        const total = getTotal(sale);
        const status = getStatus(sale);
        const discountHtml = discount > 0 ? `<span class="discount-badge">${money(discount)}</span>` : `<span class="discount-none">₱0.00</span>`;
        return `<tr>
<td><strong>${escapeHtml(transaction)}</strong></td>
<td>${dateText}<br><small>${timeText}</small></td>
<td>${getItems(sale)}</td>
<td><span class="payment-badge ${paymentClass}">${escapeHtml(payment)}</span></td>
<td><strong>${money(subtotal)}</strong></td>
<td>${discountHtml}</td>
<td><strong>${money(total)}</strong></td>
<td><span class="status-badge">${escapeHtml(status)}</span></td>
<td><button class="view-button" data-id="${escapeHtml(sale.id)}">View</button></td>
</tr>`;
    }).join("");
    document.querySelectorAll(".view-button").forEach(button => {
        button.addEventListener("click", () => openSale(button.dataset.id));
    });
};

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

const openSale = id => {
    const sale = sales.find(item => item.id === id);
    if (!sale) return;
    const date = getSaleDate(sale);
    const subtotal = getSubtotal(sale);
    const discount = getDiscount(sale);
    const total = getTotal(sale);
    modalTransaction.textContent = getTransaction(sale);
    modalDate.textContent = date ? date.toLocaleString("en-PH") : "—";
    modalPayment.textContent = getPayment(sale);
    modalStatus.textContent = getStatus(sale);
    modalSubtotal.textContent = money(subtotal);
    modalDiscount.textContent = money(discount);
    modalTotal.textContent = money(total);
    modalPaid.textContent = money(sale.amountPaid ?? sale.paidAmount ?? total);
    modalChange.textContent = money(sale.change ?? 0);
    const items = Array.isArray(sale.items) ? sale.items : [];
    if (!items.length) {
        modalItems.innerHTML = '<tr><td colspan="4" class="empty-cell">No item details available.</td></tr>';
    } else {
        modalItems.innerHTML = items.map(item => {
            const name = item.name ?? item.productName ?? "Product";
            const quantity = Number(item.quantity ?? item.qty ?? 1);
            const price = Number(item.price ?? item.unitPrice ?? 0);
            const itemSubtotal = Number(item.subtotal ?? price * quantity);
            return `<tr><td>${escapeHtml(name)}</td><td>${quantity}</td><td>${money(price)}</td><td>${money(itemSubtotal)}</td></tr>`;
        }).join("");
    }
    saleModal.classList.add("show");
};

salesSearch.addEventListener("input", applyFilters);
dateFilter.addEventListener("change", applyFilters);
paymentFilter.addEventListener("change", applyFilters);

resetFilters.addEventListener("click", () => {
    salesSearch.value = "";
    dateFilter.value = "all";
    paymentFilter.value = "all";
    applyFilters();
});

refreshSales.addEventListener("click", async () => {
    if (!currentUser) return;
    try {
        await loadSales();
    } catch (error) {
        showError(error);
    }
});

retryButton.addEventListener("click", async () => {
    if (!currentUser) return;
    try {
        await loadSales();
    } catch (error) {
        showError(error);
    }
});

previousPage.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});

nextPage.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});

closeModal.addEventListener("click", () => saleModal.classList.remove("show"));

saleModal.addEventListener("click", event => {
    if (event.target === saleModal) saleModal.classList.remove("show");
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") saleModal.classList.remove("show");
});

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "../login.html?role=staff";
        return;
    }
    currentUser = user;
    loadStaffInfo(user);
    try {
        await loadSales();
    } catch (error) {
        showError(error);
    }
});