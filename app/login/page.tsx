'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
      })
      if (error) {
        setError(error.message)
      } else {
        setError('Vérifiez votre email pour confirmer votre compte.')
      }
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8f8f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '14px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        padding: '40px 36px',
        width: '100%',
        maxWidth: '400px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="60" height="60">
            <rect width="180" height="180" rx="36" fill="#fff" stroke="#1d617a" strokeWidth="8"/>
            <line x1="52" y1="42" x2="52" y2="138" stroke="#1d617a" strokeWidth="10" strokeLinecap="round"/>
            <circle cx="52" cy="58" r="10" fill="#ff914d"/>
            <circle cx="52" cy="90" r="10" fill="#fff" stroke="#1d617a" strokeWidth="6"/>
            <circle cx="52" cy="122" r="10" fill="#fff" stroke="#1d617a" strokeWidth="6"/>
            <line x1="78" y1="60" x2="140" y2="60" stroke="#1d617a" strokeWidth="10" strokeLinecap="round"/>
            <line x1="78" y1="92" x2="150" y2="92" stroke="#1d617a" strokeWidth="10" strokeLinecap="round" opacity=".9"/>
            <line x1="78" y1="124" x2="132" y2="124" stroke="#1d617a" strokeWidth="10" strokeLinecap="round" opacity=".75"/>
            <line x1="78" y1="150" x2="150" y2="150" stroke="#ff914d" strokeWidth="10" strokeLinecap="round"/>
          </svg>
          <h1 style={{ margin: '12px 0 4px', fontSize: '22px', fontWeight: 800, color: '#1d617a' }}>
            Chat LegalDesign
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            Générateur d&apos;infographies juridiques
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderRadius: '10px', background: '#f3f4f6', padding: '4px', marginBottom: '24px' }}>
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#1d617a' : '#6b7280',
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.10)' : 'none',
              }}
            >
              {m === 'login' ? 'Connexion' : 'Inscription'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Adresse email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="s.coly@dairia-avocats.com"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1.5px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#1d617a')}
              onBlur={(e) => (e.target.style.borderColor = '#d1d5db')}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1.5px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#1d617a')}
              onBlur={(e) => (e.target.style.borderColor = '#d1d5db')}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: '16px',
              padding: '10px 14px',
              borderRadius: '8px',
              background: error.includes('Vérifiez') ? 'rgba(47,158,68,0.08)' : 'rgba(224,49,49,0.08)',
              color: error.includes('Vérifiez') ? '#2f9e44' : '#e03131',
              fontSize: '13px',
              border: `1px solid ${error.includes('Vérifiez') ? 'rgba(47,158,68,0.3)' : 'rgba(224,49,49,0.3)'}`,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: loading ? '#a5b4c2' : '#1d617a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : 'Créer un compte'}
          </button>
        </form>

        <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '12px', color: '#9ca3af' }}>
          Dairia legaldesign © 2026
        </p>
      </div>
    </div>
  )
}
