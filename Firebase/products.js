// =========================================================
// STOCKMASTER - PRODUCTS MODULE
// Firebase Firestore + Cloudinary
// =========================================================

// =========================================================
// FIREBASE
// =========================================================

import { db } from "../../firebase-config.js";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// =========================================================
// CLOUDINARY CONFIGURATION
// =========================================================
//
// IMPORTANT:
// Replace these two values with your actual Cloudinary values.
//
// DO NOT put your Cloudinary API Secret here.
//

const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_UPLOAD_PRESET";

const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;


// =========================================================
// GLOBAL VARIABLES
// =========================================================

let products = [];
let filteredProducts = [];

let currentPage = 1;

const productsPerPage = 6;

let editingProductId = null;
let deletingProductId = null;

let editingProduct = null;


// =========================================================
// DOM ELEMENTS
// =========================================================

const tableBody =
  document.getElementById("productTableBody");

const emptyState =
  document.getElementById("emptyState");

const productModal =
  document.getElementById("productModal");

const deleteModal =
  document.getElementById("deleteModal");

const productForm =
  document.getElementById("productForm");


// =========================================================
// LOAD SIDEBAR
// =========================================================

fetch("sidebar.html")
  .then(response => {

    if (!response.ok) {
      throw new Error("Could not load sidebar.html");
    }

    return response.text();
  })

  .then(html => {

    const sidebar =
      document.getElementById("sidebar-container");

    if (sidebar) {
      sidebar.innerHTML = html;
    }

    const script =
      document.createElement("script");

    script.src = "sidebar.js";

    document.body.appendChild(script);
  })

  .catch(error => {

    console.error(
      "Sidebar Error:",
      error
    );

  });


// =========================================================
// FORMAT MONEY
// =========================================================

function formatMoney(value) {

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP"
  }).format(Number(value) || 0);

}


// =========================================================
// STOCK STATUS
// =========================================================

function getStockStatus(product) {

  const stock =
    Number(product.stock) || 0;

  const lowStock =
    Number(product.lowStock) || 0;

  if (stock <= 0) {

    return {
      text: "Out of Stock",
      className: "out-of-stock"
    };

  }

  if (stock <= lowStock) {

    return {
      text: "Low Stock",
      className: "low-stock"
    };

  }

  return {
    text: "In Stock",
    className: "in-stock"
  };

}


// =========================================================
// ESCAPE HTML
// =========================================================

function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


// =========================================================
// LOAD PRODUCTS FROM FIRESTORE
// =========================================================

async function loadProducts() {

  try {

    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="loading-cell">
          Loading products...
        </td>
      </tr>
    `;

    const snapshot =
      await getDocs(
        collection(db, "products")
      );

    products =
      snapshot.docs.map(documentSnapshot => {

        const data =
          documentSnapshot.data();

        return {
          id: documentSnapshot.id,

          name: data.name || "",

          sku: data.sku || "",

          category: data.category || "",

          cost: Number(data.cost) || 0,

          price: Number(data.price) || 0,

          stock: Number(data.stock) || 0,

          lowStock: Number(data.lowStock) || 10,

          description: data.description || "",

          image: data.imageUrl || null,

          imagePublicId:
            data.imagePublicId || null,

          createdAt:
            data.createdAt || null,

          updatedAt:
            data.updatedAt || null

        };

      });

    // Sort newest first
    products.sort((a, b) => {

      const aTime =
        a.createdAt?.seconds || 0;

      const bTime =
        b.createdAt?.seconds || 0;

      return bTime - aTime;

    });

    updateSummary();

    filterProducts();

  }

  catch (error) {

    console.error(
      "Error loading products:",
      error
    );

    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="error-cell">
          Failed to load products.
          Please check your Firebase configuration.
        </td>
      </tr>
    `;

    alert(
      "Unable to load products from Firebase."
    );

  }

}


// =========================================================
// RENDER PRODUCTS
// =========================================================

