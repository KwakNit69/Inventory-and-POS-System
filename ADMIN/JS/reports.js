import { db, auth } from "../../Firebase/firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
const period = document.getElementById("period");
const reset = document.getElementById("reset");
const exportReport = document.getElementById("exportReport");
const salesElement = document.getElementById("sales");
const transactionsElement = document.getElementById("transactions");
const itemsElement = document.getElementById("items");
const averageElement = document.getElementById("average");
const paymentsElement = document.getElementById("payments");
const productsElement = document.getElementById("products");
const errorMessage = document.getElementById("errorMessage");
const profileName = document.getElementById("profileName");
const profileAvatar = document.getElementById("profileAvatar");
let allSales = [];
let chart = null;
let currentRows = [];
const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
function normalizePayment(value) {
  if (!value) return "Other";
  const v = String(value).trim().toLowerCase();
  if (v.includes("cash") && !v.includes("gcash")) return "Cash";
  if (v.includes("card")) return "Card";
  if (v.includes("gcash")) return "GCash";
  if (v.includes("e-wallet") || v.includes("ewallet") || v.includes("wallet")) return "GCash";
  return String(value);
}
function getTimestamp(data) {
  const values = [data.createdAt, data.created_at, data.date, data.saleDate, data.transactionDate, data.timestamp, data.updatedAt];
  for (const value of values) {
    if (!value) continue;
    if (value && typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}
function getTotal(data) {
  const values = [data.total, data.grandTotal, data.amount, data.totalAmount, data.saleTotal, data.netTotal];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}
function getQuantity(item) {
  const values = [item.quantity, item.qty, item.count, item.units, item.stockQuantity];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 1;
}
function getItemPrice(item) {
  const values = [item.price, item.sellingPrice, item.unitPrice, item.amount, item.total];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}
function getItems(data) {
  const possible = [data.items, data.cartItems, data.lineItems, data.products, data.saleItems];
  for (const value of possible) {
    if (Array.isArray(value)) return value;
  }
  return [];
}
function getProductName(item) {
  return item.productName || item.name || item.product || item.title || item.description || "Unknown Product";
}
function getCategory(item) {
  return item.category || item.categoryName || "Uncategorized";
}
function isCompleted(data) {
  if (data.status === undefined || data.status === null) return true;
  const status = String(data.status).toLowerCase();
  return ["completed", "complete", "paid", "success", "successful", "settled"].includes(status);
}
function showError(title, message) {
  errorMessage.innerHTML = `<strong>${title}</strong><span>${message}</span><br><button id="retryReports">Try Again</button>`;
  errorMessage.classList.add("show");
  document.getElementById("retryReports").addEventListener("click", loadSales);
}
function clearError() {
  errorMessage.innerHTML = "";
  errorMessage.classList.remove("show");
}
function getStartDate(type) {
  const now = new Date();
  const start = new Date(now);
  if (type === "today") {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (type === "week") {
    const day = now.getDay();
    const difference = day === 0 ? 6 : day - 1;
    start.setDate(now.getDate() - difference);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (type === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  return null;
}
function filterSales() {
  const selected = period.value;
  const start = getStartDate(selected);
  const now = new Date();
  return allSales.filter(sale => {
    if (!isCompleted(sale)) return false;
    if (!start) return true;
    const date = sale._date;
    if (!date) return false;
    return date >= start && date <= now;
  });
}
function updateSummary(rows) {
  const total = rows.reduce((sum, row) => sum + row._total, 0);
  const transactionCount = rows.length;
  const itemCount = rows.reduce((sum, row) => {
    const items = getItems(row);
    if (items.length) {
      return sum + items.reduce((a, item) => a + getQuantity(item), 0);
    }
    return sum + Number(row.itemCount || row.itemsCount || row.quantity || 0);
  }, 0);
  salesElement.textContent = money(total);
  transactionsElement.textContent = transactionCount;
  itemsElement.textContent = itemCount;
  averageElement.textContent = money(transactionCount ? total / transactionCount : 0);
}
function renderPayments(rows) {
  if (!rows.length) {
    paymentsElement.innerHTML = '<div class="empty">No payment data available.</div>';
    return;
  }
  const paymentTotals = {};
  rows.forEach(row => {
    const method = normalizePayment(row.paymentMethod || row.payment || row.method || row.paymentType);
    paymentTotals[method] = (paymentTotals[method] || 0) + row._total;
  });
  const entries = Object.entries(paymentTotals).sort((a, b) => b[1] - a[1]);
  paymentsElement.innerHTML = entries.map(([name, total]) => {
    let dot = "blue";
    if (name === "Cash") dot = "green";
    if (name === "GCash") dot = "purple";
    if (name === "Card") dot = "blue";
    if (name === "Other") dot = "orange";
    return `<div class="payment"><span class="payment-name"><i class="dot ${dot}"></i>${escapeHtml(name)}</span><b>${money(total)}</b></div>`;
  }).join("");
}
function renderProducts(rows) {
  const productMap = {};
  rows.forEach(row => {
    const items = getItems(row);
    if (!items.length) return;
    items.forEach(item => {
      const name = getProductName(item);
      const category = getCategory(item);
      const quantity = getQuantity(item);
      const price = getItemPrice(item);
      const revenue = Number(item.total || item.subtotal || item.lineTotal || price * quantity) || 0;
      const key = `${name}|||${category}`;
      if (!productMap[key]) productMap[key] = { name, category, quantity: 0, revenue: 0 };
      productMap[key].quantity += quantity;
      productMap[key].revenue += revenue;
    });
  });
  const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
  if (!products.length) {
    productsElement.innerHTML = '<tr><td colspan="4"><div class="empty">No product sales data available.</div></td></tr>';
    return;
  }
  productsElement.innerHTML = products.slice(0, 20).map(product => `<tr><td><b>${escapeHtml(product.name)}</b></td><td>${escapeHtml(product.category)}</td><td>${product.quantity}</td><td>${money(product.revenue)}</td></tr>`).join("");
}
function renderChart(rows) {
  const canvas = document.getElementById("chart");
  if (chart) chart.destroy();
  const selected = period.value;
  let labels = [];
  let values = [];
  if (selected === "today") {
    for (let hour = 0; hour < 24; hour++) {
      labels.push(`${String(hour).padStart(2, "0")}:00`);
      values.push(0);
    }
    rows.forEach(row => {
      if (!row._date) return;
      const hour = row._date.getHours();
      values[hour] += row._total;
    });
  } else {
    let days = 7;
    if (selected === "month") {
      const now = new Date();
      days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    }
    if (selected === "all") {
      const dates = rows.map(x => x._date).filter(Boolean).sort((a, b) => a - b);
      if (!dates.length) {
        labels = ["No Data"];
        values = [0];
      } else {
        const first = new Date(dates[0]);
        first.setHours(0, 0, 0, 0);
        const last = new Date(dates[dates.length - 1]);
        last.setHours(0, 0, 0, 0);
        const dayCount = Math.max(1, Math.floor((last - first) / 86400000) + 1);
        days = Math.min(dayCount, 31);
        first.setDate(last.getDate() - days + 1);
        for (let i = 0; i < days; i++) {
          const d = new Date(first);
          d.setDate(first.getDate() + i);
          labels.push(d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }));
          values.push(0);
        }
        rows.forEach(row => {
          if (!row._date) return;
          const d = new Date(row._date);
          d.setHours(0, 0, 0, 0);
          const index = Math.floor((d - first) / 86400000);
          if (index >= 0 && index < values.length) values[index] += row._total;
        });
      }
    } else {
      const start = getStartDate("week");
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        labels.push(d.toLocaleDateString("en-PH", { weekday: "short" }));
        values.push(0);
      }
      rows.forEach(row => {
        if (!row._date) return;
        const d = new Date(row._date);
        d.setHours(0, 0, 0, 0);
        const index = Math.floor((d - start) / 86400000);
        if (index >= 0 && index < 7) values[index] += row._total;
      });
    }
  }
  chart = new Chart(canvas, { type: "line", data: { labels, datasets: [{ label: "Sales", data: values, borderColor: "#1976d2", backgroundColor: "rgba(25,118,210,.08)", fill: true, tension: .35, pointRadius: 3, pointHoverRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => money(context.raw) } } }, scales: { y: { beginAtZero: true, ticks: { callback: value => money(value) } }, x: { grid: { display: false } } } } });
}
function render() {
  clearError();
  const rows = filterSales();
  currentRows = rows;
  updateSummary(rows);
  renderPayments(rows);
  renderProducts(rows);
  renderChart(rows);
}
async function loadSales() {
  try {
    clearError();
    salesElement.textContent = "Loading...";
    transactionsElement.textContent = "...";
    itemsElement.textContent = "...";
    averageElement.textContent = "Loading...";
    paymentsElement.innerHTML = '<div class="loading">Loading payment data...</div>';
    productsElement.innerHTML = '<tr><td colspan="4"><div class="loading">Loading product data...</div></td></tr>';
    const snapshot = await getDocs(collection(db, "sales"));
    allSales = snapshot.docs.map(doc => {
      const data = doc.data();
      return { ...data, id: doc.id, _date: getTimestamp(data), _total: getTotal(data) };
    });
    render();
  } catch (error) {
    console.error("Failed to load reports:", error);
    salesElement.textContent = "₱0.00";
    transactionsElement.textContent = "0";
    itemsElement.textContent = "0";
    averageElement.textContent = "₱0.00";
    paymentsElement.innerHTML = '<div class="empty">Unable to load payment data.</div>';
    productsElement.innerHTML = '<tr><td colspan="4"><div class="empty">Unable to load product data.</div></td></tr>';
    if (error.code === "permission-denied") {
      showError("Unable to load reports", "Missing or insufficient Firebase permissions. Update your Firestore rules to allow authenticated users to read the sales collection.");
    } else {
      showError("Unable to load reports", error.message || "Unable to connect to Firebase.");
    }
  }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
function exportCSV() {
  const rows = filterSales();
  if (!rows.length) {
    alert("There is no sales data to export for the selected period.");
    return;
  }
  const lines = [];
  lines.push(["Date", "Transaction ID", "Payment Method", "Total", "Items"].join(","));
  rows.forEach(row => {
    const date = row._date ? row._date.toLocaleString("en-PH") : "";
    const payment = normalizePayment(row.paymentMethod || row.payment || row.method || row.paymentType);
    const items = getItems(row);
    const itemCount = items.length ? items.reduce((a, item) => a + getQuantity(item), 0) : Number(row.itemCount || row.itemsCount || row.quantity || 0);
    lines.push([csv(date), csv(row.id), csv(payment), row._total, itemCount].join(","));
  });
  lines.push("");
  lines.push(["SUMMARY", "", "", "", ""].join(","));
  const total = rows.reduce((a, row) => a + row._total, 0);
  lines.push(["Total Sales", "", "", total, ""].join(","));
  lines.push(["Transactions", "", "", rows.length, ""].join(","));
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stockmaster-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function csv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
async function loadSidebar() {
  try {
    const response = await fetch("sidebar.html");
    if (!response.ok) throw new Error("Unable to load sidebar.");
    document.getElementById("sidebar-container").innerHTML = await response.text();
    const script = document.createElement("script");
    script.src = "sidebar.js";
    script.onload = () => { };
    document.body.appendChild(script);
  } catch (error) {
    console.error("Sidebar error:", error);
  }
}
function loadProfile() {
  const name = sessionStorage.getItem("userName") || localStorage.getItem("userName") || "Administrator";
  profileName.textContent = name;
  const parts = name.trim().split(/\s+/);
  profileAvatar.textContent = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}
period.addEventListener("change", render);
reset.addEventListener("click", () => {
  period.value = "week";
  render();
});
exportReport.addEventListener("click", exportCSV);
loadProfile();
loadSidebar();
loadSales();