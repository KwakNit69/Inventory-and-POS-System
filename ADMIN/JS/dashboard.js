import { db } from "../../Firebase/firebase-config.js";

import {
    collection,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* =========================================================
   CONFIGURATION
   ========================================================= */

const PAYMENT_METHODS = [
    "Cash",
    "GCash",
    "BDO",
    "BIBO",
    "BPI"
];

const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];

let salesData = [];
let cashflowData = [];

let selectedPeriod = "today";

let customStartDate = null;
let customEndDate = null;

let cashFlowChart = null;
let monthlyEndingChart = null;
let monthlyCashInChart = null;
let monthlyCashOutChart = null;

let reportYear = new Date().getFullYear();

let unsubscribeSales = null;
let unsubscribeCashFlow = null;


/* =========================================================
   HELPERS
   ========================================================= */

const el = id => document.getElementById(id);


const money = value => {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(Number(value) || 0);
};


const getNumber = value => {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : 0;
};


/* =========================================================
   DATE HANDLING
   ========================================================= */

function getDate(value) {

    if (!value) {
        return null;
    }

    if (
        value &&
        typeof value.toDate === "function"
    ) {
        return value.toDate();
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "number") {

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }

    if (typeof value === "string") {

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }

    return null;
}


/* =========================================================
   SALE DATE
   ========================================================= */

function getSaleDate(data) {

    return (
        getDate(data.createdAt) ||
        getDate(data.created_at) ||
        getDate(data.date) ||
        getDate(data.saleDate) ||
        getDate(data.transactionDate) ||
        getDate(data.timestamp) ||
        getDate(data.updatedAt)
    );
}


/* =========================================================
   CASH FLOW DATE
   ========================================================= */

function getFlowDate(data) {

    return (
        getDate(data.createdAt) ||
        getDate(data.created_at) ||
        getDate(data.date) ||
        getDate(data.transactionDate) ||
        getDate(data.timestamp) ||
        getDate(data.updatedAt)
    );
}


/* =========================================================
   SALE TOTAL
   ========================================================= */

function getSaleTotal(data) {

    const fields = [
        "total",
        "grandTotal",
        "amount",
        "totalAmount",
        "saleTotal",
        "netTotal"
    ];

    for (const field of fields) {

        const number = Number(data[field]);

        if (Number.isFinite(number)) {
            return number;
        }
    }

    return 0;
}


/* =========================================================
   CASH FLOW AMOUNT
   ========================================================= */

function getFlowAmount(data) {

    const fields = [
        "amount",
        "total",
        "value",
        "cashAmount",
        "cashInAmount",
        "cashOutAmount"
    ];

    for (const field of fields) {

        const number = Number(data[field]);

        if (Number.isFinite(number)) {
            return number;
        }
    }

    return 0;
}


/* =========================================================
   PAYMENT METHOD NORMALIZATION
   ========================================================= */

function normalizePayment(value) {

    const method = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]/g, " ");

    if (
        method === "cash" ||
        method === "cash on hand" ||
        method === "physical cash"
    ) {
        return "Cash";
    }

    if (
        method === "gcash" ||
        method === "g cash"
    ) {
        return "GCash";
    }

    if (
        method === "bdo" ||
        method.includes("bdo")
    ) {
        return "BDO";
    }

    if (
        method === "bibo" ||
        method.includes("bibo")
    ) {
        return "BIBO";
    }

    if (
        method === "bpi" ||
        method.includes("bpi")
    ) {
        return "BPI";
    }

    return "";
}


/* =========================================================
   CASH FLOW PAYMENT METHOD
   ========================================================= */

function getFlowPaymentMethod(data) {

    const possibleAccounts = [
        data.account,
        data.sourceAccount,
        data.fromAccount,
        data.toAccount,
        data.fundAccount,
        data.paymentMethod,
        data.payment,
        data.method,
        data.channel
    ];

    for (const value of possibleAccounts) {

        const account =
            normalizePayment(value);

        if (account) {
            return account;
        }
    }

    return "";
}


/* =========================================================
   PAYMENT BREAKDOWN
   ========================================================= */

