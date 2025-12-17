const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

/* ======================================================
   MIDDLEWARE
====================================================== */
app.use(
  helmet({
    contentSecurityPolicy: false, // PWA-friendly
  })
);
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

/* ======================================================
   PLACEHOLDER – DATABASE (NA RAZIE NIE AKTYWNA)
   ------------------------------------------------------
   Docelowe kolekcje (JUŻ ISTNIEJĄ):
   - users         → użytkownicy
   - orders        → zamów i odbierz
   - reservations → rezerwacje
====================================================== */
/*
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URL);

User        -> collection: users
Order       -> collection: orders
Reservation -> collection: reservations
*/

/* ======================================================
   HELPER – ENDPOINT PLACEHOLDER
====================================================== */
function notImplemented(feature, collection) {
  return (req, res) => {
    res.status(501).json({
      ok: false,
      feature,
      targetCollection: collection,
      message:
        "Endpoint istnieje, ale logika backendu / DB nie jest jeszcze uruchomiona.",
    });
  };
}

/* ======================================================
   HEALTHCHECK (Railway)
====================================================== */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "milk-backend",
    ts: new Date().toISOString(),
  });
});

/* ======================================================
   AUTH
   -> collection: users
====================================================== */
app.post(
  "/api/auth/login",
  notImplemented("auth.login (email-based)", "users")
);

/* ======================================================
   ORDERS – ZAMÓW I ODBIERZ
   -> collection: orders
====================================================== */
app.post(
  "/api/orders",
  notImplemented("orders.create", "orders")
);

app.get(
  "/api/orders/my",
  notImplemented("orders.list.my", "orders")
);

/* ======================================================
   RESERVATIONS
   -> collection: reservations
====================================================== */
app.get(
  "/api/rezerwacje",
  notImplemented("reservations.list", "reservations")
);

app.post(
  "/api/rezerwacje",
  notImplemented("reservations.create", "reservations")
);

app.put(
  "/api/rezerwacje/:id",
  notImplemented("reservations.update", "reservations")
);

app.delete(
  "/api/rezerwacje/:id",
  notImplemented("reservations.delete", "reservations")
);

/* ======================================================
   HAPPY BAR / TOP INFO (opcjonalne)
====================================================== */
app.get(
  "/api/data",
  notImplemented("happybar.public", "happybars")
);

app.get(
  "/api/happy",
  notImplemented("happybar.admin.get", "happybars")
);

app.post(
  "/api/happy",
  notImplemented("happybar.admin.set", "happybars")
);

/* ======================================================
   ADMIN
====================================================== */
app.get(
  "/api/admin/stats",
  notImplemented("admin.stats", "multiple")
);

/* ======================================================
   FRONTEND (PWA)
   ------------------------------------------------------
   app.html leży w ROOT projektu
====================================================== */

// serwujemy wszystkie pliki statyczne z ROOT
// (app.html, sw.js, manifest.webmanifest, icons/, itp.)
app.use(express.static(__dirname));

// SPA fallback – zawsze zwracaj app.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "app.html"));
});

/* ======================================================
   START SERVER
====================================================== */
app.listen(PORT, () => {
  console.log(`🚀 Milk backend działa na porcie ${PORT}`);
});
