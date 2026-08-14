import {
    db,
    auth
} from "../../Firebase/firebase-config.js";

import {
    collection,
    doc,
    getDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";


/* =========================================================
   STATE
========================================================= */

let sales = [];
let filteredSales = [];

let currentPage = 1;

const salesPerPage = 10;

let selectedSale = null;

let unsubscribeSales = null;

let currentUser = null;
let currentUserProfile = null;


/* =========================================================
   ELEMENTS
========================================================= */

const tableBody =
    document.getElementById("salesTableBody");

const emptyState =
    document.getElementById("emptyState");

const emptyTitle =
    document.getElementById("emptyTitle");

const emptyMessage =
    document.getElementById("emptyMessage");

const paymentFilter =
    document.getElementById("paymentFilter");

const statusFilter =
    document.getElementById("statusFilter");

const breakdownGrid =
    document.getElementById("breakdownGrid");

const transactionModal =
    document.getElementById("transactionModal");

const dateFilter =
    document.getElementById("dateFilter");

const specificDateFilter =
    document.getElementById("specificDateFilter");

const exportModal =
    document.getElementById("exportModal");

const exportDateFilter =
    document.getElementById("exportDateFilter");

const exportSpecificDate =
    document.getElementById("exportSpecificDate");

const exportSpecificDateWrapper =
    document.getElementById("exportSpecificDateWrapper");


/* =========================================================
   MONEY
========================================================= */

function money(value) {

    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(Number(value) || 0);

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   DATE HELPERS
========================================================= */

function dateValue(value) {

    if (!value) {
        return null;
    }

    if (typeof value.toDate === "function") {
        return value.toDate();
    }

    if (value instanceof Date) {
        return value;
    }

    if (
        typeof value === "object" &&
        typeof value.seconds === "number"
    ) {
        return new Date(value.seconds * 1000);
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? null
        : date;

}


function formatDate(value) {

    const date = dateValue(value);

    if (!date) {
        return "—";
    }

    return date.toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short"
    });

}


/* =========================================================
   DATE ONLY
========================================================= */

function formatDateInput(date) {

    if (!date) {
        return "";
    }

    const year =
        date.getFullYear();

    const month =
        String(date.getMonth() + 1)
            .padStart(2, "0");

    const day =
        String(date.getDate())
            .padStart(2, "0");

    return `${year}-${month}-${day}`;

}


/* =========================================================
   SAME DAY
========================================================= */

function sameDay(a, b) {

    return Boolean(
        a &&
        b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );

}


/* =========================================================
   WEEK RANGE
   Monday - Sunday
========================================================= */

function getWeekRange(referenceDate = new Date()) {

    const start =
        new Date(referenceDate);

    const day =
        start.getDay();

    const difference =
        day === 0
            ? -6
            : 1 - day;

    start.setDate(
        start.getDate() + difference
    );

    start.setHours(
        0,
        0,
        0,
        0
    );


    const end =
        new Date(start);

    end.setDate(
        end.getDate() + 7
    );

    end.setHours(
        0,
        0,
        0,
        0
    );


    return {
        start,
        end
    };

}


/* =========================================================
   DATE FILTER MATCH
========================================================= */

function isDateMatch(
    date,
    filter,
    specificDate = ""
) {

    if (filter === "all") {
        return true;
    }

    if (!date) {
        return false;
    }


    const now =
        new Date();


    /* TODAY */

    if (filter === "today") {

        return sameDay(
            date,
            now
        );

    }


    /* YESTERDAY */

    if (filter === "yesterday") {

        const yesterday =
            new Date(now);

        yesterday.setDate(
            yesterday.getDate() - 1
        );

        return sameDay(
            date,
            yesterday
        );

    }


    /* WEEK */

    if (filter === "week") {

        const {
            start,
            end
        } = getWeekRange(now);

        return (
            date >= start &&
            date < end
        );

    }


    /* MONTH */

    if (filter === "month") {

        return (
            date.getFullYear() ===
            now.getFullYear() &&

            date.getMonth() ===
            now.getMonth()
        );

    }


    /* SPECIFIC DATE */

    if (filter === "specific") {

        if (!specificDate) {
            return false;
        }

        const selected =
            new Date(
                `${specificDate}T00:00:00`
            );

        return sameDay(
            date,
            selected
        );

    }


    return true;

}


/* =========================================================
   DATE FILTER LABEL
========================================================= */

function getDateFilterLabel(
    filter,
    specificDate = ""
) {

    switch (filter) {

        case "today":
            return "Today";

        case "yesterday":
            return "Yesterday";

        case "week":
            return "This Week";

        case "month":
            return "This Month";

        case "specific":

            if (!specificDate) {
                return "Specific Date";
            }

            const date =
                new Date(
                    `${specificDate}T00:00:00`
                );

            return date.toLocaleDateString(
                "en-PH",
                {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                }
            );

        default:
            return "All Dates";

    }

}


/* =========================================================
   USER PROFILE
========================================================= */

function getUserName() {

    return (
        currentUserProfile?.fullName ||
        currentUserProfile?.name ||
        currentUserProfile?.displayName ||
        currentUser?.displayName ||
        currentUser?.email ||
        ""
    );

}


function getUserRole() {

    return (
        currentUserProfile?.role ||
        currentUserProfile?.jobTitle ||
        currentUserProfile?.position ||
        ""
    );

}


function initials(name) {

    const parts =
        String(name || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);

    if (!parts.length) {
        return "";
    }

    if (parts.length === 1) {
        return parts[0]
            .substring(0, 2)
            .toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`
        .toUpperCase();

}


function updateProfile() {

    document.getElementById(
        "currentUserName"
    ).textContent =
        getUserName();

    document.getElementById(
        "currentUserRole"
    ).textContent =
        getUserRole();

    document.getElementById(
        "currentUserAvatar"
    ).textContent =
        initials(getUserName());

}


/* =========================================================
   LOAD USER
========================================================= */

async function loadUserProfile(user) {

    currentUserProfile = null;

    if (user) {

        try {

            const snapshot =
                await getDoc(
                    doc(
                        db,
                        "users",
                        user.uid
                    )
                );

            if (snapshot.exists()) {

                currentUserProfile =
                    snapshot.data();

            }

        } catch (error) {

            console.error(
                "User profile error:",
                error
            );

        }

    }

    updateProfile();

}


/* =========================================================
   SIDEBAR
========================================================= */

async function loadSidebar() {

    const container =
        document.getElementById(
            "sidebar-container"
        );

    if (!container) {
        return;
    }

    try {

        const response =
            await fetch(
                "sidebar.html"
            );

        if (!response.ok) {
            throw new Error(
                "Could not load sidebar.html"
            );
        }

        container.innerHTML =
            await response.text();

        const script =
            document.createElement(
                "script"
            );

        script.src =
            "sidebar.js";

        script.dataset.salesSidebar =
            "true";

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


/* =========================================================
   PAYMENT NORMALIZATION
========================================================= */

function normalizePaymentMethod(value) {

    const method =
        String(value || "")
            .trim()
            .toLowerCase();

    if (method === "cash") {
        return "Cash";
    }

    if (method === "gcash") {
        return "GCash";
    }

    if (method === "bdo") {
        return "BDO";
    }

    if (method === "bibo") {
        return "BIBO";
    }

    if (method === "bpi") {
        return "BPI";
    }

    if (method === "split") {
        return "Split";
    }

    return String(value || "").trim();

}


/* =========================================================
   NORMALIZE SALE
========================================================= */

function normalizeSale(snapshot) {

    const data =
        snapshot.data();


    const items =
        Array.isArray(data.items)

            ? data.items.map(item => ({

                name:
                    String(
                        item.name ||
                        item.productName ||
                        ""
                    ),

                sku:
                    String(
                        item.sku ||
                        item.productSku ||
                        ""
                    ),

                productId:
                    String(
                        item.productId ||
                        ""
                    ),

                quantity:
                    Number(
                        item.quantity
                    ) || 0,

                price:
                    Number(
                        item.price
                    ) || 0,

                total:
                    Number(
                        item.total
                    ) ||
                    (
                        (Number(item.price) || 0) *
                        (Number(item.quantity) || 0)
                    )

            }))

            : [];


    const paymentBreakdown = {

        Cash:
            Number(
                data.paymentBreakdown?.Cash
            ) || 0,

        GCash:
            Number(
                data.paymentBreakdown?.GCash
            ) || 0,

        BDO:
            Number(
                data.paymentBreakdown?.BDO
            ) || 0,

        BIBO:
            Number(
                data.paymentBreakdown?.BIBO
            ) || 0,

        BPI:
            Number(
                data.paymentBreakdown?.BPI
            ) || 0

    };


    const splitPayments =
        Array.isArray(data.splitPayments)

            ? data.splitPayments.map(item => ({

                method:
                    normalizePaymentMethod(
                        item.method
                    ),

                amount:
                    Number(
                        item.amount
                    ) || 0

            }))

            : [];


    return {

        id:
            String(
                data.transactionNumber ||
                data.transactionId ||
                snapshot.id
            ),

        firestoreId:
            snapshot.id,

        date:
            data.createdAt ||
            data.date ||
            data.timestamp ||
            null,

        customer:
            String(
                data.customerName ||
                data.customer ||
                ""
            ),

        items,

        payment:
            normalizePaymentMethod(
                data.paymentMethod ||
                data.payment ||
                ""
            ),

        subtotal:
            Number(data.subtotal) || 0,

        discount:
            Number(data.discount) || 0,

        total:
            Number(data.total) || 0,

        cash:
            Number(
                data.cashReceived ??
                data.cash
            ) || 0,

        change:
            Number(data.change) || 0,

        cashier:
            String(
                data.staffName ||
                data.cashier ||
                data.cashierName ||
                ""
            ),

        status:
            String(
                data.status ||
                ""
            ),

        paymentBreakdown,

        splitPayment:
            data.splitPayment === true,

        splitPaymentType:
            String(
                data.splitPaymentType ||
                ""
            ),

        splitPayments,

        raw:
            data

    };

}


/* =========================================================
   PAYMENT AMOUNTS
========================================================= */

function getPaymentAmounts(sale) {

    const amounts = {

        Cash: 0,
        GCash: 0,
        BDO: 0,
        BIBO: 0,
        BPI: 0

    };


    const payment =
        normalizePaymentMethod(
            sale.payment
        );


    if (
        payment === "Cash" ||
        payment === "GCash" ||
        payment === "BDO" ||
        payment === "BIBO" ||
        payment === "BPI"
    ) {

        amounts[payment] =
            Number(sale.total) || 0;

        return amounts;

    }


    const breakdown =
        sale.paymentBreakdown || {};

    let hasBreakdown =
        false;


    [
        "Cash",
        "GCash",
        "BDO",
        "BIBO",
        "BPI"

    ].forEach(method => {

        const amount =
            Number(
                breakdown[method]
            ) || 0;

        if (amount > 0) {

            amounts[method] +=
                amount;

            hasBreakdown = true;

        }

    });


    if (hasBreakdown) {
        return amounts;
    }


    if (
        Array.isArray(
            sale.splitPayments
        )
    ) {

        sale.splitPayments
            .forEach(item => {

                const method =
                    normalizePaymentMethod(
                        item.method
                    );

                const amount =
                    Number(
                        item.amount
                    ) || 0;

                if (
                    amount > 0 &&
                    Object.prototype.hasOwnProperty.call(
                        amounts,
                        method
                    )
                ) {

                    amounts[method] +=
                        amount;

                }

            });

    }


    return amounts;

}


/* =========================================================
   PAYMENT TRANSACTION COUNT
========================================================= */

function getPaymentTransactions(sale) {

    const amounts =
        getPaymentAmounts(sale);


    const transactions = {

        Cash: 0,
        GCash: 0,
        BDO: 0,
        BIBO: 0,
        BPI: 0

    };


    Object.keys(amounts)
        .forEach(method => {

            if (amounts[method] > 0) {

                transactions[method] =
                    1;

            }

        });


    return transactions;

}


/* =========================================================
   FIREBASE SALES LISTENER
========================================================= */

function startSalesListener() {

    if (unsubscribeSales) {

        unsubscribeSales();

    }


    emptyState.classList.remove(
        "show"
    );

    emptyTitle.textContent =
        "Loading sales...";

    emptyMessage.textContent =
        "Loading transactions from Firebase.";

    emptyState.classList.add(
        "show"
    );


    unsubscribeSales =
        onSnapshot(

            collection(
                db,
                "sales"
            ),

            snapshot => {

                sales =
                    snapshot.docs.map(
                        normalizeSale
                    );


                sales.sort((a, b) => {

                    const da =
                        dateValue(
                            a.date
                        )?.getTime() || 0;

                    const dbDate =
                        dateValue(
                            b.date
                        )?.getTime() || 0;

                    return dbDate - da;

                });


                buildFilters();

                filterSales();

            },

            error => {

                console.error(
                    "Sales Firebase error:",
                    error
                );

                sales = [];

                filteredSales = [];

                render();

                emptyTitle.textContent =
                    "Unable to load sales";

                emptyMessage.textContent =
                    error.message ||
                    "Check your Firestore rules.";

                emptyState.classList.add(
                    "show"
                );

            }

        );

}


/* =========================================================
   BUILD FILTERS
========================================================= */

function buildFilters() {

    const selectedPayment =
        paymentFilter.value;

    const selectedStatus =
        statusFilter.value;


    paymentFilter.innerHTML = `

        <option value="all">
            All Payment Methods
        </option>

        <option value="Cash">
            Cash
        </option>

        <option value="GCash">
            GCash
        </option>

        <option value="BDO">
            BDO
        </option>

        <option value="BIBO">
            BIBO
        </option>

        <option value="BPI">
            BPI
        </option>

    `;


    const statuses =
        [
            ...new Set(
                sales
                    .map(
                        s => s.status
                    )
                    .filter(Boolean)
            )
        ]
        .sort();


    statusFilter.innerHTML =
        `
        <option value="all">
            All Status
        </option>
        `;


    statuses.forEach(status => {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            status;

        option.textContent =
            status;

        statusFilter.appendChild(
            option
        );

    });


    if (
        [
            "Cash",
            "GCash",
            "BDO",
            "BIBO",
            "BPI"
        ].includes(
            selectedPayment
        )
    ) {

        paymentFilter.value =
            selectedPayment;

    } else {

        paymentFilter.value =
            "all";

    }


    if (
        [
            ...statusFilter.options
        ]
        .some(
            option =>
                option.value ===
                selectedStatus
        )
    ) {

        statusFilter.value =
            selectedStatus;

    } else {

        statusFilter.value =
            "all";

    }

}


/* =========================================================
   FILTER SALES
========================================================= */

function filterSales() {

    const search =
        document.getElementById(
            "salesSearch"
        )
        .value
        .trim()
        .toLowerCase();


    const selectedDateFilter =
        dateFilter.value;


    const specificDate =
        specificDateFilter.value;


    const payment =
        paymentFilter.value;


    const status =
        statusFilter.value;


    /*
       If Specific Date is selected
       but no date is selected,
       don't show sales.
    */

    if (
        selectedDateFilter === "specific" &&
        !specificDate
    ) {

        filteredSales = [];

        currentPage = 1;

        render();

        return;

    }


    filteredSales =
        sales.filter(sale => {

            const searchable = [

                sale.id,

                sale.customer,

                sale.cashier,

                sale.payment,

                sale.status,

                ...sale.items.map(
                    item => item.name
                ),

                ...sale.items.map(
                    item => item.sku
                )

            ]
            .join(" ")
            .toLowerCase();


            let paymentMatch =
                true;


            if (
                payment !== "all"
            ) {

                const paymentAmounts =
                    getPaymentAmounts(
                        sale
                    );

                paymentMatch =
                    Number(
                        paymentAmounts[payment]
                    ) > 0;

            }


            return (

                (
                    !search ||
                    searchable.includes(
                        search
                    )
                )

                &&

                isDateMatch(
                    dateValue(
                        sale.date
                    ),
                    selectedDateFilter,
                    specificDate
                )

                &&

                paymentMatch

                &&

                (
                    status === "all" ||
                    sale.status === status
                )

            );

        });


    currentPage = 1;

    render();

}


/* =========================================================
   ITEM COUNT
========================================================= */

function getItemCount(sale) {

    return sale.items.reduce(

        (sum, item) =>
            sum +
            (
                Number(
                    item.quantity
                ) || 0
            ),

        0

    );

}


/* =========================================================
   RENDER TABLE
========================================================= */

function render() {

    tableBody.innerHTML = "";


    const total =
        filteredSales.length;


    if (total === 0) {

        emptyState.classList.add(
            "show"
        );

        emptyTitle.textContent =
            sales.length
                ? "No sales found"
                : "No sales recorded";


        emptyMessage.textContent =
            sales.length
                ? "Try changing your filters."
                : "Sales created through the POS will appear here.";

    } else {

        emptyState.classList.remove(
            "show"
        );


        const start =
            (
                currentPage - 1
            ) *
            salesPerPage;


        const pageItems =
            filteredSales.slice(
                start,
                start + salesPerPage
            );


        pageItems.forEach(sale => {

            const row =
                document.createElement(
                    "tr"
                );


            const paymentClass =
                sale.payment
                    .toLowerCase()
                    .replaceAll(
                        " ",
                        "-"
                    );


            const statusClass =
                sale.status
                    .toLowerCase()
                    .replaceAll(
                        " ",
                        "-"
                    );


            const discountClass =
                sale.discount > 0
                    ? "has-discount"
                    : "no-discount";


            row.innerHTML = `

                <td>

                    <div class="transaction-id">
                        ${escapeHTML(sale.id)}
                    </div>

                </td>


                <td>

                    <div class="transaction-date">
                        ${escapeHTML(
                            formatDate(
                                sale.date
                            )
                        )}
                    </div>

                </td>


                <td>

                    <div class="customer-name">
                        ${escapeHTML(
                            sale.customer ||
                            "Walk-in Customer"
                        )}
                    </div>

                </td>


                <td>

                    <div class="transaction-items">
                        ${getItemCount(sale)}
                        item(s)
                    </div>

                </td>


                <td>

                    <span
                        class="payment-badge payment-${escapeHTML(
                            paymentClass
                        )}">

                        ${escapeHTML(
                            sale.payment ||
                            "—"
                        )}

                    </span>

                </td>


                <td>

                    <div class="sales-subtotal">
                        ${money(
                            sale.subtotal
                        )}
                    </div>

                </td>


                <td>

                    <div
                        class="sales-discount ${discountClass}">

                        ${
                            sale.discount > 0
                                ? `-${money(sale.discount)}`
                                : money(0)
                        }

                    </div>

                </td>


                <td>

                    <div class="sales-total">
                        ${money(
                            sale.total
                        )}
                    </div>

                </td>


                <td>

                    <div class="customer-name">
                        ${escapeHTML(
                            sale.cashier ||
                            "—"
                        )}
                    </div>

                </td>


                <td>

                    <span
                        class="status-badge status-${escapeHTML(
                            statusClass
                        )}">

                        ${escapeHTML(
                            sale.status ||
                            "—"
                        )}

                    </span>

                </td>


                <td>

                    <button
                        class="view-btn"
                        data-id="${escapeHTML(
                            sale.firestoreId
                        )}"
                        type="button">

                        View

                    </button>

                </td>

            `;


            tableBody.appendChild(
                row
            );

        });

    }


    const totalPages =
        Math.max(
            1,
            Math.ceil(
                total /
                salesPerPage
            )
        );


    if (
        currentPage >
        totalPages
    ) {

        currentPage =
            totalPages;

    }


    document.getElementById(
        "currentPage"
    ).textContent =
        currentPage;


    document.getElementById(
        "paginationInfo"
    ).textContent = total

        ? `Showing ${
            (currentPage - 1) *
            salesPerPage +
            1
        }-${
            Math.min(
                currentPage *
                salesPerPage,
                total
            )
        } of ${total} transactions`

        : "Showing 0 of 0 transactions";


    document.getElementById(
        "previousPage"
    ).disabled =
        currentPage <= 1;


    document.getElementById(
        "nextPage"
    ).disabled =
        currentPage >= totalPages;


    updateSummary();

    renderBreakdown();

}


/* =========================================================
   UPDATE SUMMARY
========================================================= */

function updateSummary() {

    /*
       IMPORTANT:

       Summary now uses filteredSales
       so the cards match the selected
       date filter.
    */

    const completed =
        filteredSales.filter(
            s =>
                !s.status ||
                s.status
                    .toLowerCase() ===
                "completed"
        );


    const total =
        completed.reduce(
            (sum, s) =>
                sum +
                (
                    Number(s.total) ||
                    0
                ),
            0
        );


    const count =
        completed.length;


    const average =
        count
            ? total / count
            : 0;


    const selectedFilter =
        dateFilter.value;


    const selectedSpecificDate =
        specificDateFilter.value;


    document.getElementById(
        "totalSales"
    ).textContent =
        money(total);


    document.getElementById(
        "totalTransactions"
    ).textContent =
        count;


    document.getElementById(
        "averageTransaction"
    ).textContent =
        money(average);


    document.getElementById(
        "todaySales"
    ).textContent =
        money(total);


    document.getElementById(
        "totalSalesNote"
    ).textContent =
        `${getDateFilterLabel(
            selectedFilter,
            selectedSpecificDate
        )} sales`;


    document.getElementById(
        "todaySalesNote"
    ).textContent =
        getDateFilterLabel(
            selectedFilter,
            selectedSpecificDate
        );

}


/* =========================================================
   BREAKDOWN
========================================================= */

function renderBreakdown() {

    breakdownGrid.innerHTML = "";


    const breakdown = {

        Cash: {
            total: 0,
            transactions: 0,
            icon: "C",
            className: "cash"
        },

        GCash: {
            total: 0,
            transactions: 0,
            icon: "G",
            className: "gcash"
        },

        BDO: {
            total: 0,
            transactions: 0,
            icon: "B",
            className: "bdo"
        },

        BIBO: {
            total: 0,
            transactions: 0,
            icon: "B",
            className: "bibo"
        },

        BPI: {
            total: 0,
            transactions: 0,
            icon: "B",
            className: "bpi"
        }

    };


    /*
       IMPORTANT:

       Use filteredSales instead of
       every sale so breakdown follows
       the selected date.
    */

    filteredSales.forEach(
        sale => {

            const amounts =
                getPaymentAmounts(
                    sale
                );

            const transactions =
                getPaymentTransactions(
                    sale
                );


            [
                "Cash",
                "GCash",
                "BDO",
                "BIBO",
                "BPI"

            ].forEach(method => {

                const amount =
                    Number(
                        amounts[method]
                    ) || 0;


                if (amount > 0) {

                    breakdown[
                        method
                    ].total +=
                        amount;


                    breakdown[
                        method
                    ].transactions +=
                        transactions[
                            method
                        ];

                }

            });

        }
    );


    const methods = [

        {
            name: "Cash",
            icon: "C",
            className: "cash"
        },

        {
            name: "GCash",
            icon: "G",
            className: "gcash"
        },

        {
            name: "BDO",
            icon: "B",
            className: "bdo"
        },

        {
            name: "BIBO",
            icon: "B",
            className: "bibo"
        },

        {
            name: "BPI",
            icon: "B",
            className: "bpi"
        }

    ];


    methods.forEach(
        method => {

            const data =
                breakdown[
                    method.name
                ];


            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "breakdown-card";


            card.innerHTML = `

                <div
                    class="breakdown-icon ${method.className}">

                    ${method.icon}

                </div>


                <div class="breakdown-information">

                    <span>
                        ${method.name}
                    </span>

                    <strong>
                        ${money(
                            data.total
                        )}
                    </strong>

                    <small>
                        ${
                            data.transactions
                        }
                        transaction(s)
                    </small>

                </div>

            `;


            breakdownGrid.appendChild(
                card
            );

        }
    );


    const description =
        document.getElementById(
            "breakdownDescription"
        );


    description.textContent =
        `Sales breakdown for ${
            getDateFilterLabel(
                dateFilter.value,
                specificDateFilter.value
            )
        }.`;

}


/* =========================================================
   TRANSACTION DETAILS
========================================================= */

function openTransaction(id) {

    const sale =
        sales.find(
            item =>
                item.firestoreId === id
        );


    if (!sale) {
        return;
    }


    selectedSale =
        sale;


    document.getElementById(
        "detailTransaction"
    ).textContent =
        sale.id;


    document.getElementById(
        "detailStatus"
    ).textContent =
        sale.status || "—";


    document.getElementById(
        "detailDate"
    ).textContent =
        formatDate(
            sale.date
        );


    document.getElementById(
        "detailCustomer"
    ).textContent =
        sale.customer ||
        "Walk-in Customer";


    document.getElementById(
        "detailCashier"
    ).textContent =
        sale.cashier ||
        "—";


    document.getElementById(
        "detailPayment"
    ).textContent =
        sale.payment ||
        "—";


    document.getElementById(
        "detailSubtotal"
    ).textContent =
        money(
            sale.subtotal
        );


    document.getElementById(
        "detailDiscount"
    ).textContent =
        sale.discount > 0
            ? `-${money(
                sale.discount
            )}`
            : money(0);


    document.getElementById(
        "detailTotal"
    ).textContent =
        money(
            sale.total
        );


    document.getElementById(
        "detailCash"
    ).textContent =
        money(
            sale.cash
        );


    document.getElementById(
        "detailChange"
    ).textContent =
        money(
            sale.change
        );


    const detailPayment =
        document.getElementById(
            "detailPayment"
        );


    if (
        sale.payment === "Split"
    ) {

        const amounts =
            getPaymentAmounts(
                sale
            );


        const splitText = [

            amounts.Cash > 0
                ? `Cash ${money(
                    amounts.Cash
                )}`
                : "",

            amounts.GCash > 0
                ? `GCash ${money(
                    amounts.GCash
                )}`
                : "",

            amounts.BDO > 0
                ? `BDO ${money(
                    amounts.BDO
                )}`
                : "",

            amounts.BIBO > 0
                ? `BIBO ${money(
                    amounts.BIBO
                )}`
                : "",

            amounts.BPI > 0
                ? `BPI ${money(
                    amounts.BPI
                )}`
                : ""

        ]
        .filter(Boolean)
        .join(" + ");


        detailPayment.textContent =
            splitText ||
            "Split";

    }


    const items =
        document.getElementById(
            "detailItems"
        );


    items.innerHTML = "";


    if (!sale.items.length) {

        items.innerHTML =
            `
            <div class="detail-empty">
                No item details stored for this transaction.
            </div>
            `;

    } else {

        sale.items.forEach(
            item => {

                const div =
                    document.createElement(
                        "div"
                    );


                div.className =
                    "detail-item";


                div.innerHTML = `

                    <div>

                        <div class="detail-item-name">
                            ${escapeHTML(
                                item.name ||
                                "Product"
                            )}
                        </div>

                        <div class="detail-item-qty">
                            ${item.quantity}
                            ×
                            ${money(
                                item.price
                            )}
                        </div>

                    </div>

                    <div class="detail-item-total">
                        ${money(
                            item.total
                        )}
                    </div>

                `;


                items.appendChild(
                    div
                );

            }
        );

    }


    transactionModal.classList.add(
        "show"
    );

}


/* =========================================================
   EXPORT FILTER
========================================================= */

function getExportSales() {

    const filter =
        exportDateFilter.value;


    /*
       Current table filter
    */

    if (
        filter === "filtered"
    ) {

        return [
            ...filteredSales
        ];

    }


    const specific =
        exportSpecificDate.value;


    /*
       Specific date must be
       selected.
    */

    if (
        filter === "specific" &&
        !specific
    ) {

        alert(
            "Please select a specific date."
        );

        return null;

    }


    /*
       Export according to
       selected export period.
    */

    return sales.filter(
        sale => {

            return isDateMatch(
                dateValue(
                    sale.date
                ),
                filter,
                specific
            );

        }
    );

}


/* =========================================================
   UPDATE EXPORT PREVIEW
========================================================= */

function updateExportPreview() {

    const selected =
        exportDateFilter.value;


    exportSpecificDateWrapper.style.display =
        selected === "specific"
            ? "block"
            : "none";


    const exportSales =
        getExportSales();


    document.getElementById(
        "exportCount"
    ).textContent =
        exportSales
            ? exportSales.length
            : 0;

}


/* =========================================================
   OPEN EXPORT MODAL
========================================================= */

function openExportModal() {

    exportDateFilter.value =
        "filtered";


    exportSpecificDate.value =
        specificDateFilter.value ||
        formatDateInput(
            new Date()
        );


    updateExportPreview();


    exportModal.classList.add(
        "show"
    );

}


/* =========================================================
   CLOSE EXPORT MODAL
========================================================= */

function closeExportModal() {

    exportModal.classList.remove(
        "show"
    );

}


/* =========================================================
   ACTUAL CSV EXPORT
========================================================= */

function exportSalesCSV() {

    const exportData =
        getExportSales();


    if (!exportData) {
        return;
    }


    if (!exportData.length) {

        alert(
            "There are no sales for the selected export period."
        );

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


    const rows =
        exportData.map(
            sale => [

                sale.id,

                formatDate(
                    sale.date
                ),

                sale.customer ||
                "Walk-in Customer",

                getItemCount(
                    sale
                ),

                sale.payment,

                sale.subtotal,

                sale.discount,

                sale.total,

                sale.cashier,

                sale.status

            ]
        );


    const csv =
        [
            headers,
            ...rows
        ]
        .map(
            row =>
                row
                    .map(
                        value =>
                            `"${String(
                                value ?? ""
                            )
                            .replaceAll(
                                '"',
                                '""'
                            )}"`
                    )
                    .join(",")
        )
        .join("\n");


    const blob =
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8;"
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


    const filter =
        exportDateFilter.value;


    let fileSuffix =
        "sales";


    if (
        filter === "today"
    ) {

        fileSuffix =
            "sales-today";

    } else if (
        filter === "yesterday"
    ) {

        fileSuffix =
            "sales-yesterday";

    } else if (
        filter === "week"
    ) {

        fileSuffix =
            "sales-this-week";

    } else if (
        filter === "month"
    ) {

        fileSuffix =
            "sales-this-month";

    } else if (
        filter === "specific"
    ) {

        fileSuffix =
            `sales-${exportSpecificDate.value}`;

    } else if (
        filter === "filtered"
    ) {

        fileSuffix =
            "sales-filtered";

    }


    link.download =
        `${fileSuffix}.csv`;


    document.body.appendChild(
        link
    );

    link.click();

    link.remove();


    URL.revokeObjectURL(
        url
    );


    closeExportModal();

}


