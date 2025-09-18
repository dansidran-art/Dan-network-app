import { Router } from "itty-router";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = "supersecret123"; // ⚠️ move to .env in production

// Middleware: extract user from JWT
async function auth(req, res, next) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return res.status(401).json({ error: "Missing token" });

    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Health check
router.get("/", () => new Response("✅ Backend Worker running"));

// ---------------- USERS ----------------

// Signup
router.post("/api/signup", async (req) => {
  const { name, email, password } = await req.json();

  const hashed = await bcrypt.hash(password, 10);

  const stmt = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  );
  stmt.run(name, email, hashed, "user");

  return Response.json({ success: true, message: "User registered" });
});

// Login (updated with role)
router.post("/api/login", async (req) => {
  try {
    const { email, password } = await req.json();

    const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
    const user = stmt.get(email);

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 400 });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return Response.json({ error: "Invalid credentials" }, { status: 400 });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return Response.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_kyc_verified: user.is_kyc_verified,
      },
    });
  } catch (err) {
    return Response.json({ error: "Login failed", details: err.message }, { status: 500 });
  }
});

// ---------------- KYC (stub with Gemini AI later) ----------------
router.post("/api/kyc", auth, async (req) => {
  const { documentImage, selfieImage } = await req.json();

  // TODO: Call Google Gemini API to verify ID + face
  // For now, auto-pass
  const stmt = db.prepare("UPDATE users SET is_kyc_verified = 1 WHERE id = ?");
  stmt.run(req.user.id);

  return Response.json({ success: true, message: "KYC verified" });
});

// ---------------- PRODUCTS ----------------
router.post("/api/products", auth, async (req) => {
  const { name, description, price, quantity } = await req.json();

  const stmt = db.prepare(
    "INSERT INTO products (user_id, name, description, price, quantity) VALUES (?, ?, ?, ?, ?)"
  );
  stmt.run(req.user.id, name, description, price, quantity);

  return Response.json({ success: true, message: "Product listed" });
});

router.get("/api/products", async () => {
  const stmt = db.prepare("SELECT * FROM products ORDER BY created_at DESC");
  const products = stmt.all();
  return Response.json(products);
});

// ---------------- ORDERS ----------------
router.post("/api/orders", auth, async (req) => {
  const { product_id, quantity } = await req.json();

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
  if (!product) return Response.json({ error: "Product not found" }, { status: 404 });

  const total = product.price * quantity;

  const stmt = db.prepare(
    "INSERT INTO orders (buyer_id, product_id, quantity, total_amount, status, escrow_locked) VALUES (?, ?, ?, ?, ?, ?)"
  );
  stmt.run(req.user.id, product_id, quantity, total, "created", 1);

  return Response.json({ success: true, message: "Order created in escrow" });
});

router.get("/api/orders", auth, async (req) => {
  const orders = db.prepare("SELECT * FROM orders WHERE buyer_id = ?").all(req.user.id);
  return Response.json(orders);
});

// ---------------- ADMIN PANEL ----------------
router.get("/api/admin/users", auth, async (req) => {
  if (req.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = db.prepare("SELECT id, name, email, role, is_kyc_verified FROM users").all();
  return Response.json(users);
});

router.get("/api/admin/orders", auth, async (req) => {
  if (req.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const orders = db.prepare("SELECT * FROM orders").all();
  return Response.json(orders);
});

// 404
router.all("*", () => new Response("Not found", { status: 404 }));

export default {
  fetch: (req, env, ctx) => router.handle(req, env, ctx),
};