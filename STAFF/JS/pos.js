import { auth, db } from "../../Firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    collection,
    getDocs,
    getDoc,
    doc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const productsGrid = document.getElementById("productsGrid");
const productSearch = document.getElementById("productSearch");
const categoryFilter = document.getElementById("categoryFilter");
const typeFilter = document.getElementById("typeFilter");
const refreshProducts = document.getElementById("refreshProducts");

const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const subtotalElement = document.getElementById("subtotal");
const discountElement = document.getElementById("discount");
const totalElement = document.getElementById("total");

const checkoutButton = document.getElementById("checkoutButton");
const clearCartButton = document.getElementById("clearCart");

const paymentModal = document.getElementById("paymentModal");
const closePayment = document.getElementById("closePayment");
const paymentTotal = document.getElementById("paymentTotal");
const cashReceived = document.getElementById("cashReceived");
const changeAmount = document.getElementById("changeAmount");
const completeSale = document.getElementById("completeSale");
const paymentError = document.getElementById("paymentError");

const cashPaymentArea = document.getElementById("cashPaymentArea");
const splitPaymentArea = document.getElementById("splitPaymentArea");

const splitCash = document.getElementById("splitCash");
const splitGCash = document.getElementById("splitGCash");
const splitBDO = document.getElementById("splitBDO");
const splitBIBO = document.getElementById("splitBIBO");
const splitBPI = document.getElementById("splitBPI");

const splitTotalPaid = document.getElementById("splitTotalPaid");
const splitRemaining = document.getElementById("splitRemaining");

const successModal = document.getElementById("successModal");
const successMessage = document.getElementById("successMessage");
const successTotal = document.getElementById("successTotal");
const newSaleButton = document.getElementById("newSaleButton");

const posError = document.getElementById("posError");
const posErrorMessage = document.getElementById("posErrorMessage");
const retryButton = document.getElementById("retryButton");

const staffName = document.getElementById("staffName");
const staffRole = document.getElementById("staffRole");
const staffAvatar = document.getElementById("staffAvatar");
const staffStatus = document.getElementById("staffStatus");

let currentUser = null;
let currentProfile = null;

let products = [];
let categories = [];
let cart = [];

let selectedPaymentMethod = "Cash";

/* =========================================================
   HELPERS
========================================================= */

const money = value =>
    new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(Number(value) || 0);

const escapeHtml = value =>
    String(value ?? "").replace(
        /[&<>"']/g,
        char =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            })[char]
    );

const initials = name => {
    const parts = String(name || "Staff")
        .trim()
        .split(/\s+/);

    if (parts.length > 1) {
        return (
            parts[0][0] +
            parts[parts.length - 1][0]
        ).toUpperCase();
    }

    return String(name || "ST")
        .substring(0, 2)
        .toUpperCase();
};

const getName = item =>
    item.name ??
    item.productName ??
    item.title ??
    item.packageName ??
    item.insuranceName ??
    "Unnamed";

const getSku = item =>
    item.sku ??
    item.SKU ??
    item.productCode ??
    item.code ??
    "";

const getPrice = item =>
    Number(
        item.sellingPrice ??
        item.price ??
        item.salePrice ??
        item.unitPrice ??
        item.premium ??
        item.amount ??
        0
    );

const getStock = item =>
    Number(
        item.stock ??
        item.currentStock ??
        item.quantity ??
        0
    );

const getCategory = item =>
    item.category ??
    item.categoryName ??
    item.categoryId ??
    "Uncategorized";

const getImage = item =>
    item.imageUrl ??
    item.imageURL ??
    item.image ??
    item.photoUrl ??
    item.photoURL ??
    item.productImage ??
    item.packageImage ??
    item.insuranceImage ??
    "";

const getType = item => {
    if (item.itemType) {
        return String(item.itemType).toLowerCase();
    }

    if (item.type) {
        return String(item.type).toLowerCase();
    }

    if (item.sourceCollection === "packages") {
        return "package";
    }

    if (item.sourceCollection === "insurances") {
        return "insurance";
    }

    return "product";
};

const normalizeCategory = name => {
    const value = String(name ?? "").trim();
    const lower = value.toLowerCase();

    if (lower === "package" || lower === "packages") {
        return "Packages";
    }

    if (lower === "insurance" || lower === "insurances") {
        return "Insurance";
    }

    return value;
};

const getPackageItems = item => {
    if (Array.isArray(item.items)) {
        return item.items;
    }

    if (Array.isArray(item.packageItems)) {
        return item.packageItems;
    }

    if (Array.isArray(item.components)) {
        return item.components;
    }

    return [];
};

/* =========================================================
   CART CALCULATIONS
========================================================= */

const cartSubtotal = () =>
    cart.reduce(
        (sum, item) =>
            sum + item.price * item.quantity,
        0
    );

const getDiscount = () => {
    if (!discountElement) {
        return 0;
    }

    let value = parseFloat(discountElement.value);

    if (!Number.isFinite(value) || value < 0) {
        value = 0;
    }

    return Math.min(
        value,
        cartSubtotal()
    );
};

const cartTotal = () =>
    Math.max(
        cartSubtotal() - getDiscount(),
        0
    );

const cartQuantity = () =>
    cart.reduce(
        (sum, item) =>
            sum + item.quantity,
        0
    );

/* =========================================================
   ERROR HANDLING
========================================================= */

const showError = error => {
    console.error(
        "Staff POS error:",
        error
    );

    if (posError) {
        posError.classList.add("show");
    }

    if (posErrorMessage) {
        posErrorMessage.textContent =
            error?.message ||
            "Unable to connect to Firebase.";
    }
};

const hideError = () => {
    if (posError) {
        posError.classList.remove("show");
    }
};

/* =========================================================
   STAFF INFORMATION
========================================================= */

