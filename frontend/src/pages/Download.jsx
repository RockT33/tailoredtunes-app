import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../services/api'

const TIER_COLORS = {
  basic: 'bg-gray-800 text-gray-300 border-gray-700',
  pro: 'bg-purple-900/40 text-purple-300 border-purple-700',
  premium: 'bg-amber-900/40 text-amber-300 border-amber-700',
}

export default function Download() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get(`/orders/${id}`)
      .then(res => setOrder(res.data.order))
      .catch(() => setError('Failed to load order details.'))
      .finally(() => setLoading(false))
  }, [id])

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
        <p className="text-red-400 mb-4">{error || 'Order not found.'}</p>
        <Link to="/dashboard" className="text-purple-400 hover:text-purple-300 text-sm">
          ← Back to Dashboard
        </Link>
      </div>
    )
  }

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
          {/* Success header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-900/40 border border-green-700 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
              🎶
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Your Track is Ready!</h1>
            <p className="text-gray-400 text-sm">Download your custom song below.</p>
          </div>

          <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
            {/* Song info */}
            <div className="mb-5">
              <h2 className="text-xl font-bold text-white mb-2">{order.title}</h2>
              <div className="flex flex-wrap gap-2">
                {order.genre && (
                  <span className="bg-gray-800 text-gray-300 text-xs rounded-full px-2.5 py-0.5 border border-gray-700">
                    {order.genre}
                  </span>
                )}
                {order.mood && (
                  <span className="bg-gray-800 text-gray-300 text-xs rounded-full px-2.5 py-0.5 border border-gray-700">
                    {order.mood}
                  </span>
                )}
                {order.tier && (
                  <span className={`text-xs rounded-full px-2.5 py-0.5 border ${TIER_COLORS[order.tier] || TIER_COLORS.basic}`}>
                    {order.tier}
                  </span>
                )}
              </div>
            </div>

            {/* Audio preview player */}
            {order.audio_mp3_url && (
              <div className="mb-5">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-medium">Preview</p>
                <audio
                  controls
                  src={order.audio_mp3_url}
                  className="w-full rounded-lg"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            )}

            {/* Download buttons */}
            <div className="flex flex-col gap-3 mb-5">
              {order.audio_mp3_url && (
                <a
                  href={order.audio_mp3_url}
                  download
                  className="flex items-center justify-between bg-purple-700 hover:bg-purple-600 text-white font-semibold px-5 py-3.5 rounded-xl transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>⬇</span> Download MP3
                  </span>
                  <span className="text-purple-200 text-xs font-normal">High Quality</span>
                </a>
              )}
              {order.audio_wav_url && (
                <a
                  href={order.audio_wav_url}
                  download
                  className="flex items-center justify-between bg-amber-600 hover:bg-amber-500 text-white font-semibold px-5 py-3.5 rounded-xl transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>⬇</span> Download WAV
                  </span>
                  <span className="text-amber-200 text-xs font-normal">Lossless</span>
                </a>
              )}
              {!order.audio_mp3_url && !order.audio_wav_url && (
                <p className="text-gray-500 text-sm text-center py-4">
                  Download links are being prepared…
                </p>
              )}
            </div>

            {/* Action row */}
            <div className="flex gap-3 border-t border-gray-800 pt-4">
              <button
                onClick={handleShare}
                className="flex-1 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white py-2.5 rounded-lg text-sm transition-colors"
              >
                {copied ? '✓ Copied!' : 'Share Link'}
              </button>
              <Link
                to="/order/new"
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors text-center"
              >
                Create Another
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
