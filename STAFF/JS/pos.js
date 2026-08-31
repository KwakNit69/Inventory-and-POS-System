import { auth, db } from "../../Firebase/firebase-config.js";
import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    collection,
    getDocs,
    getDoc,
    doc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
  /* ELEMENTS
========================================================= */
const productsGrid =
    document.getElementById("productsGrid");
const productSearch =
    document.getElementById("productSearch");
const categoryFilter =
    document.getElementById("categoryFilter");
const typeFilter =
    document.getElementById("typeFilter");
const refreshProducts =
    document.getElementById("refreshProducts");
const cartItems =
    document.getElementById("cartItems");
const cartCount =
    document.getElementById("cartCount");
const subtotalElement =
    document.getElementById("subtotal");
const discountElement =
    document.getElementById("discount");
const totalElement =
    document.getElementById("total");
const checkoutButton =
    document.getElementById("checkoutButton");
const clearCartButton =
    document.getElementById("clearCart");
const paymentModal =
    document.getElementById("paymentModal");
const closePayment =
    document.getElementById("closePayment");
const paymentTotal =
    document.getElementById("paymentTotal");
const cashReceived =
    document.getElementById("cashReceived");
const changeAmount =
    document.getElementById("changeAmount");
const completeSale =
    document.getElementById("completeSale");
const paymentError =
    document.getElementById("paymentError");
const cashPaymentArea =
    document.getElementById("cashPaymentArea");
const splitPaymentArea =
    document.getElementById("splitPaymentArea");
const splitCash =
    document.getElementById("splitCash");
const splitGCash =
    document.getElementById("splitGCash");
const splitBDO =
    document.getElementById("splitBDO");
const splitBIBO =
    document.getElementById("splitBIBO");
const splitBPI =
    document.getElementById("splitBPI");
const splitTotalPaid =
    document.getElementById("splitTotalPaid");
const splitRemaining =
    document.getElementById("splitRemaining");
const paymentDestination =
    document.getElementById("paymentDestination");
const successModal =
    document.getElementById("successModal");
const successMessage =
    document.getElementById("successMessage");
const successTotal =
    document.getElementById("successTotal");
const newSaleButton =
    document.getElementById("newSaleButton");
const posError =
    document.getElementById("posError");
const posErrorMessage =
    document.getElementById("posErrorMessage");
const retryButton =
    document.getElementById("retryButton");
const staffName =
    document.getElementById("staffName");
const staffRole =
    document.getElementById("staffRole");
const staffAvatar =
    document.getElementById("staffAvatar");
