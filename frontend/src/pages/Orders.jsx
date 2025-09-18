import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("token");
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchOrders = async () => {
      try {
        const res = await fetch("/api/orders", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [token, navigate]);

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders(orders.map((o) => (o.id === id ? updated : o)));
      } else {
        alert("❌ Failed to update order");
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p className="p-6">Loading orders...</p>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">📦 My Orders</h2>
      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div
              key={o.id}
              className="border rounded p-4 bg-white shadow flex flex-col md:flex-row justify-between items-start md:items-center"
            >
              <div>
                <p>
                  <span className="font-semibold">Order ID:</span> {o.id}
                </p>
                <p>
                  <span className="font-semibold">Product:</span> {o.product_name}
                </p>
                <p>
                  <span className="font-semibold">Qty:</span> {o.quantity}
                </p>
                <p>
                  <span className="font-semibold">Total:</span> ₦{o.total_amount}
                </p>
                <p>
                  <span className="font-semibold">Status:</span>{" "}
                  <span className="uppercase">{o.status}</span>
                </p>
              </div>

              {/* Buyer can mark order as "paid" */}
              {o.status === "created" && (
                <button
                  onClick={() => handleUpdateStatus(o.id, "paid")}
                  className="mt-2 md:mt-0 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  Pay
                </button>
              )}

              {/* Seller can mark as "shipped" */}
              {o.status === "paid" && (
                <button
                  onClick={() => handleUpdateStatus(o.id, "shipped")}
                  className="mt-2 md:mt-0 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Mark as Shipped
                </button>
              )}

              {/* Buyer can mark as "delivered" */}
              {o.status === "shipped" && (
                <button
                  onClick={() => handleUpdateStatus(o.id, "delivered")}
                  className="mt-2 md:mt-0 bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                >
                  Confirm Delivery
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Orders;