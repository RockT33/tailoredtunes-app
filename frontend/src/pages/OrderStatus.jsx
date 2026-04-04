import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'

const STEPS = [
  { key: 'analyzing', label: 'Analyzing your request' },
  { key: 'composing', label: 'Composing your track' },
  { key: 'mastering', label: 'Mastering audio' },
  { key: 'ready', label: 'Ready!' },
]

// Map API status → step index
function statusToStep(status) {
  if (status === 'complete') return 3
  if (status === 'generating') return 2
  if (status === 'pending') return 0
  return 0
}

function WaveformAnimation() {
  const bars = Array.from({ length: 20 }, (_, i) => i)
  return (
    <div className="flex items-end justify-center gap-1 h-16 my-6">
      {bars.map(i => (
        <div
          key={i}
          className="w-2 bg-purple-500 rounded-full opacity-80"
          style={{
            height: `${20 + Math.sin(i * 0.8) * 15}px`,
            animation: `wave 1.2s ease-in-out ${i * 0.06}s infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes wave {
          from { height: 8px; opacity: 0.4; }
          to { height: 48px; opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default function OrderStatus() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)
  const pollRef = useRef(null)

  const fetchStatus = async () => {
    try {
      const res = await api.get(`/orders/${id}/status`)
      const data = res.data
      setOrder(data)

      if (data.status === 'complete') {
        clearInterval(pollRef.current)
        navigate(`/order/${id}/done`)
      } else if (data.status === 'failed') {
        clearInterval(pollRef.current)
      }
    } catch {
      setError('Unable to fetch order status.')
    }
  }

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, 10000)
    return () => clearInterval(pollRef.current)
  }, [id])

  const handleRetry = async () => {
    setRetrying(true)
    setError('')
    try {
      await api.post(`/orders/${id}/retry`)
      setOrder(o => ({ ...o, status: 'pending' }))
      pollRef.current = setInterval(fetchStatus, 10000)
    } catch {
      setError('Retry failed. Please contact support.')
    } finally {
      setRetrying(false)
    }
  }

  const step = order ? statusToStep(order.status) : 0

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Tailored<span className="text-purple-500">Tunes</span>
          </Link>
          <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm mb-6 text-center">
              {error}
            </div>
          )}

          {order?.status === 'failed' ? (
            <div className="bg-[#111] border border-red-800 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-4">❌</div>
              <h2 className="text-xl font-bold text-white mb-2">Generation Failed</h2>
              <p className="text-gray-400 text-sm mb-6">
                Something went wrong while creating your track. You can try again below.
              </p>
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="bg-purple-700 hover:bg-purple-600 disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 mx-auto"
              >
                {retrying && (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {retrying ? 'Retrying…' : 'Retry Generation'}
              </button>
            </div>
          ) : (
            <div className="bg-[#111] border border-gray-800 rounded-2xl p-8 text-center">
              {order && (
                <p className="text-gray-400 text-sm mb-1">
                  {order.title && <span className="text-white font-medium">"{order.title}"</span>}
                </p>
              )}
              <h2 className="text-xl font-bold text-white mt-2 mb-1">
                Your track is being crafted…
              </h2>
              <p className="text-gray-500 text-sm mb-4">
                This usually takes 2–5 minutes. We'll take you straight to the download when it's ready.
              </p>

              <WaveformAnimation />

              {/* Progress steps */}
              <div className="mt-6 space-y-3">
                {STEPS.map((s, idx) => {
                  const isDone = idx < step
                  const isActive = idx === step
                  return (
                    <div
                      key={s.key}
                      className={`flex items-center gap-3 rounded-lg px-4 py-2.5 ${
                        isActive ? 'bg-purple-900/30 border border-purple-700/50' : ''
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                          isDone
                            ? 'bg-green-600 text-white'
                            : isActive
                            ? 'bg-purple-600 text-white animate-pulse'
                            : 'bg-gray-800 text-gray-600'
                        }`}
                      >
                        {isDone ? '✓' : idx + 1}
                      </div>
                      <span
                        className={`text-sm ${
                          isDone ? 'text-gray-400 line-through' : isActive ? 'text-white font-medium' : 'text-gray-600'
                        }`}
                      >
                        {s.label}
                      </span>
                      {isActive && (
                        <span className="ml-auto w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
