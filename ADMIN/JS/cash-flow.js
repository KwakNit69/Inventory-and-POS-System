import { db, auth } from "../../Firebase/firebase-config.js";
import { collection, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
let cashFlowData = [];
let salesData = [];
let filteredCashFlow = [];
let currentPage = 1;
const recordsPerPage = 6;
let runningBalances = {};
let cashFlowChart = null;
let unsubscribeCashFlow = null;
let unsubscribeSales = null;
const ACCOUNT_NAMES = ["Cash", "GCash", "BDO", "BIBO", "BPI"];
const tableBody = document.getElementById("cashflowTableBody");
const emptyState = document.getElementById("emptyState");
const expenseModal = document.getElementById("expenseModal");
const cashInModal = document.getElementById("cashInModal");
function formatMoney(value) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
}
function escapeHTML(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function getValue(data, keys, defaultValue = "") {
    if (!data) return defaultValue;
    for (const key of keys) {
        if (data[key] !== undefined && data[key] !== null && data[key] !== "") return data[key];
    }
    return defaultValue;
}
function normalizeAccount(value) {
    const account = String(value || "").trim().toLowerCase().replace(/[_-]/g, " ");
    if (account === "cash" || account === "cash on hand" || account === "cashonhand" || account === "physical cash") return "Cash";
    if (account === "gcash" || account === "g cash") return "GCash";
    if (account === "bdo" || account.includes("bdo")) return "BDO";
    if (account === "bibo" || account.includes("bibo")) return "BIBO";
    if (account === "bpi" || account.includes("bpi")) return "BPI";
    return "";
}
function normalizePaymentMethod(value) {
    return normalizeAccount(value) || "Unknown";
}
function getDateValue(data) {
    const value = getValue(data, ["date", "createdAt", "timestamp", "transactionDate", "saleDate"]);
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "object" && typeof value.seconds === "number") return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
}
function formatDate(value) {
    const date = value instanceof Date ? value : getDateValue({ date: value });
    if (!date || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-PH", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function getAmount(data) {
    return Number(getValue(data, ["amount", "total", "grandTotal", "totalAmount", "netAmount", "saleTotal"], 0)) || 0;
}
function getSaleReference(data, id) {
    return String(getValue(data, ["transactionNumber", "transactionId", "invoiceNumber", "reference", "saleNumber"], id));
}
function getSaleStatus(data) {
    return String(getValue(data, ["status", "saleStatus", "paymentStatus"], "completed")).trim().toLowerCase();
}
function addPaymentAmount(result, account, value) {
    const normalized = normalizeAccount(account);
    const amount = Number(value) || 0;
    if (normalized && ACCOUNT_NAMES.includes(normalized) && amount > 0) result[normalized] += amount;
}
function getPaymentBreakdown(data) {
    const amounts = {
        Cash: 0,
        GCash: 0,
        BDO: 0,
        BIBO: 0,
        BPI: 0
    };

    const addBreakdown = source => {
        if (!source) return;

        if (Array.isArray(source)) {
            source.forEach(payment => {
                addPaymentAmount(
                    amounts,
                    payment?.method ||
                    payment?.paymentMethod ||
                    payment?.account ||
                    payment?.type,
                    payment?.amount ??
                    payment?.value ??
                    payment?.total
                );
            });

            return;
        }

        if (typeof source === "object") {
            Object.entries(source).forEach(([key, value]) => {
                const amount =
                    value &&
                    typeof value === "object" &&
                    !Array.isArray(value)
                        ? value.amount ??
                          value.value ??
                          value.total
                        : value;

                addPaymentAmount(
                    amounts,
                    key,
                    amount
                );
            });
        }
    };

    /*
     * IMPORTANT:
     *
     * paymentBreakdown and splitPayments can contain
     * the SAME payment information.
     *
     * Therefore, NEVER add both together.
     *
     * Priority:
     * 1. paymentBreakdown
     * 2. splitPayments
     * 3. direct payment fields
     * 4. paymentMethod + sale total
     */

    const primaryBreakdown =
        data?.paymentBreakdown ??
        data?.payment_breakdown ??
        data?.payments;

    addBreakdown(primaryBreakdown);

    let total =
        getPaymentBreakdownTotal(amounts);

    if (total <= 0) {
        const splitPayments =
            data?.splitPayments ??
            data?.splitPayment ??
            data?.split_payment;

        addBreakdown(splitPayments);

        total =
            getPaymentBreakdownTotal(amounts);
    }

    /*
     * Direct payment fields are only fallbacks.
     * They are NOT added to an existing breakdown.
     */

    if (total <= 0) {
        const directAliases = {
            Cash: [
                "cash",
                "cashAmount"
            ],
            GCash: [
                "gcash",
                "gCash",
                "gcashAmount"
            ],
            BDO: [
                "bdo",
                "bdoAmount"
            ],
            BIBO: [
                "bibo",
                "biboAmount"
            ],
            BPI: [
                "bpi",
                "bpiAmount"
            ]
        };

        for (const account of ACCOUNT_NAMES) {
            for (
                const key of directAliases[account]
            ) {
                const value =
                    Number(data?.[key]) || 0;

                if (value > 0) {
                    amounts[account] = value;
                    break;
                }
            }
        }

        total =
            getPaymentBreakdownTotal(amounts);
    }

    /*
     * Final fallback.
     */

    if (total <= 0) {
        const method =
            normalizePaymentMethod(
                data?.paymentMethod ||
                data?.payment ||
                data?.method ||
                ""
            );

        const amount =
            getAmount(data);

        if (
            ACCOUNT_NAMES.includes(method) &&
            amount > 0
        ) {
            amounts[method] = amount;
        }
    }

    return amounts;
}
function getPaymentBreakdownTotal(breakdown) {
    return ACCOUNT_NAMES.reduce((sum, account) => sum + (Number(breakdown[account]) || 0), 0);
}
function getPrimaryPaymentMethod(data) {
    const breakdown = getPaymentBreakdown(data);
    const methods = ACCOUNT_NAMES.filter(account => Number(breakdown[account]) > 0);
    if (methods.length === 1) return methods[0];
    if (methods.length > 1) return "Split";
    return normalizePaymentMethod(data?.paymentMethod || data?.payment || data?.method || "");
}
function normalizeCashFlow(id, data) {
    const amount = getAmount(data);
    const rawType = String(getValue(data, ["type", "transactionType", "flowType"], "")).trim().toLowerCase();
    let type;
    if (rawType === "out" || rawType === "cash_out" || rawType === "cashout" || rawType === "expense" || rawType === "withdraw" || rawType === "withdrawal") {
        type = "out";
    } else if (rawType === "in" || rawType === "cash_in" || rawType === "cashin" || rawType === "income" || rawType === "deposit") {
        type = "in";
    } else {
        const explicitIn = Number(data?.cashIn) || 0;
        const explicitOut = Number(data?.cashOut) || 0;
        if (explicitOut > 0) type = "out";
        else type = "in";
    }
    let cashIn = Number(data?.cashIn) || 0;
    let cashOut = Number(data?.cashOut) || 0;
    if (cashIn <= 0 && cashOut <= 0 && amount > 0) {
        if (type === "in") cashIn = amount;
        else cashOut = amount;
    }
    if (type === "in") {
        cashOut = 0;
        if (cashIn <= 0 && amount > 0) cashIn = amount;
    }
    if (type === "out") {
        cashIn = 0;
        if (cashOut <= 0 && amount > 0) cashOut = amount;
    }
    const account = normalizeAccount(getValue(data, ["account", "sourceAccount", "fromAccount", "toAccount", "paymentMethod", "fundAccount", "payment"], ""));
    const category = String(getValue(data, ["category"], type === "in" ? "Other Income" : "Expense"));
    const description = String(getValue(data, ["description", "remarks", "notes", "reason"], type === "in" ? "Cash In" : "Cash Out"));
    const reference = String(getValue(data, ["reference", "transactionId", "transactionNumber", "referenceNumber"], id));
    return {
        id,
        date: getDateValue(data) || new Date(0),
        type,
        category,
        description,
        reference,
        cashIn,
        cashOut,
        account,
        paymentMethod: normalizePaymentMethod(data?.paymentMethod || account),
        source: String(getValue(data, ["source"], "cashFlow")),
        createdBy: String(getValue(data, ["createdBy", "userId", "uid"], "")),
        createdByEmail: String(getValue(data, ["createdByEmail"], ""))
    };
}
function isReservationSale(data) {
    const orderType = String(data?.orderType ?? data?.order_type ?? data?.type ?? "").trim().toLowerCase();
    return orderType === "reservation" ||
        orderType === "reserve" ||
        data?.isReservation === true ||
        data?.isReserve === true;
}
function getCashFlowReferenceValues(data, id) {
    const values = new Set();
    const add = value => {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
            values.add(String(value).trim().toLowerCase());
        }
    };
    add(id);
    add(data?.transactionNumber);
    add(data?.transactionId);
    add(data?.invoiceNumber);
    add(data?.reference);
    add(data?.referenceNumber);
    add(data?.saleNumber);
    add(data?.saleId);
    add(data?.saleID);
    return values;
}
function cashFlowMatchesSale(flow, saleId, saleData) {
    const flowReferences = getCashFlowReferenceValues(flow, flow?.id);
    const saleReferences = getCashFlowReferenceValues(saleData, saleId);
    for (const reference of flowReferences) {
        if (saleReferences.has(reference)) return true;
    }
    return false;
}
function normalizeSale(id, data, existingCashFlow = []) {
    const status = getSaleStatus(data);
    if (["cancelled", "canceled", "void", "voided", "refunded"].includes(status)) return null;
    const isReservation = isReservationSale(data);
    /*
     * RESERVATIONS ARE PAID WHEN THEY ARE CREATED IN POS.
     *
     * The reservation payment is already recorded in the cashFlow
     * collection by the POS. The Pending Transactions page only
     * completes the order and deducts stock.
     *
     * Therefore a reservation must NEVER be generated here as a
     * second Cash Flow SALE when Admin clicks "Order Done".
     */
    if (isReservation) return null;
    const amount = getAmount(data);
    if (amount <= 0) return null;
    /*
     * If this normal POS sale already has a matching cash-flow
     * record, do not generate another virtual SALE record.
     */
    if (existingCashFlow.some(flow => cashFlowMatchesSale(flow, id, data))) return null;
    const date = getDateValue(data) || new Date(0);
    const reference = getSaleReference(data, id);
    const customer = String(getValue(data, ["customerName", "customer", "customer_name"], "Walk-in Customer"));
    const paymentMethod = getPrimaryPaymentMethod(data);
    let paymentBreakdown = getPaymentBreakdown(data);
    let paymentTotal = getPaymentBreakdownTotal(paymentBreakdown);
    if (paymentTotal <= 0) {
        paymentBreakdown = {
            Cash: 0,
            GCash: 0,
            BDO: 0,
            BIBO: 0,
            BPI: 0
        };
        if (ACCOUNT_NAMES.includes(paymentMethod)) {
            paymentBreakdown[paymentMethod] = amount;
        } else {
            paymentBreakdown.Cash = amount;
        }
        paymentTotal = amount;
    }
    if (Math.abs(paymentTotal - amount) > 0.005) {
        const normalized = {
            Cash: 0,
            GCash: 0,
            BDO: 0,
            BIBO: 0,
            BPI: 0
        };
        if (ACCOUNT_NAMES.includes(paymentMethod)) {
            normalized[paymentMethod] = amount;
        } else {
            normalized.Cash = amount;
        }
        paymentBreakdown = normalized;
    }
    return {
        id: `SALE-${id}`,
        firestoreId: id,
        date,
        type: "in",
        category: "Sale",
        description: `POS Sale${paymentMethod ? ` - ${paymentMethod}` : ""}${customer ? ` - ${customer}` : ""}`,
        reference,
        cashIn: amount,
        cashOut: 0,
        source: "sale",
        paymentMethod,
        paymentBreakdown,
        total: amount,
        customer
    };
}
function rebuildCashFlow() {
    /*
     * IMPORTANT:
     * Keep every real cash-flow document. In particular, a paid
     * reservation is recorded in cashFlow when payment is made in
     * POS and must remain there after Admin clicks "Order Done".
     *
     * Sales from the sales collection are only used as a fallback
     * for normal POS sales that do not already have a corresponding
     * cash-flow record.
     */
    const existingCashFlow = [...cashFlowData];
    const generatedSales = salesData
        .map(item => normalizeSale(item.id, item.data, existingCashFlow))
        .filter(Boolean);
    cashFlowData = [
        ...existingCashFlow,
        ...generatedSales
    ].sort((a, b) => b.date - a.date);
    filteredCashFlow = [...cashFlowData];
    calculateBalances();
    updateSummary();
    updateAccountBalances();
    updateCategoryFilter();
    filterCashFlow();
    updateChart();
}
function calculateBalances() {
    const sorted = [...cashFlowData].sort((a, b) => a.date - b.date);
    let balance = 0;
    runningBalances = {};
    for (const record of sorted) {
        balance += (Number(record.cashIn) || 0) - (Number(record.cashOut) || 0);
        runningBalances[record.id] = balance;
    }
}
function calculateAccountBalances() {
    const balances = { Cash: 0, GCash: 0, BDO: 0, BIBO: 0, BPI: 0 };
    for (const record of cashFlowData) {
        if (record.source === "sale") {
            const breakdown = record.paymentBreakdown || {};
            const breakdownTotal = getPaymentBreakdownTotal(breakdown);
            if (breakdownTotal > 0) {
                ACCOUNT_NAMES.forEach(account => {
                    const amount = Number(breakdown[account]) || 0;
                    if (amount > 0) balances[account] += amount;
                });
            } else {
                const method = normalizeAccount(record.paymentMethod);
                if (method && ACCOUNT_NAMES.includes(method)) balances[method] += Number(record.cashIn) || 0;
                else balances.Cash += Number(record.cashIn) || 0;
            }
            continue;
        }
        const account = normalizeAccount(record.account);
        if (record.type === "in") {
            const amount = Number(record.cashIn) || 0;
            if (account && ACCOUNT_NAMES.includes(account)) balances[account] += amount;
            else balances.Cash += amount;
        }
        if (record.type === "out") {
            const amount = Number(record.cashOut) || 0;
            if (account && ACCOUNT_NAMES.includes(account)) balances[account] -= amount;
            else balances.Cash -= amount;
        }
    }
    return balances;
}
function setTextByIds(ids, value) {
    for (const id of ids) {
        const element = document.getElementById(id);
        if (element) element.textContent = formatMoney(value);
    }
}
function updateAccountBalances() {
    const balances = calculateAccountBalances();
    const totalFunds = ACCOUNT_NAMES.reduce((sum, account) => sum + (Number(balances[account]) || 0), 0);
    setTextByIds(["cashAccountBalance", "cashBalance", "cashOnHand", "cashFunds", "accountCash"], balances.Cash);
    setTextByIds(["gcashBalance", "gcashFunds", "accountGCash"], balances.GCash);
    setTextByIds(["bdoBalance", "bdoFunds", "accountBDO"], balances.BDO);
    setTextByIds(["biboBalance", "biboFunds", "accountBIBO"], balances.BIBO);
    setTextByIds(["bpiBalance", "bpiFunds", "accountBPI"], balances.BPI);
    setTextByIds(["totalFunds", "totalFundBalance", "totalBalance", "allFunds"], totalFunds);
    window.stockMasterAccountBalances = { ...balances, totalFunds };
}
function updateSummary() {
    const totalCashIn = cashFlowData.reduce((sum, item) => sum + (Number(item.cashIn) || 0), 0);
    const totalCashOut = cashFlowData.reduce((sum, item) => sum + (Number(item.cashOut) || 0), 0);
    const net = totalCashIn - totalCashOut;
    const totalCashInElement = document.getElementById("totalCashIn");
    const totalCashOutElement = document.getElementById("totalCashOut");
    const netCashFlowElement = document.getElementById("netCashFlow");
    if (totalCashInElement) totalCashInElement.textContent = formatMoney(totalCashIn);
    if (totalCashOutElement) totalCashOutElement.textContent = formatMoney(totalCashOut);
    if (netCashFlowElement) netCashFlowElement.textContent = formatMoney(net);
    const balances = calculateAccountBalances();
    const totalFunds = ACCOUNT_NAMES.reduce((sum, account) => sum + (Number(balances[account]) || 0), 0);
    const cashBalanceElement = document.getElementById("cashBalance");
    if (cashBalanceElement) cashBalanceElement.textContent = formatMoney(totalFunds);
    const description = document.getElementById("netDescription");
    if (description) {
        description.textContent = net >= 0 ? "Positive cash flow" : "Negative cash flow";
        description.style.color = net >= 0 ? "#16803c" : "#d74343";
    }
    let sales = 0;
    let otherIncome = 0;
    let expenses = 0;
    let purchases = 0;
    let refunds = 0;
    for (const record of cashFlowData) {
        if (record.category === "Sale") sales += Number(record.cashIn) || 0;
        else if (record.type === "in") otherIncome += Number(record.cashIn) || 0;
        if (record.category === "Expense" || record.category === "Other Expense") expenses += Number(record.cashOut) || 0;
        if (record.category === "Purchase" || record.category === "Inventory Purchase") purchases += Number(record.cashOut) || 0;
        if (record.category === "Refund") refunds += Number(record.cashOut) || 0;
    }
    setTextByIds(["salesCash"], sales);
    setTextByIds(["otherIncomeCash"], otherIncome);
    setTextByIds(["expenseCash"], expenses);
    setTextByIds(["purchaseCash"], purchases);
    setTextByIds(["refundCash"], refunds);
}
function updateCategoryFilter() {
    const select = document.getElementById("categoryFilter");
    if (!select) return;
    const current = select.value;
    const categories = [...new Set(cashFlowData.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="all">All Categories</option>';
    for (const category of categories) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
    }
    if (categories.includes(current)) select.value = current;
}
function renderTable() {
    if (!tableBody || !emptyState) return;
    tableBody.innerHTML = "";
    if (filteredCashFlow.length === 0) {
        emptyState.classList.add("show");
        updatePagination();
        return;
    }
    emptyState.classList.remove("show");
    const start = (currentPage - 1) * recordsPerPage;
    const pageRecords = filteredCashFlow.slice(start, start + recordsPerPage);
    for (const record of pageRecords) {
        const row = document.createElement("tr");
        const typeClass = record.type === "in" ? "type-in" : "type-out";
        const cashIn = record.cashIn > 0 ? `<span class="cash-in">+${formatMoney(record.cashIn)}</span>` : "<span>—</span>";
        const cashOut = record.cashOut > 0 ? `<span class="cash-out">-${formatMoney(record.cashOut)}</span>` : "<span>—</span>";
        const balance = runningBalances[record.id] ?? 0;
        const accountText = record.account ? `<div class="flow-account">${escapeHTML(record.account)}</div>` : "";
        row.innerHTML = `<td><div class="flow-id">${escapeHTML(record.id)}</div></td><td><div class="flow-date">${escapeHTML(formatDate(record.date))}</div></td><td><span class="flow-type ${typeClass}">${record.type === "in" ? "Cash In" : "Cash Out"}</span></td><td>${accountText || "<span>—</span>"}</td><td><span class="category-badge">${escapeHTML(record.category)}</span></td><td><div class="flow-description">${escapeHTML(record.description)}</div><div class="flow-reference">${escapeHTML(record.reference)}</div></td><td>${cashIn}</td><td>${cashOut}</td><td><span class="balance-value">${formatMoney(balance)}</span></td>`;
        tableBody.appendChild(row);
    }
    updatePagination();
}
function filterCashFlow() {
    const searchElement = document.getElementById("cashflowSearch");
    const dateElement = document.getElementById("dateFilter");
    const typeElement = document.getElementById("typeFilter");
    const accountElement = document.getElementById("accountFilter");
    const categoryElement = document.getElementById("categoryFilter");
    const search = searchElement?.value.trim().toLowerCase() || "";
    const dateFilter = dateElement?.value || "all";
    const typeFilter = typeElement?.value || "all";
    const accountFilter = accountElement?.value || "all";
    const categoryFilter = categoryElement?.value || "all";
    filteredCashFlow = cashFlowData.filter(record => {
        const searchable = `${record.id} ${record.description} ${record.category} ${record.reference} ${record.account}`.toLowerCase();
        return (!search || searchable.includes(search)) && matchesDateFilter(record.date, dateFilter) && (typeFilter === "all" || record.type === typeFilter) && (accountFilter === "all" || record.account === accountFilter) && (categoryFilter === "all" || record.category === categoryFilter);
    });
    currentPage = 1;
    renderTable();
}
function matchesDateFilter(date, filter) {
    if (filter === "all") return true;
    const recordDate = date instanceof Date ? date : new Date(date);
    const today = new Date();
    if (filter === "today") return isSameDay(recordDate, today);
    if (filter === "yesterday") {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        return isSameDay(recordDate, yesterday);
    }
    if (filter === "week") {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        start.setHours(0, 0, 0, 0);
        return recordDate >= start;
    }
    if (filter === "month") return recordDate.getMonth() === today.getMonth() && recordDate.getFullYear() === today.getFullYear();
    return true;
}
function isSameDay(a, b) {
    if (!a || !b) return false;
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
function updatePagination() {
    const total = filteredCashFlow.length;
    const totalPages = Math.max(1, Math.ceil(total / recordsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = total === 0 ? 0 : (currentPage - 1) * recordsPerPage + 1;
    const end = Math.min(currentPage * recordsPerPage, total);
    const paginationInfo = document.getElementById("paginationInfo");
    const currentPageElement = document.getElementById("currentPage");
    const previousPage = document.getElementById("previousPage");
    const nextPage = document.getElementById("nextPage");
    if (paginationInfo) paginationInfo.textContent = `Showing ${start}-${end} of ${total} transactions`;
    if (currentPageElement) currentPageElement.textContent = currentPage;
    if (previousPage) previousPage.disabled = currentPage <= 1;
    if (nextPage) nextPage.disabled = currentPage >= totalPages;
}
function getChartData(days) {
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        date.setHours(0, 0, 0, 0);
        let cashIn = 0;
        let cashOut = 0;
        for (const record of cashFlowData) {
            if (isSameDay(record.date, date)) {
                cashIn += Number(record.cashIn) || 0;
                cashOut += Number(record.cashOut) || 0;
            }
        }
        result.push({ date: date.toLocaleDateString("en-PH", { month: "short", day: "numeric" }), cashIn, cashOut });
    }
    return result;
}
function createChart() {
    const canvas = document.getElementById("cashFlowChart");
    if (!canvas || typeof Chart === "undefined") return;
    const chartPeriod = document.getElementById("chartPeriod");
    const days = Number(chartPeriod?.value) || 7;
    const data = getChartData(days);
    if (cashFlowChart) cashFlowChart.destroy();
    cashFlowChart = new Chart(canvas, { type: "line", data: { labels: data.map(item => item.date), datasets: [{ label: "Cash In", data: data.map(item => item.cashIn), borderColor: "#16803c", backgroundColor: "rgba(22,128,60,0.08)", fill: true, tension: 0.35, borderWidth: 2, pointRadius: 3 }, { label: "Cash Out", data: data.map(item => item.cashOut), borderColor: "#d74343", backgroundColor: "rgba(215,67,67,0.06)", fill: true, tension: 0.35, borderWidth: 2, pointRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "bottom" } }, scales: { y: { beginAtZero: true, ticks: { callback: value => "₱" + Number(value).toLocaleString() } } } } });
}
function updateChart() {
    if (!cashFlowChart) {
        createChart();
        return;
    }
    const chartPeriod = document.getElementById("chartPeriod");
    const days = Number(chartPeriod?.value) || 7;
    const data = getChartData(days);
    cashFlowChart.data.labels = data.map(item => item.date);
    cashFlowChart.data.datasets[0].data = data.map(item => item.cashIn);
    cashFlowChart.data.datasets[1].data = data.map(item => item.cashOut);
    cashFlowChart.update();
}
function setDefaultExpenseDate() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const input = document.getElementById("expenseDate");
    if (input) input.value = local.toISOString().slice(0, 16);
}
function setDefaultCashInDate() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const input = document.getElementById("cashInDate");
    if (input) input.value = local.toISOString().slice(0, 16);
}
function closeExpenseModal() {
    if (expenseModal) expenseModal.classList.remove("show");
}
function closeCashInModal() {
    if (cashInModal) cashInModal.classList.remove("show");
}
async function saveCashOut(event) {
    event.preventDefault();
    const account = normalizeAccount(document.getElementById("expenseAccount")?.value);
    const category = document.getElementById("expenseCategory")?.value.trim();
    const description = document.getElementById("expenseDescription")?.value.trim();
    const amount = Number(document.getElementById("expenseAmount")?.value);
    const dateValue = document.getElementById("expenseDate")?.value;
    const reference = document.getElementById("expenseReference")?.value.trim();
    const notes = document.getElementById("expenseNotes")?.value.trim();
    if (!account || !category || !description || !amount || amount <= 0 || !dateValue) {
        alert("Please complete all required fields.");
        return;
    }
    const user = auth.currentUser;
    if (!user) {
        alert("You are not logged in. Please log in again.");
        return;
    }
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        alert("Invalid date.");
        return;
    }
    try {
        await addDoc(collection(db, "cashFlow"), { type: "out", category, description, reference: reference || "", notes: notes || "", amount, cashIn: 0, cashOut: amount, account, sourceAccount: account, fromAccount: account, paymentMethod: account, date, createdAt: serverTimestamp(), createdBy: user.uid, createdByEmail: user.email || "", source: "cashFlow" });
        document.getElementById("expenseForm")?.reset();
        closeExpenseModal();
        alert("Cash out recorded successfully.");
    } catch (error) {
        console.error("Cash out error:", error);
        alert(`Unable to save cash out.\n\n${error.message}`);
    }
}
async function saveCashIn(event) {
    event.preventDefault();
    const account = normalizeAccount(document.getElementById("cashInAccount")?.value);
    const category = document.getElementById("cashInCategory")?.value.trim();
    const description = document.getElementById("cashInDescription")?.value.trim();
    const amount = Number(document.getElementById("cashInAmount")?.value);
    const dateValue = document.getElementById("cashInDate")?.value;
    const reference = document.getElementById("cashInReference")?.value.trim();
    const notes = document.getElementById("cashInNotes")?.value.trim();
    if (!account) {
        alert("Please select the account where the money will be added.");
        return;
    }
    if (!category) {
        alert("Please enter a cash in category.");
        return;
    }
    if (!description) {
        alert("Please enter a description.");
        return;
    }
    if (!amount || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }
    if (!dateValue) {
        alert("Please select the date.");
        return;
    }
    const user = auth.currentUser;
    if (!user) {
        alert("You are not logged in. Please log in again.");
        return;
    }
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
        alert("Invalid date.");
        return;
    }
    try {
        await addDoc(collection(db, "cashFlow"), { type: "in", category, description, reference: reference || "", notes: notes || "", amount, cashIn: amount, cashOut: 0, account, paymentMethod: account, sourceAccount: account, toAccount: account, fundAccount: account, date, createdAt: serverTimestamp(), createdBy: user.uid, createdByEmail: user.email || "", source: "cashFlow" });
        document.getElementById("cashInForm")?.reset();
        closeCashInModal();
        alert(`Cash In recorded successfully.\n\n${formatMoney(amount)} added to ${account}.`);
    } catch (error) {
        console.error("Cash In Firebase error:", error);
        alert(`Unable to save cash in.\n\n${error.message}`);
    }
}
function loadFirebaseData(user) {
    if (!user) {
        cashFlowData = [];
        salesData = [];
        rebuildCashFlow();
        return;
    }
    if (unsubscribeCashFlow) {
        unsubscribeCashFlow();
        unsubscribeCashFlow = null;
    }
    if (unsubscribeSales) {
        unsubscribeSales();
        unsubscribeSales = null;
    }
    unsubscribeCashFlow = onSnapshot(collection(db, "cashFlow"), snapshot => {
        cashFlowData = snapshot.docs.map(doc => normalizeCashFlow(doc.id, doc.data()));
        rebuildCashFlow();
    }, error => {
        console.error("Cash Flow Firebase error:", error);
        cashFlowData = [];
        rebuildCashFlow();
    });
    unsubscribeSales = onSnapshot(collection(db, "sales"), snapshot => {
        salesData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        rebuildCashFlow();
    }, error => {
        console.error("Sales Firebase error:", error);
        salesData = [];
        rebuildCashFlow();
    });
}
document.getElementById("resetFilters")?.addEventListener("click", () => {
    const search = document.getElementById("cashflowSearch");
    const date = document.getElementById("dateFilter");
    const type = document.getElementById("typeFilter");
    const account = document.getElementById("accountFilter");
    const category = document.getElementById("categoryFilter");
    if (search) search.value = "";
    if (date) date.value = "all";
    if (type) type.value = "all";
    if (account) account.value = "all";
    if (category) category.value = "all";
    filterCashFlow();
});
document.getElementById("cashflowSearch")?.addEventListener("input", filterCashFlow);
document.getElementById("dateFilter")?.addEventListener("change", filterCashFlow);
document.getElementById("typeFilter")?.addEventListener("change", filterCashFlow);
document.getElementById("accountFilter")?.addEventListener("change", filterCashFlow);
document.getElementById("categoryFilter")?.addEventListener("change", filterCashFlow);
document.getElementById("previousPage")?.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});
document.getElementById("nextPage")?.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredCashFlow.length / recordsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});
document.getElementById("addExpenseButton")?.addEventListener("click", () => {
    setDefaultExpenseDate();
    expenseModal?.classList.add("show");
});
document.getElementById("addCashInButton")?.addEventListener("click", () => {
    setDefaultCashInDate();
    cashInModal?.classList.add("show");
});
document.getElementById("closeExpenseModal")?.addEventListener("click", closeExpenseModal);
document.getElementById("cancelExpense")?.addEventListener("click", closeExpenseModal);
document.getElementById("closeCashInModal")?.addEventListener("click", closeCashInModal);
document.getElementById("cancelCashIn")?.addEventListener("click", closeCashInModal);
expenseModal?.addEventListener("click", event => {
    if (event.target === expenseModal) closeExpenseModal();
});
cashInModal?.addEventListener("click", event => {
    if (event.target === cashInModal) closeCashInModal();
});
document.getElementById("expenseForm")?.addEventListener("submit", saveCashOut);
document.getElementById("cashInForm")?.addEventListener("submit", saveCashIn);
document.getElementById("chartPeriod")?.addEventListener("change", updateChart);
document.getElementById("globalSearch")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        const search = document.getElementById("cashflowSearch");
        if (search) {
            search.value = event.currentTarget.value;
            filterCashFlow();
        }
    }
});
document.addEventListener("DOMContentLoaded", () => {
    setDefaultExpenseDate();
    setDefaultCashInDate();
    createChart();
});
onAuthStateChanged(auth, user => {
    loadFirebaseData(user);
});