const loadStaffInfo = async user => {
    const storedName =
        sessionStorage.getItem("userName");

    let profile = {};

    try {
        const profileSnap = await getDoc(
            doc(db, "users", user.uid)
        );

        if (profileSnap.exists()) {
            profile = profileSnap.data();
        }
    } catch (error) {
        console.warn(
            "Unable to load staff profile:",
            error
        );
    }

    currentProfile = profile;

    const name =
        profile.fullName ||
        profile.name ||
        storedName ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Staff";

    const role =
        profile.role ||
        sessionStorage.getItem("userRole") ||
        "Staff / Cashier";

    const status =
        profile.status ||
        "Active";

    if (staffName) {
        staffName.textContent = name;
    }

    if (staffRole) {
        staffRole.textContent = role;
    }

    if (staffAvatar) {
        staffAvatar.textContent =
            initials(name);
    }

    if (staffStatus) {
        staffStatus.innerHTML =
            `<span></span>${escapeHtml(status)}`;

        if (
            String(status).toLowerCase() !==
            "active"
        ) {
            staffStatus.classList.add(
                "offline"
            );
        } else {
            staffStatus.classList.remove(
                "offline"
            );
        }
    }
};

/* =========================================================
   CATEGORIES
========================================================= */

const loadCategories = async () => {
    const categoryMap = new Map();

    try {
        const snapshot = await getDocs(
            collection(db, "categories")
        );

        snapshot.forEach(document => {
            const data = document.data();

            const rawName =
                data.name ??
                data.categoryName ??
                data.title ??
                document.id;

            const name =
                normalizeCategory(rawName);

            if (!name) {
                return;
            }

            const key =
                name.toLowerCase();

            if (!categoryMap.has(key)) {
                categoryMap.set(
                    key,
                    {
                        id: key,
                        name
                    }
                );
            }
        });
    } catch (error) {
        console.warn(
            "Categories collection could not be loaded:",
            error
        );
    }

    products.forEach(item => {
        if (getType(item) !== "product") {
            return;
        }

        const name =
            normalizeCategory(
                getCategory(item)
            );

        if (
            !name ||
            name === "Uncategorized"
        ) {
            return;
        }

        const key =
            name.toLowerCase();

        if (!categoryMap.has(key)) {
            categoryMap.set(
                key,
                {
                    id: key,
                    name
                }
            );
        }
    });

    categories =
        [...categoryMap.values()]
            .sort((a, b) =>
                a.name.localeCompare(
                    b.name
                )
            );

    if (!categoryFilter) {
        return;
    }

    categoryFilter.innerHTML =
        '<option value="all">All Categories</option>';

    categories.forEach(category => {
        const option =
            document.createElement(
                "option"
            );

        option.value =
            category.id;

        option.textContent =
            category.name;

        categoryFilter.appendChild(
            option
        );
    });
};

/* =========================================================
   LOAD PRODUCTS
========================================================= */

const loadProducts = async () => {
    productsGrid.innerHTML =
        '<div class="loading-products">Loading products, packages and insurance...</div>';

    const loadedItems = [];

    const productSnapshot =
        await getDocs(
            collection(db, "products")
        );

    productSnapshot.forEach(
        document => {
            const data =
                document.data();

            loadedItems.push({
                id: document.id,
                ...data,
                itemType: "product",
                sourceCollection:
                    "products"
            });
        }
    );

    try {
        const packageSnapshot =
            await getDocs(
                collection(db, "packages")
            );

        packageSnapshot.forEach(
            document => {
                const data =
                    document.data();

                if (data.active === false) {
                    return;
                }

                loadedItems.push({
                    id: document.id,
                    ...data,
                    itemType: "package",
                    sourceCollection:
                        "packages",
                    category:
                        normalizeCategory(
                            data.category ??
                            data.categoryName ??
                            "Packages"
                        ),
                    sellingPrice:
                        Number(
                            data.sellingPrice ??
                            data.price ??
                            0
                        ),
                    price:
                        Number(
                            data.sellingPrice ??
                            data.price ??
                            0
                        ),
                    imageUrl:
                        data.imageUrl ?? "",
                    items:
                        Array.isArray(
                            data.items
                        )
                            ? data.items
                            : []
                });
            }
        );
    } catch (error) {
        console.error(
            "Packages loading error:",
            error
        );
    }

    try {
        const insuranceSnapshot =
            await getDocs(
                collection(db, "insurances")
            );

        insuranceSnapshot.forEach(
            document => {
                const data =
                    document.data();

                const status =
                    String(
                        data.status ??
                        "active"
                    ).toLowerCase();

                if (status !== "active") {
                    return;
                }

                loadedItems.push({
                    id: document.id,
                    ...data,
                    itemType:
                        "insurance",
                    sourceCollection:
                        "insurances",
                    category:
                        "Insurance",
                    sellingPrice:
                        Number(
                            data.sellingPrice ??
                            data.price ??
                            data.premium ??
                            0
                        ),
                    price:
                        Number(
                            data.sellingPrice ??
                            data.price ??
                            data.premium ??
                            0
                        ),
                    imageUrl:
                        data.imageUrl ?? ""
                });
            }
        );
    } catch (error) {
        console.error(
            "Insurance loading error:",
            error
        );
    }

    products = loadedItems;

    await loadCategories();

    renderProducts();
};

const getProductById =
    productId =>
        products.find(
            item =>
                item.sourceCollection ===
                    "products" &&
                item.id === productId
        );

/* =========================================================
   PACKAGE AVAILABILITY
========================================================= */

const normalizePackageItem = item => {
    const productId =
        item.productId ??
        item.productID ??
        item.product ??
        item.id;

    const quantity =
        Number(
            item.quantity ??
            item.qty ??
            1
        );

    return {
        productId,
        quantity:
            Number.isFinite(quantity) &&
            quantity > 0
                ? quantity
                : 1
    };
};

