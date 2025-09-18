import { Hono } from "hono";
import { jwt } from "hono/jwt";

const app = new Hono();

// Middleware: Require authenticated user
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

// Middleware: Require admin
const requireAdmin = async (c, next) => {
  const user = c.get("user");
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden: Admins only" }, 403);
  }
  await next();
};

/* ------------------- Admin Routes ------------------- */

// GET /api/admin/overview
app.get("/api/admin/overview", requireAuth, requireAdmin, async (c) => {
  try {
    const db = c.env.DB;

    const users = await db.prepare("SELECT id, name, email, role, is_kyc_verified FROM users").all();
    const products = await db.prepare("SELECT * FROM products").all();
    const orders = await db.prepare("SELECT * FROM orders").all();

    return c.json({
      users: users.results,
      products: products.results,
      orders: orders.results,
    });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// PATCH /api/admin/verify-user/:id
app.patch("/api/admin/verify-user/:id", requireAuth, requireAdmin, async (c) => {
  try {
    const userId = c.req.param("id");
    const db = c.env.DB;

    // Mark user as verified
    await db
      .prepare("UPDATE users SET is_kyc_verified = 1 WHERE id = ?")
      .bind(userId)
      .run();

    const updated = await db
      .prepare("SELECT id, name, email, role, is_kyc_verified FROM users WHERE id = ?")
      .bind(userId)
      .first();

    return c.json(updated);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

/* ------------------- Export Worker ------------------- */
export default app;