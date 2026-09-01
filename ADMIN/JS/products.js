import { db, auth } from "../../Firebase/firebase-config.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
const tableBody = document.getElementById("productTableBody");
const productModal = document.getElementById("productModal");
const packageModal = document.getElementById("packageModal");
const insuranceModal = document.getElementById("insuranceModal");
const deleteModal = document.getElementById("deleteModal");
const packageDeleteModal = document.getElementById("packageDeleteModal");
const productForm = document.getElementById("productForm");
const packageForm = document.getElementById("packageForm");
const insuranceForm = document.getElementById("insuranceForm");
const productSearch = document.getElementById("productSearch");
const categoryFilter = document.getElementById("categoryFilter");
const stockFilter = document.getElementById("stockFilter");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const packageTableBody = document.getElementById("packageTableBody");
const insuranceTableBody = document.getElementById("insuranceTableBody");
let products = [];
let categories = [];
let packages = [];
let insurances = [];
let filteredProducts = [];
let filteredPackages = [];
let filteredInsurance = [];
let currentPage = 1;
let editingProductId = null;
let deletingProductId = null;
let editingPackageId = null;
let deletingPackageId = null;
let editingInsuranceId = null;
let deletingInsuranceId = null;
const productsPerPage = 6;
const CLOUDINARY_CLOUD_NAME = "d93qog0l";
const CLOUDINARY_UPLOAD_PRESET = "stockmaster_products";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
function loadSidebar() {
  const container = document.getElementById("sidebar-container");
  if (!container) return;
  fetch("sidebar.html")
    .then(response => {
      if (!response.ok) throw new Error(`Sidebar HTTP error: ${response.status}`);
      return response.text();
    })
    .then(html => {
      container.innerHTML = html;
      const script = document.createElement("script");
      script.src = "sidebar.js?v=10";
      document.body.appendChild(script);
    })
    .catch(error => console.error("Sidebar error:", error));
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}
function showLoading() {
  if (loadingState) loadingState.style.display = "flex";
  if (errorState) errorState.classList.remove("show");
  if (emptyState) emptyState.classList.remove("show");
}
function hideLoading() {
  if (loadingState) loadingState.style.display = "none";
}
function showError(message) {
  hideLoading();
  if (errorState) {
    errorState.classList.add("show");
    const text = document.getElementById("errorMessage");
    if (text) text.textContent = message;
  }
}
async function loadCategories() {
  try {
    const snapshot = await getDocs(collection(db, "categories"));
    categories = snapshot.docs
      .map(item => {
        const data = item.data();
        return {
          id: item.id,
          name: data.name || "",
          status: data.status || "active"
        };
      })
      .filter(item => item.name && item.status !== "inactive")
      .sort((a, b) => a.name.localeCompare(b.name));
    populateCategories();
    populateProductCategories();
  } catch (error) {
    console.error(error);
    categories = [];
    populateCategories();
    populateProductCategories();
  }
}
function populateCategories() {
  const current = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="all">All Categories</option>';
  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category.name;
    option.textContent = category.name;
    categoryFilter.appendChild(option);
  });
  categoryFilter.value = [...categoryFilter.options].some(option => option.value === current) ? current : "all";
}
function populateProductCategories() {
  const select = document.getElementById("productCategory");
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Select category</option>';
  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category.name;
    option.textContent = category.name;
    select.appendChild(option);
  });
  if ([...select.options].some(option => option.value === current)) {
    select.value = current;
  }
}
async function loadProducts() {
  showLoading();
  try {
    const snapshot = await getDocs(collection(db, "products"));
    products = snapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id,
        name: data.name || "",
        sku: data.sku || "",
        category: data.category || "",
        price: Number(data.price) || 0,
        costPrice: data.costPrice === undefined || data.costPrice === null || data.costPrice === "" ? null : Number(data.costPrice),
        stock: Number(data.stock) || 0,
        lowStock: Number(data.lowStock) || 10,
        description: data.description || "",
        image: data.imageUrl || data.image || "",
        imagePublicId: data.imagePublicId || "",
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
      };
    });
    products.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    hideLoading();
    filterProducts();
  } catch (error) {
    console.error("Products error:", error);
    showError(error.message || "Unable to load products.");
  }
}
async function loadPackages() {
  try {
    const snapshot = await getDocs(collection(db, "packages"));
    packages = snapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id,
        name: data.name || "",
        sku: data.sku || "",
        price: Number(data.price) || 0,
        description: data.description || "",
        image: data.imageUrl || data.image || "",
        imagePublicId: data.imagePublicId || "",
        items: Array.isArray(data.items) ? data.items : [],
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
      };
    });
    packages.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    filterPackages();
  } catch (error) {
    console.error("Packages error:", error);
    packages = [];
    filterPackages();
  }
}
async function loadInsurance() {
  try {
    const snapshot = await getDocs(collection(db, "insurances"));
    insurances = snapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id,
        name: data.name || "",
        sku: data.sku || "",
        price: Number(data.price) || 0,
        status: data.status || "active",
        description: data.description || "",
        image: data.imageUrl || data.image || "",
        imagePublicId: data.imagePublicId || "",
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
      };
    });
    insurances.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    filterInsurance();
  } catch (error) {
    console.error("Insurance error:", error);
    insurances = [];
    filterInsurance();
  }
}
function updateSummary() {
  const total = products.length;
  const inStock = products.filter(item => item.stock > item.lowStock).length;
  const lowStock = products.filter(item => item.stock > 0 && item.stock <= item.lowStock).length;
  const outOfStock = products.filter(item => item.stock <= 0).length;
  const totalProducts = document.getElementById("totalProducts");
  const inStockProducts = document.getElementById("inStockProducts");
  const lowStockProducts = document.getElementById("lowStockProducts");
  const outOfStockProducts = document.getElementById("outOfStockProducts");
  if (totalProducts) totalProducts.textContent = total;
  if (inStockProducts) inStockProducts.textContent = inStock;
  if (lowStockProducts) lowStockProducts.textContent = lowStock;
  if (outOfStockProducts) outOfStockProducts.textContent = outOfStock;
}
function getStockStatus(product) {
  if (product.stock <= 0) {
    return { text: "Out of Stock", className: "out-of-stock" };
  }
  if (product.stock <= product.lowStock) {
    return { text: "Low Stock", className: "low-stock" };
  }
  return { text: "In Stock", className: "in-stock" };
}
function filterProducts() {
  const search = productSearch.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const stock = stockFilter.value;
  filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(search) || product.sku.toLowerCase().includes(search);
    const matchesCategory = category === "all" || product.category === category;
    let matchesStock = true;
    if (stock === "in-stock") matchesStock = product.stock > product.lowStock;
    if (stock === "low-stock") matchesStock = product.stock > 0 && product.stock <= product.lowStock;
    if (stock === "out-of-stock") matchesStock = product.stock <= 0;
    return matchesSearch && matchesCategory && matchesStock;
  });
  currentPage = 1;
  updateSummary();
  renderProducts();
}
function renderProducts() {
  tableBody.innerHTML = "";
  if (filteredProducts.length === 0) {
    emptyState.classList.add("show");
    updatePagination();
    return;
  }
  emptyState.classList.remove("show");
  const start = (currentPage - 1) * productsPerPage;
  filteredProducts.slice(start, start + productsPerPage).forEach(product => {
    const status = getStockStatus(product);
    const image = product.image ? `<img src="${escapeHTML(product.image)}" class="product-img-preview" alt="${escapeHTML(product.name)}">` : "▣";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="product-cell">
          <div class="product-image">${image}</div>
          <div>
            <div class="product-name">${escapeHTML(product.name)}</div>
            <div class="product-description">${escapeHTML(product.description)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHTML(product.sku)}</td>
      <td>${escapeHTML(product.category)}</td>
      <td>${product.costPrice === null || !Number.isFinite(product.costPrice) ? "—" : `₱${product.costPrice.toFixed(2)}`}</td>
      <td>₱${product.price.toFixed(2)}</td>
      <td class="${product.stock <= 0 ? "stock-out" : product.stock <= product.lowStock ? "stock-low" : ""}">${product.stock}</td>
      <td><span class="status ${status.className}">${status.text}</span></td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit-btn" data-action="edit" data-id="${product.id}" type="button">Edit</button>
          <button class="action-btn delete-btn-small" data-action="delete" data-id="${product.id}" type="button">Delete</button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
  updatePagination();
}
function updatePagination() {
  const total = filteredProducts.length;
  const pages = Math.max(1, Math.ceil(total / productsPerPage));
  if (currentPage > pages) currentPage = pages;
  const start = total === 0 ? 0 : (currentPage - 1) * productsPerPage + 1;
  const end = Math.min(currentPage * productsPerPage, total);
  const paginationInfo = document.getElementById("paginationInfo");
  const currentPageElement = document.getElementById("currentPage");
  const previousPage = document.getElementById("previousPage");
  const nextPage = document.getElementById("nextPage");
  if (paginationInfo) paginationInfo.textContent = `Showing ${start}-${end} of ${total} products`;
  if (currentPageElement) currentPageElement.textContent = currentPage;
  if (previousPage) previousPage.disabled = currentPage <= 1;
  if (nextPage) nextPage.disabled = currentPage >= pages;
}
function getPackageAvailability(pkg) {
  if (!pkg.items.length) return 0;
  const values = pkg.items.map(item => {
    const product = products.find(product => product.id === item.productId);
    if (!product) return 0;
    return Math.floor(product.stock / Math.max(1, Number(item.quantity) || 1));
  });
  return Math.max(0, Math.min(...values));
}
function filterPackages() {
  const searchElement = document.getElementById("packageSearch");
  if (!searchElement) return;
  const search = searchElement.value.trim().toLowerCase();
  filteredPackages = packages.filter(pkg => pkg.name.toLowerCase().includes(search) || pkg.sku.toLowerCase().includes(search));
  renderPackages();
}
function renderPackages() {
  if (!packageTableBody) return;
  packageTableBody.innerHTML = "";
  if (filteredPackages.length === 0) {
    packageTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">No packages found.</td>
      </tr>
    `;
    return;
  }
  filteredPackages.forEach(pkg => {
    const availability = getPackageAvailability(pkg);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="product-cell">
          <div class="product-image">
            ${pkg.image ? `<img src="${escapeHTML(pkg.image)}" class="product-img-preview" alt="${escapeHTML(pkg.name)}">` : "▣"}
          </div>
          <div>
            <div class="product-name">${escapeHTML(pkg.name)}</div>
            <div class="product-description">${escapeHTML(pkg.description)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHTML(pkg.sku)}</td>
      <td>₱${pkg.price.toFixed(2)}</td>
      <td>${pkg.items.length}</td>
      <td>${availability}</td>
      <td><span class="status ${availability > 0 ? "in-stock" : "out-of-stock"}">${availability > 0 ? "Available" : "Unavailable"}</span></td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit-btn" data-package-action="edit" data-id="${pkg.id}" type="button">Edit</button>
          <button class="action-btn delete-btn-small" data-package-action="delete" data-id="${pkg.id}" type="button">Delete</button>
        </div>
      </td>
    `;
    packageTableBody.appendChild(row);
  });
}
function filterInsurance() {
  const searchElement = document.getElementById("insuranceSearch");
  if (!searchElement) return;
  const search = searchElement.value.trim().toLowerCase();
  filteredInsurance = insurances.filter(insurance => insurance.name.toLowerCase().includes(search) || insurance.sku.toLowerCase().includes(search));
  renderInsurance();
}
function renderInsurance() {
  if (!insuranceTableBody) return;
  insuranceTableBody.innerHTML = "";
  if (filteredInsurance.length === 0) {
    insuranceTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell">No insurance products found.</td>
      </tr>
    `;
    return;
  }
  filteredInsurance.forEach(insurance => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="product-cell">
          <div class="product-image">
            ${insurance.image ? `<img src="${escapeHTML(insurance.image)}" class="product-img-preview" alt="${escapeHTML(insurance.name)}">` : "▣"}
          </div>
          <div>
            <div class="product-name">${escapeHTML(insurance.name)}</div>
            <div class="product-description">${escapeHTML(insurance.description)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHTML(insurance.sku)}</td>
      <td>₱${insurance.price.toFixed(2)}</td>
      <td>
        <span class="status ${insurance.status === "active" ? "in-stock" : "out-of-stock"}">
          ${insurance.status === "active" ? "Active" : "Inactive"}
        </span>
      </td>
      <td>${insurance.createdAt?.seconds ? new Date(insurance.createdAt.seconds * 1000).toLocaleDateString() : "—"}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit-btn" data-insurance-action="edit" data-id="${insurance.id}" type="button">Edit</button>
          <button class="action-btn delete-btn-small" data-insurance-action="delete" data-id="${insurance.id}" type="button">Delete</button>
        </div>
      </td>
    `;
    insuranceTableBody.appendChild(row);
  });
}
function resetProductForm() {
  productForm.reset();
  const id = document.getElementById("productId");
  const image = document.getElementById("productImage");
  const currentImage = document.getElementById("currentProductImage");
  const currentWrapper = document.getElementById("currentImageWrapper");
  const uploadStatus = document.getElementById("imageUploadStatus");
  if (id) id.value = "";
  if (image) image.value = "";
  if (currentImage) currentImage.src = "";
  if (currentWrapper) currentWrapper.style.display = "none";
  if (uploadStatus) uploadStatus.textContent = "";
  editingProductId = null;
}
async function openAddProduct() {
  resetProductForm();
  const title = document.getElementById("productModalTitle");
  const subtitle = document.getElementById("productModalSubtitle");
  if (title) title.textContent = "Add Product";
  if (subtitle) subtitle.textContent = "Create a new product.";
  productModal.classList.add("show");
  await showNextSku("productSku", "products", "PROD-");
}
function openEditProduct(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;
  editingProductId = id;
  const productId = document.getElementById("productId");
  const productName = document.getElementById("productName");
  const productSku = document.getElementById("productSku");
  const productCategory = document.getElementById("productCategory");
  const productCostPrice = document.getElementById("productCostPrice");
  const productPrice = document.getElementById("productPrice");
  const productStock = document.getElementById("productStock");
  const productLowStock = document.getElementById("productLowStock");
  const productDescription = document.getElementById("productDescription");
  const currentImage = document.getElementById("currentProductImage");
  const currentWrapper = document.getElementById("currentImageWrapper");
  if (productId) productId.value = product.id;
  if (productName) productName.value = product.name;
  if (productSku) productSku.value = product.sku;
  if (productCategory) productCategory.value = product.category;
  if (productCostPrice) productCostPrice.value = product.costPrice === null || !Number.isFinite(product.costPrice) ? "" : product.costPrice;
  if (productPrice) productPrice.value = product.price;
  if (productStock) productStock.value = product.stock;
  if (productLowStock) productLowStock.value = product.lowStock;
  if (productDescription) productDescription.value = product.description;
  if (currentImage && currentWrapper && product.image) {
    currentImage.src = product.image;
    currentWrapper.style.display = "block";
  }
  const title = document.getElementById("productModalTitle");
  const subtitle = document.getElementById("productModalSubtitle");
  if (title) title.textContent = "Edit Product";
  if (subtitle) subtitle.textContent = "Update product information.";
  productModal.classList.add("show");
}
function closeProductModal() {
  productModal.classList.remove("show");
  resetProductForm();
}
async function generateNextSku(collectionName, prefix) {
  const snapshot = await getDocs(collection(db, collectionName));
  let highest = 0;
  snapshot.docs.forEach(item => {
    const sku = String(item.data().sku || "").trim().toUpperCase();
    const match = sku.match(new RegExp("^" + prefix.replace("-", "\\-") + "(\\d+)$"));
    if (match) {
      const number = parseInt(match[1], 10);
      if (Number.isFinite(number) && number > highest) highest = number;
    }
  });
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}
async function showNextSku(inputId, collectionName, prefix) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = "Generating...";
  input.disabled = true;
  try {
    input.value = await generateNextSku(collectionName, prefix);
  } catch (error) {
    console.error("SKU generation error:", error);
    input.value = "";
  } finally {
    input.disabled = false;
  }
}
async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  const response = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: formData });
  if (!response.ok) throw new Error("Image upload failed.");
  return response.json();
}
async function saveProduct(event) {
  event.preventDefault();
  const submitButton = productForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const name = document.getElementById("productName").value.trim();
    const existingProduct = editingProductId ? products.find(item => item.id === editingProductId) : null;
    const sku = existingProduct?.sku || await generateNextSku("products", "PROD-");
    const skuInput = document.getElementById("productSku");
    if (skuInput) skuInput.value = sku;
    const category = document.getElementById("productCategory").value;
    const costPrice = Number(document.getElementById("productCostPrice").value);
    const price = Number(document.getElementById("productPrice").value);
    const stock = Number(document.getElementById("productStock").value);
    const lowStock = Number(document.getElementById("productLowStock").value);
    const description = document.getElementById("productDescription").value.trim();
    const imageInput = document.getElementById("productImage");
    if (!name) {
      alert("Please enter a product name.");
      return;
    }
    if (!category) {
      alert("Please select a category.");
      return;
    }
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      alert("Please enter a valid cost price.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      alert("Please enter a valid selling price.");
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      alert("Please enter a valid stock quantity.");
      return;
    }
    if (!Number.isFinite(lowStock) || lowStock < 0) {
      alert("Please enter a valid low-stock threshold.");
      return;
    }
    let imageUrl = existingProduct?.image || "";
    let imagePublicId = existingProduct?.imagePublicId || "";
    if (imageInput?.files?.[0]) {
      const uploaded = await uploadImage(imageInput.files[0]);
      imageUrl = uploaded.secure_url || "";
      imagePublicId = uploaded.public_id || "";
    }
    const data = {
      name,
      sku,
      category,
      costPrice,
      price,
      stock,
      lowStock,
      description,
      imageUrl,
      imagePublicId,
      updatedAt: serverTimestamp()
    };
    if (editingProductId) {
      await updateDoc(doc(db, "products", editingProductId), data);
    } else {
      await addDoc(collection(db, "products"), { ...data, createdAt: serverTimestamp() });
    }
    closeProductModal();
    await loadProducts();
  } catch (error) {
    console.error("Save product error:", error);
    alert(error.message || "Unable to save product.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}
function openDeleteProduct(id) {
  deletingProductId = id;
  const product = products.find(item => item.id === id);
  const message = document.getElementById("deleteProductName");
  if (message) message.textContent = product?.name || "this product";
  deleteModal.classList.add("show");
}
async function deleteProduct() {
  if (!deletingProductId) return;
  const button = document.getElementById("confirmDelete");
  if (button) button.disabled = true;
  try {
    await deleteDoc(doc(db, "products", deletingProductId));
    deleteModal.classList.remove("show");
    deletingProductId = null;
    await loadProducts();
  } catch (error) {
    console.error("Delete product error:", error);
    alert(error.message || "Unable to delete product.");
  } finally {
    if (button) button.disabled = false;
  }
}
function resetPackageForm() {
  packageForm.reset();
  const id = document.getElementById("packageId");
  const itemsContainer = document.getElementById("packageItems");
  if (id) id.value = "";
  if (itemsContainer) itemsContainer.innerHTML = "";
  editingPackageId = null;
}
async function openAddPackage() {
  resetPackageForm();
  const title = document.getElementById("packageModalTitle");
  const subtitle = document.getElementById("packageModalSubtitle");
  if (title) title.textContent = "Add Package";
  if (subtitle) subtitle.textContent = "Create a new package.";
  createPackageItemRow();
  packageModal.classList.add("show");
  await showNextSku("packageSku", "packages", "PKG-");
}
function openEditPackage(id) {
  const pkg = packages.find(item => item.id === id);
  if (!pkg) return;
  editingPackageId = id;
  const packageId = document.getElementById("packageId");
  const packageName = document.getElementById("packageName");
  const packageSku = document.getElementById("packageSku");
  const packagePrice = document.getElementById("packagePrice");
  const packageDescription = document.getElementById("packageDescription");
  const itemsContainer = document.getElementById("packageItems");
  if (packageId) packageId.value = pkg.id;
  if (packageName) packageName.value = pkg.name;
  if (packageSku) packageSku.value = pkg.sku;
  if (packagePrice) packagePrice.value = pkg.price;
  if (packageDescription) packageDescription.value = pkg.description;
  if (itemsContainer) {
    itemsContainer.innerHTML = "";
    if (pkg.items.length) {
      pkg.items.forEach(item => createPackageItemRow(item));
    } else {
      createPackageItemRow();
    }
  }
  const title = document.getElementById("packageModalTitle");
  const subtitle = document.getElementById("packageModalSubtitle");
  if (title) title.textContent = "Edit Package";
  if (subtitle) subtitle.textContent = "Update package information.";
  packageModal.classList.add("show");
}
function closePackageModal() {
  packageModal.classList.remove("show");
  resetPackageForm();
}
function createPackageItemRow(item = {}) {
  const container = document.getElementById("packageItems");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "package-item-row";
  const productOptions = products.map(product => `
      <option value="${escapeHTML(product.id)}" ${product.id === item.productId ? "selected" : ""}>
        ${escapeHTML(product.name)}
      </option>
    `).join("");
  row.innerHTML = `
    <select class="package-product">
      <option value="">Select product</option>
      ${productOptions}
    </select>
    <input type="number" class="package-quantity" min="1" step="1" value="${Number(item.quantity) || 1}">
    <button type="button" class="remove-package-item">Remove</button>
  `;
  const removeButton = row.querySelector(".remove-package-item");
  if (removeButton) removeButton.addEventListener("click", () => row.remove());
  container.appendChild(row);
}
async function savePackage(event) {
  event.preventDefault();
  const submitButton = packageForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const name = document.getElementById("packageName").value.trim();
    const existingPackage = editingPackageId ? packages.find(item => item.id === editingPackageId) : null;
    const sku = existingPackage?.sku || await generateNextSku("packages", "PKG-");
    const skuInput = document.getElementById("packageSku");
    if (skuInput) skuInput.value = sku;
    const price = Number(document.getElementById("packagePrice").value);
    const description = document.getElementById("packageDescription").value.trim();
    const items = [...document.querySelectorAll(".package-item-row")]
      .map(row => ({
        productId: row.querySelector(".package-product")?.value || "",
        quantity: Number(row.querySelector(".package-quantity")?.value) || 1
      }))
      .filter(item => item.productId);
    if (!name) {
      alert("Please enter a package name.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      alert("Please enter a valid package selling price.");
      return;
    }
    if (!items.length) {
      alert("Please add at least one product to the package.");
      return;
    }
    const imageInput = document.getElementById("packageImage");
    let imageUrl = existingPackage?.image || "";
    let imagePublicId = existingPackage?.imagePublicId || "";
    if (imageInput?.files?.[0]) {
      const uploaded = await uploadImage(imageInput.files[0]);
      imageUrl = uploaded.secure_url || "";
      imagePublicId = uploaded.public_id || "";
    }
    const data = {
      name,
      sku,
      price,
      description,
      imageUrl,
      imagePublicId,
      items,
      updatedAt: serverTimestamp()
    };
    if (editingPackageId) {
      await updateDoc(doc(db, "packages", editingPackageId), data);
    } else {
      await addDoc(collection(db, "packages"), { ...data, createdAt: serverTimestamp() });
    }
    closePackageModal();
    await loadPackages();
  } catch (error) {
    console.error("Save package error:", error);
    alert(error.message || "Unable to save package.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}
function openDeletePackage(id) {
  deletingPackageId = id;
  const pkg = packages.find(item => item.id === id);
  const message = document.getElementById("deletePackageName");
  if (message) message.textContent = pkg?.name || "this package";
  packageDeleteModal.classList.add("show");
}
async function deletePackage() {
  if (!deletingPackageId) return;
  const button = document.getElementById("confirmPackageDelete");
  if (button) button.disabled = true;
  try {
    await deleteDoc(doc(db, "packages", deletingPackageId));
    packageDeleteModal.classList.remove("show");
    deletingPackageId = null;
    await loadPackages();
  } catch (error) {
    console.error("Delete package error:", error);
    alert(error.message || "Unable to delete package.");
  } finally {
    if (button) button.disabled = false;
  }
}
function resetInsuranceForm() {
  insuranceForm.reset();
  const id = document.getElementById("insuranceId");
  if (id) id.value = "";
  editingInsuranceId = null;
}
async function openAddInsurance() {
  resetInsuranceForm();
  const title = document.getElementById("insuranceModalTitle");
  const subtitle = document.getElementById("insuranceModalSubtitle");
  if (title) title.textContent = "Add Insurance";
  if (subtitle) subtitle.textContent = "Create a new insurance product.";
  insuranceModal.classList.add("show");
  await showNextSku("insuranceSku", "insurances", "INS-");
}
function openEditInsurance(id) {
  const insurance = insurances.find(item => item.id === id);
  if (!insurance) return;
  editingInsuranceId = id;
  const insuranceId = document.getElementById("insuranceId");
  const insuranceName = document.getElementById("insuranceName");
  const insuranceSku = document.getElementById("insuranceSku");
  const insurancePrice = document.getElementById("insurancePrice");
  const insuranceStatus = document.getElementById("insuranceStatus");
  const insuranceDescription = document.getElementById("insuranceDescription");
  if (insuranceId) insuranceId.value = insurance.id;
  if (insuranceName) insuranceName.value = insurance.name;
  if (insuranceSku) insuranceSku.value = insurance.sku;
  if (insurancePrice) insurancePrice.value = insurance.price;
  if (insuranceStatus) insuranceStatus.value = insurance.status;
  if (insuranceDescription) insuranceDescription.value = insurance.description;
  const title = document.getElementById("insuranceModalTitle");
  const subtitle = document.getElementById("insuranceModalSubtitle");
  if (title) title.textContent = "Edit Insurance";
  if (subtitle) subtitle.textContent = "Update insurance information.";
  insuranceModal.classList.add("show");
}
function closeInsuranceModal() {
  insuranceModal.classList.remove("show");
  resetInsuranceForm();
}
async function saveInsurance(event) {
  event.preventDefault();
  const submitButton = insuranceForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const name = document.getElementById("insuranceName").value.trim();
    const existingInsurance = editingInsuranceId ? insurances.find(item => item.id === editingInsuranceId) : null;
    const sku = existingInsurance?.sku || await generateNextSku("insurances", "INS-");
    const skuInput = document.getElementById("insuranceSku");
    if (skuInput) skuInput.value = sku;
    const price = Number(document.getElementById("insurancePrice").value);
    const status = document.getElementById("insuranceStatus").value;
    const description = document.getElementById("insuranceDescription").value.trim();
    if (!name) {
      alert("Please enter an insurance name.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      alert("Please enter a valid insurance selling price.");
      return;
    }
    const imageInput = document.getElementById("insuranceImage");
    let imageUrl = existingInsurance?.image || "";
    let imagePublicId = existingInsurance?.imagePublicId || "";
    if (imageInput?.files?.[0]) {
      const uploaded = await uploadImage(imageInput.files[0]);
      imageUrl = uploaded.secure_url || "";
      imagePublicId = uploaded.public_id || "";
    }
    const data = {
      name,
      sku,
      price,
      status,
      description,
      imageUrl,
      imagePublicId,
      updatedAt: serverTimestamp()
    };
    if (editingInsuranceId) {
      await updateDoc(doc(db, "insurances", editingInsuranceId), data);
    } else {
      await addDoc(collection(db, "insurances"), { ...data, createdAt: serverTimestamp() });
    }
    closeInsuranceModal();
    await loadInsurance();
  } catch (error) {
    console.error("Save insurance error:", error);
    alert(error.message || "Unable to save insurance.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}
async function deleteInsurance(id) {
  try {
    await deleteDoc(doc(db, "insurances", id));
    await loadInsurance();
  } catch (error) {
    console.error("Delete insurance error:", error);
    alert(error.message || "Unable to delete insurance.");
  }
}
function previewImage(file, wrapperId, imageId, statusId) {
  const wrapper = document.getElementById(wrapperId);
  const image = document.getElementById(imageId);
  const status = document.getElementById(statusId);
  if (!file || !image) return;
  const reader = new FileReader();
  reader.onload = event => {
    image.src = event.target.result;
    if (wrapper) wrapper.style.display = "block";
    if (status) status.textContent = file.name;
  };
  reader.readAsDataURL(file);
}
function switchView(view) {
  const productsView = document.getElementById("productsView");
  const packagesView = document.getElementById("packagesView");
  const insuranceView = document.getElementById("insuranceView");
  const productsTab = document.getElementById("productsTab");
  const packagesTab = document.getElementById("packagesTab");
  const insuranceTab = document.getElementById("insuranceTab");
  if (!productsView || !packagesView || !insuranceView) return;
  productsView.classList.add("hidden-view");
  packagesView.classList.add("hidden-view");
  insuranceView.classList.add("hidden-view");
  productsTab?.classList.remove("active");
  packagesTab?.classList.remove("active");
  insuranceTab?.classList.remove("active");
  if (view === "packages") {
    packagesView.classList.remove("hidden-view");
    packagesTab?.classList.add("active");
  } else if (view === "insurance") {
    insuranceView.classList.remove("hidden-view");
    insuranceTab?.classList.add("active");
  } else {
    productsView.classList.remove("hidden-view");
    productsTab?.classList.add("active");
  }
}
function updateProfile(userData, user) {
  const name = userData?.name || user.displayName || user.email?.split("@")[0] || "User";
  const role = userData?.role || "User";
  const profileName = document.getElementById("profileName");
  const profileRole = document.getElementById("profileRole");
  const profileAvatar = document.getElementById("profileAvatar");
  if (profileName) profileName.textContent = name;
  if (profileRole) profileRole.textContent = role;
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(item => item[0]).join("").toUpperCase();
  if (profileAvatar) profileAvatar.textContent = initials || "U";
}
async function loadProfile(user) {
  try {
    const snapshot = await getDocs(query(collection(db, "users"), where("__name__", "==", user.uid)));
    if (!snapshot.empty) {
      updateProfile(snapshot.docs[0].data(), user);
    } else {
      updateProfile({}, user);
    }
  } catch (error) {
    updateProfile({}, user);
  }
}
document.getElementById("openAddProduct")?.addEventListener("click", openAddProduct);
document.getElementById("openAddPackage")?.addEventListener("click", openAddPackage);
document.getElementById("openAddInsurance")?.addEventListener("click", openAddInsurance);
document.getElementById("closeProductModal")?.addEventListener("click", closeProductModal);
document.getElementById("cancelProduct")?.addEventListener("click", closeProductModal);
document.getElementById("closePackageModal")?.addEventListener("click", closePackageModal);
document.getElementById("cancelPackage")?.addEventListener("click", closePackageModal);
document.getElementById("closeInsuranceModal")?.addEventListener("click", closeInsuranceModal);
document.getElementById("cancelInsurance")?.addEventListener("click", closeInsuranceModal);
productForm?.addEventListener("submit", saveProduct);
packageForm?.addEventListener("submit", savePackage);
insuranceForm?.addEventListener("submit", saveInsurance);
document.getElementById("addPackageItem")?.addEventListener("click", () => createPackageItemRow());
document.getElementById("cancelDelete")?.addEventListener("click", () => deleteModal.classList.remove("show"));
document.getElementById("confirmDelete")?.addEventListener("click", deleteProduct);
document.getElementById("cancelPackageDelete")?.addEventListener("click", () => packageDeleteModal.classList.remove("show"));
document.getElementById("confirmPackageDelete")?.addEventListener("click", deletePackage);
document.getElementById("productsTab")?.addEventListener("click", () => switchView("products"));
document.getElementById("packagesTab")?.addEventListener("click", () => switchView("packages"));
document.getElementById("insuranceTab")?.addEventListener("click", () => switchView("insurance"));
productSearch?.addEventListener("input", filterProducts);
categoryFilter?.addEventListener("change", filterProducts);
stockFilter?.addEventListener("change", filterProducts);
document.getElementById("packageSearch")?.addEventListener("input", filterPackages);
document.getElementById("insuranceSearch")?.addEventListener("input", filterInsurance);
document.getElementById("resetFilters")?.addEventListener("click", () => {
  if (productSearch) productSearch.value = "";
  if (categoryFilter) categoryFilter.value = "all";
  if (stockFilter) stockFilter.value = "all";
  filterProducts();
});
document.getElementById("resetPackageFilters")?.addEventListener("click", () => {
  const input = document.getElementById("packageSearch");
  if (input) input.value = "";
  filterPackages();
});
document.getElementById("resetInsuranceFilters")?.addEventListener("click", () => {
  const input = document.getElementById("insuranceSearch");
  if (input) input.value = "";
  filterInsurance();
});
document.getElementById("previousPage")?.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderProducts();
  }
});
document.getElementById("nextPage")?.addEventListener("click", () => {
  const pages = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  if (currentPage < pages) {
    currentPage++;
    renderProducts();
  }
});
document.getElementById("productImage")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (file) previewImage(file, "currentImageWrapper", "currentProductImage", "imageUploadStatus");
});
document.getElementById("packageImage")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (file) previewImage(file, "currentPackageImageWrapper", "currentPackageImage", "packageImageStatus");
});
document.getElementById("insuranceImage")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (file) previewImage(file, "currentInsuranceImageWrapper", "currentInsuranceImage", "insuranceImageStatus");
});
tableBody?.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "edit") openEditProduct(button.dataset.id);
  if (button.dataset.action === "delete") openDeleteProduct(button.dataset.id);
});
packageTableBody?.addEventListener("click", event => {
  const button = event.target.closest("button[data-package-action]");
  if (!button) return;
  if (button.dataset.packageAction === "edit") openEditPackage(button.dataset.id);
  if (button.dataset.packageAction === "delete") openDeletePackage(button.dataset.id);
});
insuranceTableBody?.addEventListener("click", event => {
  const button = event.target.closest("button[data-insurance-action]");
  if (!button) return;
  if (button.dataset.insuranceAction === "edit") openEditInsurance(button.dataset.id);
  if (button.dataset.insuranceAction === "delete") {
    if (confirm("Delete this insurance?")) deleteInsurance(button.dataset.id);
  }
});
document.getElementById("retryProducts")?.addEventListener("click", loadProducts);
document.getElementById("globalSearch")?.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  const value = event.currentTarget.value.trim();
  const activeTab = document.querySelector(".view-tab.active")?.id;
  if (activeTab === "packagesTab") {
    const input = document.getElementById("packageSearch");
    if (input) input.value = value;
    filterPackages();
  } else if (activeTab === "insuranceTab") {
    const input = document.getElementById("insuranceSearch");
    if (input) input.value = value;
    filterInsurance();
  } else {
    if (productSearch) productSearch.value = value;
    filterProducts();
  }
});
productModal?.addEventListener("click", event => {
  if (event.target === productModal) closeProductModal();
});
packageModal?.addEventListener("click", event => {
  if (event.target === packageModal) closePackageModal();
});
insuranceModal?.addEventListener("click", event => {
  if (event.target === insuranceModal) closeInsuranceModal();
});
deleteModal?.addEventListener("click", event => {
  if (event.target === deleteModal) deleteModal.classList.remove("show");
});
packageDeleteModal?.addEventListener("click", event => {
  if (event.target === packageDeleteModal) packageDeleteModal.classList.remove("show");
});
loadSidebar();
onAuthStateChanged(auth, async user => {
  if (!user) {
    showError("You are not logged in. Please log in again.");
    return;
  }
  await loadProfile(user);
  await loadCategories();
  await loadProducts();
  await loadPackages();
  await loadInsurance();
});
