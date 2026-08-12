import { db, auth } from "../../Firebase/firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
const salesElement = document.getElementById("sales");
const cashInElement = document.getElementById("cashIn");
const cashOutElement = document.getElementById("cashOut");
const netCashElement = document.getElementById("netCash");
const cashOnHandElement = document.getElementById("cashOnHand");
const cashInNote = document.getElementById("cashInNote");
const cashOutNote = document.getElementById("cashOutNote");
const netCashNote = document.getElementById("netCashNote");
const salesNote = document.getElementById("salesNote");
const beginningBalance = document.getElementById("beginningBalance");
const summaryCashIn = document.getElementById("summaryCashIn");
const summaryCashOut = document.getElementById("summaryCashOut");
const summaryNet = document.getElementById("summaryNet");
const endingBalance = document.getElementById("endingBalance");
const profileName = document.getElementById("profileName");
const profileRole = document.getElementById("profileRole");
const profileAvatar = document.getElementById("profileAvatar");
const greeting = document.getElementById("greeting");
const errorBox = document.getElementById("dashboardError");
const chartEmpty = document.getElementById("chartEmpty");
const periodButtons = document.querySelectorAll(".date-filter button");
let salesData = [];
let cashflowData = [];
let chart = null;
let selectedPeriod = "today";
function getDate(value) {
    if (!value) return null;
    if (value && typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}
function getAmount(data) {
    const fields = ["amount", "total", "value", "cashAmount", "grandTotal", "totalAmount"];
    for (const field of fields) {
        const number = Number(data[field]);
        if (Number.isFinite(number)) return number;
    }
    return 0;
}
function getSaleTotal(data) {
    const fields = ["total", "grandTotal", "amount", "totalAmount", "saleTotal", "netTotal"];
    for (const field of fields) {
        const number = Number(data[field]);
        if (Number.isFinite(number)) return number;
    }
    return 0;
}
function getSaleDate(data) {
    return getDate(data.createdAt) || getDate(data.created_at) || getDate(data.date) || getDate(data.saleDate) || getDate(data.transactionDate) || getDate(data.timestamp) || getDate(data.updatedAt);
}
function getCashflowDate(data) {
    return getDate(data.createdAt) || getDate(data.created_at) || getDate(data.date) || getDate(data.transactionDate) || getDate(data.timestamp) || getDate(data.updatedAt);
}
function isCompleted(data) {
    if (data.status === undefined || data.status === null) return true;
    const status = String(data.status).toLowerCase();
    return ["completed", "complete", "paid", "success", "successful", "settled"].includes(status);
}
function isCashOut(data) {
    const type = String(data.type || data.transactionType || data.flowType || "").toLowerCase();
    if (["cashout", "cash out", "outflow", "expense", "withdrawal", "purchase", "inventory purchase", "refund"].includes(type)) return true;
    if (data.cashOut !== undefined) return Boolean(data.cashOut);
    if (data.isCashOut !== undefined) return Boolean(data.isCashOut);
    return false;
}
function isCashIn(data) {
    const type = String(data.type || data.transactionType || data.flowType || "").toLowerCase();
    if (["cashin", "cash in", "inflow", "income", "sale", "sales", "other income"].includes(type)) return true;
    if (data.cashIn !== undefined) return Boolean(data.cashIn);
    if (data.isCashIn !== undefined) return Boolean(data.isCashIn);
    return false;
}
function getStart(period) {
    const now = new Date();
    const start = new Date(now);
    if (period === "today") {
        start.setHours(0, 0, 0, 0);
        return start;
    }
    if (period === "week") {
        const day = now.getDay();
        const difference = day === 0 ? 6 : day - 1;
        start.setDate(now.getDate() - difference);
        start.setHours(0, 0, 0, 0);
        return start;
    }
    if (period === "month") {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        return start;
    }
    return null;
}
function getFilteredSales() {
    const start = getStart(selectedPeriod);
    const now = new Date();
    return salesData.filter(sale => {
        if (!isCompleted(sale)) return false;
        if (!sale._date) return false;
        if (!start) return true;
        return sale._date >= start && sale._date <= now;
    });
}
function getFilteredCashflow() {
    const start = getStart(selectedPeriod);
    const now = new Date();
    return cashflowData.filter(item => {
        if (!item._date) return false;
        if (!start) return true;
        return item._date >= start && item._date <= now;
    });
}
function calculate() {
    const sales = getFilteredSales();
    const flows = getFilteredCashflow();
    const salesTotal = sales.reduce((sum, sale) => sum + sale._total, 0);
    let cashIn = 0;
    let cashOut = 0;
    flows.forEach(flow => {
        const amount = flow._amount;
        if (isCashOut(flow)) cashOut += amount;
        else if (isCashIn(flow)) cashIn += amount;
    });
    const flowHasSales = flows.some(flow => {
        const type = String(flow.type || flow.transactionType || flow.flowType || "").toLowerCase();
        return ["sale", "sales", "cashin", "cash in"].includes(type);
    });
    if (!flowHasSales) cashIn += salesTotal;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const allFlowsBefore = cashflowData.filter(flow => flow._date && flow._date < todayStart);
    const salesBefore = salesData.filter(sale => sale._date && sale._date < todayStart && isCompleted(sale));
    let historicalIn = 0;
    let historicalOut = 0;
    allFlowsBefore.forEach(flow => {
        if (isCashOut(flow)) historicalOut += flow._amount;
        else if (isCashIn(flow)) historicalIn += flow._amount;
    });
    const historicalHasSales = allFlowsBefore.some(flow => {
        const type = String(flow.type || flow.transactionType || flow.flowType || "").toLowerCase();
        return ["sale", "sales", "cashin", "cash in"].includes(type);
    });
    if (!historicalHasSales) {
        historicalIn += salesBefore.reduce((sum, sale) => sum + sale._total, 0);
    }
    const beginning = Math.max(0, historicalIn - historicalOut);
    const ending = beginning + cashIn - cashOut;
    cashInElement.textContent = money(cashIn);
    cashOutElement.textContent = money(cashOut);
    netCashElement.textContent = money(cashIn - cashOut);
    cashOnHandElement.textContent = money(ending);
    salesElement.textContent = money(salesTotal);
    cashInNote.textContent = selectedPeriod === "today" ? "Today" : selectedPeriod === "week" ? "This Week" : "This Month";
    cashOutNote.textContent = cashInNote.textContent;
    netCashNote.textContent = "Cash in minus cash out";
    salesNote.textContent = `${sales.length} Transaction${sales.length === 1 ? "" : "s"}`;
    beginningBalance.textContent = money(beginning);
    summaryCashIn.textContent = `+${money(cashIn)}`;
    summaryCashOut.textContent = `-${money(cashOut)}`;
    summaryNet.textContent = `${cashIn - cashOut >= 0 ? "+" : "-"}${money(Math.abs(cashIn - cashOut))}`;
    endingBalance.textContent = money(ending);
    renderChart(sales, flows);
}
function renderChart(sales, flows) {
    if (chart) chart.destroy();
    const canvas = document.getElementById("cashFlowChart");
    const labels = [];
    const cashInValues = [];
    const cashOutValues = [];
    const now = new Date();
    if (selectedPeriod === "today") {
        for (let hour = 0; hour < 24; hour++) {
            labels.push(`${String(hour).padStart(2, "0")}:00`);
            cashInValues.push(0);
            cashOutValues.push(0);
        }
        sales.forEach(sale => {
            const hour = sale._date.getHours();
            cashInValues[hour] += sale._total;
        });
        flows.forEach(flow => {
            const hour = flow._date.getHours();
            if (isCashOut(flow)) cashOutValues[hour] += flow._amount;
            else if (isCashIn(flow)) cashInValues[hour] += flow._amount;
        });
    } else {
        let start = getStart(selectedPeriod);
        let count = 7;
        if (selectedPeriod === "month") {
            count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        }
        if (selectedPeriod === "all") {
            const dates = [...sales.map(x => x._date), ...flows.map(x => x._date)].filter(Boolean).sort((a, b) => a - b);
            if (dates.length) {
                start = new Date(dates[0]);
                start.setHours(0, 0, 0, 0);
                count = Math.min(Math.floor((now - start) / 86400000) + 1, 31);
                if (count < 1) count = 1;
            } else {
                count = 7;
                start = new Date(now);
                start.setDate(now.getDate() - 6);
                start.setHours(0, 0, 0, 0);
            }
        }
        for (let i = 0; i < count; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            labels.push(date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }));
            cashInValues.push(0);
            cashOutValues.push(0);
        }
        sales.forEach(sale => {
            const date = new Date(sale._date);
            date.setHours(0, 0, 0, 0);
            const base = new Date(start);
            base.setHours(0, 0, 0, 0);
            const index = Math.floor((date - base) / 86400000);
            if (index >= 0 && index < cashInValues.length) cashInValues[index] += sale._total;
        });
        flows.forEach(flow => {
            const date = new Date(flow._date);
            date.setHours(0, 0, 0, 0);
            const base = new Date(start);
            base.setHours(0, 0, 0, 0);
            const index = Math.floor((date - base) / 86400000);
            if (index >= 0 && index < cashInValues.length) {
                if (isCashOut(flow)) cashOutValues[index] += flow._amount;
                else if (isCashIn(flow)) cashInValues[index] += flow._amount;
            }
        });
    }
    const hasData = cashInValues.some(value => value > 0) || cashOutValues.some(value => value > 0);
    chartEmpty.style.display = hasData ? "none" : "block";
    chart = new Chart(canvas, { type: "line", data: { labels, datasets: [{ label: "Cash In", data: cashInValues, borderColor: "#6da6df", backgroundColor: "rgba(109,166,223,.12)", fill: true, tension: .35, pointRadius: 2 }, { label: "Cash Out", data: cashOutValues, borderColor: "#aeb4ba", backgroundColor: "rgba(174,180,186,.05)", fill: false, tension: .35, borderDash: [6, 5], pointRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "bottom", labels: { font: { size: 8 } } }, tooltip: { callbacks: { label: context => `${context.dataset.label}: ${money(context.raw)}` } } }, scales: { y: { beginAtZero: true, ticks: { font: { size: 7 }, callback: value => money(value) } }, x: { ticks: { font: { size: 7 }, maxRotation: 0 } } } } });
}
function showError(title, message) {
    errorBox.innerHTML = `<strong>${title}</strong><span>${message}</span><br><button id="retryDashboard">Try Again</button>`;
    errorBox.classList.add("show");
    document.getElementById("retryDashboard").addEventListener("click", loadDashboard);
}
function clearError() {
    errorBox.classList.remove("show");
    errorBox.innerHTML = "";
}
async function loadDashboard() {
    try {
        clearError();
        salesElement.classList.add("loading");
        cashInElement.classList.add("loading");
        cashOutElement.classList.add("loading");
        netCashElement.classList.add("loading");
        cashOnHandElement.classList.add("loading");
        const salesSnapshot = await getDocs(collection(db, "sales"));
        const cashflowSnapshot = await getDocs(collection(db, "cashFlow"));
        salesData = salesSnapshot.docs.map(doc => {
            const data = doc.data();
            return { ...data, id: doc.id, _date: getSaleDate(data), _total: getSaleTotal(data) };
        });
        cashflowData = cashflowSnapshot.docs.map(doc => {
            const data = doc.data();
            return { ...data, id: doc.id, _date: getCashflowDate(data), _amount: getAmount(data) };
        });
        salesElement.classList.remove("loading");
        cashInElement.classList.remove("loading");
        cashOutElement.classList.remove("loading");
        netCashElement.classList.remove("loading");
        cashOnHandElement.classList.remove("loading");
        calculate();
    } catch (error) {
        console.error("Dashboard Firebase error:", error);
        salesElement.classList.remove("loading");
        cashInElement.classList.remove("loading");
        cashOutElement.classList.remove("loading");
        netCashElement.classList.remove("loading");
        cashOnHandElement.classList.remove("loading");
        if (error.code === "permission-denied") {
            showError("Unable to load dashboard", "Missing or insufficient Firebase permissions. Make sure you are logged in and that the sales and cashFlow collections allow authenticated reads.");
        } else {
            showError("Unable to load dashboard", error.message || "Unable to connect to Firebase.");
        }
    }
}
function loadProfile() {
    const name = sessionStorage.getItem("userName") || localStorage.getItem("userName") || "Administrator";
    const role = sessionStorage.getItem("userRole") || "admin";
    profileName.textContent = name;
    profileRole.textContent = role === "staff" ? "Staff / Cashier" : "Administrator";
    const parts = name.trim().split(/\s+/);
    profileAvatar.textContent = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
    const hour = new Date().getHours();
    greeting.textContent = hour < 12 ? `Good morning, ${name}!` : hour < 18 ? `Good afternoon, ${name}!` : `Good evening, ${name}!`;
}
function loadSidebar() {
    fetch("sidebar.html").then(response => {
        if (!response.ok) throw new Error("Could not load sidebar.html");
        return response.text();
    }).then(html => {
        document.getElementById("sidebar-container").innerHTML = html;
        const script = document.createElement("script");
        script.src = "sidebar.js";
        document.body.appendChild(script);
    }).catch(error => {
        console.error("Sidebar Error:", error);
        document.getElementById("sidebar-container").innerHTML = "";
    });
}
periodButtons.forEach(button => {
    button.addEventListener("click", () => {
        periodButtons.forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        selectedPeriod = button.dataset.period;
        calculate();
    });
});
document.getElementById("refreshDashboard").addEventListener("click", loadDashboard);
document.getElementById("addProduct").addEventListener("click", () => window.location.href = "products.html");
document.getElementById("addStock").addEventListener("click", () => window.location.href = "inventory.html");
document.getElementById("addExpense").addEventListener("click", () => window.location.href = "cash-flow.html");
document.getElementById("viewSales").addEventListener("click", () => window.location.href = "sales.html");
document.getElementById("globalSearch").addEventListener("keydown", event => {
    if (event.key === "Enter") {
        const value = event.target.value.trim();
        if (value) window.location.href = `products.html?search=${encodeURIComponent(value)}`;
    }
});
loadProfile();
loadSidebar();
loadDashboard();