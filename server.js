/* server.js — Milk backend (MongoDB + Express + Socket.IO)
   Collections:
   - happybars, orders, products, reservations, users (już istnieją)
   - userall (NOWA: loginy/hasła/profil + historia konta)
   - Milkpoints (NOWA: milkoSy przypisane do milkId)
*/

require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "";
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_SECRET";

if (!MONGO_URI) {
  console.error("❌ Brak MONGO_URI w .env");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true }
});

// ---------- Middleware ----------
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// ---------- Mongo ----------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connect error:", err);
    process.exit(1);
  });

// ---------- Helpers ----------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, message: "Brak tokena" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Nieprawidłowy token" });
  }
}

function safeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function genMilkId6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---------- Schemas ----------
const HappybarSchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
    active: { type: Boolean, default: false },
    location: { type: String, default: "all" } // opcjonalnie: all/slupsk/rowy
  },
  { timestamps: true, collection: "happybars" }
);

const ProductSchema = new mongoose.Schema(
  {
    title: String,
    price: Number,
    category: String,
    desc: String,
    icon: String,
    active: { type: Boolean, default: true },
    image: String
  },
  { timestamps: true, collection: "products" }
);

const ReservationSchema = new mongoose.Schema(
  {
    name: String,
    phone: String,
    date: String,   // YYYY-MM-DD
    time: String,   // HH:mm
    guests: String,
    room: String,
    notes: String,
    source: { type: String, default: "app" },
    user: { email: String },
    loyaltyCode: String // MilkID
  },
  { timestamps: true, collection: "reservations" }
);

const OrderSchema = new mongoose.Schema(
  {
    source: { type: String, default: "app" },
    pickupTime: String,
    pickupLocation: String,
    notes: String,
    items: [{ title: String, qty: Number, price: Number }],
    total: Number,
    status: { type: String, default: "Przyjęte" },
    user: { email: String, name: String, phone: String },
    loyaltyCode: String // MilkID
  },
  { timestamps: true, collection: "orders" }
);

// (istniejące) users – zostawiamy jako kompatybilność
const UsersSchema = new mongoose.Schema(
  { email: String },
  { timestamps: true, collection: "users" }
);

// NOWE: userall – pełne konto + historie
const UserAllSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, index: true },
    passwordHash: { type: String, default: "" },
    phone: { type: String, default: "" },
    fullName: { type: String, default: "" },

    // MilkID przypisany do konta
    milkId: { type: String, index: true, default: "" },

    // Saldo punktów (dla wygody)
    points: { type: Number, default: 0 },

    // Historia punktów / zdarzeń
    pointsHistory: [
      {
        text: String,
        delta: Number,
        date: String
      }
    ],

    // Historia zamówień i rezerwacji (trzymamy ID + skróty)
    ordersHistory: [
      {
        orderId: String,
        total: Number,
        status: String,
        createdAt: String
      }
    ],
    reservationsHistory: [
      {
        reservationId: String,
        date: String,
        time: String,
        guests: String,
        room: String,
        createdAt: String
      }
    ]
  },
  { timestamps: true, collection: "userall" }
);

// NOWE: Milkpoints – dane o “Milkosach” per MilkID
const MilkPointsSchema = new mongoose.Schema(
  {
    milkId: { type: String, unique: true, index: true },
    points: { type: Number, default: 0 },
    history: [
      {
        text: String,
        delta: Number,
        date: String,
        meta: mongoose.Schema.Types.Mixed
      }
    ],
    linkedEmail: { type: String, default: "" }
  },
  { timestamps: true, collection: "Milkpoints" }
);

const Happybar = mongoose.model("Happybar", HappybarSchema);
const Product = mongoose.model("Product", ProductSchema);
const Reservation = mongoose.model("Reservation", ReservationSchema);
const Order = mongoose.model("Order", OrderSchema);
const Users = mongoose.model("Users", UsersSchema);
const UserAll = mongoose.model("UserAll", UserAllSchema);
const Milkpoints = mongoose.model("Milkpoints", MilkPointsSchema);

// ---------- Socket.IO ----------
io.on("connection", (socket) => {
  // console.log("socket connected", socket.id);
  socket.on("disconnect", () => {});
});

// ---------- Health ----------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// =======================================================
// AUTH + KONTA (userall)
// =======================================================

