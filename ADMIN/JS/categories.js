import { db, auth } from "../../Firebase/firebase-config.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

const grid = document.getElementById("grid");
const search = document.getElementById("search");
const addButton = document.getElementById("add");
const modal = document.getElementById("modal");
const form = document.getElementById("form");
const nameInput = document.getElementById("name");
const descriptionInput = document.getElementById("description");
const totalElement = document.getElementById("total");
const productsElement = document.getElementById("products");
const activeElement = document.getElementById("active");
const emptyElement = document.getElementById("empty");

let categories = [];
let productCounts = {};
let editingCategoryId = null;

function loadSidebar() {
  const container = document.getElementById("sidebar-container");
  if (!container) return;

  fetch("sidebar.html")
    .then(response => {
      if (!response.ok) {
        throw new Error(`Sidebar HTTP error: ${response.status}`);
      }
      return response.text();
    })
    .then(html => {
      container.innerHTML = html;
      const script = document.createElement("script");
      script.src = "sidebar.js?v=2";
      document.body.appendChild(script);
    })
    .catch(error => {
      console.error("Sidebar error:", error);
    });
}

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"']/g, character => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character];
  });
}

async function loadCategories() {
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:50px;color:#7b858f;">
      Loading categories...
    </div>
  `;

  try {
    const [categorySnapshot, productSnapshot] = await Promise.all([
      getDocs(collection(db, "categories")),
      getDocs(collection(db, "products"))
    ]);

    categories = categorySnapshot.docs.map(categoryDoc => {
      const data = categoryDoc.data();

      return {
        id: categoryDoc.id,
        name: data.name || "",
        description: data.description || "",
        status: data.status || "active",
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
      };
    });

    productCounts = {};

    productSnapshot.docs.forEach(productDoc => {
      const product = productDoc.data();
      const category = product.category || "";

      if (category) {
        productCounts[category] =
          (productCounts[category] || 0) + 1;
      }
    });

    categories.sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    render();
  } catch (error) {
    console.error("Firebase categories error:", error);

    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:50px;">
        <div style="font-size:28px;margin-bottom:10px;">!</div>
        <h3 style="font-size:14px;margin-bottom:5px;">
          Unable to load categories
        </h3>
        <p style="font-size:11px;color:#89939d;margin-bottom:12px;">
          Please check your Firebase connection and Firestore rules.
        </p>
        <button
          type="button"
          id="retryCategories"
          style="background:#1976d2;color:white;border:0;border-radius:4px;padding:8px 14px;cursor:pointer;">
          Try Again
        </button>
      </div>
    `;

    document
      .getElementById("retryCategories")
      ?.addEventListener(
        "click",
        loadCategories
      );
  }
}

function getProductCount(categoryName) {
  return productCounts[categoryName] || 0;
}

function render() {
  const query = search.value.trim().toLowerCase();

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(query) ||
    category.description.toLowerCase().includes(query)
  );

  totalElement.textContent = categories.length;

  const totalProducts = Object.values(productCounts)
    .reduce((total, count) => total + count, 0);

  productsElement.textContent = totalProducts;

  const activeCount = categories.filter(category =>
    category.status === "active"
  ).length;

  activeElement.textContent = activeCount;

  const emptyCount = categories.filter(category =>
    getProductCount(category.name) === 0
  ).length;

  emptyElement.textContent = emptyCount;

  if (filteredCategories.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:50px;color:#7b858f;">
        <div style="font-size:30px;margin-bottom:10px;">▦</div>
        <h3 style="font-size:14px;color:#172331;margin-bottom:5px;">
          No categories found
        </h3>
        <p style="font-size:10px;">
          ${categories.length === 0
            ? "Add your first category to get started."
            : "Try changing your search."}
        </p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredCategories.map(category => {
    const count = getProductCount(category.name);

    return `
      <div class="cat">
        <div class="cat-top">
          <div class="icon">▦</div>
          <div class="actions">
            <button
              type="button"
              title="Edit category"
              data-action="edit"
              data-id="${category.id}">
              ✎
            </button>
            <button
              type="button"
              title="Delete category"
              data-action="delete"
              data-id="${category.id}">
              ×
            </button>
          </div>
        </div>
        <h3>${escapeHTML(category.name)}</h3>
        <p>${escapeHTML(category.description)}</p>
        <div class="footer">
          ${count} product${count === 1 ? "" : "s"}
        </div>
      </div>
    `;
  }).join("");
}