const checkPackageAvailability =
    packageItem => {
        const packageItems =
            getPackageItems(
                packageItem
            );

        if (!packageItems.length) {
            return {
                available: false,
                message:
                    "This package has no items configured."
            };
        }

        for (
            const rawItem
            of packageItems
        ) {
            const component =
                normalizePackageItem(
                    rawItem
                );

            if (!component.productId) {
                return {
                    available: false,
                    message:
                        "A package item is missing its product ID."
                };
            }

            const product =
                getProductById(
                    component.productId
                );

            if (!product) {
                return {
                    available: false,
                    message:
                        `Package product ${component.productId} was not found.`
                };
            }

            const stock =
                getStock(product);

            if (
                stock <
                component.quantity
            ) {
                return {
                    available: false,
                    message:
                        `${getName(product)} has insufficient stock.`
                };
            }
        }

        return {
            available: true,
            message: "Available"
        };
    };

/* =========================================================
   RENDER PRODUCTS
========================================================= */

const renderProducts = () => {
    const search =
        productSearch.value
            .trim()
            .toLowerCase();

    const selectedCategory =
        categoryFilter.value;

    const selectedType =
        typeFilter
            ? typeFilter.value
            : "all";

    const filtered =
        products.filter(item => {
            const name =
                getName(item)
                    .toLowerCase();

            const sku =
                getSku(item)
                    .toLowerCase();

            const itemType =
                getType(item);

            const normalizedItemCategory =
                normalizeCategory(
                    getCategory(item)
                ).toLowerCase();

            const matchesSearch =
                !search ||
                name.includes(search) ||
                sku.includes(search);

            let matchesCategory = true;

            if (
                selectedCategory !==
                "all"
            ) {
                const selectedCategoryObject =
                    categories.find(
                        category =>
                            category.id ===
                            selectedCategory
                    );

                const selectedName =
                    String(
                        selectedCategoryObject?.name ??
                        selectedCategory
                    )
                        .trim()
                        .toLowerCase();

                matchesCategory =
                    normalizedItemCategory ===
                    selectedName;
            }

            const matchesType =
                selectedType === "all" ||
                itemType ===
                    selectedType;

            return (
                matchesSearch &&
                matchesCategory &&
                matchesType
            );
        });

    if (!filtered.length) {
        productsGrid.innerHTML =
            '<div class="no-products">No products, packages or insurance found.</div>';

        return;
    }

    productsGrid.innerHTML =
        filtered
            .map(item => {
                const itemType =
                    getType(item);

                const packageItem =
                    itemType ===
                    "package";

                const insurance =
                    itemType ===
                    "insurance";

                let available = true;
                let stockText = "";

                if (insurance) {
                    stockText =
                        "No stock required";
                } else if (packageItem) {
                    const availability =
                        checkPackageAvailability(
                            item
                        );

                    available =
                        availability.available;

                    stockText =
                        available
                            ? "Package available"
                            : availability.message;
                } else {
                    const stock =
                        getStock(item);

                    available =
                        stock > 0;

                    stockText =
                        stock > 0
                            ? `${stock} in stock`
                            : "Out of Stock";
                }

                const image =
                    getImage(item);

                const price =
                    getPrice(item);

                const typeLabel =
                    insurance
                        ? "INSURANCE"
                        : packageItem
                        ? "PACKAGE"
                        : "PRODUCT";

                const buttonText =
                    !available
                        ? "Unavailable"
                        : insurance
                        ? "Add Insurance"
                        : packageItem
                        ? "Add Package"
                        : "Add to Cart";

                return `
<article class="product-card ${itemType} ${available ? "" : "out"}">

    <div class="product-image">
        ${
            image
                ? `<img
                    src="${escapeHtml(image)}"
                    alt="${escapeHtml(getName(item))}"
                    onerror="this.style.display='none';this.parentElement.classList.add('image-error')"
                >`
                : `<span>${
                    insurance
                        ? "🛡"
                        : packageItem
                        ? "▦"
                        : "₱"
                }</span>`
        }
    </div>

    <div class="type-badge ${itemType}">
        ${typeLabel}
    </div>

    <div class="product-name">
        ${escapeHtml(getName(item))}
    </div>

    <div class="product-sku">
        ${escapeHtml(getSku(item))}
    </div>

    ${
        packageItem
            ? `<div class="package-info">
                ${getPackageItems(item).length}
                included item${
                    getPackageItems(item).length === 1
                        ? ""
                        : "s"
                }
            </div>`
            : ""
    }

    <div class="product-bottom">

        <div class="product-price">
            ${money(price)}
        </div>

        <div class="product-stock ${available ? "" : "out"}">
            ${escapeHtml(stockText)}
        </div>

        <button
            class="add-product"
            data-product-id="${escapeHtml(item.id)}"
            ${available ? "" : "disabled"}
        >
            ${buttonText}
        </button>

    </div>

</article>`;
            })
            .join("");

    document
        .querySelectorAll(".add-product")
        .forEach(button => {
            button.addEventListener(
                "click",
                () =>
                    addToCart(
                        button.dataset
                            .productId
                    )
            );
        });
};

/* =========================================================
   CART
========================================================= */

