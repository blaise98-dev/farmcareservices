import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import PublicLayout from '../../components/public/PublicLayout';
import { submitContact } from '../../lib/api';
import { Mail, Phone, MapPin, Send, CheckCircle2 } from 'lucide-react';

const EMPTY = { name: '', email: '', phone: '', subject: '', message: '' };

export default function Contact() {
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');

  const mut = useMutation({
    mutationFn: submitContact,
    onSuccess: () => { setForm(EMPTY); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Something went wrong. Please try again.'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setErr('Name, email, and message are required.');
      return;
    }
    setErr('');
    mut.mutate(form);
  };

  return (
    <PublicLayout>
      <section style={{
        background: 'linear-gradient(135deg, #1E4D7B 0%, #2E7D32 100%)', color: '#fff',
        padding: '80px 24px 64px', textAlign: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: .8 }}>Contact Us</span>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, marginTop: 12 }}>
          Let's talk about your farm
        </h1>
        <p style={{ fontSize: 15, opacity: .8, marginTop: 12, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto' }}>
          Questions, partnership inquiries, or ready to get started — we'd love to hear from you.
        </p>
      </section>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px 100px', display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 48 }}>
        {/* Info column */}
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', marginBottom: 20 }}>Get in touch</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <a href="mailto:info@moome.com" style={{ display: 'flex', gap: 14, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(76,175,80,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Mail size={19} color="#2E7D32" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5 }}>Email</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', marginTop: 2 }}>info@moome.com</div>
              </div>
            </a>
            <a href="tel:+250780000001" style={{ display: 'flex', gap: 14, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(30,77,123,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Phone size={19} color="#1E4D7B" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5 }}>Phone</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', marginTop: 2 }}>+250 780 000 001</div>
              </div>
            </a>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(156,39,176,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin size={19} color="#9C27B0" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5 }}>Location</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', marginTop: 2 }}>Kigali, Rwanda 🇷🇼</div>
              </div>
            </div>
          </div>
        </div>

        {/* Form column */}
        <div className="card" style={{ padding: 32 }}>
          {mut.isSuccess ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <CheckCircle2 size={48} color="#4CAF50" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>Message sent</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
                {mut.data?.message || "Thanks for reaching out — we'll get back to you soon."}
              </p>
              <button onClick={() => mut.reset()} className="btn" style={{ marginTop: 20, padding: '9px 20px', fontSize: 13 }}>
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#5a6a7e', display: 'block', marginBottom: 6 }}>Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Your name" required
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e0e0e0', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#5a6a7e', display: 'block', marginBottom: 6 }}>Email *</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="you@example.com" required
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e0e0e0', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#5a6a7e', display: 'block', marginBottom: 6 }}>Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+250 7xx xxx xxx"
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e0e0e0', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#5a6a7e', display: 'block', marginBottom: 6 }}>Subject</label>
                  <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="What's this about?"
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e0e0e0', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#5a6a7e', display: 'block', marginBottom: 6 }}>Message *</label>
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Tell us about your farm or your question…" required rows={5}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e0e0e0', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {err && (
                <div style={{ background: '#fde8e8', color: '#c62828', borderRadius: 8, padding: '10px 14px', fontSize: 13, border: '1px solid #f5c6c6' }}>
                  ⚠ {err}
                </div>
              )}

              <button type="submit" disabled={mut.isPending}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: mut.isPending ? '#ccc' : '#4CAF50', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 700,
                  cursor: mut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}>
                {mut.isPending ? 'Sending…' : <>Send Message <Send size={16} /></>}
              </button>
            </form>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
