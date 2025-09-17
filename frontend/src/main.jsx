// frontend/src/main.jsx
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [productForm, setProductForm] = useState({ name: "", price: "", quantity: "" });
  const [kyc, setKyc] = useState({ id_image: "", selfie: "" });
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    if (token) fetch("/me", { headers: authHeaders }).then(r => r.json()).then(d => setMe(d.user)).catch(()=>setMe(null));
    fetch("/products").then(r => r.json()).then(setProducts);
  }, [token]);

  async function signup() {
    const res = await fetch("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem("token", data.token);
      setToken(data.token);
    } else alert(data.error || "Signup failed");
  }

  async function login() {
    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email, password: form.password }),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem("token", data.token);
      setToken(data.token);
    } else alert(data.error || "Login failed");
  }

  async function submitKyc() {
    const res = await fetch("/kyc/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(kyc),
    });
    const data = await res.json();
    if (data.success || data.user?.is_kyc_verified) {
      alert("KYC approved");
      setMe(data.user);
    } else alert(data.error || "KYC failed");
  }

  async function addProduct() {
    const res = await fetch("/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(productForm),
    });
    const data = await res.json();
    if (data.success) {
      setProducts(await (await fetch("/products")).json());
      setProductForm({ name: "", price: "", quantity: "" });
    } else alert(data.error || "Add product failed");
  }

  async function buy(productId) {
    const res = await fetch("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ product_id: productId, quantity: 1 }),
    });
    const data = await res.json();
    if (data.success) alert("Order created");
    else alert(data.error || "Order failed");
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1rem" }}>
      <h1>🌾 AgriNetwork</h1>

      {!token ? (
        <div>
          <h3>Signup / Login</h3>
          <input placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><br/>
          <input placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><br/>
          <input placeholder="Password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} type="password"/><br/>
          <button onClick={signup}>Signup</button>
          <button onClick={login}>Login</button>
        </div>
      ) : (
        <div>
          <h3>Welcome, {me?.name || "user"}</h3>
          <p>KYC: {me?.is_kyc_verified ? "Verified" : "Not verified"}</p>
          <h4>Submit KYC (provide image URLs or base64)</h4>
          <input placeholder="ID image URL" value={kyc.id_image} onChange={e=>setKyc({...kyc,id_image:e.target.value})}/><br/>
          <input placeholder="Selfie URL" value={kyc.selfie} onChange={e=>setKyc({...kyc,selfie:e.target.value})}/><br/>
          <button onClick={submitKyc}>Submit KYC</button>
          <hr/>
          <h3>Add Product (KYC required)</h3>
          <input placeholder="Product name" value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})}/>
          <input placeholder="Price" value={productForm.price} onChange={e=>setProductForm({...productForm,price:e.target.value})}/>
          <input placeholder="Quantity" value={productForm.quantity} onChange={e=>setProductForm({...productForm,quantity:e.target.value})}/>
          <button onClick={addProduct}>Add Product</button>
        </div>
      )}

      <h2>Marketplace</h2>
      <ul>
        {products && products.map(p=>(
          <li key={p.id}>
            <strong>{p.name}</strong> — ${p.price} ({p.quantity}) by {p.seller_name || "seller"}
            <button style={{marginLeft:10}} onClick={()=>buy(p.id)}>Buy 1</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);