const addToCart = productId => {
    const item =
        products.find(
            product =>
                product.id ===
                productId
        );

    if (!item) {
        return;
    }

    const itemType =
        getType(item);

    const existing =
        cart.find(
            cartItem =>
                cartItem.productId ===
                productId
        );

    if (
        itemType ===
        "insurance"
    ) {
        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({
                productId: item.id,
                name: getName(item),
                sku: getSku(item),
                category: "Insurance",
                price: getPrice(item),
                quantity: 1,
                stock: 0,
                itemType: "insurance",
                image: getImage(item),
                packageItems: []
            });
        }

        renderCart();

        return;
    }

    if (
        itemType ===
        "package"
    ) {
        const availability =
            checkPackageAvailability(
                item
            );

        if (!availability.available) {
            alert(
                availability.message
            );

            return;
        }

        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({
                productId: item.id,
                name: getName(item),
                sku: getSku(item),
                category: "Packages",
                price: getPrice(item),
                quantity: 1,
                stock: 0,
                itemType: "package",
                image: getImage(item),
                packageItems:
                    getPackageItems(item)
            });
        }

        renderCart();

        return;
    }

    const stock =
        getStock(item);

    if (stock <= 0) {
        alert(
            "This product is out of stock."
        );

        return;
    }

    if (existing) {
        if (
            existing.quantity >=
            stock
        ) {
            alert(
                "You cannot add more than the available stock."
            );

            return;
        }

        existing.quantity += 1;
    } else {
        cart.push({
            productId: item.id,
            name: getName(item),
            sku: getSku(item),
            category:
                getCategory(item),
            price: getPrice(item),
            quantity: 1,
            stock,
            itemType: "product",
            image: getImage(item),
            packageItems: []
        });
    }

    renderCart();
};

const changeQuantity = (
    productId,
    amount
) => {
    const item =
        cart.find(
            cartItem =>
                cartItem.productId ===
                productId
        );

    if (!item) {
        return;
    }

    const source =
        products.find(
            product =>
                product.id ===
                productId
        );

    const newQuantity =
        item.quantity + amount;

    if (newQuantity <= 0) {
        removeFromCart(productId);

        return;
    }

    if (
        item.itemType ===
        "product"
    ) {
        const stock =
            getStock(source);

        if (
            newQuantity >
            stock
        ) {
            alert(
                "Quantity cannot exceed available stock."
            );

            return;
        }
    }

    if (
        item.itemType ===
        "package"
    ) {
        for (
            let i = 0;
            i < newQuantity;
            i++
        ) {
            const availability =
                checkPackageAvailability(
                    source
                );

            if (
                !availability.available
            ) {
                alert(
                    availability.message
                );

                return;
            }
        }
    }

    item.quantity =
        newQuantity;

    renderCart();
};

const removeFromCart =
    productId => {
        cart =
            cart.filter(
                item =>
                    item.productId !==
                    productId
            );

        renderCart();
    };

const renderCart = () => {
    const subtotal =
        cartSubtotal();

    const total =
        cartTotal();

    const quantity =
        cartQuantity();

    cartCount.textContent =
        `${quantity} item${
            quantity === 1
                ? ""
                : "s"
        }`;

    subtotalElement.textContent =
        money(subtotal);

    totalElement.textContent =
        money(total);

    checkoutButton.disabled =
        cart.length === 0;

    if (!cart.length) {
        cartItems.innerHTML = `
<div class="empty-cart">
    <div class="empty-cart-icon">₱</div>
    <strong>No items in cart</strong>
    <span>Add products, packages or insurance.</span>
</div>`;

        return;
    }

    cartItems.innerHTML =
        cart.map(item => {
            const badge =
                item.itemType ===
                "insurance"
                    ? "INSURANCE"
                    : item.itemType ===
                      "package"
                    ? "PACKAGE"
                    : "PRODUCT";

            return `
<div class="cart-item">

    <div>

        <div class="cart-item-top">
            <span class="cart-type ${item.itemType}">
                ${badge}
            </span>
        </div>

        <div class="cart-item-name">
            ${escapeHtml(item.name)}
        </div>

        <div class="cart-item-price">
            ${money(item.price)} each
        </div>

        <div class="cart-item-controls">

            <button
                class="qty-button"
                data-action="minus"
                data-id="${escapeHtml(item.productId)}"
            >
                −
            </button>

            <span class="qty-value">
                ${item.quantity}
            </span>

            <button
                class="qty-button"
                data-action="plus"
                data-id="${escapeHtml(item.productId)}"
            >
                +
            </button>

            <button
                class="remove-item"
                data-action="remove"
                data-id="${escapeHtml(item.productId)}"
            >
                ×
            </button>

        </div>

    </div>

    <div class="cart-item-total">
        ${money(
            item.price *
            item.quantity
        )}
    </div>

</div>`;
        }).join("");

    document
        .querySelectorAll(
            ".qty-button,.remove-item"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    const id =
                        button.dataset
                            .id;

                    const action =
                        button.dataset
                            .action;

                    if (
                        action ===
                        "minus"
                    ) {
                        changeQuantity(
                            id,
                            -1
                        );
                    }

                    if (
                        action ===
                        "plus"
                    ) {
                        changeQuantity(
                            id,
                            1
                        );
                    }

                    if (
                        action ===
                        "remove"
                    ) {
                        removeFromCart(
                            id
                        );
                    }
                }
            );
        });
};

/* =========================================================
   SPLIT PAYMENT
   FIXED: CASH + GCASH + BDO + BIBO + BPI
========================================================= */

const resetSplitPayment = () => {

    if (splitCash) {
        splitCash.value = "";
    }

    if (splitGCash) {
        splitGCash.value = "";
    }

    if (splitBDO) {
        splitBDO.value = "";
    }

    if (splitBIBO) {
        splitBIBO.value = "";
    }

    /* FIX: RESET BPI */
    if (splitBPI) {
        splitBPI.value = "";
    }

    if (splitTotalPaid) {
        splitTotalPaid.textContent =
            money(0);
    }

    if (splitRemaining) {
        splitRemaining.textContent =
            money(cartTotal());
    }

    if (changeAmount) {
        changeAmount.textContent =
            money(0);
    }
};

/*
 * FIX:
 * BPI IS NOW INCLUDED IN THE SPLIT AMOUNTS.
 */
const getSplitAmounts = () => {

    return {
        Cash:
            Number(
                splitCash?.value
            ) || 0,

        GCash:
            Number(
                splitGCash?.value
            ) || 0,

        BDO:
            Number(
                splitBDO?.value
            ) || 0,

        BIBO:
            Number(
                splitBIBO?.value
            ) || 0,

        BPI:
            Number(
                splitBPI?.value
            ) || 0
    };
};

