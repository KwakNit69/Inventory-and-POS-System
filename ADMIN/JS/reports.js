import { db } from "../../Firebase/firebase-config.js";

import {
    collection,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


// ============================================================
// ELEMENTS
// ============================================================

const period = document.getElementById("period");
const reset = document.getElementById("reset");
const exportReport = document.getElementById("exportReport");

const salesElement = document.getElementById("sales");
const transactionsElement = document.getElementById("transactions");
const itemsElement = document.getElementById("items");
const averageElement = document.getElementById("average");

const totalCostElement =
    document.getElementById("totalCost");

const grossProfitElement =
    document.getElementById("grossProfit");

const profitMarginElement =
    document.getElementById("profitMargin");

const paymentsElement =
    document.getElementById("payments");

const productsElement =
    document.getElementById("products");

const errorMessage =
    document.getElementById("errorMessage");

const profileName =
    document.getElementById("profileName");

const profileAvatar =
    document.getElementById("profileAvatar");


// ============================================================
// CONSTANTS
// ============================================================

const PAYMENT_METHODS = [
    "Cash",
    "GCash",
    "BDO",
    "BIBO",
    "BPI"
];

let allSales = [];

let chart = null;

let unsubscribeSales = null;


// ============================================================
// MONEY
// ============================================================

function money(value) {

    const number = Number(value);

    return new Intl.NumberFormat(
        "en-PH",
        {
            style: "currency",
            currency: "PHP"
        }
    ).format(
        Number.isFinite(number)
            ? number
            : 0
    );
}


// ============================================================
// NUMBER
// ============================================================

function number(value) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : 0;
}


// ============================================================
// PAYMENT NORMALIZATION
// ============================================================

function normalizePayment(value) {

    const v = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]/g, " ");

    if (!v) {
        return "";
    }

    if (
        v === "cash" ||
        v === "cash on hand" ||
        v === "physical cash"
    ) {
        return "Cash";
    }

    if (
        v === "gcash" ||
        v === "g cash" ||
        v.includes("gcash")
    ) {
        return "GCash";
    }

    if (
        v === "bdo" ||
        v.includes("bdo")
    ) {
        return "BDO";
    }

    if (
        v === "bibo" ||
        v.includes("bibo")
    ) {
        return "BIBO";
    }

    if (
        v === "bpi" ||
        v.includes("bpi")
    ) {
        return "BPI";
    }

    return "";
}


// ============================================================
// FIRESTORE DATE
// ============================================================

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

        if (!value) {
            continue;
        }


        // Firestore Timestamp

        if (
            typeof value.toDate === "function"
        ) {

            const date =
                value.toDate();

            if (
                date instanceof Date &&
                !Number.isNaN(
                    date.getTime()
                )
            ) {

                return date;

            }

        }


        // JavaScript Date

        if (value instanceof Date) {

            if (
                !Number.isNaN(
                    value.getTime()
                )
            ) {

                return value;

            }

        }


        // Firestore timestamp-like object

        if (
            typeof value === "object" &&
            value.seconds !== undefined
        ) {

            const date =
                new Date(
                    Number(value.seconds) * 1000
                );

            if (
                !Number.isNaN(
                    date.getTime()
                )
            ) {

                return date;

            }

        }


        // Number timestamp

        if (
            typeof value === "number"
        ) {

            const date =
                new Date(value);

            if (
                !Number.isNaN(
                    date.getTime()
                )
            ) {

                return date;

            }

        }


        // String date

        if (
            typeof value === "string"
        ) {

            const date =
                new Date(value);

            if (
                !Number.isNaN(
                    date.getTime()
                )
            ) {

                return date;

            }

        }

    }

    return null;
}


// ============================================================
// TOTAL
// ============================================================

function getTotal(data) {

    const values = [

        data.total,
        data.grandTotal,
        data.totalAmount,
        data.saleTotal,
        data.netTotal,
        data.amountPaid,
        data.amount

    ];

    for (const value of values) {

        const n =
            Number(value);

        if (
            Number.isFinite(n) &&
            n >= 0
        ) {

            return n;

        }

    }

    return 0;
}


// ============================================================
// ITEMS
// ============================================================

function getItems(data) {

    const possible = [

        data.items,
        data.cartItems,
        data.lineItems,
        data.products,
        data.saleItems,
        data.packageItems,
        data.insuranceItems

    ];

    for (const value of possible) {

        if (
            Array.isArray(value)
        ) {

            return value;

        }

    }

    return [];
}


// ============================================================
// QUANTITY
// ============================================================

