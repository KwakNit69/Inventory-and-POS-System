import { db, auth } from "../../Firebase/firebase-config.js";
import {
    collection,
    doc,
    getDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

let sales = [];
let filteredSales = [];
let currentPage = 1;
const salesPerPage = 10;
let selectedSale = null;
let unsubscribeSales = null;
let currentUser = null;
let currentUserProfile = null;

const tableBody = document.getElementById("salesTableBody");
const emptyState = document.getElementById("emptyState");
const emptyTitle = document.getElementById("emptyTitle");
const emptyMessage = document.getElementById("emptyMessage");
const paymentFilter = document.getElementById("paymentFilter");
const statusFilter = document.getElementById("statusFilter");
const breakdownGrid = document.getElementById("breakdownGrid");
const transactionModal = document.getElementById("transactionModal");

function money(value) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
}

function escapeHTML(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function dateValue(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "object" && typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
    const date = dateValue(value);
    if (!date) return "—";
    return date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function getUserName() {
    return currentUserProfile?.fullName ||
        currentUserProfile?.name ||
        currentUserProfile?.displayName ||
        currentUser?.displayName ||
        currentUser?.email ||
        "";
}

function getUserRole() {
    return currentUserProfile?.role ||
        currentUserProfile?.jobTitle ||
        currentUserProfile?.position ||
        "";
}

function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function updateProfile() {
    document.getElementById("currentUserName").textContent = getUserName();
    document.getElementById("currentUserRole").textContent = getUserRole();
    document.getElementById("currentUserAvatar").textContent = initials(getUserName());
}

async function loadUserProfile(user) {
    currentUserProfile = null;
    if (user) {
        try {
            const snapshot = await getDoc(doc(db, "users", user.uid));
            if (snapshot.exists()) currentUserProfile = snapshot.data();
        } catch (error) {
            console.error("User profile error:", error);
        }
    }
    updateProfile();
}

async function loadSidebar() {
    const container = document.getElementById("sidebar-container");
    if (!container) return;
    try {
        const response = await fetch("sidebar.html");
        if (!response.ok) throw new Error("Could not load sidebar.html");
        container.innerHTML = await response.text();
        const script = document.createElement("script");
        script.src = "sidebar.js";
        script.dataset.salesSidebar = "true";
        document.body.appendChild(script);
    } catch (error) {
        console.error("Sidebar error:", error);
    }
}

function normalizeSale(snapshot) {
    const data = snapshot.data();
    const items = Array.isArray(data.items) ? data.items.map(item => ({
        name: String(item.name || item.productName || ""),
        sku: String(item.sku || item.productSku || ""),
        productId: String(item.productId || ""),
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
        total: Number(item.total) || ((Number(item.price) || 0) * (Number(item.quantity) || 0))
    })) : [];
    return {
        id: String(data.transactionNumber || data.transactionId || snapshot.id),
        firestoreId: snapshot.id,
        date: data.createdAt || data.date || data.timestamp || null,
        customer: String(data.customerName || data.customer || ""),
        items,
        payment: String(data.paymentMethod || data.payment || ""),
        subtotal: Number(data.subtotal) || 0,
        discount: Number(data.discount) || 0,
        total: Number(data.total) || 0,
        cash: Number(data.cashReceived ?? data.cash) || 0,
        change: Number(data.change) || 0,
        cashier: String(data.staffName || data.cashier || ""),
        status: String(data.status || ""),
        raw: data
    };
}

function startSalesListener() {
    if (unsubscribeSales) unsubscribeSales();
    emptyState.classList.remove("show");
    emptyTitle.textContent = "Loading sales...";
    emptyMessage.textContent = "Loading transactions from Firebase.";
    emptyState.classList.add("show");
    unsubscribeSales = onSnapshot(
        collection(db, "sales"),
        snapshot => {
            sales = snapshot.docs.map(normalizeSale);
            sales.sort((a, b) => {
                const da = dateValue(a.date)?.getTime() || 0;
                const db = dateValue(b.date)?.getTime() || 0;
                return db - da;
            });
            buildFilters();
            filterSales();
        },
        error => {
            console.error("Sales Firebase error:", error);
            sales = [];
            filteredSales = [];
            render();
            emptyTitle.textContent = "Unable to load sales";
            emptyMessage.textContent = error.message || "Check your Firestore rules.";
            emptyState.classList.add("show");
        }
    );
}

function buildFilters() {
    const payments = [...new Set(sales.map(s => s.payment).filter(Boolean))].sort();
    const statuses = [...new Set(sales.map(s => s.status).filter(Boolean))].sort();
    paymentFilter.innerHTML = '<option value="all">All Payment Methods</option>';
    statusFilter.innerHTML = '<option value="all">All Status</option>';
    payments.forEach(payment => {
        const option = document.createElement("option");
        option.value = payment;
        option.textContent = payment;
        paymentFilter.appendChild(option);
    });
    statuses.forEach(status => {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status;
        statusFilter.appendChild(option);
    });
}

function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isDateMatch(date, filter) {
    if (filter === "all") return true;
    const now = new Date();
    if (!date) return false;
    if (filter === "today") return sameDay(date, now);
    if (filter === "yesterday") {
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        return sameDay(date, yesterday);
    }
    if (filter === "month") {
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }
    if (filter === "week") {
        const start = new Date(now);
        const day = start.getDay();
        const difference = day === 0 ? -6 : 1 - day;
        start.setDate(now.getDate() + difference);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        return date >= start && date < end;
    }
    return true;
}

function filterSales() {
    const search = document.getElementById("salesSearch").value.trim().toLowerCase();
    const dateFilter = document.getElementById("dateFilter").value;
    const payment = paymentFilter.value;
    const status = statusFilter.value;
    filteredSales = sales.filter(sale => {
        const searchable = [
            sale.id,
            sale.customer,
            sale.cashier,
            sale.payment,
            sale.status,
            ...sale.items.map(item => item.name)
        ].join(" ").toLowerCase();
        return (
            (!search || searchable.includes(search)) &&
            isDateMatch(dateValue(sale.date), dateFilter) &&
            (payment === "all" || sale.payment === payment) &&
            (status === "all" || sale.status === status)
        );
    });
    currentPage = 1;
    render();
}

function getItemCount(sale) {
    return sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}

function render() {
    tableBody.innerHTML = "";
    const total = filteredSales.length;
    if (total === 0) {
        emptyState.classList.add("show");
        emptyTitle.textContent = sales.length ? "No sales found" : "No sales recorded";
        emptyMessage.textContent = sales.length ? "Try changing your filters." : "Sales created through the POS will appear here.";
    } else {
        emptyState.classList.remove("show");
        const start = (currentPage - 1) * salesPerPage;
        const pageItems = filteredSales.slice(start, start + salesPerPage);
        pageItems.forEach(sale => {
            const row = document.createElement("tr");
            const paymentClass = sale.payment.toLowerCase().replaceAll(" ", "-");
            const statusClass = sale.status.toLowerCase().replaceAll(" ", "-");
            const discountClass = sale.discount > 0 ? "has-discount" : "no-discount";
            row.innerHTML = `
<td>
<div class="transaction-id">${escapeHTML(sale.id)}</div>
</td>
<td>
<div class="transaction-date">${escapeHTML(formatDate(sale.date))}</div>
</td>
<td>
<div class="customer-name">${escapeHTML(sale.customer || "Walk-in Customer")}</div>
</td>
<td>
<div class="transaction-items">${getItemCount(sale)} item(s)</div>
</td>
<td>
<span class="payment-badge payment-${escapeHTML(paymentClass)}">${escapeHTML(sale.payment || "—")}</span>
</td>
<td>
<div class="sales-subtotal">${money(sale.subtotal)}</div>
</td>
<td>
<div class="sales-discount ${discountClass}">${sale.discount > 0 ? `-${money(sale.discount)}` : money(0)}</div>
</td>
<td>
<div class="sales-total">${money(sale.total)}</div>
</td>
<td>
<div class="customer-name">${escapeHTML(sale.cashier || "—")}</div>
</td>
<td>
<span class="status-badge status-${escapeHTML(statusClass)}">${escapeHTML(sale.status || "—")}</span>
</td>
<td>
<button class="view-btn" data-id="${escapeHTML(sale.firestoreId)}" type="button">View</button>
</td>
`;
            tableBody.appendChild(row);
        });
    }
    const totalPages = Math.max(1, Math.ceil(total / salesPerPage));
    document.getElementById("currentPage").textContent = currentPage;
    document.getElementById("paginationInfo").textContent = total ? `Showing ${(currentPage - 1) * salesPerPage + 1}-${Math.min(currentPage * salesPerPage, total)} of ${total} transactions` : "Showing 0 of 0 transactions";
    document.getElementById("previousPage").disabled = currentPage <= 1;
    document.getElementById("nextPage").disabled = currentPage >= totalPages;
    updateSummary();
    renderBreakdown();
}

function updateSummary() {
    const completed = sales.filter(s => !s.status || s.status.toLowerCase() === "completed");
    const total = completed.reduce((sum, s) => sum + s.total, 0);
    const count = completed.length;
    const average = count ? total / count : 0;
    const now = new Date();
    const today = completed.filter(s => sameDay(dateValue(s.date), now)).reduce((sum, s) => sum + s.total, 0);
    document.getElementById("totalSales").textContent = money(total);
    document.getElementById("totalTransactions").textContent = count;
    document.getElementById("averageTransaction").textContent = money(average);
    document.getElementById("todaySales").textContent = money(today);
}

function renderBreakdown() {
    breakdownGrid.innerHTML = "";
    const methods = [...new Set(sales.map(s => s.payment).filter(Boolean))];
    if (!methods.length) {
        breakdownGrid.innerHTML = `<div class="breakdown-empty">No payment data available.</div>`;
        return;
    }
    methods.forEach(method => {
        const methodSales = sales.filter(s => s.payment === method);
        const total = methodSales.reduce((sum, s) => sum + s.total, 0);
        const card = document.createElement("div");
        const className = method.toLowerCase().replaceAll(" ", "-");
        card.className = "breakdown-card";
        card.innerHTML = `
<div class="breakdown-icon ${escapeHTML(className)}">${escapeHTML(method.substring(0, 1).toUpperCase())}</div>
<div>
<span>${escapeHTML(method)}</span>
<strong>${money(total)}</strong>
<small>${methodSales.length} transaction(s)</small>
</div>
`;
        breakdownGrid.appendChild(card);
    });
}

function openTransaction(id) {
    const sale = sales.find(item => item.firestoreId === id);
    if (!sale) return;
    selectedSale = sale;
    document.getElementById("detailTransaction").textContent = sale.id;
    document.getElementById("detailStatus").textContent = sale.status || "—";
    document.getElementById("detailDate").textContent = formatDate(sale.date);
    document.getElementById("detailCustomer").textContent = sale.customer || "Walk-in Customer";
    document.getElementById("detailCashier").textContent = sale.cashier || "—";
    document.getElementById("detailPayment").textContent = sale.payment || "—";
    document.getElementById("detailSubtotal").textContent = money(sale.subtotal);
    document.getElementById("detailDiscount").textContent = sale.discount > 0 ? `-${money(sale.discount)}` : money(0);
    document.getElementById("detailTotal").textContent = money(sale.total);
    document.getElementById("detailCash").textContent = money(sale.cash);
    document.getElementById("detailChange").textContent = money(sale.change);
    const items = document.getElementById("detailItems");
    items.innerHTML = "";
    if (!sale.items.length) {
        items.innerHTML = '<div class="detail-empty">No item details stored for this transaction.</div>';
    } else {
        sale.items.forEach(item => {
            const div = document.createElement("div");
            div.className = "detail-item";
            div.innerHTML = `
<div>
<div class="detail-item-name">${escapeHTML(item.name || "Product")}</div>
<div class="detail-item-qty">${item.quantity} × ${money(item.price)}</div>
</div>
<div class="detail-item-total">${money(item.total)}</div>
`;
            items.appendChild(div);
        });
    }
    transactionModal.classList.add("show");
}

tableBody.addEventListener("click", event => {
    const button = event.target.closest(".view-btn");
    if (!button) return;
    openTransaction(button.dataset.id);
});

document.getElementById("closeTransactionModal").addEventListener("click", () => {
    transactionModal.classList.remove("show");
});

document.getElementById("closeDetailButton").addEventListener("click", () => {
    transactionModal.classList.remove("show");
});

transactionModal.addEventListener("click", event => {
    if (event.target === transactionModal) transactionModal.classList.remove("show");
});

document.getElementById("salesSearch").addEventListener("input", filterSales);
document.getElementById("dateFilter").addEventListener("change", filterSales);
paymentFilter.addEventListener("change", filterSales);
statusFilter.addEventListener("change", filterSales);

document.getElementById("resetFilters").addEventListener("click", () => {
    document.getElementById("salesSearch").value = "";
    document.getElementById("dateFilter").value = "all";
    paymentFilter.value = "all";
    statusFilter.value = "all";
    filterSales();
});

document.getElementById("globalSearch").addEventListener("keydown", event => {
    if (event.key === "Enter") {
        document.getElementById("salesSearch").value = event.currentTarget.value;
        filterSales();
    }
});

document.getElementById("previousPage").addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        render();
    }
});

