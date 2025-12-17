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
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

/* ======================================================
   PLACEHOLDER – DB (NA RAZIE NIE PODPINAMY)
   ------------------------------------------------------
   Docelowo:
   - MongoDB / Mongoose
   - Kolekcje JUŻ ISTNIEJĄ:
       • users
       • reservations
       • orders
====================================================== */
// const mongoose = require("mongoose");
// mongoose.connect(process.env.MONGO_URL);

/*
  MODELE (DO UTWORZENIA PÓŹNIEJ):

  User        -> collection: users
  Reservation -> collection: reservations
  Order       -> collection: orders
*/

/* ======================================================
   HELPER – NOT IMPLEMENTED
====================================================== */
function notImplemented(feature, collection) {
  return (req, res) => {
    res.status(501).json({
      ok: false,
      feature,
      targetCollection: collection,
      message: "Endpoint istnieje, ale logika DB nie jest jeszcze uruchomiona."
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
    env: process.env.NODE_ENV || "development",
    ts: new Date().toISOString()
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
app.get("/api/data", notImplemented("happybar.public", "happybars"));
app.get("/api/happy", notImplemented("happybar.admin.get", "happybars"));
app.post("/api/happy", notImplemented("happybar.admin.set", "happybars"));

/* ======================================================
   ADMIN
====================================================== */
app.get(
  "/api/admin/stats",
  notImplemented("admin.stats", "multiple")
);

/* ======================================================
   FRONTEND (PWA)
====================================================== */
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

// SPA fallback (ważne!)
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

/* ======================================================
   START
====================================================== */
app.listen(PORT, () => {
  console.log(`🚀 Milk server running on port ${PORT}`);
});