function getQuantity(item) {

    const values = [

        item.quantity,
        item.qty,
        item.count,
        item.units,
        item.stockQuantity

    ];

    for (const value of values) {

        const n =
            Number(value);

        if (
            Number.isFinite(n)
        ) {

            return n;

        }

    }

    return 1;
}


// ============================================================
// ITEM NAME
// ============================================================

function getProductName(item) {

    return (

        item.productName ||

        item.name ||

        item.product ||

        item.title ||

        item.packageName ||

        item.insuranceName ||

        item.serviceName ||

        item.description ||

        "Unknown Product"

    );

}


// ============================================================
// CATEGORY
// ============================================================

function getCategory(item) {

    return (

        item.category ||

        item.categoryName ||

        item.type ||

        item.productType ||

        (
            item.packageName
                ? "Package"
                : ""
        ) ||

        (
            item.insuranceName
                ? "Insurance"
                : ""
        ) ||

        "Uncategorized"

    );

}


// ============================================================
// ITEM PRICE
// ============================================================

function getItemPrice(item) {

    const values = [

        item.price,
        item.sellingPrice,
        item.unitPrice,
        item.salePrice,
        item.amount,
        item.total,
        item.subtotal,
        item.lineTotal

    ];

    for (const value of values) {

        const n =
            Number(value);

        if (
            Number.isFinite(n)
        ) {

            return n;

        }

    }

    return 0;
}


// ============================================================
// ITEM COST
// ============================================================

function getItemCost(item) {

    const values = [

        item.costPrice,
        item.cost,
        item.unitCost,
        item.purchasePrice,
        item.costAmount

    ];

    for (const value of values) {

        const n =
            Number(value);

        if (
            Number.isFinite(n)
        ) {

            return n;

        }

    }

    return 0;
}


// ============================================================
// ITEM PROFIT
// ============================================================

function getItemProfit(item) {

    const quantity =
        getQuantity(item);

    const sellingPrice =
        getItemPrice(item);

    const costPrice =
        getItemCost(item);


    // If POS already saved profit

    const directProfit =
        Number(
            item.profit
        );

    if (
        Number.isFinite(
            directProfit
        )
    ) {

        return directProfit;

    }


    // Otherwise calculate

    return (
        sellingPrice -
        costPrice
    ) * quantity;
}


// ============================================================
// TOTAL COST
// ============================================================

function getTotalCost(data) {

    const direct =
        Number(
            data.totalCost
        );

    if (
        Number.isFinite(direct)
    ) {

        return direct;

    }


    const items =
        getItems(data);

    if (!items.length) {

        return number(
            data.cost ||
            data.costAmount ||
            0
        );

    }


    return items.reduce(

        (sum, item) => {

            return sum +
                (
                    getItemCost(item) *
                    getQuantity(item)
                );

        },

        0

    );

}


// ============================================================
// GROSS PROFIT
// ============================================================

function getGrossProfit(data) {

    const directValues = [

        data.grossProfit,
        data.totalProfit,
        data.profit

    ];

    for (
        const value of directValues
    ) {

        const n =
            Number(value);

        if (
            Number.isFinite(n)
        ) {

            return n;

        }

    }


    const items =
        getItems(data);


    if (!items.length) {

        return (
            getTotal(data) -
            getTotalCost(data)
        );

    }


    return items.reduce(

        (sum, item) => {

            return sum +
                getItemProfit(item);

        },

        0

    );

}


// ============================================================
// COMPLETED SALE
// ============================================================

function isCompleted(data) {

    const possibleStatuses = [

        data.status,
        data.paymentStatus,
        data.saleStatus,
        data.transactionStatus

    ];


    // If there is no status,
    // assume the document is a valid sale.

    const existing =
        possibleStatuses.find(
            value =>
                value !== undefined &&
                value !== null &&
                String(value).trim() !== ""
        );


    if (
        existing === undefined
    ) {

        return true;

    }


    const status =
        String(existing)
            .trim()
            .toLowerCase();


    return [

        "completed",
        "complete",
        "paid",
        "success",
        "successful",
        "settled",
        "sale",
        "sold",
        "approved",
        "closed"

    ].includes(status);

}


// ============================================================
// PAYMENT BREAKDOWN
// ============================================================

