export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle GET /
    if (url.pathname === "/" && request.method === "GET") {
      return new Response("🚀 Cloudflare App with D1 is running!", {
        headers: { "content-type": "text/plain" },
      });
    }

    // Handle GET /users
    if (url.pathname === "/users" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM users").all();
      return Response.json(results);
    }

    // Handle POST /users
    if (url.pathname === "/users" && request.method === "POST") {
      const { name } = await request.json();
      if (!name) {
        return new Response("Name is required", { status: 400 });
      }

      await env.DB.prepare("INSERT INTO users (name) VALUES (?)").bind(name).run();
      return new Response("✅ User added!", { status: 201 });
    }

    // Not found
    return new Response("Not found", { status: 404 });
  },
};