function getPaymentBreakdown(data) {

    const result = {
        Cash: 0,
        GCash: 0,
        BDO: 0,
        BIBO: 0,
        BPI: 0
    };


    /* =====================================================
       1. PAYMENT BREAKDOWN
       ===================================================== */

    if (
        data.paymentBreakdown &&
        typeof data.paymentBreakdown === "object"
    ) {

        let hasValue = false;

        PAYMENT_METHODS.forEach(method => {

            const value =
                getNumber(
                    data.paymentBreakdown[method]
                );

            if (value > 0) {
                hasValue = true;
            }

            result[method] = value;
        });

        if (hasValue) {
            return result;
        }
    }


    /* =====================================================
       2. PAYMENT DETAILS
       ===================================================== */

    if (
        data.paymentDetails &&
        typeof data.paymentDetails === "object"
    ) {

        let hasValue = false;

        PAYMENT_METHODS.forEach(method => {

            const value =
                getNumber(
                    data.paymentDetails[method]
                );

            if (value > 0) {
                hasValue = true;
            }

            result[method] = value;
        });

        if (hasValue) {
            return result;
        }
    }


    /* =====================================================
       3. SPLIT PAYMENTS ARRAY
       ===================================================== */

    if (Array.isArray(data.splitPayments)) {

        let hasValue = false;

        data.splitPayments.forEach(item => {

            const method =
                normalizePayment(
                    item.method ||
                    item.paymentMethod ||
                    item.type ||
                    item.name
                );

            const amount =
                getNumber(
                    item.amount ||
                    item.value ||
                    item.paymentAmount
                );

            if (
                method &&
                amount > 0
            ) {

                result[method] += amount;

                hasValue = true;
            }
        });

        if (hasValue) {
            return result;
        }
    }


    /* =====================================================
       4. PAYMENTS ARRAY
       ===================================================== */

    if (Array.isArray(data.payments)) {

        let hasValue = false;

        data.payments.forEach(item => {

            const method =
                normalizePayment(
                    item.method ||
                    item.paymentMethod ||
                    item.type ||
                    item.name
                );

            const amount =
                getNumber(
                    item.amount ||
                    item.value ||
                    item.paymentAmount
                );

            if (
                method &&
                amount > 0
            ) {

                result[method] += amount;

                hasValue = true;
            }
        });

        if (hasValue) {
            return result;
        }
    }


    /* =====================================================
       5. NORMAL PAYMENT METHOD
       ===================================================== */

    const normalMethod =
        normalizePayment(
            data.paymentMethod ||
            data.payment ||
            data.method
        );

    if (normalMethod) {

        result[normalMethod] =
            getSaleTotal(data);

        return result;
    }


    /* =====================================================
       6. DIRECT CASH
       ===================================================== */

    const cashAmount =
        getNumber(data.cashAmount) ||
        getNumber(data.cashReceived);

    if (cashAmount > 0) {

        /*
         * IMPORTANT:
         * cashReceived can be larger than the sale total
         * because the cashier may receive change.
         *
         * The actual cash retained by the business is
         * the sale total, not the amount handed over.
         */
        result.Cash =
            Math.min(
                cashAmount,
                getSaleTotal(data)
            );

        return result;
    }


    /* =====================================================
       7. DIRECT GCASH
       ===================================================== */

    const gcashAmount =
        getNumber(data.gcashAmount) ||
        getNumber(data.gcash);

    if (gcashAmount > 0) {

        result.GCash =
            Math.min(
                gcashAmount,
                getSaleTotal(data)
            );

        return result;
    }


    /* =====================================================
       8. DIRECT BDO
       ===================================================== */

    const bdoAmount =
        getNumber(data.bdoAmount) ||
        getNumber(data.bdo);

    if (bdoAmount > 0) {

        result.BDO =
            Math.min(
                bdoAmount,
                getSaleTotal(data)
            );

        return result;
    }


    /* =====================================================
       9. DIRECT BIBO
       ===================================================== */

    const biboAmount =
        getNumber(data.biboAmount) ||
        getNumber(data.bibo);

    if (biboAmount > 0) {

        result.BIBO =
            Math.min(
                biboAmount,
                getSaleTotal(data)
            );

        return result;
    }


    /* =====================================================
       10. DIRECT BPI
       ===================================================== */

    const bpiAmount =
        getNumber(data.bpiAmount) ||
        getNumber(data.bpi);

    if (bpiAmount > 0) {

        result.BPI =
            Math.min(
                bpiAmount,
                getSaleTotal(data)
            );

        return result;
    }


    return result;
}


/* =========================================================
   CASH SALES
   ========================================================= */

function getCashSale(data) {

    return getPaymentBreakdown(data).Cash;
}


/* =========================================================
   SALE STATUS
   ========================================================= */

function isCompleted(data) {

    if (
        data.status === undefined ||
        data.status === null ||
        data.status === ""
    ) {
        return true;
    }

    const status =
        String(data.status)
            .trim()
            .toLowerCase();

    return [
        "completed",
        "complete",
        "paid",
        "success",
        "successful",
        "settled"
    ].includes(status);
}


/* =========================================================
   FLOW TYPE
   ========================================================= */

function flowType(data) {

    return String(
        data.type ||
        data.transactionType ||
        data.flowType ||
        ""
    )
        .trim()
        .toLowerCase()
        .replace(/[_-]/g, " ");
}


/* =========================================================
   SALE FLOW
   ========================================================= */

function isSaleFlow(data) {

    const type =
        flowType(data);

    const category =
        String(
            data.category ||
            data.cashFlowCategory ||
            ""
        )
            .trim()
            .toLowerCase()
            .replace(/[_-]/g, " ");

    const description =
        String(
            data.description ||
            data.details ||
            data.note ||
            data.notes ||
            data.reason ||
            ""
        )
            .trim()
            .toLowerCase();

    const source =
        String(
            data.source ||
            data.origin ||
            data.sourceType ||
            ""
        )
            .trim()
            .toLowerCase();


    if (
        [
            "sale",
            "sales",
            "pos sale",
            "pos sales"
        ].includes(type)
    ) {
        return true;
    }


    if (
        [
            "sale",
            "sales",
            "pos sale",
            "pos sales"
        ].includes(category)
    ) {
        return true;
    }


    if (
        description.includes("pos sale") ||
        description.includes("point of sale")
    ) {
        return true;
    }


    if (
        source === "pos" ||
        source === "point of sale" ||
        source === "sales"
    ) {
        return true;
    }


    const reference =
        String(
            data.transactionId ||
            data.transactionID ||
            data.saleId ||
            data.saleID ||
            data.reference ||
            data.referenceId ||
            data.refId ||
            ""
        )
            .trim()
            .toLowerCase();

    if (
        reference.startsWith("sale-") ||
        reference.startsWith("sale_") ||
        reference.startsWith("txn-") ||
        reference.startsWith("tx-")
    ) {
        return true;
    }


    return false;
}


/* =========================================================
   CASH OUT
   ========================================================= */

function isCashOut(data) {

    const type =
        flowType(data);

    if (
        [
            "out",
            "cashout",
            "cash out",
            "outflow",
            "expense",
            "withdrawal",
            "purchase",
            "inventory purchase",
            "refund"
        ].includes(type)
    ) {
        return true;
    }

    if (data.cashOut !== undefined) {
        return Boolean(data.cashOut);
    }

    if (data.isCashOut !== undefined) {
        return Boolean(data.isCashOut);
    }

    return false;
}


/* =========================================================
   CASH IN
   ========================================================= */

function isCashIn(data) {

    const type =
        flowType(data);

    if (
        [
            "in",
            "cashin",
            "cash in",
            "inflow",
            "income",
            "other income"
        ].includes(type)
    ) {
        return true;
    }

    if (data.cashIn !== undefined) {
        return Boolean(data.cashIn);
    }

    if (data.isCashIn !== undefined) {
        return Boolean(data.isCashIn);
    }

    return false;
}


/* =========================================================
   OPENING CASH
   ========================================================= */

/*
 * This function supports future opening-cash records.
 *
 * If your cashFlow collection contains a record like:
 *
 * {
 *     type: "opening",
 *     amount: 5000,
 *     account: "Cash"
 * }
 *
 * it will be recognized.
 */