function renderProducts() {

  tableBody.innerHTML = "";

  if (filteredProducts.length === 0) {

    emptyState.classList.add("show");

    updatePagination();

    return;

  }

  emptyState.classList.remove("show");

  const start =
    (currentPage - 1) *
    productsPerPage;

  const end =
    start + productsPerPage;

  const pageProducts =
    filteredProducts.slice(
      start,
      end
    );

  pageProducts.forEach(product => {

    const status =
      getStockStatus(product);

    let stockClass = "";

    if (product.stock <= 0) {

      stockClass = "stock-out";

    }

    else if (
      product.stock <= product.lowStock
    ) {

      stockClass = "stock-low";

    }


    // =====================================================
    // PRODUCT IMAGE
    // =====================================================

    const imageDisplay =
      product.image

        ? `
          <img
            src="${escapeHTML(product.image)}"
            class="product-img-preview"
            alt="${escapeHTML(product.name)}"
            loading="lazy"
            onerror="this.style.display='none'; this.parentElement.innerHTML='▣';"
          >
        `

        : `▣`;


    // =====================================================
    // CREATE TABLE ROW
    // =====================================================

    const row =
      document.createElement("tr");

    row.innerHTML = `

      <td>

        <div class="product-cell">

          <div class="product-image">

            ${imageDisplay}

          </div>

          <div>

            <div class="product-name">

              ${escapeHTML(product.name)}

            </div>

            <div class="product-description">

              ${escapeHTML(
                product.description || ""
              )}

            </div>

          </div>

        </div>

      </td>


      <td>

        <span class="sku">

          ${escapeHTML(product.sku)}

        </span>

      </td>


      <td>

        ${escapeHTML(product.category)}

      </td>


      <td>

        <span class="price">

          ${formatMoney(product.price)}

        </span>

      </td>


      <td>

        <span class="price">

          ${formatMoney(product.cost)}

        </span>

      </td>


      <td>

        <span class="stock-number ${stockClass}">

          ${product.stock}

        </span>

      </td>


      <td>

        <span class="status ${status.className}">

          ${status.text}

        </span>

      </td>


      <td>

        <div class="action-buttons">

          <button
            class="action-btn edit-btn"
            data-action="edit"
            data-id="${product.id}"
            title="Edit Product"
            type="button"
          >
            ✎
          </button>

          <button
            class="action-btn delete-btn-small"
            data-action="delete"
            data-id="${product.id}"
            title="Delete Product"
            type="button"
          >
            ×
          </button>

        </div>

      </td>

    `;

    tableBody.appendChild(row);

  });

  updatePagination();

}


// =========================================================
// UPDATE SUMMARY
// =========================================================

function updateSummary() {

  const total =
    products.length;

  const inStock =
    products.filter(product =>
      Number(product.stock) >
      Number(product.lowStock)
    ).length;

  const lowStock =
    products.filter(product =>
      Number(product.stock) > 0 &&
      Number(product.stock) <=
      Number(product.lowStock)
    ).length;

  const outOfStock =
    products.filter(product =>
      Number(product.stock) <= 0
    ).length;


  document.getElementById(
    "totalProducts"
  ).textContent = total;


  document.getElementById(
    "inStockProducts"
  ).textContent = inStock;


  document.getElementById(
    "lowStockProducts"
  ).textContent = lowStock;


  document.getElementById(
    "outOfStockProducts"
  ).textContent = outOfStock;

}


// =========================================================
// FILTER PRODUCTS
// =========================================================

