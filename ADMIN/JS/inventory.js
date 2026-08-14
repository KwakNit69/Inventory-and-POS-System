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
let filteredProducts = [];
let currentPage = 1;
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


/* =========================================================
   SIDEBAR
========================================================= */

function loadSidebar() {

    const container =
        document.getElementById("sidebar-container");

    if (!container) return;

    fetch("sidebar.html")

        .then(response => {

            if (!response.ok) {
                throw new Error(
                    `Sidebar HTTP ${response.status}`
                );
            }

            return response.text();

        })

        .then(html => {

            container.innerHTML = html;

            const oldScript =
                document.querySelector(
                    "script[data-sidebar]"
                );

            if (oldScript) {
                oldScript.remove();
            }

            const script =
                document.createElement("script");

            script.src =
                "sidebar.js?v=10";

            script.dataset.sidebar =
                "true";

            document.body.appendChild(script);

        })

        .catch(error => {

            console.error(
                "Sidebar error:",
                error
            );

        });
}


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

/*
    IMPORTANT FIX

    Normal inventory movement documents look like:

        productName
        quantity
        type
        reason
        userName

    But POS sale documents look like:

        type: "sale"
        items: [
            {
                name: "...",
                quantity: 2,
                price: 100
            }
        ]

    Therefore one POS sale can produce multiple
    inventory movement rows.

    This function returns an ARRAY.
*/

function normalizeMovement(id, data) {

    const date =
        data.createdAt?.toDate
            ? data.createdAt.toDate()

            : data.createdAt
                ? new Date(data.createdAt)

                : null;


    /* =====================================================
       NORMAL INVENTORY MOVEMENT
    ===================================================== */

    if (
        data.type !== "sale" &&
        data.type !== "Sale"
    ) {

        return [

            {

                id:
                    String(id),

                product:
                    String(
                        data.productName ||
                        data.product ||
                        ""
                    ),

                type:
                    String(
                        data.type ||
                        ""
                    ),

                quantity:
                    Number(
                        data.quantity ||
                        0
                    ),

                reason:
                    String(
                        data.reason ||
                        ""
                    ),

                user:
                    String(
                        data.userName ||
                        data.user ||
                        data.staffName ||
                        "Administrator"
                    ),

                notes:
                    String(
                        data.notes ||
                        ""
                    ),

                transactionNumber:
                    String(
                        data.transactionNumber ||
                        ""
                    ),

                createdAt:
                    date
            }

        ];

    }


    /* =====================================================
       POS SALE
    ===================================================== */

    const items =
        Array.isArray(
            data.items
        )
            ? data.items
            : [];


    const staff =
        data.staffName ||
        data.userName ||
        data.user ||
        "Administrator";


    /*
        If a sale somehow has no items,
        still display the transaction.
    */

    if (!items.length) {

        return [

            {

                id:
                    String(id),

                product:
                    "Sale",

                type:
                    "Sale",

                quantity:
                    0,

                reason:
                    "Sale",

                user:
                    String(staff),

                notes:
                    String(
                        data.transactionNumber
                            ? `Transaction ${data.transactionNumber}`
                            : ""
                    ),

                transactionNumber:
                    String(
                        data.transactionNumber ||
                        ""
                    ),

                createdAt:
                    date
            }

        ];

    }


    /*
        Create one movement for every
        product contained in the POS sale.
    */

    return items.map(
        (item, index) => {

            const quantity =
                Number(
                    item.quantity ||
                    0
                );


            return {

                id:
                    `${String(id)}-${index}`,

                product:
                    String(
                        item.name ||
                        item.productName ||
                        item.product ||
                        item.sku ||
                        "Unknown Product"
                    ),

                type:
                    "Sale",

                /*
                    A sale removes inventory.

                    Example:

                    Sold 3 units
                    => -3

                    This is ONLY for displaying
                    the movement.

                    We do NOT update the product
                    stock here because the POS
                    already updated it.
                */

                quantity:
                    -Math.abs(
                        quantity
                    ),

                reason:
                    "Sale",

                user:
                    String(
                        staff
                    ),

                notes:
                    String(
                        data.transactionNumber
                            ? `Transaction ${data.transactionNumber}`
                            : ""
                    ),

                transactionNumber:
                    String(
                        data.transactionNumber ||
                        ""
                    ),

                createdAt:
                    date
            };

        }
    );

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

    const movementsQuery =
        query(

            collection(
                db,
                "inventoryMovements"
            ),

            orderBy(
                "createdAt",
                "desc"
            )

        );


    return onSnapshot(

        movementsQuery,

        snapshot => {

            /*
                IMPORTANT:

                normalizeMovement()
                returns an ARRAY.

                flatMap() combines all arrays
                into one movement list.

                This allows one POS sale
                containing multiple products
                to appear as multiple rows.
            */

            movements =
                snapshot.docs.flatMap(
                    item =>
                        normalizeMovement(
                            item.id,
                            item.data()
                        )
                );


            renderMovements();

        },

        error => {

            console.error(
                "Movement loading error:",
                error
            );

            movements = [];

            renderMovements();

        }

    );

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

function renderMovements() {

    if (!movementTableBody) {
        return;
    }


    movementTableBody.innerHTML =
        "";


    if (
        !movements.length
    ) {

        if (movementEmpty) {

            movementEmpty.style.display =
                "block";

        }

        return;

    }


    if (movementEmpty) {

        movementEmpty.style.display =
            "none";

    }


    movements

        .slice(
            0,
            10
        )

        .forEach(
            movement => {

                const row =
                    document.createElement(
                        "tr"
                    );


                const date =
                    movement.createdAt

                        ? movement.createdAt.toLocaleString(
                            "en-PH",
                            {
                                year:
                                    "numeric",

                                month:
                                    "short",

                                day:
                                    "2-digit",

                                hour:
                                    "2-digit",

                                minute:
                                    "2-digit"
                            }
                        )

                        : "—";


                /*
                    SALE IS NOW TREATED AS AN
                    OUTGOING INVENTORY MOVEMENT.
                */

                const typeClass =

                    movement.type ===
                        "Stock In"

                        ? "movement-in"

                        :

                    movement.type ===
                        "Stock Out" ||

                    movement.type ===
                        "Sale"

                        ? "movement-out"

                        :

                    "movement-adjustment";


                const quantityClass =

                    movement.quantity >= 0

                        ? "quantity-in"

                        : "quantity-out";


                const quantityText =

                    movement.quantity > 0

                        ? `+${movement.quantity}`

                        : movement.quantity;


                row.innerHTML = `

                    <td>

                        ${escapeHTML(
                            date
                        )}

                    </td>


                    <td>

                        <strong>

                            ${escapeHTML(
                                movement.product
                            )}

                        </strong>

                    </td>


                    <td>

                        <span
                            class="movement-type ${typeClass}"
                        >

                            ${escapeHTML(
                                movement.type
                            )}

                        </span>

                    </td>


                    <td>

                        <span
                            class="${quantityClass}"
                        >

                            ${quantityText}

                        </span>

                    </td>


                    <td>

                        ${escapeHTML(
                            movement.reason
                        )}

                    </td>


                    <td>

                        ${escapeHTML(
                            movement.user
                        )}

                    </td>

                `;


                movementTableBody.appendChild(
                    row
                );

            }
        );

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
   START SIDEBAR
========================================================= */

loadSidebar();


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

    }

);