import { auth, db } from "../../Firebase/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
const cashflowBody = document.getElementById("cashflowBody");
const cashflowSearch = document.getElementById("cashflowSearch");
const periodFilter = document.getElementById("periodFilter");
const typeFilter = document.getElementById("typeFilter");
const accountFilter = document.getElementById("accountFilter");
const resetFilters = document.getElementById("resetFilters");
const refreshCashflow = document.getElementById("refreshCashflow");
const cashIn = document.getElementById("cashIn");
const cashOut = document.getElementById("cashOut");
const netCashFlow = document.getElementById("netCashFlow");
const transactionCount = document.getElementById("transactionCount");
const resultCount = document.getElementById("resultCount");
const previousPage = document.getElementById("previousPage");
const nextPage = document.getElementById("nextPage");
const pageNumber = document.getElementById("pageNumber");
const cashflowError = document.getElementById("cashflowError");
const cashflowErrorMessage = document.getElementById("cashflowErrorMessage");
const retryButton = document.getElementById("retryButton");
const staffName = document.getElementById("staffName");
const staffAvatar = document.getElementById("staffAvatar");
const cashflowModal = document.getElementById("cashflowModal");
const closeModal = document.getElementById("closeModal");
const modalTransaction = document.getElementById("modalTransaction");
const modalReference = document.getElementById("modalReference");
const modalDate = document.getElementById("modalDate");
const modalDescription = document.getElementById("modalDescription");
const modalType = document.getElementById("modalType");
const modalPayment = document.getElementById("modalPayment");
const modalAmount = document.getElementById("modalAmount");
const openCashIn = document.getElementById("openCashIn");
const openCashOut = document.getElementById("openCashOut");
const cashMovementModal = document.getElementById("cashMovementModal");
const closeMovementModal = document.getElementById("closeMovementModal");
const cashMovementForm = document.getElementById("cashMovementForm");
const movementTitle = document.getElementById("movementTitle");
const movementSubtitle = document.getElementById("movementSubtitle");
const movementInButton = document.getElementById("movementInButton");
const movementOutButton = document.getElementById("movementOutButton");
const movementAccount = document.getElementById("movementAccount");
const movementAmount = document.getElementById("movementAmount");
const movementDescription = document.getElementById("movementDescription");
const movementError = document.getElementById("movementError");
const cancelMovement = document.getElementById("cancelMovement");
const saveMovement = document.getElementById("saveMovement");
let currentUser = null;
let records = [];
let filteredRecords = [];
let currentPage = 1;
let movementType = "in";
const pageSize = 10;
const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
const initials = name => {
    const parts = String(name || "Staff").trim().split(/\s+/);
    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return String(name || "ST").substring(0, 2).toUpperCase();
};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const getDate = record => {
    const value = record.createdAt ?? record.dateTime ?? record.timestamp ?? record.date ?? record.created_at;
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === "string") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "number") return new Date(value);
    return null;
};
const getAmount = record => Number(record.amount ?? record.total ?? record.cashAmount ?? record.value ?? 0);
const getType = record => {
    const value = String(record.type ?? record.transactionType ?? record.flowType ?? "in").toLowerCase();
    if (value.includes("out") || value.includes("expense") || value.includes("withdraw")) return "out";
    return "in";
};
const getDescription = record => String(record.description ?? record.note ?? record.details ?? record.reason ?? "Sale");
const getPayment = record => String(record.paymentMethod ?? record.payment ?? record.method ?? record.account ?? "—");
const getReference = record => String(record.transactionId ?? record.transactionNumber ?? record.referenceNumber ?? record.saleId ?? record.id);
const getUser = record => String(record.userId ?? record.uid ?? record.createdBy ?? record.cashierUid ?? record.staffUid ?? "");
const showError = error => {
    console.error("Cash flow error:", error);
    cashflowError.classList.add("show");
    cashflowErrorMessage.textContent = error?.message || "Unable to load cash flow from Firebase.";
};
const hideError = () => cashflowError.classList.remove("show");
const loadStaffInfo = user => {
    const name = sessionStorage.getItem("userName") || user.displayName || user.email?.split("@")[0] || "Staff";
    staffName.textContent = name;
    staffAvatar.textContent = initials(name);
};
const loadCashFlow = async () => {
    cashflowBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Loading cash flow...</td></tr>';
    const snapshot = await getDocs(collection(db, "cashFlow"));
    records = [];
    snapshot.forEach(document => {
        records.push({ id: document.id, ...document.data() });
    });
    records = records.filter(record => {
        const userId = getUser(record);
        return !userId || userId === currentUser.uid;
    });
    records.sort((a, b) => (getDate(b)?.getTime() || 0) - (getDate(a)?.getTime() || 0));
    updateSummary();
    applyFilters();
};
const updateSummary = () => {
    let inTotal = 0;
    let outTotal = 0;
    records.forEach(record => {
        if (getType(record) === "out") outTotal += getAmount(record);
        else inTotal += getAmount(record);
    });
    cashIn.textContent = money(inTotal);
    cashOut.textContent = money(outTotal);
    netCashFlow.textContent = money(inTotal - outTotal);
    transactionCount.textContent = records.length;
};
const isToday = date => {
    const now = new Date();
    return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
};
const isThisWeek = date => {
    if (!date) return false;
    const now = new Date();
    const start = new Date(now);
    const day = start.getDay();
    const difference = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - difference);
    start.setHours(0, 0, 0, 0);
    return date >= start && date <= now;
};
const isThisMonth = date => {
    const now = new Date();
    return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};
