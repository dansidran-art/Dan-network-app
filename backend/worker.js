import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";

const app = new Hono();
app.use("*", cors());

// --- JWT helpers ---
const JWT_SECRET = "supersecret"; // move to env later

function signJwt(payload) {
  return new Promise((resolve, reject) => {
    try {
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
      resolve(token);
    } catch (err) {
      reject(err);
    }
  });
}

async function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// --- Middleware to protect routes ---
async function authMiddleware(c, next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const decoded = await verifyJwt(token);
  if (!decoded) return c.json({ error: "Invalid token" }, 401);
  c.set("user", decoded);
  await next();
}

// --- Default admin password hash (admin123) ---
const DEFAULT_ADMIN_HASH =
  "$2b$10$6shl17FsaY1vDP85NcaKtege9ouXXW2rVY6jEFvCUtah6TRPlyynW";

// --- Auto-create default admin if missing ---
async function ensureDefaultAdmin(db) {
  const { results } = await db
    .prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1")
    .all();
  if (results.length === 0) {
    await db
      .prepare(
        "INSERT INTO users (name, email, password_hash, role, is_kyc_verified) VALUES (?, ?, ?, ?, ?)"
      )
      .bind("Admin", "admin@example.com", DEFAULT_ADMIN_HASH, "admin", 1)
      .run();
    console.log("✅ Default admin created (admin@example.com / admin123)");
  }
}

// --- Signup ---
app.post("/signup", async (c) => {
  const db = c.env.DB;
  const { name, email, password } = await c.req.json();
  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash(password, 10);

  try {
    await db
      .prepare(
        "INSERT INTO users (name, email, password_hash, role, is_kyc_verified) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(name, email, hash, "user", 0)
      .run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: "Email already exists" }, 400);
  }
});

// --- Login ---
app.post("/login", async (c) => {
  const db = c.env.DB;
  const { email, password } = await c.req.json();
  const bcrypt = require("bcryptjs");

  const { results } = await db
    .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .all();

  if (results.length === 0) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const user = results[0];
  const match = await bcrypt.compare(password, user.password_hash);

  if (!match) return c.json({ error: "Invalid credentials" }, 401);

  const token = await signJwt({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  return c.json({ token, user });
});

// --- Example protected route ---
app.get("/me", authMiddleware, async (c) => {
  return c.json({ user: c.get("user") });
});

// --- Admin-only route (list all users) ---
app.get("/admin/users", authMiddleware, async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const db = c.env.DB;
  const { results } = await db.prepare("SELECT * FROM users").all();
  return c.json(results);
});

// --- Bindings setup ---
export default {
  async fetch(request, env, ctx) {
    await ensureDefaultAdmin(env.DB);
    return app.fetch(request, env, ctx);
  },
};