/*
 * FIX:
 * BPI IS NOW INCLUDED IN TOTAL PAID.
 */
const getSplitTotal = () => {

    const amounts =
        getSplitAmounts();

    return (
        amounts.Cash +
        amounts.GCash +
        amounts.BDO +
        amounts.BIBO +
        amounts.BPI
    );
};

const updateSplitPayment = () => {

    const total =
        cartTotal();

    const paid =
        getSplitTotal();

    const remaining =
        Math.max(
            total - paid,
            0
        );

    if (splitTotalPaid) {
        splitTotalPaid.textContent =
            money(paid);
    }

    if (splitRemaining) {
        splitRemaining.textContent =
            money(remaining);
    }

    if (paid > total) {

        if (splitRemaining) {
            splitRemaining.textContent =
                money(0);
        }

        if (changeAmount) {
            changeAmount.textContent =
                money(
                    paid - total
                );
        }

    } else {

        if (changeAmount) {
            changeAmount.textContent =
                money(0);
        }
    }
};

/* =========================================================
   PAYMENT MODAL
========================================================= */

const openPaymentModal = () => {

    if (!cart.length) {
        return;
    }

    const total =
        cartTotal();

    paymentTotal.textContent =
        money(total);

    cashReceived.value = "";

    changeAmount.textContent =
        money(0);

    paymentError.textContent =
        "";

    if (discountElement) {
        discountElement.value =
            "0";
    }

    selectedPaymentMethod =
        "Cash";

    document
        .querySelectorAll(
            ".payment-method"
        )
        .forEach(button => {
            button.classList.toggle(
                "active",
                button.dataset
                    .method ===
                    "Cash"
            );
        });

    cashPaymentArea.style.display =
        "block";

    splitPaymentArea.style.display =
        "none";

    resetSplitPayment();

    paymentModal.classList.add(
        "show"
    );

    setTimeout(
        () =>
            cashReceived.focus(),
        100
    );
};

const closePaymentModal = () => {

    paymentModal.classList.remove(
        "show"
    );

    paymentError.textContent =
        "";
};

/* =========================================================
   PAYMENT TOTAL
========================================================= */

const updatePaymentTotal = () => {

    const total =
        cartTotal();

    paymentTotal.textContent =
        money(total);

    if (
        selectedPaymentMethod ===
        "Cash"
    ) {

        const received =
            Number(
                cashReceived.value
            ) || 0;

        const change =
            Math.max(
                received - total,
                0
            );

        changeAmount.textContent =
            money(change);

    } else if (
        selectedPaymentMethod ===
        "Split"
    ) {

        updateSplitPayment();

    } else {

        changeAmount.textContent =
            money(0);
    }
};

/* =========================================================
   TRANSACTION NUMBER
========================================================= */

const generateTransactionNumber =
    () => {

        const now =
            new Date();

        const date =
            now
                .toISOString()
                .replace(/\D/g, "")
                .substring(
                    0,
                    14
                );

        const random =
            Math.floor(
                1000 +
                Math.random() *
                    9000
            );

        return `TXN-${date}-${random}`;
    };

/* =========================================================
   STOCK DEDUCTIONS
========================================================= */

const getStockDeductions =
    () => {

        const deductions =
            new Map();

        for (
            const item of cart
        ) {

            if (
                item.itemType ===
                "insurance"
            ) {
                continue;
            }

            if (
                item.itemType ===
                "product"
            ) {

                deductions.set(
                    item.productId,
                    (
                        deductions.get(
                            item.productId
                        ) || 0
                    ) +
                        item.quantity
                );

                continue;
            }

            if (
                item.itemType ===
                "package"
            ) {

                for (
                    const rawComponent
                    of getPackageItems(
                        item
                    )
                ) {

                    const component =
                        normalizePackageItem(
                            rawComponent
                        );

                    if (
                        !component.productId
                    ) {
                        continue;
                    }

                    const quantity =
                        component.quantity *
                        item.quantity;

                    deductions.set(
                        component.productId,
                        (
                            deductions.get(
                                component.productId
                            ) || 0
                        ) +
                            quantity
                    );
                }
            }
        }

        return deductions;
    };

/* =========================================================
   SPLIT PAYMENT TYPES
========================================================= */

const getSplitPaymentTypes =
    amounts => {

        return Object.entries(
            amounts
        )
            .filter(
                ([, amount]) =>
                    Number(amount) > 0
            )
            .map(
                ([method, amount]) => ({
                    method,
                    amount:
                        Number(amount)
                })
            );
    };

/* =========================================================
   PAYMENT BREAKDOWN
   FIXED: BPI INCLUDED EVERYWHERE
========================================================= */

