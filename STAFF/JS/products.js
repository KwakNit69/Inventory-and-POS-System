import { auth, db } from "../../Firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
const productsBody = document.getElementById("productsBody");
const productSearch = document.getElementById("productSearch");
const categoryFilter = document.getElementById("categoryFilter");
const stockFilter = document.getElementById("stockFilter");
const resetFilters = document.getElementById("resetFilters");
const refreshProducts = document.getElementById("refreshProducts");
const totalProducts = document.getElementById("totalProducts");
const availableProducts = document.getElementById("availableProducts");
const lowStockProducts = document.getElementById("lowStockProducts");
const outOfStockProducts = document.getElementById("outOfStockProducts");
const resultCount = document.getElementById("resultCount");
const previousPage = document.getElementById("previousPage");
const nextPage = document.getElementById("nextPage");
const pageNumber = document.getElementById("pageNumber");
const productsError = document.getElementById("productsError");
const productsErrorMessage = document.getElementById("productsErrorMessage");
const retryButton = document.getElementById("retryButton");
const staffName = document.getElementById("staffName");
const staffAvatar = document.getElementById("staffAvatar");
const productModal = document.getElementById("productModal");
const closeModal = document.getElementById("closeModal");
const modalProductId = document.getElementById("modalProductId");
const modalProductName = document.getElementById("modalProductName");
const modalProductSku = document.getElementById("modalProductSku");
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
const getName = product => String(product.name ?? "Unnamed Product");
const getSku = product => String(product.sku ?? "—");
const getPrice = product => Number(product.price ?? 0);
const getStock = product => Number(product.stock ?? 0);
const getCategory = product => String(product.category ?? "Uncategorized");
const getCategoryId = product => String(product.categoryId ?? "");
const getThreshold = product => Number(product.lowStock ?? 10);
const getStatus = product => {
    const stock = getStock(product);
    const threshold = getThreshold(product);
    if (stock <= 0) return "out";
    if (stock <= threshold) return "low";
    return "available";
};
const showError = error => {
    console.error("Products error:", error);
    if (productsError) productsError.classList.add("show");
    if (productsErrorMessage) productsErrorMessage.textContent = error?.message || "Unable to load products from Firebase.";
};
const hideError = () => {
    if (productsError) productsError.classList.remove("show");
};
const loadStaffInfo = user => {
    const name = sessionStorage.getItem("userName") || user.displayName || user.email?.split("@")[0] || "Staff";
    if (staffName) staffName.textContent = name;
    if (staffAvatar) staffAvatar.textContent = initials(name);
};
const loadCategories = async () => {
    const snapshot = await getDocs(collection(db, "categories"));
    categories = [];
    snapshot.forEach(document => {
        categories.push({ id: document.id, ...document.data() });
    });
    categories = categories.filter(category => String(category.status ?? "active").toLowerCase() !== "inactive");
    categories.sort((a, b) => {
        const nameA = a.name ?? a.categoryName ?? a.title ?? a.id;
        const nameB = b.name ?? b.categoryName ?? b.title ?? b.id;
        return String(nameA).localeCompare(String(nameB));
    });
    if (!categoryFilter) return;
    categoryFilter.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(category => {
        const option = document.createElement("option");
        option.value = String(category.name ?? category.categoryName ?? category.title ?? category.id);
        option.textContent = String(category.name ?? category.categoryName ?? category.title ?? category.id);
        categoryFilter.appendChild(option);
    });
};
const loadProducts = async () => {
    if (productsBody) productsBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading products...</td></tr>';
    const snapshot = await getDocs(collection(db, "products"));
    products = [];
    snapshot.forEach(document => {
        const data = document.data();
        products.push({
            id: document.id,
            name: data.name ?? "",
            sku: data.sku ?? "",
            category: data.category ?? "",
            price: Number(data.price) || 0,
            stock: Number(data.stock) || 0,
            lowStock: Number(data.lowStock) || 10,
            description: data.description ?? "",
            imageUrl: data.imageUrl ?? data.image ?? "",
            imagePublicId: data.imagePublicId ?? "",
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null
        });
    });
    products.sort((a, b) => getName(a).localeCompare(getName(b)));
    updateSummary();
    applyFilters();
};
const updateSummary = () => {
    let available = 0;
    let low = 0;
    let out = 0;
    products.forEach(product => {
        const status = getStatus(product);
        if (status === "available") available++;
        if (status === "low") low++;
        if (status === "out") out++;
    });
    if (totalProducts) totalProducts.textContent = products.length;
    if (availableProducts) availableProducts.textContent = available;
    if (lowStockProducts) lowStockProducts.textContent = low;
    if (outOfStockProducts) outOfStockProducts.textContent = out;
};
const applyFilters = () => {
    if (!productSearch || !categoryFilter || !stockFilter) return;
    const search = productSearch.value.trim().toLowerCase();
    const category = categoryFilter.value;
    const stock = stockFilter.value;
    filteredProducts = products.filter(product => {
        const name = getName(product).toLowerCase();
        const sku = getSku(product).toLowerCase();
        const productCategory = getCategory(product);
        const matchesSearch = !search || name.includes(search) || sku.toLowerCase().includes(search);
        const matchesCategory = category === "all" || productCategory === category || getCategoryId(product) === category;
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
    if (pageNumber) pageNumber.textContent = currentPage;
    if (previousPage) previousPage.disabled = currentPage <= 1;
    if (nextPage) nextPage.disabled = currentPage >= totalPages;
    if (resultCount) resultCount.textContent = `Showing ${filteredProducts.length ? start + 1 : 0}-${Math.min(start + pageSize, filteredProducts.length)} of ${filteredProducts.length} product${filteredProducts.length === 1 ? "" : "s"}`;
    if (!productsBody) return;
    if (!rows.length) {
        productsBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No products found.</td></tr>';
        return;
    }
    productsBody.innerHTML = rows.map(product => {
        const status = getStatus(product);
        const stock = getStock(product);
        const statusText = status === "available" ? "Available" : status === "low" ? "Low Stock" : "Out of Stock";
        const stockClass = status === "available" ? "stock-good" : status === "low" ? "stock-low" : "stock-out";
        const statusClass = status === "available" ? "status-available" : status === "low" ? "status-low" : "status-out";
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
    const statusText = status === "available" ? "Available" : status === "low" ? "Low Stock" : "Out of Stock";
    if (modalProductId) modalProductId.textContent = `Product ID: ${product.id}`;
    if (modalProductName) modalProductName.textContent = getName(product);
    if (modalProductSku) modalProductSku.textContent = getSku(product);
    if (modalCategory) modalCategory.textContent = getCategory(product);
    if (modalPrice) modalPrice.textContent = money(getPrice(product));
    if (modalStock) modalStock.textContent = getStock(product);
    if (modalThreshold) modalThreshold.textContent = getThreshold(product);
    if (modalStatus) modalStatus.textContent = statusText;
    if (modalStatusBox) {
        modalStatusBox.style.background = status === "available" ? "#eaf7ef" : status === "low" ? "#fff4df" : "#fdecec";
        modalStatusBox.style.color = status === "available" ? "#16803c" : status === "low" ? "#d98200" : "#d74343";
    }
    if (productModal) productModal.classList.add("show");
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
productSearch?.addEventListener("input", applyFilters);
categoryFilter?.addEventListener("change", applyFilters);
stockFilter?.addEventListener("change", applyFilters);
resetFilters?.addEventListener("click", () => {
    if (productSearch) productSearch.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    if (stockFilter) stockFilter.value = "all";
    applyFilters();
});
refreshProducts?.addEventListener("click", refresh);
retryButton?.addEventListener("click", refresh);
previousPage?.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});
nextPage?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});
closeModal?.addEventListener("click", () => {
    if (productModal) productModal.classList.remove("show");
});
productModal?.addEventListener("click", event => {
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