function getPaymentBreakdown(data) {

    const result = {

        Cash: 0,
        GCash: 0,
        BDO: 0,
        BIBO: 0,
        BPI: 0

    };


    // --------------------------------------------------------
    // paymentBreakdown
    // --------------------------------------------------------

    if (
        data.paymentBreakdown &&
        typeof data.paymentBreakdown === "object"
    ) {

        PAYMENT_METHODS.forEach(
            method => {

                result[method] +=
                    number(
                        data.paymentBreakdown[
                            method
                        ]
                    );

            }
        );

    }


    // --------------------------------------------------------
    // paymentDetails
    // --------------------------------------------------------

    if (
        data.paymentDetails &&
        typeof data.paymentDetails === "object"
    ) {

        PAYMENT_METHODS.forEach(
            method => {

                // Only use this if
                // paymentBreakdown did not
                // already contain the amount.

                if (
                    result[method] <= 0
                ) {

                    result[method] =
                        number(
                            data.paymentDetails[
                                method
                            ]
                        );

                }

            }
        );

    }


    // --------------------------------------------------------
    // splitPayment
    // --------------------------------------------------------

    const splitPayments =

        data.splitPayments ||
        data.splitPayment ||
        data.tenderBreakdown;


    if (
        Array.isArray(
            splitPayments
        )
    ) {

        splitPayments.forEach(
            payment => {

                const method =
                    normalizePayment(

                        payment.method ||
                        payment.paymentMethod ||
                        payment.type ||
                        payment.name

                    );


                const amount =
                    number(

                        payment.amount ||
                        payment.value ||
                        payment.paymentAmount

                    );


                if (
                    method &&
                    amount > 0
                ) {

                    result[method] +=
                        amount;

                }

            }
        );

    }


    // --------------------------------------------------------
    // payments array
    // --------------------------------------------------------

    if (
        Array.isArray(
            data.payments
        )
    ) {

        data.payments.forEach(
            payment => {

                const method =
                    normalizePayment(

                        payment.method ||
                        payment.paymentMethod ||
                        payment.type ||
                        payment.name

                    );


                const amount =
                    number(

                        payment.amount ||
                        payment.value ||
                        payment.paymentAmount

                    );


                if (
                    method &&
                    amount > 0
                ) {

                    result[method] +=
                        amount;

                }

            }
        );

    }


    // --------------------------------------------------------
    // Regular payment method
    // --------------------------------------------------------

    const normalMethod =
        normalizePayment(

            data.paymentMethod ||
            data.payment ||
            data.method ||
            data.paymentType ||
            data.tenderType

        );


    const currentTotal =
        Object.values(result)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            );


    if (
        normalMethod &&
        currentTotal <= 0
    ) {

        result[normalMethod] =
            getTotal(data);

    }


    // --------------------------------------------------------
    // Individual payment fields
    // --------------------------------------------------------

    if (
        result.Cash <= 0
    ) {

        result.Cash =
            number(
                data.cashAmount ||
                data.cashReceived ||
                data.cash
            );

    }


    if (
        result.GCash <= 0
    ) {

        result.GCash =
            number(
                data.gcashAmount ||
                data.gcash
            );

    }


    if (
        result.BDO <= 0
    ) {

        result.BDO =
            number(
                data.bdoAmount ||
                data.bdo
            );

    }


    if (
        result.BIBO <= 0
    ) {

        result.BIBO =
            number(
                data.biboAmount ||
                data.bibo
            );

    }


    if (
        result.BPI <= 0
    ) {

        result.BPI =
            number(
                data.bpiAmount ||
                data.bpi
            );

    }


    return result;

}


// ============================================================
// PAYMENT LABEL
// ============================================================

function getPaymentLabel(data) {

    const breakdown =
        getPaymentBreakdown(data);


    const entries =
        PAYMENT_METHODS

            .map(
                method => ({

                    method,

                    amount:
                        number(
                            breakdown[method]
                        )

                })
            )

            .filter(
                item =>
                    item.amount > 0
            );


    if (
        !entries.length
    ) {

        return "Other";

    }


    if (
        entries.length === 1
    ) {

        return entries[0].method;

    }


    return entries

        .map(
            item =>
                `${item.method} ${money(item.amount)}`
        )

        .join(" + ");

}


// ============================================================
// ERROR
// ============================================================

function showError(
    title,
    message
) {

    if (!errorMessage) {
        return;
    }


    errorMessage.innerHTML = `

        <strong>
            ${escapeHtml(title)}
        </strong>

        <span>
            ${escapeHtml(message)}
        </span>

        <br>

        <button id="retryReports">
            Try Again
        </button>

    `;


    errorMessage.classList.add(
        "show"
    );


    const retry =
        document.getElementById(
            "retryReports"
        );


    if (retry) {

        retry.addEventListener(
            "click",
            loadSales
        );

    }

}


// ============================================================
// CLEAR ERROR
// ============================================================

function clearError() {

    if (!errorMessage) {
        return;
    }


    errorMessage.innerHTML =
        "";

    errorMessage.classList.remove(
        "show"
    );

}


// ============================================================
// START DATE
// ============================================================

