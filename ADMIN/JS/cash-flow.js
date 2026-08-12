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

const tableBody = document.getElementById("cashflowTableBody");
const emptyState = document.getElementById("emptyState");
const expenseModal = document.getElementById("expenseModal");

function formatMoney(value) {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(Number(value) || 0);
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getValue(data, keys, defaultValue = "") {
    for (const key of keys) {
        if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
            return data[key];
        }
    }
    return defaultValue;
}

function getDateValue(data) {
    const value = getValue(data, [
        "date",
        "createdAt",
        "timestamp",
        "transactionDate",
        "saleDate"
    ]);
    if (value?.toDate) return value.toDate();
    if (value?.seconds) return new Date(value.seconds * 1000);
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
    return date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getAmount(data) {
    return Number(
        getValue(data, [
            "amount",
            "total",
            "grandTotal",
            "totalAmount",
            "netAmount",
            "saleTotal"
        ], 0)
    ) || 0;
}

function getSaleReference(data, id) {
    return String(
        getValue(data, [
            "transactionNumber",
            "transactionId",
            "invoiceNumber",
            "reference",
            "saleNumber"
        ], id)
    );
}

function getSaleStatus(data) {
    return String(
        getValue(data, [
            "status",
            "saleStatus",
            "paymentStatus"
        ], "completed")
    ).toLowerCase();
}

function normalizeCashFlow(id, data) {
    const cashIn = Number(getValue(data, ["cashIn"], 0)) || 0;
    const cashOut = Number(getValue(data, ["cashOut"], 0)) || 0;
    const typeValue = String(
        getValue(data, ["type"], cashIn > 0 ? "in" : "out")
    ).toLowerCase();

    const type = typeValue === "in" ? "in" : "out";

    return {
        id,
        date: getDateValue(data) || new Date(0),
        type,
        category: String(
            getValue(
                data,
                ["category", "type"],
                type === "in" ? "Other Income" : "Expense"
            )
        ),
        description: String(
            getValue(
                data,
                ["description", "remarks", "notes"],
                ""
            )
        ),
        reference: String(
            getValue(
                data,
                ["reference", "transactionId", "transactionNumber"],
                id
            )
        ),
        cashIn,
        cashOut
    };
}

function normalizeSale(id, data) {
    const status = getSaleStatus(data);

    if (
        [
            "cancelled",
            "canceled",
            "void",
            "voided",
            "refunded"
        ].includes(status)
    ) {
        return null;
    }

    const amount = getAmount(data);

    if (amount <= 0) {
        return null;
    }

    const date = getDateValue(data) || new Date(0);
    const reference = getSaleReference(data, id);

    const customer = String(
        getValue(
            data,
            [
                "customerName",
                "customer",
                "customer_name"
            ],
            "Walk-in Customer"
        )
    );

    const payment = String(
        getValue(
            data,
            [
                "paymentMethod",
                "payment",
                "method"
            ],
            ""
        )
    );

    return {
        id: `SALE-${id}`,
        date,
        type: "in",
        category: "Sale",
        description: `POS Sale${payment ? ` - ${payment}` : ""}${customer ? ` - ${customer}` : ""}`,
        reference,
        cashIn: amount,
        cashOut: 0,
        source: "sale"
    };
}

function rebuildCashFlow() {
    const existing = [...cashFlowData];

    const existingSaleReferences = new Set(
        existing
            .filter(item => item.category === "Sale")
            .map(item => String(item.reference))
    );

    const generatedSales = salesData
        .map(item => normalizeSale(item.id, item.data))
        .filter(Boolean)
        .filter(
            item =>
                !existingSaleReferences.has(
                    String(item.reference)
                )
        );

    cashFlowData = [
        ...existing,
        ...generatedSales
    ].sort(
        (a, b) => b.date - a.date
    );

    filteredCashFlow = [...cashFlowData];

    calculateBalances();
    updateSummary();
    updateCategoryFilter();
    filterCashFlow();
    updateChart();
}

function calculateBalances() {
    const sorted = [...cashFlowData].sort(
        (a, b) => a.date - b.date
    );

    let balance = 0;

    runningBalances = {};

    for (const record of sorted) {
        balance += record.cashIn - record.cashOut;
        runningBalances[record.id] = balance;
    }
}

function updateSummary() {
    const totalCashIn = cashFlowData.reduce(
        (sum, item) => sum + item.cashIn,
        0
    );

    const totalCashOut = cashFlowData.reduce(
        (sum, item) => sum + item.cashOut,
        0
    );

    const net = totalCashIn - totalCashOut;

    const totalCashInElement =
        document.getElementById("totalCashIn");

    const totalCashOutElement =
        document.getElementById("totalCashOut");

    const netCashFlowElement =
        document.getElementById("netCashFlow");

    const cashBalanceElement =
        document.getElementById("cashBalance");

    if (totalCashInElement) {
        totalCashInElement.textContent =
            formatMoney(totalCashIn);
    }

    if (totalCashOutElement) {
        totalCashOutElement.textContent =
            formatMoney(totalCashOut);
    }

    if (netCashFlowElement) {
        netCashFlowElement.textContent =
            formatMoney(net);
    }

    if (cashBalanceElement) {
        cashBalanceElement.textContent =
            formatMoney(net);
    }

    const description =
        document.getElementById("netDescription");

    if (description) {
        description.textContent =
            net >= 0
                ? "Positive cash flow"
                : "Negative cash flow";

        description.style.color =
            net >= 0
                ? "#16803c"
                : "#d74343";
    }

    let sales = 0;
    let otherIncome = 0;
    let expenses = 0;
    let purchases = 0;
    let refunds = 0;

    for (const record of cashFlowData) {
        if (record.category === "Sale") {
            sales += record.cashIn;
        } else if (record.type === "in") {
            otherIncome += record.cashIn;
        }

        if (
            record.category === "Expense" ||
            record.category === "Other Expense"
        ) {
            expenses += record.cashOut;
        }

        if (record.category === "Purchase") {
            purchases += record.cashOut;
        }

        if (record.category === "Refund") {
            refunds += record.cashOut;
        }
    }

    const salesCash =
        document.getElementById("salesCash");

    const otherIncomeCash =
        document.getElementById("otherIncomeCash");

    const expenseCash =
        document.getElementById("expenseCash");

    const purchaseCash =
        document.getElementById("purchaseCash");

    const refundCash =
        document.getElementById("refundCash");

    if (salesCash) {
        salesCash.textContent =
            formatMoney(sales);
    }

    if (otherIncomeCash) {
        otherIncomeCash.textContent =
            formatMoney(otherIncome);
    }

    if (expenseCash) {
        expenseCash.textContent =
            formatMoney(expenses);
    }

    if (purchaseCash) {
        purchaseCash.textContent =
            formatMoney(purchases);
    }

    if (refundCash) {
        refundCash.textContent =
            formatMoney(refunds);
    }
}

function updateCategoryFilter() {
    const select =
        document.getElementById("categoryFilter");

    if (!select) return;

    const current = select.value;

    const categories = [
        ...new Set(
            cashFlowData
                .map(item => item.category)
                .filter(Boolean)
        )
    ].sort(
        (a, b) => a.localeCompare(b)
    );

    select.innerHTML =
        '<option value="all">All Categories</option>';

    for (const category of categories) {
        const option =
            document.createElement("option");

        option.value = category;
        option.textContent = category;

        select.appendChild(option);
    }

    if (categories.includes(current)) {
        select.value = current;
    }
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

    const start =
        (currentPage - 1) * recordsPerPage;

    const pageRecords =
        filteredCashFlow.slice(
            start,
            start + recordsPerPage
        );

    for (const record of pageRecords) {
        const row =
            document.createElement("tr");

        const typeClass =
            record.type === "in"
                ? "type-in"
                : "type-out";

        const cashIn =
            record.cashIn > 0
                ? `<span class="cash-in">+${formatMoney(record.cashIn)}</span>`
                : "<span>—</span>";

        const cashOut =
            record.cashOut > 0
                ? `<span class="cash-out">-${formatMoney(record.cashOut)}</span>`
                : "<span>—</span>";

        const balance =
            runningBalances[record.id] ?? 0;

        row.innerHTML = `
            <td>
                <div class="flow-id">
                    ${escapeHTML(record.id)}
                </div>
            </td>
            <td>
                <div class="flow-date">
                    ${escapeHTML(formatDate(record.date))}
                </div>
            </td>
            <td>
                <span class="flow-type ${typeClass}">
                    ${record.type === "in" ? "Cash In" : "Cash Out"}
                </span>
            </td>
            <td>
                <span class="category-badge">
                    ${escapeHTML(record.category)}
                </span>
            </td>
            <td>
                <div class="flow-description">
                    ${escapeHTML(record.description)}
                </div>
                <div class="flow-reference">
                    ${escapeHTML(record.reference)}
                </div>
            </td>
            <td>${cashIn}</td>
            <td>${cashOut}</td>
            <td>
                <span class="balance-value">
                    ${formatMoney(balance)}
                </span>
            </td>
        `;

        tableBody.appendChild(row);
    }

    updatePagination();
}

function filterCashFlow() {
    const searchElement =
        document.getElementById("cashflowSearch");

    const dateElement =
        document.getElementById("dateFilter");

    const typeElement =
        document.getElementById("typeFilter");

    const categoryElement =
        document.getElementById("categoryFilter");

    if (
        !searchElement ||
        !dateElement ||
        !typeElement ||
        !categoryElement
    ) {
        return;
    }

    const search =
        searchElement.value
            .trim()
            .toLowerCase();

    const dateFilter =
        dateElement.value;

    const typeFilter =
        typeElement.value;

    const categoryFilter =
        categoryElement.value;

    filteredCashFlow =
        cashFlowData.filter(record => {
            const searchable =
                `${record.id} ${record.description} ${record.category} ${record.reference}`
                    .toLowerCase();

            const matchesSearch =
                !search ||
                searchable.includes(search);

            const matchesDate =
                matchesDateFilter(
                    record.date,
                    dateFilter
                );

            const matchesType =
                typeFilter === "all" ||
                record.type === typeFilter;

            const matchesCategory =
                categoryFilter === "all" ||
                record.category === categoryFilter;

            return (
                matchesSearch &&
                matchesDate &&
                matchesType &&
                matchesCategory
            );
        });

    currentPage = 1;

    renderTable();
}

function matchesDateFilter(date, filter) {
    if (filter === "all") return true;

    const recordDate =
        date instanceof Date
            ? date
            : new Date(date);

    const today = new Date();

    if (filter === "today") {
        return isSameDay(
            recordDate,
            today
        );
    }

    if (filter === "yesterday") {
        const yesterday =
            new Date(today);

        yesterday.setDate(
            today.getDate() - 1
        );

        return isSameDay(
            recordDate,
            yesterday
        );
    }

    if (filter === "week") {
        const start =
            new Date(today);

        start.setDate(
            today.getDate() -
            today.getDay()
        );

        start.setHours(
            0,
            0,
            0,
            0
        );

        return recordDate >= start;
    }

    if (filter === "month") {
        return (
            recordDate.getMonth() ===
                today.getMonth() &&
            recordDate.getFullYear() ===
                today.getFullYear()
        );
    }

    return true;
}

function isSameDay(a, b) {
    return (
        a.getDate() === b.getDate() &&
        a.getMonth() === b.getMonth() &&
        a.getFullYear() === b.getFullYear()
    );
}

function updatePagination() {
    const total =
        filteredCashFlow.length;

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                total /
                recordsPerPage
            )
        );

    if (
        currentPage >
        totalPages
    ) {
        currentPage =
            totalPages;
    }

    const start =
        total === 0
            ? 0
            : (currentPage - 1) *
                recordsPerPage +
                1;

    const end =
        Math.min(
            currentPage *
                recordsPerPage,
            total
        );

    const paginationInfo =
        document.getElementById(
            "paginationInfo"
        );

    const currentPageElement =
        document.getElementById(
            "currentPage"
        );

    const previousPage =
        document.getElementById(
            "previousPage"
        );

    const nextPage =
        document.getElementById(
            "nextPage"
        );

    if (paginationInfo) {
        paginationInfo.textContent =
            `Showing ${start}-${end} of ${total} transactions`;
    }

    if (currentPageElement) {
        currentPageElement.textContent =
            currentPage;
    }

    if (previousPage) {
        previousPage.disabled =
            currentPage <= 1;
    }

    if (nextPage) {
        nextPage.disabled =
            currentPage >= totalPages;
    }
}