/* =========================================================
   TABLE VIEW BUTTON
========================================================= */

tableBody.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                ".view-btn"
            );


        if (!button) {
            return;
        }


        openTransaction(
            button.dataset.id
        );

    }
);


/* =========================================================
   TRANSACTION MODAL
========================================================= */

document
    .getElementById(
        "closeTransactionModal"
    )
    .addEventListener(
        "click",
        () => {

            transactionModal.classList.remove(
                "show"
            );

        }
    );


document
    .getElementById(
        "closeDetailButton"
    )
    .addEventListener(
        "click",
        () => {

            transactionModal.classList.remove(
                "show"
            );

        }
    );


transactionModal.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            transactionModal
        ) {

            transactionModal.classList.remove(
                "show"
            );

        }

    }
);


/* =========================================================
   SEARCH / FILTER EVENTS
========================================================= */

document
    .getElementById(
        "salesSearch"
    )
    .addEventListener(
        "input",
        filterSales
    );


dateFilter.addEventListener(
    "change",
    () => {

        /*
           Show/hide specific date
        */

        specificDateFilter.style.display =
            dateFilter.value ===
            "specific"
                ? "block"
                : "none";


        /*
           If specific date is
           selected, default to
           today's date.
        */

        if (
            dateFilter.value ===
            "specific" &&
            !specificDateFilter.value
        ) {

            specificDateFilter.value =
                formatDateInput(
                    new Date()
                );

        }


        filterSales();

    }
);


