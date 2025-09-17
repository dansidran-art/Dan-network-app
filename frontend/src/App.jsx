// frontend/src/App.jsx
import React, { useState } from "react";

function App() {
  const [page, setPage] = useState("signup"); // "signup" | "login"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

  async function handleSignup(e) {
    e.preventDefault();
    setMessage("Loading...");

    try {
      const res = await fetch(`${API_BASE}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage("✅ Signup successful");
      } else {
        setMessage("❌ " + data.error);
      }
    } catch (err) {
      setMessage("❌ " + err.message);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setMessage("Loading...");

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage("✅ Login successful. Token: " + data.token);
        localStorage.setItem("token", data.token);
      } else {
        setMessage("❌ " + data.error);
      }
    } catch (err) {
      setMessage("❌ " + err.message);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>🌱 AgriNetwork</h1>

      <div style={{ marginBottom: "1rem" }}>
        <button onClick={() => setPage("signup")} disabled={page === "signup"}>
          Signup
        </button>
        <button onClick={() => setPage("login")} disabled={page === "login"}>
          Login
        </button>
      </div>

      {page === "signup" && (
        <form onSubmit={handleSignup}>
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <br />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <br />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <br />
          <button type="submit">Sign Up</button>
        </form>
      )}

      {page === "login" && (
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <br />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <br />
          <button type="submit">Login</button>
        </form>
      )}

      <p style={{ marginTop: "1rem" }}>{message}</p>
    </div>
  );
}

export default App;