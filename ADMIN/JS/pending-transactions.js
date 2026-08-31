import { auth, db } from "../../Firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    collection,
    getDocs,
    doc,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const body = document.getElementById("pendingTransactionsBody");
const pendingCount = document.getElementById("pendingCount");
const pendingValue = document.getElementById("pendingValue");
const deliveryCount = document.getElementById("deliveryCount");
const pendingError = document.getElementById("pendingError");
const refreshPending = document.getElementById("refreshPending");
const globalSearch = document.getElementById("globalSearch");
const transactionSearch = document.getElementById("transactionSearch");
const detailsModal = document.getElementById("detailsModal");
const closeDetails = document.getElementById("closeDetails");
const cancelDetails = document.getElementById("cancelDetails");
const modalOrderDone = document.getElementById("modalOrderDone");

let pendingTransactions = [];
let activeFilter = "all";
let selectedTransaction = null;
let currentUser = null;
let currentAdminName = "Administrator";

const money = value =>
    new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(Number(value) || 0);

const getDateValue = value => {
    if (!value) return null;

    if (typeof value.toDate === "function") {
        return value.toDate();
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "string") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === "number") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
};

const getDate = transaction =>
    getDateValue(
        transaction.createdAt ??
        transaction.dateTime ??
        transaction.timestamp ??
        transaction.date
    );

const getTotal = transaction =>
    Number(
        transaction.total ??
        transaction.grandTotal ??
        transaction.totalAmount ??
        transaction.amount ??
        0
    );

const getItems = transaction => {
    if (Array.isArray(transaction.items)) {
        return transaction.items.reduce(
            (sum, item) =>
                sum + Number(item.quantity ?? item.qty ?? 1),
            0
        );
    }

    return Number(
        transaction.itemCount ??
        transaction.itemsCount ??
        transaction.quantity ??
        0
    );
};

const getCustomer = transaction =>
    String(
        transaction.customer ??
        transaction.customerName ??
        "Walk-in Customer"
    ).trim() || "Walk-in Customer";

const getTransactionNumber = transaction =>
    transaction.transactionNumber ??
    transaction.transactionId ??
    transaction.referenceNumber ??
    transaction.id;

const isPendingReservation = transaction => {
    const status = String(
        transaction.status ??
        transaction.orderStatus ??
        ""
    ).toLowerCase();

    const orderType = String(
        transaction.orderType ??
        transaction.type ??
        ""
    ).toLowerCase();

    return (
        status === "pending" &&
        (
            orderType === "reservation" ||
            orderType === "reserve" ||
            transaction.isReservation === true
        )
    );
};

const isDelivery = transaction =>
    transaction.delivery === true ||
    transaction.forDelivery === true ||
    String(
        transaction.deliveryStatus ??
        transaction.deliveryType ??
        ""
    ).toLowerCase() === "delivery";

const escapeHtml = value =>
    String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

const showError = message => {
    pendingError.textContent = message;
    pendingError.classList.add("show");
};

const hideError = () => {
    pendingError.textContent = "";
    pendingError.classList.remove("show");
};

const loadProfile = user => {
    const name =
        sessionStorage.getItem("userName") ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Administrator";

    currentAdminName = name;

    const profileName = document.getElementById("profileName");
    const profileAvatar = document.getElementById("profileAvatar");

    if (profileName) {
        profileName.textContent = name;
    }

    if (profileAvatar) {
        const parts = name.trim().split(/\s+/);

        profileAvatar.textContent =
            parts.length > 1
                ? (
                    parts[0][0] +
                    parts[parts.length - 1][0]
                ).toUpperCase()
                : name.substring(0, 2).toUpperCase();
    }
};

const filtered = () => {
    const search = String(
        transactionSearch.value ||
        globalSearch.value ||
        ""
    )
        .trim()
        .toLowerCase();

    return pendingTransactions.filter(transaction => {
        const delivery = isDelivery(transaction);

        const filterMatch =
            activeFilter === "all" ||
            (
                activeFilter === "reservation" &&
                !delivery
            ) ||
            (
                activeFilter === "delivery" &&
                delivery
            );

        if (!filterMatch) {
            return false;
        }

        if (!search) {
            return true;
        }

        return (
            String(
                getTransactionNumber(transaction)
            )
                .toLowerCase()
                .includes(search) ||
            getCustomer(transaction)
                .toLowerCase()
                .includes(search)
        );
    });
};