function filterProducts() {

  const search =
    document
      .getElementById("productSearch")
      .value
      .trim()
      .toLowerCase();


  const category =
    document
      .getElementById("categoryFilter")
      .value;


  const stock =
    document
      .getElementById("stockFilter")
      .value;


  filteredProducts =
    products.filter(product => {

      const productName =
        String(product.name || "")
          .toLowerCase();

      const productSKU =
        String(product.sku || "")
          .toLowerCase();


      const matchesSearch =
        productName.includes(search) ||
        productSKU.includes(search);


      const matchesCategory =
        category === "all" ||
        product.category === category;


      let matchesStock = true;


      if (stock === "in-stock") {

        matchesStock =
          product.stock >
          product.lowStock;

      }


      if (stock === "low-stock") {

        matchesStock =
          product.stock > 0 &&
          product.stock <=
          product.lowStock;

      }


      if (stock === "out-of-stock") {

        matchesStock =
          product.stock <= 0;

      }


      return (
        matchesSearch &&
        matchesCategory &&
        matchesStock
      );

    });


  currentPage = 1;

  renderProducts();

}


// =========================================================
// PAGINATION
// =========================================================

function updatePagination() {

  const total =
    filteredProducts.length;


  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total / productsPerPage
      )
    );


  if (currentPage > totalPages) {

    currentPage =
      totalPages;

  }


  const start =
    total === 0
      ? 0
      : ((currentPage - 1) *
          productsPerPage) + 1;


  const end =
    Math.min(
      currentPage *
        productsPerPage,
      total
    );


  document.getElementById(
    "paginationInfo"
  ).textContent =
    total === 0
      ? "Showing 0 of 0 products"
      : `Showing ${start}-${end} of ${total} products`;


  document.getElementById(
    "currentPage"
  ).textContent =
    currentPage;


  document.getElementById(
    "previousPage"
  ).disabled =
    currentPage <= 1;


  document.getElementById(
    "nextPage"
  ).disabled =
    currentPage >= totalPages;

}


// =========================================================
// OPEN ADD PRODUCT
// =========================================================

document
  .getElementById("openAddProduct")
  .addEventListener(
    "click",
    openAddProduct
  );


function openAddProduct() {

  editingProductId = null;

  editingProduct = null;


  document.getElementById(
    "modalTitle"
  ).textContent =
    "Add Product";


  document.getElementById(
    "productForm"
  ).reset();


  document.getElementById(
    "productLowStock"
  ).value = 10;


  productModal.classList.add(
    "show"
  );

}


// =========================================================
// OPEN EDIT PRODUCT
// =========================================================

function openEditProduct(id) {

  const product =
    products.find(
      item => item.id === id
    );


  if (!product) {

    alert("Product not found.");

    return;

  }


  editingProductId =
    id;

  editingProduct =
    product;


  document.getElementById(
    "modalTitle"
  ).textContent =
    "Edit Product";


  document.getElementById(
    "productId"
  ).value =
    product.id;


  document.getElementById(
    "productName"
  ).value =
    product.name;


  document.getElementById(
    "productSku"
  ).value =
    product.sku;


  document.getElementById(
    "productCategory"
  ).value =
    product.category;


  document.getElementById(
    "productCost"
  ).value =
    product.cost;


  document.getElementById(
    "productPrice"
  ).value =
    product.price;


  document.getElementById(
    "productStock"
  ).value =
    product.stock;


  document.getElementById(
    "productLowStock"
  ).value =
    product.lowStock;


  document.getElementById(
    "productDescription"
  ).value =
    product.description;


  // File inputs cannot be populated programmatically.
  document.getElementById(
    "productImage"
  ).value = "";


  productModal.classList.add(
    "show"
  );

}


// =========================================================
// CHECK DUPLICATE SKU
// =========================================================

async function isDuplicateSKU(
  sku,
  currentId = null
) {

  const normalizedSKU =
    sku.trim().toLowerCase();


  try {

    const snapshot =
      await getDocs(
        collection(db, "products")
      );


    return snapshot.docs.some(
      documentSnapshot => {

        const data =
          documentSnapshot.data();


        const existingSKU =
          String(
            data.sku || ""
          )
          .trim()
          .toLowerCase();


        return (
          existingSKU ===
            normalizedSKU &&
          documentSnapshot.id !==
            currentId
        );

      }
    );

  }

  catch (error) {

    console.error(
      "SKU check error:",
      error
    );

    throw error;

  }

}


