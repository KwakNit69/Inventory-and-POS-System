import { db, auth } from "../../Firebase/firebase-config.js";

import {
    collection,
    onSnapshot,
    addDoc,
    doc,
    setDoc,
    updateDoc,
    getDoc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

import {
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    initializeApp,
    getApps,
    getApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";



let staff = [];
let sales = [];

let currentUser = null;
let currentUserProfile = null;

let unsubscribeUsers = null;
let unsubscribeSales = null;


/* =========================================================
   ELEMENTS
   ========================================================= */

const sidebarContainer =
    document.getElementById("sidebar-container");

const tableBody =
    document.getElementById("body");

const searchInput =
    document.getElementById("search");

const filterSelect =
    document.getElementById("filter");

const addStaffButton =
    document.getElementById("addStaff");

const modal =
    document.getElementById("modal");

const form =
    document.getElementById("form");

const nameInput =
    document.getElementById("name");

const emailInput =
    document.getElementById("email");

const passwordInput =
    document.getElementById("password");

const roleInput =
    document.getElementById("role");

const statusInput =
    document.getElementById("status");

const closeModalButton =
    document.getElementById("closeModal");

const cancelButton =
    document.getElementById("cancelStaff");

const saveButton =
    document.getElementById("saveStaff");

const currentUserName =
    document.getElementById("currentUserName");

const currentUserRole =
    document.getElementById("currentUserRole");

const currentUserAvatar =
    document.getElementById("currentUserAvatar");


/* =========================================================
   SIDEBAR
   ========================================================= */

async function loadSidebar() {
    if (!sidebarContainer) {
        console.error("[Staff] sidebar-container not found.");
        return;
    }
    try {
        const response = await fetch("sidebar.html");
        if (!response.ok) {
            throw new Error(`Unable to load sidebar.html. HTTP ${response.status}`);
        }
        const html = await response.text();
        sidebarContainer.innerHTML = html;
        if (!document.getElementById("stockmaster-sidebar-script")) {
            const script = document.createElement("script");
            script.id = "stockmaster-sidebar-script";
            script.src = "sidebar.js?v=20260810";
            document.body.appendChild(script);
        }
    } catch (error) {
        console.error("[Staff] Sidebar error:", error);
    }
}


/* =========================================================
   MONEY
   ========================================================= */

function formatMoney(value) {

    return new Intl.NumberFormat(
        "en-PH",
        {
            style: "currency",
            currency: "PHP"
        }
    ).format(
        Number(value) || 0
    );
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {

    return String(
        value ?? ""
    )
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   DATE
   ========================================================= */

function normalizeDate(value) {

    if (!value) {
        return null;
    }

    if (
        typeof value.toDate ===
        "function"
    ) {
        return value.toDate();
    }

    if (
        typeof value === "object" &&
        typeof value.seconds === "number"
    ) {

        return new Date(
            value.seconds * 1000
        );
    }

    if (
        value instanceof Date
    ) {
        return value;
    }

    const parsed =
        new Date(value);

    if (
        Number.isNaN(
            parsed.getTime()
        )
    ) {
        return null;
    }

    return parsed;
}


function formatDate(value) {

    const date =
        normalizeDate(value);

    if (!date) {
        return "Never";
    }

    return date.toLocaleString(
        "en-PH",
        {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


/* =========================================================
   INITIALS
   ========================================================= */

function getInitials(name) {

    const value =
        String(
            name || ""
        ).trim();

    if (!value) {
        return "?";
    }

    const parts =
        value
            .split(/\s+/)
            .filter(Boolean);

    if (parts.length >= 2) {

        return (
            parts[0][0] +
            parts[parts.length - 1][0]
        ).toUpperCase();
    }

    return value
        .substring(0, 2)
        .toUpperCase();
}


/* =========================================================
   CURRENT ADMIN
   ========================================================= */

async function loadCurrentUserProfile(user) {

    currentUserProfile = null;

    if (!user) {
        updateCurrentUserUI();
        return;
    }

    try {

        const snapshot =
            await getDoc(
                doc(
                    db,
                    "users",
                    user.uid
                )
            );

        if (snapshot.exists()) {

            currentUserProfile =
                snapshot.data();
        }

    } catch (error) {

        console.error(
            "[Staff] Unable to load current user:",
            error
        );
    }

    updateCurrentUserUI();
}


function updateCurrentUserUI() {

    const name =
        currentUserProfile?.fullName ||
        currentUserProfile?.name ||
        currentUser?.displayName ||
        currentUser?.email ||
        "";

    const role =
        currentUserProfile?.jobTitle ||
        currentUserProfile?.role ||
        currentUserProfile?.position ||
        "Administrator";

    if (currentUserName) {
        currentUserName.textContent =
            name;
    }

    if (currentUserRole) {
        currentUserRole.textContent =
            role;
    }

    if (currentUserAvatar) {
        currentUserAvatar.textContent =
            getInitials(name);
    }
}


/* =========================================================
   NORMALIZE USER
   ========================================================= */

function normalizeStaff(id, data) {

    return {

        id,

        uid:
            data.uid ||
            id,

        name:
            data.fullName ||
            data.name ||
            data.displayName ||
            "Unnamed Staff",

        email:
            data.email ||
            "",

        role:
            data.jobTitle ||
            data.role ||
            data.position ||
            "Staff / Cashier",

        status:
            normalizeStatus(
                data.status
            ),

        lastLogin:
            data.lastLoginAt ||
            data.lastLogin ||
            data.updatedAt ||
            null,

        createdAt:
            data.createdAt ||
            null,

        raw:
            data
    };
}


function normalizeStatus(value) {

    const status =
        String(
            value || "Active"
        )
            .trim()
            .toLowerCase();

    if (
        status === "inactive" ||
        status === "disabled" ||
        status === "disable"
    ) {
        return "Inactive";
    }

    return "Active";
}


/* =========================================================
   SALES
   ========================================================= */

function getSaleStatus(data) {

    return String(
        data.status ||
        data.saleStatus ||
        data.paymentStatus ||
        "completed"
    )
        .trim()
        .toLowerCase();
}


function getSaleAmount(data) {

    return Number(
        data.total ??
        data.grandTotal ??
        data.totalAmount ??
        data.amount ??
        data.netAmount ??
        0
    ) || 0;
}


function getSaleStaffId(data) {

    return String(
        data.staffId ||
        data.staffUid ||
        data.cashierId ||
        data.cashierUid ||
        data.userId ||
        data.createdBy ||
        ""
    );
}


function getSaleStaffEmail(data) {

    return String(
        data.staffEmail ||
        data.cashierEmail ||
        data.createdByEmail ||
        data.email ||
        ""
    )
        .trim()
        .toLowerCase();
}


function getSaleStaffName(data) {

    return String(
        data.staffName ||
        data.cashier ||
        data.cashierName ||
        ""
    )
        .trim()
        .toLowerCase();
}


/* =========================================================
   CALCULATE SALES FOR STAFF
   ========================================================= */

function getStaffSales(member) {

    let total = 0;

    for (
        const sale of sales
    ) {

        const data =
            sale.data;

        const status =
            getSaleStatus(data);

        if (
            [
                "cancelled",
                "canceled",
                "void",
                "voided",
                "refunded"
            ].includes(status)
        ) {
            continue;
        }

        const amount =
            getSaleAmount(data);

        if (amount <= 0) {
            continue;
        }

        const saleStaffId =
            getSaleStaffId(data);

        const saleStaffEmail =
            getSaleStaffEmail(data);

        const saleStaffName =
            getSaleStaffName(data);

        const memberEmail =
            String(
                member.email || ""
            )
                .trim()
                .toLowerCase();

        const memberName =
            String(
                member.name || ""
            )
                .trim()
                .toLowerCase();

        const matchesUid =
            saleStaffId &&
            saleStaffId ===
            String(
                member.uid
            );

        const matchesEmail =
            saleStaffEmail &&
            memberEmail &&
            saleStaffEmail ===
            memberEmail;

        const matchesName =
            saleStaffName &&
            memberName &&
            saleStaffName ===
            memberName;

        if (
            matchesUid ||
            matchesEmail ||
            matchesName
        ) {
            total += amount;
        }
    }

    return total;
}


/* =========================================================
   RENDER
   ========================================================= */

function render() {

    if (!tableBody) {
        return;
    }

    const search =
        searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";

    const filter =
        filterSelect
            ? filterSelect.value
            : "all";

    const filtered =
        staff.filter(
            member => {

                const name =
                    String(
                        member.name || ""
                    ).toLowerCase();

                const email =
                    String(
                        member.email || ""
                    ).toLowerCase();

                const role =
                    String(
                        member.role || ""
                    ).toLowerCase();

                const matchesSearch =
                    !search ||
                    name.includes(search) ||
                    email.includes(search) ||
                    role.includes(search);

                const matchesStatus =
                    filter === "all" ||
                    member.status === filter;

                return (
                    matchesSearch &&
                    matchesStatus
                );
            }
        );


    tableBody.innerHTML = "";


    if (filtered.length === 0) {

        tableBody.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="empty-staff"
                >
                    No staff members found.
                </td>
            </tr>
        `;

    } else {

        filtered.forEach(
            member => {

                const salesAmount =
                    getStaffSales(
                        member
                    );

                const row =
                    document.createElement(
                        "tr"
                    );

                const statusClass =
                    member.status
                        .toLowerCase();

                row.innerHTML = `

                    <td>
                        <div class="staff-name-cell">

                            <div class="staff-avatar-small">
                                ${escapeHTML(
                    getInitials(
                        member.name
                    )
                )}
                            </div>

                            <div>
                                <b>
                                    ${escapeHTML(
                    member.name
                )}
                                </b>
                            </div>

                        </div>
                    </td>

                    <td>
                        ${escapeHTML(
                    member.email
                )}
                    </td>

                    <td>
                        ${escapeHTML(
                    member.role
                )}
                    </td>

                    <td>
                        ${formatMoney(
                    salesAmount
                )}
                    </td>

                    <td>
                        <span
                            class="badge ${statusClass}"
                        >
                            ${escapeHTML(
                    member.status
                )}
                        </span>
                    </td>

                    <td>
                        ${escapeHTML(
                    formatDate(
                        member.lastLogin
                    )
                )}
                    </td>

                    <td>

                        <button
                            class="action"
                            data-action="toggle"
                            data-id="${escapeHTML(
                    member.id
                )}"
                        >
                            ${member.status ===
                        "Active"
                        ? "Disable"
                        : "Activate"
                    }
                        </button>

                    </td>
                `;

                tableBody.appendChild(
                    row
                );
            }
        );
    }

    updateSummary();
}


/* =========================================================
   SUMMARY
   ========================================================= */

function updateSummary() {

    const totalElement =
        document.getElementById(
            "total"
        );

    const activeElement =
        document.getElementById(
            "active"
        );

    const inactiveElement =
        document.getElementById(
            "inactive"
        );

    const staffSalesElement =
        document.getElementById(
            "staffSales"
        );


    const total =
        staff.length;

    const active =
        staff.filter(
            member =>
                member.status ===
                "Active"
        ).length;

    const inactive =
        staff.filter(
            member =>
                member.status ===
                "Inactive"
        ).length;


    let totalSales = 0;

    for (
        const member of staff
    ) {
        totalSales +=
            getStaffSales(
                member
            );
    }


    if (totalElement) {
        totalElement.textContent =
            total;
    }

    if (activeElement) {
        activeElement.textContent =
            active;
    }

    if (inactiveElement) {
        inactiveElement.textContent =
            inactive;
    }

    if (staffSalesElement) {
        staffSalesElement.textContent =
            formatMoney(
                totalSales
            );
    }
}


/* =========================================================
   LOAD STAFF FROM FIRESTORE
   ========================================================= */

function startStaffListener() {

    if (unsubscribeUsers) {
        unsubscribeUsers();
        unsubscribeUsers = null;
    }

    unsubscribeUsers =
        onSnapshot(
            collection(
                db,
                "users"
            ),

            snapshot => {

                staff =
                    snapshot.docs
                        .map(
                            document =>

                                normalizeStaff(
                                    document.id,
                                    document.data()
                                )
                        );

                staff.sort(
                    (a, b) =>
                        a.name.localeCompare(
                            b.name
                        )
                );

                console.log(
                    "[Staff] Firebase users loaded:",
                    staff.length
                );

                render();
            },

            error => {

                console.error(
                    "[Staff] Unable to load users:",
                    error
                );

                staff = [];

                render();

                showError(
                    `Unable to load staff from Firebase.\n\n${error.message}`
                );
            }
        );
}


/* =========================================================
   LOAD SALES FROM FIRESTORE
   ========================================================= */

function startSalesListener() {

    if (unsubscribeSales) {
        unsubscribeSales();
        unsubscribeSales = null;
    }

    unsubscribeSales =
        onSnapshot(
            collection(
                db,
                "sales"
            ),

            snapshot => {

                sales =
                    snapshot.docs.map(
                        document => ({
                            id:
                                document.id,

                            data:
                                document.data()
                        })
                    );

                console.log(
                    "[Staff] Firebase sales loaded:",
                    sales.length
                );

                render();
            },

            error => {

                console.error(
                    "[Staff] Unable to load sales:",
                    error
                );

                sales = [];

                render();
            }
        );
}


/* =========================================================
   SECONDARY FIREBASE APP
   =========================================================

   Creating a new staff account with the normal auth
   instance would log the administrator out.

   Therefore we create a SECOND Firebase app/auth
   instance for staff registration.
   ========================================================= */

async function getSecondaryAuth() {

    const primaryApp =
        getApp();

    const secondaryAppName =
        "StockMasterStaffRegistration";

    let secondaryApp;

    const existing =
        getApps().find(
            app =>
                app.name ===
                secondaryAppName
        );

    if (existing) {

        secondaryApp =
            existing;

    } else {

        secondaryApp =
            initializeApp(
                primaryApp.options,
                secondaryAppName
            );
    }

    const {
        getAuth
    } =
        await import(
            "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js"
        );

    return getAuth(
        secondaryApp
    );
}


/* =========================================================
   ADD STAFF
   ========================================================= */

async function addStaff() {

    const name =
        nameInput.value.trim();

    const email =
        emailInput.value
            .trim()
            .toLowerCase();

    const password =
        passwordInput.value;

    const role =
        roleInput
            ? roleInput.value.trim()
            : "Staff / Cashier";

    const status =
        statusInput.value;


    if (!name) {
        showError(
            "Please enter the staff name."
        );
        return;
    }

    if (!email) {
        showError(
            "Please enter the staff email."
        );
        return;
    }

    if (!password) {
        showError(
            "Please enter a password."
        );
        return;
    }

    if (password.length < 6) {
        showError(
            "Password must contain at least 6 characters."
        );
        return;
    }


    const admin =
        auth.currentUser;

    if (!admin) {

        showError(
            "You are not logged in as an administrator."
        );

        return;
    }


    try {

        setSavingState(true);


        /* -----------------------------------------
           CREATE AUTH ACCOUNT
           ----------------------------------------- */

        const secondaryAuth =
            await getSecondaryAuth();

        const credential =
            await createUserWithEmailAndPassword(
                secondaryAuth,
                email,
                password
            );


        const staffUser =
            credential.user;


        /* -----------------------------------------
           UPDATE AUTH DISPLAY NAME
           ----------------------------------------- */

        await updateProfile(
            staffUser,
            {
                displayName:
                    name
            }
        );


        /* -----------------------------------------
           CREATE FIRESTORE USER PROFILE
           ----------------------------------------- */

        await setDoc(
            doc(
                db,
                "users",
                staffUser.uid
            ),
            {
                uid:
                    staffUser.uid,

                fullName:
                    name,

                name:
                    name,

                displayName:
                    name,

                email:
                    email,

                role:
                    role,

                jobTitle:
                    role,

                position:
                    role,

                status:
                    status,

                createdAt:
                    serverTimestamp(),

                createdBy:
                    admin.uid,

                createdByEmail:
                    admin.email || "",

                lastLoginAt:
                    null
            }
        );


        /* -----------------------------------------
           SIGN OUT SECONDARY AUTH
           ----------------------------------------- */

        await signOut(
            secondaryAuth
        );


        /* -----------------------------------------
           CLOSE FORM
           ----------------------------------------- */

        form.reset();

        closeModal();


        alert(
            "Staff account created successfully."
        );


    } catch (error) {

        console.error(
            "[Staff] Add staff error:",
            error
        );


        let message =
            error.message ||
            "Unable to create staff account.";


        if (
            error.code ===
            "auth/email-already-in-use"
        ) {

            message =
                "That email address is already registered.";

        } else if (
            error.code ===
            "auth/invalid-email"
        ) {

            message =
                "Please enter a valid email address.";

        } else if (
            error.code ===
            "auth/weak-password"
        ) {

            message =
                "Password is too weak. Use at least 6 characters.";

        } else if (
            error.code ===
            "permission-denied"
        ) {

            message =
                "Firebase denied the Firestore operation. Check your Firestore security rules.";

        }


        showError(
            message
        );

    } finally {

        setSavingState(
            false
        );
    }
}


/* =========================================================
   TOGGLE STAFF STATUS
   ========================================================= */

async function toggleStaff(id) {

    const member =
        staff.find(
            item =>
                String(item.id) ===
                String(id)
        );

    if (!member) {
        return;
    }


    const newStatus =
        member.status ===
            "Active"
            ? "Inactive"
            : "Active";


    try {

        await updateDoc(
            doc(
                db,
                "users",
                member.uid
            ),
            {
                status:
                    newStatus,

                updatedAt:
                    serverTimestamp(),

                updatedBy:
                    currentUser?.uid ||
                    ""
            }
        );


    } catch (error) {

        console.error(
            "[Staff] Status update error:",
            error
        );

        showError(
            `Unable to update staff status.\n\n${error.message}`
        );
    }
}


/* =========================================================
   MODAL
   ========================================================= */

function openModal() {

    if (!modal) return;

    modal.classList.add(
        "show"
    );

    nameInput?.focus();
}


function closeModal() {

    if (!modal) return;

    modal.classList.remove(
        "show"
    );

    form?.reset();

    setSavingState(
        false
    );
}


/* =========================================================
   SAVING STATE
   ========================================================= */

function setSavingState(
    saving
) {

    if (!saveButton) {
        return;
    }

    saveButton.disabled =
        saving;

    saveButton.textContent =
        saving
            ? "Creating..."
            : "Save Staff";
}


/* =========================================================
   ERROR
   ========================================================= */

function showError(
    message
) {

    alert(
        message
    );
}


/* =========================================================
   EVENTS
   ========================================================= */

searchInput?.addEventListener(
    "input",
    render
);

filterSelect?.addEventListener(
    "change",
    render
);

addStaffButton?.addEventListener(
    "click",
    openModal
);

closeModalButton?.addEventListener(
    "click",
    closeModal
);

cancelButton?.addEventListener(
    "click",
    closeModal
);


modal?.addEventListener(
    "click",
    event => {

        if (
            event.target ===
            modal
        ) {
            closeModal();
        }
    }
);


form?.addEventListener(
    "submit",
    event => {

        event.preventDefault();

        addStaff();
    }
);


/* =========================================================
   TABLE ACTIONS
   ========================================================= */

tableBody?.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                "[data-action='toggle']"
            );

        if (!button) {
            return;
        }

        const id =
            button.dataset.id;

        toggleStaff(
            id
        );
    }
);


/* =========================================================
   AUTH
   ========================================================= */

onAuthStateChanged(
    auth,
    async user => {

        currentUser =
            user;

        console.log(
            "[Staff] Current user:",
            user?.email ||
            "Not logged in"
        );


        if (!user) {

            staff = [];
            sales = [];

            render();

            return;
        }


        await loadCurrentUserProfile(
            user
        );


        startStaffListener();

        startSalesListener();
    }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

loadSidebar();

console.log(
    "[StockMaster] Staff Management initialized."
);