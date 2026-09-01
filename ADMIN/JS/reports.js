import { db } from "../../Firebase/firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
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
const PAYMENT_METHODS = ["Cash", "GCash", "BDO", "BIBO", "BPI"];
let allSales = [];
let chart = null;
let currentRows = [];
let unsubscribeSales = null;
const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
const getNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
function normalizePayment(value) {
  const v = String(value || "").trim().toLowerCase().replace(/[_-]/g, " ");
  if (!v) return "";
  if (v === "cash" || v === "cash on hand" || v === "physical cash") return "Cash";
  if (v === "gcash" || v === "g cash" || v.includes("gcash")) return "GCash";
  if (v === "bdo" || v.includes("bdo")) return "BDO";
  if (v === "bibo" || v.includes("bibo")) return "BIBO";
  if (v === "bpi" || v.includes("bpi")) return "BPI";
  return "";
}
function getTimestamp(data) {
  const values = [
    data.createdAt,
    data.created_at,
    data.date,
    data.saleDate,
    data.transactionDate,
    data.timestamp,
    data.updatedAt
  ];
  for (const value of values) {
    if (!value) continue;
    if (value && typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}
function getTotal(data) {
  const values = [
    data.total,
    data.grandTotal,
    data.amount,
    data.totalAmount,
    data.saleTotal,
    data.netTotal
  ];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}
function getQuantity(item) {
  const values = [
    item.quantity,
    item.qty,
    item.count,
    item.units,
    item.stockQuantity
  ];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 1;
}
function getItemPrice(item) {
  const values = [
    item.price,
    item.sellingPrice,
    item.unitPrice,
    item.amount,
    item.total
  ];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}
function getItemCost(item) {
  const values = [
    item.costPrice,
    item.cost,
    item.unitCost,
    item.purchasePrice
  ];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}
function getItemProfit(item) {
  const quantity = getQuantity(item);
  const sellingPrice = getItemPrice(item);
  const costPrice = getItemCost(item);
  const directProfit = Number(item.profit);
  if (Number.isFinite(directProfit)) return directProfit;
  return (sellingPrice - costPrice) * quantity;
}
function getTotalCost(data) {
  const direct = Number(data.totalCost);
  if (Number.isFinite(direct)) return direct;
  return getItems(data).reduce(
    (sum, item) => sum + getItemCost(item) * getQuantity(item),
    0
  );
}
function getGrossProfit(data) {
  const direct = Number(data.grossProfit ?? data.profit);
  if (Number.isFinite(direct)) return direct;
  return getItems(data).reduce(
    (sum, item) => sum + getItemProfit(item),
    0
  );
}
function getItems(data) {
  const possible = [
    data.items,
    data.cartItems,
    data.lineItems,
    data.products,
    data.saleItems
  ];
  for (const value of possible) {
    if (Array.isArray(value)) return value;
  }
  return [];
}
function getProductName(item) {
  return item.productName ||
    item.name ||
    item.product ||
    item.title ||
    item.description ||
    "Unknown Product";
}
function getCategory(item) {
  return item.category ||
    item.categoryName ||
    "Uncategorized";
}
function isCompleted(data) {
  if (data.status === undefined || data.status === null || data.status === "") return true;
  const status = String(data.status).trim().toLowerCase();
  return [
    "completed",
    "complete",
    "paid",
    "success",
    "successful",
    "settled"
  ].includes(status);
}
function getPaymentBreakdown(data) {
  const result = {
    Cash: 0,
    GCash: 0,
    BDO: 0,
    BIBO: 0,
    BPI: 0
  };
  if (data.paymentBreakdown && typeof data.paymentBreakdown === "object") {
    PAYMENT_METHODS.forEach(method => {
      result[method] += getNumber(data.paymentBreakdown[method]);
    });
  }
  if (data.paymentDetails && typeof data.paymentDetails === "object") {
    PAYMENT_METHODS.forEach(method => {
      result[method] += getNumber(data.paymentDetails[method]);
    });
  }
  if (Array.isArray(data.splitPayments)) {
    data.splitPayments.forEach(item => {
      const method = normalizePayment(
        item.method ||
        item.paymentMethod ||
        item.type ||
        item.name
      );
      const amount = getNumber(
        item.amount ||
        item.value ||
        item.paymentAmount
      );
      if (method && amount > 0) {
        result[method] += amount;
      }
    });
  }
  if (Array.isArray(data.payments)) {
    data.payments.forEach(item => {
      const method = normalizePayment(
        item.method ||
        item.paymentMethod ||
        item.type ||
        item.name
      );
      const amount = getNumber(
        item.amount ||
        item.value ||
        item.paymentAmount
      );
      if (method && amount > 0) {
        result[method] += amount;
      }
    });
  }
  const normalMethod = normalizePayment(
    data.paymentMethod ||
    data.payment ||
    data.method ||
    data.paymentType
  );
  const currentTotal = Object.values(result).reduce(
    (sum, value) => sum + value,
    0
  );
  if (normalMethod && currentTotal <= 0) {
    result[normalMethod] = getTotal(data);
  }
  if (result.Cash <= 0) {
    result.Cash =
      getNumber(data.cashAmount) ||
      getNumber(data.cashReceived);
  }
  if (result.GCash <= 0) {
    result.GCash =
      getNumber(data.gcashAmount) ||
      getNumber(data.gcash);
  }
  if (result.BDO <= 0) {
    result.BDO =
      getNumber(data.bdoAmount) ||
      getNumber(data.bdo);
  }
  if (result.BIBO <= 0) {
    result.BIBO =
      getNumber(data.biboAmount) ||
      getNumber(data.bibo);
  }
  if (result.BPI <= 0) {
    result.BPI =
      getNumber(data.bpiAmount) ||
      getNumber(data.bpi);
  }
  return result;
}
function getPrimaryPayment(data) {
  const breakdown = getPaymentBreakdown(data);
  const entries = PAYMENT_METHODS
    .map(method => ({
      method,
      amount: getNumber(breakdown[method])
    }))
    .filter(item => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (!entries.length) {
    return "Other";
  }
  if (entries.length === 1) {
    return entries[0].method;
  }
  return "Split";
}
function getPaymentLabel(data) {
  const breakdown = getPaymentBreakdown(data);
  const entries = PAYMENT_METHODS
    .map(method => ({
      method,
      amount: getNumber(breakdown[method])
    }))
    .filter(item => item.amount > 0);
  if (!entries.length) {
    return "Other";
  }
  if (entries.length === 1) {
    return entries[0].method;
  }
  return entries
    .map(item => `${item.method} ${money(item.amount)}`)
    .join(" + ");
}
function showError(title, message) {
  errorMessage.innerHTML = `<strong>${title}</strong><span>${message}</span><br><button id="retryReports">Try Again</button>`;
  errorMessage.classList.add("show");
  const retry = document.getElementById("retryReports");
  if (retry) retry.addEventListener("click", loadSales);
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
  const total = rows.reduce(
    (sum, row) => sum + row._total,
    0
  );
  const transactionCount = rows.length;
  const itemCount = rows.reduce(
    (sum, row) => {
      const items = getItems(row);
      if (items.length) {
        return sum + items.reduce(
          (a, item) =>
            a + getQuantity(item),
          0
        );
      }
      return sum + Number(
        row.itemCount ||
        row.itemsCount ||
        row.quantity ||
        0
      );
    },
    0
  );
  salesElement.textContent = money(total);
  transactionsElement.textContent = transactionCount;
  itemsElement.textContent = itemCount;
  averageElement.textContent = money(
    transactionCount
      ? total / transactionCount
      : 0
  );
  const totalCostElement = document.getElementById("totalCost");
  const grossProfitElement = document.getElementById("grossProfit");
  const profitMarginElement = document.getElementById("profitMargin");
  const totalCost = rows.reduce(
    (sum, row) => sum + getTotalCost(row),
    0
  );
  const grossProfit = rows.reduce(
    (sum, row) => sum + getGrossProfit(row),
    0
  );
  if (totalCostElement) totalCostElement.textContent = money(totalCost);
  if (grossProfitElement) grossProfitElement.textContent = money(grossProfit);
  if (profitMarginElement) {
    profitMarginElement.textContent = total > 0
      ? `${((grossProfit / total) * 100).toFixed(2)}%`
      : "0.00%";
  }
}
function renderPayments(rows) {
  const paymentTotals = {
    Cash: 0,
    GCash: 0,
    BDO: 0,
    BIBO: 0,
    BPI: 0
  };
  if (!rows.length) {
    paymentsElement.innerHTML = '<div class="empty">No payment data available.</div>';
    return;
  }
  rows.forEach(row => {
    const breakdown = getPaymentBreakdown(row);
    PAYMENT_METHODS.forEach(method => {
      paymentTotals[method] += getNumber(
        breakdown[method]
      );
    });
  });
  const entries = PAYMENT_METHODS
    .map(method => [
      method,
      paymentTotals[method]
    ])
    .filter(
      ([, total]) =>
        total > 0
    )
    .sort(
      (a, b) =>
        b[1] - a[1]
    );
  if (!entries.length) {
    paymentsElement.innerHTML = '<div class="empty">No payment data available.</div>';
    return;
  }
  paymentsElement.innerHTML = entries.map(
    ([name, total]) => {
      let dot = "blue";
      if (name === "Cash") dot = "green";
      if (name === "GCash") dot = "purple";
      if (name === "BDO") dot = "blue";
      if (name === "BIBO") dot = "orange";
      if (name === "BPI") dot = "green";
      return `<div class="payment"><span class="payment-name"><i class="dot ${dot}"></i>${escapeHtml(name)}</span><b>${money(total)}</b></div>`;
    }
  ).join("");
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
      const revenue =
        Number(
          item.total ||
          item.subtotal ||
          item.lineTotal ||
          price * quantity
        ) || 0;
      const key = `${name}|||${category}`;
      if (!productMap[key]) {
        productMap[key] = {
          name,
          category,
          quantity: 0,
          revenue: 0,
          cost: 0,
          profit: 0
        };
      }
      productMap[key].quantity += quantity;
      productMap[key].revenue += revenue;
      productMap[key].cost += getItemCost(item) * quantity;
      productMap[key].profit += getItemProfit(item);
    });
  });
  const products =
    Object.values(productMap)
      .sort(
        (a, b) =>
          b.revenue -
          a.revenue
      );
  if (!products.length) {
    productsElement.innerHTML = '<tr><td colspan="4"><div class="empty">No product sales data available.</div></td></tr>';
    return;
  }
  productsElement.innerHTML =
    products
      .slice(0, 20)
      .map(
        product =>
          `<tr><td><b>${escapeHtml(product.name)}</b></td><td>${escapeHtml(product.category)}</td><td>${product.quantity}</td><td>${money(product.revenue)}</td><td>${money(product.cost)}</td><td>${money(product.profit)}</td></tr>`
      )
      .join("");
}
function renderChart(rows) {
  const canvas =
    document.getElementById("chart");
  if (!canvas) return;
  if (chart) {
    chart.destroy();
    chart = null;
  }
  const selected = period.value;
  let labels = [];
  let values = [];
  if (selected === "today") {
    for (let hour = 0; hour < 24; hour++) {
      labels.push(
        `${String(hour).padStart(2, "0")}:00`
      );
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
      days = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      ).getDate();
    }
    if (selected === "all") {
      const dates = rows
        .map(x => x._date)
        .filter(Boolean)
        .sort(
          (a, b) =>
            a - b
        );
      if (!dates.length) {
        labels = ["No Data"];
        values = [0];
      } else {
        const first = new Date(
          dates[0]
        );
        first.setHours(
          0,
          0,
          0,
          0
        );
        const last = new Date(
          dates[dates.length - 1]
        );
        last.setHours(
          0,
          0,
          0,
          0
        );
        const dayCount =
          Math.max(
            1,
            Math.floor(
              (last - first) /
              86400000
            ) + 1
          );
        days = Math.min(
          dayCount,
          31
        );
        first.setTime(
          last.getTime()
        );
        first.setDate(
          last.getDate() -
          days +
          1
        );
        for (
          let i = 0;
          i < days;
          i++
        ) {
          const d =
            new Date(
              first
            );
          d.setDate(
            first.getDate() +
            i
          );
          labels.push(
            d.toLocaleDateString(
              "en-PH",
              {
                month: "short",
                day: "numeric"
              }
            )
          );
          values.push(0);
        }
        rows.forEach(row => {
          if (!row._date) return;
          const d =
            new Date(
              row._date
            );
          d.setHours(
            0,
            0,
            0,
            0
          );
          const index =
            Math.floor(
              (d - first) /
              86400000
            );
          if (
            index >= 0 &&
            index < values.length
          ) {
            values[index] +=
              row._total;
          }
        });
      }
    } else {
      const start =
        getStartDate(
          selected
        );
      for (
        let i = 0;
        i < days;
        i++
      ) {
        const d =
          new Date(
            start
          );
        d.setDate(
          start.getDate() +
          i
        );
        labels.push(
          d.toLocaleDateString(
            "en-PH",
            selected === "week"
              ? {
                weekday: "short"
              }
              : {
                month: "short",
                day: "numeric"
              }
          )
        );
        values.push(0);
      }
      rows.forEach(row => {
        if (!row._date) return;
        const d =
          new Date(
            row._date
          );
        d.setHours(
          0,
          0,
          0,
          0
        );
        const base =
          new Date(
            start
          );
        base.setHours(
          0,
          0,
          0,
          0
        );
        const index =
          Math.floor(
            (d - base) /
            86400000
          );
        if (
          index >= 0 &&
          index < days
        ) {
          values[index] +=
            row._total;
        }
      });
    }
  }
  if (
    typeof Chart ===
    "undefined"
  ) {
    return;
  }
  chart = new Chart(
    canvas,
    {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Sales",
            data: values,
            borderColor: "#1976d2",
            backgroundColor: "rgba(25,118,210,.08)",
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: context =>
                money(
                  context.raw
                )
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value =>
                money(value)
            }
          },
          x: {
            grid: {
              display: false
            }
          }
        }
      }
    }
  );
}
function render() {
  clearError();
  const rows =
    filterSales();
  currentRows =
    rows;
  updateSummary(
    rows
  );
  renderPayments(
    rows
  );
  renderProducts(
    rows
  );
  renderChart(
    rows
  );
}
function loadSales() {
  try {
    clearError();
    if (unsubscribeSales) {
      unsubscribeSales();
      unsubscribeSales = null;
    }
    salesElement.textContent = "Loading...";
    transactionsElement.textContent = "...";
    itemsElement.textContent = "...";
    averageElement.textContent = "Loading...";
    paymentsElement.innerHTML = '<div class="loading">Loading payment data...</div>';
    productsElement.innerHTML = '<tr><td colspan="4"><div class="loading">Loading product data...</div></td></tr>';
    unsubscribeSales = onSnapshot(
      collection(
        db,
        "sales"
      ),
      snapshot => {
        allSales =
          snapshot.docs.map(
            doc => {
              const data =
                doc.data();
              return {
                ...data,
                id:
                  doc.id,
                _date:
                  getTimestamp(
                    data
                  ),
                _total:
                  getTotal(
                    data
                  )
              };
            }
          );
        render();
        console.log(
          "[Reports] Sales updated:",
          allSales.length
        );
      },
      error => {
        console.error(
          "Failed to load reports:",
          error
        );
        salesElement.textContent = "₱0.00";
        transactionsElement.textContent = "0";
        itemsElement.textContent = "0";
        averageElement.textContent = "₱0.00";
        paymentsElement.innerHTML = '<div class="empty">Unable to load payment data.</div>';
        productsElement.innerHTML = '<tr><td colspan="4"><div class="empty">Unable to load product data.</div></td></tr>';
        if (
          error.code ===
          "permission-denied"
        ) {
          showError(
            "Unable to load reports",
            "Missing or insufficient Firebase permissions. Update your Firestore rules to allow authenticated users to read the sales collection."
          );
        } else {
          showError(
            "Unable to load reports",
            error.message ||
            "Unable to connect to Firebase."
          );
        }
      }
    );
  } catch (error) {
    console.error(
      "Failed to load reports:",
      error
    );
    showError(
      "Unable to load reports",
      error.message ||
      "Unable to connect to Firebase."
    );
  }
}
function escapeHtml(value) {
  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );
}
function exportCSV() {
  const rows =
    filterSales();
  if (!rows.length) {
    alert(
      "There is no sales data to export for the selected period."
    );
    return;
  }
  const lines = [];
  lines.push(
    [
      "Date",
      "Transaction ID",
      "Payment Method",
      "Cash",
      "GCash",
      "BDO",
      "BIBO",
      "BPI",
      "Total",
      "Total Cost",
      "Gross Profit",
      "Profit Margin",
      "Items"
    ].join(",")
  );
  rows.forEach(row => {
    const date =
      row._date
        ? row._date.toLocaleString(
          "en-PH"
        )
        : "";
    const breakdown =
      getPaymentBreakdown(
        row
      );
    const payment =
      getPaymentLabel(
        row
      );
    const items =
      getItems(
        row
      );
    const itemCount =
      items.length
        ? items.reduce(
          (a, item) =>
            a +
            getQuantity(
              item
            ),
          0
        )
        : Number(
          row.itemCount ||
          row.itemsCount ||
          row.quantity ||
          0
        );
    lines.push(
      [
        csv(date),
        csv(row.id),
        csv(payment),
        breakdown.Cash,
        breakdown.GCash,
        breakdown.BDO,
        breakdown.BIBO,
        breakdown.BPI,
        row._total,
        getTotalCost(row),
        getGrossProfit(row),
        row._total > 0 ? `${((getGrossProfit(row) / row._total) * 100).toFixed(2)}%` : "0.00%",
        itemCount
      ].join(",")
    );
  });
  lines.push("");
  lines.push(
    [
      "SUMMARY",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ].join(",")
  );
  const total =
    rows.reduce(
      (a, row) =>
        a +
        row._total,
      0
    );
  const paymentTotals = {
    Cash: 0,
    GCash: 0,
    BDO: 0,
    BIBO: 0,
    BPI: 0
  };
  rows.forEach(row => {
    const breakdown =
      getPaymentBreakdown(
        row
      );
    PAYMENT_METHODS.forEach(
      method => {
        paymentTotals[method] +=
          breakdown[method];
      }
    );
  });
  lines.push(
    [
      "Total Sales",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      total,
      ""
    ].join(",")
  );
  const totalCost = rows.reduce(
    (a, row) => a + getTotalCost(row),
    0
  );
  const grossProfit = rows.reduce(
    (a, row) => a + getGrossProfit(row),
    0
  );
  lines.push(
    [
      "Total Cost",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totalCost,
      ""
    ].join(",")
  );
  lines.push(
    [
      "Gross Profit",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      grossProfit,
      ""
    ].join(",")
  );
  lines.push(
    [
      "Profit Margin",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      total > 0 ? `${((grossProfit / total) * 100).toFixed(2)}%` : "0.00%",
      ""
    ].join(",")
  );
  lines.push(
    [
      "Transactions",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      rows.length,
      ""
    ].join(",")
  );
  PAYMENT_METHODS.forEach(
    method => {
      lines.push(
        [
          method,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          paymentTotals[method],
          ""
        ].join(",")
      );
    }
  );
  const blob =
    new Blob(
      [
        "\ufeff" +
        lines.join(
          "\n"
        )
      ],
      {
        type: "text/csv;charset=utf-8;"
      }
    );
  const url =
    URL.createObjectURL(
      blob
    );
  const link =
    document.createElement(
      "a"
    );
  link.href =
    url;
  link.download =
    `stockmaster-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(
    link
  );
  link.click();
  link.remove();
  URL.revokeObjectURL(
    url
  );
}
function csv(value) {
  const text =
    String(
      value ?? ""
    );
  return `"${text.replace(
    /"/g,
    '""'
  )}"`;
}
async function loadSidebar() {
  try {
    const response =
      await fetch(
        "sidebar.html"
      );
    if (!response.ok) {
      throw new Error(
        "Unable to load sidebar."
      );
    }
    document.getElementById(
      "sidebar-container"
    ).innerHTML =
      await response.text();
    const script =
      document.createElement(
        "script"
      );
    script.src =
      "sidebar.js";
    document.body.appendChild(
      script
    );
  } catch (error) {
    console.error(
      "Sidebar error:",
      error
    );
  }
}
function loadProfile() {
  const name =
    sessionStorage.getItem(
      "userName"
    ) ||
    localStorage.getItem(
      "userName"
    ) ||
    "Administrator";
  profileName.textContent =
    name;
  const parts =
    name
      .trim()
      .split(
        /\s+/
      );
  profileAvatar.textContent =
    parts.length > 1
      ? (
        parts[0][0] +
        parts[
        parts.length - 1
        ][0]
      ).toUpperCase()
      : name
        .substring(
          0,
          2
        )
        .toUpperCase();
}
period.addEventListener(
  "change",
  render
);
reset.addEventListener(
  "click",
  () => {
    period.value =
      "week";
    render();
  }
);
exportReport.addEventListener(
  "click",
  exportCSV
);
loadProfile();
loadSidebar();
loadSales();