import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState("");

  // Fetch users
  useEffect(() => {
    fetch("/users")
      .then((res) => res.json())
      .then(setUsers)
      .catch(console.error);
  }, []);

  // Add user
  const addUser = async () => {
    if (!name) return;
    await fetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    const res = await fetch("/users");
    setUsers(await res.json());
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem" }}>
      <h1>🚀 Cloudflare App</h1>
      <p>Simple full-stack demo with D1 + Worker</p>

      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter name"
        />
        <button onClick={addUser}>Add User</button>
      </div>

      <h2>Users</h2>
      <ul>
        {users.map((u) => (
          <li key={u.id}>{u.name} — {u.created_at}</li>
        ))}
      </ul>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);