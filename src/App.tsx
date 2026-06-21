import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import RegisterPage from './pages/RegisterPage'
import CheckEmailPage from './pages/CheckEmailPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CheckoutPage from './pages/CheckoutPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/check-email" element={<CheckEmailPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/checkout/:paymentId" element={<CheckoutPage />} />
    </Routes>
  )
}

export default App
