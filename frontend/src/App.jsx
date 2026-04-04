import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import Landing from './pages/Landing'
import Register from './pages/Register'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewOrder from './pages/NewOrder'
import OrderStatus from './pages/OrderStatus'
import Download from './pages/Download'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/"               element={<Landing />} />
        <Route path="/register"       element={<Register />} />
        <Route path="/login"          element={<Login />} />
        <Route path="/dashboard"      element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/order/new"      element={<PrivateRoute><NewOrder /></PrivateRoute>} />
        <Route path="/order/:id"      element={<PrivateRoute><OrderStatus /></PrivateRoute>} />
        <Route path="/order/:id/done" element={<PrivateRoute><Download /></PrivateRoute>} />
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