const getPaymentBreakdown =
    total => {

        /* =========================
           CASH
        ========================= */

        if (
            selectedPaymentMethod ===
            "Cash"
        ) {

            const received =
                Number(
                    cashReceived.value
                ) || 0;

            return {
                Cash: received,
                GCash: 0,
                BDO: 0,
                BIBO: 0,
                BPI: 0,

                totalPaid:
                    received,

                paymentTypes: [
                    {
                        method:
                            "Cash",
                        amount:
                            received
                    }
                ]
            };
        }

        /* =========================
           GCASH
        ========================= */

        if (
            selectedPaymentMethod ===
            "GCash"
        ) {

            return {
                Cash: 0,
                GCash: total,
                BDO: 0,
                BIBO: 0,
                BPI: 0,

                totalPaid:
                    total,

                paymentTypes: [
                    {
                        method:
                            "GCash",
                        amount:
                            total
                    }
                ]
            };
        }

        /* =========================
           BDO
        ========================= */

        if (
            selectedPaymentMethod ===
            "BDO"
        ) {

            return {
                Cash: 0,
                GCash: 0,
                BDO: total,
                BIBO: 0,
                BPI: 0,

                totalPaid:
                    total,

                paymentTypes: [
                    {
                        method:
                            "BDO",
                        amount:
                            total
                    }
                ]
            };
        }

        /* =========================
           BIBO
        ========================= */

        if (
            selectedPaymentMethod ===
            "BIBO"
        ) {

            return {
                Cash: 0,
                GCash: 0,
                BDO: 0,
                BIBO: total,
                BPI: 0,

                totalPaid:
                    total,

                paymentTypes: [
                    {
                        method:
                            "BIBO",
                        amount:
                            total
                    }
                ]
            };
        }

        /* =========================
           BPI
        ========================= */

        if (
            selectedPaymentMethod ===
            "BPI"
        ) {

            return {
                Cash: 0,
                GCash: 0,
                BDO: 0,
                BIBO: 0,
                BPI: total,

                totalPaid:
                    total,

                paymentTypes: [
                    {
                        method:
                            "BPI",
                        amount:
                            total
                    }
                ]
            };
        }

        /* =========================
           SPLIT PAYMENT
        ========================= */

        const splitAmounts =
            getSplitAmounts();

        const splitPaymentTypes =
            getSplitPaymentTypes(
                splitAmounts
            );

        return {
            Cash:
                splitAmounts.Cash,

            GCash:
                splitAmounts.GCash,

            BDO:
                splitAmounts.BDO,

            BIBO:
                splitAmounts.BIBO,

            BPI:
                splitAmounts.BPI,

            totalPaid:
                getSplitTotal(),

            splitPaymentTypes,

            splitPaymentType:
                splitPaymentTypes
                    .map(
                        item =>
                            item.method
                    )
                    .join(" + ") ||
                "Split"
        };
    };

/* =========================================================
   PAYMENT VALIDATION
========================================================= */

const validatePayment =
    total => {

        /* =========================
           CASH
        ========================= */

        if (
            selectedPaymentMethod ===
            "Cash"
        ) {

            const received =
                Number(
                    cashReceived.value
                ) || 0;

            if (
                received < total
            ) {

                paymentError.textContent =
                    `Cash received is ${money(
                        total - received
                    )} short.`;

                return false;
            }

            return true;
        }

        /* =========================
           SPLIT
        ========================= */

        if (
            selectedPaymentMethod ===
            "Split"
        ) {

            const paid =
                getSplitTotal();

            if (paid <= 0) {

                paymentError.textContent =
                    "Please enter at least one split payment amount.";

                return false;
            }

            if (
                paid < total
            ) {

                paymentError.textContent =
                    `Split payment is ${money(
                        total - paid
                    )} short.`;

                return false;
            }

            return true;
        }

        return true;
    };

/* =========================================================
   COMPLETE TRANSACTION
========================================================= */

