import { Hono } from "hono";
import { jwt } from "hono/jwt";

const app = new Hono();

/* ------------------- Middleware ------------------- */
const requireAuth = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "No token" }, 401);

  const token = authHeader.split(" ")[1];
  try {
    const user = await jwt.verify(token, c.env.JWT_SECRET);
    c.set("user", user);
    await next();
  } catch (err) {
    return c.json({ error: "Invalid token" }, 403);
  }
};

const requireAdmin = async (c, next) => {
  const user = c.get("user");
  if (user.role !== "admin") {
    return c.json({ error: "Admins only" }, 403);
  }
  await next();
};

/* ------------------- User Profile ------------------- */

// GET /api/profile
app.get("/api/profile", requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");

  const result = await db
    .prepare("SELECT id, name, email, role, is_kyc_verified FROM users WHERE id = ?")
    .bind(user.id)
    .first();

  return c.json(result);
});

// PATCH /api/profile
app.patch("/api/profile", requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const body = await c.req.json();

  // Check if verified
  const current = await db
    .prepare("SELECT is_kyc_verified FROM users WHERE id = ?")
    .bind(user.id)
    .first();

  if (!current) return c.json({ error: "User not found" }, 404);

  // If verified, prevent name change
  if (current.is_kyc_verified === 1 && body.name) {
    return c.json({ error: "Name cannot be changed after KYC verification" }, 400);
  }

  // Allow updating email and password_hash (but not role or verification flag)
  if (body.name || body.email || body.password_hash) {
    await db
      .prepare(
        "UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), password_hash = COALESCE(?, password_hash) WHERE id = ?"
      )
      .bind(body.name, body.email, body.password_hash, user.id)
      .run();
  }

  const updated = await db
    .prepare("SELECT id, name, email, role, is_kyc_verified FROM users WHERE id = ?")
    .bind(user.id)
    .first();

  return c.json(updated);
});

/* ------------------- Admin Routes ------------------- */

// GET /api/admin/overview
app.get("/api/admin/overview", requireAuth, requireAdmin, async (c) => {
  const db = c.env.DB;

  const users = await db.prepare("SELECT id, name, email, role, is_kyc_verified FROM users").all();
  const products = await db.prepare("SELECT * FROM products").all();
  const orders = await db.prepare("SELECT * FROM orders").all();

  return c.json({
    users: users.results,
    products: products.results,
    orders: orders.results,
  });
});

// PATCH /api/admin/verify-user/:id
app.patch("/api/admin/verify-user/:id", requireAuth, requireAdmin, async (c) => {
  const userId = c.req.param("id");
  const db = c.env.DB;

  await db
    .prepare("UPDATE users SET is_kyc_verified = 1 WHERE id = ?")
    .bind(userId)
    .run();

  const updated = await db
    .prepare("SELECT id, name, email, role, is_kyc_verified FROM users WHERE id = ?")
    .bind(userId)
    .first();

  return c.json(updated);
});

/* ------------------- Export Worker ------------------- */
export default app;