// Rejestracja (email + hasło opcjonalnie + profil)
app.post("/api/auth/register", async (req, res) => {
  try {
    const email = safeEmail(req.body.email);
    const password = String(req.body.password || "").trim();
    const phone = String(req.body.phone || "").trim();
    const fullName = String(req.body.fullName || "").trim();

    if (!email) return res.status(400).json({ ok: false, message: "Brak email" });
    if (password && password.length < 4)
      return res.status(400).json({ ok: false, message: "Hasło za krótkie" });

    const exists = await UserAll.findOne({ email });
    if (exists) return res.status(409).json({ ok: false, message: "Konto już istnieje" });

    const milkId = genMilkId6();
    const passwordHash = password ? await bcrypt.hash(password, 10) : "";

    const user = await UserAll.create({
      email,
      passwordHash,
      phone,
      fullName,
      milkId
    });

    // utwórz Milkpoints dla milkId
    await Milkpoints.create({
      milkId,
      points: 0,
      history: [],
      linkedEmail: email
    });

    // kompatybilność: wpis do "users" (jeśli chcesz zostawić)
    await Users.create({ email }).catch(() => {});

    const token = signToken({ email, uid: user._id.toString(), milkId: user.milkId });
    res.json({
      ok: true,
      token,
      user: { email: user.email, name: user.fullName || "Użytkownik", phone: user.phone, milkId: user.milkId }
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// Logowanie (wspiera też stary frontend: tylko email)
// Jeśli nie ma hasła:
// - jeżeli konto istnieje -> loguj
// - jeżeli nie istnieje -> tworzy konto “light” (bez hasła)
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = safeEmail(req.body.email);
    const password = String(req.body.password || "").trim();

    if (!email) return res.status(400).json({ ok: false, message: "Brak email" });

    let user = await UserAll.findOne({ email });

    // jeśli konto nie istnieje – auto-create (kompatybilność z Twoim PWA)
    if (!user) {
      const milkId = genMilkId6();
      user = await UserAll.create({
        email,
        passwordHash: "",
        phone: "",
        fullName: "",
        milkId
      });

      await Milkpoints.create({
        milkId,
        points: 0,
        history: [],
        linkedEmail: email
      }).catch(() => {});

      await Users.create({ email }).catch(() => {});
    }

    // jeśli konto ma hasło ustawione – wymagaj poprawnego hasła
    if (user.passwordHash) {
      if (!password) return res.status(401).json({ ok: false, message: "Wymagane hasło" });
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ ok: false, message: "Złe hasło" });
    }

    const token = signToken({ email, uid: user._id.toString(), milkId: user.milkId });
    res.json({
      ok: true,
      token,
      user: { email: user.email, name: user.fullName || "Użytkownik", phone: user.phone, milkId: user.milkId }
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// Profil (z tokenem)
app.get("/api/auth/me", auth, async (req, res) => {
  const email = safeEmail(req.user.email);
  const user = await UserAll.findOne({ email });
  if (!user) return res.status(404).json({ ok: false, message: "Nie znaleziono" });

  const mp = await Milkpoints.findOne({ milkId: user.milkId });
  res.json({
    ok: true,
    user: {
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      milkId: user.milkId,
      points: mp?.points ?? user.points ?? 0
    }
  });
});

// Aktualizacja danych osobowych
app.post("/api/user/profile", auth, async (req, res) => {
  try {
    const email = safeEmail(req.user.email);
    const fullName = String(req.body.fullName || "").trim();
    const phone = String(req.body.phone || "").trim();

    const user = await UserAll.findOneAndUpdate(
      { email },
      { $set: { fullName, phone } },
      { new: true }
    );

    if (!user) return res.status(404).json({ ok: false, message: "Nie znaleziono" });

    res.json({ ok: true, user: { email: user.email, fullName: user.fullName, phone: user.phone, milkId: user.milkId } });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// =======================================================
// MILKPOINTS (Milkosy) — per MilkID
// =======================================================

// Pobierz punkty + historię po milkId (np. do panelu/admina)
app.get("/api/milkpoints/:milkId", async (req, res) => {
  const milkId = String(req.params.milkId || "").trim();
  if (!milkId) return res.status(400).json({ ok: false, message: "Brak milkId" });

  const mp = await Milkpoints.findOne({ milkId });
  if (!mp) return res.status(404).json({ ok: false, message: "Nie znaleziono" });

  res.json({ ok: true, milkId: mp.milkId, points: mp.points, history: mp.history });
});

// Dodaj/odejmij punkty do milkId (np. naliczenie przy kasie)
// body: { milkId, delta, text, meta? }
app.post("/api/milkpoints/adjust", async (req, res) => {
  try {
    const milkId = String(req.body.milkId || "").trim();
    const delta = Number(req.body.delta || 0);
    const text = String(req.body.text || "").trim() || (delta >= 0 ? "Dodano punkty" : "Odjęto punkty");
    const meta = req.body.meta ?? null;

    if (!milkId) return res.status(400).json({ ok: false, message: "Brak milkId" });
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ ok: false, message: "delta musi być != 0" });

    const date = new Date().toLocaleString("pl-PL");

    const mp = await Milkpoints.findOneAndUpdate(
      { milkId },
      {
        $inc: { points: delta },
        $push: { history: { $each: [{ text, delta, date, meta }], $position: 0 } }
      },
      { new: true, upsert: true }
    );

    // Synchronizuj do userall (saldo + historia)
    const user = await UserAll.findOne({ milkId });
    if (user) {
      user.points = mp.points;
      user.pointsHistory = user.pointsHistory || [];
      user.pointsHistory.unshift({ text, delta, date });
      await user.save();
    }

    io.emit("milkpoints-updated", { milkId, points: mp.points });

    res.json({ ok: true, milkId, points: mp.points });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// =======================================================
// HAPPYBAR
// =======================================================

// W Twoim froncie bywa /api/data (happybar)
app.get("/api/data", async (req, res) => {
  const hb = await Happybar.findOne().sort({ updatedAt: -1 });
  res.json({ ok: true, happy: hb ? { text: hb.text, active: hb.active, location: hb.location } : { text: "", active: false, location: "all" } });
});

app.get("/api/happy", async (req, res) => {
  const hb = await Happybar.findOne().sort({ updatedAt: -1 });
  res.json({ ok: true, happy: hb });
});

app.post("/api/happy", async (req, res) => {
  const text = String(req.body.text || "").trim();
  const active = !!req.body.active;
  const location = String(req.body.location || "all");

  const hb = await Happybar.create({ text, active, location });
  io.emit("happy-updated", { text: hb.text, active: hb.active, location: hb.location });

  res.json({ ok: true, happy: hb });
});

// =======================================================
// PRODUCTS
// =======================================================
app.get("/api/products", async (req, res) => {
  const list = await Product.find({ active: true }).sort({ createdAt: -1 });
  res.json({ ok: true, products: list });
});

// =======================================================
// RESERVATIONS  -> collection: reservations
// =======================================================

app.get("/api/rezerwacje", async (req, res) => {
  const list = await Reservation.find({}).sort({ createdAt: -1 }).limit(200);
  res.json(list);
});

app.post("/api/rezerwacje", async (req, res) => {
  try {
    const payload = req.body || {};
    const r = await Reservation.create({
      name: String(payload.name || ""),
      phone: String(payload.phone || ""),
      date: String(payload.date || ""),
      time: String(payload.time || ""),
      guests: String(payload.guests || ""),
      room: String(payload.room || ""),
      notes: String(payload.notes || ""),
      source: String(payload.source || "app"),
      user: { email: safeEmail(payload.user?.email || "") },
      loyaltyCode: String(payload.loyaltyCode || "")
    });

    // dopisz do historii userall
    const email = safeEmail(payload.user?.email || "");
    if (email) {
      const user = await UserAll.findOne({ email });
      if (user) {
        user.reservationsHistory = user.reservationsHistory || [];
        user.reservationsHistory.unshift({
          reservationId: r._id.toString(),
          date: r.date,
          time: r.time,
          guests: r.guests,
          room: r.room,
          createdAt: new Date(r.createdAt).toISOString()
        });
        await user.save();
      }
    }

    io.emit("new-reservation", { id: r._id.toString(), date: r.date, time: r.time, name: r.name, phone: r.phone });
    res.json({ ok: true, reservation: r });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// (opcjonalnie CRUD)
app.delete("/api/rezerwacje/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await Reservation.findByIdAndDelete(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// =======================================================
// ORDERS -> collection: orders
// =======================================================

app.post("/api/orders", async (req, res) => {
  try {
    const p = req.body || {};
    const o = await Order.create({
      source: String(p.source || "app"),
      pickupTime: String(p.pickupTime || ""),
      pickupLocation: String(p.pickupLocation || ""),
      notes: String(p.notes || ""),
      items: Array.isArray(p.items) ? p.items : [],
      total: Number(p.total || 0),
      status: String(p.status || "Przyjęte"),
      user: {
        email: safeEmail(p.user?.email || ""),
        name: String(p.user?.name || ""),
        phone: String(p.user?.phone || "")
      },
      loyaltyCode: String(p.loyaltyCode || "")
    });

    // dopisz do historii userall
    const email = safeEmail(p.user?.email || "");
    if (email) {
      const user = await UserAll.findOne({ email });
      if (user) {
        user.ordersHistory = user.ordersHistory || [];
        user.ordersHistory.unshift({
          orderId: o._id.toString(),
          total: o.total,
          status: o.status,
          createdAt: new Date(o.createdAt).toISOString()
        });
        await user.save();
      }
    }

    io.emit("new-order", { id: o._id.toString(), total: o.total, pickupTime: o.pickupTime, pickupLocation: o.pickupLocation });
    res.json({ ok: true, order: o });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// “Moje zamówienia” – po email (najprościej: query lub token)
// Twój frontend woła /api/orders/my bez tokena -> obsłużymy email query: /api/orders/my?email=...
app.get("/api/orders/my", async (req, res) => {
  try {
    const email = safeEmail(req.query.email || "");
    if (!email) return res.json({ orders: [] });

    const list = await Order.find({ "user.email": email }).sort({ createdAt: -1 }).limit(100);
    res.json(Array.isArray(list) ? list : []);
  } catch {
    res.json({ orders: [] });
  }
});

// =======================================================
// ADMIN / STATS (opcjonalnie)
// =======================================================
app.get("/api/admin/stats", async (req, res) => {
  const [orders, reservations, usersAll] = await Promise.all([
    Order.countDocuments(),
    Reservation.countDocuments(),
    UserAll.countDocuments()
  ]);
  res.json({ ok: true, orders, reservations, usersAll });
});

// ---------- Static + SPA ----------
const PUBLIC_DIR = path.join(__dirname, "public"); // wrzuć tu index.html PWA itp.
app.use(express.static(PUBLIC_DIR));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ---------- Start ----------
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