const completeTransaction =
    async () => {

        if (!currentUser) {

            paymentError.textContent =
                "You are not authenticated. Please log in again.";

            return;
        }

        if (!cart.length) {

            paymentError.textContent =
                "Your cart is empty.";

            return;
        }

        const subtotal =
            cartSubtotal();

        const discount =
            getDiscount();

        const total =
            cartTotal();

        if (
            !validatePayment(
                total
            )
        ) {
            return;
        }

        const paymentBreakdown =
            getPaymentBreakdown(
                total
            );

        const received =
            paymentBreakdown.totalPaid;

        completeSale.disabled =
            true;

        completeSale.textContent =
            "Processing...";

        paymentError.textContent =
            "";

        try {

            const transactionNumber =
                generateTransactionNumber();

            const saleRef =
                doc(
                    collection(
                        db,
                        "sales"
                    )
                );

            const movementRef =
                doc(
                    collection(
                        db,
                        "inventoryMovements"
                    )
                );

            const cashFlowRef =
                doc(
                    collection(
                        db,
                        "cashFlow"
                    )
                );

            const timestamp =
                new Date();

            const cashierName =
                currentProfile?.fullName ||
                currentProfile?.name ||
                sessionStorage.getItem(
                    "userName"
                ) ||
                currentUser.displayName ||
                currentUser.email?.split(
                    "@"
                )[0] ||
                "Staff";

            const cashierRole =
                currentProfile?.role ||
                sessionStorage.getItem(
                    "userRole"
                ) ||
                "Staff / Cashier";

            /* =========================
               SALE ITEMS
            ========================= */

            const saleItems =
                cart.map(item => ({
                    productId:
                        item.productId,

                    name:
                        item.name,

                    sku:
                        item.sku,

                    category:
                        item.category,

                    price:
                        item.price,

                    quantity:
                        item.quantity,

                    subtotal:
                        item.price *
                        item.quantity,

                    itemType:
                        item.itemType,

                    sourceCollection:
                        item.itemType ===
                        "package"
                            ? "packages"
                            : item.itemType ===
                              "insurance"
                            ? "insurances"
                            : "products",

                    image:
                        item.image ||
                        "",

                    packageItems:
                        item.itemType ===
                        "package"
                            ? item.packageItems
                            : [],

                    insuranceId:
                        item.itemType ===
                        "insurance"
                            ? item.productId
                            : null,

                    stockDeducted:
                        item.itemType !==
                        "insurance"
                }));

            const stockDeductions =
                getStockDeductions();

            /* =========================
               FIREBASE TRANSACTION
            ========================= */

            await runTransaction(
                db,
                async transaction => {

                    const deductionRefs =
                        [
                            ...stockDeductions.keys()
                        ].map(
                            productId =>
                                doc(
                                    db,
                                    "products",
                                    productId
                                )
                        );

                    const snapshots = [];

                    for (
                        const ref
                        of deductionRefs
                    ) {

                        const snapshot =
                            await transaction.get(
                                ref
                            );

                        if (
                            !snapshot.exists()
                        ) {
                            throw new Error(
                                "A product required for this sale no longer exists."
                            );
                        }

                        snapshots.push(
                            snapshot
                        );
                    }

                    /* =========================
                       UPDATE STOCK
                    ========================= */

                    for (
                        let index = 0;
                        index <
                        deductionRefs.length;
                        index++
                    ) {

                        const ref =
                            deductionRefs[
                                index
                            ];

                        const snapshot =
                            snapshots[
                                index
                            ];

                        const required =
                            stockDeductions.get(
                                ref.id
                            ) || 0;

                        const data =
                            snapshot.data();

                        const currentStock =
                            Number(
                                data.stock ??
                                data.currentStock ??
                                data.quantity ??
                                0
                            );

                        if (
                            currentStock <
                            required
                        ) {
                            throw new Error(
                                `${getName(
                                    data
                                )} does not have enough stock. Available: ${currentStock}, required: ${required}.`
                            );
                        }

                        transaction.update(
                            ref,
                            {
                                stock:
                                    currentStock -
                                    required,

                                updatedAt:
                                    timestamp,

                                updatedBy:
                                    currentUser.uid
                            }
                        );
                    }

                    /* =========================
                       SAVE SALE
                    ========================= */

                    transaction.set(
                        saleRef,
                        {

                            transactionId:
                                saleRef.id,

                            transactionNumber,

                            items:
                                saleItems,

                            itemCount:
                                cartQuantity(),

                            subtotal,

                            discount,

                            total,

                            paymentMethod:
                                selectedPaymentMethod,

                            /*
                             * IMPORTANT:
                             * BPI IS NOW SAVED.
                             */
                            paymentBreakdown: {

                                Cash:
                                    paymentBreakdown.Cash,

                                GCash:
                                    paymentBreakdown.GCash,

                                BDO:
                                    paymentBreakdown.BDO,

                                BIBO:
                                    paymentBreakdown.BIBO,

                                BPI:
                                    paymentBreakdown.BPI
                            },

                            splitPayment:
                                selectedPaymentMethod ===
                                "Split",

                            splitPaymentType:
                                selectedPaymentMethod ===
                                "Split"
                                    ? paymentBreakdown.splitPaymentType
                                    : null,

                            splitPayments:
                                selectedPaymentMethod ===
                                "Split"
                                    ? paymentBreakdown.splitPaymentTypes
                                    : [],

                            amountPaid:
                                received,

                            change:
                                selectedPaymentMethod ===
                                "Cash"
                                    ? Math.max(
                                        received -
                                            total,
                                        0
                                    )
                                    : selectedPaymentMethod ===
                                      "Split"
                                    ? Math.max(
                                        received -
                                            total,
                                        0
                                    )
                                    : 0,

                            status:
                                "Completed",

                            cashierName,

                            cashierRole,

                            cashierUid:
                                currentUser.uid,

                            cashierId:
                                currentUser.uid,

                            cashierEmail:
                                currentUser.email ||
                                "",

                            staffName:
                                cashierName,

                            staffUid:
                                currentUser.uid,

                            staffEmail:
                                currentUser.email ||
                                "",

                            createdBy:
                                currentUser.uid,

                            createdByEmail:
                                currentUser.email ||
                                "",

                            createdAt:
                                timestamp,

                            date:
                                timestamp
                        }
                    );

                    /* =========================
                       INVENTORY MOVEMENT
                    ========================= */

                    transaction.set(
                        movementRef,
                        {

                            type:
                                "OUT",

                            movementType:
                                "SALE",

                            reason:
                                "Sale",

                            referenceId:
                                saleRef.id,

                            transactionId:
                                saleRef.id,

                            transactionNumber,

                            items:
                                saleItems,

                            stockDeductions:
                                [
                                    ...stockDeductions.entries()
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
                                    ...stockDeductions.values()
                                ].reduce(
                                    (
                                        sum,
                                        value
                                    ) =>
                                        sum +
                                        value,
                                    0
                                ),

                            staffName:
                                cashierName,

                            staffUid:
                                currentUser.uid,

                            staffEmail:
                                currentUser.email ||
                                "",

                            createdBy:
                                currentUser.uid,

                            createdAt:
                                timestamp,

                            date:
                                timestamp
                        }
                    );

                    /* =========================
                       CASH FLOW
                    ========================= */

                    transaction.set(
                        cashFlowRef,
                        {

                            type:
                                "cashIn",

                            flowType:
                                "SALE",

                            category:
                                "Sales",

                            description:
                                `Sale ${transactionNumber}`,

                            referenceId:
                                saleRef.id,

                            transactionId:
                                saleRef.id,

                            transactionNumber,

                            amount:
                                total,

                            cashIn:
                                total,

                            cashOut:
                                0,

                            discount,

                            paymentMethod:
                                selectedPaymentMethod,

                            /*
                             * IMPORTANT:
                             * BPI IS ALSO SAVED
                             * TO CASH FLOW.
                             */
                            paymentBreakdown: {

                                Cash:
                                    paymentBreakdown.Cash,

                                GCash:
                                    paymentBreakdown.GCash,

                                BDO:
                                    paymentBreakdown.BDO,

                                BIBO:
                                    paymentBreakdown.BIBO,

                                BPI:
                                    paymentBreakdown.BPI
                            },

                            splitPayment:
                                selectedPaymentMethod ===
                                "Split",

                            splitPaymentType:
                                selectedPaymentMethod ===
                                "Split"
                                    ? paymentBreakdown.splitPaymentType
                                    : null,

                            splitPayments:
                                selectedPaymentMethod ===
                                "Split"
                                    ? paymentBreakdown.splitPaymentTypes
                                    : [],

                            staffName:
                                cashierName,

                            staffUid:
                                currentUser.uid,

                            staffEmail:
                                currentUser.email ||
                                "",

                            createdBy:
                                currentUser.uid,

                            createdAt:
                                timestamp,

                            date:
                                timestamp
                        }
                    );
                }
            );

            /* =========================
               SUCCESS
            ========================= */

            successTotal.textContent =
                money(total);

            successMessage.textContent =
                `Transaction ${transactionNumber} was completed by ${cashierName}.`;

            closePaymentModal();

            successModal.classList.add(
                "show"
            );

            cart = [];

            if (discountElement) {
                discountElement.value =
                    "0";
            }

            renderCart();

            await loadProducts();

        } catch (error) {

            console.error(
                "Sale error:",
                error
            );

            paymentError.textContent =
                error?.message ||
                "Unable to complete sale.";

        } finally {

            completeSale.disabled =
                false;

            completeSale.textContent =
                "Complete Sale";
        }
    };