function isOpeningCash(flow) {

    const type =
        flowType(flow);

    const category =
        String(
            flow.category ||
            flow.cashFlowCategory ||
            ""
        )
            .trim()
            .toLowerCase()
            .replace(/[_-]/g, " ");

    return [
        "opening",
        "opening cash",
        "opening balance",
        "opening cash balance"
    ].includes(type)
    ||
    [
        "opening",
        "opening cash",
        "opening balance",
        "opening cash balance"
    ].includes(category);
}


/* =========================================================
   DATE START
   ========================================================= */

function getStart(period) {

    const now =
        new Date();

    const start =
        new Date(now);


    if (period === "today") {

        start.setHours(
            0,
            0,
            0,
            0
        );

        return start;
    }


    if (period === "week") {

        const day =
            now.getDay();

        const difference =
            day === 0
                ? 6
                : day - 1;

        start.setDate(
            now.getDate() -
            difference
        );

        start.setHours(
            0,
            0,
            0,
            0
        );

        return start;
    }


    if (period === "month") {

        start.setDate(1);

        start.setHours(
            0,
            0,
            0,
            0
        );

        return start;
    }


    if (period === "custom") {

        return customStartDate
            ? new Date(customStartDate)
            : null;
    }


    return null;
}


/* =========================================================
   DATE END
   ========================================================= */

function getEnd(period) {

    if (period === "custom") {

        return customEndDate
            ? new Date(customEndDate)
            : new Date();
    }

    return new Date();
}


/* =========================================================
   PERIOD CHECK
   ========================================================= */

function inSelectedPeriod(date) {

    if (!date) {
        return false;
    }

    const start =
        getStart(selectedPeriod);

    const end =
        getEnd(selectedPeriod);

    if (!start) {
        return true;
    }

    return (
        date >= start &&
        date <= end
    );
}


/* =========================================================
   PERIOD SALES
   ========================================================= */

function getPeriodSales() {

    return salesData.filter(item =>
        item._date &&
        inSelectedPeriod(item._date) &&
        isCompleted(item)
    );
}


/* =========================================================
   PERIOD FLOWS
   ========================================================= */

function getPeriodFlows() {

    return cashflowData.filter(item =>
        item._date &&
        inSelectedPeriod(item._date)
    );
}


/* =========================================================
   CURRENT BALANCES
   ========================================================= */

function calculateCurrentBalances() {

    const balances = {
        Cash: 0,
        GCash: 0,
        BDO: 0,
        BIBO: 0,
        BPI: 0
    };


    /* =====================================================
       POS SALES
       ===================================================== */

    salesData.forEach(sale => {

        if (!isCompleted(sale)) {
            return;
        }

        const breakdown =
            getPaymentBreakdown(sale);

        PAYMENT_METHODS.forEach(method => {

            balances[method] +=
                getNumber(
                    breakdown[method]
                );
        });
    });


    /* =====================================================
       MANUAL CASH FLOW
       ===================================================== */

    cashflowData.forEach(flow => {

        /*
         * POS sale cash-flow records are already
         * represented in the sales collection.
         *
         * Therefore do not count them twice.
         */
        if (isSaleFlow(flow)) {
            return;
        }


        /*
         * Opening cash is a starting balance,
         * not a cash-in transaction.
         *
         * If your database contains opening records,
         * they are added here.
         */
        if (isOpeningCash(flow)) {

            const amount =
                getFlowAmount(flow);

            const method =
                getFlowPaymentMethod(flow);

            if (
                method &&
                balances[method] !== undefined
            ) {

                balances[method] +=
                    amount;

            } else {

                balances.Cash +=
                    amount;
            }

            return;
        }


        const amount =
            getFlowAmount(flow);

        if (!amount) {
            return;
        }


        const method =
            getFlowPaymentMethod(flow);


        if (isCashOut(flow)) {

            if (
                method &&
                balances[method] !== undefined
            ) {

                balances[method] -=
                    amount;

            } else {

                balances.Cash -=
                    amount;
            }
        }


        else if (isCashIn(flow)) {

            if (
                method &&
                balances[method] !== undefined
            ) {

                balances[method] +=
                    amount;

            } else {

                balances.Cash +=
                    amount;
            }
        }

    });


    /*
     * IMPORTANT:
     *
     * DO NOT force negative balances to zero.
     *
     * A negative balance is useful because it tells
     * the administrator that the account is overdrawn
     * or that a transaction needs checking.
     */


    return balances;
}


/* =========================================================
   PERIOD ACTIVITY
   ========================================================= */

function calculatePeriodActivity() {

    const sales =
        getPeriodSales();

    const flows =
        getPeriodFlows();


    let salesTotal = 0;

    let cashSales = 0;


    sales.forEach(sale => {

        const total =
            getSaleTotal(sale);

        salesTotal +=
            total;

        cashSales +=
            getCashSale(sale);
    });


    let manualCashIn = 0;

    let cashOut = 0;

    let cashRefunds = 0;


    flows.forEach(flow => {

        if (isSaleFlow(flow)) {
            return;
        }

        if (isOpeningCash(flow)) {
            return;
        }


        const amount =
            getFlowAmount(flow);


        if (isCashOut(flow)) {

            /*
             * Refunds are still cash leaving the business,
             * but we track them separately for reporting.
             */
            if (flowType(flow) === "refund") {

                cashRefunds +=
                    amount;

            }

            cashOut +=
                amount;
        }


        else if (isCashIn(flow)) {

            manualCashIn +=
                amount;
        }

    });


    /*
     * Cash received during selected period.
     *
     * This includes:
     *
     * Cash POS Sales
     * +
     * Manual Cash In
     */

    const cashReceived =
        cashSales +
        manualCashIn;


    /*
     * Net change in physical cash.
     */

    const netCash =
        cashReceived -
        cashOut;


    return {

        sales,

        salesTotal,

        cashSales,

        manualCashIn,

        cashReceived,

        cashIn: cashReceived,

        cashOut,

        cashRefunds,

        netCash,

        net: netCash
    };
}


/* =========================================================
   HISTORICAL CASH BALANCE
   ========================================================= */

