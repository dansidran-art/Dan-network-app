import Dashboard from "./pages/Dashboard";

<Routes>
  <Route path="/signup" element={<Signup />} />
  <Route path="/login" element={<Login />} />
  <Route path="/kyc" element={<KYC />} />
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/" element={<h1>Welcome to AgriNetwork 🚜</h1>} />
</Routes>