// =========================================================
// UPLOAD IMAGE TO CLOUDINARY
// =========================================================

async function uploadImageToCloudinary(
  file
) {

  if (!file) {

    return {
      secureUrl: null,
      publicId: null
    };

  }


  // =====================================================
  // VALIDATE FILE TYPE
  // =====================================================

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];


  if (
    !allowedTypes.includes(
      file.type
    )
  ) {

    throw new Error(
      "Only JPG, PNG, and WebP images are allowed."
    );

  }


  // =====================================================
  // VALIDATE FILE SIZE
  // =====================================================

  const maxSize =
    5 * 1024 * 1024;


  if (file.size > maxSize) {

    throw new Error(
      "Image size must not exceed 5 MB."
    );

  }


  // =====================================================
  // CREATE FORM DATA
  // =====================================================

  const formData =
    new FormData();


  formData.append(
    "file",
    file
  );


  formData.append(
    "upload_preset",
    CLOUDINARY_UPLOAD_PRESET
  );


  // Optional folder
  formData.append(
    "folder",
    "stockmaster/products"
  );


  // =====================================================
  // UPLOAD
  // =====================================================

  const response =
    await fetch(
      CLOUDINARY_UPLOAD_URL,
      {
        method: "POST",
        body: formData
      }
    );


  if (!response.ok) {

    const errorText =
      await response.text();

    console.error(
      "Cloudinary Error:",
      errorText
    );

    throw new Error(
      "Cloudinary image upload failed."
    );

  }


  const result =
    await response.json();


  if (!result.secure_url) {

    throw new Error(
      "Cloudinary did not return an image URL."
    );

  }


  return {
    secureUrl:
      result.secure_url,

    publicId:
      result.public_id || null
  };

}


// =========================================================
// SAVE PRODUCT
// =========================================================