function calculateHistoricalCash(beforeDate) {

    let cash = 0;


    /*
     * Previous POS CASH SALES
     */

    salesData.forEach(sale => {

        if (
            !sale._date ||
            sale._date >= beforeDate ||
            !isCompleted(sale)
        ) {
            return;
        }

        cash +=
            getCashSale(sale);
    });


    /*
     * Previous CASH FLOW
     */

    cashflowData.forEach(flow => {

        if (
            !flow._date ||
            flow._date >= beforeDate ||
            isSaleFlow(flow)
        ) {
            return;
        }


        const amount =
            getFlowAmount(flow);

        const account =
            getFlowPaymentMethod(flow);


        /*
         * Only physical Cash is included.
         */

        if (
            account &&
            account !== "Cash"
        ) {
            return;
        }


        if (isOpeningCash(flow)) {

            cash +=
                amount;

            return;
        }


        if (isCashOut(flow)) {

            cash -=
                amount;
        }


        else if (isCashIn(flow)) {

            cash +=
                amount;
        }

    });


    /*
     * Do not hide a negative historical balance.
     */

    return cash;
}


/* =========================================================
   EXPECTED CASH FOR PERIOD
   ========================================================= */

function calculateExpectedCash() {

    const start =
        getStart(selectedPeriod);


    /*
     * If no period is selected,
     * use the current balance.
     */

    if (!start) {

        const balances =
            calculateCurrentBalances();

        return balances.Cash;
    }


    let cash =
        calculateHistoricalCash(start);


    const sales =
        getPeriodSales();

    const flows =
        getPeriodFlows();


    /*
     * CASH SALES DURING PERIOD
     */

    sales.forEach(sale => {

        cash +=
            getCashSale(sale);
    });


    /*
     * CASH FLOW DURING PERIOD
     */

    flows.forEach(flow => {

        if (isSaleFlow(flow)) {
            return;
        }


        if (isOpeningCash(flow)) {

            /*
             * Opening records that occur exactly
             * at the selected period start are treated
             * as an opening balance.
             */

            if (
                flow._date &&
                flow._date.getTime() ===
                start.getTime()
            ) {

                cash +=
                    getFlowAmount(flow);
            }

            return;
        }


        const account =
            getFlowPaymentMethod(flow);


        /*
         * Only physical cash affects physical cash.
         */

        if (
            account &&
            account !== "Cash"
        ) {
            return;
        }


        const amount =
            getFlowAmount(flow);


        if (isCashOut(flow)) {

            cash -=
                amount;
        }


        else if (isCashIn(flow)) {

            cash +=
                amount;
        }

    });


    return cash;
}


/* =========================================================
   UPDATE DASHBOARD
   ========================================================= */

function updateDashboard() {

    const activity =
        calculatePeriodActivity();


    const balances =
        calculateCurrentBalances();


    const totalFunds =
        PAYMENT_METHODS.reduce(
            (sum, method) =>
                sum +
                (balances[method] || 0),
            0
        );


    const expectedCash =
        calculateExpectedCash();


    const currentCash =
        balances.Cash;


    /* =====================================================
       ACCOUNT BALANCES
       ===================================================== */

    if (el("cashBalance")) {

        el("cashBalance").textContent =
            money(currentCash);

        el("cashBalance").classList.toggle(
            "negative-balance",
            currentCash < 0
        );
    }


    if (el("gcashBalance")) {

        el("gcashBalance").textContent =
            money(balances.GCash);

        el("gcashBalance").classList.toggle(
            "negative-balance",
            balances.GCash < 0
        );
    }


    if (el("bdoBalance")) {

        el("bdoBalance").textContent =
            money(balances.BDO);

        el("bdoBalance").classList.toggle(
            "negative-balance",
            balances.BDO < 0
        );
    }


    if (el("biboBalance")) {

        el("biboBalance").textContent =
            money(balances.BIBO);

        el("biboBalance").classList.toggle(
            "negative-balance",
            balances.BIBO < 0
        );
    }


    if (el("bpiBalance")) {

        el("bpiBalance").textContent =
            money(balances.BPI);

        el("bpiBalance").classList.toggle(
            "negative-balance",
            balances.BPI < 0
        );
    }


    if (el("totalFunds")) {

        el("totalFunds").textContent =
            money(totalFunds);
    }


    /* =====================================================
       SALES
       ===================================================== */

    if (el("sales")) {

        el("sales").textContent =
            money(activity.salesTotal);
    }


    if (el("salesNote")) {

        el("salesNote").textContent =
            `${activity.sales.length} Transaction${
                activity.sales.length === 1
                    ? ""
                    : "s"
            }`;
    }


    /* =====================================================
       CASH RECEIVED
       ===================================================== */

    if (el("cashIn")) {

        el("cashIn").textContent =
            money(activity.cashReceived);
    }


    /* =====================================================
       CASH SPENT
       ===================================================== */

    if (el("cashOut")) {

        el("cashOut").textContent =
            money(activity.cashOut);
    }


    /* =====================================================
       NET CASH CHANGE
       ===================================================== */

    if (el("netCash")) {

        el("netCash").textContent =
            `${activity.netCash >= 0 ? "+" : "-"}${money(
                Math.abs(activity.netCash)
            )}`;
    }


    /* =====================================================
       EXPECTED CASH
       ===================================================== */

    if (el("cashOnHand")) {

        el("cashOnHand").textContent =
            money(expectedCash);

        el("cashOnHand").classList.toggle(
            "negative-balance",
            expectedCash < 0
        );
    }


    /*
     * If your HTML has an expectedCash element,
     * populate that too.
     */

    if (el("expectedCash")) {

        el("expectedCash").textContent =
            money(expectedCash);

        el("expectedCash").classList.toggle(
            "negative-balance",
            expectedCash < 0
        );
    }


    /* =====================================================
       OPTIONAL ACTUAL CASH
       ===================================================== */

    /*
     * This is intentionally left blank until you add
     * an actual physical cash-count input.
     */

    if (el("actualCash")) {

        const actualValue =
            Number(
                el("actualCash").dataset.value
            );

        if (Number.isFinite(actualValue)) {

            el("actualCash").textContent =
                money(actualValue);
        }
    }


    /* =====================================================
       VARIANCE
       ===================================================== */

    if (el("cashVariance")) {

        const actualValue =
            Number(
                el("actualCash")?.dataset.value
            );

        if (Number.isFinite(actualValue)) {

            const variance =
                actualValue -
                expectedCash;

            el("cashVariance").textContent =
                `${variance >= 0 ? "+" : "-"}${money(
                    Math.abs(variance)
                )}`;
        }
        else {

            el("cashVariance").textContent =
                "—";
        }
    }


    /* =====================================================
       PERIOD LABEL
       ===================================================== */

    const periodName =
        getPeriodName();


    if (el("cashInNote")) {

        el("cashInNote").textContent =
            `${periodName} • Cash received`;
    }


    if (el("cashOutNote")) {

        el("cashOutNote").textContent =
            `${periodName} • Cash spent`;
    }


    if (el("cashOnHandNote")) {

        el("cashOnHandNote").textContent =
            `${periodName} • Expected physical cash`;
    }


    /* =====================================================
       SUMMARY
       ===================================================== */

    if (el("beginningBalance")) {

        const beginning =
            calculateHistoricalCash(
                getStart(selectedPeriod)
            );

        el("beginningBalance").textContent =
            money(beginning);
    }


    if (el("summaryCashIn")) {

        el("summaryCashIn").textContent =
            `+${money(activity.cashReceived)}`;
    }


    if (el("summaryCashOut")) {

        el("summaryCashOut").textContent =
            `-${money(activity.cashOut)}`;
    }


    if (el("summaryNet")) {

        el("summaryNet").textContent =
            `${activity.netCash >= 0 ? "+" : "-"}${money(
                Math.abs(activity.netCash)
            )}`;
    }


    if (el("endingBalance")) {

        el("endingBalance").textContent =
            money(expectedCash);
    }


    /* =====================================================
       CHART
       ===================================================== */

    renderCashFlowChart(
        activity.sales,
        getPeriodFlows()
    );


    /* =====================================================
       MONTHLY REPORT
       ===================================================== */

    renderMonthlyReport();
}