/* =========================================================
   EVENT LISTENERS
========================================================= */

productSearch.addEventListener(
    "input",
    renderProducts
);

categoryFilter.addEventListener(
    "change",
    renderProducts
);

if (typeFilter) {
    typeFilter.addEventListener(
        "change",
        renderProducts
    );
}

/* =========================================================
   DISCOUNT
========================================================= */

if (discountElement) {

    discountElement.addEventListener(
        "input",
        () => {

            let value =
                discountElement.value.replace(
                    /[^\d.]/g,
                    ""
                );

            const number =
                Number(value) || 0;

            const max =
                cartSubtotal();

            if (
                number >
                max
            ) {
                value =
                    max.toFixed(2);
            }

            discountElement.value =
                value;

            paymentError.textContent =
                "";

            if (
                paymentModal.classList.contains(
                    "show"
                )
            ) {
                updatePaymentTotal();
            }
        }
    );
}

/* =========================================================
   REFRESH PRODUCTS
========================================================= */

refreshProducts.addEventListener(
    "click",
    async () => {

        try {

            hideError();

            await loadProducts();

        } catch (error) {

            showError(error);
        }
    }
);

/* =========================================================
   CLEAR CART
========================================================= */

clearCartButton.addEventListener(
    "click",
    () => {

        if (!cart.length) {
            return;
        }

        if (
            confirm(
                "Clear all items from the current sale?"
            )
        ) {

            cart = [];

            if (discountElement) {
                discountElement.value =
                    "0";
            }

            renderCart();
        }
    }
);

/* =========================================================
   CHECKOUT
========================================================= */

checkoutButton.addEventListener(
    "click",
    openPaymentModal
);

/* =========================================================
   CLOSE PAYMENT
========================================================= */

closePayment.addEventListener(
    "click",
    closePaymentModal
);

paymentModal.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            paymentModal
        ) {
            closePaymentModal();
        }
    }
);

/* =========================================================
   PAYMENT METHOD BUTTONS
========================================================= */

document
    .querySelectorAll(
        ".payment-method"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                selectedPaymentMethod =
                    button.dataset.method;

                document
                    .querySelectorAll(
                        ".payment-method"
                    )
                    .forEach(item =>
                        item.classList.remove(
                            "active"
                        )
                    );

                button.classList.add(
                    "active"
                );

                cashPaymentArea.style.display =
                    selectedPaymentMethod ===
                    "Cash"
                        ? "block"
                        : "none";

                splitPaymentArea.style.display =
                    selectedPaymentMethod ===
                    "Split"
                        ? "block"
                        : "none";

                cashReceived.value =
                    "";

                paymentError.textContent =
                    "";

                if (
                    selectedPaymentMethod ===
                    "Split"
                ) {
                    resetSplitPayment();
                }

                updatePaymentTotal();

                if (
                    selectedPaymentMethod ===
                    "Cash"
                ) {

                    setTimeout(
                        () =>
                            cashReceived.focus(),
                        50
                    );
                }
            }
        );
    });

/* =========================================================
   CASH INPUT
========================================================= */

cashReceived.addEventListener(
    "input",
    updatePaymentTotal
);

/* =========================================================
   SPLIT INPUTS
   FIXED: BPI ADDED
========================================================= */

[
    splitCash,
    splitGCash,
    splitBDO,
    splitBIBO,
    splitBPI
].forEach(input => {

    if (!input) {
        return;
    }

    input.addEventListener(
        "input",
        () => {

            if (
                Number(input.value) <
                0
            ) {
                input.value =
                    "0";
            }

            updateSplitPayment();
        }
    );
});

/* =========================================================
   QUICK CASH BUTTONS
========================================================= */

document
    .querySelectorAll(
        ".quick-cash button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const total =
                    cartTotal();

                if (
                    button.dataset
                        .cash ===
                    "exact"
                ) {

                    cashReceived.value =
                        total.toFixed(2);

                } else {

                    cashReceived.value =
                        button.dataset
                            .cash;
                }

                updatePaymentTotal();
            }
        );
    });

/* =========================================================
   COMPLETE SALE
========================================================= */

completeSale.addEventListener(
    "click",
    completeTransaction
);

/* =========================================================
   NEW SALE
========================================================= */

newSaleButton.addEventListener(
    "click",
    () => {

        successModal.classList.remove(
            "show"
        );

        productSearch.focus();
    }
);

/* =========================================================
   RETRY
========================================================= */

retryButton.addEventListener(
    "click",
    async () => {

        if (!currentUser) {
            return;
        }

        try {

            hideError();

            await loadStaffInfo(
                currentUser
            );

            await loadProducts();

        } catch (error) {

            showError(error);
        }
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
        "input",
        event => {

            productSearch.value =
                event.target.value;

            renderProducts();
        }
    );

/* =========================================================
   AUTH
========================================================= */

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            window.location.href =
                "../login.html?role=staff";

            return;
        }

        currentUser = user;

        try {

            hideError();

            await loadStaffInfo(
                user
            );

            await loadProducts();

        } catch (error) {

            showError(error);
        }
    }
);

/* =========================================================
   INITIAL CART
========================================================= */

renderCart();