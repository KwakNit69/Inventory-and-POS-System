import { auth, db } from "../../Firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
const inventoryBody = document.getElementById("inventoryBody");
const productSearch = document.getElementById("productSearch");
const categoryFilter = document.getElementById("categoryFilter");
const stockFilter = document.getElementById("stockFilter");
const resetFilters = document.getElementById("resetFilters");
const refreshInventory = document.getElementById("refreshInventory");
const totalProducts = document.getElementById("totalProducts");
const inStockProducts = document.getElementById("inStockProducts");
const lowStockProducts = document.getElementById("lowStockProducts");
const outOfStockProducts = document.getElementById("outOfStockProducts");
const resultCount = document.getElementById("resultCount");
const previousPage = document.getElementById("previousPage");
const nextPage = document.getElementById("nextPage");
const pageNumber = document.getElementById("pageNumber");
const inventoryError = document.getElementById("inventoryError");
const inventoryErrorMessage = document.getElementById("inventoryErrorMessage");
const retryButton = document.getElementById("retryButton");
const staffName = document.getElementById("staffName");
const staffAvatar = document.getElementById("staffAvatar");
const productModal = document.getElementById("productModal");
const closeModal = document.getElementById("closeModal");
const modalProductId = document.getElementById("modalProductId");
const modalProductName = document.getElementById("modalProductName");
const modalSku = document.getElementById("modalSku");
const modalCategory = document.getElementById("modalCategory");
const modalPrice = document.getElementById("modalPrice");
const modalStock = document.getElementById("modalStock");
const modalThreshold = document.getElementById("modalThreshold");
const modalStatus = document.getElementById("modalStatus");
const modalStatusBox = document.getElementById("modalStatusBox");
let currentUser = null;
let products = [];
let categories = [];
let filteredProducts = [];
let currentPage = 1;
const pageSize = 10;
const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
const initials = name => {
    const parts = String(name || "Staff").trim().split(/\s+/);
    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return String(name || "ST").substring(0, 2).toUpperCase();
};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const getName = product => String(product.name ?? product.productName ?? product.title ?? "Unnamed Product");
const getSku = product => String(product.sku ?? product.SKU ?? product.productCode ?? "—");
const getPrice = product => Number(product.sellingPrice ?? product.price ?? product.salePrice ?? product.unitPrice ?? 0);
const getStock = product => Number(product.stock ?? product.currentStock ?? product.quantity ?? 0);
const getCategory = product => String(product.categoryName ?? product.category ?? product.categoryId ?? "Uncategorized");
const getCategoryId = product => String(product.categoryId ?? "");
const getThreshold = product => Number(product.lowStockAlert ?? product.lowStockThreshold ?? product.reorderLevel ?? 10);
const getStatus = product => {
    const stock = getStock(product);
    const threshold = getThreshold(product);
    if (stock <= 0) return "out";
    if (stock <= threshold) return "low";
    return "in";
};
const showError = error => {
    console.error("Inventory error:", error);
    inventoryError.classList.add("show");
    inventoryErrorMessage.textContent = error?.message || "Unable to load inventory from Firebase.";
};
const hideError = () => inventoryError.classList.remove("show");
const loadStaffInfo = user => {
    const name = sessionStorage.getItem("userName") || user.displayName || user.email?.split("@")[0] || "Staff";
    staffName.textContent = name;
    staffAvatar.textContent = initials(name);
};
const loadCategories = async () => {
    const snapshot = await getDocs(collection(db, "categories"));
    categories = [];
    snapshot.forEach(document => {
        categories.push({ id: document.id, ...document.data() });
    });
    categories.sort((a, b) => {
        const nameA = a.name ?? a.categoryName ?? a.title ?? a.id;
        const nameB = b.name ?? b.categoryName ?? b.title ?? b.id;
        return String(nameA).localeCompare(String(nameB));
    });
    categoryFilter.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name ?? category.categoryName ?? category.title ?? category.id;
        categoryFilter.appendChild(option);
    });
};
const loadProducts = async () => {
    inventoryBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading inventory...</td></tr>';
    const snapshot = await getDocs(collection(db, "products"));
    products = [];
    snapshot.forEach(document => {
        products.push({ id: document.id, ...document.data() });
    });
    products.sort((a, b) => getName(a).localeCompare(getName(b)));
    updateSummary();
    applyFilters();
};
const updateSummary = () => {
    let inStock = 0;
    let low = 0;
    let out = 0;
    products.forEach(product => {
        const status = getStatus(product);
        if (status === "in") inStock++;
        if (status === "low") low++;
        if (status === "out") out++;
    });
    totalProducts.textContent = products.length;
    inStockProducts.textContent = inStock;
    lowStockProducts.textContent = low;
    outOfStockProducts.textContent = out;
};
const applyFilters = () => {
    const search = productSearch.value.trim().toLowerCase();
    const category = categoryFilter.value;
    const stock = stockFilter.value;
    filteredProducts = products.filter(product => {
        const name = getName(product).toLowerCase();
        const sku = getSku(product).toLowerCase();
        const matchesSearch = !search || name.includes(search) || sku.includes(search);
        const matchesCategory = category === "all" || getCategoryId(product) === category || String(product.category ?? "") === category;
        const matchesStock = stock === "all" || getStatus(product) === stock;
        return matchesSearch && matchesCategory && matchesStock;
    });
    currentPage = 1;
    renderTable();
};
const renderTable = () => {
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * pageSize;
    const rows = filteredProducts.slice(start, start + pageSize);
    pageNumber.textContent = currentPage;
    previousPage.disabled = currentPage <= 1;
    nextPage.disabled = currentPage >= totalPages;
    resultCount.textContent = `Showing ${filteredProducts.length ? start + 1 : 0}-${Math.min(start + pageSize, filteredProducts.length)} of ${filteredProducts.length} product${filteredProducts.length === 1 ? "" : "s"}`;
    if (!rows.length) {
        inventoryBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No products found.</td></tr>';
        return;
    }
    inventoryBody.innerHTML = rows.map(product => {
        const status = getStatus(product);
        const stock = getStock(product);
        const statusText = status === "in" ? "In Stock" : status === "low" ? "Low Stock" : "Out of Stock";
        const stockClass = status === "in" ? "stock-good" : status === "low" ? "stock-low" : "stock-out";
        const statusClass = status === "in" ? "status-in" : status === "low" ? "status-low" : "status-out";
        return `<tr>
<td><strong>${escapeHtml(getName(product))}</strong></td>
<td>${escapeHtml(getSku(product))}</td>
<td>${escapeHtml(getCategory(product))}</td>
<td>${money(getPrice(product))}</td>
<td><span class="stock-number ${stockClass}">${stock}</span></td>
<td><span class="status-badge ${statusClass}">${statusText}</span></td>
<td><button class="view-button" data-id="${escapeHtml(product.id)}">View</button></td>
</tr>`;
    }).join("");
    document.querySelectorAll(".view-button").forEach(button => {
        button.addEventListener("click", () => openProduct(button.dataset.id));
    });
};
const openProduct = id => {
    const product = products.find(item => item.id === id);
    if (!product) return;
    const status = getStatus(product);
    const statusText = status === "in" ? "In Stock" : status === "low" ? "Low Stock" : "Out of Stock";
    modalProductId.textContent = `Product ID: ${product.id}`;
    modalProductName.textContent = getName(product);
    modalSku.textContent = getSku(product);
    modalCategory.textContent = getCategory(product);
    modalPrice.textContent = money(getPrice(product));
    modalStock.textContent = getStock(product);
    modalThreshold.textContent = getThreshold(product);
    modalStatus.textContent = statusText;
    modalStatusBox.style.background = status === "in" ? "#eaf7ef" : status === "low" ? "#fff4df" : "#fdecec";
    modalStatusBox.style.color = status === "in" ? "#16803c" : status === "low" ? "#d98200" : "#d74343";
    productModal.classList.add("show");
};
const refresh = async () => {
    if (!currentUser) return;
    try {
        hideError();
        await loadCategories();
        await loadProducts();
    } catch (error) {
        showError(error);
    }
};
productSearch.addEventListener("input", applyFilters);
categoryFilter.addEventListener("change", applyFilters);
stockFilter.addEventListener("change", applyFilters);
resetFilters.addEventListener("click", () => {
    productSearch.value = "";
    categoryFilter.value = "all";
    stockFilter.value = "all";
    applyFilters();
});
refreshInventory.addEventListener("click", refresh);
retryButton.addEventListener("click", refresh);
previousPage.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});
nextPage.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});
closeModal.addEventListener("click", () => productModal.classList.remove("show"));
productModal.addEventListener("click", event => {
    if (event.target === productModal) productModal.classList.remove("show");
});
onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "../login.html?role=staff";
        return;
    }
    currentUser = user;
    loadStaffInfo(user);
    await refresh();
});