const applyFilters = () => {
    const search = cashflowSearch.value.trim().toLowerCase();
    const period = periodFilter.value;
    const type = typeFilter.value;
    const account = accountFilter.value;
    filteredRecords = records.filter(record => {
        const reference = getReference(record).toLowerCase();
        const description = getDescription(record).toLowerCase();
        const payment = getPayment(record).toLowerCase();
        const date = getDate(record);
        const matchesSearch = !search || reference.includes(search) || description.includes(search) || payment.includes(search);
        let matchesPeriod = true;
        if (period === "today") matchesPeriod = isToday(date);
        if (period === "week") matchesPeriod = isThisWeek(date);
        if (period === "month") matchesPeriod = isThisMonth(date);
        const matchesType = type === "all" || getType(record) === type;
        const matchesAccount = account === "all" || getPayment(record).toLowerCase() === account.toLowerCase();
        return matchesSearch && matchesPeriod && matchesType && matchesAccount;
    });
    currentPage = 1;
    renderTable();
};
const renderTable = () => {
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * pageSize;
    const rows = filteredRecords.slice(start, start + pageSize);
    pageNumber.textContent = currentPage;
    previousPage.disabled = currentPage <= 1;
    nextPage.disabled = currentPage >= totalPages;
    resultCount.textContent = `Showing ${filteredRecords.length ? start + 1 : 0}-${Math.min(start + pageSize, filteredRecords.length)} of ${filteredRecords.length} transaction${filteredRecords.length === 1 ? "" : "s"}`;
    if (!rows.length) {
        cashflowBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No cash flow records found.</td></tr>';
        return;
    }
    cashflowBody.innerHTML = rows.map(record => {
        const date = getDate(record);
        const dateText = date ? date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";
        const timeText = date ? date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "";
        const type = getType(record);
        const typeText = type === "in" ? "Cash In" : "Cash Out";
        const reference = getReference(record);
        const amount = getAmount(record);
        return `<tr>
<td><strong>${escapeHtml(reference)}</strong></td>
<td>${dateText}<br><small>${timeText}</small></td>
<td>${escapeHtml(getDescription(record))}</td>
<td><span class="type-badge ${type === "in" ? "type-in" : "type-out"}">${typeText}</span></td>
<td><span class="payment-badge">${escapeHtml(getPayment(record))}</span></td>
<td class="${type === "in" ? "amount-in" : "amount-out"}">${type === "in" ? "+" : "-"}${money(amount)}</td>
<td><button class="view-button" data-id="${escapeHtml(record.id)}">View</button></td>
</tr>`;
    }).join("");
    document.querySelectorAll(".view-button").forEach(button => {
        button.addEventListener("click", () => openRecord(button.dataset.id));
    });
};
const openRecord = id => {
    const record = records.find(item => item.id === id);
    if (!record) return;
    const date = getDate(record);
    const type = getType(record);
    const amount = getAmount(record);
    const reference = getReference(record);
    modalTransaction.textContent = reference;
    modalReference.textContent = reference;
    modalDate.textContent = date ? date.toLocaleString("en-PH") : "—";
    modalDescription.textContent = getDescription(record);
    modalType.textContent = type === "in" ? "Cash In" : "Cash Out";
    modalPayment.textContent = getPayment(record);
    modalAmount.textContent = `${type === "in" ? "+" : "-"}${money(amount)}`;
    modalAmount.style.color = type === "in" ? "#16803c" : "#d74343";
    cashflowModal.classList.add("show");
};
const openMovement = type => {
    movementType = type;
    movementTitle.textContent = type === "in" ? "Cash In" : "Cash Out";
    movementSubtitle.textContent = type === "in" ? "Add money to a selected account." : "Remove money from a selected account.";
    movementInButton.classList.toggle("active", type === "in");
    movementOutButton.classList.toggle("active", type === "out");
    saveMovement.textContent = type === "in" ? "Save Cash In" : "Save Cash Out";
    movementError.textContent = "";
    movementAccount.value = "";
    movementAmount.value = "";
    movementDescription.value = "";
    cashMovementModal.classList.add("show");
    setTimeout(() => movementAccount.focus(), 100);
};
const closeMovement = () => {
    cashMovementModal.classList.remove("show");
    movementError.textContent = "";
};
const generateReference = type => {
    const now = new Date();
    const date = now.toISOString().replace(/\D/g, "").substring(0, 14);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${type === "in" ? "CIN" : "COUT"}-${date}-${random}`;
};
const saveCashMovement = async event => {
    event.preventDefault();
    const account = movementAccount.value;
    const amount = Number(movementAmount.value);
    const description = movementDescription.value.trim();
    if (!account) {
        movementError.textContent = "Please select an account.";
        return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        movementError.textContent = "Please enter a valid amount.";
        return;
    }
    if (!description) {
        movementError.textContent = "Please enter a description or reason.";
        return;
    }
    saveMovement.disabled = true;
    saveMovement.textContent = "Saving...";
    movementError.textContent = "";
    try {
        const name = sessionStorage.getItem("userName") || currentUser.displayName || currentUser.email?.split("@")[0] || "Staff";
        const reference = generateReference(movementType);
        const timestamp = new Date().toISOString();
        await addDoc(collection(db, "cashFlow"), {
            transactionId: reference,
            transactionNumber: reference,
            referenceNumber: reference,
            type: movementType,
            transactionType: movementType === "in" ? "cash_in" : "cash_out",
            flowType: movementType,
            category: movementType === "in" ? "Cash In" : "Cash Out",
            paymentMethod: account,
            account: account,
            amount: amount,
            description: description,
            reason: description,
            source: "Manual Cash Movement",
            userId: currentUser.uid,
            staffUid: currentUser.uid,
            cashierUid: currentUser.uid,
            createdBy: currentUser.uid,
            cashier: name,
            staffName: name,
            date: timestamp,
            dateTime: timestamp,
            timestamp: timestamp,
            createdAt: serverTimestamp()
        });
        closeMovement();
        await loadCashFlow();
    } catch (error) {
        console.error("Cash movement error:", error);
        movementError.textContent = error?.message || "Unable to save the cash movement.";
    } finally {
        saveMovement.disabled = false;
        saveMovement.textContent = movementType === "in" ? "Save Cash In" : "Save Cash Out";
    }
};
const refresh = async () => {
    if (!currentUser) return;
    try {
        hideError();
        await loadCashFlow();
    } catch (error) {
        showError(error);
    }
};
cashflowSearch.addEventListener("input", applyFilters);
periodFilter.addEventListener("change", applyFilters);
typeFilter.addEventListener("change", applyFilters);
accountFilter.addEventListener("change", applyFilters);
resetFilters.addEventListener("click", () => {
    cashflowSearch.value = "";
    periodFilter.value = "all";
    typeFilter.value = "all";
    accountFilter.value = "all";
    applyFilters();
});
refreshCashflow.addEventListener("click", refresh);
retryButton.addEventListener("click", refresh);
previousPage.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});
nextPage.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    if (currentPage < totalPages) {
        currentPage++;
        renderTable();
    }
});
closeModal.addEventListener("click", () => cashflowModal.classList.remove("show"));
cashflowModal.addEventListener("click", event => {
    if (event.target === cashflowModal) cashflowModal.classList.remove("show");
});
openCashIn.addEventListener("click", () => openMovement("in"));
openCashOut.addEventListener("click", () => openMovement("out"));
movementInButton.addEventListener("click", () => openMovement("in"));
movementOutButton.addEventListener("click", () => openMovement("out"));
closeMovementModal.addEventListener("click", closeMovement);
cancelMovement.addEventListener("click", closeMovement);
cashMovementForm.addEventListener("submit", saveCashMovement);
cashMovementModal.addEventListener("click", event => {
    if (event.target === cashMovementModal) closeMovement();
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