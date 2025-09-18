import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          navigate("/login");
          return;
        }

        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          localStorage.removeItem("token");
          navigate("/login");
        }
      } catch (err) {
        console.error(err);
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate]);

  if (loading) return <p className="p-6">Loading dashboard...</p>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">User Dashboard</h2>

      {user ? (
        <div className="space-y-4">
          <div className="border rounded p-4 shadow bg-white">
            <p><strong>Name:</strong> {user.name}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p>
              <strong>KYC Status:</strong>{" "}
              {user.is_kyc_verified ? (
                <span className="text-green-600">✅ Verified</span>
              ) : (
                <span className="text-red-600">❌ Not Verified</span>
              )}
            </p>
          </div>

          {!user.is_kyc_verified && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded">
              ⚠️ Your account is not verified yet. Please{" "}
              <Link to="/kyc" className="underline text-blue-600">
                complete KYC
              </Link>{" "}
              to unlock marketplace features.
            </div>
          )}

          {user.is_kyc_verified && (
            <div className="space-y-2">
              <Link
                to="/marketplace"
                className="block px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                🚜 Go to Marketplace
              </Link>
              {user.role === "admin" && (
                <Link
                  to="/admin"
                  className="block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  🛠 Admin Panel
                </Link>
              )}
            </div>
          )}
        </div>
      ) : (
        <p>No user data available.</p>
      )}
    </div>
  );
};

export default Dashboard;