document.getElementById("nextPage").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredSales.length / salesPerPage));
    if (currentPage < totalPages) {
        currentPage++;
        render();
    }
});

document.getElementById("exportSales").addEventListener("click", () => {
    if (!filteredSales.length) {
        alert("There are no Firebase sales to export.");
        return;
    }
    const headers = [
        "Transaction",
        "Date",
        "Customer",
        "Items",
        "Payment",
        "Subtotal",
        "Discount",
        "Total",
        "Cashier",
        "Status"
    ];
    const rows = filteredSales.map(sale => [
        sale.id,
        formatDate(sale.date),
        sale.customer || "Walk-in Customer",
        getItemCount(sale),
        sale.payment,
        sale.subtotal,
        sale.discount,
        sale.total,
        sale.cashier,
        sale.status
    ]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sales-export.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
});

document.getElementById("printTransaction").addEventListener("click", () => {
    if (!selectedSale) return;
    const sale = selectedSale;
    const itemRows = sale.items.map(item => `
<tr>
<td>${escapeHTML(item.name)}</td>
<td>${item.quantity}</td>
<td>${money(item.price)}</td>
<td>${money(item.total)}</td>
</tr>
`).join("");
    const printWindow = window.open("", "_blank", "width=500,height=700");
    if (!printWindow) {
        alert("Please allow pop-ups to print the receipt.");
        return;
    }
    printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
<title>${escapeHTML(sale.id)}</title>
<style>
body{font-family:Arial,sans-serif;width:420px;margin:30px auto;font-size:12px;color:#222}
h2{text-align:center;margin:0}
p{text-align:center;color:#666}
hr{border:0;border-top:1px dashed #888;margin:15px 0}
.info div,.totals div{display:flex;justify-content:space-between;margin:7px 0}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{text-align:left;padding:6px 3px;border-bottom:1px solid #eee}
th:last-child,td:last-child{text-align:right}
.total{font-weight:bold;font-size:14px;border-top:1px solid #222;padding-top:8px}
.discount{color:#d74343}
.thanks{text-align:center;margin-top:20px}
</style>
</head>
<body>
<h2>StockMaster</h2>
<p>Sales Receipt</p>
<hr>
<div class="info">
<div><span>Transaction</span><strong>${escapeHTML(sale.id)}</strong></div>
<div><span>Date</span><strong>${escapeHTML(formatDate(sale.date))}</strong></div>
<div><span>Customer</span><strong>${escapeHTML(sale.customer || "Walk-in Customer")}</strong></div>
<div><span>Cashier</span><strong>${escapeHTML(sale.cashier || "—")}</strong></div>
</div>
<hr>
<table>
<thead>
<tr>
<th>Item</th>
<th>Qty</th>
<th>Price</th>
<th>Total</th>
</tr>
</thead>
<tbody>${itemRows}</tbody>
</table>
<hr>
<div class="totals">
<div><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div>
<div class="discount"><span>Discount</span><strong>-${money(sale.discount)}</strong></div>
<div class="total"><span>Total</span><strong>${money(sale.total)}</strong></div>
<div><span>Payment</span><strong>${escapeHTML(sale.payment || "—")}</strong></div>
<div><span>Cash Received</span><strong>${money(sale.cash)}</strong></div>
<div><span>Change</span><strong>${money(sale.change)}</strong></div>
</div>
<hr>
<div class="thanks">Thank you for your purchase.</div>
<script>
window.onload=function(){window.print();}
<\/script>
</body>
</html>
`);
    printWindow.document.close();
});

onAuthStateChanged(auth, async user => {
    currentUser = user;
    await loadUserProfile(user);
    if (!user) {
        if (unsubscribeSales) {
            unsubscribeSales();
            unsubscribeSales = null;
        }
        sales = [];
        filteredSales = [];
        render();
        emptyState.classList.add("show");
        emptyTitle.textContent = "Sign in required";
        emptyMessage.textContent = "Please sign in to view sales from Firebase.";
        return;
    }
    startSalesListener();
});

loadSidebar();