productForm.addEventListener(
  "submit",
  async function(event) {

    event.preventDefault();


    const saveButton =
      productForm.querySelector(
        ".save-btn"
      );


    try {

      // =================================================
      // GET VALUES
      // =================================================

      const name =
        document
          .getElementById(
            "productName"
          )
          .value
          .trim();


      const sku =
        document
          .getElementById(
            "productSku"
          )
          .value
          .trim()
          .toUpperCase();


      const category =
        document
          .getElementById(
            "productCategory"
          )
          .value;


      const cost =
        Number(
          document
            .getElementById(
              "productCost"
            )
            .value
        );


      const price =
        Number(
          document
            .getElementById(
              "productPrice"
            )
            .value
        );


      const stock =
        Number(
          document
            .getElementById(
              "productStock"
            )
            .value
        );


      const lowStock =
        Number(
          document
            .getElementById(
              "productLowStock"
            )
            .value
        );


      const description =
        document
          .getElementById(
            "productDescription"
          )
          .value
          .trim();


      const imageInput =
        document.getElementById(
          "productImage"
        );


      const imageFile =
        imageInput.files &&
        imageInput.files[0]
          ? imageInput.files[0]
          : null;


      // =================================================
      // VALIDATION
      // =================================================

      if (!name) {

        alert(
          "Please enter a product name."
        );

        return;

      }


      if (!sku) {

        alert(
          "Please enter an SKU."
        );

        return;

      }


      if (!category) {

        alert(
          "Please select a category."
        );

        return;

      }


      if (
        !Number.isFinite(cost) ||
        cost < 0
      ) {

        alert(
          "Please enter a valid cost price."
        );

        return;

      }


      if (
        !Number.isFinite(price) ||
        price < 0
      ) {

        alert(
          "Please enter a valid selling price."
        );

        return;

      }


      if (
        !Number.isInteger(stock) ||
        stock < 0
      ) {

        alert(
          "Stock must be a whole number of 0 or greater."
        );

        return;

      }


      if (
        !Number.isInteger(lowStock) ||
        lowStock < 0
      ) {

        alert(
          "Low stock alert must be 0 or greater."
        );

        return;

      }


      // =================================================
      // CHECK CLOUDINARY CONFIG
      // =================================================

      if (
        imageFile &&
        (
          CLOUDINARY_CLOUD_NAME ===
            "YOUR_CLOUD_NAME" ||
          CLOUDINARY_UPLOAD_PRESET ===
            "YOUR_UNSIGNED_UPLOAD_PRESET"
        )
      ) {

        alert(
          "Please configure your Cloudinary Cloud Name and Upload Preset first."
        );

        return;

      }


      // =================================================
      // CHECK DUPLICATE SKU
      // =================================================

      saveButton.disabled = true;

      saveButton.textContent =
        "Checking...";


      const duplicate =
        await isDuplicateSKU(
          sku,
          editingProductId
        );


      if (duplicate) {

        alert(
          "A product with this SKU already exists."
        );

        return;

      }


      // =================================================
      // UPLOAD IMAGE IF SELECTED
      // =================================================

      let imageUrl =
        editingProduct?.image ||
        null;


      let imagePublicId =
        editingProduct?.imagePublicId ||
        null;


      if (imageFile) {

        saveButton.textContent =
          "Uploading image...";


        const uploadResult =
          await uploadImageToCloudinary(
            imageFile
          );


        imageUrl =
          uploadResult.secureUrl;


        imagePublicId =
          uploadResult.publicId;

      }


      // =================================================
      // PRODUCT DATA
      // =================================================

      const productData = {

        name,

        sku,

        category,

        cost,

        price,

        stock,

        lowStock,

        description,

        imageUrl,

        imagePublicId,

        updatedAt:
          serverTimestamp()

      };


      // =================================================
      // EDIT PRODUCT
      // =================================================

      if (
        editingProductId !== null
      ) {

        saveButton.textContent =
          "Updating...";


        await updateDoc(
          doc(
            db,
            "products",
            editingProductId
          ),
          productData
        );


        closeProductModal();


        alert(
          "Product updated successfully."
        );

      }


      // =================================================
      // ADD PRODUCT
      // =================================================

      else {

        saveButton.textContent =
          "Saving...";


        productData.createdAt =
          serverTimestamp();


        await addDoc(
          collection(
            db,
            "products"
          ),
          productData
        );


        closeProductModal();


        alert(
          "Product added successfully."
        );

      }


      // =================================================
      // RELOAD DATA
      // =================================================

      await loadProducts();

    }

    catch (error) {

      console.error(
        "Save product error:",
        error
      );


      alert(
        error.message ||
        "Something went wrong while saving the product."
      );

    }

    finally {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Save Product";

    }

  }
);


// =========================================================
// OPEN DELETE PRODUCT
// =========================================================

function openDeleteProduct(id) {

  const product =
    products.find(
      item => item.id === id
    );


  if (!product) {

    return;

  }


  deletingProductId =
    id;


  document.getElementById(
    "deleteProductName"
  ).textContent =
    product.name;


  deleteModal.classList.add(
    "show"
  );

}


// =========================================================
// CONFIRM DELETE
// =========================================================

document
  .getElementById(
    "confirmDelete"
  )
  .addEventListener(
    "click",
    async function() {

      if (
        deletingProductId ===
        null
      ) {

        return;

      }


      const deleteButton =
        document.getElementById(
          "confirmDelete"
        );


      try {

        deleteButton.disabled =
          true;

        deleteButton.textContent =
          "Deleting...";


        await deleteDoc(
          doc(
            db,
            "products",
            deletingProductId
          )
        );


        deletingProductId =
          null;


        deleteModal.classList.remove(
          "show"
        );


        alert(
          "Product deleted successfully."
        );


        await loadProducts();

      }

      catch (error) {

        console.error(
          "Delete product error:",
          error
        );


        alert(
          "Failed to delete product."
        );

      }

      finally {

        deleteButton.disabled =
          false;

        deleteButton.textContent =
          "Delete Product";

      }

    }
  );