const staffStatus =
    document.getElementById("staffStatus");
   /* STATE
========================================================= */
let currentUser = null;
let currentProfile = {};
let products = [];
let categories = [];
let cart = [];
let selectedPaymentMethod = "Cash";
let selectedOrderType = "sale";
let deliveryRequested = false;
   /* BASIC HELPERS
========================================================= */
const money = value => {
    return new Intl.NumberFormat(
        "en-PH",
        {
            style: "currency",
            currency: "PHP"
        }
    ).format(
        Number(value) || 0
    );
};
const escapeHtml = value => {
    return String(
        value ?? ""
    ).replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]
    );
};
const initials = name => {
    const parts =
        String(name || "Staff")
            .trim()
            .split(/\s+/);
    if (parts.length > 1) {
        return (
            parts[0][0] +
            parts[parts.length - 1][0]
        ).toUpperCase();
    }
    return String(
        name || "ST"
    )
        .substring(0, 2)
        .toUpperCase();
};
const getName = item => {
    return (
        item.name ??
        item.productName ??
        item.title ??
        item.packageName ??
        item.insuranceName ??
        "Unnamed"
    );
};
const getSku = item => {
    return (
        item.sku ??
        item.SKU ??
        item.productCode ??
        item.code ??
        ""
    );
};
const getPrice = item => {
    return Number(
        item.sellingPrice ??
        item.price ??
        item.salePrice ??
        item.unitPrice ??
        item.premium ??
        item.amount ??
        0
    );
};
const getStock = item => {
    return Number(
        item.stock ??
        item.currentStock ??
        item.quantity ??
        0
    );
};
const getCategory = item => {
    return (
        item.category ??
        item.categoryName ??
        item.categoryId ??
        "Uncategorized"
    );
};
const getImage = item => {
    return (
        item.imageUrl ??
        item.imageURL ??
        item.image ??
        item.photoUrl ??
        item.photoURL ??
        item.productImage ??
        item.packageImage ??
        item.insuranceImage ??
        ""
    );
};
const getType = item => {
    if (item.itemType) {
        return String(
            item.itemType
        ).toLowerCase();
    }
    if (item.type) {
        return String(
            item.type
        ).toLowerCase();
    }
    if (
        item.sourceCollection ===
        "packages"
    ) {
        return "package";
    }
    if (
        item.sourceCollection ===
        "insurances"
    ) {
        return "insurance";
    }
    return "product";
};
const normalizeCategory = value => {
    const text =
        String(
            value ?? ""
        ).trim();
    const lower =
        text.toLowerCase();
    if (
        lower === "package" ||
        lower === "packages"
    ) {
        return "Packages";
    }
    if (
        lower === "insurance" ||
        lower === "insurances"
    ) {
        return "Insurance";
    }
    return text || "Uncategorized";
};
const getPackageItems = item => {
    if (
        Array.isArray(
            item.items
        )
    ) {
        return item.items;
    }
    if (
        Array.isArray(
            item.packageItems
        )
    ) {
        return item.packageItems;
    }
    if (
        Array.isArray(
            item.components
        )
    ) {
        return item.components;
    }
    return [];
};
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
const generateTransactionNumber = () => {
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
    return (
        `TXN-${date}-${random}`
    );
};
   /* ERROR HANDLING
========================================================= */
function showError(error) {
    console.error(
        "Staff POS error:",
        error
    );
    if (posError) {
        posError.classList.add(
            "show"
        );
    }
    if (posErrorMessage) {
        posErrorMessage.textContent =
            error?.message ||
            "Unable to connect to Firebase.";
    }
}
function hideError() {
    if (posError) {
        posError.classList.remove(
            "show"
        );
    }
}
   /* STAFF INFORMATION
========================================================= */
async function loadStaffInfo(user) {
    let profile = {};
    const storedName =
        sessionStorage.getItem(
            "userName"
        );
    try {
        const profileSnapshot =
            await getDoc(
                doc(
                    db,
                    "users",
                    user.uid
                )
            );
        if (
            profileSnapshot.exists()
        ) {
            profile =
                profileSnapshot.data();
        }
    } catch (error) {
        console.warn(
            "Unable to load staff profile:",
            error
        );
    }
    currentProfile =
        profile;
    const name =
        profile.fullName ||
        profile.name ||
        storedName ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Staff";
    const role =
        profile.role ||
        sessionStorage.getItem(
            "userRole"
        ) ||
        "Staff / Cashier";
    const status =
        profile.status ||
        "Active";
    if (staffName) {
        staffName.textContent =
            name;
    }
    if (staffRole) {
        staffRole.textContent =
            role;
    }
    if (staffAvatar) {
        staffAvatar.textContent =
            initials(name);
    }
    if (staffStatus) {
        staffStatus.innerHTML =
            `<span></span>${escapeHtml(status)}`;
        if (
            String(status)
                .toLowerCase() !==
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
}
   /* CART CALCULATIONS
========================================================= */
function cartSubtotal() {
    return cart.reduce(
        (
            total,
            item
        ) => {
            return (
                total +
                (
                    Number(item.price) *
                    Number(item.quantity)
                )
            );
        },
        0
    );
}
function getDiscount() {
    if (!discountElement) {
        return 0;
    }
    let value =
        Number(
            discountElement.value
        );
    if (
        !Number.isFinite(value) ||
        value < 0
    ) {
        value = 0;
    }
    return Math.min(
        value,
        cartSubtotal()
    );
}
function cartTotal() {
    return Math.max(
        cartSubtotal() -
        getDiscount(),
        0
    );
}
function cartQuantity() {
    return cart.reduce(
        (
            total,
            item
        ) => {
            return (
                total +
                Number(item.quantity)
            );
        },
        0
    );
}
   /* LOAD CATEGORIES
========================================================= */
async function loadCategories() {
    const categoryMap =
        new Map();
    try {
        const snapshot =
            await getDocs(
                collection(
                    db,
                    "categories"
                )
            );
        snapshot.forEach(
            categoryDoc => {
                const data =
                    categoryDoc.data();
                const rawName =
                    data.name ??
                    data.categoryName ??
                    data.title ??
                    categoryDoc.id;
                const name =
                    normalizeCategory(
                        rawName
                    );
                if (!name) {
                    return;
                }
                const key =
                    name.toLowerCase();
                if (
                    !categoryMap.has(key)
                ) {
                    categoryMap.set(
                        key,
                        {
                            id: key,
                            name
                        }
                    );
                }
            }
        );
    } catch (error) {
        console.warn(
            "Categories collection could not be loaded:",
            error
        );
    }
    products.forEach(
        item => {
            if (
                getType(item) !==
                "product"
            ) {
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
            if (
                !categoryMap.has(key)
            ) {
                categoryMap.set(
                    key,
                    {
                        id: key,
                        name
                    }
                );
            }
        }
    );
    categories =
        [...categoryMap.values()]
            .sort(
                (a, b) =>
                    a.name.localeCompare(
                        b.name
                    )
            );
    if (!categoryFilter) {
        return;
    }
    categoryFilter.innerHTML =
        `<option value="all">
            All Categories
         </option>`;
    categories.forEach(
        category => {
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
        }
    );
}
   /* LOAD PRODUCTS / PACKAGES / INSURANCE
========================================================= */
async function loadProducts() {
    if (productsGrid) {
        productsGrid.innerHTML =
            `<div class="loading-products">
                Loading products, packages and insurance...
             </div>`;
    }
    const loadedItems = [];
/*
       PRODUCTS
    ------------------------------------------------------- */
    const productSnapshot =
        await getDocs(
            collection(
                db,
                "products"
            )
        );
    productSnapshot.forEach(
        productDoc => {
            const data =
                productDoc.data();
            loadedItems.push({
                id:
                    productDoc.id,
                ...data,
                itemType:
                    "product",
                sourceCollection:
                    "products"
            });
        }
    );
/*
       PACKAGES
    ------------------------------------------------------- */
    try {
        const packageSnapshot =
            await getDocs(
                collection(
                    db,
                    "packages"
                )
            );
        packageSnapshot.forEach(
            packageDoc => {
                const data =
                    packageDoc.data();
                if (
                    data.active === false
                ) {
                    return;
                }
                loadedItems.push({
                    id:
                        packageDoc.id,
                    ...data,
                    itemType:
                        "package",
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
                        data.imageUrl ??
                        data.imageURL ??
                        "",
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
/*
       INSURANCE
    ------------------------------------------------------- */
    try {
        const insuranceSnapshot =
            await getDocs(
                collection(
                    db,
                    "insurances"
                )
            );
        insuranceSnapshot.forEach(
            insuranceDoc => {
                const data =
                    insuranceDoc.data();
                const status =
                    String(
                        data.status ??
                        "active"
                    ).toLowerCase();
                if (
                    status !== "active"
                ) {
                    return;
                }
                loadedItems.push({
                    id:
                        insuranceDoc.id,
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
                        data.imageUrl ??
                        data.imageURL ??
                        ""
                });
            }
        );
    } catch (error) {
        console.error(
            "Insurance loading error:",
            error
        );
    }
    products =
        loadedItems;
    await loadCategories();
    renderProducts();
}
   /* FIND PRODUCT
========================================================= */
function getProductById(
    productId
) {
    return products.find(
        item =>
            getType(item) ===
                "product" &&
            item.id ===
                productId
    );
}
    /* PACKAGE AVAILABILITY
========================================================= */
function checkPackageAvailability(
    packageItem
) {
    const packageProducts =
        getPackageItems(
            packageItem
        );
    if (
        !packageProducts.length
    ) {
        return {
            available: false,
            message:
                "This package has no products configured."
        };
    }
       IMPORTANT:
/* A package is available only when
       EVERY component has enough stock.
    */
    for (
        const rawItem
        of packageProducts
    ) {
        const component =
            normalizePackageItem(
                rawItem
            );
        if (
            !component.productId
        ) {
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
        message:
            "Available"
    };
}
   /* RENDER PRODUCTS
========================================================= */
function renderProducts() {
    if (!productsGrid) {
        return;
    }
    const search =
        productSearch
            ?.value
            .trim()
            .toLowerCase() ||
        "";
    const selectedCategory =
        categoryFilter
            ?.value ||
        "all";
    const selectedType =
        typeFilter
            ?.value ||
        "all";
    const filtered =
        products.filter(
            item => {
                const name =
                    getName(item)
                        .toLowerCase();
                const sku =
                    getSku(item)
                        .toLowerCase();
                const itemType =
                    getType(item);
                const category =
                    normalizeCategory(
                        getCategory(item)
                    )
                        .toLowerCase();
                const matchesSearch =
                    !search ||
                    name.includes(search) ||
                    sku.includes(search) ||
                    category.includes(search);
                let matchesCategory =
                    true;
                if (
                    selectedCategory !==
                    "all"
                ) {
                    const categoryObject =
                        categories.find(
                            categoryItem =>
                                categoryItem.id ===
                                selectedCategory
                        );
                    const selectedName =
                        String(
                            categoryObject?.name ??
                            selectedCategory
                        )
                            .trim()
                            .toLowerCase();
                    matchesCategory =
                        category ===
                        selectedName;
                }
                const matchesType =
                    selectedType ===
                        "all" ||
                    itemType ===
                        selectedType;
                return (
                    matchesSearch &&
                    matchesCategory &&
                    matchesType
                );
            }
        );
    if (!filtered.length) {
        productsGrid.innerHTML =
            `<div class="no-products">
                No products, packages or insurance found.
             </div>`;
        return;
    }
    productsGrid.innerHTML =
        filtered
            .map(
                item =>
                    createProductCard(
                        item
                    )
            )
            .join("");
    document
        .querySelectorAll(
            ".add-product"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    () => {
                        addToCart(
                            button.dataset
                                .productId
                        );
                    }
                );
            }
        );
}
   /* PRODUCT CARD
========================================================= */
function createProductCard(
    item
) {
    const type =
        getType(item);
    const isPackage =
        type === "package";
    const isInsurance =
        type === "insurance";
    let available =
        true;
    let stockText =
        "";
    if (isInsurance) {
        stockText =
            "No stock required";
    }
    else if (isPackage) {
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
    }
    else {
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
        isInsurance
            ? "INSURANCE"
            : isPackage
            ? "PACKAGE"
            : "PRODUCT";
    const buttonText =
        !available
            ? "Unavailable"
            : isInsurance
            ? "Add Insurance"
            : isPackage
            ? "Add Package"
            : "Add to Cart";
    return `
        <article
            class="product-card ${type}
            ${available ? "" : "out"}"
        >
            <div class="product-image">
                ${
                    image
                        ? `
                            <img
                                src="${escapeHtml(image)}"
                                alt="${escapeHtml(
                                    getName(item)
                                )}"
                                onerror="
                                    this.style.display='none';
                                    this.parentElement.classList.add('image-error')
                                "
                            >
                          `
                        : `
                            <span>
                                ${
                                    isInsurance
                                        ? "🛡"
                                        : isPackage
                                        ? "▦"
                                        : "₱"
                                }
                            </span>
                          `
                }
            </div>
            <div class="type-badge ${type}">
                ${typeLabel}
            </div>
            <div class="product-name">
                ${escapeHtml(
                    getName(item)
                )}
            </div>
            <div class="product-sku">
                ${escapeHtml(
                    getSku(item)
                )}
            </div>
            ${
                isPackage
                    ? `
                        <div class="package-info">
                            ${getPackageItems(item).length}
                            included item${
                                getPackageItems(item).length ===
                                1
                                    ? ""
                                    : "s"
                            }
                        </div>
                      `
                    : ""
            }
            <div class="product-bottom">
                <div class="product-price">
                    ${money(price)}
                </div>
                <div
                    class="product-stock
                    ${available ? "" : "out"}"
                >
                    ${escapeHtml(
                        stockText
                    )}
                </div>
                <button
                    class="add-product"
                    type="button"
                    data-product-id="${escapeHtml(
                        item.id
                    )}"
                    ${
                        available
                            ? ""
                            : "disabled"
                    }
                >
                    ${buttonText}
                </button>
            </div>
        </article>
    `;
}
   /*ADD TO CART
========================================================= */
function addToCart(
    productId
) {
    const item =
        products.find(
            product =>
                product.id ===
                productId
        );
    if (!item) {
        return;
    }
    const type =
        getType(item);
    const existing =
        cart.find(
            cartItem =>
                cartItem.productId ===
                productId
        );
/*
       INSURANCE
    ------------------------------------------------------- */
    if (
        type ===
        "insurance"
    ) {
        if (existing) {
            existing.quantity += 1;
        }
        else {
            cart.push({
                productId:
                    item.id,
                name:
                    getName(item),
                sku:
                    getSku(item),
                category:
                    "Insurance",
                price:
                    getPrice(item),
                quantity:
                    1,
                stock:
                    0,
                itemType:
                    "insurance",
                image:
                    getImage(item),
                packageItems:
                    []
            });
        }
        renderCart();
        return;
    }
/*
       PACKAGE
    ------------------------------------------------------- */
    if (
        type ===
        "package"
    ) {
        const availability =
            checkPackageAvailability(
                item
            );
        if (
            !availability.available
        ) {
            alert(
                availability.message
            );
            return;
        }
/* Do not allow package quantity
           beyond the actual available
           component stock.
        */
        const newQuantity =
            existing
                ? existing.quantity + 1
                : 1;
        const possible =
            getMaximumPackageQuantity(
                item
            );
        if (
            newQuantity >
            possible
        ) {
            alert(
                `Only ${possible} package${
                    possible === 1
                        ? ""
                        : "s"
                } can currently be made from available stock.`
            );
            return;
        }
        if (existing) {
            existing.quantity =
                newQuantity;
        }
        else {
            cart.push({
                productId:
                    item.id,
                name:
                    getName(item),
                sku:
                    getSku(item),
                category:
                    "Packages",
                price:
                    getPrice(item),
                quantity:
                    1,
                stock:
                    0,
                itemType:
                    "package",
                image:
                    getImage(item),
                packageItems:
                    getPackageItems(item)
            });
        }
        renderCart();
        return;
    }
/*
       NORMAL PRODUCT
    ------------------------------------------------------- */
    const stock =
        getStock(item);
    if (
        stock <= 0
    ) {
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
    }
    else {
        cart.push({
            productId:
                item.id,
            name:
                getName(item),
            sku:
                getSku(item),
            category:
                getCategory(item),
            price:
                getPrice(item),
            quantity:
                1,
            stock,
            itemType:
                "product",
            image:
                getImage(item),
            packageItems:
                []
        });
    }
    renderCart();
}
 /*  MAXIMUM PACKAGE QUANTITY
========================================================= */
function getMaximumPackageQuantity(
    packageItem
) {
    const components =
        getPackageItems(
            packageItem
        );
    if (
        !components.length
    ) {
        return 0;
    }
    let maximum =
        Infinity;
    for (
        const rawComponent
        of components
    ) {
        const component =
            normalizePackageItem(
                rawComponent
            );
        const product =
            getProductById(
                component.productId
            );
        if (!product) {
            return 0;
        }
        const stock =
            getStock(product);
        const possible =
            Math.floor(
                stock /
                component.quantity
            );
        maximum =
            Math.min(
                maximum,
                possible
            );
    }
    return Number.isFinite(
        maximum
    )
        ? maximum
        : 0;
}
   /*  CHANGE CART QUANTITY
========================================================= */
function changeQuantity(
    productId,
    amount
) {
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
    if (!source) {
        return;
    }
    const newQuantity =
        item.quantity +
        amount;
    if (
        newQuantity <= 0
    ) {
        removeFromCart(
            productId
        );
        return;
    }
/*
       PRODUCT STOCK
    ------------------------------------------------------- */
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
/*
       PACKAGE STOCK
    ------------------------------------------------------- */
    if (
        item.itemType ===
        "package"
    ) {
        const maximum =
            getMaximumPackageQuantity(
                source
            );
        if (
            newQuantity >
            maximum
        ) {
            alert(
                `Only ${maximum} package${
                    maximum === 1
                        ? ""
                        : "s"
                } can currently be made from available stock.`
            );
            return;
        }
    }
    item.quantity =
        newQuantity;
    renderCart();
}
   /*  REMOVE FROM CART
========================================================= */
function removeFromCart(
    productId
) {
    cart =
        cart.filter(
            item =>
                item.productId !==
                productId
        );
    renderCart();
}
   /*  RENDER CART
========================================================= */
function renderCart() {
    const subtotal =
        cartSubtotal();
    const total =
        cartTotal();
    const quantity =
        cartQuantity();
    if (cartCount) {
        cartCount.textContent =
            `${quantity} item${
                quantity === 1
                    ? ""
                    : "s"
            }`;
    }
    if (subtotalElement) {
        subtotalElement.textContent =
            money(subtotal);
    }
    if (discountElement) {
        discountElement.value =
            Number(
                discountElement.value
            ) || 0;
    }
    if (totalElement) {
        totalElement.textContent =
            money(total);
    }
    if (checkoutButton) {
        checkoutButton.disabled =
            cart.length === 0;
    }
    if (!cart.length) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <div class="empty-cart-icon">
                    ₱
                </div>
                <strong>
                    No items in cart
                </strong>
                <span>
                    Add products, packages or insurance.
                </span>
            </div>
        `;
        return;
    }
    cartItems.innerHTML =
        cart
            .map(
                item => {
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
                                    <span
                                        class="cart-type ${item.itemType}"
                                    >
                                        ${badge}
                                    </span>
                                </div>
                                <div class="cart-item-name">
                                    ${escapeHtml(
                                        item.name
                                    )}
                                </div>
                                <div class="cart-item-price">
                                    ${money(
                                        item.price
                                    )}
                                    each
                                </div>
                                <div
                                    class="cart-item-controls"
                                >
                                    <button
                                        class="qty-button"
                                        type="button"
                                        data-action="minus"
                                        data-id="${escapeHtml(
                                            item.productId
                                        )}"
                                    >
                                        −
                                    </button>
                                    <span
                                        class="qty-value"
                                    >
                                        ${item.quantity}
                                    </span>
                                    <button
                                        class="qty-button"
                                        type="button"
                                        data-action="plus"
                                        data-id="${escapeHtml(
                                            item.productId
                                        )}"
                                    >
                                        +
                                    </button>
                                    <button
                                        class="remove-item"
                                        type="button"
                                        data-action="remove"
                                        data-id="${escapeHtml(
                                            item.productId
                                        )}"
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
                        </div>
                    `;
                }
            )
            .join("");
    document
        .querySelectorAll(
            ".qty-button, .remove-item"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    () => {
                        const id =
                            button.dataset.id;
                        const action =
                            button.dataset.action;
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
            }
        );
}
  /* SPLIT PAYMENT
========================================================= */
function resetSplitPayment() {
    if (splitCash) {
        splitCash.value =
            "";
    }
    if (splitGCash) {
        splitGCash.value =
            "";
    }
    if (splitBDO) {
        splitBDO.value =
            "";
    }
    if (splitBIBO) {
        splitBIBO.value =
            "";
    }
    if (splitBPI) {
        splitBPI.value =
            "";
    }
    if (splitTotalPaid) {
        splitTotalPaid.textContent =
            money(0);
    }
    if (splitRemaining) {
        splitRemaining.textContent =
            money(
                cartTotal()
            );
    }
    if (changeAmount) {
        changeAmount.textContent =
            money(0);
    }
}
/* BPI IS INCLUDED.
*/
function getSplitAmounts() {
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
}
function getSplitTotal() {
    const amounts =
        getSplitAmounts();
    return (
        amounts.Cash +
        amounts.GCash +
        amounts.BDO +
        amounts.BIBO +
        amounts.BPI
    );
}
function getSplitPaymentTypes(
    amounts
) {
    return Object
        .entries(
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
}
function updateSplitPayment() {
    const total =
        cartTotal();
    const paid =
        getSplitTotal();
    const remaining =
        Math.max(
            total -
            paid,
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
    if (changeAmount) {
        changeAmount.textContent =
            money(
                Math.max(
                    paid -
                    total,
                    0
                )
            );
    }
}
 /*  PAYMENT MODAL
========================================================= */
function openPaymentModal() {
    if (!cart.length) {
        return;
    }
    const total =
        cartTotal();
    paymentTotal.textContent =
        money(total);
    cashReceived.value =
        "";
    changeAmount.textContent =
        money(0);
    paymentError.textContent =
        "";
    selectedPaymentMethod =
        "Cash";
    selectedOrderType =
        "sale";
    deliveryRequested =
        false;
    const deliveryCheckbox =
        document.getElementById(
            "deliveryCheckbox"
        );
    if (deliveryCheckbox) {
        deliveryCheckbox.checked =
            false;
    }
    updateOrderTypeUI();
    document
        .querySelectorAll(
            ".payment-method"
        )
        .forEach(
            button => {
                button.classList.toggle(
                    "active",
                    button.dataset.method ===
                    "Cash"
                );
            }
        );
    cashPaymentArea.style.display =
        "block";
    splitPaymentArea.style.display =
        "none";
    if (paymentDestination) {
        paymentDestination.textContent =
            "Cash";
    }
    resetSplitPayment();
    paymentModal.classList.add(
        "show"
    );
    setTimeout(
        () => {
            cashReceived?.focus();
        },
        100
    );
}
function closePaymentModal() {
    paymentModal.classList.remove(
        "show"
    );
    paymentError.textContent =
        "";
}
   /*  UPDATE PAYMENT
========================================================= */
function updatePaymentTotal() {
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
                received -
                total,
                0
            );
        changeAmount.textContent =
            money(change);
    }
    else if (
        selectedPaymentMethod ===
        "Split"
    ) {
        updateSplitPayment();
    }
    else {
        changeAmount.textContent =
            money(0);
    }
}
   /*  PAYMENT BREAKDOWN
========================================================= */
function getPaymentBreakdown(total) {
    if (selectedPaymentMethod === "Cash") {
        const received = Number(cashReceived?.value) || 0;
        return { Cash: total, GCash: 0, BDO: 0, BIBO: 0, BPI: 0, totalPaid: received, tenderedTotal: received, change: Math.max(received - total, 0), paymentTypes: [{ method: "Cash", amount: total }], tenderBreakdown: { Cash: received, GCash: 0, BDO: 0, BIBO: 0, BPI: 0 } };
    }
    if (selectedPaymentMethod === "GCash") return { Cash: 0, GCash: total, BDO: 0, BIBO: 0, BPI: 0, totalPaid: total, tenderedTotal: total, change: 0, paymentTypes: [{ method: "GCash", amount: total }], tenderBreakdown: { Cash: 0, GCash: total, BDO: 0, BIBO: 0, BPI: 0 } };
    if (selectedPaymentMethod === "BDO") return { Cash: 0, GCash: 0, BDO: total, BIBO: 0, BPI: 0, totalPaid: total, tenderedTotal: total, change: 0, paymentTypes: [{ method: "BDO", amount: total }], tenderBreakdown: { Cash: 0, GCash: 0, BDO: total, BIBO: 0, BPI: 0 } };
    if (selectedPaymentMethod === "BIBO") return { Cash: 0, GCash: 0, BDO: 0, BIBO: total, BPI: 0, totalPaid: total, tenderedTotal: total, change: 0, paymentTypes: [{ method: "BIBO", amount: total }], tenderBreakdown: { Cash: 0, GCash: 0, BDO: 0, BIBO: total, BPI: 0 } };
    if (selectedPaymentMethod === "BPI") return { Cash: 0, GCash: 0, BDO: 0, BIBO: 0, BPI: total, totalPaid: total, tenderedTotal: total, change: 0, paymentTypes: [{ method: "BPI", amount: total }], tenderBreakdown: { Cash: 0, GCash: 0, BDO: 0, BIBO: 0, BPI: total } };
    const amounts = getSplitAmounts();
    const paymentTypes = getSplitPaymentTypes(amounts);
    const splitTotal = getSplitTotal();
    return { Cash: amounts.Cash, GCash: amounts.GCash, BDO: amounts.BDO, BIBO: amounts.BIBO, BPI: amounts.BPI, totalPaid: splitTotal, tenderedTotal: splitTotal, change: 0, paymentTypes, splitPaymentType: paymentTypes.map(item => item.method).join(" + ") || "Split", tenderBreakdown: { ...amounts } };
}
/*   PAYMENT VALIDATION
========================================================= */
function validatePayment(total) {
    if (selectedPaymentMethod === "Cash") {
        const received = Number(cashReceived?.value) || 0;
        if (received <= 0) { paymentError.textContent = "Please enter the cash received."; return false; }
        if (received < total) { paymentError.textContent = `Cash received is ${money(total - received)} short.`; return false; }
        return true;
    }
    if (selectedPaymentMethod === "Split") {
        const paid = getSplitTotal();
        if (paid <= 0) { paymentError.textContent = "Please enter at least one split payment amount."; return false; }
        if (Math.abs(paid - total) > 0.005) {
            paymentError.textContent = paid < total ? `Split payment is ${money(total - paid)} short.` : `Split payment exceeds the amount due by ${money(paid - total)}.`;
            return false;
        }
        return true;
    }
    return true;
}
 /*  STOCK DEDUCTIONS
========================================================= */
function getStockDeductions() {
    const deductions =
        new Map();
    function add(
        productId,
        quantity
    ) {
        if (!productId) {
            return;
        }
        deductions.set(
            productId,
            (
                deductions.get(
                    productId
                ) || 0
            ) +
            Number(quantity || 0)
        );
    }
    for (
        const item
        of cart
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
            add(
                item.productId,
                item.quantity
            );
            continue;
        }
        if (
            item.itemType ===
            "package"
        ) {
            const packageComponents =
                getPackageItems(
                    item
                );
            for (
                const rawComponent
                of packageComponents
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
                add(
                    component.productId,
                    component.quantity *
                    item.quantity
                );
            }
        }
    }
    return deductions;
}
   /*  COMPLETE TRANSACTION
========================================================= */
function updateOrderTypeUI() {
    const isReservation = selectedOrderType === "reservation";
    document.querySelectorAll(".order-type-option").forEach(option => {
        option.classList.toggle(
            "active",
            option.dataset.orderType === selectedOrderType
        );
    });
    const notice = document.getElementById("reservationNotice");
    const deliveryField = document.getElementById("deliveryField");
    const customerInput = document.getElementById("customerName");
    if (notice) {
        notice.classList.toggle("show", isReservation);
    }
    if (deliveryField) {
        deliveryField.classList.toggle("show", isReservation);
    }
    if (customerInput) {
        customerInput.placeholder = isReservation
            ? "Enter customer name (required)"
            : "Enter customer name (optional)";
    }
    if (completeSale) {
        completeSale.textContent = isReservation
            ? "Create Reservation"
            : "Complete Sale";
    }
    const description = paymentModal?.querySelector(".payment-header p");
    if (description) {
        description.textContent = isReservation
            ? "Take payment and create a reservation. Stock remains unchanged until Order Done."
            : "Complete the customer's payment.";
    }
}
function resetOrderType() {
    selectedOrderType = "sale";
    deliveryRequested = false;
    const deliveryCheckbox = document.getElementById("deliveryCheckbox");
    if (deliveryCheckbox) {
        deliveryCheckbox.checked = false;
    }
    updateOrderTypeUI();
}
async function completeTransaction() {
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
    const isReservation =
        selectedOrderType === "reservation";
    const subtotal =
        cartSubtotal();
    const discount =
        getDiscount();
    const total =
        cartTotal();
    const customerInput =
        document.getElementById("customerName");
    const customer =
        customerInput?.value.trim() ||
        "Walk-in Customer";
    if (
        isReservation &&
        !customerInput?.value.trim()
    ) {
        paymentError.textContent =
            "Customer name is required for a reservation.";
        customerInput?.focus();
        return;
    }
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
    const tenderBreakdown =
        paymentBreakdown.tenderBreakdown || {
            Cash: 0,
            GCash: 0,
            BDO: 0,
            BIBO: 0,
            BPI: 0
        };
    completeSale.disabled =
        true;
    completeSale.textContent =
        isReservation
            ? "Creating Reservation..."
            : "Processing...";
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
            currentUser.email
                ?.split("@")[0] ||
            "Staff";
        const cashierRole =
            currentProfile?.role ||
            sessionStorage.getItem(
                "userRole"
            ) ||
            "Staff / Cashier";
        const saleItems =
            cart.map(
                item => ({
                    productId:
                        item.productId,
                    name:
                        item.name,
                    sku:
                        item.sku,
                    category:
                        item.category,
                    price:
                        Number(item.price),
                    quantity:
                        Number(item.quantity),
                    subtotal:
                        Number(item.price) *
                        Number(item.quantity),
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
                        isReservation
                            ? false
                            : item.itemType !==
                              "insurance"
                })
            );
        const stockDeductions =
            getStockDeductions();
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
                            "A product required for this transaction no longer exists."
                        );
                    }
                    snapshots.push(
                        snapshot
                    );
                }
                if (!isReservation) {
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
                                )} does not have enough stock. ` +
                                `Available: ${currentStock}, ` +
                                `required: ${required}.`
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
                }
                transaction.set(
                    saleRef,
                    {
                        transactionId:
                            saleRef.id,
                        transactionNumber,
                        customer,
                        items:
                            saleItems,
                        itemCount:
                            cartQuantity(),
                        subtotal,
                        discount,
                        total,
                        orderType:
                            isReservation
                                ? "Reservation"
                                : "Sale",
                        isReservation,
                        delivery:
                            isReservation
                                ? deliveryRequested
                                : false,
                        forDelivery:
                            isReservation
                                ? deliveryRequested
                                : false,
                        deliveryType:
                            isReservation
                                ? deliveryRequested
                                    ? "Delivery"
                                    : "Pickup"
                                : "Pickup",
                        paymentMethod:
                            selectedPaymentMethod,
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
                        tenderBreakdown: {
                            Cash:
                                tenderBreakdown.Cash,
                            GCash:
                                tenderBreakdown.GCash,
                            BDO:
                                tenderBreakdown.BDO,
                            BIBO:
                                tenderBreakdown.BIBO,
                            BPI:
                                tenderBreakdown.BPI
                        },
                        splitPayment:
                            selectedPaymentMethod ===
                            "Split",
                        splitPaymentType:
                            selectedPaymentMethod ===
                            "Split"
                                ? paymentBreakdown
                                    .splitPaymentType
                                : null,
                        splitPayments:
                            selectedPaymentMethod ===
                            "Split"
                                ? paymentBreakdown
                                    .paymentTypes
                                : [],
                        amountPaid:
                            received,
                        totalPaid:
                            received,
                        change:
                            selectedPaymentMethod ===
                            "Cash"
                                ? Math.max(
                                    received -
                                    total,
                                    0
                                )
                                : 0,
                        status:
                            isReservation
                                ? "Pending"
                                : "Completed",
                        paymentStatus:
                            "Paid",
                        paymentCompleted:
                            true,
                        paymentRecordedAt:
                            timestamp,
                        paymentReceivedAt:
                            timestamp,
                        stockDeducted:
                            !isReservation,
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
                        reservationCreatedAt:
                            isReservation
                                ? timestamp
                                : null,
                        createdAt:
                            timestamp,
                        date:
                            timestamp
                    }
                );
                transaction.set(
                    cashFlowRef,
                    {
                        type: "cashIn",
                        flowType: "SALE",
                        category: "Sales",
                        amount: total,
                        cashIn: total,
                        cashOut: 0,
                        transactionId: saleRef.id,
                        referenceId: saleRef.id,
                        transactionNumber,
                        customer,
                        orderType: isReservation ? "Reservation" : "Sale",
                        isReservation,
                        paymentMethod: selectedPaymentMethod === "Split" ? "Split Payment" : selectedPaymentMethod,
                        paymentBreakdown: {
                            Cash: paymentBreakdown.Cash,
                            GCash: paymentBreakdown.GCash,
                            BDO: paymentBreakdown.BDO,
                            BIBO: paymentBreakdown.BIBO,
                            BPI: paymentBreakdown.BPI
                        },
                        tenderBreakdown: {
                            Cash: tenderBreakdown.Cash,
                            GCash: tenderBreakdown.GCash,
                            BDO: tenderBreakdown.BDO,
                            BIBO: tenderBreakdown.BIBO,
                            BPI: tenderBreakdown.BPI
                        },
                        amountPaid: received,
                        totalPaid: received,
                        tenderedTotal: received,
                        change: paymentBreakdown.change || 0,
                        paymentStatus: "Paid",
                        paymentCompleted: true,
                        status: isReservation ? "Pending" : "Completed",
                        cashierName,
                        cashierUid: currentUser.uid,
                        cashierEmail: currentUser.email || "",
                        staffName: cashierName,
                        staffUid: currentUser.uid,
                        staffEmail: currentUser.email || "",
                        createdBy: currentUser.uid,
                        createdAt: timestamp,
                        date: timestamp
                    }
                );
                if (!isReservation) {
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
                                ]
                                    .map(
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
                                ]
                                    .reduce(
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
                }
                
            }
        );
        if (successTotal) {
            successTotal.textContent =
                money(total);
        }
        if (successMessage) {
            successMessage.textContent =
                isReservation
                    ? `Reservation ${transactionNumber} was created and payment was recorded by ${cashierName}.`
                    : `Transaction ${transactionNumber} was completed by ${cashierName}.`;
        }
        closePaymentModal();
        successModal.classList.add(
            "show"
        );
        cart = [];
        if (discountElement) {
            discountElement.value =
                "0";
        }
        resetOrderType();
        renderCart();
        await loadProducts();
    } catch (error) {
        console.error(
            "Transaction error:",
            error
        );
        paymentError.textContent =
            error?.message ||
            (
                isReservation
                    ? "Unable to create reservation."
                    : "Unable to complete sale."
            );
    } finally {
        completeSale.disabled =
            false;
        completeSale.textContent =
            selectedOrderType ===
            "reservation"
                ? "Create Reservation"
                : "Complete Sale";
    }
}
  /* EVENT LISTENERS
========================================================= */
if (productSearch) {
    productSearch.addEventListener(
        "input",
        renderProducts
    );
}
if (categoryFilter) {
    categoryFilter.addEventListener(
        "change",
        renderProducts
    );
}
if (typeFilter) {
    typeFilter.addEventListener(
        "change",
        renderProducts
    );
}
if (refreshProducts) {
    refreshProducts.addEventListener(
        "click",
        async () => {
            try {
                hideError();
                await loadProducts();
            } catch (error) {
                showError(
                    error
                );
            }
        }
    );
}
if (discountElement) {
    discountElement.addEventListener(
        "input",
        () => {
            let value =
                discountElement.value
                    .replace(
                        /[^\d.]/g,
                        ""
                    );
            const number =
                Number(value) ||
                0;
            const maximum =
                cartSubtotal();
            if (
                number >
                maximum
            ) {
                value =
                    maximum.toFixed(2);
            }
            discountElement.value =
                value;
            if (
                paymentModal.classList
                    .contains("show")
            ) {
                updatePaymentTotal();
            }
            renderCart();
        }
    );
}
if (checkoutButton) {
    checkoutButton.addEventListener(
        "click",
        openPaymentModal
    );
}
if (closePayment) {
    closePayment.addEventListener(
        "click",
        closePaymentModal
    );
}
document
    .querySelectorAll(
        ".order-type-option"
    )
    .forEach(
        button => {
            button.addEventListener(
                "click",
                () => {
                    selectedOrderType =
                        button.dataset.orderType ===
                        "reservation"
                            ? "reservation"
                            : "sale";
                    if (
                        selectedOrderType !==
                        "reservation"
                    ) {
                        deliveryRequested =
                            false;
                        const checkbox =
                            document.getElementById(
                                "deliveryCheckbox"
                            );
                        if (checkbox) {
                            checkbox.checked =
                                false;
                        }
                    }
                    paymentError.textContent =
                        "";
                    updateOrderTypeUI();
                    updatePaymentTotal();
                }
            );
        }
    );
const deliveryCheckbox =
    document.getElementById(
        "deliveryCheckbox"
    );
if (deliveryCheckbox) {
    deliveryCheckbox.addEventListener(
        "change",
        event => {
            deliveryRequested =
                Boolean(
                    event.target.checked
                );
        }
    );
}
updateOrderTypeUI();
document
    .querySelectorAll(
        ".payment-method"
    )
    .forEach(
        button => {
            button.addEventListener(
                "click",
                () => {
                    selectedPaymentMethod =
                        button.dataset.method;
                    document
                        .querySelectorAll(
                            ".payment-method"
                        )
                        .forEach(
                            item => {
                                item.classList.toggle(
                                    "active",
                                    item.dataset.method ===
                                    selectedPaymentMethod
                                );
                            }
                        );
                    paymentError.textContent =
                        "";
                    if (
                        selectedPaymentMethod ===
                        "Cash"
                    ) {
                        cashPaymentArea.style.display =
                            "block";
                        splitPaymentArea.style.display =
                            "none";
                        if (
                            paymentDestination
                        ) {
                            paymentDestination.textContent =
                                "Cash";
                        }
                    }
                    else if (
                        selectedPaymentMethod ===
                        "Split"
                    ) {
                        cashPaymentArea.style.display =
                            "none";
                        splitPaymentArea.style.display =
                            "block";
                        if (
                            paymentDestination
                        ) {
                            paymentDestination.textContent =
                                "Multiple Funds";
                        }
                        resetSplitPayment();
                    }
                    else {
                        cashPaymentArea.style.display =
                            "none";
                        splitPaymentArea.style.display =
                            "none";
                        if (
                            paymentDestination
                        ) {
                            paymentDestination.textContent =
                                selectedPaymentMethod;
                        }
                    }
                    updatePaymentTotal();
                }
            );
        }
    );
if (cashReceived) {
    cashReceived.addEventListener(
        "input",
        () => {
            updatePaymentTotal();
        }
    );
}
document
    .querySelectorAll(
        ".quick-cash button"
    )
    .forEach(
        button => {
            button.addEventListener(
                "click",
                () => {
                    if (
                        button.dataset.cash ===
                        "exact"
                    ) {
                        cashReceived.value =
                            cartTotal()
                                .toFixed(2);
                    }
                    else {
                        cashReceived.value =
                            button.dataset.cash;
                    }
                    updatePaymentTotal();
                }
            );
        }
    );
if (splitCash) {
    splitCash.addEventListener(
        "input",
        updateSplitPayment
    );
}
if (splitGCash) {
    splitGCash.addEventListener(
        "input",
        updateSplitPayment
    );
}
if (splitBDO) {
    splitBDO.addEventListener(
        "input",
        updateSplitPayment
    );
}
if (splitBIBO) {
    splitBIBO.addEventListener(
        "input",
        updateSplitPayment
    );
}
if (splitBPI) {
    splitBPI.addEventListener(
        "input",
        updateSplitPayment
    );
}
if (completeSale) {
    completeSale.addEventListener(
        "click",
        completeTransaction
    );
}
if (clearCartButton) {
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
                if (
                    discountElement
                ) {
                    discountElement.value =
                        "0";
                }
                renderCart();
            }
        }
    );
}
if (newSaleButton) {
    newSaleButton.addEventListener(
        "click",
        () => {
            successModal.classList.remove(
                "show"
            );
            cart = [];
            if (
                discountElement
            ) {
                discountElement.value =
                    "0";
            }
            renderCart();
        }
    );
}
if (paymentModal) {
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
}
if (successModal) {
    successModal.addEventListener(
        "click",
        event => {
            if (
                event.target ===
                successModal
            ) {
                successModal.classList.remove(
                    "show"
                );
            }
        }
    );
}
if (retryButton) {
    retryButton.addEventListener(
        "click",
        async () => {
            try {
                hideError();
                await loadProducts();
            } catch (error) {
                showError(
                    error
                );
            }
        }
    );
}
 /*  AUTHENTICATION
========================================================= */
onAuthStateChanged(
    auth,
    async user => {
        if (!user) {
            currentUser =
                null;
            return;
        }
        currentUser =
            user;
        try {
            hideError();
            await loadStaffInfo(
                user
            );
            await loadProducts();
            renderCart();
        } catch (error) {
            showError(
                error
            );
        }
    }
);
renderCart();
