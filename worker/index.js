// worker/index.js
// Cloudflare Worker module-style

const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const textResponse = (txt, status = 200) => new Response(txt, { status, headers: { "Content-Type": "text/plain" } });

// --- Helpers: base64url, HMAC SHA256 (for simple JWT HS256) ---
const encoder = (s) => new TextEncoder().encode(s);
const base64Url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder(message));
  return new Uint8Array(sig);
}

async function jwtSign(payloadObj, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { ...payloadObj, iat: Math.floor(Date.now() / 1000) };
  const headerB = base64Url(encoder(JSON.stringify(header)));
  const payloadB = base64Url(encoder(JSON.stringify(payload)));
  const data = `${headerB}.${payloadB}`;
  const sigBuf = await hmacSha256(secret, data);
  const sigB = base64Url(sigBuf);
  return `${data}.${sigB}`;
}

async function jwtVerify(token, secret) {
  try {
    const [headerB, payloadB, sigB] = token.split(".");
    if (!headerB || !payloadB || !sigB) return null;
    const data = `${headerB}.${payloadB}`;
    const sigBuf = await hmacSha256(secret, data);
    const expected = base64Url(sigBuf);
    if (expected !== sigB) return null;
    const payloadJson = atob(payloadB.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payloadJson);
  } catch (e) {
    return null;
  }
}

async function hashPassword(password, salt = "") {
  // Simple SHA-256 hash for demo. In production use a proper KDF (bcrypt/PBKDF2).
  const digest = await crypto.subtle.digest("SHA-256", encoder(password + salt));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Notifications helper (using KV if available) ---
async function pushNotification(env, userId, message) {
  // store in KV under key `notif:<userId>` as JSON array (limited size)
  try {
    if (env.APP_KV) {
      const key = `notif:${userId}`;
      const raw = await env.APP_KV.get(key);
      const arr = raw ? JSON.parse(raw) : [];
      arr.unshift({ message, created_at: new Date().toISOString(), read: false });
      // keep most recent 50
      await env.APP_KV.put(key, JSON.stringify(arr.slice(0, 50)));
    } else {
      // fallback: insert into D1 notifications table
      await env.DB.prepare("INSERT INTO notifications (user_id, message) VALUES (?, ?)").bind(userId, message).run();
    }
  } catch (e) {
    // non-fatal
    console.error("pushNotification error", e);
  }
}

// --- Placeholder Gemini verify function ---
// This function expects GEMINI_API_KEY as a secret binding (set in Wrangler).
// It sends the ID + selfie (URLs or base64) to an external AI endpoint (you must set up).
async function verifyWithGemini(env, idImageUrlOrBase64, selfieUrlOrBase64) {
  // This is a placeholder implementation — replace with your provider's API call format.
  try {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) return false;

    // Example: send a POST to your verification endpoint (replace URL)
    const resp = await fetch("https://example-kyc-verify.example/api/vision-verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        id_image: idImageUrlOrBase64,
        selfie: selfieUrlOrBase64,
        task: "verify_same_person",
      }),
    });
    if (!resp.ok) return false;
    const body = await resp.json();
    // expected: { result: "APPROVED" } or { result: "REJECTED" }
    return body?.result === "APPROVED" || body?.approved === true;
  } catch (e) {
    console.error("verifyWithGemini error", e);
    return false;
  }
}

// --- DB helpers ---
async function getUserByEmail(env, email) {
  const { results } = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).all();
  return results && results[0] ? results[0] : null;
}

async function getUserById(env, id) {
  const { results } = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).all();
  return results && results[0] ? results[0] : null;
}