const render = () => {
    const rows = filtered();

    if (!rows.length) {
        body.innerHTML =
            '<tr><td colspan="7" class="empty-cell">No pending reservations found.</td></tr>';

        return;
    }

    body.innerHTML = rows
        .map(transaction => {
            const date = getDate(transaction);

            const dateText = date
                ? date.toLocaleString("en-PH", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                })
                : "—";

            const delivery = isDelivery(transaction);

            return `
                <tr>
                    <td>
                        <span class="transaction-number">
                            ${escapeHtml(
                                getTransactionNumber(transaction)
                            )}
                        </span>
                    </td>

                    <td>
                        <div class="customer-cell">
                            <strong>
                                ${escapeHtml(
                                    getCustomer(transaction)
                                )}
                            </strong>
                            <small>Reservation</small>
                        </div>
                    </td>

                    <td>
                        ${escapeHtml(dateText)}
                    </td>

                    <td>
                        <span class="item-count">
                            ${getItems(transaction)}
                        </span>
                    </td>

                    <td>
                        <span class="total-cell">
                            ${money(getTotal(transaction))}
                        </span>
                    </td>

                    <td>
                        <span class="status-badge ${
                            delivery
                                ? "status-delivery"
                                : "status-pickup"
                        }">
                            ${delivery ? "Delivery" : "Pickup"}
                        </span>
                    </td>

                    <td>
                        <div class="action-group">
                            <button
                                class="view-button"
                                type="button"
                                data-action="view"
                                data-id="${transaction.id}">
                                View
                            </button>

                            <button
                                class="done-button"
                                type="button"
                                data-action="done"
                                data-id="${transaction.id}">
                                Order Done
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        })
        .join("");
};

const openDetails = transaction => {
    selectedTransaction = transaction;

    const date = getDate(transaction);

    document.getElementById("detailsTitle").textContent =
        getTransactionNumber(transaction);

    document.getElementById("detailsSubtitle").textContent =
        "Pending reservation";

    document.getElementById("detailCustomer").textContent =
        getCustomer(transaction);

    document.getElementById("detailTransaction").textContent =
        getTransactionNumber(transaction);

    document.getElementById("detailDate").textContent =
        date
            ? date.toLocaleString("en-PH", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            })
            : "—";

    document.getElementById("detailDelivery").textContent =
        isDelivery(transaction)
            ? "For Delivery"
            : "Pickup";

    document.getElementById("detailTotal").textContent =
        money(getTotal(transaction));

    const items = Array.isArray(transaction.items)
        ? transaction.items
        : [];

    document.getElementById("detailItems").innerHTML =
        items.length
            ? items
                .map(item => {
                    const name =
                        item.name ??
                        item.productName ??
                        item.title ??
                        "Unnamed Product";

                    const quantity =
                        Number(
                            item.quantity ??
                            item.qty ??
                            1
                        );

                    const price =
                        Number(
                            item.price ??
                            item.unitPrice ??
                            0
                        );

                    return `
                        <div class="detail-item">
                            <strong>
                                ${escapeHtml(name)}
                            </strong>

                            <span>
                                × ${quantity}
                            </span>

                            <span>
                                ${money(price * quantity)}
                            </span>
                        </div>
                    `;
                })
                .join("")
            : '<div class="detail-item"><span>No item details available.</span></div>';

    detailsModal.classList.add("show");
};

const closeModal = () => {
    detailsModal.classList.remove("show");
    selectedTransaction = null;
};

const buildStockRequirements = async (transaction, firestoreTransaction) => {
    const requirements = new Map();

    const items = Array.isArray(transaction.items)
        ? transaction.items
        : [];

    const packageItems = items.filter(
        item =>
            String(
                item.type ??
                item.itemType ??
                ""
            ).toLowerCase() === "package"
    );

    const packageSnapshots = [];

    for (const item of packageItems) {
        const packageId =
            item.itemId ??
            item.productId ??
            item.id;

        if (!packageId) {
            throw new Error(
                `Package "${item.name || "Unnamed Package"}" has no package ID.`
            );
        }

        const packageRef = doc(
            db,
            "packages",
            packageId
        );

        const packageSnapshot =
            await firestoreTransaction.get(packageRef);

        if (!packageSnapshot.exists()) {
            throw new Error(
                `Package "${item.name || packageId}" no longer exists.`
            );
        }

        packageSnapshots.push({
            item,
            data: packageSnapshot.data()
        });
    }

    for (const item of items) {
        const type = String(
            item.type ??
            item.itemType ??
            "product"
        ).toLowerCase();

        const quantity =
            Number(
                item.quantity ??
                item.qty ??
                1
            );

        if (quantity <= 0) {
            continue;
        }

        if (
            type === "insurance" ||
            type === "insurance product"
        ) {
            continue;
        }

        if (type === "package") {
            continue;
        }

        const productId =
            item.itemId ??
            item.productId ??
            item.id;

        if (!productId) {
            throw new Error(
                `Product "${item.name || "Unnamed Product"}" has no product ID.`
            );
        }

        requirements.set(
            productId,
            (requirements.get(productId) || 0) +
            quantity
        );
    }

    for (const packageEntry of packageSnapshots) {
        const packageQuantity =
            Number(
                packageEntry.item.quantity ??
                packageEntry.item.qty ??
                1
            );

        const packageComponents =
            Array.isArray(
                packageEntry.data.items
            )
                ? packageEntry.data.items
                : [];

        if (!packageComponents.length) {
            throw new Error(
                `Package "${packageEntry.item.name || "Unnamed Package"}" has no component products.`
            );
        }

        for (const component of packageComponents) {
            const productId =
                component.productId ??
                component.itemId ??
                component.id;

            const componentQuantity =
                Number(
                    component.quantity ??
                    component.qty ??
                    1
                );

            if (!productId) {
                throw new Error(
                    `A component in package "${packageEntry.item.name || "Unnamed Package"}" has no product ID.`
                );
            }

            requirements.set(
                productId,
                (requirements.get(productId) || 0) +
                (
                    componentQuantity *
                    packageQuantity
                )
            );
        }
    }

    return requirements;
};

const completePendingOrder = async transactionData => {
    if (!transactionData) {
        return;
    }

    const transactionNumber =
        getTransactionNumber(transactionData);

    const confirmed =
        window.confirm(
            `Confirm Order Done?\n\n` +
            `Transaction: ${transactionNumber}\n` +
            `Customer: ${getCustomer(transactionData)}\n` +
            `Total: ${money(getTotal(transactionData))}\n\n` +
            `This will deduct the reserved stock and mark the reservation as completed.`
        );

    if (!confirmed) {
        return;
    }

    const buttons =
        document.querySelectorAll(
            `[data-action="done"][data-id="${transactionData.id}"]`
        );

    buttons.forEach(button => {
        button.disabled = true;
        button.textContent = "Processing...";
    });

    if (modalOrderDone) {
        modalOrderDone.disabled = true;
        modalOrderDone.textContent = "Processing...";
    }

    hideError();

    try {
        const saleRef = doc(
            db,
            "sales",
            transactionData.id
        );

        const movementRef = doc(
            collection(db, "inventoryMovements")
        );

        const timestamp = serverTimestamp();

        await runTransaction(
            db,
            async firestoreTransaction => {
                /*
                 * -----------------------------------------------------
                 * READ THE SALE FIRST
                 * -----------------------------------------------------
                 */

                const saleSnapshot =
                    await firestoreTransaction.get(
                        saleRef
                    );

                if (!saleSnapshot.exists()) {
                    throw new Error(
                        "This reservation no longer exists."
                    );
                }

                const currentSale =
                    saleSnapshot.data();

                const currentStatus =
                    String(
                        currentSale.status ??
                        currentSale.orderStatus ??
                        ""
                    ).toLowerCase();

                const currentOrderType =
                    String(
                        currentSale.orderType ??
                        currentSale.type ??
                        ""
                    ).toLowerCase();

                if (
                    currentStatus !== "pending" ||
                    !(
                        currentOrderType === "reservation" ||
                        currentOrderType === "reserve" ||
                        currentSale.isReservation === true
                    )
                ) {
                    throw new Error(
                        "This transaction is no longer a pending reservation."
                    );
                }

                if (currentSale.stockDeducted === true) {
                    throw new Error(
                        "Stock has already been deducted for this reservation."
                    );
                }

                /*
                 * -----------------------------------------------------
                 * BUILD STOCK REQUIREMENTS
                 * -----------------------------------------------------
                 */

                const requirements =
                    await buildStockRequirements(
                        currentSale,
                        firestoreTransaction
                    );

                /*
                 * -----------------------------------------------------
                 * READ ALL AFFECTED PRODUCTS
                 * BEFORE MAKING ANY WRITES
                 * -----------------------------------------------------
                 */

                const productRefs =
                    [
                        ...requirements.keys()
                    ].map(productId =>
                        doc(
                            db,
                            "products",
                            productId
                        )
                    );

                const productSnapshots = [];

                for (const productRef of productRefs) {
                    const productSnapshot =
                        await firestoreTransaction.get(
                            productRef
                        );

                    if (!productSnapshot.exists()) {
                        throw new Error(
                            "A product required for this reservation no longer exists."
                        );
                    }

                    productSnapshots.push(
                        productSnapshot
                    );
                }

                /*
                 * -----------------------------------------------------
                 * CHECK STOCK
                 * -----------------------------------------------------
                 */

                for (
                    let index = 0;
                    index < productRefs.length;
                    index++
                ) {
                    const productRef =
                        productRefs[index];

                    const productSnapshot =
                        productSnapshots[index];

                    const productData =
                        productSnapshot.data();

                    const required =
                        requirements.get(
                            productRef.id
                        ) || 0;

                    const currentStock =
                        Number(
                            productData.stock ??
                            productData.currentStock ??
                            productData.quantity ??
                            0
                        );

                    if (
                        currentStock <
                        required
                    ) {
                        const productName =
                            productData.name ||
                            productData.productName ||
                            productRef.id;

                        throw new Error(
                            `${productName} does not have enough stock.\n\n` +
                            `Available: ${currentStock}\n` +
                            `Required: ${required}`
                        );
                    }
                }

                /*
                 * -----------------------------------------------------
                 * DEDUCT STOCK
                 * -----------------------------------------------------
                 */

                for (
                    let index = 0;
                    index < productRefs.length;
                    index++
                ) {
                    const productRef =
                        productRefs[index];

                    const productSnapshot =
                        productSnapshots[index];

                    const productData =
                        productSnapshot.data();

                    const required =
                        requirements.get(
                            productRef.id
                        ) || 0;

                    const currentStock =
                        Number(
                            productData.stock ??
                            productData.currentStock ??
                            productData.quantity ??
                            0
                        );

                    firestoreTransaction.update(
                        productRef,
                        {
                            stock:
                                currentStock -
                                required,

                            updatedAt:
                                timestamp,

                            updatedBy:
                                currentUser?.uid ||
                                null
                        }
                    );
                }

                /*
                 * -----------------------------------------------------
                 * CREATE INVENTORY MOVEMENT
                 * -----------------------------------------------------
                 */

                firestoreTransaction.set(
                    movementRef,
                    {
                        type: "sale",

                        movementType: "SALE",

                        reason: "Sale",

                        referenceId:
                            saleRef.id,

                        transactionId:
                            saleRef.id,

                        transactionNumber,

                        items:
                            Array.isArray(
                                currentSale.items
                            )
                                ? currentSale.items
                                : [],

                        stockDeductions:
                            [
                                ...requirements.entries()
                            ].map(
                                ([
                                    productId,
                                    quantity
                                ]) => ({
                                    productId,
                                    quantity
                                })
                            ),

                        totalQuantity:
                            [
                                ...requirements.values()
                            ].reduce(
                                (sum, value) =>
                                    sum + value,
                                0
                            ),

                        createdBy:
                            currentUser?.uid ||
                            null,

                        staffName:
                            currentAdminName,

                        staffUid:
                            currentUser?.uid ||
                            null,

                        staffEmail:
                            currentUser?.email ||
                            "",

                        createdAt:
                            timestamp,

                        date:
                            timestamp
                    }
                );

                /*
                 * -----------------------------------------------------
                 * MARK RESERVATION AS COMPLETED
                 * -----------------------------------------------------
                 *
                 * IMPORTANT:
                 * We update the existing sales document instead
                 * of creating another sales document.
                 *
                 * This prevents duplicate sales.
                 * -----------------------------------------------------
                 */

                firestoreTransaction.update(
                    saleRef,
                    {
                        status: "Completed",

                        orderStatus: "Completed",

                        completedAt:
                            timestamp,

                        completedBy:
                            currentUser?.uid ||
                            null,

                        completedByName:
                            currentAdminName,

                        updatedAt:
                            timestamp,

                        updatedBy:
                            currentUser?.uid ||
                            null,

                        stockDeducted: true,

                        inventoryMovementId:
                            movementRef.id
                    }
                );
            }
        );

        /*
         * ---------------------------------------------------------
         * SUCCESS
         * ---------------------------------------------------------
         */

        closeModal();

        alert(
            `Order ${transactionNumber} has been completed successfully.\n\n` +
            `The reserved stock has been deducted.`
        );

        await loadPendingTransactions();

    } catch (error) {
        console.error(
            "Complete pending order error:",
            error
        );

        showError(
            error?.message ||
            "Unable to complete this reservation."
        );

        alert(
            error?.message ||
            "Unable to complete this reservation."
        );

    } finally {
        buttons.forEach(button => {
            button.disabled = false;
            button.textContent = "Order Done";
        });

        if (modalOrderDone) {
            modalOrderDone.disabled = false;
            modalOrderDone.textContent = "Order Done";
        }
    }
};

const loadPendingTransactions = async () => {
    hideError();

    body.innerHTML =
        '<tr><td colspan="7" class="empty-cell">Loading pending reservations...</td></tr>';

    try {
        const snapshot =
            await getDocs(
                collection(db, "sales")
            );

        pendingTransactions = [];

        snapshot.forEach(docSnapshot => {
            const transaction = {
                id: docSnapshot.id,
                ...docSnapshot.data()
            };

            if (
                isPendingReservation(
                    transaction
                )
            ) {
                pendingTransactions.push(
                    transaction
                );
            }
        });

        pendingTransactions.sort(
            (a, b) =>
                (
                    getDate(b)?.getTime() ||
                    0
                ) -
                (
                    getDate(a)?.getTime() ||
                    0
                )
        );

        pendingCount.textContent =
            pendingTransactions.length;

        pendingValue.textContent =
            money(
                pendingTransactions.reduce(
                    (sum, item) =>
                        sum + getTotal(item),
                    0
                )
            );

        deliveryCount.textContent =
            pendingTransactions.filter(
                isDelivery
            ).length;

        render();

    } catch (error) {
        console.error(
            "Pending transactions error:",
            error
        );

        showError(
            error?.message ||
            "Unable to load pending transactions from Firebase."
        );

        body.innerHTML =
            '<tr><td colspan="7" class="empty-cell">Unable to load pending reservations.</td></tr>';
    }
};

body.addEventListener("click", event => {
    const button =
        event.target.closest(
            "button[data-action]"
        );

    if (!button) {
        return;
    }

    const transaction =
        pendingTransactions.find(
            item =>
                item.id ===
                button.dataset.id
        );

    if (!transaction) {
        return;
    }

    const action =
        button.dataset.action;

    if (action === "view") {
        openDetails(transaction);
        return;
    }

    if (action === "done") {
        completePendingOrder(
            transaction
        );
    }
});

document
    .querySelectorAll(".filter-button")
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                document
                    .querySelectorAll(
                        ".filter-button"
                    )
                    .forEach(item =>
                        item.classList.remove(
                            "active"
                        )
                    );

                button.classList.add(
                    "active"
                );

                activeFilter =
                    button.dataset.filter;

                render();
            }
        );
    });

transactionSearch.addEventListener(
    "input",
    render
);

globalSearch.addEventListener(
    "input",
    () => {
        transactionSearch.value = "";
        render();
    }
);

refreshPending.addEventListener(
    "click",
    loadPendingTransactions
);

closeDetails.addEventListener(
    "click",
    closeModal
);

cancelDetails.addEventListener(
    "click",
    closeModal
);

detailsModal.addEventListener(
    "click",
    event => {
        if (
            event.target ===
            detailsModal
        ) {
            closeModal();
        }
    }
);

modalOrderDone.addEventListener(
    "click",
    () => {
        if (!selectedTransaction) {
            return;
        }

        completePendingOrder(
            selectedTransaction
        );
    }
);

onAuthStateChanged(
    auth,
    async user => {
        if (!user) {
            window.location.href =
                "login.html?role=admin";

            return;
        }

        currentUser = user;

        loadProfile(user);

        await loadPendingTransactions();
    }
);