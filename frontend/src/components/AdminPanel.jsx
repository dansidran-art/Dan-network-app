import React, { useEffect, useState } from "react";

export default function AdminPanel({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787";

  // Fetch all users
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error("Error fetching users", err);
    }
    setLoading(false);
  };

  // Update role
  const updateRole = async (id, role) => {
    await fetch(`${API_BASE}/admin/users/${id}/role`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ role }),
    });
    fetchUsers();
  };

  // Approve KYC
  const approveKyc = async (id) => {
    await fetch(`${API_BASE}/admin/users/${id}/approve-kyc`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    fetchUsers();
  };

  // Delete user
  const deleteUser = async (id) => {
    await fetch(`${API_BASE}/admin/users/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    fetchUsers();
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  if (!user || user.role !== "admin") {
    return <p className="p-4 text-red-600">❌ You are not an admin.</p>;
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">👑 Admin Panel</h2>
      {loading ? (
        <p>Loading users...</p>
      ) : (
        <table className="w-full border">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">ID</th>
              <th className="p-2 border">Name</th>
              <th className="p-2 border">Email</th>
              <th className="p-2 border">Role</th>
              <th className="p-2 border">KYC</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="p-2 border">{u.id}</td>
                <td className="p-2 border">{u.name}</td>
                <td className="p-2 border">{u.email}</td>
                <td className="p-2 border">{u.role}</td>
                <td className="p-2 border">
                  {u.is_kyc_verified ? "✅ Verified" : "❌ Pending"}
                </td>
                <td className="p-2 border space-x-2">
                  <button
                    onClick={() => updateRole(u.id, "admin")}
                    className="bg-blue-500 text-white px-2 py-1 rounded"
                  >
                    Make Admin
                  </button>
                  <button
                    onClick={() => approveKyc(u.id)}
                    className="bg-green-500 text-white px-2 py-1 rounded"
                  >
                    Approve KYC
                  </button>
                  <button
                    onClick={() => deleteUser(u.id)}
                    className="bg-red-500 text-white px-2 py-1 rounded"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}