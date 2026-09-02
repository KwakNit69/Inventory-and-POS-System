    import {
        db,
        auth
    } from "../../Firebase/firebase-config.js";

    import {
        collection,
        doc,
        getDocs,
        onSnapshot,
        query,
        orderBy,
        runTransaction,
        addDoc,
        serverTimestamp
    } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

    import {
        onAuthStateChanged
    } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";


    /* =========================================================
       GLOBAL VARIABLES
    ========================================================= */

    let products = [];
    let movements = [];
    let saleTransactions = [];
    let filteredProducts = [];
    let movementFromDate = "";
    let movementToDate = "";
    let currentPage = 1;
    let movementCurrentPage = 1;
    let currentUser = null;

    const productsPerPage = 6;


    /* =========================================================
       ELEMENTS
    ========================================================= */

    const tableBody =
        document.getElementById("inventoryTableBody");

    const emptyState =
        document.getElementById("emptyState");

    const loadingState =
        document.getElementById("loadingState");

    const errorState =
        document.getElementById("errorState");

    const errorMessage =
        document.getElementById("errorMessage");

    const inventoryModal =
        document.getElementById("inventoryModal");

    const inventoryForm =
        document.getElementById("inventoryForm");

    const movementProduct =
        document.getElementById("movementProduct");

    const movementType =
        document.getElementById("movementType");

    const movementQuantity =
        document.getElementById("movementQuantity");

    const movementReason =
        document.getElementById("movementReason");

    const movementNotes =
        document.getElementById("movementNotes");

    const currentStockDisplay =
        document.getElementById("currentStockDisplay");

    const saveMovementBtn =
        document.getElementById("saveMovementBtn");

    const movementTableBody =
        document.getElementById("movementTableBody");

    const movementEmpty =
        document.getElementById("movementEmpty");

    const movementFromDateInput =
        document.getElementById("movementFromDate");

    const movementToDateInput =
        document.getElementById("movementToDate");

    const applyMovementDateFilter =
        document.getElementById("applyMovementDateFilter");

    const clearMovementDateFilter =
        document.getElementById("clearMovementDateFilter");


    /* =========================================================
       LOADING / ERROR
    ========================================================= */

    function showLoading() {

        if (loadingState) {
            loadingState.style.display =
                "flex";
        }

        if (errorState) {
            errorState.classList.remove(
                "show"
            );
        }

        if (emptyState) {
            emptyState.classList.remove(
                "show"
            );
        }
    }


    function hideLoading() {

        if (loadingState) {
            loadingState.style.display =
                "none";
        }
    }


    function showError(error) {

        hideLoading();

        if (emptyState) {
            emptyState.classList.remove(
                "show"
            );
        }

        if (errorState) {
            errorState.classList.add(
                "show"
            );
        }

        const message =
            error?.message ||
            String(error);

        if (errorMessage) {
            errorMessage.textContent =
                message;
        }

        console.error(
            "INVENTORY FIREBASE ERROR:",
            error
        );
    }


    function hideError() {

        if (errorState) {
            errorState.classList.remove(
                "show"
            );
        }
    }


    /* =========================================================
       PRODUCT NORMALIZATION
    ========================================================= */

    function normalizeProduct(id, data) {

        return {

            id: String(id),

            name: String(
                data.name || ""
            ),

            sku: String(
                data.sku || ""
            ),

            category: String(
                data.category || ""
            ),

            price: Number(
                data.price || 0
            ),

            stock: Number(
                data.stock || 0
            ),

            lowStock: Number(
                data.lowStock ?? 10
            ),

            description: String(
                data.description || ""
            ),

            image: String(
                data.imageUrl ||
                data.image ||
                ""
            ),

            createdAt:
                data.createdAt || null
        };
    }


    /* =========================================================
       MOVEMENT NORMALIZATION
    ========================================================= */
    function getMovementDate(data) {
        const value = data.createdAt || data.date || data.paymentRecordedAt || data.reservationCreatedAt || null;
        if (!value) return null;
        if (value?.toDate) return value.toDate();
        if (value instanceof Date) return value;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    function getItemQuantity(item) {
        return Number(item?.quantity ?? item?.qty ?? item?.count ?? 0) || 0;
    }
    function getItemProductName(item) {
        return String(item?.name || item?.productName || item?.product || item?.sku || "Unknown Product");
    }
    function getSaleType(data) {
        const value = String(data.orderType || data.saleType || data.type || "sale").toLowerCase();
        return value.includes("reserv") ? "Reservation" : "Sale";
    }
    function getTransactionNumber(id, data) {
        return String(data.transactionNumber || data.transactionNo || data.trxNumber || data.referenceNumber || `SALE-${String(id).slice(0, 8).toUpperCase()}`);
    }
    function normalizeMovement(id, data) {
        const date = getMovementDate(data);
        const rawType = String(data.type || '').trim().toLowerCase();
        const rawMovementType = String(data.movementType || data.movement || '').trim().toLowerCase();
        const rawReason = String(data.reason || '').trim().toLowerCase();

        // POS sales are already read from the sales collection below.
        // Ignore the duplicate inventoryMovements OUT/SALE record created by POS.
        if (
            rawType === 'sale' ||
            rawType === 'reservation' ||
            rawMovementType === 'sale' ||
            (rawType === 'out' && rawMovementType === 'sale') ||
            (rawType === 'out' && rawReason === 'sale')
        ) {
            return [];
        }

        return [{
            id: String(id),
            product: String(data.productName || data.product || data.sku || 'Unknown Product'),
            type: String(data.type || 'Stock Movement'),
            quantity: Number(data.quantity || 0),
            reason: String(data.reason || ''),
            user: String(data.userName || data.user || data.staffName || data.cashierName || 'Administrator'),
            notes: String(data.notes || ''),
            transactionNumber: String(data.transactionNumber || data.transactionNo || data.trxNumber || ''),
            createdAt: date
        }];
    }
    function normalizeSaleTransaction(id, data) {
        const date = getMovementDate(data);
        const type = getSaleType(data);

        /*
         * RESERVATIONS:
         * A reservation is paid immediately, but it must NOT appear in
         * Stock Movement History until Admin approves/completes it.
         *
         * The Admin "Order Done" process should change the sale to
         * status = "Completed" and/or stockDeducted = true.
         */
        const status = String(
            data.status || ""
        ).trim().toLowerCase();

        const approved =
            status === "completed" ||
            status === "complete" ||
            data.stockDeducted === true;

        if (type === "Reservation" && !approved) {
            return [];
        }

        const staff = String(data.staffName || data.cashierName || data.userName || data.createdByName || data.user || "Administrator");
        const transactionNumber = getTransactionNumber(id, data);
        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) {
            return [{
                id: String(id),
                product: "Sale Transaction",
                type,
                quantity: 0,
                reason: type === "Reservation" ? "Reservation" : "Sale",
                user: staff,
                notes: `Transaction ${transactionNumber}`,
                transactionNumber,
                createdAt: date
            }];
        }
        return items.map((item, index) => {
            const quantity = getItemQuantity(item);
            return {
                id: `${String(id)}-${index}`,
                product: getItemProductName(item),
                type,
                quantity: -Math.abs(quantity),
                reason: type === "Reservation" ? "Reservation" : "Sale",
                user: staff,
                notes: `Transaction ${transactionNumber}`,
                transactionNumber,
                createdAt: date
            };
        });
    }
    /* =========================================================
       LOAD PRODUCTS
    ========================================================= */

    async function loadProducts() {

        showLoading();

        hideError();

        try {

            const snapshot =
                await getDocs(
                    collection(
                        db,
                        "products"
                    )
                );


            products =
                snapshot.docs.map(
                    item =>
                        normalizeProduct(
                            item.id,
                            item.data()
                        )
                );


            products.sort(
                (a, b) => {

                    const aTime =
                        a.createdAt?.seconds ||
                        0;

                    const bTime =
                        b.createdAt?.seconds ||
                        0;

                    return bTime -
                        aTime;
                }
            );


            populateCategoryFilter();

            populateProductSelect();

            updateSummary();

            filterInventory();

            hideLoading();

        }

        catch (error) {

            showError(error);

        }

    }


    /* =========================================================
       REAL-TIME PRODUCTS
    ========================================================= */

    function listenToProducts() {

        return onSnapshot(

            collection(
                db,
                "products"
            ),

            snapshot => {

                products =
                    snapshot.docs.map(
                        item =>
                            normalizeProduct(
                                item.id,
                                item.data()
                            )
                    );


                products.sort(
                    (a, b) => {

                        const aTime =
                            a.createdAt?.seconds ||
                            0;

                        const bTime =
                            b.createdAt?.seconds ||
                            0;

                        return bTime -
                            aTime;
                    }
                );


                populateCategoryFilter();

                populateProductSelect();

                updateSummary();

                filterInventory();

                hideLoading();

                hideError();

            },

            error => {

                showError(error);

            }

        );

    }


    /* =========================================================
       MOVEMENTS
    ========================================================= */
    function listenToMovements() {
        const movementsQuery = query(collection(db, "inventoryMovements"), orderBy("createdAt", "desc"));
        return onSnapshot(movementsQuery, snapshot => {
            movements = snapshot.docs.flatMap(item => normalizeMovement(item.id, item.data()));
            mergeAndRenderMovements();
        }, error => {
            console.error("Movement loading error:", error);
            movements = [];
            mergeAndRenderMovements();
        });
    }
    function listenToSalesForMovements() {
        return onSnapshot(query(collection(db, "sales")), snapshot => {
            saleTransactions = snapshot.docs.flatMap(
                item => normalizeSaleTransaction(
                    item.id,
                    item.data()
                )
            );

            console.log(
                "Approved sales shown in Stock Movement History:",
                saleTransactions.length
            );

            mergeAndRenderMovements();
        }, error => {
            console.error("Sales movement loading error:", error);
            saleTransactions = [];
            mergeAndRenderMovements();
        });
    }
    function mergeAndRenderMovements() {
        const inventoryRows = movements.filter(
            item =>
                item.type !== "Sale" &&
                item.type !== "Reservation"
        );

        // Only approved/completed sales are supplied by normalizeSaleTransaction().
        // Pending reservations therefore never enter Stock Movement History.
        movements = [
            ...inventoryRows,
            ...saleTransactions
        ].sort((a, b) => {
            const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
            const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
            return bTime - aTime;
        });
        renderMovements();
    }
    /* =========================================================
       SUMMARY
    ========================================================= */

    function updateSummary() {

        const totalProducts =
            products.length;


        const totalUnits =
            products.reduce(

                (total, product) =>
                    total +
                    Number(
                        product.stock ||
                        0
                    ),

                0

            );


        const lowStock =
            products.filter(

                product =>
                    Number(
                        product.stock
                    ) > 0 &&

                    Number(
                        product.stock
                    ) <=

                    Number(
                        product.lowStock
                    )

            ).length;


        const outOfStock =
            products.filter(

                product =>
                    Number(
                        product.stock
                    ) <= 0

            ).length;


        const inventoryValue =
            products.reduce(

                (total, product) =>
                    total +

                    Number(
                        product.price
                    ) *

                    Number(
                        product.stock
                    ),

                0

            );


        const salesValue =
            inventoryValue;


        const totalProductsElement =
            document.getElementById(
                "totalProducts"
            );

        if (totalProductsElement) {

            totalProductsElement.textContent =
                totalProducts;

        }


        const totalUnitsElement =
            document.getElementById(
                "totalUnits"
            );

        if (totalUnitsElement) {

            totalUnitsElement.textContent =
                totalUnits;

        }


        const lowStockElement =
            document.getElementById(
                "lowStock"
            );

        if (lowStockElement) {

            lowStockElement.textContent =
                lowStock;

        }


        const outOfStockElement =
            document.getElementById(
                "outOfStock"
            );

        if (outOfStockElement) {

            outOfStockElement.textContent =
                outOfStock;

        }


        const inventoryValueElement =
            document.getElementById(
                "inventoryValue"
            );

        if (inventoryValueElement) {

            inventoryValueElement.textContent =
                formatMoney(
                    inventoryValue
                );

        }


        const salesValueElement =
            document.getElementById(
                "salesValue"
            );

        if (salesValueElement) {

            salesValueElement.textContent =
                formatMoney(
                    salesValue
                );

        }

    }


    /* =========================================================
       CATEGORY FILTER
    ========================================================= */

    function populateCategoryFilter() {

        const categoryFilter =
            document.getElementById(
                "categoryFilter"
            );

        if (!categoryFilter) return;


        const currentValue =
            categoryFilter.value;


        const categories =

            [

                ...new Set(

                    products

                        .map(
                            product =>
                                product.category
                        )

                        .filter(
                            Boolean
                        )

                )

            ]

                .sort(
                    (a, b) =>
                        a.localeCompare(b)
                );


        categoryFilter.innerHTML =
            "";


        const allOption =
            document.createElement(
                "option"
            );


        allOption.value =
            "all";


        allOption.textContent =
            "All Categories";


        categoryFilter.appendChild(
            allOption
        );


        categories.forEach(
            category => {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    category;


                option.textContent =
                    category;


                categoryFilter.appendChild(
                    option
                );

            }
        );


        if (
            categories.includes(
                currentValue
            )
        ) {

            categoryFilter.value =
                currentValue;

        }

    }


    /* =========================================================
       PRODUCT SELECT
    ========================================================= */

    function populateProductSelect() {

        if (!movementProduct) {
            return;
        }


        const currentValue =
            movementProduct.value;


        movementProduct.innerHTML =
            "";


        const firstOption =
            document.createElement(
                "option"
            );


        firstOption.value =
            "";


        firstOption.textContent =
            products.length
                ? "Select product"
                : "No products available";


        movementProduct.appendChild(
            firstOption
        );


        products.forEach(
            product => {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    product.id;


                option.textContent =
                    `${product.name} (${product.sku})`;


                movementProduct.appendChild(
                    option
                );

            }
        );


        if (
            products.some(
                product =>
                    product.id ===
                    currentValue
            )
        ) {

            movementProduct.value =
                currentValue;

        }


        updateCurrentStock();

    }


    /* =========================================================
       STOCK STATUS
    ========================================================= */

    function getStockStatus(product) {

        if (
            Number(
                product.stock
            ) <= 0
        ) {

            return {

                text:
                    "Out of Stock",

                className:
                    "out",

                stockClass:
                    "stock-out"

            };

        }


        if (
            Number(
                product.stock
            ) <=

            Number(
                product.lowStock
            )
        ) {

            return {

                text:
                    "Low Stock",

                className:
                    "low",

                stockClass:
                    "stock-low"

            };

        }


        return {

            text:
                "In Stock",

            className:
                "normal",

            stockClass:
                "stock-normal"

        };

    }


    /* =========================================================
       RENDER INVENTORY
    ========================================================= */

    function renderInventory() {

        if (!tableBody) return;


        tableBody.innerHTML =
            "";


        if (
            filteredProducts.length === 0
        ) {

            if (emptyState) {

                emptyState.classList.add(
                    "show"
                );

            }

            updatePagination();

            return;

        }


        if (emptyState) {

            emptyState.classList.remove(
                "show"
            );

        }


        const start =
            (currentPage - 1) *
            productsPerPage;


        const end =
            start +
            productsPerPage;


        filteredProducts

            .slice(
                start,
                end
            )

            .forEach(
                product => {

                    const status =
                        getStockStatus(
                            product
                        );


                    const stockValue =
                        Number(
                            product.price
                        ) *

                        Number(
                            product.stock
                        );


                    const row =
                        document.createElement(
                            "tr"
                        );


                    const image =
                        product.image

                            ? `
                                <img
                                    src="${escapeHTML(product.image)}"
                                    alt="${escapeHTML(product.name)}"
                                >
                              `

                            : "▣";


                    row.innerHTML = `

                        <td>

                            <div class="product-cell">

                                <div class="product-image">

                                    ${image}

                                </div>

                                <div>

                                    <div class="product-name">

                                        ${escapeHTML(
                                            product.name
                                        )}

                                    </div>

                                    <div class="product-description">

                                        ${escapeHTML(
                                            product.description
                                        )}

                                    </div>

                                </div>

                            </div>

                        </td>


                        <td>

                            <span class="sku">

                                ${escapeHTML(
                                    product.sku
                                )}

                            </span>

                        </td>


                        <td>

                            ${escapeHTML(
                                product.category
                            )}

                        </td>


                        <td>

                            <span class="price">

                                ${formatMoney(
                                    product.price
                                )}

                            </span>

                        </td>


                        <td>

                            <span
                                class="stock-number ${status.stockClass}"
                            >

                                ${product.stock}

                            </span>

                        </td>


                        <td>

                            <span class="stock-value">

                                ${formatMoney(
                                    stockValue
                                )}

                            </span>

                        </td>


                        <td>

                            <span
                                class="status ${status.className}"
                            >

                                ${status.text}

                            </span>

                        </td>


                        <td>

                            <button
                                class="inventory-action"
                                data-product-id="${escapeHTML(product.id)}"
                                type="button"
                                title="Adjust stock"
                            >

                                ⚙

                            </button>

                        </td>

                    `;


                    tableBody.appendChild(
                        row
                    );

                }

            );


        updatePagination();

    }


    /* =========================================================
       FILTER INVENTORY
    ========================================================= */

    function filterInventory() {

        const searchElement =
            document.getElementById(
                "inventorySearch"
            );

        const categoryElement =
            document.getElementById(
                "categoryFilter"
            );

        const stockElement =
            document.getElementById(
                "stockFilter"
            );


        const search =
            searchElement
                ? searchElement.value
                    .trim()
                    .toLowerCase()
                : "";


        const category =
            categoryElement
                ? categoryElement.value
                : "all";


        const stock =
            stockElement
                ? stockElement.value
                : "all";


        filteredProducts =
            products.filter(
                product => {

                    const matchesSearch =

                        product.name
                            .toLowerCase()
                            .includes(search)

                        ||

                        product.sku
                            .toLowerCase()
                            .includes(search);


                    const matchesCategory =
                        category === "all" ||

                        product.category ===
                        category;


                    let matchesStock =
                        true;


                    if (
                        stock === "normal"
                    ) {

                        matchesStock =

                            Number(
                                product.stock
                            ) >

                            Number(
                                product.lowStock
                            );

                    }


                    if (
                        stock === "low"
                    ) {

                        matchesStock =

                            Number(
                                product.stock
                            ) > 0 &&

                            Number(
                                product.stock
                            ) <=

                            Number(
                                product.lowStock
                            );

                    }


                    if (
                        stock === "out"
                    ) {

                        matchesStock =

                            Number(
                                product.stock
                            ) <= 0;

                    }


                    return (

                        matchesSearch &&

                        matchesCategory &&

                        matchesStock

                    );

                }
            );


        currentPage =
            1;


        renderInventory();

    }


    /* =========================================================
       PAGINATION
    ========================================================= */

    function updatePagination() {

        const total =
            filteredProducts.length;


        const totalPages =
            Math.max(

                1,

                Math.ceil(
                    total /
                    productsPerPage
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

                : (

                    (currentPage - 1) *
                    productsPerPage

                ) + 1;


        const end =
            Math.min(

                currentPage *
                productsPerPage,

                total

            );


        const paginationInfo =
            document.getElementById(
                "paginationInfo"
            );


        if (paginationInfo) {

            paginationInfo.textContent =

                total === 0

                    ? "Showing 0 of 0 products"

                    : `Showing ${start}-${end} of ${total} products`;

        }


        const currentPageElement =
            document.getElementById(
                "currentPage"
            );


        if (currentPageElement) {

            currentPageElement.textContent =
                currentPage;

        }


        const previousPage =
            document.getElementById(
                "previousPage"
            );


        if (previousPage) {

            previousPage.disabled =
                currentPage <= 1;

        }


        const nextPage =
            document.getElementById(
                "nextPage"
            );


        if (nextPage) {

            nextPage.disabled =
                currentPage >=
                totalPages;

        }

    }


    /* =========================================================
       MOVEMENT TABLE
    ========================================================= */
    function getMovementPaginationElement() {
        let pagination = document.getElementById("movementPagination");
        if (pagination) return pagination;
        const section = movementTableBody?.closest(".movements-section");
        const tableContainer = movementTableBody?.closest(".movements-table-container");
        if (!section || !tableContainer) return null;
        pagination = document.createElement("div");
        pagination.id = "movementPagination";
        pagination.className = "movement-pagination";
        tableContainer.insertAdjacentElement("afterend", pagination);
        return pagination;
    }
    function renderMovementPagination(total) {
        const pagination = getMovementPaginationElement();
        if (!pagination) return;
        const perPage = 10;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        if (movementCurrentPage > totalPages) movementCurrentPage = totalPages;
        if (total === 0) {
            pagination.innerHTML = "";
            pagination.style.display = "none";
            return;
        }
        const start = (movementCurrentPage - 1) * perPage + 1;
        const end = Math.min(movementCurrentPage * perPage, total);
        pagination.style.display = "flex";
        pagination.innerHTML = `
            <div class="movement-pagination-info">
                Showing <strong>${start}-${end}</strong> of <strong>${total}</strong> transactions
            </div>
            <div class="movement-pagination-controls">
                <button type="button" class="movement-page-button" data-movement-page="prev" ${movementCurrentPage <= 1 ? "disabled" : ""} aria-label="Previous page">‹</button>
                <span class="movement-page-status">Page <strong>${movementCurrentPage}</strong> of <strong>${totalPages}</strong></span>
                <button type="button" class="movement-page-button" data-movement-page="next" ${movementCurrentPage >= totalPages ? "disabled" : ""} aria-label="Next page">›</button>
            </div>`;
        pagination.querySelector('[data-movement-page="prev"]')?.addEventListener("click", () => {
            if (movementCurrentPage > 1) {
                movementCurrentPage--;
                renderMovements();
            }
        });
        pagination.querySelector('[data-movement-page="next"]')?.addEventListener("click", () => {
            if (movementCurrentPage < totalPages) {
                movementCurrentPage++;
                renderMovements();
            }
        });
    }
    function renderMovements() {
        if (!movementTableBody) return;
        movementTableBody.innerHTML = "";
        const from = movementFromDate ? new Date(`${movementFromDate}T00:00:00`) : null;
        const to = movementToDate ? new Date(`${movementToDate}T23:59:59.999`) : null;
        const visibleMovements = movements.filter(movement => {
            if (!(movement.createdAt instanceof Date) || Number.isNaN(movement.createdAt.getTime())) return !from && !to;
            if (from && movement.createdAt < from) return false;
            if (to && movement.createdAt > to) return false;
            return true;
        });
        if (!visibleMovements.length) {
            movementCurrentPage = 1;
            if (movementEmpty) {
                movementEmpty.style.display = "block";
                movementEmpty.textContent = movements.length ? "No transactions found for the selected dates." : "No stock movements recorded yet.";
            }
            renderMovementPagination(0);
            return;
        }
        if (movementEmpty) movementEmpty.style.display = "none";
        const perPage = 10;
        const totalPages = Math.ceil(visibleMovements.length / perPage);
        if (movementCurrentPage > totalPages) movementCurrentPage = totalPages;
        const startIndex = (movementCurrentPage - 1) * perPage;
        const pageMovements = visibleMovements.slice(startIndex, startIndex + perPage);
        pageMovements.forEach(movement => {
            const row = document.createElement("tr");
            const date = movement.createdAt instanceof Date ? movement.createdAt.toLocaleString("en-PH", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
            const type = String(movement.type || "Movement");
            const normalizedType = type.toLowerCase();
            const typeClass = normalizedType.includes("stock in") ? "movement-in" : normalizedType.includes("sale") || normalizedType.includes("stock out") ? "movement-out" : normalizedType.includes("reservation") ? "movement-reservation" : "movement-adjustment";
            const quantity = Number(movement.quantity || 0);
            const quantityClass = quantity > 0 ? "quantity-in" : quantity < 0 ? "quantity-out" : "quantity-neutral";
            const quantityText = quantity > 0 ? `+${quantity}` : quantity;
            const transaction = movement.transactionNumber || "—";
            row.innerHTML = `
                <td>${escapeHTML(date)}</td>
                <td><strong>${escapeHTML(movement.product || "Unknown Product")}</strong></td>
                <td><span class="movement-type ${typeClass}">${escapeHTML(type)}</span></td>
                <td><span class="${quantityClass}">${escapeHTML(quantityText)}</span></td>
                <td>${escapeHTML(movement.reason || "—")}</td>
                <td>${escapeHTML(transaction)}</td>
                <td>${escapeHTML(movement.user || "Administrator")}</td>`;
            movementTableBody.appendChild(row);
        });
        renderMovementPagination(visibleMovements.length);
    }
    /* =========================================================
       CURRENT STOCK
    ========================================================= */

    function updateCurrentStock() {

        if (!movementProduct) {
            return;
        }


        const productId =
            movementProduct.value;


        const product =
            products.find(
                item =>
                    item.id ===
                    productId
            );


        if (currentStockDisplay) {

            currentStockDisplay.textContent =

                product

                    ? `${product.stock} units`

                    : "0 units";

        }

    }


    /* =========================================================
       OPEN INVENTORY MODAL
    ========================================================= */

    function openInventoryModal(type) {

        if (
            !products.length
        ) {

            alert(
                "There are no products in Firebase yet. Add a product first."
            );

            return;

        }


        inventoryForm.reset();


        movementType.value =
            type;


        const modalTitle =
            document.getElementById(
                "modalTitle"
            );


        if (modalTitle) {

            modalTitle.textContent =

                type ===
                    "stock-in"

                    ? "Stock In"

                    :

                type ===
                    "stock-out"

                    ? "Stock Out"

                    :

                "Stock Adjustment";

        }


        populateProductSelect();


        if (currentStockDisplay) {

            currentStockDisplay.textContent =
                "0 units";

        }


        inventoryModal.classList.add(
            "show"
        );

    }


    /* =========================================================
       SAVE MOVEMENT
    ========================================================= */

    async function saveMovement(event) {

        event.preventDefault();


        const type =
            movementType.value;


        const productId =
            movementProduct.value;


        const quantity =
            Number(
                movementQuantity.value
            );


        const reason =
            movementReason.value;


        const notes =
            movementNotes.value.trim();


        if (!productId) {

            alert(
                "Please select a product."
            );

            return;

        }


        if (
            !quantity ||
            quantity <= 0
        ) {

            alert(
                "Please enter a valid quantity."
            );

            return;

        }


        const product =
            products.find(
                item =>
                    item.id ===
                    productId
            );


        if (!product) {

            alert(
                "The selected product could not be found."
            );

            return;

        }


        let stockChange =
            0;


        let movementName =
            "";


        if (
            type ===
            "stock-in"
        ) {

            stockChange =
                quantity;

            movementName =
                "Stock In";

        }


        if (
            type ===
            "stock-out"
        ) {

            stockChange =
                -quantity;

            movementName =
                "Stock Out";


            if (
                quantity >
                Number(
                    product.stock
                )
            ) {

                alert(
                    "Stock Out quantity cannot be greater than the current stock."
                );

                return;

            }

        }


        if (
            type ===
            "adjustment"
        ) {

            stockChange =
                -quantity;

            movementName =
                "Adjustment";


            if (
                quantity >
                Number(
                    product.stock
                )
            ) {

                alert(
                    "Adjustment cannot reduce stock below zero."
                );

                return;

            }

        }


        saveMovementBtn.disabled =
            true;


        saveMovementBtn.textContent =
            "Saving...";


        try {

            await runTransaction(

                db,

                async transaction => {

                    const productRef =
                        doc(
                            db,
                            "products",
                            productId
                        );


                    const productSnapshot =
                        await transaction.get(
                            productRef
                        );


                    if (
                        !productSnapshot.exists()
                    ) {

                        throw new Error(
                            "Product no longer exists in Firebase."
                        );

                    }


                    const currentData =
                        productSnapshot.data();


                    const currentStock =
                        Number(
                            currentData.stock ||
                            0
                        );


                    const finalStock =
                        currentStock +
                        stockChange;


                    if (
                        finalStock < 0
                    ) {

                        throw new Error(
                            "Stock cannot become negative."
                        );

                    }


                    transaction.update(

                        productRef,

                        {

                            stock:
                                finalStock,

                            updatedAt:
                                serverTimestamp()

                        }

                    );

                }

            );


            await addDoc(

                collection(
                    db,
                    "inventoryMovements"
                ),

                {

                    productId:
                        product.id,

                    productName:
                        product.name,

                    productSku:
                        product.sku,

                    type:
                        movementName,

                    quantity:
                        stockChange,

                    reason:
                        reason,

                    notes:
                        notes,

                    userId:
                        currentUser?.uid ||
                        "",

                    userName:
                        currentUser?.email ||
                        "Administrator",

                    createdAt:
                        serverTimestamp()

                }

            );


            inventoryModal.classList.remove(
                "show"
            );


            inventoryForm.reset();


            alert(
                "Inventory movement saved successfully."
            );

        }

        catch (error) {

            console.error(
                "SAVE INVENTORY ERROR:",
                error
            );


            alert(
                `Unable to save inventory movement.\n\n${error.message}`
            );

        }

        finally {

            saveMovementBtn.disabled =
                false;


            saveMovementBtn.textContent =
                "Save Movement";

        }

    }


    /* =========================================================
       CLOSE MODAL
    ========================================================= */

    function closeInventoryModal() {

        inventoryModal.classList.remove(
            "show"
        );


        inventoryForm.reset();


        updateCurrentStock();

    }


    /* =========================================================
       MONEY FORMAT
    ========================================================= */

    function formatMoney(value) {

        return new Intl.NumberFormat(
            "en-PH",
            {

                style:
                    "currency",

                currency:
                    "PHP"

            }

        ).format(
            Number(
                value ||
                0
            )
        );

    }


    /* =========================================================
       ESCAPE HTML
    ========================================================= */

    function escapeHTML(value) {

        return String(
            value ?? ""
        )

            .replaceAll(
                "&",
                "&amp;"
            )

            .replaceAll(
                "<",
                "&lt;"
            )

            .replaceAll(
                ">",
                "&gt;"
            )

            .replaceAll(
                '"',
                "&quot;"
            )

            .replaceAll(
                "'",
                "&#039;"
            );

    }


    /* =========================================================
       BUTTON EVENTS
    ========================================================= */

    const openStockInButton =
        document.getElementById(
            "openStockIn"
        );

    if (openStockInButton) {

        openStockInButton.addEventListener(
            "click",
            () =>
                openInventoryModal(
                    "stock-in"
                )
        );

    }


    const openAdjustmentButton =
        document.getElementById(
            "openAdjustment"
        );

    if (openAdjustmentButton) {

        openAdjustmentButton.addEventListener(
            "click",
            () =>
                openInventoryModal(
                    "adjustment"
                )
        );

    }


    const closeInventoryModalButton =
        document.getElementById(
            "closeInventoryModal"
        );

    if (closeInventoryModalButton) {

        closeInventoryModalButton.addEventListener(
            "click",
            closeInventoryModal
        );

    }


    const cancelInventoryButton =
        document.getElementById(
            "cancelInventory"
        );

    if (cancelInventoryButton) {

        cancelInventoryButton.addEventListener(
            "click",
            closeInventoryModal
        );

    }


    if (inventoryModal) {

        inventoryModal.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    inventoryModal
                ) {

                    closeInventoryModal();

                }

            }
        );

    }


    /* =========================================================
       MOVEMENT EVENTS
    ========================================================= */

    if (movementProduct) {

        movementProduct.addEventListener(
            "change",
            updateCurrentStock
        );

    }


    if (movementType) {

        movementType.addEventListener(
            "change",
            () => {

                const modalTitle =
                    document.getElementById(
                        "modalTitle"
                    );


                if (!modalTitle) {
                    return;
                }


                modalTitle.textContent =

                    movementType.value ===
                        "stock-in"

                        ? "Stock In"

                        :

                    movementType.value ===
                        "stock-out"

                        ? "Stock Out"

                        :

                    "Stock Adjustment";

            }
        );

    }


    if (inventoryForm) {

        inventoryForm.addEventListener(
            "submit",
            saveMovement
        );

    }


    /* =========================================================
       SEARCH / FILTER EVENTS
    ========================================================= */

    const inventorySearch =
        document.getElementById(
            "inventorySearch"
        );

    if (inventorySearch) {

        inventorySearch.addEventListener(
            "input",
            filterInventory
        );

    }


    const categoryFilter =
        document.getElementById(
            "categoryFilter"
        );

    if (categoryFilter) {

        categoryFilter.addEventListener(
            "change",
            filterInventory
        );

    }


    const stockFilter =
        document.getElementById(
            "stockFilter"
        );

    if (stockFilter) {

        stockFilter.addEventListener(
            "change",
            filterInventory
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

                if (inventorySearch) {

                    inventorySearch.value =
                        "";

                }


                if (categoryFilter) {

                    categoryFilter.value =
                        "all";

                }


                if (stockFilter) {

                    stockFilter.value =
                        "all";

                }


                filterInventory();

            }
        );

    }


    /* =========================================================
       PAGINATION EVENTS
    ========================================================= */

    const previousPage =
        document.getElementById(
            "previousPage"
        );

    if (previousPage) {

        previousPage.addEventListener(
            "click",
            () => {

                if (
                    currentPage >
                    1
                ) {

                    currentPage--;

                    renderInventory();

                }

            }
        );

    }


    const nextPage =
        document.getElementById(
            "nextPage"
        );

    if (nextPage) {

        nextPage.addEventListener(
            "click",
            () => {

                const totalPages =
                    Math.max(

                        1,

                        Math.ceil(

                            filteredProducts.length /
                            productsPerPage

                        )

                    );


                if (
                    currentPage <
                    totalPages
                ) {

                    currentPage++;

                    renderInventory();

                }

            }
        );

    }


    /* =========================================================
       RETRY
    ========================================================= */

    const retryInventory =
        document.getElementById(
            "retryInventory"
        );

    if (retryInventory) {

        retryInventory.addEventListener(
            "click",
            loadProducts
        );

    }


    /* =========================================================
       GLOBAL SEARCH
    ========================================================= */

    const globalSearch =
        document.getElementById(
            "globalSearch"
        );

    if (globalSearch) {

        globalSearch.addEventListener(
            "keydown",
            event => {

                if (
                    event.key ===
                    "Enter"
                ) {

                    if (inventorySearch) {

                        inventorySearch.value =
                            event.target.value;

                        filterInventory();

                    }

                }

            }
        );

    }


    /* =========================================================
       MOVEMENT DATE FILTER
    ========================================================= */
    function applyMovementDateFilters() {
        movementCurrentPage = 1;
        movementFromDate = movementFromDateInput?.value || "";
        movementToDate = movementToDateInput?.value || "";
        if (movementFromDate && movementToDate && movementFromDate > movementToDate) {
            alert("From Date cannot be later than To Date.");
            return;
        }
        renderMovements();
    }
    function clearMovementDateFilters() {
        movementCurrentPage = 1;
        movementFromDate = "";
        movementToDate = "";
        if (movementFromDateInput) movementFromDateInput.value = "";
        if (movementToDateInput) movementToDateInput.value = "";
        renderMovements();
    }
    if (applyMovementDateFilter) applyMovementDateFilter.addEventListener("click", applyMovementDateFilters);
    if (clearMovementDateFilter) clearMovementDateFilter.addEventListener("click", clearMovementDateFilters);

    /* =========================================================
       AUTH
    ========================================================= */

    onAuthStateChanged(

        auth,

        user => {

            if (!user) {

                showError(

                    new Error(
                        "You are not authenticated. Please log in first."
                    )

                );

                return;

            }


            currentUser =
                user;


            const profileName =
                document.getElementById(
                    "profileName"
                );


            if (profileName) {

                profileName.textContent =
                    user.email ||
                    "Administrator";

            }


            const profileRole =
                document.getElementById(
                    "profileRole"
                );


            if (profileRole) {

                profileRole.textContent =
                    "Administrator";

            }


            const profileAvatar =
                document.getElementById(
                    "profileAvatar"
                );


            if (profileAvatar) {

                profileAvatar.textContent =

                    (
                        user.email ||
                        "AD"
                    )

                        .substring(
                            0,
                            2
                        )

                        .toUpperCase();

            }


            loadProducts();

            listenToProducts();

            listenToMovements();
            listenToSalesForMovements();

        }

    );