/* =========================================================
   PERIOD NAME
   ========================================================= */

function getPeriodName() {

    if (selectedPeriod === "today") {
        return "Today";
    }

    if (selectedPeriod === "week") {
        return "This week";
    }

    if (selectedPeriod === "month") {
        return "This month";
    }

    if (
        selectedPeriod === "custom" &&
        customStartDate &&
        customEndDate
    ) {

        const format =
            date =>
                date.toLocaleDateString(
                    "en-PH",
                    {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                    }
                );

        return `${format(customStartDate)} – ${format(customEndDate)}`;
    }

    return "Selected period";
}


/* =========================================================
   CASH FLOW CHART
   ========================================================= */

function renderCashFlowChart(
    sales,
    flows
) {

    if (cashFlowChart) {

        cashFlowChart.destroy();

        cashFlowChart = null;
    }


    const canvas =
        el("cashFlowChart");


    if (!canvas) {
        return;
    }


    const labels = [];

    const cashInValues = [];

    const cashOutValues = [];

    const now =
        new Date();


    /* =====================================================
       TODAY
       ===================================================== */

    if (selectedPeriod === "today") {

        for (
            let hour = 0;
            hour < 24;
            hour++
        ) {

            labels.push(
                `${String(hour).padStart(2, "0")}:00`
            );

            cashInValues.push(0);

            cashOutValues.push(0);
        }


        sales.forEach(sale => {

            const hour =
                sale._date.getHours();

            cashInValues[hour] +=
                getCashSale(sale);
        });


        flows.forEach(flow => {

            if (isSaleFlow(flow)) {
                return;
            }

            if (isOpeningCash(flow)) {
                return;
            }


            const hour =
                flow._date.getHours();


            const amount =
                getFlowAmount(flow);


            if (isCashOut(flow)) {

                cashOutValues[hour] +=
                    amount;
            }


            else if (isCashIn(flow)) {

                const account =
                    getFlowPaymentMethod(flow);

                if (
                    !account ||
                    account === "Cash"
                ) {

                    cashInValues[hour] +=
                        amount;
                }
            }

        });
    }


    /* =====================================================
       WEEK / MONTH / CUSTOM
       ===================================================== */

    else {

        const start =
            getStart(selectedPeriod) ||
            new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate() - 6
            );


        const end =
            getEnd(selectedPeriod);


        const startDay =
            new Date(start);

        startDay.setHours(
            0,
            0,
            0,
            0
        );


        const endDay =
            new Date(end);

        endDay.setHours(
            0,
            0,
            0,
            0
        );


        const count =
            Math.floor(
                (endDay - startDay) /
                86400000
            ) + 1;


        for (
            let i = 0;
            i < count;
            i++
        ) {

            const date =
                new Date(startDay);

            date.setDate(
                startDay.getDate() +
                i
            );


            labels.push(
                date.toLocaleDateString(
                    "en-PH",
                    {
                        month: "short",
                        day: "numeric"
                    }
                )
            );


            cashInValues.push(0);

            cashOutValues.push(0);
        }


        sales.forEach(sale => {

            const date =
                new Date(sale._date);

            date.setHours(
                0,
                0,
                0,
                0
            );


            const index =
                Math.floor(
                    (date - startDay) /
                    86400000
                );


            if (
                index >= 0 &&
                index < count
            ) {

                cashInValues[index] +=
                    getCashSale(sale);
            }
        });


        flows.forEach(flow => {

            if (isSaleFlow(flow)) {
                return;
            }

            if (isOpeningCash(flow)) {
                return;
            }


            const date =
                new Date(flow._date);

            date.setHours(
                0,
                0,
                0,
                0
            );


            const index =
                Math.floor(
                    (date - startDay) /
                    86400000
                );


            if (
                index < 0 ||
                index >= count
            ) {
                return;
            }


            const amount =
                getFlowAmount(flow);


            const account =
                getFlowPaymentMethod(flow);


            if (
                account &&
                account !== "Cash"
            ) {
                return;
            }


            if (isCashOut(flow)) {

                cashOutValues[index] +=
                    amount;
            }


            else if (isCashIn(flow)) {

                cashInValues[index] +=
                    amount;
            }

        });
    }


    const hasData =
        cashInValues.some(
            value => value > 0
        )
        ||
        cashOutValues.some(
            value => value > 0
        );


    if (el("chartEmpty")) {

        el("chartEmpty").style.display =
            hasData
                ? "none"
                : "block";
    }


    if (
        typeof Chart === "undefined"
    ) {

        console.warn(
            "Chart.js is not loaded."
        );

        return;
    }


    cashFlowChart =
        new Chart(
            canvas,
            {

                type: "line",

                data: {

                    labels,

                    datasets: [

                        {
                            label: "Cash In",

                            data:
                                cashInValues,

                            borderColor:
                                "#00a878",

                            backgroundColor:
                                "rgba(0,168,120,.08)",

                            fill: true,

                            tension: 0.35,

                            pointRadius: 2
                        },

                        {
                            label: "Cash Out",

                            data:
                                cashOutValues,

                            borderColor:
                                "#e05252",

                            backgroundColor:
                                "rgba(224,82,82,.04)",

                            fill: false,

                            tension: 0.35,

                            pointRadius: 2
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
                        },

                        tooltip: {

                            callbacks: {

                                label:
                                    context =>
                                        `${context.dataset.label}: ${money(
                                            context.raw
                                        )}`
                            }
                        }
                    },


                    scales: {

                        y: {

                            beginAtZero: true,

                            ticks: {

                                callback:
                                    value =>
                                        money(value)
                            }
                        }
                    }
                }
            }
        );
}


