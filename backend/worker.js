// backend/worker.js
import { Router } from "itty-router";
import { D1Database } from "@cloudflare/workers-types";
import * as jose from "jose";

const router = Router();

// JWT secret (generate a secure key!)
const JWT_SECRET = new TextEncoder().encode("super-secret-key-change-me");

// Signup
router.post("/api/signup", async (request, env) => {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }

    const password_hash = await hashPassword(password);

    await env.DB.prepare(
      "INSERT INTO users (name, email, password_hash) VALUES (?1, ?2, ?3)"
    ).bind(name, email, password_hash).run();

    return Response.json({ message: "Signup successful" });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

// Login
router.post("/api/login", async (request, env) => {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }

    const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?1")
      .bind(email)
      .first();

    if (!row) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid password" }), { status: 401 });
    }

    // Create JWT
    const token = await new jose.SignJWT({ id: row.id, email: row.email })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(JWT_SECRET);

    return Response.json({ message: "Login successful", token });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

// Helper: Hash password
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

// Helper: Verify password
async function verifyPassword(password, hash) {
  const hashed = await hashPassword(password);
  return hashed === hash;
}

// Default route
router.all("*", () => new Response("Not Found", { status: 404 }));

export default {
  fetch: (request, env, ctx) => router.handle(request, env, ctx),
};