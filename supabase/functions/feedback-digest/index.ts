import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const RESEND_API_KEY          = Deno.env.get('RESEND_API_KEY')!
const NOTIFY_EMAIL            = Deno.env.get('NOTIFY_EMAIL')!
const CRON_SECRET             = Deno.env.get('CRON_SECRET')!
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: rows, error } = await supabase
    .from('feedback')
    .select('*')
    .is('notified_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('DB error:', error)
    return new Response('DB error', { status: 500 })
  }

  if (!rows || rows.length === 0) {
    return new Response('No new feedback', { status: 200 })
  }

  const count = rows.length
  const subject = `CapiModel — ${count} nouveau${count > 1 ? 'x' : ''} commentaire${count > 1 ? 's' : ''}`

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const items = rows.map(r => `
    <div style="border-left:3px solid #05c1ad;padding:12px 16px;margin:12px 0;background:#f8fafc;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 8px;font-size:15px;color:#1e293b;white-space:pre-wrap;">${esc(r.message)}</p>
      <p style="margin:0;font-size:12px;color:#64748b;">
        ${r.name ? `<strong>${esc(r.name)}</strong>` : '<em>Anonyme</em>'}
        ${r.email ? ` · <a href="mailto:${esc(r.email)}" style="color:#05c1ad;">${esc(r.email)}</a>` : ''}
        · page : <code>${esc(r.page ?? '—')}</code>
        · ${new Date(r.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
      </p>
    </div>
  `).join('')

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="utf-8" /></head>
    <body style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;color:#1e293b;padding:24px;">
      <h2 style="color:#05c1ad;margin:0 0 4px;">CapiModel — Résumé quotidien</h2>
      <p style="color:#64748b;margin:0 0 20px;font-size:14px;">
        ${count} commentaire${count > 1 ? 's' : ''} reçu${count > 1 ? 's' : ''} depuis le dernier envoi
      </p>
      ${items}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
      <p style="font-size:12px;color:#94a3b8;">
        Voir tous les retours :
        <a href="https://supabase.com/dashboard/project/sqsqkspbwlvplbrypgpe/editor" style="color:#05c1ad;">
          dashboard Supabase
        </a>
      </p>
    </body>
    </html>
  `

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'CapiModel Feedback <onboarding@resend.dev>',
      to: [NOTIFY_EMAIL],
      subject,
      html,
    }),
  })

  if (!emailRes.ok) {
    console.error('Resend error:', await emailRes.text())
    return new Response('Email error', { status: 500 })
  }

  await supabase
    .from('feedback')
    .update({ notified_at: new Date().toISOString() })
    .in('id', rows.map(r => r.id))

  return new Response(`Digest sent — ${count} item(s)`, { status: 200 })
})