function getChartData(days) {
    const result = [];
    const today = new Date();

    for (
        let i = days - 1;
        i >= 0;
        i--
    ) {
        const date =
            new Date(today);

        date.setDate(
            today.getDate() - i
        );

        date.setHours(
            0,
            0,
            0,
            0
        );

        let cashIn = 0;
        let cashOut = 0;

        for (const record of cashFlowData) {
            if (
                isSameDay(
                    record.date,
                    date
                )
            ) {
                cashIn +=
                    record.cashIn;

                cashOut +=
                    record.cashOut;
            }
        }

        result.push({
            date: date.toLocaleDateString(
                "en-PH",
                {
                    month: "short",
                    day: "numeric"
                }
            ),
            cashIn,
            cashOut
        });
    }

    return result;
}

function createChart() {
    const canvas =
        document.getElementById(
            "cashFlowChart"
        );

    if (
        !canvas ||
        typeof Chart === "undefined"
    ) {
        return;
    }

    const chartPeriod =
        document.getElementById(
            "chartPeriod"
        );

    const days =
        Number(
            chartPeriod?.value
        ) || 7;

    const data =
        getChartData(days);

    cashFlowChart =
        new Chart(
            canvas,
            {
                type: "line",
                data: {
                    labels:
                        data.map(
                            item =>
                                item.date
                        ),
                    datasets: [
                        {
                            label: "Cash In",
                            data:
                                data.map(
                                    item =>
                                        item.cashIn
                                ),
                            borderColor:
                                "#16803c",
                            backgroundColor:
                                "rgba(22,128,60,0.08)",
                            fill: true,
                            tension: 0.35,
                            borderWidth: 2,
                            pointRadius: 3
                        },
                        {
                            label: "Cash Out",
                            data:
                                data.map(
                                    item =>
                                        item.cashOut
                                ),
                            borderColor:
                                "#d74343",
                            backgroundColor:
                                "rgba(215,67,67,0.06)",
                            fill: true,
                            tension: 0.35,
                            borderWidth: 2,
                            pointRadius: 3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: "bottom"
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: value =>
                                    "₱" +
                                    Number(
                                        value
                                    ).toLocaleString()
                            }
                        }
                    }
                }
            }
        );
}

