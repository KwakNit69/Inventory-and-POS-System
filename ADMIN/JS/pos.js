import { db, auth } from "../../Firebase/firebase-config.js";
import { collection, getDocs, getDoc, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
fetch("sidebar.html").then(r => { if (!r.ok) throw new Error("Could not load sidebar.html"); return r.text() }).then(html => { document.getElementById("sidebar-container").innerHTML = html; const script = document.createElement("script"); script.src = "sidebar.js?v=20"; document.body.appendChild(script) }).catch(console.error);
let products = [];
let packages = [];
let insurances = [];
let cart = [];
let selectedType = "all";
let selectedCategory = "all";
let selectedPaymentMethod = "Cash";
let selectedOrderType = "sale";
let splitPayments = { Cash: 0, GCash: 0, BDO: 0, BIBO: 0, BPI: 0 };
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
const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const generateTransactionNumber = () => `#TRX-${Math.floor(100000 + Math.random() * 900000)}`;
document.getElementById("transactionNumber").textContent = generateTransactionNumber();
const discountInput = () => document.getElementById("paymentDiscount");
const subtotal = () => cart.reduce((sum, item) => { const data = getItemData(item); return sum + (data ? Number(data.price) * item.quantity : 0) }, 0);
const discount = () => { const value = parseInt(String(discountInput()?.value || 0).replace(/\D/g, ""), 10) || 0; return Math.min(value, subtotal()) };
const total = () => Math.max(0, subtotal() - discount());
function getItemData(item) { if (item.type === "product") return products.find(product => product.id === item.itemId); if (item.type === "package") return packages.find(pkg => pkg.id === item.itemId); if (item.type === "insurance") return insurances.find(insurance => insurance.id === item.itemId); return null }
function getPackageAvailability(pkg) { if (!pkg.items?.length) return 0; return Math.max(0, ...pkg.items.map(item => { const product = products.find(product => product.id === item.productId); return product ? Math.floor(product.stock / Math.max(1, Number(item.quantity) || 1)) : 0 })) }
function getPackageContents(pkg) { if (!pkg.items?.length) return "No products"; return pkg.items.map(item => { const product = products.find(product => product.id === item.productId); return product ? `${item.quantity} × ${product.name}` : "Missing product" }).join(", ") }
async function loadProfile(user) { try { const snapshot = await getDoc(doc(db, "users", user.uid)); const data = snapshot.exists() ? snapshot.data() : {}; currentStaffName = data.name || user.displayName || user.email?.split("@")[0] || "User"; currentStaffStatus = String(data.status || "Active").trim() || "Active"; document.getElementById("profileName").textContent = currentStaffName; document.getElementById("profileRole").textContent = data.role || "User"; document.getElementById("profileAvatar").textContent = currentStaffName.split(" ").filter(Boolean).slice(0, 2).map(name => name[0]).join("").toUpperCase() || "U" } catch (error) { console.error(error) } }
async function loadData() { const [productSnapshot, packageSnapshot, insuranceSnapshot] = await Promise.all([getDocs(collection(db, "products")), getDocs(collection(db, "packages")), getDocs(collection(db, "insurances"))]); products = productSnapshot.docs.map(snapshot => { const data = snapshot.data(); return { id: snapshot.id, type: "product", name: data.name || "", sku: data.sku || "", category: data.category || "Uncategorized", price: Number(data.price) || 0, costPrice: Number(data.costPrice) || 0, stock: Number(data.stock) || 0, lowStock: Number(data.lowStock) || 10, description: data.description || "", image: data.imageUrl || data.image || "" } }); packages = packageSnapshot.docs.map(snapshot => { const data = snapshot.data(); return { id: snapshot.id, type: "package", name: data.name || "", sku: data.sku || "", price: Number(data.price) || 0, description: data.description || "", image: data.imageUrl || data.image || "", items: Array.isArray(data.items) ? data.items : [] } }); insurances = insuranceSnapshot.docs.map(snapshot => { const data = snapshot.data(); return { id: snapshot.id, type: "insurance", name: data.name || "", sku: data.sku || "", price: Number(data.price) || 0, description: data.description || "", status: String(data.status || "active").toLowerCase(), image: data.imageUrl || data.image || "" } }); buildCategories(); renderProducts() }
function buildCategories() { const categories = [...new Set(products.map(product => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)); categoryButtons.innerHTML = '<button type="button" class="category-btn active" data-category="all">All Categories</button>'; categories.forEach(category => { const button = document.createElement("button"); button.type = "button"; button.className = "category-btn"; button.dataset.category = category; button.textContent = category; categoryButtons.appendChild(button) }) }
function renderProducts() { const search = (document.getElementById("productSearch")?.value || "").trim().toLowerCase(); let items = []; if (selectedType === "all" || selectedType === "product") items.push(...products); if (selectedType === "all" || selectedType === "package") items.push(...packages); if (selectedType === "all" || selectedType === "insurance") items.push(...insurances.filter(item => item.status === "active")); items = items.filter(item => (item.name || "").toLowerCase().includes(search) || (item.sku || "").toLowerCase().includes(search)).filter(item => item.type !== "product" || selectedCategory === "all" || item.category === selectedCategory); productGrid.innerHTML = ""; emptyProducts.classList.toggle("show", !items.length); items.forEach(renderProductCard) }
function renderProductCard(item) { let availability = null; let stockText = ""; if (item.type === "product") { availability = item.stock; stockText = item.stock <= 0 ? "Out of stock" : `${item.stock} in stock` } else if (item.type === "package") { availability = getPackageAvailability(item); stockText = availability <= 0 ? "Unavailable" : `${availability} available` } else { stockText = "Available" } const button = document.createElement("button"); button.type = "button"; button.className = `product-card${availability !== null && availability <= 0 ? " out-of-stock" : ""}`; const image = item.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='▣'">` : `<div class="pos-card-icon">▣</div>`; button.innerHTML = `<div class="product-image">${image}</div><span class="pos-item-type ${item.type}-type">${item.type.toUpperCase()}</span><div class="product-card-name">${esc(item.name)}</div><div class="product-card-sku">${esc(item.sku)}</div>${item.type === "package" ? `<div class="package-contents">${esc(getPackageContents(item))}</div>` : ""}<div class="product-card-bottom"><span class="product-price">${money(item.price)}</span><span class="product-stock ${availability !== null && availability <= 0 ? "out" : availability !== null && availability <= 5 ? "low" : ""}">${stockText}</span></div>`; button.addEventListener("click", () => addToCart(item)); productGrid.appendChild(button) }
function addToCart(item) { if (item.type === "product" && item.stock <= 0) { alert("This product is out of stock."); return } if (item.type === "package" && getPackageAvailability(item) <= 0) { alert("This package is currently unavailable."); return } if (item.type === "insurance" && item.status !== "active") { alert("This insurance option is inactive."); return } const existing = cart.find(cartItem => cartItem.itemId === item.id && cartItem.type === item.type); if (existing) { if (item.type === "product" && existing.quantity >= item.stock) { alert(`Only ${item.stock} units are available.`); return } if (item.type === "package" && existing.quantity >= getPackageAvailability(item)) { alert("There are not enough component products for another package."); return } existing.quantity++ } else { cart.push({ itemId: item.id, type: item.type, quantity: 1, name: item.name, sku: item.sku, price: item.price, costPrice: Number(item.costPrice) || 0, image: item.image }) } renderCart() }
function renderCart() { cartItems.innerHTML = ""; emptyCart.classList.toggle("show", cart.length === 0); if (!cart.length) { cartItems.appendChild(emptyCart) } else { cart.forEach(item => { const data = getItemData(item); if (!data) return; const element = document.createElement("div"); element.className = "cart-item"; element.innerHTML = `<div class="cart-item-image">${data.image ? `<img src="${esc(data.image)}" alt="${esc(data.name)}">` : "▣"}</div><div class="cart-item-details"><div class="cart-item-name">${esc(data.name)}</div><div class="cart-item-price">${item.type} · ${money(data.price)} each</div><div class="cart-item-controls"><button type="button" class="quantity-btn" data-action="decrease" data-id="${data.id}" data-type="${item.type}">−</button><span class="quantity">${item.quantity}</span><button type="button" class="quantity-btn" data-action="increase" data-id="${data.id}" data-type="${item.type}">+</button><button type="button" class="remove-item" data-action="remove" data-id="${data.id}" data-type="${item.type}">×</button></div></div><div class="cart-item-total">${money(data.price * item.quantity)}</div>`; cartItems.appendChild(element) }) } updateTotals() }
function updateTotals() { const subtotalAmount = subtotal(); const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0); const finalTotal = Math.max(0, subtotalAmount - discount()); document.getElementById("cartItemCount").textContent = `${itemCount} ${itemCount === 1 ? "item" : "items"}`; document.getElementById("subtotal").textContent = money(subtotalAmount); document.getElementById("total").textContent = money(finalTotal); document.getElementById("checkoutButton").disabled = !cart.length }
cartItems.addEventListener("click", event => { const button = event.target.closest("button[data-action]"); if (!button) return; const item = cart.find(cartItem => cartItem.itemId === button.dataset.id && cartItem.type === button.dataset.type); if (!item) return; const data = getItemData(item); if (button.dataset.action === "increase") { if (item.type === "product" && item.quantity >= data.stock) { alert(`Only ${data.stock} units are available.`); return } if (item.type === "package" && item.quantity >= getPackageAvailability(data)) { alert("There are not enough component products for another package."); return } item.quantity++ } else if (button.dataset.action === "decrease") { item.quantity--; if (item.quantity <= 0) cart = cart.filter(cartItem => cartItem !== item) } else { cart = cart.filter(cartItem => cartItem !== item) } renderCart() });
document.getElementById("productSearch").addEventListener("input", renderProducts);
document.getElementById("globalSearch").addEventListener("input", event => { document.getElementById("productSearch").value = event.target.value; renderProducts() });
document.getElementById("posTypeTabs").addEventListener("click", event => { const button = event.target.closest(".pos-type-tab"); if (!button) return; document.querySelectorAll(".pos-type-tab").forEach(item => item.classList.remove("active")); button.classList.add("active"); selectedType = button.dataset.type; if (selectedType !== "product") selectedCategory = "all"; document.querySelectorAll(".category-btn").forEach(item => item.classList.toggle("active", item.dataset.category === selectedCategory)); renderProducts() });
categoryButtons.addEventListener("click", event => { const button = event.target.closest(".category-btn"); if (!button) return; document.querySelectorAll(".category-btn").forEach(item => item.classList.remove("active")); button.classList.add("active"); selectedCategory = button.dataset.category; if (selectedCategory !== "all") selectedType = "product"; document.querySelectorAll(".pos-type-tab").forEach(item => item.classList.toggle("active", item.dataset.type === selectedType)); renderProducts() });
function bindDiscount() { const input = discountInput(); if (!input || input.dataset.bound) return; input.dataset.bound = "1"; input.addEventListener("input", () => { let value = input.value.replace(/\D/g, ""); if (Number(value) > subtotal()) value = String(Math.floor(subtotal())); input.value = value; updateTotals(); updatePayment() }) }
function resetSplit() { splitPayments = { Cash: 0, GCash: 0, BDO: 0, BIBO: 0, BPI: 0 };["splitCash", "splitGCash", "splitBDO", "splitBIBO", "splitBPI"].forEach(id => { const input = document.getElementById(id); if (input) input.value = "" }); updateSplit() }
function splitTotal() { return Object.values(splitPayments).reduce((sum, value) => sum + Number(value || 0), 0) }
function updateSplit() {
    const amountDue = total();
    const amountPaid = splitTotal();
    const remaining = Math.max(0, amountDue - amountPaid);
    const overpayment = Math.max(0, amountPaid - amountDue);
    document.getElementById("splitTotalPaid").textContent = money(amountPaid);
    document.getElementById("splitRemaining").textContent = money(remaining);
    // Split payments must be exact. Never create change from a split payment.
    document.getElementById("changeAmount").textContent = money(0);
    const paymentError = document.getElementById("paymentError");
    if (paymentError) {
        if (overpayment > 0) {
            paymentError.textContent =
                `Split payment exceeds the amount due by ${money(overpayment)}.`;
        } else if (remaining > 0) {
            paymentError.textContent =
                `Split payment is ${money(remaining)} short.`;
        } else {
            paymentError.textContent = "";
        }
    }
}
function updatePayment() { document.getElementById("paymentTotal").textContent = money(total()); if (selectedPaymentMethod === "Split") { updateSplit(); return } if (selectedPaymentMethod === "Cash") { const cash = Number(document.getElementById("cashReceived").value) || 0; document.getElementById("changeAmount").textContent = money(Math.max(0, cash - total())) } else { document.getElementById("changeAmount").textContent = money(0) } }
function updateOrderTypeUI() {
    document.querySelectorAll(".order-type-option").forEach(button => {
        const active = button.dataset.orderType === selectedOrderType;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const deliveryField = document.getElementById("deliveryField");
    const reservationNotice = document.getElementById("reservationNotice");
    const customerInput = document.getElementById("customerName");
    const requiredMark = document.getElementById("customerRequiredMark");
    const completeButton = document.getElementById("completePayment");
    const deliveryCheckbox = document.getElementById("deliveryCheckbox");
    const isReservation = selectedOrderType === "reservation";
    if (deliveryField) deliveryField.style.display = isReservation ? "block" : "none";
    if (reservationNotice) reservationNotice.style.display = isReservation ? "block" : "none";
    if (requiredMark) requiredMark.style.display = isReservation ? "inline" : "none";
    if (customerInput) customerInput.required = isReservation;
    if (!isReservation && deliveryCheckbox) deliveryCheckbox.checked = false;
    if (completeButton) completeButton.textContent = isReservation ? "Complete Reservation" : "Complete Sale";
}
function openPayment() {
    bindDiscount();
    if (!cart.length) return;
    document.getElementById("paymentDiscount").value = discount();
    document.getElementById("cashReceived").value = "";
    document.getElementById("customerName").value = "";
    document.getElementById("paymentError").textContent = "";
    const deliveryCheckbox = document.getElementById("deliveryCheckbox");
    if (deliveryCheckbox) deliveryCheckbox.checked = false;
    selectedPaymentMethod = "Cash";
    selectedOrderType = "sale";
    resetSplit();
    document.querySelectorAll(".payment-method").forEach(button => button.classList.toggle("active", button.dataset.method === "Cash"));
    document.getElementById("cashField").style.display = "block";
    document.getElementById("splitPaymentFields").style.display = "none";
    updateOrderTypeUI();
    updatePayment();
    paymentModal.classList.add("show");
}
document.getElementById("checkoutButton").addEventListener("click", openPayment);
document.querySelectorAll(".order-type-option").forEach(button => {
    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        selectedOrderType = button.dataset.orderType === "reservation" ? "reservation" : "sale";
        document.getElementById("paymentError").textContent = "";
        updateOrderTypeUI();
        updatePayment();
    });
});
document.querySelectorAll(".payment-method").forEach(button => { button.addEventListener("click", () => { document.querySelectorAll(".payment-method").forEach(item => item.classList.remove("active")); button.classList.add("active"); selectedPaymentMethod = button.dataset.method; document.getElementById("cashField").style.display = selectedPaymentMethod === "Cash" ? "block" : "none"; document.getElementById("splitPaymentFields").style.display = selectedPaymentMethod === "Split" ? "block" : "none"; document.getElementById("paymentError").textContent = ""; updatePayment() }) });
document.getElementById("cashReceived").addEventListener("input", event => {
    event.target.value = event.target.value.replace(/[^\d.]/g, "");
    document.getElementById("paymentError").textContent = "";
    updatePayment();
});
[["splitCash", "Cash"], ["splitGCash", "GCash"], ["splitBDO", "BDO"], ["splitBIBO", "BIBO"], ["splitBPI", "BPI"]].forEach(([id, method]) => {
    document.getElementById(id).addEventListener("input", event => {
        event.target.value = event.target.value.replace(/[^\d.]/g, "");
        splitPayments[method] = Number(event.target.value) || 0;
        updateSplit();
    });
});
document.getElementById("clearCart").addEventListener("click", () => { if (cart.length && confirm("Clear all items from the cart?")) { cart = []; renderCart() } });
function inventoryRequirements() { const requirements = new Map(); cart.forEach(item => { if (item.type === "product") { requirements.set(item.itemId, (requirements.get(item.itemId) || 0) + item.quantity) } if (item.type === "package") { const pkg = getItemData(item); pkg.items.forEach(packageItem => { requirements.set(packageItem.productId, (requirements.get(packageItem.productId) || 0) + ((Number(packageItem.quantity) || 1) * item.quantity)) }) } }); return requirements }
function validateInventory() { for (const [id, quantity] of inventoryRequirements()) { const product = products.find(item => item.id === id); if (!product) return { valid: false, message: "A product required by this sale no longer exists." }; if (product.stock < quantity) return { valid: false, message: `${product.name} only has ${product.stock} in stock, but ${quantity} is required.` } } return { valid: true } }
async function completeSale() {
    if (!cart.length) return;
    const isReservation = selectedOrderType === "reservation";
    const amountDue = total();
    const subtotalAmount = subtotal();
    const discountAmount = discount();
    const cashInput = document.getElementById("cashReceived");
    const paymentError = document.getElementById("paymentError");
    const cash = Number(cashInput?.value) || 0;
    const customerInput = document.getElementById("customerName");
    const customer = customerInput?.value.trim() || "Walk-in Customer";
    const deliveryCheckbox = document.getElementById("deliveryCheckbox");
    const delivery = isReservation && Boolean(deliveryCheckbox?.checked);
    if (isReservation && !customerInput?.value.trim()) {
        paymentError.textContent = "Please enter the customer name for a reservation.";
        customerInput?.focus();
        return;
    }
    let amountPaid = amountDue;
    let change = 0;
    let paymentBreakdown = { Cash: 0, GCash: 0, BDO: 0, BIBO: 0, BPI: 0 };
    let tenderBreakdown = { Cash: 0, GCash: 0, BDO: 0, BIBO: 0, BPI: 0 };
    if (selectedPaymentMethod === "Cash") {
        if (cash < amountDue) {
            paymentError.textContent = `Insufficient payment. Amount due is ${money(amountDue)}.`;
            return;
        }
        amountPaid = cash;
        change = Math.max(0, cash - amountDue);
        paymentBreakdown.Cash = amountDue;
        tenderBreakdown.Cash = cash;
    } else if (selectedPaymentMethod === "Split") {
        amountPaid = splitTotal();
        if (amountPaid < amountDue) {
            paymentError.textContent = `Insufficient split payment. Remaining amount is ${money(amountDue - amountPaid)}.`;
            return;
        }
        if (amountPaid > amountDue) {
            paymentError.textContent = `Split payment exceeds the amount due by ${money(amountPaid - amountDue)}.`;
            return;
        }
        paymentBreakdown = { Cash: Number(splitPayments.Cash || 0), GCash: Number(splitPayments.GCash || 0), BDO: Number(splitPayments.BDO || 0), BIBO: Number(splitPayments.BIBO || 0), BPI: Number(splitPayments.BPI || 0) };
        tenderBreakdown = { ...paymentBreakdown };
    } else {
        amountPaid = amountDue;
        paymentBreakdown[selectedPaymentMethod] = amountDue;
        tenderBreakdown[selectedPaymentMethod] = amountDue;
    }
    const inventoryCheck = validateInventory();
    if (!inventoryCheck.valid) {
        paymentError.textContent = inventoryCheck.message;
        return;
    }
    const button = document.getElementById("completePayment");
    button.disabled = true;
    button.textContent = isReservation ? "Saving Reservation..." : "Processing...";
    try {
        const transactionNumber = document.getElementById("transactionNumber").textContent;
        const batch = writeBatch(db);
        const requirements = inventoryRequirements();
        const saleRef = doc(collection(db, "sales"));
        const cashFlowRef = doc(collection(db, "cashFlow"));
        if (!isReservation) {
            for (const [id, quantity] of requirements) {
                const product = products.find(item => item.id === id);
                batch.update(doc(db, "products", id), { stock: product.stock - quantity, updatedAt: serverTimestamp() });
            }
        }
        const saleItems = cart.map(item => {
            const data = getItemData(item);
            const sellingPrice = Number(data?.price ?? item.price) || 0; const costPrice = Number(data?.costPrice ?? item.costPrice) || 0; const quantity = Number(item.quantity) || 0; const profit = item.type === "product" ? (sellingPrice - costPrice) * quantity : 0; return { itemId: item.itemId, type: item.type, name: data?.name || item.name, sku: data?.sku || item.sku, price: sellingPrice, sellingPrice, costPrice, quantity, total: sellingPrice * quantity, profit, image: data?.image || item.image || "" };
        });
        const totalCost = saleItems.reduce((sum, item) => sum + (Number(item.costPrice) || 0) * (Number(item.quantity) || 0), 0); const grossProfit = saleItems.reduce((sum, item) => sum + (Number(item.profit) || 0), 0); batch.set(saleRef, {
            transactionNumber,
            customer,
            items: saleItems,
            subtotal: subtotalAmount,
            discount: discountAmount,
            total: amountDue,
            totalCost,
            grossProfit: isReservation ? 0 : grossProfit,
            potentialProfit: isReservation ? grossProfit : 0,
            paymentMethod: selectedPaymentMethod === "Split" ? "Split Payment" : selectedPaymentMethod,
            paymentBreakdown,
            tenderBreakdown,
            cashReceived: selectedPaymentMethod === "Cash" ? cash : selectedPaymentMethod === "Split" ? Number(splitPayments.Cash || 0) : null,
            totalPaid: amountPaid,
            change,
            cashierId: currentUser?.uid || null,
            cashierEmail: currentUser?.email || null,
            staffName: currentStaffName,
            cashier: currentStaffName,
            staffStatus: currentStaffStatus,
            orderType: isReservation ? "Reservation" : "Regular Sale",
            isReservation,
            delivery,
            deliveryStatus: delivery ? "Pending" : "Not Applicable",
            status: isReservation ? "Pending" : "Completed",
            stockDeducted: !isReservation,
            paymentStatus: "Paid",
            paymentCompleted: true,
            paymentRecordedAt: serverTimestamp(),
            paymentReceivedAt: serverTimestamp(),
            createdAt: serverTimestamp()
        });
        batch.set(cashFlowRef, {
            type: "cashIn",
            flowType: "SALE",
            category: "Sales",
            amount: amountDue,
            cashIn: amountDue,
            cashOut: 0,
            transactionNumber,
            transactionId: saleRef.id,
            referenceId: saleRef.id,
            customer,
            orderType: isReservation ? "Reservation" : "Regular Sale",
            isReservation,
            delivery,
            paymentMethod: selectedPaymentMethod === "Split" ? "Split Payment" : selectedPaymentMethod,
            paymentBreakdown,
            tenderBreakdown,
            amountPaid,
            tenderAmount: amountPaid,
            change,
            cashierId: currentUser?.uid || null,
            cashierEmail: currentUser?.email || null,
            staffName: currentStaffName,
            staffStatus: currentStaffStatus,
            status: isReservation ? "Pending" : "Completed",
            paymentStatus: "Paid",
            paymentCompleted: true,
            createdAt: serverTimestamp(),
            date: serverTimestamp()
        });
        if (!isReservation) {
            batch.set(doc(collection(db, "inventoryMovements")), {
                type: "sale",
                transactionNumber,
                transactionId: saleRef.id,
                items: saleItems,
                totalCost,
                grossProfit,
                stockDeductions: [...requirements.entries()].map(([productId, quantity]) => ({ productId, quantity })),
                totalQuantity: [...requirements.values()].reduce((sum, value) => sum + value, 0),
                createdBy: currentUser?.uid || null,
                staffName: currentStaffName,
                staffStatus: currentStaffStatus,
                createdAt: serverTimestamp()
            });
        }
        await batch.commit();
        requirements.forEach((quantity, id) => {
            if (!isReservation) {
                const product = products.find(item => item.id === id);
                if (product) product.stock -= quantity;
            }
        });
        generateReceipt(amountDue, discountAmount, cash, change, transactionNumber, customer, subtotalAmount, paymentBreakdown, amountPaid, isReservation, delivery);
        paymentModal.classList.remove("show");
        receiptModal.classList.add("show");
        const receiptTitle = document.getElementById("receiptSuccessTitle");
        const receiptMessage = document.getElementById("receiptSuccessMessage");
        if (receiptTitle) receiptTitle.textContent = isReservation ? "Reservation Recorded" : "Sale Completed";
        if (receiptMessage) receiptMessage.textContent = isReservation ? "Payment has been recorded. The order remains pending until the administrator marks it as done." : "Transaction has been recorded successfully.";
        cart = [];
        document.getElementById("paymentDiscount").value = "0";
        document.getElementById("customerName").value = "";
        if (deliveryCheckbox) deliveryCheckbox.checked = false;
        selectedOrderType = "sale";
        document.getElementById("transactionNumber").textContent = generateTransactionNumber();
        resetSplit();
        updateOrderTypeUI();
        renderCart();
        renderProducts();
    } catch (error) {
        console.error(error);
        paymentError.textContent = error.message || "Unable to complete transaction.";
    } finally {
        button.disabled = false;
        button.textContent = selectedOrderType === "reservation" ? "Complete Reservation" : "Complete Sale";
    }
}
document.getElementById("completePayment").addEventListener("click", completeSale);
function generateReceipt(amountDue, discountAmount, cash, change, transactionNumber, customer, subtotalAmount, paymentBreakdown, amountPaid, isReservation = false, delivery = false) {
    document.getElementById("receiptTransaction").textContent = transactionNumber;
    document.getElementById("receiptDate").textContent = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
    document.getElementById("receiptCustomer").textContent = customer;
    const receiptOrderType = document.getElementById("receiptOrderType");
    if (receiptOrderType) receiptOrderType.textContent = isReservation ? `Reservation${delivery ? " - Delivery" : ""}` : "Regular Sale";
    document.getElementById("receiptSubtotal").textContent = money(subtotalAmount);
    document.getElementById("receiptDiscount").textContent = `-${money(discountAmount)}`;
    document.getElementById("receiptTotal").textContent = money(amountDue);
    document.getElementById("receiptPayment").textContent = selectedPaymentMethod === "Split" ? "Split Payment" : selectedPaymentMethod;
    const cashRow = document.getElementById("receiptCashRow");
    const splitRow = document.getElementById("receiptSplitRow");
    if (selectedPaymentMethod === "Split") {
        cashRow.style.display = "none";
        splitRow.style.display = "flex";
        document.getElementById("receiptSplit").textContent = `Cash ${money(paymentBreakdown?.Cash || 0)} | GCash ${money(paymentBreakdown?.GCash || 0)} | BDO ${money(paymentBreakdown?.BDO || 0)} | BIBO ${money(paymentBreakdown?.BIBO || 0)} | BPI ${money(paymentBreakdown?.BPI || 0)}`;
    } else {
        cashRow.style.display = "flex";
        splitRow.style.display = "none";
        document.getElementById("receiptCash").textContent = selectedPaymentMethod === "Cash" ? money(cash) : money(amountPaid);
    }
    document.getElementById("receiptChange").textContent = money(change);
    const receiptItems = document.getElementById("receiptItems");
    receiptItems.innerHTML = "";
    cart.forEach(item => {
        const data = getItemData(item);
        if (!data) return;
        const element = document.createElement("div");
        element.className = "receipt-item";
        element.innerHTML = `<div><div class="receipt-item-name">${esc(data.name)}</div><div class="receipt-item-qty">${item.type.toUpperCase()} · ${item.quantity} × ${money(data.price)}</div></div><div class="receipt-item-total">${money(data.price * item.quantity)}</div>`;
        receiptItems.appendChild(element);
    });
}
document.getElementById("closePayment").addEventListener("click", () => { paymentModal.classList.remove("show") });
document.getElementById("closeReceipt").addEventListener("click", () => { receiptModal.classList.remove("show") });
document.getElementById("printReceipt").addEventListener("click", () => { const receipt = document.getElementById("receipt").innerHTML; const printWindow = window.open("", "_blank", "width=450,height=700"); if (!printWindow) { alert("Please allow pop-ups to print the receipt."); return } printWindow.document.write(`<!DOCTYPE html><html><head><title>StockMaster Receipt</title><style>body{font-family:Arial,sans-serif;width:300px;margin:20px auto;font-size:12px}*{box-sizing:border-box}.receipt{width:100%}.receipt-brand{text-align:center;margin-bottom:15px}.receipt-brand h2{margin:0}.receipt-brand p{margin:4px 0}.receipt-line{border-top:1px dashed #777;margin:10px 0}.receipt-info>div,.receipt-total>div{display:flex;justify-content:space-between;margin-bottom:6px}.receipt-item{display:flex;justify-content:space-between;margin-bottom:7px}.receipt-item-qty{color:#666;font-size:10px}.receipt-grand-total{border-top:1px solid #000;padding-top:7px}.receipt-thankyou{text-align:center;margin-top:15px}</style></head><body><div class="receipt">${receipt}</div><script>window.onload=function(){window.print()}<\/script></body></html>`); printWindow.document.close() });
onAuthStateChanged(auth, async user => { if (!user) return; currentUser = user; await loadProfile(user); try { await loadData() } catch (error) { console.error(error); emptyProducts.classList.add("show"); emptyProducts.querySelector("h3").textContent = "Unable to load POS items"; emptyProducts.querySelector("p").textContent = error.message || "Check your Firebase connection." } bindDiscount(); renderCart() });