/* =========================================================
   REPORT MONEY
   ========================================================= */

function formatReportMoney(value) {

    const number =
        Number(value) || 0;


    if (number === 0) {
        return "-";
    }


    return new Intl.NumberFormat(
        "en-PH",
        {
            style: "currency",
            currency: "PHP",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    ).format(number);
}


/* =========================================================
   REPORT YEARS
   ========================================================= */

function getReportYears() {

    const years =
        new Set([
            new Date().getFullYear()
        ]);


    salesData.forEach(sale => {

        if (sale._date) {

            years.add(
                sale._date.getFullYear()
            );
        }
    });


    cashflowData.forEach(flow => {

        if (flow._date) {

            years.add(
                flow._date.getFullYear()
            );
        }
    });


    return [...years]
        .sort(
            (a, b) => b - a
        );
}


/* =========================================================
   POPULATE REPORT YEARS
   ========================================================= */

function populateReportYears() {

    const select =
        el("reportYear");


    if (!select) {
        return;
    }


    const years =
        getReportYears();


    if (
        !years.includes(
            Number(reportYear)
        )
    ) {

        reportYear =
            years[0];
    }


    select.innerHTML = "";


    years.forEach(year => {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            year;

        option.textContent =
            year;

        option.selected =
            Number(year) ===
            Number(reportYear);

        select.appendChild(
            option
        );
    });
}


/* =========================================================
   MONTHLY REPORT DATA
   ========================================================= */

function getReportMonthlyData(year) {

    const months =
        Array.from(
            { length: 12 },
            () => ({
                beginning: 0,
                cashIn: 0,
                cashOut: 0,
                ending: 0
            })
        );


    const yearStart =
        new Date(
            year,
            0,
            1,
            0,
            0,
            0,
            0
        );


    let runningCash =
        calculateHistoricalCash(
            yearStart
        );


    for (
        let monthIndex = 0;
        monthIndex < 12;
        monthIndex++
    ) {

        const monthStart =
            new Date(
                year,
                monthIndex,
                1,
                0,
                0,
                0,
                0
            );


        const monthEnd =
            new Date(
                year,
                monthIndex + 1,
                0,
                23,
                59,
                59,
                999
            );


        months[monthIndex]
            .beginning =
            runningCash;


        let cashIn = 0;

        let cashOut = 0;


        /* =================================================
           CASH FROM POS SALES
           ================================================= */

        salesData.forEach(sale => {

            if (
                !sale._date ||
                sale._date < monthStart ||
                sale._date > monthEnd ||
                !isCompleted(sale)
            ) {
                return;
            }


            cashIn +=
                getCashSale(sale);
        });


        /* =================================================
           CASH FLOW RECORDS
           ================================================= */

        cashflowData.forEach(flow => {

            if (
                !flow._date ||
                flow._date < monthStart ||
                flow._date > monthEnd ||
                isSaleFlow(flow) ||
                isOpeningCash(flow)
            ) {
                return;
            }


            const amount =
                getFlowAmount(flow);


            const account =
                getFlowPaymentMethod(flow);


            /*
             * Only physical Cash.
             */

            if (
                account &&
                account !== "Cash"
            ) {
                return;
            }


            if (isCashOut(flow)) {

                cashOut +=
                    amount;
            }


            else if (isCashIn(flow)) {

                cashIn +=
                    amount;
            }

        });


        months[monthIndex]
            .cashIn =
            cashIn;


        months[monthIndex]
            .cashOut =
            cashOut;


        runningCash =
            runningCash +
            cashIn -
            cashOut;


        months[monthIndex]
            .ending =
            runningCash;
    }


    return months;
}


/* =========================================================
   RENDER MONTHLY REPORT
   ========================================================= */

function renderMonthlyReport() {

    populateReportYears();


    const months =
        getReportMonthlyData(
            Number(reportYear)
        );


    months.forEach(
        (month, index) => {

            const beginning =
                el(
                    `reportBeginning-${index}`
                );

            const cashIn =
                el(
                    `reportCashIn-${index}`
                );

            const cashOut =
                el(
                    `reportCashOut-${index}`
                );

            const ending =
                el(
                    `reportEnding-${index}`
                );


            if (beginning) {

                beginning.textContent =
                    formatReportMoney(
                        month.beginning
                    );
            }


            if (cashIn) {

                cashIn.textContent =
                    formatReportMoney(
                        month.cashIn
                    );
            }


            if (cashOut) {

                cashOut.textContent =
                    formatReportMoney(
                        month.cashOut
                    );
            }


            if (ending) {

                ending.textContent =
                    formatReportMoney(
                        month.ending
                    );
            }

        }
    );


    renderMonthlyCharts(
        months
    );
}


/* =========================================================
   MONTHLY CHARTS
   ========================================================= */

function renderMonthlyCharts(
    months
) {

    if (
        typeof Chart === "undefined"
    ) {
        return;
    }


    if (monthlyEndingChart) {

        monthlyEndingChart.destroy();

        monthlyEndingChart = null;
    }


    if (monthlyCashInChart) {

        monthlyCashInChart.destroy();

        monthlyCashInChart = null;
    }


    if (monthlyCashOutChart) {

        monthlyCashOutChart.destroy();

        monthlyCashOutChart = null;
    }


    const labels =
        MONTH_NAMES.map(
            month =>
                month.substring(0, 3)
        );


    const endingValues =
        months.map(
            month => month.ending
        );


    const cashInValues =
        months.map(
            month => month.cashIn
        );


    const cashOutValues =
        months.map(
            month => month.cashOut
        );


    const baseOptions = {

        responsive: true,

        maintainAspectRatio: false,

        plugins: {

            legend: {
                display: false
            },

            tooltip: {

                callbacks: {

                    label:
                        context =>
                            money(context.raw)
                }
            }
        },

        scales: {

            x: {

                ticks: {

                    maxRotation: 55,

                    minRotation: 55,

                    font: {
                        size: 10
                    }
                }
            },

            y: {

                beginAtZero: true,

                ticks: {

                    callback:
                        value =>
                            money(value)
                }
            }
        }
    };


    /* =====================================================
       ENDING BALANCE
       ===================================================== */

    const endingCanvas =
        el("monthlyEndingChart");


    if (endingCanvas) {

        monthlyEndingChart =
            new Chart(
                endingCanvas,
                {

                    type: "line",

                    data: {

                        labels,

                        datasets: [

                            {
                                label:
                                    "Ending Cash Balance",

                                data:
                                    endingValues,

                                borderColor:
                                    "#6f927b",

                                backgroundColor:
                                    "rgba(111,146,123,.45)",

                                fill: true,

                                tension: 0,

                                pointRadius: 0,

                                borderWidth: 1.5
                            }

                        ]
                    },

                    options:
                        baseOptions
                }
            );
    }


    /* =====================================================
       CASH IN
       ===================================================== */

    const cashInCanvas =
        el("monthlyCashInChart");


    if (cashInCanvas) {

        monthlyCashInChart =
            new Chart(
                cashInCanvas,
                {

                    type: "bar",

                    data: {

                        labels,

                        datasets: [

                            {
                                label:
                                    "Cash In / Receipts",

                                data:
                                    cashInValues,

                                backgroundColor:
                                    "#6f927b",

                                borderColor:
                                    "#6f927b",

                                borderWidth: 1
                            }

                        ]
                    },

                    options:
                        baseOptions
                }
            );
    }


    /* =====================================================
       CASH OUT
       ===================================================== */

    const cashOutCanvas =
        el("monthlyCashOutChart");


    if (cashOutCanvas) {

        monthlyCashOutChart =
            new Chart(
                cashOutCanvas,
                {

                    type: "bar",

                    data: {

                        labels,

                        datasets: [

                            {
                                label:
                                    "Cash Out / Payments",

                                data:
                                    cashOutValues,

                                backgroundColor:
                                    "#6f927b",

                                borderColor:
                                    "#6f927b",

                                borderWidth: 1
                            }

                        ]
                    },

                    options:
                        baseOptions
                }
            );
    }
}


/* =========================================================
   PROFILE
   ========================================================= */

function loadProfile() {

    const name =
        sessionStorage.getItem(
            "userName"
        )
        ||
        localStorage.getItem(
            "userName"
        )
        ||
        "Administrator";


    const role =
        sessionStorage.getItem(
            "userRole"
        )
        ||
        "admin";


    if (el("profileName")) {

        el("profileName").textContent =
            name;
    }


    if (el("profileRole")) {

        el("profileRole").textContent =
            role === "staff"
                ? "Staff / Cashier"
                : "Administrator";
    }


    const parts =
        name
            .trim()
            .split(/\s+/);


    if (el("profileAvatar")) {

        el("profileAvatar").textContent =
            parts.length > 1
                ? (
                    parts[0][0] +
                    parts[parts.length - 1][0]
                ).toUpperCase()
                :
                name
                    .substring(0, 2)
                    .toUpperCase();
    }


    const hour =
        new Date().getHours();


    if (el("greeting")) {

        el("greeting").textContent =
            hour < 12
                ? `Good morning, ${name}!`
                : hour < 18
                    ? `Good afternoon, ${name}!`
                    : `Good evening, ${name}!`;
    }
}


/* =========================================================
   SIDEBAR
   ========================================================= */

function loadSidebar() {

    fetch("sidebar.html")

        .then(response => {

            if (!response.ok) {

                throw new Error(
                    "Could not load sidebar.html"
                );
            }

            return response.text();
        })

        .then(html => {

            if (
                el("sidebar-container")
            ) {

                el(
                    "sidebar-container"
                ).innerHTML =
                    html;
            }


            const script =
                document.createElement(
                    "script"
                );


            script.src =
                "sidebar.js";


            document.body.appendChild(
                script
            );
        })

        .catch(error => {

            console.error(
                "Sidebar Error:",
                error
            );
        });
}


/* =========================================================
   CUSTOM DATE FILTER
   ========================================================= */

function formatDateInput(date) {

    const year =
        date.getFullYear();


    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");


    const day =
        String(
            date.getDate()
        ).padStart(2, "0");


    return `${year}-${month}-${day}`;
}


function setDateInputDefaults() {

    const startInput =
        el("startDate");

    const endInput =
        el("endDate");


    if (
        !startInput ||
        !endInput
    ) {
        return;
    }


    const today =
        new Date();


    if (!startInput.value) {

        startInput.value =
            formatDateInput(
                today
            );
    }


    if (!endInput.value) {

        endInput.value =
            formatDateInput(
                today
            );
    }
}


function showCustomDateFilter() {

    const filter =
        el("customDateFilter");


    if (filter) {

        filter.classList.add(
            "show"
        );
    }
}


function hideCustomDateFilter() {

    const filter =
        el("customDateFilter");


    if (filter) {

        filter.classList.remove(
            "show"
        );
    }
}


/* =========================================================
   DATE FILTER BUTTONS
   ========================================================= */

document
    .querySelectorAll(
        ".date-filter button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                document
                    .querySelectorAll(
                        ".date-filter button"
                    )
                    .forEach(item => {

                        item.classList.remove(
                            "active"
                        );
                    });


                button.classList.add(
                    "active"
                );


                selectedPeriod =
                    button.dataset.period;


                if (
                    selectedPeriod ===
                    "custom"
                ) {

                    showCustomDateFilter();

                    setDateInputDefaults();

                    return;
                }


                hideCustomDateFilter();


                customStartDate =
                    null;

                customEndDate =
                    null;


                updateDashboard();
            }
        );

    });


