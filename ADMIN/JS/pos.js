import {
    db,
    auth
} from "../../Firebase/firebase-config.js";

import {
    collection,
    getDocs,
    getDoc,
    doc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

fetch("sidebar.html")
    .then(response => {
        if (!response.ok) {
            throw new Error("Could not load sidebar.html");
        }

        return response.text();
    })
    .then(html => {
        document.getElementById("sidebar-container").innerHTML = html;

        const script = document.createElement("script");
        script.src = "sidebar.js?v=20";

        document.body.appendChild(script);
    })
    .catch(error => {
        console.error("Sidebar Error:", error);
    });

let products = [];
let packages = [];
let insurances = [];
let cart = [];

let selectedType = "all";
let selectedCategory = "all";
let selectedPaymentMethod = "Cash";

let currentUser = null;
let currentStaffName = "Unknown Staff";
let currentStaffStatus = "Active";

const productGrid = document.getElementById("productGrid");
const emptyProducts = document.getElementById("emptyProducts");
const categoryButtons = document.getElementById("categoryButtons");
const cartItems = document.getElementById("cartItems");
const emptyCart = document.getElementById("emptyCart");
const paymentModal = document.getElementById("paymentModal");
const receiptModal = document.getElementById("receiptModal");

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

function generateTransactionNumber() {
    const number = Math.floor(
        100000 + Math.random() * 900000
    );

    return `#TRX-${number}`;
}

document.getElementById("transactionNumber").textContent =
    generateTransactionNumber();

function getDiscountElement() {
    return document.getElementById("discount");
}

function getPaymentDiscountElement() {
    return document.getElementById("paymentDiscount");
}

function sanitizeIntegerDiscount(value) {
    let cleaned = String(value ?? "").replace(/\D/g, "");

    if (cleaned === "") {
        return 0;
    }

    return parseInt(cleaned, 10) || 0;
}

function getSubtotal() {
    let subtotal = 0;

    cart.forEach(cartItem => {
        const item = getCartItemData(cartItem);

        if (!item) {
            return;
        }

        subtotal +=
            item.price *
            cartItem.quantity;
    });

    return subtotal;
}

function getDiscount() {
    const paymentField = getPaymentDiscountElement();
    const cartField = getDiscountElement();

    let value = paymentField
        ? sanitizeIntegerDiscount(paymentField.value)
        : cartField
            ? sanitizeIntegerDiscount(cartField.value)
            : 0;

    const subtotal = getSubtotal();

    if (value > subtotal) {
        value = Math.floor(subtotal);
    }

    return value;
}

function setDiscount(value) {
    const subtotal = getSubtotal();

    let discount =
        sanitizeIntegerDiscount(value);

    if (discount > subtotal) {
        discount = Math.floor(subtotal);
    }

    const cartField =
        getDiscountElement();

    const paymentField =
        getPaymentDiscountElement();

    if (cartField) {
        cartField.value = discount;
    }

    if (paymentField) {
        paymentField.value = discount;
    }
}

async function loadProfile(user) {
    try {
        const userRef =
            doc(db, "users", user.uid);

        const snapshot =
            await getDoc(userRef);

        let name =
            user.displayName ||
            user.email?.split("@")[0] ||
            "User";

        let role = "User";
        let status = "Active";

        if (snapshot.exists()) {
            const data = snapshot.data();

            name =
                data.name ||
                name;

            role =
                data.role ||
                role;

            status =
                data.status ||
                "Active";
        }

        currentStaffName = name;

        currentStaffStatus =
            String(status).trim() ||
            "Active";

        const profileName =
            document.getElementById("profileName");

        const profileRole =
            document.getElementById("profileRole");

        const profileAvatar =
            document.getElementById("profileAvatar");

        if (profileName) {
            profileName.textContent =
                name;
        }

        if (profileRole) {
            profileRole.textContent =
                role;
        }

        if (profileAvatar) {
            const initials =
                name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(item => item[0])
                    .join("")
                    .toUpperCase();

            profileAvatar.textContent =
                initials || "U";
        }
    } catch (error) {
        console.error(
            "Profile Error:",
            error
        );
    }
}

async function loadProducts() {
    const snapshot =
        await getDocs(
            collection(
                db,
                "products"
            )
        );

    products =
        snapshot.docs.map(item => {
            const data =
                item.data();

            return {
                id: item.id,
                type: "product",
                name: data.name || "",
                sku: data.sku || "",
                category:
                    data.category ||
                    "Uncategorized",
                price:
                    Number(data.price) ||
                    0,
                cost:
                    Number(data.cost) ||
                    0,
                stock:
                    Number(data.stock) ||
                    0,
                lowStock:
                    Number(data.lowStock) ||
                    10,
                description:
                    data.description ||
                    "",
                image:
                    data.imageUrl ||
                    data.image ||
                    ""
            };
        });
}

async function loadPackages() {
    const snapshot =
        await getDocs(
            collection(
                db,
                "packages"
            )
        );

    packages =
        snapshot.docs.map(item => {
            const data =
                item.data();

            return {
                id: item.id,
                type: "package",
                name: data.name || "",
                sku: data.sku || "",
                price:
                    Number(data.price) ||
                    0,
                description:
                    data.description ||
                    "",
                image:
                    data.imageUrl ||
                    data.image ||
                    "",
                items:
                    Array.isArray(data.items)
                        ? data.items
                        : []
            };
        });
}

async function loadInsurance() {
    const snapshot =
        await getDocs(
            collection(
                db,
                "insurances"
            )
        );

    insurances =
        snapshot.docs.map(item => {
            const data =
                item.data();

            return {
                id: item.id,
                type: "insurance",
                name: data.name || "",
                sku: data.sku || "",
                price:
                    Number(data.price) ||
                    0,
                description:
                    data.description ||
                    "",
                status:
                    String(
                        data.status ||
                        "active"
                    )
                        .trim()
                        .toLowerCase(),
                image:
                    data.imageUrl ||
                    data.image ||
                    "",
                imageUrl:
                    data.imageUrl ||
                    data.image ||
                    "",
                imagePublicId:
                    data.imagePublicId ||
                    ""
            };
        });
}

async function loadPOSData() {
    try {
        await Promise.all([
            loadProducts(),
            loadPackages(),
            loadInsurance()
        ]);

        buildCategories();
        renderProducts();
    } catch (error) {
        console.error(
            "POS Firebase Error:",
            error
        );

        emptyProducts.classList.add(
            "show"
        );

        const title =
            emptyProducts.querySelector(
                "h3"
            );

        const message =
            emptyProducts.querySelector(
                "p"
            );

        if (title) {
            title.textContent =
                "Unable to load POS items";
        }

        if (message) {
            message.textContent =
                error.message ||
                "Check your Firebase connection.";
        }
    }
}

function buildCategories() {
    const categories = [
        ...new Set(
            products
                .map(product =>
                    product.category
                )
                .filter(Boolean)
        )
    ].sort(
        (a, b) =>
            a.localeCompare(b)
    );

    categoryButtons.innerHTML = "";

    const allButton =
        document.createElement(
            "button"
        );

    allButton.type = "button";
    allButton.className =
        "category-btn active";

    allButton.dataset.category =
        "all";

    allButton.textContent =
        "All Categories";

    categoryButtons.appendChild(
        allButton
    );

    categories.forEach(
        category => {
            const button =
                document.createElement(
                    "button"
                );

            button.type = "button";
            button.className =
                "category-btn";

            button.dataset.category =
                category;

            button.textContent =
                category;

            categoryButtons.appendChild(
                button
            );
        }
    );
}

function getPackageAvailability(
    packageItem
) {
    if (
        !packageItem.items ||
        packageItem.items.length === 0
    ) {
        return 0;
    }

    const availability =
        packageItem.items.map(
            item => {
                const product =
                    products.find(
                        product =>
                            product.id ===
                            item.productId
                    );

                if (!product) {
                    return 0;
                }

                const quantity =
                    Math.max(
                        1,
                        Number(
                            item.quantity
                        ) || 1
                    );

                return Math.floor(
                    product.stock /
                    quantity
                );
            }
        );

    return Math.max(
        0,
        Math.min(...availability)
    );
}

function getPackageContents(
    packageItem
) {
    if (
        !packageItem.items ||
        packageItem.items.length === 0
    ) {
        return "No products";
    }

    return packageItem.items
        .map(item => {
            const product =
                products.find(
                    product =>
                        product.id ===
                        item.productId
                );

            if (!product) {
                return "Missing product";
            }

            return `${item.quantity} × ${product.name}`;
        })
        .join(", ");
}

function renderProducts() {
    const searchInput =
        document.getElementById(
            "productSearch"
        );

    const search =
        searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";

    let items = [];

    if (
        selectedType === "all" ||
        selectedType === "product"
    ) {
        products.forEach(
            product => {
                items.push({
                    ...product
                });
            }
        );
    }

    if (
        selectedType === "all" ||
        selectedType === "package"
    ) {
        packages.forEach(
            packageItem => {
                items.push({
                    ...packageItem
                });
            }
        );
    }

    if (
        selectedType === "all" ||
        selectedType === "insurance"
    ) {
        insurances
            .filter(
                insurance =>
                    insurance.status ===
                    "active"
            )
            .forEach(
                insurance => {
                    items.push({
                        ...insurance
                    });
                }
            );
    }

    items =
        items.filter(item => {
            const matchesSearch =
                item.name
                    .toLowerCase()
                    .includes(search) ||
                item.sku
                    .toLowerCase()
                    .includes(search);

            const matchesCategory =
                item.type !== "product" ||
                selectedCategory ===
                "all" ||
                item.category ===
                selectedCategory;

            return (
                matchesSearch &&
                matchesCategory
            );
        });

    productGrid.innerHTML = "";

    if (items.length === 0) {
        emptyProducts.classList.add(
            "show"
        );

        return;
    }

    emptyProducts.classList.remove(
        "show"
    );

    items.forEach(
        item => {
            renderPOSCard(item);
        }
    );
}

function renderPOSCard(item) {
    const card =
        document.createElement(
            "button"
        );

    card.type = "button";
    card.className =
        "product-card";

    let availability = null;
    let typeLabel = "";
    let typeClass = "";

    if (item.type === "product") {
        typeLabel = "PRODUCT";
        typeClass = "product-type";
        availability = item.stock;

        if (item.stock <= 0) {
            card.classList.add(
                "out-of-stock"
            );
        }
    }

    if (item.type === "package") {
        typeLabel = "PACKAGE";
        typeClass = "package-type";

        availability =
            getPackageAvailability(
                item
            );

        if (availability <= 0) {
            card.classList.add(
                "out-of-stock"
            );
        }
    }

    if (item.type === "insurance") {
        typeLabel = "INSURANCE";
        typeClass =
            "insurance-type";
    }

    let imageHTML =
        `<div class="pos-card-icon">▣</div>`;

    if (item.image) {
        imageHTML = `
            <img
                src="${escapeHTML(item.image)}"
                alt="${escapeHTML(item.name)}"
                loading="lazy"
                onerror="this.style.display='none';this.parentElement.innerHTML='<div class=&quot;pos-card-icon&quot;>▣</div>';"
            >
        `;
    }

    let availabilityHTML = "";

    if (item.type === "product") {
        availabilityHTML = `
            <span class="product-stock ${item.stock <= 0
                ? "out"
                : item.stock <= item.lowStock
                    ? "low"
                    : ""
            }">
                ${item.stock <= 0
                ? "Out of stock"
                : `${item.stock} in stock`
            }
            </span>
        `;
    }

    if (item.type === "package") {
        availabilityHTML = `
            <span class="product-stock ${availability <= 0
                ? "out"
                : availability <= 5
                    ? "low"
                    : ""
            }">
                ${availability <= 0
                ? "Unavailable"
                : `${availability} package${availability === 1
                    ? ""
                    : "s"
                } available`
            }
            </span>
        `;
    }

    if (item.type === "insurance") {
        availabilityHTML = `
            <span class="product-stock insurance-stock">
                No stock required
            </span>
        `;
    }

    const contents =
        item.type === "package"
            ? `
                <div class="package-contents">
                    ${escapeHTML(
                getPackageContents(
                    item
                )
            )}
                </div>
            `
            : "";

    card.innerHTML = `
        <div class="product-image">
            ${imageHTML}
        </div>

        <span class="pos-item-type ${typeClass}">
            ${typeLabel}
        </span>

        <div class="product-card-name">
            ${escapeHTML(item.name)}
        </div>

        <div class="product-card-sku">
            ${escapeHTML(item.sku)}
        </div>

        ${contents}

        <div class="product-card-bottom">
            <span class="product-price">
                ${formatMoney(item.price)}
            </span>

            ${availabilityHTML}
        </div>
    `;

    card.addEventListener(
        "click",
        () => {
            addItemToCart(item);
        }
    );

    productGrid.appendChild(
        card
    );
}

function addItemToCart(item) {
    if (
        item.type === "product" &&
        item.stock <= 0
    ) {
        alert(
            "This product is out of stock."
        );

        return;
    }

    if (item.type === "package") {
        const available =
            getPackageAvailability(
                item
            );

        if (available <= 0) {
            alert(
                "This package is currently unavailable."
            );

            return;
        }
    }

    if (
        item.type === "insurance" &&
        item.status !== "active"
    ) {
        alert(
            "This insurance option is inactive."
        );

        return;
    }

    const existing =
        cart.find(
            cartItem =>
                cartItem.itemId ===
                item.id &&
                cartItem.type ===
                item.type
        );

    if (existing) {
        if (
            item.type === "product" &&
            existing.quantity >=
            item.stock
        ) {
            alert(
                `Only ${item.stock} units are available.`
            );

            return;
        }

        if (
            item.type === "package" &&
            existing.quantity >=
            getPackageAvailability(
                item
            )
        ) {
            alert(
                "There are not enough products to create another package."
            );

            return;
        }

        existing.quantity++;
    } else {
        cart.push({
            itemId: item.id,
            type: item.type,
            quantity: 1,
            name: item.name,
            sku: item.sku,
            price: item.price,
            image: item.image || ""
        });
    }

    renderCart();
}

function getCartItemData(
    cartItem
) {
    if (
        cartItem.type ===
        "product"
    ) {
        return products.find(
            product =>
                product.id ===
                cartItem.itemId
        );
    }

    if (
        cartItem.type ===
        "package"
    ) {
        return packages.find(
            packageItem =>
                packageItem.id ===
                cartItem.itemId
        );
    }

    if (
        cartItem.type ===
        "insurance"
    ) {
        return insurances.find(
            insurance =>
                insurance.id ===
                cartItem.itemId
        );
    }

    return null;
}

function renderCart() {
    const currentDiscount =
        getDiscount();

    cartItems.innerHTML = "";

    if (cart.length === 0) {
        cartItems.appendChild(
            emptyCart
        );

        emptyCart.style.display =
            "block";
    } else {
        emptyCart.style.display =
            "none";

        cart.forEach(
            cartItem => {
                const item =
                    getCartItemData(
                        cartItem
                    );

                if (!item) {
                    return;
                }

                const itemTotal =
                    item.price *
                    cartItem.quantity;

                const element =
                    document.createElement(
                        "div"
                    );

                element.className =
                    "cart-item";

                const typeLabel =
                    cartItem.type ===
                        "package"
                        ? "Package"
                        : cartItem.type ===
                            "insurance"
                            ? "Insurance"
                            : "Product";

                element.innerHTML = `
                    <div class="cart-item-image">
                        ${item.image
                        ? `
                                    <img
                                        src="${escapeHTML(item.image)}"
                                        alt="${escapeHTML(item.name)}"
                                        loading="lazy"
                                        onerror="this.style.display='none';this.parentElement.textContent='▣';"
                                    >
                                `
                        : "▣"
                    }
                    </div>

                    <div class="cart-item-details">
                        <div class="cart-item-name">
                            ${escapeHTML(item.name)}
                        </div>

                        <div class="cart-item-price">
                            ${typeLabel}
                            ·
                            ${formatMoney(item.price)}
                            each
                        </div>

                        <div class="cart-item-controls">
                            <button
                                type="button"
                                class="quantity-btn"
                                data-action="decrease"
                                data-id="${item.id}"
                                data-type="${cartItem.type}"
                            >
                                −
                            </button>

                            <span class="quantity">
                                ${cartItem.quantity}
                            </span>

                            <button
                                type="button"
                                class="quantity-btn"
                                data-action="increase"
                                data-id="${item.id}"
                                data-type="${cartItem.type}"
                            >
                                +
                            </button>

                            <button
                                type="button"
                                class="remove-item"
                                data-action="remove"
                                data-id="${item.id}"
                                data-type="${cartItem.type}"
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    <div class="cart-item-total">
                        ${formatMoney(itemTotal)}
                    </div>
                `;

                cartItems.appendChild(
                    element
                );
            }
        );
    }

    setDiscount(
        currentDiscount
    );

    updateTotals();
}

cartItems.addEventListener(
    "click",
    event => {
        const button =
            event.target.closest(
                "button[data-action]"
            );

        if (!button) {
            return;
        }

        const itemId =
            button.dataset.id;

        const type =
            button.dataset.type;

        const action =
            button.dataset.action;

        const cartItem =
            cart.find(
                item =>
                    item.itemId ===
                    itemId &&
                    item.type ===
                    type
            );

        if (!cartItem) {
            return;
        }

        const item =
            getCartItemData(
                cartItem
            );

        if (!item) {
            return;
        }

        if (action === "increase") {
            if (
                type === "product" &&
                cartItem.quantity >=
                item.stock
            ) {
                alert(
                    `Only ${item.stock} units are available.`
                );

                return;
            }

            if (
                type === "package" &&
                cartItem.quantity >=
                getPackageAvailability(
                    item
                )
            ) {
                alert(
                    "There are not enough component products for another package."
                );

                return;
            }

            cartItem.quantity++;
        }

        if (action === "decrease") {
            cartItem.quantity--;

            if (
                cartItem.quantity <= 0
            ) {
                cart =
                    cart.filter(
                        item =>
                            !(
                                item.itemId ===
                                itemId &&
                                item.type ===
                                type
                            )
                    );
            }
        }

        if (action === "remove") {
            cart =
                cart.filter(
                    item =>
                        !(
                            item.itemId ===
                            itemId &&
                            item.type ===
                            type
                        )
                );
        }

        renderCart();
    }
);

function updateTotals() {
    let subtotal =
        getSubtotal();

    let itemCount = 0;

    cart.forEach(
        cartItem => {
            itemCount +=
                cartItem.quantity;
        }
    );

    let discount =
        sanitizeIntegerDiscount(
            getDiscountElement()
                ?.value || 0
        );

    if (discount > subtotal) {
        discount =
            Math.floor(subtotal);
    }

    if (getDiscountElement()) {
        getDiscountElement().value =
            discount;
    }

    const paymentField =
        getPaymentDiscountElement();

    if (paymentField) {
        paymentField.value =
            discount;
    }

    const total =
        Math.max(
            0,
            subtotal - discount
        );

    document.getElementById(
        "cartItemCount"
    ).textContent =
        `${itemCount} ${itemCount === 1
            ? "item"
            : "items"
        }`;

    document.getElementById(
        "subtotal"
    ).textContent =
        formatMoney(subtotal);

    document.getElementById(
        "discountTotal"
    ).textContent =
        `-${formatMoney(discount)}`;

    document.getElementById(
        "total"
    ).textContent =
        formatMoney(total);

    document.getElementById(
        "checkoutButton"
    ).disabled =
        cart.length === 0;
}

document
    .getElementById(
        "productSearch"
    )
    .addEventListener(
        "input",
        renderProducts
    );

document
    .getElementById(
        "globalSearch"
    )
    .addEventListener(
        "input",
        event => {
            document.getElementById(
                "productSearch"
            ).value =
                event.target.value;

            renderProducts();
        }
    );

const posTypeTabs =
    document.getElementById(
        "posTypeTabs"
    );

if (posTypeTabs) {
    posTypeTabs.addEventListener(
        "click",
        event => {
            const button =
                event.target.closest(
                    ".pos-type-tab"
                );

            if (!button) {
                return;
            }

            document
                .querySelectorAll(
                    ".pos-type-tab"
                )
                .forEach(
                    tab =>
                        tab.classList.remove(
                            "active"
                        )
                );

            button.classList.add(
                "active"
            );

            selectedType =
                button.dataset.type;

            if (
                selectedType !==
                "product"
            ) {
                selectedCategory =
                    "all";

                document
                    .querySelectorAll(
                        ".category-btn"
                    )
                    .forEach(
                        button =>
                            button.classList.remove(
                                "active"
                            )
                    );

                document
                    .querySelector(
                        '.category-btn[data-category="all"]'
                    )
                    ?.classList.add(
                        "active"
                    );
            }

            renderProducts();
        }
    );
}

categoryButtons.addEventListener(
    "click",
    event => {
        const button =
            event.target.closest(
                ".category-btn"
            );

        if (!button) {
            return;
        }

        document
            .querySelectorAll(
                ".category-btn"
            )
            .forEach(
                btn =>
                    btn.classList.remove(
                        "active"
                    )
            );

        button.classList.add(
            "active"
        );

        selectedCategory =
            button.dataset.category;

        if (
            selectedCategory !==
            "all"
        ) {
            selectedType =
                "product";
        }

        const activeTab =
            document.querySelector(
                `.pos-type-tab[data-type="${selectedType}"]`
            );

        if (activeTab) {
            document
                .querySelectorAll(
                    ".pos-type-tab"
                )
                .forEach(
                    tab =>
                        tab.classList.remove(
                            "active"
                        )
                );

            activeTab.classList.add(
                "active"
            );
        }

        renderProducts();
    }
);

const cartDiscount =
    document.getElementById(
        "discount"
    );

if (cartDiscount) {
    cartDiscount.type = "text";
    cartDiscount.inputMode =
        "numeric";
    cartDiscount.pattern =
        "[0-9]*";
    cartDiscount.min = "0";
    cartDiscount.step = "1";

    cartDiscount.addEventListener(
        "input",
        function () {
            let value =
                this.value.replace(
                    /\D/g,
                    ""
                );

            const subtotal =
                getSubtotal();

            if (
                value !== "" &&
                Number(value) >
                subtotal
            ) {
                value =
                    String(
                        Math.floor(
                            subtotal
                        )
                    );
            }

            this.value =
                value;

            updateTotals();
            updatePaymentAmount();
            updateChange();
        }
    );
}

function createPaymentDiscountField() {
    if (
        document.getElementById(
            "paymentDiscount"
        )
    ) {
        return;
    }

    const paymentContent =
        document.querySelector(
            "#paymentModal .payment-content"
        );

    if (!paymentContent) {
        return;
    }

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.className =
        "payment-discount-field";

    wrapper.innerHTML = `
        <label for="paymentDiscount">
            Discount Amount
        </label>

        <div class="payment-discount-input">
            <span>₱</span>

            <input
                type="text"
                id="paymentDiscount"
                inputmode="numeric"
                pattern="[0-9]*"
                autocomplete="off"
                value="0"
                placeholder="0"
            >
        </div>

        <small>
            Enter the discount amount in pesos.
        </small>
    `;

    const paymentTotal =
        document.querySelector(
            ".payment-total"
        );

    if (paymentTotal) {
        paymentTotal.insertAdjacentElement(
            "afterend",
            wrapper
        );
    } else {
        paymentContent.prepend(
            wrapper
        );
    }

    const input =
        document.getElementById(
            "paymentDiscount"
        );

    input.addEventListener(
        "input",
        function () {
            let value =
                this.value.replace(
                    /\D/g,
                    ""
                );

            const subtotal =
                getSubtotal();

            if (
                value !== "" &&
                Number(value) >
                subtotal
            ) {
                value =
                    String(
                        Math.floor(
                            subtotal
                        )
                    );
            }

            this.value =
                value;

            setDiscount(
                value
            );

            updateTotals();
            updatePaymentAmount();
            updateChange();
        }
    );
}

function updatePaymentAmount() {
    const paymentTotal =
        document.getElementById(
            "paymentTotal"
        );

    if (paymentTotal) {
        paymentTotal.textContent =
            formatMoney(
                getCartTotal()
            );
    }
}

function updateChange() {
    const changeElement =
        document.getElementById(
            "changeAmount"
        );

    if (!changeElement) {
        return;
    }

    const total =
        getCartTotal();

    if (
        selectedPaymentMethod !==
        "Cash"
    ) {
        changeElement.textContent =
            formatMoney(0);

        return;
    }

    const cash =
        Number(
            document.getElementById(
                "cashReceived"
            )?.value
        ) || 0;

    changeElement.textContent =
        formatMoney(
            Math.max(
                0,
                cash - total
            )
        );
}

document
    .getElementById(
        "clearCart"
    )
    .addEventListener(
        "click",
        () => {
            if (
                cart.length === 0
            ) {
                return;
            }

            if (
                confirm(
                    "Clear all items from the cart?"
                )
            ) {
                cart = [];

                setDiscount(0);

                renderCart();
            }
        }
    );

document
    .getElementById(
        "checkoutButton"
    )
    .addEventListener(
        "click",
        openPayment
    );

function openPayment() {
    createPaymentDiscountField();

    const subtotal =
        getSubtotal();

    if (subtotal <= 0) {
        return;
    }

    setDiscount(
        getDiscount()
    );

    const total =
        getCartTotal();

    document.getElementById(
        "paymentTotal"
    ).textContent =
        formatMoney(total);

    document.getElementById(
        "cashReceived"
    ).value = "";

    document.getElementById(
        "changeAmount"
    ).textContent =
        formatMoney(0);

    document.getElementById(
        "paymentError"
    ).textContent = "";

    const paymentDiscount =
        document.getElementById(
            "paymentDiscount"
        );

    if (paymentDiscount) {
        paymentDiscount.value =
            getDiscount();
    }

    selectedPaymentMethod =
        "Cash";

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

    document.getElementById(
        "cashField"
    ).style.display =
        "block";

    paymentModal.classList.add(
        "show"
    );
}

function getCartTotal() {
    const subtotal =
        getSubtotal();

    const discount =
        Math.min(
            getDiscount(),
            subtotal
        );

    return Math.max(
        0,
        subtotal - discount
    );
}

document
    .querySelectorAll(
        ".payment-method"
    )
    .forEach(
        button => {
            button.addEventListener(
                "click",
                function () {
                    document
                        .querySelectorAll(
                            ".payment-method"
                        )
                        .forEach(
                            btn =>
                                btn.classList.remove(
                                    "active"
                                )
                        );

                    this.classList.add(
                        "active"
                    );

                    selectedPaymentMethod =
                        this.dataset.method;

                    const cashField =
                        document.getElementById(
                            "cashField"
                        );

                    if (
                        selectedPaymentMethod ===
                        "Cash"
                    ) {
                        cashField.style.display =
                            "block";
                    } else {
                        cashField.style.display =
                            "none";

                        document.getElementById(
                            "changeAmount"
                        ).textContent =
                            formatMoney(0);
                    }
                }
            );
        }
    );

document
    .getElementById(
        "cashReceived"
    )
    .addEventListener(
        "input",
        function () {
            this.value =
                this.value.replace(
                    /[^\d.]/g,
                    ""
                );

            updateChange();
        }
    );

function calculateInventoryRequirements() {
    const requirements =
        new Map();

    cart.forEach(
        cartItem => {
            if (
                cartItem.type ===
                "product"
            ) {
                const current =
                    requirements.get(
                        cartItem.itemId
                    ) || 0;

                requirements.set(
                    cartItem.itemId,
                    current +
                    cartItem.quantity
                );
            }

            if (
                cartItem.type ===
                "package"
            ) {
                const packageItem =
                    packages.find(
                        packageItem =>
                            packageItem.id ===
                            cartItem.itemId
                    );

                if (!packageItem) {
                    return;
                }

                packageItem.items.forEach(
                    component => {
                        const quantity =
                            Number(
                                component.quantity
                            ) || 0;

                        const current =
                            requirements.get(
                                component.productId
                            ) || 0;

                        requirements.set(
                            component.productId,
                            current +
                            quantity *
                            cartItem.quantity
                        );
                    }
                );
            }
        }
    );

    return requirements;
}

function validateInventory() {
    const requirements =
        calculateInventoryRequirements();

    for (
        const [
            productId,
            requiredQuantity
        ] of requirements
    ) {
        const product =
            products.find(
                item =>
                    item.id ===
                    productId
            );

        if (!product) {
            return {
                valid: false,
                message:
                    "A product required by this sale no longer exists."
            };
        }

        if (
            product.stock <
            requiredQuantity
        ) {
            return {
                valid: false,
                message:
                    `${product.name} only has ${product.stock} in stock, but ${requiredQuantity} is required.`
            };
        }
    }

    return {
        valid: true
    };
}

document
    .getElementById(
        "completePayment"
    )
    .addEventListener(
        "click",
        completeSale
    );

async function completeSale() {
    const total =
        getCartTotal();

    if (
        cart.length === 0
    ) {
        return;
    }

    const subtotal =
        getSubtotal();

    const discount =
        Math.min(
            getDiscount(),
            subtotal
        );

    const cash =
        Number(
            document.getElementById(
                "cashReceived"
            ).value
        ) || 0;

    let change = 0;

    if (
        selectedPaymentMethod ===
        "Cash"
    ) {
        if (cash < total) {
            document.getElementById(
                "paymentError"
            ).textContent =
                `Insufficient payment. Amount due is ${formatMoney(total)}.`;

            return;
        }

        change =
            cash - total;
    }

    const inventory =
        validateInventory();

    if (!inventory.valid) {
        document.getElementById(
            "paymentError"
        ).textContent =
            inventory.message;

        return;
    }

    const button =
        document.getElementById(
            "completePayment"
        );

    try {
        button.disabled = true;
        button.textContent =
            "Processing...";

        const transactionNumber =
            document.getElementById(
                "transactionNumber"
            ).textContent;

        const customer =
            document.getElementById(
                "customerName"
            ).value.trim() ||
            "Walk-in Customer";

        const batch =
            writeBatch(db);

        const requirements =
            calculateInventoryRequirements();

        for (
            const [
                productId,
                requiredQuantity
            ] of requirements
        ) {
            const productRef =
                doc(
                    db,
                    "products",
                    productId
                );

            const product =
                products.find(
                    item =>
                        item.id ===
                        productId
                );

            if (!product) {
                throw new Error(
                    "A product required by this sale could not be found."
                );
            }

            batch.update(
                productRef,
                {
                    stock:
                        product.stock -
                        requiredQuantity,

                    updatedAt:
                        serverTimestamp()
                }
            );
        }

        const saleItems =
            cart.map(
                cartItem => {
                    const item =
                        getCartItemData(
                            cartItem
                        );

                    return {
                        itemId:
                            cartItem.itemId,

                        type:
                            cartItem.type,

                        name:
                            item?.name ||
                            cartItem.name,

                        sku:
                            item?.sku ||
                            cartItem.sku,

                        price:
                            Number(
                                item?.price ??
                                cartItem.price
                            ),

                        quantity:
                            cartItem.quantity,

                        total:
                            Number(
                                item?.price ??
                                cartItem.price
                            ) *
                            cartItem.quantity,

                        image:
                            item?.image ||
                            cartItem.image ||
                            ""
                    };
                }
            );

        const saleRef =
            doc(
                collection(
                    db,
                    "sales"
                )
            );

        batch.set(
            saleRef,
            {
                transactionNumber,
                customer,
                items: saleItems,

                subtotal,

                discount,

                total,

                paymentMethod:
                    selectedPaymentMethod,

                cashReceived:
                    selectedPaymentMethod ===
                        "Cash"
                        ? cash
                        : null,

                change:
                    selectedPaymentMethod ===
                        "Cash"
                        ? change
                        : 0,

                cashierId:
                    currentUser?.uid ||
                    null,

                cashierEmail:
                    currentUser?.email ||
                    null,

                staffName:
                    currentStaffName,

                cashier:
                    currentStaffName,

                staffStatus:
                    currentStaffStatus,

                status:
                    "Completed",

                createdAt:
                    serverTimestamp()
            }
        );

        const movementRef =
            doc(
                collection(
                    db,
                    "inventoryMovements"
                )
            );

        batch.set(
            movementRef,
            {
                type: "sale",

                transactionNumber,

                items: saleItems,

                createdBy:
                    currentUser?.uid ||
                    null,

                staffName:
                    currentStaffName,

                staffStatus:
                    currentStaffStatus,

                createdAt:
                    serverTimestamp()
            }
        );

        await batch.commit();

        requirements.forEach(
            (
                requiredQuantity,
                productId
            ) => {
                const product =
                    products.find(
                        item =>
                            item.id ===
                            productId
                    );

                if (product) {
                    product.stock -=
                        requiredQuantity;
                }
            }
        );

        generateReceipt(
            total,
            discount,
            cash,
            change,
            transactionNumber,
            customer,
            subtotal
        );

        paymentModal.classList.remove(
            "show"
        );

        receiptModal.classList.add(
            "show"
        );

        cart = [];

        setDiscount(0);

        document.getElementById(
            "customerName"
        ).value = "";

        document.getElementById(
            "transactionNumber"
        ).textContent =
            generateTransactionNumber();

        renderCart();
        renderProducts();
    } catch (error) {
        console.error(
            "Complete Sale Error:",
            error
        );

        document.getElementById(
            "paymentError"
        ).textContent =
            error.message ||
            "Unable to complete sale.";
    } finally {
        button.disabled = false;
        button.textContent =
            "Complete Sale";
    }
}

function generateReceipt(
    total,
    discount,
    cash,
    change,
    transactionNumber,
    customer,
    subtotal
) {
    document.getElementById(
        "receiptTransaction"
    ).textContent =
        transactionNumber;

    document.getElementById(
        "receiptDate"
    ).textContent =
        new Date().toLocaleString(
            "en-PH",
            {
                dateStyle: "medium",
                timeStyle: "short"
            }
        );

    document.getElementById(
        "receiptCustomer"
    ).textContent =
        customer;

    document.getElementById(
        "receiptSubtotal"
    ).textContent =
        formatMoney(subtotal);

    document.getElementById(
        "receiptDiscount"
    ).textContent =
        `-${formatMoney(discount)}`;

    document.getElementById(
        "receiptTotal"
    ).textContent =
        formatMoney(total);

    document.getElementById(
        "receiptPayment"
    ).textContent =
        selectedPaymentMethod;

    document.getElementById(
        "receiptCash"
    ).textContent =
        selectedPaymentMethod ===
            "Cash"
            ? formatMoney(cash)
            : "N/A";

    document.getElementById(
        "receiptChange"
    ).textContent =
        selectedPaymentMethod ===
            "Cash"
            ? formatMoney(change)
            : formatMoney(0);

    const receiptItems =
        document.getElementById(
            "receiptItems"
        );

    receiptItems.innerHTML = "";

    cart.forEach(
        cartItem => {
            const item =
                getCartItemData(
                    cartItem
                );

            if (!item) {
                return;
            }

            const itemTotal =
                item.price *
                cartItem.quantity;

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "receipt-item";

            const typeLabel =
                cartItem.type ===
                    "package"
                    ? "PACKAGE"
                    : cartItem.type ===
                        "insurance"
                        ? "INSURANCE"
                        : "PRODUCT";

            row.innerHTML = `
                <div>
                    <div class="receipt-item-name">
                        ${escapeHTML(item.name)}
                    </div>

                    <div class="receipt-item-qty">
                        ${typeLabel}
                        ·
                        ${cartItem.quantity}
                        ×
                        ${formatMoney(item.price)}
                    </div>
                </div>

                <div class="receipt-item-total">
                    ${formatMoney(itemTotal)}
                </div>
            `;

            receiptItems.appendChild(
                row
            );
        }
    );
}

document
    .getElementById(
        "closePayment"
    )
    .addEventListener(
        "click",
        () => {
            paymentModal.classList.remove(
                "show"
            );
        }
    );

document
    .getElementById(
        "closeReceipt"
    )
    .addEventListener(
        "click",
        () => {
            receiptModal.classList.remove(
                "show"
            );
        }
    );

document
    .getElementById(
        "printReceipt"
    )
    .addEventListener(
        "click",
        () => {
            const receipt =
                document.getElementById(
                    "receipt"
                ).innerHTML;

            const printWindow =
                window.open(
                    "",
                    "_blank",
                    "width=450,height=700"
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
                        StockMaster Receipt
                    </title>

                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            width: 300px;
                            margin: 20px auto;
                            font-size: 12px;
                        }

                        * {
                            box-sizing: border-box;
                        }

                        .receipt {
                            width: 100%;
                        }

                        .receipt-brand {
                            text-align: center;
                            margin-bottom: 15px;
                        }

                        .receipt-brand h2 {
                            margin: 0;
                        }

                        .receipt-brand p {
                            margin: 4px 0;
                        }

                        .receipt-line {
                            border-top: 1px dashed #777;
                            margin: 10px 0;
                        }

                        .receipt-info > div,
                        .receipt-total > div {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 6px;
                        }

                        .receipt-item {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 7px;
                        }

                        .receipt-item-qty {
                            color: #666;
                            font-size: 10px;
                        }

                        .receipt-grand-total {
                            border-top: 1px solid #000;
                            padding-top: 7px;
                        }

                        .receipt-thankyou {
                            text-align: center;
                            margin-top: 15px;
                        }

                        img {
                            max-width: 100%;
                        }
                    </style>
                </head>

                <body>
                    <div class="receipt">
                        ${receipt}
                    </div>

                    <script>
                        window.onload = function () {
                            window.print();
                        };
                    <\/script>
                </body>
                </html>
            `);

            printWindow.document.close();
        }
    );

onAuthStateChanged(
    auth,
    async user => {
        if (!user) {
            console.error(
                "No authenticated user."
            );

            return;
        }

        currentUser = user;

        await loadProfile(
            user
        );

        await loadPOSData();

        createPaymentDiscountField();

        renderCart();
    }
);