function updateChart() {
    if (!cashFlowChart) return;

    const chartPeriod =
        document.getElementById(
            "chartPeriod"
        );

    const days =
        Number(
            chartPeriod?.value
        ) || 7;

    const data =
        getChartData(days);

    cashFlowChart.data.labels =
        data.map(
            item => item.date
        );

    cashFlowChart.data.datasets[0].data =
        data.map(
            item => item.cashIn
        );

    cashFlowChart.data.datasets[1].data =
        data.map(
            item => item.cashOut
        );

    cashFlowChart.update();
}

function setDefaultExpenseDate() {
    const now = new Date();

    const local =
        new Date(
            now.getTime() -
            now.getTimezoneOffset() *
                60000
        );

    const input =
        document.getElementById(
            "expenseDate"
        );

    if (input) {
        input.value =
            local
                .toISOString()
                .slice(0, 16);
    }
}

function closeExpenseModal() {
    if (expenseModal) {
        expenseModal.classList.remove(
            "show"
        );
    }
}

async function saveCashOut(event) {
    event.preventDefault();

    const category =
        document.getElementById(
            "expenseCategory"
        )?.value.trim();

    const description =
        document.getElementById(
            "expenseDescription"
        )?.value.trim();

    const amount =
        Number(
            document.getElementById(
                "expenseAmount"
            )?.value
        );

    const dateValue =
        document.getElementById(
            "expenseDate"
        )?.value;

    const reference =
        document.getElementById(
            "expenseReference"
        )?.value.trim();

    const notes =
        document.getElementById(
            "expenseNotes"
        )?.value.trim();

    if (
        !category ||
        !description ||
        !amount ||
        amount <= 0 ||
        !dateValue
    ) {
        alert(
            "Please complete all required fields."
        );
        return;
    }

    const user =
        auth.currentUser;

    if (!user) {
        alert(
            "You are not logged in. Please log in again."
        );
        return;
    }

    try {
        const date =
            new Date(dateValue);

        await addDoc(
            collection(
                db,
                "cashFlow"
            ),
            {
                type: "out",
                category,
                description,
                reference:
                    reference || "",
                notes,
                amount,
                cashIn: 0,
                cashOut: amount,
                date,
                createdAt:
                    serverTimestamp(),
                createdBy:
                    user.uid,
                createdByEmail:
                    user.email || ""
            }
        );

        document
            .getElementById(
                "expenseForm"
            )
            ?.reset();

        closeExpenseModal();

        alert(
            "Cash out recorded successfully."
        );
    } catch (error) {
        console.error(
            "Firebase cash flow save error:",
            error
        );

        alert(
            `Unable to save cash out.\n\n${error.message}`
        );
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

    unsubscribeCashFlow =
        onSnapshot(
            collection(
                db,
                "cashFlow"
            ),
            snapshot => {
                cashFlowData =
                    snapshot.docs.map(
                        doc =>
                            normalizeCashFlow(
                                doc.id,
                                doc.data()
                            )
                    );

                rebuildCashFlow();
            },
            error => {
                console.error(
                    "Cash Flow Firebase error:",
                    error
                );

                cashFlowData = [];

                rebuildCashFlow();
            }
        );

    unsubscribeSales =
        onSnapshot(
            collection(
                db,
                "sales"
            ),
            snapshot => {
                salesData =
                    snapshot.docs.map(
                        doc => ({
                            id: doc.id,
                            data: doc.data()
                        })
                    );

                console.log(
                    "[StockMaster] Sales loaded:",
                    salesData.length
                );

                rebuildCashFlow();
            },
            error => {
                console.error(
                    "Sales Firebase error:",
                    error
                );

                salesData = [];

                rebuildCashFlow();
            }
        );
}

const resetFilters =
    document.getElementById(
        "resetFilters"
    );

if (resetFilters) {
    resetFilters.addEventListener(
        "click",
        () => {
            document.getElementById(
                "cashflowSearch"
            ).value = "";

            document.getElementById(
                "dateFilter"
            ).value = "all";

            document.getElementById(
                "typeFilter"
            ).value = "all";

            document.getElementById(
                "categoryFilter"
            ).value = "all";

            filterCashFlow();
        }
    );
}

document
    .getElementById("cashflowSearch")
    ?.addEventListener(
        "input",
        filterCashFlow
    );

document
    .getElementById("dateFilter")
    ?.addEventListener(
        "change",
        filterCashFlow
    );

document
    .getElementById("typeFilter")
    ?.addEventListener(
        "change",
        filterCashFlow
    );

document
    .getElementById("categoryFilter")
    ?.addEventListener(
        "change",
        filterCashFlow
    );

document
    .getElementById("previousPage")
    ?.addEventListener(
        "click",
        () => {
            if (currentPage > 1) {
                currentPage--;
                renderTable();
            }
        }
    );

document
    .getElementById("nextPage")
    ?.addEventListener(
        "click",
        () => {
            const totalPages =
                Math.ceil(
                    filteredCashFlow.length /
                    recordsPerPage
                );

            if (
                currentPage <
                totalPages
            ) {
                currentPage++;
                renderTable();
            }
        }
    );

document
    .getElementById("addExpenseButton")
    ?.addEventListener(
        "click",
        () => {
            setDefaultExpenseDate();

            expenseModal?.classList.add(
                "show"
            );
        }
    );

document
    .getElementById("closeExpenseModal")
    ?.addEventListener(
        "click",
        closeExpenseModal
    );

document
    .getElementById("cancelExpense")
    ?.addEventListener(
        "click",
        closeExpenseModal
    );

if (expenseModal) {
    expenseModal.addEventListener(
        "click",
        event => {
            if (
                event.target ===
                expenseModal
            ) {
                closeExpenseModal();
            }
        }
    );
}

document
    .getElementById("expenseForm")
    ?.addEventListener(
        "submit",
        saveCashOut
    );

document
    .getElementById("chartPeriod")
    ?.addEventListener(
        "change",
        updateChart
    );

document
    .getElementById("globalSearch")
    ?.addEventListener(
        "keydown",
        event => {
            if (
                event.key ===
                "Enter"
            ) {
                document.getElementById(
                    "cashflowSearch"
                ).value =
                    event.currentTarget.value;

                filterCashFlow();
            }
        }
    );

document.addEventListener(
    "DOMContentLoaded",
    () => {
        createChart();
    }
);

onAuthStateChanged(
    auth,
    user => {
        console.log(
            "[StockMaster] Authenticated user:",
            user?.email || "none"
        );

        loadFirebaseData(user);
    }
);