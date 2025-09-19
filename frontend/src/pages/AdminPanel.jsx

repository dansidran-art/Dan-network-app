import React, { useEffect, useState } from "react";

const AdminPanel = ({ user }) => {
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    if (user?.role === "admin") {
      fetch("/api/admin/users", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
        .then(res => res.json())
        .then(setUsers);

      fetch("/api/admin/products", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
        .then(res => res.json())
        .then(setProducts);
    }
  }, [user]);

  if (!user || user.role !== "admin") return <p>Access denied</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>

      <h2 className="text-xl font-semibold mt-6">Users</h2>
      <ul>
        {users.map(u => (
          <li key={u.id} className="flex justify-between border-b p-2">
            {u.name} ({u.email}) - {u.role} {u.is_kyc_verified ? "✅" : "❌"}
            <button
              onClick={() =>
                fetch(`/api/admin/block-user/${u.id}`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                }).then(() => setUsers(users.filter(us => us.id !== u.id)))
              }
              className="bg-red-500 text-white px-2 py-1 rounded"
            >
              Block
            </button>
          </li>
        ))}
      </ul>

      <h2 className="text-xl font-semibold mt-6">Products</h2>
      <ul>
        {products.map(p => (
          <li key={p.id} className="border-b p-2">
            {p.name} – ${p.price}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AdminPanel;