function getStartDate(type) {

    const now =
        new Date();

    const start =
        new Date(now);


    // TODAY

    if (
        type === "today"
    ) {

        start.setHours(
            0,
            0,
            0,
            0
        );

        return start;

    }


    // WEEK - Monday

    if (
        type === "week"
    ) {

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


    // MONTH

    if (
        type === "month"
    ) {

        start.setDate(1);

        start.setHours(
            0,
            0,
            0,
            0
        );

        return start;

    }


    // ALL TIME

    return null;

}


// ============================================================
// FILTER SALES
// ============================================================

function filterSales() {

    const selected =
        period.value;


    const start =
        getStartDate(
            selected
        );


    const now =
        new Date();


    return allSales.filter(
        sale => {


            // Only completed sales

            if (
                !isCompleted(sale)
            ) {

                return false;

            }


            // All time

            if (!start) {

                return true;

            }


            // No date

            if (
                !sale._date
            ) {

                return false;

            }


            return (

                sale._date >= start &&
                sale._date <= now

            );

        }
    );

}


// ============================================================
// SUMMARY
// ============================================================

function updateSummary(rows) {

    const total =
        rows.reduce(

            (sum, row) =>
                sum + row._total,

            0

        );


    const transactionCount =
        rows.length;


    const itemCount =
        rows.reduce(

            (sum, row) => {

                const items =
                    getItems(row);


                if (
                    items.length
                ) {

                    return sum +

                        items.reduce(

                            (
                                itemSum,
                                item
                            ) =>

                                itemSum +
                                getQuantity(item),

                            0

                        );

                }


                return sum +

                    number(

                        row.itemCount ||
                        row.itemsCount ||
                        row.quantity ||
                        1

                    );

            },

            0

        );


    const totalCost =
        rows.reduce(

            (sum, row) =>
                sum +
                getTotalCost(row),

            0

        );


    const grossProfit =
        rows.reduce(

            (sum, row) =>
                sum +
                getGrossProfit(row),

            0

        );


    const profitMargin =
        total > 0

            ? (
                grossProfit /
                total
            ) * 100

            : 0;


    salesElement.textContent =
        money(total);


    transactionsElement.textContent =
        transactionCount;


    itemsElement.textContent =
        itemCount;


    averageElement.textContent =
        money(

            transactionCount
                ? total /
                    transactionCount
                : 0

        );


    if (
        totalCostElement
    ) {

        totalCostElement.textContent =
            money(totalCost);

    }


    if (
        grossProfitElement
    ) {

        grossProfitElement.textContent =
            money(grossProfit);

    }


    if (
        profitMarginElement
    ) {

        profitMarginElement.textContent =
            `${profitMargin.toFixed(2)}%`;

    }

}


// ============================================================
// PAYMENT DISPLAY
// ============================================================

function renderPayments(rows) {

    const paymentTotals = {

        Cash: 0,
        GCash: 0,
        BDO: 0,
        BIBO: 0,
        BPI: 0

    };


    if (
        !rows.length
    ) {

        paymentsElement.innerHTML =

            '<div class="empty">' +
            'No payment data available.' +
            '</div>';

        return;

    }


    rows.forEach(
        row => {

            const breakdown =
                getPaymentBreakdown(row);


            PAYMENT_METHODS.forEach(
                method => {

                    paymentTotals[method] +=
                        number(
                            breakdown[method]
                        );

                }
            );

        }
    );


    const entries =

        PAYMENT_METHODS

            .map(
                method => [

                    method,
                    paymentTotals[method]

                ]
            )

            .filter(
                ([, total]) =>
                    total > 0
            )

            .sort(
                (a, b) =>
                    b[1] - a[1]
            );


    if (
        !entries.length
    ) {

        paymentsElement.innerHTML =

            '<div class="empty">' +
            'No payment data available.' +
            '</div>';

        return;

    }


    paymentsElement.innerHTML =

        entries

            .map(
                ([name, total]) => {

                    let dot =
                        "blue";


                    if (
                        name === "Cash"
                    ) {

                        dot =
                            "green";

                    }

                    if (
                        name === "GCash"
                    ) {

                        dot =
                            "purple";

                    }

                    if (
                        name === "BDO"
                    ) {

                        dot =
                            "blue";

                    }

                    if (
                        name === "BIBO"
                    ) {

                        dot =
                            "orange";

                    }

                    if (
                        name === "BPI"
                    ) {

                        dot =
                            "green";

                    }


                    return `

                        <div class="payment">

                            <span class="payment-name">

                                <i
                                    class="dot ${dot}"
                                ></i>

                                ${escapeHtml(name)}

                            </span>

                            <b>
                                ${money(total)}
                            </b>

                        </div>

                    `;

                }
            )

            .join("");

}


// ============================================================
// TOP PRODUCTS
// ============================================================

function renderProducts(rows) {

    const productMap =
        {};


    rows.forEach(
        row => {

            const items =
                getItems(row);


            // ------------------------------------------------
            // Normal itemized sale
            // ------------------------------------------------

            if (
                items.length
            ) {

                items.forEach(
                    item => {

                        const name =
                            getProductName(item);


                        const category =
                            getCategory(item);


                        const quantity =
                            getQuantity(item);


                        const price =
                            getItemPrice(item);


                        let revenue =
                            Number(

                                item.total ||
                                item.subtotal ||
                                item.lineTotal

                            );


                        if (
                            !Number.isFinite(
                                revenue
                            )
                        ) {

                            revenue =
                                price *
                                quantity;

                        }


                        const cost =
                            getItemCost(item) *
                            quantity;


                        const profit =
                            getItemProfit(item);


                        const key =
                            `${name}|||${category}`;


                        if (
                            !productMap[key]
                        ) {

                            productMap[key] = {

                                name,
                                category,
                                quantity: 0,
                                revenue: 0,
                                cost: 0,
                                profit: 0

                            };

                        }


                        productMap[key].quantity +=
                            quantity;


                        productMap[key].revenue +=
                            revenue;


                        productMap[key].cost +=
                            cost;


                        productMap[key].profit +=
                            profit;

                    }
                );


                return;

            }


            // ------------------------------------------------
            // Sale without item array
            // ------------------------------------------------

            const name =
                row.packageName ||
                row.insuranceName ||
                row.productName ||
                row.product ||
                row.name ||
                "Sale";


            let category =
                row.category ||
                row.categoryName;


            if (
                !category
            ) {

                if (
                    row.packageName
                ) {

                    category =
                        "Package";

                } else if (
                    row.insuranceName
                ) {

                    category =
                        "Insurance";

                } else {

                    category =
                        "Sale";

                }

            }


            const quantity =
                number(
                    row.quantity ||
                    row.itemCount ||
                    1
                );


            const revenue =
                getTotal(row);


            const cost =
                getTotalCost(row);


            const profit =
                getGrossProfit(row);


            const key =
                `${name}|||${category}`;


            if (
                !productMap[key]
            ) {

                productMap[key] = {

                    name,
                    category,
                    quantity: 0,
                    revenue: 0,
                    cost: 0,
                    profit: 0

                };

            }


            productMap[key].quantity +=
                quantity;


            productMap[key].revenue +=
                revenue;


            productMap[key].cost +=
                cost;


            productMap[key].profit +=
                profit;

        }
    );


    const products =

        Object.values(
            productMap
        )

            .sort(
                (a, b) =>
                    b.revenue -
                    a.revenue
            );


    if (
        !products.length
    ) {

        productsElement.innerHTML = `

            <tr>

                <td colspan="6">

                    <div class="empty">
                        No product sales data available.
                    </div>

                </td>

            </tr>

        `;

        return;

    }


    productsElement.innerHTML =

        products

            .slice(
                0,
                20
            )

            .map(
                product => `

                    <tr>

                        <td>
                            <b>
                                ${escapeHtml(
                                    product.name
                                )}
                            </b>
                        </td>

                        <td>
                            ${escapeHtml(
                                product.category
                            )}
                        </td>

                        <td>
                            ${product.quantity}
                        </td>

                        <td>
                            ${money(
                                product.revenue
                            )}
                        </td>

                        <td>
                            ${money(
                                product.cost
                            )}
                        </td>

                        <td>
                            ${money(
                                product.profit
                            )}
                        </td>

                    </tr>

                `
            )

            .join("");

}


// ============================================================
// CHART
// ============================================================

function renderChart(rows) {

    const canvas =
        document.getElementById(
            "chart"
        );


    if (
        !canvas
    ) {

        return;

    }


    if (
        chart
    ) {

        chart.destroy();

        chart =
            null;

    }


    const selected =
        period.value;


    let labels = [];
    let values = [];


    // --------------------------------------------------------
    // TODAY
    // --------------------------------------------------------

    if (
        selected === "today"
    ) {

        for (
            let hour = 0;
            hour < 24;
            hour++
        ) {

            labels.push(
                `${String(hour).padStart(2, "0")}:00`
            );

            values.push(0);

        }


        rows.forEach(
            row => {

                if (
                    !row._date
                ) {

                    return;

                }


                const hour =
                    row._date.getHours();


                values[hour] +=
                    row._total;

            }
        );

    }


    // --------------------------------------------------------
    // WEEK
    // --------------------------------------------------------

    else if (
        selected === "week"
    ) {

        const start =
            getStartDate(
                "week"
            );


        for (
            let i = 0;
            i < 7;
            i++
        ) {

            const date =
                new Date(start);


            date.setDate(
                start.getDate() +
                i
            );


            labels.push(

                date.toLocaleDateString(
                    "en-PH",
                    {
                        weekday:
                            "short"
                    }
                )

            );


            values.push(0);

        }


        rows.forEach(
            row => {

                if (
                    !row._date
                ) {

                    return;

                }


                const date =
                    new Date(
                        row._date
                    );


                date.setHours(
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
                        (
                            date -
                            base
                        ) /
                        86400000
                    );


                if (
                    index >= 0 &&
                    index < 7
                ) {

                    values[index] +=
                        row._total;

                }

            }
        );

    }


    // --------------------------------------------------------
    // MONTH
    // --------------------------------------------------------

    else if (
        selected === "month"
    ) {

        const now =
            new Date();


        const days =
            new Date(

                now.getFullYear(),
                now.getMonth() + 1,
                0

            ).getDate();


        const start =
            getStartDate(
                "month"
            );


        for (
            let i = 0;
            i < days;
            i++
        ) {

            const date =
                new Date(start);


            date.setDate(
                start.getDate() +
                i
            );


            labels.push(

                date.toLocaleDateString(
                    "en-PH",
                    {
                        month:
                            "short",

                        day:
                            "numeric"
                    }
                )

            );


            values.push(0);

        }


        rows.forEach(
            row => {

                if (
                    !row._date
                ) {

                    return;

                }


                const date =
                    new Date(
                        row._date
                    );


                date.setHours(
                    0,
                    0,
                    0,
                    0
                );


                const base =
                    new Date(start);


                base.setHours(
                    0,
                    0,
                    0,
                    0
                );


                const index =
                    Math.floor(
                        (
                            date -
                            base
                        ) /
                        86400000
                    );


                if (
                    index >= 0 &&
                    index < days
                ) {

                    values[index] +=
                        row._total;

                }

            }
        );

    }


    // --------------------------------------------------------
    // ALL TIME
    // --------------------------------------------------------

    else {

        const dates =

            rows

                .map(
                    row =>
                        row._date
                )

                .filter(
                    Boolean
                )

                .sort(
                    (a, b) =>
                        a - b
                );


        if (
            !dates.length
        ) {

            labels = [
                "No Data"
            ];

            values = [0];

        } else {

            const first =
                new Date(
                    dates[0]
                );


            first.setHours(
                0,
                0,
                0,
                0
            );


            const last =
                new Date(
                    dates[
                        dates.length - 1
                    ]
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
                        (
                            last -
                            first
                        ) /
                        86400000
                    ) + 1

                );


            const days =
                Math.min(
                    dayCount,
                    31
                );


            const displayStart =
                new Date(last);


            displayStart.setDate(
                last.getDate() -
                days +
                1
            );


            for (
                let i = 0;
                i < days;
                i++
            ) {

                const date =
                    new Date(
                        displayStart
                    );


                date.setDate(
                    displayStart.getDate() +
                    i
                );


                labels.push(

                    date.toLocaleDateString(
                        "en-PH",
                        {
                            month:
                                "short",

                            day:
                                "numeric"
                        }
                    )

                );


                values.push(0);

            }


            rows.forEach(
                row => {

                    if (
                        !row._date
                    ) {

                        return;

                    }


                    const date =
                        new Date(
                            row._date
                        );


                    date.setHours(
                        0,
                        0,
                        0,
                        0
                    );


                    const base =
                        new Date(
                            displayStart
                        );


                    base.setHours(
                        0,
                        0,
                        0,
                        0
                    );


                    const index =
                        Math.floor(
                            (
                                date -
                                base
                            ) /
                            86400000
                        );


                    if (
                        index >= 0 &&
                        index < days
                    ) {

                        values[index] +=
                            row._total;

                    }

                }
            );

        }

    }


    if (
        typeof Chart ===
        "undefined"
    ) {

        console.error(
            "Chart.js was not loaded."
        );

        return;

    }


    chart =
        new Chart(
            canvas,
            {

                type: "line",

                data: {

                    labels,

                    datasets: [

                        {

                            label:
                                "Sales",

                            data:
                                values,

                            borderColor:
                                "#1976d2",

                            backgroundColor:
                                "rgba(25,118,210,.08)",

                            fill:
                                true,

                            tension:
                                0.35,

                            pointRadius:
                                3,

                            pointHoverRadius:
                                5

                        }

                    ]

                },

                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    plugins: {

                        legend: {

                            display:
                                false

                        },

                        tooltip: {

                            callbacks: {

                                label:
                                    context =>
                                        money(
                                            context.raw
                                        )

                            }

                        }

                    },

                    scales: {

                        y: {

                            beginAtZero:
                                true,

                            ticks: {

                                callback:
                                    value =>
                                        money(
                                            value
                                        )

                            }

                        },

                        x: {

                            grid: {

                                display:
                                    false

                            }

                        }

                    }

                }

            }
        );

}