function openAddModal() {
  editingCategoryId = null;

  form.reset();

  const title = modal.querySelector("h2");

  if (title) {
    title.textContent = "Add Category";
  }

  const button = form.querySelector("button");

  if (button) {
    button.textContent = "Save Category";
  }

  modal.classList.add("show");

  nameInput.focus();
}

function openEditModal(id) {
  const category = categories.find(item =>
    item.id === id
  );

  if (!category) return;

  editingCategoryId = id;

  nameInput.value = category.name;
  descriptionInput.value = category.description;

  const title = modal.querySelector("h2");

  if (title) {
    title.textContent = "Edit Category";
  }

  const button = form.querySelector("button");

  if (button) {
    button.textContent = "Update Category";
  }

  modal.classList.add("show");

  nameInput.focus();
}

function closeModal() {
  modal.classList.remove("show");
  editingCategoryId = null;
  form.reset();
}

async function categoryExists(name, currentId = null) {
  const normalizedName = name.trim().toLowerCase();

  return categories.some(category =>
    category.id !== currentId &&
    category.name.trim().toLowerCase() === normalizedName
  );
}

async function saveCategory(event) {
  event.preventDefault();

  const name = nameInput.value.trim();
  const description = descriptionInput.value.trim();

  if (!name) {
    alert("Please enter a category name.");
    return;
  }

  const saveButton = form.querySelector("button");

  saveButton.disabled = true;

  try {
    const duplicate = await categoryExists(
      name,
      editingCategoryId
    );

    if (duplicate) {
      alert("A category with this name already exists.");
      return;
    }

    if (editingCategoryId) {
      await updateDoc(
        doc(
          db,
          "categories",
          editingCategoryId
        ),
        {
          name: name,
          description: description,
          updatedAt: serverTimestamp()
        }
      );

      alert("Category updated successfully.");
    } else {
      await addDoc(
        collection(db, "categories"),
        {
          name: name,
          description: description,
          status: "active",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      );

      alert("Category added successfully.");
    }

    closeModal();
    await loadCategories();
  } catch (error) {
    console.error("Save category error:", error);

    alert(
      "Unable to save category. Please check your Firebase permissions."
    );
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteCategory(id) {
  const category = categories.find(item =>
    item.id === id
  );

  if (!category) return;

  const productCount =
    getProductCount(category.name);

  if (productCount > 0) {
    alert(
      `This category contains ${productCount} product${productCount === 1 ? "" : "s"} and cannot be deleted.`
    );
    return;
  }

  const confirmed = confirm(
    `Are you sure you want to delete "${category.name}"?`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(
      doc(
        db,
        "categories",
        id
      )
    );

    alert("Category deleted successfully.");

    await loadCategories();
  } catch (error) {
    console.error("Delete category error:", error);

    alert(
      "Unable to delete category. Please check your Firebase permissions."
    );
  }
}

addButton?.addEventListener(
  "click",
  openAddModal
);

form?.addEventListener(
  "submit",
  saveCategory
);

search?.addEventListener(
  "input",
  render
);

document.getElementById("cancelCategory")?.addEventListener("click", closeModal);

grid?.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest(
        "button[data-action]"
      );

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "edit") {
      openEditModal(id);
    }

    if (action === "delete") {
      deleteCategory(id);
    }
  }
);

modal?.addEventListener(
  "click",
  event => {
    if (event.target === modal) {
      closeModal();
    }
  }
);

loadSidebar();

onAuthStateChanged(
  auth,
  user => {
    if (!user) {
      console.error(
        "No authenticated user."
      );

      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:50px;color:#c0392b;">
          Please log in to manage categories.
        </div>
      `;

      return;
    }

    console.log(
      "Authenticated user:",
      user.email
    );

    loadCategories();
  }
);