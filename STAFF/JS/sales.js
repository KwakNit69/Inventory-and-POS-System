    import { auth, db } from "../../Firebase/firebase-config.js";
    import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
    import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
    const salesBody = document.getElementById("salesBody");
    const salesSearch = document.getElementById("salesSearch");
    const dateFilter = document.getElementById("dateFilter");
    const paymentFilter = document.getElementById("paymentFilter");
    const resetFilters = document.getElementById("resetFilters");
    const refreshSales = document.getElementById("refreshSales");
    const todaySales = document.getElementById("todaySales");
    const transactionCount = document.getElementById("transactionCount");
    const itemsSold = document.getElementById("itemsSold");
    const averageSale = document.getElementById("averageSale");
    const resultCount = document.getElementById("resultCount");
    const previousPage = document.getElementById("previousPage");
    const nextPage = document.getElementById("nextPage");
    const pageNumber = document.getElementById("pageNumber");
    const salesError = document.getElementById("salesError");
    const salesErrorMessage = document.getElementById("salesErrorMessage");
    const retryButton = document.getElementById("retryButton");
    const staffName = document.getElementById("staffName");
    const staffAvatar = document.getElementById("staffAvatar");
    const saleModal = document.getElementById("saleModal");
    const closeModal = document.getElementById("closeModal");
    const modalTransaction = document.getElementById("modalTransaction");
    const modalDate = document.getElementById("modalDate");
    const modalPayment = document.getElementById("modalPayment");
    const modalStatus = document.getElementById("modalStatus");
    const modalSubtotal = document.getElementById("modalSubtotal");
    const modalDiscount = document.getElementById("modalDiscount");
    const modalTotal = document.getElementById("modalTotal");
    const modalItems = document.getElementById("modalItems");
    const modalPaid = document.getElementById("modalPaid");
    const modalChange = document.getElementById("modalChange");
    const requiredElements = {
        salesBody,
        salesSearch,
        dateFilter,
        paymentFilter,
        resetFilters,
        refreshSales,
        todaySales,
        transactionCount,
        itemsSold,
        averageSale,
        resultCount,
        previousPage,
        nextPage,
        pageNumber,
        salesError,
        salesErrorMessage,
        retryButton,
        staffName,
        staffAvatar,
        saleModal,
        closeModal,
        modalTransaction,
        modalDate,
        modalPayment,
        modalStatus,
        modalSubtotal,
        modalDiscount,
        modalTotal,
        modalItems,
        modalPaid,
        modalChange
    };

    const missingElements = Object.entries(requiredElements)
        .filter(([, element]) => !element)
        .map(([name]) => name);

    if (missingElements.length) {
        console.error(
            "Staff Sales: missing HTML elements:",
            missingElements
        );
    }

    let currentUser = null;
    let sales = [];
    let filteredSales = [];
    let currentPage = 1;
    const pageSize = 10;
    const money = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value) || 0);
    const initials = name => {
        const parts = String(name || "Staff").trim().split(/\s+/);
        if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return String(name || "ST").substring(0, 2).toUpperCase();
    };
    const getDate = value => {
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
    const toNumber = value => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0;
        if (typeof value === "string") {
            const cleaned = value.replace(/[^0-9.-]/g, "");
            const parsed = Number(cleaned);
            return Number.isFinite(parsed) ? parsed : 0;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const getTotal = sale => {
        const candidates = [
            sale.total,
            sale.grandTotal,
            sale.totalAmount,
            sale.amount,
            sale.amountDue,
            sale.totalPaid,
            sale.amountPaid
        ];

        for (const value of candidates) {
            const number = toNumber(value);
            if (number > 0) return number;
        }

        return 0;
    };
    const getDiscount = sale => Number(sale.discountAmount ?? sale.discount ?? sale.discountValue ?? sale.discountPrice ?? 0);
    const getSubtotal = sale => {
        const direct = Number(sale.subtotal ?? sale.subTotal ?? sale.beforeDiscount ?? sale.amountBeforeDiscount ?? 0);
        if (direct > 0) return direct;
        const total = getTotal(sale);
        const discount = getDiscount(sale);
        return total + discount;
    };
    const getItems = sale => {
        if (Array.isArray(sale.items)) return sale.items.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 1), 0);
        return Number(sale.itemCount ?? sale.itemsCount ?? sale.quantity ?? 0);
    };
    const getPayment = sale => {
        const raw =
            String(
                sale.paymentMethod ??
                sale.payment ??
                sale.method ??
                "Unknown"
            ).trim();
        if (raw.toLowerCase() === "split") {
            return "Split Payment";
        }
        return raw || "Unknown";
    };
    const getCashier = sale => String(sale.cashierUid ?? sale.cashierId ?? sale.userId ?? sale.createdBy ?? sale.staffUid ?? "");
    const getSaleDate = sale => getDate(sale.createdAt ?? sale.dateTime ?? sale.timestamp ?? sale.date ?? sale.created_at);
    const getTransaction = sale => String(sale.transactionNumber ?? sale.transactionId ?? sale.referenceNumber ?? sale.id);
    const getStatus = sale => String(sale.status ?? "Completed");

    const isCompletedSale = sale => {
        const paymentStatus = String(
            sale.paymentStatus ??
            sale.payment_status ??
            ""
        ).trim().toLowerCase();

        // A reservation remains Pending for stock/order purposes,
        // but once payment is received it must count as a sale.
        if (
            [
                "paid",
                "completed",
                "complete",
                "success",
                "successful",
                "settled"
            ].includes(paymentStatus) ||
            sale.paymentCompleted === true
        ) {
            return true;
        }

        return getStatus(sale).trim().toLowerCase() === "completed";
    };
    const getSaleCost = sale => {
        if (!isCompletedSale(sale)) return 0;
        if (Number.isFinite(Number(sale.totalCost))) return Number(sale.totalCost) || 0;
        return Array.isArray(sale.items) ? sale.items.reduce((sum, item) => sum + (Number(item.costPrice) || 0) * (Number(item.quantity ?? item.qty ?? 1) || 0), 0) : 0;
    };
    const getSaleProfit = sale => {
        if (!isCompletedSale(sale)) return 0;
        if (Number.isFinite(Number(sale.grossProfit)) && Number(sale.grossProfit) !== 0) return Number(sale.grossProfit);
        if (Number.isFinite(Number(sale.profit)) && Number(sale.profit) !== 0) return Number(sale.profit);
        return Array.isArray(sale.items) ? sale.items.reduce((sum, item) => {
            const quantity = Number(item.quantity ?? item.qty ?? 1) || 0;
            const sellingPrice = Number(item.sellingPrice ?? item.price ?? item.unitPrice ?? 0) || 0;
            const costPrice = Number(item.costPrice) || 0;
            return sum + (Number(item.profit) || (sellingPrice - costPrice) * quantity);
        }, 0) : 0;
    };
    /*
     * Payment fields used by the new Admin/Staff POS format.
     */
    const getTotalPaid = sale =>
        Number(
            sale.totalPaid ??
            sale.amountPaid ??
            sale.paidAmount ??
            sale.cashReceived ??
            sale.cash ??
            sale.total
        ) || 0;
    const getChange = sale =>
        Math.max(
            0,
            Number(sale.change) || 0
        );
    const showError = error => {
        console.error("Sales error:", error);
        salesError.classList.add("show");
        salesErrorMessage.textContent = error?.message || "Unable to load sales from Firebase.";
    };
    const hideError = () => salesError.classList.remove("show");
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
    const loadStaffInfo = user => {
        const name = sessionStorage.getItem("userName") || user.displayName || user.email?.split("@")[0] || "Staff";
        staffName.textContent = name;
        staffAvatar.textContent = initials(name);
    };
    /*
     * =========================================================
     * PAYMENT AMOUNTS
     * =========================================================
     *
     * paymentBreakdown = amount retained by the business.
     * cashReceived / tenderBreakdown = amount handed over
     * by the customer and may include change.
     */
    const getPaymentAmounts = sale => {
        const amounts = {
            Cash: 0,
            GCash: 0,
            BDO: 0,
            BIBO: 0,
            BPI: 0
        };
        const payment =
            String(
                sale.paymentMethod ??
                sale.payment ??
                sale.method ??
                ""
            )
            .trim()
            .toLowerCase();
        const total =
            getTotal(sale);
        const singleMethod = {
            cash: "Cash",
            gcash: "GCash",
            bdo: "BDO",
            bibo: "BIBO",
            bpi: "BPI"
        };
        if (singleMethod[payment]) {
            amounts[singleMethod[payment]] = total;
            return amounts;
        }
        const breakdown =
            sale.paymentBreakdown || {};
        let breakdownTotal = 0;
        Object.keys(amounts).forEach(method => {
            const amount =
                Number(breakdown[method]) || 0;
            if (amount > 0) {
                amounts[method] = amount;
                breakdownTotal += amount;
            }
        });
        if (
            breakdownTotal > 0 &&
            Math.abs(breakdownTotal - total) <= 0.005
        ) {
            return amounts;
        }
        Object.keys(amounts).forEach(method => {
            amounts[method] = 0;
        });
        if (Array.isArray(sale.splitPayments)) {
            sale.splitPayments.forEach(item => {
                const raw =
                    String(item.method || "")
                        .trim()
                        .toLowerCase();
                const method =
                    singleMethod[raw];
                const amount =
                    Number(item.amount) || 0;
                if (method && amount > 0) {
                    amounts[method] += amount;
                }
            });
        }
        const legacyTotal =
            Object.values(amounts)
                .reduce(
                    (sum, value) => sum + value,
                    0
                );
        if (
            legacyTotal > 0 &&
            Math.abs(legacyTotal - total) <= 0.005
        ) {
            return amounts;
        }
        /*
         * Safe fallback for old records.
         * Never let customer tendered cash inflate revenue.
         */
        Object.keys(amounts).forEach(method => {
            amounts[method] = 0;
        });
        amounts.Cash = total;
        return amounts;
    };
    const getPaymentTransactions = sale => {
        const amounts =
            getPaymentAmounts(sale);
        return {
            Cash: amounts.Cash > 0 ? 1 : 0,
            GCash: amounts.GCash > 0 ? 1 : 0,
            BDO: amounts.BDO > 0 ? 1 : 0,
            BIBO: amounts.BIBO > 0 ? 1 : 0,
            BPI: amounts.BPI > 0 ? 1 : 0
        };
    };
    const loadSales = async () => {
        hideError();
        salesBody.innerHTML = '<tr><td colspan="9" class="empty-cell">Loading sales...</td></tr>';
        const snapshot = await getDocs(collection(db, "sales"));
        sales = [];
        snapshot.forEach(document => {
            sales.push({ id: document.id, ...document.data() });
        });
        sales = sales.filter(sale => {
            const cashier = getCashier(sale);
            return !cashier || cashier === currentUser.uid;
        });
        sales.sort((a, b) => (getSaleDate(b)?.getTime() || 0) - (getSaleDate(a)?.getTime() || 0));
        console.log("Staff Sales loaded:", {
            totalSalesDocuments: sales.length,
            paidReservations: sales.filter(
                sale =>
                    String(sale.paymentStatus ?? "").toLowerCase() === "paid" ||
                    sale.paymentCompleted === true
            ).length,
            financiallyCompleted: sales.filter(isCompletedSale).length
        });

        updateSummary();
        applyFilters();
    };
    const updateSummary = () => {
        const today =
            sales.filter(
                sale =>
                    isToday(getSaleDate(sale)) &&
                    isCompletedSale(sale)
            );
        const total =
            today.reduce(
                (sum, sale) =>
                    sum + getTotal(sale),
                0
            );
        const count =
            today.length;
        const items =
            today.reduce(
                (sum, sale) =>
                    sum + getItems(sale),
                0
            );
        todaySales.textContent = money(total);
        transactionCount.textContent = count;
        itemsSold.textContent = items;
        averageSale.textContent = money(count ? total / count : 0);
        const todayCost = today.reduce((sum, sale) => sum + getSaleCost(sale), 0);
        const todayProfit = today.reduce((sum, sale) => sum + getSaleProfit(sale), 0);
        const profitElement = document.getElementById("todayProfit");
        const costElement = document.getElementById("todayCost");
        const marginElement = document.getElementById("todayProfitMargin");
        if (profitElement) profitElement.textContent = money(todayProfit);
        if (costElement) costElement.textContent = money(todayCost);
        if (marginElement) marginElement.textContent = total > 0 ? `${((todayProfit / total) * 100).toFixed(2)}%` : "0.00%";
    };
    const applyFilters = () => {
        const search = salesSearch.value.trim().toLowerCase();
        const date = dateFilter.value;
        const payment = paymentFilter.value;
        filteredSales = sales.filter(sale => {
            const transaction = getTransaction(sale).toLowerCase();
            const paymentText = getPayment(sale).toLowerCase();
            const status = getStatus(sale).toLowerCase();
            const customer = String(sale.customer ?? "").toLowerCase();
            const itemNames = Array.isArray(sale.items)
                ? sale.items
                    .map(item => String(item.name ?? item.productName ?? "").toLowerCase())
                    .join(" ")
                : "";

            const searchableText = [
                transaction,
                paymentText,
                status,
                customer,
                itemNames
            ].join(" ");

            const matchesSearch =
                !search ||
                searchableText.includes(search);
            const saleDate = getSaleDate(sale);
            let matchesDate = true;
            if (date === "today") matchesDate = isToday(saleDate);
            if (date === "week") matchesDate = isThisWeek(saleDate);
            if (date === "month") matchesDate = isThisMonth(saleDate);
            let matchesPayment = true;
            if (payment !== "all") {
                const filterValue =
                    payment.toLowerCase();
                if (
                    filterValue === "split" ||
                    filterValue === "split payment"
                ) {
                    matchesPayment =
                        getPayment(sale)
                            .toLowerCase() ===
                        "split payment";
                } else {
                    const method =
                        filterValue === "cash" ? "Cash" :
                        filterValue === "gcash" ? "GCash" :
                        filterValue === "bdo" ? "BDO" :
                        filterValue === "bibo" ? "BIBO" :
                        filterValue === "bpi" ? "BPI" :
                        null;
                    if (method) {
                        matchesPayment =
                            getPaymentAmounts(sale)[method] > 0;
                    } else {
                        matchesPayment =
                            getPayment(sale)
                                .toLowerCase() ===
                            filterValue;
                    }
                }
            }
            return matchesSearch && matchesDate && matchesPayment;
        });
        currentPage = 1;
        renderTable();
    };
    const renderTable = () => {
        const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * pageSize;
        const rows = filteredSales.slice(start, start + pageSize);
        pageNumber.textContent = currentPage;
        resultCount.textContent = `Showing ${filteredSales.length ? start + 1 : 0}-${Math.min(start + pageSize, filteredSales.length)} of ${filteredSales.length} transaction${filteredSales.length === 1 ? "" : "s"}`;
        previousPage.disabled = currentPage <= 1;
        nextPage.disabled = currentPage >= totalPages;
        if (!rows.length) {
            salesBody.innerHTML = '<tr><td colspan="9" class="empty-cell">No sales found.</td></tr>';
            return;
        }
        salesBody.innerHTML = rows.map(sale => {
            const date = getSaleDate(sale);
            const dateText = date ? date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";
            const timeText = date ? date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "";
            const payment = getPayment(sale);
            const paymentClass = payment.toLowerCase() === "cash" ? "payment-cash" : payment.toLowerCase() === "card" ? "payment-card" : payment.toLowerCase() === "gcash" ? "payment-gcash" : "payment-other";
            const transaction = getTransaction(sale);
            const subtotal = getSubtotal(sale);
            const discount = getDiscount(sale);
            const total = getTotal(sale);
            const status = getStatus(sale);
            const discountHtml = discount > 0 ? `<span class="discount-badge">${money(discount)}</span>` : `<span class="discount-none">₱0.00</span>`;
            return `<tr>
    <td><strong>${escapeHtml(transaction)}</strong></td>
    <td>${dateText}<br><small>${timeText}</small></td>
    <td>${getItems(sale)}</td>
    <td><span class="payment-badge ${paymentClass}">${escapeHtml(payment)}</span></td>
    <td><strong>${money(subtotal)}</strong></td>
    <td>${discountHtml}</td>
    <td><strong>${money(total)}</strong></td>
    <td><span class="status-badge">${escapeHtml(status)}</span></td>
    <td><button class="view-button" data-id="${escapeHtml(sale.id)}">View</button></td>
    </tr>`;
        }).join("");
        salesBody.querySelectorAll(".view-button").forEach(button => {
            button.addEventListener("click", () => {
                openSale(button.dataset.id);
            });
        });
    };
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    const openSale = id => {
        const sale = sales.find(item => item.id === id);
        if (!sale) return;
        const date = getSaleDate(sale);
        const subtotal = getSubtotal(sale);
        const discount = getDiscount(sale);
        const total = getTotal(sale);
        modalTransaction.textContent = getTransaction(sale);
        modalDate.textContent = date ? date.toLocaleString("en-PH") : "—";
        modalPayment.textContent = getPayment(sale);
        modalStatus.textContent = getStatus(sale);
        modalSubtotal.textContent = money(subtotal);
        modalDiscount.textContent = money(discount);
        modalTotal.textContent = money(total);
        const modalCost = document.getElementById("modalCost");
        const modalProfit = document.getElementById("modalProfit");
        const modalMargin = document.getElementById("modalProfitMargin");
        if (modalCost) modalCost.textContent = money(getSaleCost(sale));
        if (modalProfit) modalProfit.textContent = money(getSaleProfit(sale));
        if (modalMargin) modalMargin.textContent = total > 0 ? `${((getSaleProfit(sale) / total) * 100).toFixed(2)}%` : "0.00%";
        modalPaid.textContent =
            money(
                getTotalPaid(sale)
            );
        modalChange.textContent =
            money(
                getChange(sale)
            );
        const items = Array.isArray(sale.items) ? sale.items : [];
        if (!items.length) {
            modalItems.innerHTML = '<tr><td colspan="4" class="empty-cell">No item details available.</td></tr>';
        } else {
            modalItems.innerHTML = items.map(item => {
                const name = item.name ?? item.productName ?? "Product";
                const quantity = Number(item.quantity ?? item.qty ?? 1);
                const price = Number(item.price ?? item.unitPrice ?? 0);
                const itemSubtotal = Number(item.subtotal ?? price * quantity);
                return `<tr><td>${escapeHtml(name)}</td><td>${quantity}</td><td>${money(price)}</td><td>${money(itemSubtotal)}</td></tr>`;
            }).join("");
        }
        saleModal.classList.add("show");
    };
    salesSearch.addEventListener("input", applyFilters);
    dateFilter.addEventListener("change", applyFilters);
    paymentFilter.addEventListener("change", applyFilters);
    resetFilters.addEventListener("click", () => {
        salesSearch.value = "";
        dateFilter.value = "all";
        paymentFilter.value = "all";
        applyFilters();
    });
    refreshSales.addEventListener("click", async () => {
        if (!currentUser) return;
        try {
            await loadSales();
        } catch (error) {
            showError(error);
        }
    });
    retryButton.addEventListener("click", async () => {
        if (!currentUser) return;
        try {
            await loadSales();
        } catch (error) {
            showError(error);
        }
    });
    previousPage.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
    nextPage.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
    closeModal.addEventListener("click", () => saleModal.classList.remove("show"));
    saleModal.addEventListener("click", event => {
        if (event.target === saleModal) saleModal.classList.remove("show");
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") saleModal.classList.remove("show");
    });
    onAuthStateChanged(auth, async user => {
        if (!user) {
            window.location.href = "../login.html?role=staff";
            return;
        }
        currentUser = user;
        loadStaffInfo(user);
        try {
            await loadSales();
        } catch (error) {
            showError(error);
        }
    });
