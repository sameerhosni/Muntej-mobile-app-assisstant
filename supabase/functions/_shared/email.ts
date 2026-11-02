// Plain email through Resend (RESEND_API_KEY, sender RESEND_FROM). Returns false when not configured or refused.
export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('RESEND_FROM') ?? 'Muntej <onboarding@resend.dev>', to: [to], subject, html, text }),
  });
  if (!res.ok) console.error('Resend error', res.status, (await res.text()).slice(0, 300));
  return res.ok;
}