// ============================================================
// RENDER EVERYTHING
// ============================================================

function render() {

    clearError();


    const rows =
        filterSales();


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


    console.log(
        "[Reports] Rendered:",
        {
            totalSales:
                rows.reduce(
                    (sum, row) =>
                        sum +
                        row._total,
                    0
                ),

            transactions:
                rows.length,

            rows
        }
    );

}


// ============================================================
// LOAD SALES
// ============================================================

function loadSales() {

    try {

        clearError();


        if (
            unsubscribeSales
        ) {

            unsubscribeSales();

            unsubscribeSales =
                null;

        }


        salesElement.textContent =
            "Loading...";


        transactionsElement.textContent =
            "...";


        itemsElement.textContent =
            "...";


        averageElement.textContent =
            "Loading...";


        if (
            totalCostElement
        ) {

            totalCostElement.textContent =
                "Loading...";

        }


        if (
            grossProfitElement
        ) {

            grossProfitElement.textContent =
                "Loading...";

        }


        if (
            profitMarginElement
        ) {

            profitMarginElement.textContent =
                "...";

        }


        paymentsElement.innerHTML =

            '<div class="loading">' +
            'Loading payment data...' +
            '</div>';


        productsElement.innerHTML = `

            <tr>

                <td colspan="6">

                    <div class="loading">
                        Loading product data...
                    </div>

                </td>

            </tr>

        `;


        unsubscribeSales =

            onSnapshot(

                collection(
                    db,
                    "sales"
                ),

                snapshot => {


                    allSales =

                        snapshot.docs

                            .map(
                                firestoreDoc => {

                                    const data =
                                        firestoreDoc.data();


                                    const date =
                                        getTimestamp(
                                            data
                                        );


                                    const total =
                                        getTotal(
                                            data
                                        );


                                    return {

                                        ...data,

                                        id:
                                            firestoreDoc.id,

                                        _date:
                                            date,

                                        _total:
                                            total

                                    };

                                }
                            );


                    console.log(
                        "[Reports] Sales loaded:",
                        allSales.length
                    );


                    // Show every loaded sale
                    // in console for debugging.

                    console.table(

                        allSales.map(
                            sale => ({

                                id:
                                    sale.id,

                                date:
                                    sale._date,

                                total:
                                    sale._total,

                                status:
                                    sale.status,

                                paymentMethod:
                                    sale.paymentMethod,

                                paymentStatus:
                                    sale.paymentStatus

                            })
                        )

                    );


                    render();

                },

                error => {

                    console.error(
                        "[Reports] Firebase error:",
                        error
                    );


                    salesElement.textContent =
                        "₱0.00";


                    transactionsElement.textContent =
                        "0";


                    itemsElement.textContent =
                        "0";


                    averageElement.textContent =
                        "₱0.00";


                    if (
                        totalCostElement
                    ) {

                        totalCostElement.textContent =
                            "₱0.00";

                    }


                    if (
                        grossProfitElement
                    ) {

                        grossProfitElement.textContent =
                            "₱0.00";

                    }


                    if (
                        profitMarginElement
                    ) {

                        profitMarginElement.textContent =
                            "0.00%";

                    }


                    paymentsElement.innerHTML =

                        '<div class="empty">' +
                        'Unable to load payment data.' +
                        '</div>';


                    productsElement.innerHTML = `

                        <tr>

                            <td colspan="6">

                                <div class="empty">
                                    Unable to load product data.
                                </div>

                            </td>

                        </tr>

                    `;


                    if (
                        error.code ===
                        "permission-denied"
                    ) {

                        showError(

                            "Unable to load reports",

                            "Firebase permissions do not allow reading the sales collection."

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

    }

    catch (
        error
    ) {

        console.error(
            "[Reports] Failed to load:",
            error
        );


        showError(

            "Unable to load reports",

            error.message ||
            "Unable to connect to Firebase."

        );

    }

}


// ============================================================
// CSV EXPORT
// ============================================================

function exportCSV() {

    const rows =
        filterSales();


    if (
        !rows.length
    ) {

        alert(
            "There is no sales data to export for the selected period."
        );

        return;

    }


    const lines = [];


    // HEADER

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
            "Total Sales",
            "Total Cost",
            "Gross Profit",
            "Profit Margin",
            "Items"

        ]

            .map(csv)
            .join(",")

    );


    // DATA

    rows.forEach(
        row => {

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

                        (
                            total,
                            item
                        ) =>

                            total +
                            getQuantity(item),

                        0

                    )

                    : number(

                        row.itemCount ||
                        row.itemsCount ||
                        row.quantity ||
                        1

                    );


            const total =
                row._total;


            const cost =
                getTotalCost(
                    row
                );


            const profit =
                getGrossProfit(
                    row
                );


            const margin =
                total > 0

                    ? (
                        profit /
                        total
                    ) * 100

                    : 0;


            lines.push(

                [

                    date,

                    row.id,

                    payment,

                    breakdown.Cash,

                    breakdown.GCash,

                    breakdown.BDO,

                    breakdown.BIBO,

                    breakdown.BPI,

                    total,

                    cost,

                    profit,

                    `${margin.toFixed(2)}%`,

                    itemCount

                ]

                    .map(csv)
                    .join(",")

            );

        }
    );


    // SUMMARY

    const totalSales =
        rows.reduce(

            (sum, row) =>
                sum +
                row._total,

            0

        );


    const totalCost =
        rows.reduce(

            (sum, row) =>
                sum +
                getTotalCost(row),

            0

        );


    const totalProfit =
        rows.reduce(

            (sum, row) =>
                sum +
                getGrossProfit(row),

            0

        );


    lines.push("");


    lines.push(
        csv("SUMMARY")
    );


    lines.push(

        [
            "Total Sales",
            totalSales
        ]

            .map(csv)
            .join(",")

    );


    lines.push(

        [
            "Total Cost",
            totalCost
        ]

            .map(csv)
            .join(",")

    );


    lines.push(

        [
            "Gross Profit",
            totalProfit
        ]

            .map(csv)
            .join(",")

    );


    lines.push(

        [
            "Profit Margin",
            totalSales > 0
                ? `${(
                    totalProfit /
                    totalSales
                * 100
                ).toFixed(2)}%`
                : "0.00%"
        ]

            .map(csv)
            .join(",")

    );


    lines.push(

        [
            "Transactions",
            rows.length
        ]

            .map(csv)
            .join(",")

    );


    // PAYMENT SUMMARY

    const paymentTotals = {

        Cash: 0,
        GCash: 0,
        BDO: 0,
        BIBO: 0,
        BPI: 0

    };


    rows.forEach(
        row => {

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

        }
    );


    lines.push("");


    lines.push(
        csv("PAYMENT METHODS")
    );


    PAYMENT_METHODS.forEach(
        method => {

            lines.push(

                [

                    method,
                    paymentTotals[method]

                ]

                    .map(csv)
                    .join(",")

            );

        }
    );


    // CREATE CSV

    const blob =
        new Blob(

            [

                "\ufeff" +
                lines.join("\n")

            ],

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


    link.download =
        `stockmaster-report-${new Date()
            .toISOString()
            .slice(0, 10)
        }.csv`;


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    URL.revokeObjectURL(
        url
    );

}


// ============================================================
// CSV ESCAPE
// ============================================================

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


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {

    return String(
        value ?? ""
    )

        .replace(
            /[&<>"']/g,
            char => ({

                "&":
                    "&amp;",

                "<":
                    "&lt;",

                ">":
                    "&gt;",

                '"':
                    "&quot;",

                "'":
                    "&#039;"

            }[char])
        );

}


// ============================================================
// SIDEBAR
// ============================================================

async function loadSidebar() {

    try {

        const response =
            await fetch(
                "sidebar.html"
            );


        if (
            !response.ok
        ) {

            throw new Error(
                "Unable to load sidebar."
            );

        }


        const container =
            document.getElementById(
                "sidebar-container"
            );


        if (
            !container
        ) {

            return;

        }


        container.innerHTML =
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

    }

    catch (
        error
    ) {

        console.error(
            "Sidebar error:",
            error
        );

    }

}


// ============================================================
// PROFILE
// ============================================================

function loadProfile() {

    const name =

        sessionStorage.getItem(
            "userName"
        ) ||

        localStorage.getItem(
            "userName"
        ) ||

        "Administrator";


    if (
        profileName
    ) {

        profileName.textContent =
            name;

    }


    const parts =
        name
            .trim()
            .split(/\s+/);


    if (
        profileAvatar
    ) {

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

}


// ============================================================
// EVENTS
// ============================================================

if (
    period
) {

    period.addEventListener(
        "change",
        render
    );

}


if (
    reset
) {

    reset.addEventListener(
        "click",
        () => {

            period.value =
                "week";

            render();

        }
    );

}


if (
    exportReport
) {

    exportReport.addEventListener(
        "click",
        exportCSV
    );

}


// ============================================================
// START
// ============================================================

loadProfile();

loadSidebar();

loadSales();