// --- request router ---
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      // helpers for auth
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      let authUser = null;
      if (token) {
        const payload = await jwtVerify(token, env.JWT_SECRET || "");
        if (payload?.id) {
          authUser = await getUserById(env, payload.id);
        }
      }

      // root
      if (path === "/" && request.method === "GET") {
        return jsonResponse({ ok: true, message: "AgriNetwork Worker is running" });
      }

      // ----- AUTH -----
      if (path === "/auth/signup" && request.method === "POST") {
        const body = await request.json();
        if (!body.email || !body.name || !body.password) return jsonResponse({ error: "Missing fields" }, 400);
        if (await getUserByEmail(env, body.email)) return jsonResponse({ error: "Email already exists" }, 400);
        const hash = await hashPassword(body.password);
        await env.DB.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").bind(body.name, body.email, hash).run();
        const user = await getUserByEmail(env, body.email);
        const jwtToken = await jwtSign({ id: user.id }, env.JWT_SECRET || "dev-secret");
        return jsonResponse({ token: jwtToken, user });
      }

      if (path === "/auth/login" && request.method === "POST") {
        const body = await request.json();
        if (!body.email || !body.password) return jsonResponse({ error: "Missing fields" }, 400);
        const user = await getUserByEmail(env, body.email);
        if (!user) return jsonResponse({ error: "Invalid credentials" }, 401);
        const hash = await hashPassword(body.password);
        if (hash !== user.password_hash) return jsonResponse({ error: "Invalid credentials" }, 401);
        const jwtToken = await jwtSign({ id: user.id }, env.JWT_SECRET || "dev-secret");
        return jsonResponse({ token: jwtToken, user });
      }

      // GET /me
      if (path === "/me" && request.method === "GET") {
        if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);
        return jsonResponse({ user: authUser });
      }

      // ----- KYC -----
      // POST /kyc/verify with { id_image, selfie } (URLs or base64). This will auto-approve when provider approves.
      if (path === "/kyc/verify" && request.method === "POST") {
        if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);
        const body = await request.json();
        if (!body.id_image || !body.selfie) return jsonResponse({ error: "Missing images" }, 400);

        const approved = await verifyWithGemini(env, body.id_image, body.selfie);
        if (!approved) return jsonResponse({ error: "KYC failed" }, 403);

        await env.DB.prepare("UPDATE users SET is_kyc_verified = 1 WHERE id = ?").bind(authUser.id).run();
        // create subaccount automatically
        await env.DB.prepare("INSERT INTO subaccounts (user_id, name) VALUES (?, ?)").bind(authUser.id, `${authUser.name}-sub`).run();
        await pushNotification(env, authUser.id, "KYC approved and subaccount created.");

        const updated = await getUserById(env, authUser.id);
        return jsonResponse({ success: true, user: updated });
      }

      // ----- PRODUCTS -----
      if (path === "/products" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT p.*, u.name as seller_name FROM products p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC").all();
        return jsonResponse(results);
      }
      if (path === "/products" && request.method === "POST") {
        if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);
        if (!authUser.is_kyc_verified) return jsonResponse({ error: "KYC required to list products" }, 403);
        const body = await request.json();
        if (!body.name || body.price == null || body.quantity == null) return jsonResponse({ error: "Missing fields" }, 400);
        await env.DB.prepare("INSERT INTO products (user_id, name, description, price, quantity) VALUES (?, ?, ?, ?, ?)").bind(authUser.id, body.name, body.description || "", body.price, body.quantity).run();
        await pushNotification(env, authUser.id, "Product listed successfully.");
        return jsonResponse({ success: true });
      }

      // ----- ORDERS -----
      if (path === "/orders" && request.method === "POST") {
        if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);
        const body = await request.json();
        if (!body.product_id || !body.quantity) return jsonResponse({ error: "Missing fields" }, 400);
        // fetch product
        const { results: prodRes } = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(body.product_id).all();
        const product = prodRes && prodRes[0];
        if (!product) return jsonResponse({ error: "Product not found" }, 404);
        if (product.quantity < body.quantity) return jsonResponse({ error: "Not enough stock" }, 400);
        const total = product.price * body.quantity;
        // create order (we simulate escrow_locked when buyer "pays")
        await env.DB.prepare("INSERT INTO orders (buyer_id, product_id, quantity, total_amount, status, escrow_locked) VALUES (?, ?, ?, ?, ?, ?)").bind(authUser.id, product.id, body.quantity, total, "created", 0).run();
        // notify seller
        await pushNotification(env, product.user_id, `New order created for ${product.name}`);
        return jsonResponse({ success: true });
      }

      // Get orders for a user or all for admin
      if (path === "/orders" && request.method === "GET") {
        if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);
        // admin sees all
        if (authUser.role === "admin") {
          const { results } = await env.DB.prepare("SELECT o.*, u.name as buyer_name, p.name as product_name FROM orders o LEFT JOIN users u ON o.buyer_id = u.id LEFT JOIN products p ON o.product_id = p.id ORDER BY o.created_at DESC").all();
          return jsonResponse(results);
        } else {
          const { results } = await env.DB.prepare("SELECT o.*, p.name as product_name FROM orders o LEFT JOIN products p ON o.product_id = p.id WHERE o.buyer_id = ? OR p.user_id = ? ORDER BY o.created_at DESC").bind(authUser.id, authUser.id).all();
          return jsonResponse(results);
        }
      }

      // PATCH /orders/:id?action=pay|confirm_shipment|confirm_receive|release|open_dispute|refund
      if (path.startsWith("/orders/") && request.method === "POST") {
        if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);
        const parts = path.split("/");
        const orderId = parts[2];
        const action = url.searchParams.get("action");
        if (!orderId || !action) return jsonResponse({ error: "Missing order id or action" }, 400);

        const { results: ordRes } = await env.DB.prepare("SELECT o.*, p.user_id as seller_id, p.name as product_name FROM orders o LEFT JOIN products p ON o.product_id = p.id WHERE o.id = ?").bind(orderId).all();
        const order = ordRes && ordRes[0];
        if (!order) return jsonResponse({ error: "Order not found" }, 404);

        // handle actions with permission checks
        if (action === "pay") {
          if (order.buyer_id !== authUser.id) return jsonResponse({ error: "Only buyer can pay" }, 403);
          if (order.status !== "created") return jsonResponse({ error: "Invalid order state" }, 400);
          // simulate escrow locking
          await env.DB.prepare("UPDATE orders SET status = 'paid', escrow_locked = 1 WHERE id = ?").bind(orderId).run();
          await pushNotification(env, order.seller_id, `Order #${orderId} has been paid; escrow locked.`);
          return jsonResponse({ success: true });
        }

        if (action === "confirm_shipment") {
          if (order.seller_id !== authUser.id) return jsonResponse({ error: "Only seller can confirm shipment" }, 403);
          if (order.status !== "paid") return jsonResponse({ error: "Invalid order state" }, 400);
          await env.DB.prepare("UPDATE orders SET status = 'shipped' WHERE id = ?").bind(orderId).run();
          await pushNotification(env, order.buyer_id, `Order #${orderId} marked shipped by seller.`);
          return jsonResponse({ success: true });
        }

        if (action === "confirm_receive") {
          if (order.buyer_id !== authUser.id) return jsonResponse({ error: "Only buyer can confirm receipt" }, 403);
          if (order.status !== "shipped") return jsonResponse({ error: "Invalid order state" }, 400);
          // buyer confirms -> release funds (simulate)
          await env.DB.prepare("UPDATE orders SET status = 'delivered', escrow_locked = 0 WHERE id = ?").bind(orderId).run();
          await pushNotification(env, order.seller_id, `Order #${orderId} delivered; funds released.`);
          return jsonResponse({ success: true });
        }

        if (action === "open_dispute") {
          if (order.buyer_id !== authUser.id && order.seller_id !== authUser.id) return jsonResponse({ error: "Only participants can open dispute" }, 403);
          await env.DB.prepare("UPDATE orders SET status = 'disputed' WHERE id = ?").bind(orderId).run();
          await pushNotification(env, null, `Order #${orderId} opened dispute`); // broadcast
          return jsonResponse({ success: true });
        }

        if (action === "admin_release") {
          // admin override: release funds
          if (authUser.role !== "admin") return jsonResponse({ error: "Admin only" }, 403);
          await env.DB.prepare("UPDATE orders SET status = 'delivered', escrow_locked = 0 WHERE id = ?").bind(orderId).run();
          await pushNotification(env, order.buyer_id, `Admin released funds for order #${orderId}.`);
          await pushNotification(env, order.seller_id, `Admin released funds for order #${orderId}.`);
          return jsonResponse({ success: true });
        }

        if (action === "admin_refund") {
          if (authUser.role !== "admin") return jsonResponse({ error: "Admin only" }, 403);
          await env.DB.prepare("UPDATE orders SET status = 'refunded', escrow_locked = 0 WHERE id = ?").bind(orderId).run();
          await pushNotification(env, order.buyer_id, `Admin refunded order #${orderId}.`);
          await pushNotification(env, order.seller_id, `Admin refunded order #${orderId}.`);
          return jsonResponse({ success: true });
        }

        return jsonResponse({ error: "Unknown action or not permitted" }, 400);
      }

      // ----- NOTIFICATIONS (KV read)
      if (path === "/notifications" && request.method === "GET") {
        if (!authUser) return jsonResponse({ error: "Unauthorized" }, 401);
        if (env.APP_KV) {
          const raw = await env.APP_KV.get(`notif:${authUser.id}`) || "[]";
          return jsonResponse(JSON.parse(raw));
        } else {
          const { results } = await env.DB.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(authUser.id).all();
          return jsonResponse(results);
        }
      }

      // ----- AI Assistant (crop disease detection via satellite image + GPS)
      // POST /ai/detect { satellite_image_url, lat, lon }
      if (path === "/ai/detect" && request.method === "POST") {
        const body = await request.json();
        if (!body.satellite_image_url || !body.lat || !body.lon) {
          return jsonResponse({ error: "Missing satellite_image_url or coordinates" }, 400);
        }
        // This is a placeholder: you must supply env.GEMINI_API_KEY and implement your provider call
        const detected = await detectCropDiseaseWithGemini(env, body.satellite_image_url, body.lat, body.lon);
        return jsonResponse({ result: detected ? "problem" : "healthy", details: detected || null });
      }

      if (path === "/health" && request.method === "GET") {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (err) {
      console.error(err);
      return jsonResponse({ error: "Server error", detail: String(err) }, 500);
    }
  },
};

// --- Auxiliary AI helper for crop detection (placeholder)
async function detectCropDiseaseWithGemini(env, imageUrl, lat, lon) {
  // Place a stub: call an external AI service if configured
  try {
    const key = env.GEMINI_API_KEY;
    if (!key) return { note: "no-api-key" };
    // Example request (replace with actual provider)
    const resp = await fetch("https://example-vision-ai/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ image: imageUrl, lat, lon }),
    });
    if (!resp.ok) return { error: "provider-error", status: resp.status };
    return await resp.json();
  } catch (e) {
    return { error: "exception", detail: String(e) };
  }
}