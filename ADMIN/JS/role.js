/* =========================================
   STOCKMASTER ROLE SELECTION
   ========================================= */


/* ADMIN */

document
    .getElementById("adminRole")
    .addEventListener("click", function () {

        window.location.href = "login.html";

    });



/* STAFF */

document
    .getElementById("staffRole")
    .addEventListener("click", function () {

        window.location.href =
            "STAFF/dashboard.html";

    });