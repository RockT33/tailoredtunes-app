import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const features = [
  {
    icon: '⚡',
    title: 'Fast Delivery',
    desc: 'Your custom track is ready in 2–5 minutes, powered by cutting-edge AI.',
  },
  {
    icon: '🎵',
    title: 'Studio Quality',
    desc: 'Professional MP3 and WAV files you can use anywhere, royalty-free.',
  },
  {
    icon: '🎨',
    title: 'Truly Yours',
    desc: 'Every song is generated uniquely for your prompt — no templates.',
  },
]

const plans = [
  {
    name: 'Basic',
    price: '$9.99',
    period: '/mo',
    tier: 'basic',
    features: ['1 custom song/month', 'MP3 download', 'Standard quality'],
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$19.99',
    period: '/mo',
    tier: 'pro',
    features: ['3 custom songs/month', 'MP3 + WAV download', 'High quality', 'Priority queue'],
    highlight: true,
  },
  {
    name: 'Premium',
    price: '$29.99',
    period: '/mo',
    tier: 'premium',
    features: ['5 custom songs/month', 'MP3 + WAV download', 'Highest quality', 'Priority queue', 'Commercial license'],
    highlight: false,
  },
]

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-xl font-bold text-white tracking-tight">
          Tailored<span className="text-purple-500">Tunes</span>
        </span>
        <div className="flex gap-3">
          {user ? (
            <Link
              to="/dashboard"
              className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-20 pb-24 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 rounded-full px-4 py-1.5 text-purple-300 text-sm mb-6">
          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
          AI-powered music generation
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight mb-6">
          Your Custom Song,
          <br />
          <span className="text-purple-500">Ready in Minutes</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mb-10">
          Describe your vibe, pick a genre, and let our AI compose a unique track just for you.
          Download studio-quality MP3 and WAV files instantly.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to="/register"
            className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors"
          >
            Create Your Song →
          </Link>
          <a
            href="#pricing"
            className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium px-8 py-3.5 rounded-xl text-base transition-colors"
          >
            See Pricing
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid sm:grid-cols-3 gap-6">
          {features.map(f => (
            <div
              key={f.title}
              className="bg-[#111] border border-gray-800 rounded-2xl p-6 hover:border-purple-700/50 transition-colors"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 pb-28">
        <h2 className="text-3xl font-bold text-center mb-2">Simple Pricing</h2>
        <p className="text-gray-400 text-center mb-10">No hidden fees. Cancel anytime.</p>
        <div className="grid sm:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 border flex flex-col ${
                plan.highlight
                  ? 'bg-purple-900/20 border-purple-600 ring-1 ring-purple-600'
                  : 'bg-[#111] border-gray-800'
              }`}
            >
              {plan.highlight && (
                <div className="text-xs font-semibold text-purple-300 bg-purple-700/30 rounded-full px-3 py-1 self-start mb-4">
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
              <div className="flex items-end gap-1 mb-4">
                <span className="text-3xl font-extrabold text-amber-400">{plan.price}</span>
                <span className="text-gray-400 text-sm mb-1">{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map(feat => (
                  <li key={feat} className="text-gray-300 text-sm flex items-center gap-2">
                    <span className="text-purple-400">✓</span> {feat}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`w-full text-center py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  plan.highlight
                    ? 'bg-purple-700 hover:bg-purple-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-white'
                }`}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-gray-500 text-sm">
        © {new Date().getFullYear()} TailoredTunes. All rights reserved.
      </footer>
    </div>
  )
}
