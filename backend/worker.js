import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { drizzle } from "drizzle-orm/d1";
import bcrypt from "bcryptjs";

export default {
  async fetch(request, env, ctx) {
    const app = new Hono();
    const db = drizzle(env.DB);

    // Middleware: JWT Auth
    const auth = jwt({
      secret: env.JWT_SECRET,
    });

    // --- Signup ---
    app.post("/signup", async (c) => {
      const { name, email, password } = await c.req.json();

      if (!name || !email || !password) {
        return c.json({ error: "Missing fields" }, 400);
      }

      const password_hash = await bcrypt.hash(password, 10);

      try {
        await db.run(
          `INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)`,
          [name, email, password_hash]
        );
        return c.json({ message: "Signup successful ✅" });
      } catch (e) {
        return c.json({ error: "Email already exists" }, 400);
      }
    });

    // --- Login ---
    app.post("/login", async (c) => {
      const { email, password } = await c.req.json();

      const user = await db.get(
        `SELECT * FROM users WHERE email = ? LIMIT 1`,
        [email]
      );

      if (!user) return c.json({ error: "User not found" }, 404);

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return c.json({ error: "Invalid password" }, 401);

      const token = await new SignJWT({ id: user.id, role: user.role })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("7d")
        .sign(new TextEncoder().encode(env.JWT_SECRET));

      return c.json({ token, user });
    });

    // --- Verify KYC ---
    app.post("/kyc/verify", auth, async (c) => {
      const user = c.get("jwtPayload");

      await db.run(
        `UPDATE users SET is_kyc_verified = 1 WHERE id = ?`,
        [user.id]
      );

      await db.run(
        `INSERT INTO subaccounts (user_id, name) VALUES (?, ?)`,
        [user.id, "Main Account"]
      );

      return c.json({ message: "KYC verified + subaccount created ✅" });
    });

    // --- List Product ---
    app.post("/products", auth, async (c) => {
      const user = c.get("jwtPayload");
      const { name, description, price, quantity } = await c.req.json();

      const u = await db.get(`SELECT * FROM users WHERE id = ?`, [user.id]);
      if (!u.is_kyc_verified) {
        return c.json({ error: "KYC required" }, 403);
      }

      await db.run(
        `INSERT INTO products (user_id, name, description, price, quantity) VALUES (?, ?, ?, ?, ?)`,
        [user.id, name, description, price, quantity]
      );

      return c.json({ message: "Product listed ✅" });
    });

    // --- Create Order ---
    app.post("/orders", auth, async (c) => {
      const buyer = c.get("jwtPayload");
      const { product_id, quantity } = await c.req.json();

      const product = await db.get(
        `SELECT * FROM products WHERE id = ?`,
        [product_id]
      );

      if (!product) return c.json({ error: "Product not found" }, 404);

      const total_amount = product.price * quantity;

      await db.run(
        `INSERT INTO orders (buyer_id, product_id, quantity, total_amount, escrow_locked) VALUES (?, ?, ?, ?, ?)`,
        [buyer.id, product_id, quantity, total_amount, 1]
      );

      return c.json({ message: "Order created & funds locked in escrow ✅" });
    });

    return app.fetch(request, env, ctx);
  },
};