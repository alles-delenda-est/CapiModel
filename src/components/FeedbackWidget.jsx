import { useState, useCallback } from 'react'
import './FeedbackWidget.css'

// Both values are public by design — the anon key can only INSERT into the
// feedback table (RLS enforces this). The Resend key and notification email
// are server-side secrets in the Supabase Edge Function.
const SUPABASE_URL      = 'https://sqsqkspbwlvplbrypgpe.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_5YWOmdPqypr5KtxeNZffgQ_chgjlFVT'

export default function FeedbackWidget({ currentPage }) {
  const [open, setOpen]       = useState(false)
  const [message, setMessage] = useState('')
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [status, setStatus]   = useState('idle') // idle | loading | success | error

  const reset = useCallback(() => {
    setMessage(''); setName(''); setEmail(''); setStatus('idle')
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setTimeout(reset, 300)
  }, [reset])

  const submit = useCallback(async (e) => {
    e.preventDefault()
    if (!message.trim()) return
    setStatus('loading')
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          message: message.trim(),
          name:    name.trim()  || null,
          email:   email.trim() || null,
          page:    currentPage  ?? null,
        }),
      })
      if (!res.ok) throw new Error(res.status)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }, [message, name, email, currentPage])

  return (
    <>
      <button
        className="fbw-trigger"
        onClick={() => setOpen(true)}
        aria-label="Laisser un commentaire"
        title="Laisser un commentaire"
      >
        <span className="fbw-trigger-icon">✉</span>
        <span className="fbw-trigger-label">Feedback</span>
      </button>

      {open && (
        <div className="fbw-overlay" onClick={close}>
          <div className="fbw-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <button className="fbw-close" onClick={close} aria-label="Fermer">×</button>

            {status === 'success' ? (
              <div className="fbw-success">
                <div className="fbw-success-icon">✓</div>
                <h3>Merci !</h3>
                <p>Votre commentaire a bien été enregistré.</p>
                <button className="fbw-btn" onClick={close}>Fermer</button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <h3>Votre avis</h3>
                <p className="fbw-sub">Commentaires, questions, erreurs — tout est utile.</p>

                <label className="fbw-field">
                  <span>Message <em className="fbw-required">*</em></span>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Votre commentaire…"
                    maxLength={2000}
                    rows={4}
                    required
                    disabled={status === 'loading'}
                  />
                </label>

                <label className="fbw-field">
                  <span>Nom <em className="fbw-optional">optionnel</em></span>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Votre nom"
                    maxLength={100}
                    disabled={status === 'loading'}
                  />
                </label>

                <label className="fbw-field">
                  <span>Email <em className="fbw-optional">optionnel · pour être informé des suites</em></span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="votre@email.fr"
                    disabled={status === 'loading'}
                  />
                </label>

                {status === 'error' && (
                  <p className="fbw-error">Une erreur s'est produite. Réessayez dans un instant.</p>
                )}

                <button
                  type="submit"
                  className="fbw-btn fbw-btn-primary"
                  disabled={!message.trim() || status === 'loading'}
                >
                  {status === 'loading' ? 'Envoi…' : 'Envoyer'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
