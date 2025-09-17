export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Example: Store & get from KV
    if (url.pathname === "/kv") {
      await env.MY_KV.put("greeting", "Hello from KV!");
      const msg = await env.MY_KV.get("greeting");
      return new Response(msg);
    }

    // Example: Insert & query from D1
    if (url.pathname === "/users") {
      if (request.method === "POST") {
        const { name } = await request.json();
        await env.DB.prepare("INSERT INTO users (name) VALUES (?)").bind(name).run();
        return new Response("User added ✅");
      }
      const { results } = await env.DB.prepare("SELECT * FROM users").all();
      return Response.json(results);
    }

    // Example: Upload to R2
    if (url.pathname === "/upload" && request.method === "PUT") {
      const objectName = url.searchParams.get("name") || "file.txt";
      await env.MY_BUCKET.put(objectName, request.body);
      return new Response("Uploaded to R2 ✅");
    }

    return new Response("Hello from Fullstack Worker 🚀");
  },
};