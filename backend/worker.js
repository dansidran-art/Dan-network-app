// backend/worker.js
import express from "express";
import bodyParser from "body-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { D1Database } from "@cloudflare/d1";

// === INIT ===
const app = express();
app.use(bodyParser.json());

const upload = multer({ storage: multer.memoryStorage() });

// Bindings
const db = new D1Database(process.env.DB);
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// === AUTH HELPERS ===
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "No token" });
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// === AUTH ROUTES ===
app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);

  try {
    await db.prepare(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)"
    ).bind(name, email, hash).run();

    const user = await db.prepare("SELECT * FROM users WHERE email = ?")
      .bind(email).first();

    res.json({ token: generateToken(user), user });
  } catch (err) {
    res.status(400).json({ error: "Email already exists" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email).first();

  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(400).json({ error: "Invalid credentials" });

  res.json({ token: generateToken(user), user });
});

// === KYC ROUTE (Gemini) ===
app.post("/api/kyc/verify", authMiddleware, upload.single("document"), async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Document file is required" });
    }

    // Convert file buffer to Base64
    const fileBase64 = fileToBase64(file);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // Ask Gemini to validate
    const prompt = `
      You are a KYC verification system.
      The user claims their name is: "${name}".
      The uploaded document contains their identity (ID/passport).
      Check if the name matches the document, and if the face photo is valid.
      Respond only with "APPROVED" or "REJECTED".
    `;

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          data: fileBase64,
          mimeType: file.mimetype,
        },
      },
    ]);

    const aiResponse = result.response.text().trim().toUpperCase();

    if (aiResponse.includes("APPROVED")) {
      // Mark user verified, prevent name changes after KYC
      await db.prepare(
        "UPDATE users SET is_kyc_verified = 1, name = ? WHERE id = ?"
      ).bind(name, userId).run();

      return res.json({ success: true, message: "KYC verified ✅" });
    } else {
      return res.status(400).json({ success: false, message: "KYC rejected ❌" });
    }
  } catch (err) {
    console.error("KYC error:", err);
    res.status(500).json({ error: "Failed to verify KYC" });
  }
});

// === PRODUCTS ===
app.post("/api/products", authMiddleware, async (req, res) => {
  const { name, description, price, quantity } = req.body;
  const userId = req.user.id;

  const user = await db.prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId).first();
  if (!user.is_kyc_verified) {
    return res.status(403).json({ error: "Only verified users can list products" });
  }

  await db.prepare(
    "INSERT INTO products (user_id, name, description, price, quantity) VALUES (?, ?, ?, ?, ?)"
  ).bind(userId, name, description, price, quantity).run();

  res.json({ success: true });
});

app.get("/api/products", async (req, res) => {
  const products = await db.prepare("SELECT * FROM products").all();
  res.json(products.results);
});

// === ORDERS ===
app.post("/api/orders", authMiddleware, async (req, res) => {
  const { product_id, quantity } = req.body;
  const buyerId = req.user.id;

  const product = await db.prepare("SELECT * FROM products WHERE id = ?")
    .bind(product_id).first();
  if (!product) return res.status(404).json({ error: "Product not found" });

  const total = product.price * quantity;

  await db.prepare(
    "INSERT INTO orders (buyer_id, product_id, quantity, total_amount, status, escrow_locked) VALUES (?, ?, ?, ?, 'created', 1)"
  ).bind(buyerId, product_id, quantity, total).run();

  res.json({ success: true });
});

// === HELPERS ===
function fileToBase64(file) {
  return Buffer.from(file.buffer).toString("base64");
}

export default app;
router.get("/api/me", async (req, env, ctx) => {
  try {
    const user = await getUserFromToken(req, env); // helper already exists
    if (!user) return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    return Response.json(user);
  } catch (err) {
    return new Response(JSON.stringify({ message: "Server error" }), { status: 500 });
  }
});