import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import KYC from "./pages/KYC";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/kyc" element={<KYC />} />
        <Route path="/" element={<h1>Welcome to AgriNetwork 🚜</h1>} />
      </Routes>
    </Router>
  );
}

export default App;