/* =========================================================
   APPLY SPECIFIC DATE
   ========================================================= */

el("applyDateFilter")
    ?.addEventListener(
        "click",
        () => {

            const startInput =
                el("startDate");

            const endInput =
                el("endDate");


            if (
                !startInput?.value ||
                !endInput?.value
            ) {

                alert(
                    "Please select both a start date and an end date."
                );

                return;
            }


            const start =
                new Date(
                    `${startInput.value}T00:00:00`
                );


            const end =
                new Date(
                    `${endInput.value}T23:59:59.999`
                );


            if (
                Number.isNaN(
                    start.getTime()
                )
                ||
                Number.isNaN(
                    end.getTime()
                )
            ) {

                alert(
                    "Please select valid dates."
                );

                return;
            }


            if (start > end) {

                alert(
                    "The start date cannot be later than the end date."
                );

                return;
            }


            customStartDate =
                start;

            customEndDate =
                end;

            selectedPeriod =
                "custom";


            document
                .querySelectorAll(
                    ".date-filter button"
                )
                .forEach(item => {

                    item.classList.remove(
                        "active"
                    );
                });


            document
                .querySelector(
                    '.date-filter button[data-period="custom"]'
                )
                ?.classList.add(
                    "active"
                );


            updateDashboard();
        }
    );