specificDateFilter.addEventListener(
    "change",
    filterSales
);


paymentFilter.addEventListener(
    "change",
    filterSales
);


statusFilter.addEventListener(
    "change",
    filterSales
);


/* =========================================================
   RESET FILTERS
========================================================= */

document
    .getElementById(
        "resetFilters"
    )
    .addEventListener(
        "click",
        () => {

            document.getElementById(
                "salesSearch"
            ).value = "";


            dateFilter.value =
                "all";


            specificDateFilter.value =
                "";


            specificDateFilter.style.display =
                "none";


            paymentFilter.value =
                "all";


            statusFilter.value =
                "all";


            filterSales();

        }
    );


/* =========================================================
   GLOBAL SEARCH
========================================================= */

document
    .getElementById(
        "globalSearch"
    )
    .addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                document.getElementById(
                    "salesSearch"
                ).value =
                    event.currentTarget.value;


                filterSales();

            }

        }
    );


/* =========================================================
   PAGINATION
========================================================= */

document
    .getElementById(
        "previousPage"
    )
    .addEventListener(
        "click",
        () => {

            if (
                currentPage > 1
            ) {

                currentPage--;

                render();

            }

        }
    );


document
    .getElementById(
        "nextPage"
    )
    .addEventListener(
        "click",
        () => {

            const totalPages =
                Math.max(
                    1,
                    Math.ceil(
                        filteredSales.length /
                        salesPerPage
                    )
                );


            if (
                currentPage <
                totalPages
            ) {

                currentPage++;

                render();

            }

        }
    );


