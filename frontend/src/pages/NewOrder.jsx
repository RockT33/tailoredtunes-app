import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import api from '../services/api'

const TIERS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '$9.99',
    desc: '1 song · MP3 download',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19.99',
    desc: '3 songs · MP3 + WAV · Priority',
    highlight: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$29.99',
    desc: '5 songs · MP3 + WAV · Commercial license',
    highlight: false,
  },
]

const GENRES = ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'Country', 'R&B', 'Folk', 'Metal']
const MOODS = ['Happy', 'Sad', 'Energetic', 'Calm', 'Romantic', 'Mysterious', 'Epic', 'Chill']

export default function NewOrder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const wasCancelled = searchParams.get('cancelled') === 'true'
  const [tier, setTier] = useState('pro')
  const [form, setForm] = useState({ title: '', genre: '', mood: '', type: 'song' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.title || !form.genre || !form.mood) {
      setError('Please fill in all fields.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/orders', { ...form, tier })
      const { checkoutUrl, sessionId } = res.data

      if (checkoutUrl) {
        window.location.href = checkoutUrl
      } else if (sessionId) {
        const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
        await stripe.redirectToCheckout({ sessionId })
      } else {
        navigate(`/order/${res.data.order.id}`)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create order. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Tailored<span className="text-purple-500">Tunes</span>
          </Link>
          <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Create a New Song</h1>
        <p className="text-gray-400 text-sm mb-8">Choose your plan and describe your track.</p>

        {wasCancelled && (
          <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 rounded-lg px-4 py-3 text-sm mb-6">
            Payment was cancelled — your order wasn't charged. Fill in the form below to try again.
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Tier selector */}
          <div>
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Select Plan
            </h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {TIERS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTier(t.id)}
                  className={`rounded-xl p-4 border text-left transition-all ${
                    tier === t.id
                      ? 'bg-purple-900/30 border-purple-500 ring-1 ring-purple-500'
                      : 'bg-[#111] border-gray-800 hover:border-gray-600'
                  }`}
                >
                  <div className="text-white font-semibold">{t.name}</div>
                  <div className="text-amber-400 font-bold text-xl mt-0.5">{t.price}</div>
                  <div className="text-gray-400 text-xs mt-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Song details */}
          <div className="bg-[#111] border border-gray-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Song Details
            </h2>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Song Title</label>
              <input
                name="title"
                type="text"
                required
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Summer Sunset Drive"
                className="w-full bg-[#0a0a0a] border border-gray-700 focus:border-purple-500 outline-none rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 transition-colors"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Genre</label>
                <select
                  name="genre"
                  required
                  value={form.genre}
                  onChange={handleChange}
                  className="w-full bg-[#0a0a0a] border border-gray-700 focus:border-purple-500 outline-none rounded-lg px-4 py-2.5 text-white text-sm transition-colors appearance-none"
                >
                  <option value="">Select genre</option>
                  {GENRES.map(g => (
                    <option key={g} value={g.toLowerCase()}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Mood</label>
                <select
                  name="mood"
                  required
                  value={form.mood}
                  onChange={handleChange}
                  className="w-full bg-[#0a0a0a] border border-gray-700 focus:border-purple-500 outline-none rounded-lg px-4 py-2.5 text-white text-sm transition-colors appearance-none"
                >
                  <option value="">Select mood</option>
                  {MOODS.map(m => (
                    <option key={m} value={m.toLowerCase()}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Type</label>
              <div className="flex gap-4">
                {['song', 'instrumental'].map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="type"
                      value={t}
                      checked={form.type === t}
                      onChange={handleChange}
                      className="accent-purple-600 w-4 h-4"
                    />
                    <span className="text-gray-300 text-sm capitalize">{t}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? 'Redirecting to checkout…' : 'Continue to Checkout →'}
          </button>
        </form>
      </main>
    </div>
  )
}
