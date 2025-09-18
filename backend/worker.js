// Get all products for logged-in user
router.get("/api/products", async (req, env) => {
  const user = await getUserFromToken(req, env);
  if (!user) return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });

  const { results } = await env.DB.prepare(
    "SELECT * FROM products WHERE user_id = ?"
  ).bind(user.id).all();

  return Response.json(results);
});

// Add a new product
router.post("/api/products", async (req, env) => {
  const user = await getUserFromToken(req, env);
  if (!user) return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
  if (!user.is_kyc_verified) {
    return new Response(JSON.stringify({ message: "KYC verification required" }), { status: 403 });
  }

  const { name, description, price, quantity } = await req.json();

  const { lastInsertRowid } = await env.DB.prepare(
    "INSERT INTO products (user_id, name, description, price, quantity) VALUES (?, ?, ?, ?, ?)"
  ).bind(user.id, name, description || "", price, quantity).run();

  return Response.json({
    id: lastInsertRowid,
    user_id: user.id,
    name,
    description,
    price,
    quantity,
  });
});