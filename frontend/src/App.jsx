import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'

// Pages — implemented by Frontend Engineer
// import Landing from './pages/Landing'
// import Register from './pages/Register'
// import Login from './pages/Login'
// import Dashboard from './pages/Dashboard'
// import NewOrder from './pages/NewOrder'
// import OrderStatus from './pages/OrderStatus'
// import Download from './pages/Download'

// Placeholder until Frontend Engineer builds pages
const Placeholder = ({ name }) => (
  <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-white mb-2">TailoredTunes</h1>
      <p className="text-purple-400 text-lg">{name} — Building in progress</p>
      <p className="text-gray-500 text-sm mt-4">Frontend Engineer: see TAI-22, TAI-23, TAI-24</p>
    </div>
  </div>
)

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/"              element={<Placeholder name="Landing Page" />} />
        <Route path="/register"      element={<Placeholder name="Register" />} />
        <Route path="/login"         element={<Placeholder name="Login" />} />
        <Route path="/dashboard"     element={<Placeholder name="Dashboard" />} />
        <Route path="/order/new"     element={<Placeholder name="New Order" />} />
        <Route path="/order/:id"     element={<Placeholder name="Order Status" />} />
        <Route path="/order/:id/done" element={<Placeholder name="Download" />} />
        <Route path="*"             element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