/* =========================================================
   REPORT YEAR
   ========================================================= */

el("reportYear")
    ?.addEventListener(
        "change",
        event => {

            reportYear =
                Number(
                    event.target.value
                );

            renderMonthlyReport();
        }
    );


/* =========================================================
   REFRESH
   ========================================================= */

el("refreshDashboard")
    ?.addEventListener(
        "click",
        loadDashboard
    );


/* =========================================================
   QUICK ACTIONS
   ========================================================= */

el("addProduct")
    ?.addEventListener(
        "click",
        () => {

            window.location.href =
                "products.html";
        }
    );


el("addStock")
    ?.addEventListener(
        "click",
        () => {

            window.location.href =
                "inventory.html";
        }
    );


el("addExpense")
    ?.addEventListener(
        "click",
        () => {

            window.location.href =
                "cash-flow.html";
        }
    );


el("viewSales")
    ?.addEventListener(
        "click",
        () => {

            window.location.href =
                "sales.html";
        }
    );


/* =========================================================
   GLOBAL SEARCH
   ========================================================= */

el("globalSearch")
    ?.addEventListener(
        "keydown",
        event => {

            if (
                event.key !== "Enter"
            ) {
                return;
            }


            const value =
                event.target.value
                    .trim();


            if (value) {

                window.location.href =
                    `products.html?search=${encodeURIComponent(
                        value
                    )}`;
            }
        }
    );


/* =========================================================
   ERROR
   ========================================================= */

function showError(message) {

    const box =
        el("dashboardError");


    if (!box) {
        return;
    }


    box.innerHTML = `
        <strong>Unable to load dashboard</strong>
        <span>${message}</span>
        <br>
        <button id="retryDashboard">Try Again</button>
    `;


    box.classList.add(
        "show"
    );


    el("retryDashboard")
        ?.addEventListener(
            "click",
            loadDashboard
        );
}


function clearError() {

    const box =
        el("dashboardError");


    if (!box) {
        return;
    }


    box.classList.remove(
        "show"
    );


    box.innerHTML = "";
}


/* =========================================================
   LOAD DASHBOARD
   ========================================================= */

function loadDashboard() {

    try {

        clearError();


        /* =================================================
           REMOVE OLD LISTENERS
           ================================================= */

        if (unsubscribeSales) {

            unsubscribeSales();

            unsubscribeSales =
                null;
        }


        if (unsubscribeCashFlow) {

            unsubscribeCashFlow();

            unsubscribeCashFlow =
                null;
        }


        /* =================================================
           SALES REAL-TIME LISTENER
           ================================================= */

        unsubscribeSales =
            onSnapshot(

                collection(
                    db,
                    "sales"
                ),

                snapshot => {

                    salesData =
                        snapshot.docs
                            .map(doc => {

                                const data =
                                    doc.data();


                                return {

                                    ...data,

                                    id:
                                        doc.id,

                                    _date:
                                        getSaleDate(
                                            data
                                        ),

                                    _total:
                                        getSaleTotal(
                                            data
                                        )
                                };
                            })

                            .filter(
                                item =>
                                    item._date
                            );


                    updateDashboard();
                },


                error => {

                    console.error(
                        "Sales Firebase error:",
                        error
                    );


                    showError(
                        error.message ||
                        "Unable to load sales."
                    );
                }
            );


        /* =================================================
           CASH FLOW REAL-TIME LISTENER
           ================================================= */

        unsubscribeCashFlow =
            onSnapshot(

                collection(
                    db,
                    "cashFlow"
                ),

                snapshot => {

                    cashflowData =
                        snapshot.docs
                            .map(doc => {

                                const data =
                                    doc.data();


                                return {

                                    ...data,

                                    id:
                                        doc.id,

                                    _date:
                                        getFlowDate(
                                            data
                                        ),

                                    _amount:
                                        getFlowAmount(
                                            data
                                        )
                                };
                            })

                            .filter(
                                item =>
                                    item._date
                            );


                    updateDashboard();
                },


                error => {

                    console.error(
                        "Cash Flow Firebase error:",
                        error
                    );


                    showError(
                        error.message ||
                        "Unable to load cash flow."
                    );
                }
            );

    }

    catch (error) {

        console.error(
            "Dashboard load error:",
            error
        );


        showError(
            error.message ||
            "Unable to connect to Firebase."
        );
    }
}
loadProfile();
loadSidebar();
setDateInputDefaults();
loadDashboard();