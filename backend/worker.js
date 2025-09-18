// Marketplace (all available products, from verified users)
router.get("/api/marketplace", async (req, env) => {
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.name as seller_name 
     FROM products p 
     JOIN users u ON p.user_id = u.id 
     WHERE u.is_kyc_verified = 1 AND p.quantity > 0`
  ).all();
  return Response.json(results);
});

// Get all orders for logged-in user
router.get("/api/orders", async (req, env) => {
  const user = await getUserFromToken(req, env);
  if (!user) return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });

  const { results } = await env.DB.prepare(
    `SELECT o.*, p.name as product_name 
     FROM orders o 
     JOIN products p ON o.product_id = p.id 
     WHERE o.buyer_id = ?`
  ).bind(user.id).all();

  return Response.json(results);
});

// Place an order
router.post("/api/orders", async (req, env) => {
  const user = await getUserFromToken(req, env);
  if (!user) return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });

  const { product_id, quantity } = await req.json();
  const { results } = await env.DB.prepare(
    "SELECT * FROM products WHERE id = ?"
  ).bind(product_id).all();

  if (results.length === 0) {
    return new Response(JSON.stringify({ message: "Product not found" }), { status: 404 });
  }

  const product = results[0];
  if (product.quantity < quantity) {
    return new Response(JSON.stringify({ message: "Not enough stock" }), { status: 400 });
  }

  const total_amount = product.price * quantity;

  const { lastInsertRowid } = await env.DB.prepare(
    "INSERT INTO orders (buyer_id, product_id, quantity, total_amount, status, escrow_locked) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(user.id, product_id, quantity, total_amount, "created", 1).run();

  // Reduce product stock
  await env.DB.prepare(
    "UPDATE products SET quantity = quantity - ? WHERE id = ?"
  ).bind(quantity, product_id).run();

  return Response.json({
    id: lastInsertRowid,
    product_name: product.name,
    quantity,
    total_amount,
    status: "created",
  });
});
// Update order status (seller, buyer, or admin)
router.post("/api/orders/:id/status", async (req, env) => {
  const user = await getUserFromToken(req, env);
  if (!user) return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });

  const { id } = req.params;
  const { new_status } = await req.json();

  // Get order details
  const { results } = await env.DB.prepare(
    "SELECT o.*, p.user_id as seller_id FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?"
  ).bind(id).all();

  if (results.length === 0) {
    return new Response(JSON.stringify({ message: "Order not found" }), { status: 404 });
  }

  const order = results[0];

  // Permission logic
  if (user.role === "admin") {
    // Admin can set any status
  } else if (user.id === order.seller_id && new_status === "shipped") {
    // Seller can only mark as shipped
  } else if (user.id === order.buyer_id && new_status === "delivered") {
    // Buyer can confirm delivery
  } else {
    return new Response(JSON.stringify({ message: "Not allowed to change this order status" }), { status: 403 });
  }

  await env.DB.prepare(
    "UPDATE orders SET status = ? WHERE id = ?"
  ).bind(new_status, id).run();

  return Response.json({ success: true, message: `Order updated to ${new_status}` });
});