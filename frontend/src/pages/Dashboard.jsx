import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

const STATUS_COLORS = {
  pending: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  generating: 'bg-blue-900/40 text-blue-300 border-blue-700',
  complete: 'bg-green-900/40 text-green-300 border-green-700',
  failed: 'bg-red-900/40 text-red-300 border-red-700',
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/orders')
      .then(res => setOrders(res.data.orders || res.data))
      .catch(() => setError('Failed to load orders.'))
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Tailored<span className="text-purple-500">Tunes</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Your Songs</h1>
            <p className="text-gray-400 text-sm mt-0.5">All your custom tracks in one place</p>
          </div>
          <Link
            to="/order/new"
            className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            + Create New Song
          </Link>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">🎵</div>
            <h2 className="text-xl font-semibold text-white mb-2">No songs yet</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-sm">
              Create your first custom track — describe your vibe and our AI will compose it in minutes.
            </p>
            <Link
              to="/order/new"
              className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-6 py-3 rounded-lg text-sm transition-colors"
            >
              Create Your First Song
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {orders.map(order => (
              <div
                key={order.id}
                className="bg-[#111] border border-gray-800 rounded-xl p-5 flex items-center justify-between hover:border-gray-700 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <h3 className="text-white font-semibold truncate">{order.title}</h3>
                    <span
                      className={`text-xs font-medium border rounded-full px-2.5 py-0.5 ${STATUS_COLORS[order.status] || STATUS_COLORS.pending}`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {order.genre && (
                      <span className="bg-gray-800 text-gray-300 text-xs rounded-full px-2.5 py-0.5">
                        {order.genre}
                      </span>
                    )}
                    {order.mood && (
                      <span className="bg-gray-800 text-gray-300 text-xs rounded-full px-2.5 py-0.5">
                        {order.mood}
                      </span>
                    )}
                    {order.tier && (
                      <span className="bg-purple-900/40 text-purple-300 text-xs rounded-full px-2.5 py-0.5 border border-purple-800">
                        {order.tier}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-4 shrink-0">
                  {order.status === 'complete' ? (
                    <Link
                      to={`/order/${order.id}/done`}
                      className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                      Download
                    </Link>
                  ) : order.status === 'generating' ? (
                    <Link
                      to={`/order/${order.id}`}
                      className="border border-purple-600 text-purple-300 hover:bg-purple-900/20 px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                      View progress
                    </Link>
                  ) : order.status === 'failed' ? (
                    <span className="text-red-400 text-sm">Failed</span>
                  ) : (
                    <span className="text-gray-500 text-sm">Pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