// =========================================================
// TABLE ACTIONS
// =========================================================

tableBody.addEventListener(
  "click",
  function(event) {

    const button =
      event.target.closest(
        "button[data-action]"
      );


    if (!button) {

      return;

    }


    const id =
      button.dataset.id;


    if (
      button.dataset.action ===
      "edit"
    ) {

      openEditProduct(id);

    }


    if (
      button.dataset.action ===
      "delete"
    ) {

      openDeleteProduct(id);

    }

  }
);


// =========================================================
// CLOSE PRODUCT MODAL
// =========================================================

function closeProductModal() {

  productModal.classList.remove(
    "show"
  );


  editingProductId =
    null;

  editingProduct =
    null;

}


document
  .getElementById(
    "closeProductModal"
  )
  .addEventListener(
    "click",
    closeProductModal
  );


document
  .getElementById(
    "cancelProduct"
  )
  .addEventListener(
    "click",
    closeProductModal
  );


// =========================================================
// CANCEL DELETE
// =========================================================

document
  .getElementById(
    "cancelDelete"
  )
  .addEventListener(
    "click",
    function() {

      deleteModal.classList.remove(
        "show"
      );

      deletingProductId =
        null;

    }
  );


// =========================================================
// CLICK OUTSIDE PRODUCT MODAL
// =========================================================

productModal.addEventListener(
  "click",
  function(event) {

    if (
      event.target ===
      productModal
    ) {

      closeProductModal();

    }

  }
);


// =========================================================
// CLICK OUTSIDE DELETE MODAL
// =========================================================

deleteModal.addEventListener(
  "click",
  function(event) {

    if (
      event.target ===
      deleteModal
    ) {

      deleteModal.classList.remove(
        "show"
      );

      deletingProductId =
        null;

    }

  }
);


// =========================================================
// PREVIOUS PAGE
// =========================================================

document
  .getElementById(
    "previousPage"
  )
  .addEventListener(
    "click",
    function() {

      if (
        currentPage > 1
      ) {

        currentPage--;

        renderProducts();

      }

    }
  );


// =========================================================
// NEXT PAGE
// =========================================================

document
  .getElementById(
    "nextPage"
  )
  .addEventListener(
    "click",
    function() {

      const totalPages =
        Math.ceil(
          filteredProducts.length /
          productsPerPage
        );


      if (
        currentPage <
        totalPages
      ) {

        currentPage++;

        renderProducts();

      }

    }
  );


// =========================================================
// SEARCH
// =========================================================

document
  .getElementById(
    "productSearch"
  )
  .addEventListener(
    "input",
    filterProducts
  );


// =========================================================
// CATEGORY FILTER
// =========================================================

document
  .getElementById(
    "categoryFilter"
  )
  .addEventListener(
    "change",
    filterProducts
  );


// =========================================================
// STOCK FILTER
// =========================================================

document
  .getElementById(
    "stockFilter"
  )
  .addEventListener(
    "change",
    filterProducts
  );


// =========================================================
// RESET FILTERS
// =========================================================

document
  .getElementById(
    "resetFilters"
  )
  .addEventListener(
    "click",
    function() {

      document.getElementById(
        "productSearch"
      ).value = "";


      document.getElementById(
        "categoryFilter"
      ).value = "all";


      document.getElementById(
        "stockFilter"
      ).value = "all";


      filterProducts();

    }
  );


// =========================================================
// GLOBAL SEARCH
// =========================================================

document
  .getElementById(
    "globalSearch"
  )
  .addEventListener(
    "keydown",
    function(event) {

      if (
        event.key ===
        "Enter"
      ) {

        document.getElementById(
          "productSearch"
        ).value =
          this.value;


        filterProducts();

      }

    }
  );


// =========================================================
// INITIALIZE
// =========================================================

loadProducts();