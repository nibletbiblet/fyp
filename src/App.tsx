import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import RegisterPage from './pages/RegisterPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CheckoutPage from './pages/CheckoutPage'
import KycPage from './pages/KycPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<KycPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/kyc" element={<KycPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/checkout/:paymentId" element={<CheckoutPage />} />
    </Routes>
  )
}

export default App