/* =========================================================
   EXPORT EVENTS
========================================================= */

document
    .getElementById(
        "exportSales"
    )
    .addEventListener(
        "click",
        openExportModal
    );


document
    .getElementById(
        "closeExportModal"
    )
    .addEventListener(
        "click",
        closeExportModal
    );


document
    .getElementById(
        "cancelExport"
    )
    .addEventListener(
        "click",
        closeExportModal
    );


exportDateFilter.addEventListener(
    "change",
    updateExportPreview
);


exportSpecificDate.addEventListener(
    "change",
    updateExportPreview
);


document
    .getElementById(
        "confirmExport"
    )
    .addEventListener(
        "click",
        exportSalesCSV
);


exportModal.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            exportModal
        ) {

            closeExportModal();

        }

    }
);


/* =========================================================
   PRINT RECEIPT
========================================================= */

document
    .getElementById(
        "printTransaction"
    )
    .addEventListener(
        "click",
        () => {

            if (!selectedSale) {
                return;
            }


            const sale =
                selectedSale;


            const itemRows =
                sale.items
                    .map(
                        item => `

                        <tr>

                            <td>
                                ${escapeHTML(
                                    item.name
                                )}
                            </td>

                            <td>
                                ${item.quantity}
                            </td>

                            <td>
                                ${money(
                                    item.price
                                )}
                            </td>

                            <td>
                                ${money(
                                    item.total
                                )}
                            </td>

                        </tr>

                    `
                    )
                    .join("");


            const paymentAmounts =
                getPaymentAmounts(
                    sale
                );


            let paymentDetails =
                "";


            if (
                paymentAmounts.Cash >
                0
            ) {

                paymentDetails += `
                    <div>
                        <span>Cash</span>
                        <strong>
                            ${money(
                                paymentAmounts.Cash
                            )}
                        </strong>
                    </div>
                `;

            }


            if (
                paymentAmounts.GCash >
                0
            ) {

                paymentDetails += `
                    <div>
                        <span>GCash</span>
                        <strong>
                            ${money(
                                paymentAmounts.GCash
                            )}
                        </strong>
                    </div>
                `;

            }


            if (
                paymentAmounts.BDO >
                0
            ) {

                paymentDetails += `
                    <div>
                        <span>BDO</span>
                        <strong>
                            ${money(
                                paymentAmounts.BDO
                            )}
                        </strong>
                    </div>
                `;

            }


            if (
                paymentAmounts.BIBO >
                0
            ) {

                paymentDetails += `
                    <div>
                        <span>BIBO</span>
                        <strong>
                            ${money(
                                paymentAmounts.BIBO
                            )}
                        </strong>
                    </div>
                `;

            }


            if (
                paymentAmounts.BPI >
                0
            ) {

                paymentDetails += `
                    <div>
                        <span>BPI</span>
                        <strong>
                            ${money(
                                paymentAmounts.BPI
                            )}
                        </strong>
                    </div>
                `;

            }


            if (!paymentDetails) {

                paymentDetails = `
                    <div>
                        <span>Payment</span>
                        <strong>
                            ${escapeHTML(
                                sale.payment ||
                                "—"
                            )}
                        </strong>
                    </div>
                `;

            }


            const printWindow =
                window.open(
                    "",
                    "_blank",
                    "width=500,height=700"
                );


            if (!printWindow) {

                alert(
                    "Please allow pop-ups to print the receipt."
                );

                return;

            }


            printWindow.document.write(`

                <!DOCTYPE html>

                <html>

                <head>

                    <title>
                        ${escapeHTML(
                            sale.id
                        )}
                    </title>

                    <style>

                        body{
                            font-family:Arial,sans-serif;
                            width:420px;
                            margin:30px auto;
                            font-size:12px;
                            color:#222
                        }

                        h2{
                            text-align:center;
                            margin:0
                        }

                        p{
                            text-align:center;
                            color:#666
                        }

                        hr{
                            border:0;
                            border-top:1px dashed #888;
                            margin:15px 0
                        }

                        .info div,
                        .totals div{
                            display:flex;
                            justify-content:space-between;
                            margin:7px 0
                        }

                        table{
                            width:100%;
                            border-collapse:collapse;
                            margin-top:10px
                        }

                        th,
                        td{
                            text-align:left;
                            padding:6px 3px;
                            border-bottom:1px solid #eee
                        }

                        th:last-child,
                        td:last-child{
                            text-align:right
                        }

                        .total{
                            font-weight:bold;
                            font-size:14px;
                            border-top:1px solid #222;
                            padding-top:8px
                        }

                        .discount{
                            color:#d74343
                        }

                        .thanks{
                            text-align:center;
                            margin-top:20px
                        }

                    </style>

                </head>

                <body>

                    <h2>
                        StockMaster
                    </h2>

                    <p>
                        Sales Receipt
                    </p>

                    <hr>


                    <div class="info">

                        <div>
                            <span>Transaction</span>
                            <strong>
                                ${escapeHTML(
                                    sale.id
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>Date</span>
                            <strong>
                                ${escapeHTML(
                                    formatDate(
                                        sale.date
                                    )
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>Customer</span>
                            <strong>
                                ${escapeHTML(
                                    sale.customer ||
                                    "Walk-in Customer"
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>Cashier</span>
                            <strong>
                                ${escapeHTML(
                                    sale.cashier ||
                                    "—"
                                )}
                            </strong>
                        </div>

                    </div>


                    <hr>


                    <table>

                        <thead>

                            <tr>

                                <th>
                                    Item
                                </th>

                                <th>
                                    Qty
                                </th>

                                <th>
                                    Price
                                </th>

                                <th>
                                    Total
                                </th>

                            </tr>

                        </thead>

                        <tbody>

                            ${itemRows}

                        </tbody>

                    </table>


                    <hr>


                    <div class="totals">

                        <div>
                            <span>
                                Subtotal
                            </span>

                            <strong>
                                ${money(
                                    sale.subtotal
                                )}
                            </strong>
                        </div>


                        <div class="discount">

                            <span>
                                Discount
                            </span>

                            <strong>
                                -${money(
                                    sale.discount
                                )}
                            </strong>

                        </div>


                        <div class="total">

                            <span>
                                Total
                            </span>

                            <strong>
                                ${money(
                                    sale.total
                                )}
                            </strong>

                        </div>


                        ${paymentDetails}


                        <div>

                            <span>
                                Cash Received
                            </span>

                            <strong>
                                ${money(
                                    sale.cash
                                )}
                            </strong>

                        </div>


                        <div>

                            <span>
                                Change
                            </span>

                            <strong>
                                ${money(
                                    sale.change
                                )}
                            </strong>

                        </div>

                    </div>


                    <hr>


                    <div class="thanks">
                        Thank you for your purchase.
                    </div>


                    <script>

                        window.onload =
                            function(){

                                window.print();

                            };

                    <\/script>

                </body>

                </html>

            `);


            printWindow.document.close();

        }
    );


/* =========================================================
   AUTH
========================================================= */

onAuthStateChanged(
    auth,
    async user => {

        currentUser =
            user;


        await loadUserProfile(
            user
        );


        if (!user) {

            if (
                unsubscribeSales
            ) {

                unsubscribeSales();

                unsubscribeSales =
                    null;

            }


            sales = [];

            filteredSales = [];


            render();


            emptyState.classList.add(
                "show"
            );


            emptyTitle.textContent =
                "Sign in required";


            emptyMessage.textContent =
                "Please sign in to view sales from Firebase.";

            return;

        }


        startSalesListener();

    }
);


/* =========================================================
   INITIAL DATE UI
========================================================= */

specificDateFilter.style.display =
    "none";

exportSpecificDateWrapper.style.display =
    "none";


/* =========================================================
   LOAD SIDEBAR
========================================================= */

loadSidebar();