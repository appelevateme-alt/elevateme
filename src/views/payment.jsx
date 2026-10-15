import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHead } from '../components/ui.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { isPerformanceLocked, useAuth } from '../lib/auth.jsx';

/* PayHere checkout front end. Nothing talks to PayHere until configured.
 * Set in .env (PUBLIC values only; the merchant SECRET never goes in the front end):
 *   VITE_PAYHERE_MERCHANT_ID, VITE_PAYHERE_SANDBOX ('false' = live),
 *   VITE_PAYHERE_AMOUNT (default 5000), VITE_PAYHERE_CURRENCY (default LKR),
 *   VITE_PAYHERE_HASH_URL (default /api/payments/payhere/hash)
 * The backend hash endpoint gets { orderId, amount, currency } + bearer token
 * and answers { hash }. The notify_url webhook marks the student paid. */
const env = import.meta.env || {};
const PAYHERE = {
  merchantId: env.VITE_PAYHERE_MERCHANT_ID || '',
  sandbox: env.VITE_PAYHERE_SANDBOX !== 'false',
  amount: Number(env.VITE_PAYHERE_AMOUNT || 5000),
  currency: env.VITE_PAYHERE_CURRENCY || 'LKR',
  hashUrl: env.VITE_PAYHERE_HASH_URL || '/api/payments/payhere/hash',
};
const checkoutUrl = () => (PAYHERE.sandbox ? 'https://sandbox.payhere.lk/pay/checkout' : 'https://www.payhere.lk/pay/checkout');
const money = (n) => `${PAYHERE.currency} ${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const REGISTRATION_FEE = money(PAYHERE.amount);

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}

function postToPayHere(fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = checkoutUrl();
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value == null ? '' : String(value);
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/* ---------- Checkout page ---------- */
export function StudentPayment() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const nm = splitName(session?.name);
  const [form, setForm] = useState({ first: nm.first, last: nm.last, phone: '', address: '', city: '', country: 'Sri Lanka' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const alreadyPaid = session?.paymentStatus === 'paid';

  const validate = () => {
    const list = [];
    if (!form.first.trim()) list.push('Enter your first name.');
    if (!form.last.trim()) list.push('Enter your last name.');
    if (!form.phone.trim()) list.push('Enter a phone number.');
    if (!form.address.trim()) list.push('Enter your address.');
    if (!form.city.trim()) list.push('Enter your city.');
    return list;
  };

  const pay = async (e) => {
    e.preventDefault();
    const list = validate();
    setErrors(list);
    setNote('');
    if (list.length) return;
    if (!PAYHERE.merchantId) {
      setNote('The payment gateway is not connected yet. Nothing was charged. You can continue to your portal and pay later.');
      return;
    }
    setBusy(true);
    try {
      const orderId = `EM-${String(session?.userId || '').slice(0, 8)}-${Date.now()}`;
      const { data } = await supabase.auth.getSession();
      const res = await fetch(PAYHERE.hashUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
        body: JSON.stringify({ orderId, amount: PAYHERE.amount.toFixed(2), currency: PAYHERE.currency }),
      });
      const body = res.ok ? await res.json().catch(() => null) : null;
      if (!body?.hash) {
        setNote('The payment service could not start this payment yet. Nothing was charged. Please try again later.');
        return;
      }
      const origin = window.location.origin;
      postToPayHere({
        merchant_id: PAYHERE.merchantId,
        return_url: `${origin}/student/payment/success`,
        cancel_url: `${origin}/student/payment/cancelled`,
        notify_url: body.notifyUrl || `${origin}/api/payments/payhere/notify`,
        order_id: orderId,
        items: 'ElevateMe student registration',
        currency: PAYHERE.currency,
        amount: PAYHERE.amount.toFixed(2),
        first_name: form.first.trim(),
        last_name: form.last.trim(),
        email: session?.email || '',
        phone: form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        country: form.country.trim() || 'Sri Lanka',
        custom_1: session?.userId || '',
        hash: body.hash,
      });
    } catch {
      setNote('Could not reach the payment service. Nothing was charged. Please try again later.');
    } finally {
      setBusy(false);
    }
  };

  if (alreadyPaid) {
    return (
      <div>
        <PageHead kicker="Payment" title="You're all paid up." desc="Your registration payment is complete and Performance is unlocked." />
        <Link to="/student/performance" className="button">Open Performance →</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Payment" title="Complete your registration." desc="Pay securely with PayHere to unlock Performance: scores, insights and progress from your released evaluations." />
      <div className="pay-grid">
        <section className="panel pay-summary">
          <div className="panel-head"><h2>Order summary</h2></div>
          <div className="panel-body">
            <div className="pay-line"><span>ElevateMe student registration</span><strong>{money(PAYHERE.amount)}</strong></div>
            <div className="pay-line pay-total"><span>Total today</span><strong>{money(PAYHERE.amount)}</strong></div>
            <ul className="pay-perks">
              <li>Performance scores and automated insights</li>
              <li>Released evaluation reports for every session</li>
              <li>Progress tracking across all your programs</li>
            </ul>
            <p className="pay-secure"><LockIcon /> You pay on PayHere&apos;s secure page. ElevateMe never sees or stores your card details.</p>
          </div>
        </section>

        <form className="panel pay-form" onSubmit={pay} noValidate>
          <div className="panel-head"><h2>Billing details</h2></div>
          <div className="panel-body">
            {errors.length > 0 && (
              <div className="notice pay-note" role="alert"><strong>Check {errors.length} item{errors.length === 1 ? '' : 's'} before continuing</strong><ul>{errors.map((m) => <li key={m}>{m}</li>)}</ul></div>
            )}
            {note && <div className="notice pay-note" role="status">{note}</div>}
            <div className="pay-fields">
              <label className="pay-field"><span>First name</span><input value={form.first} onChange={(e) => set('first', e.target.value)} autoComplete="given-name" /></label>
              <label className="pay-field"><span>Last name</span><input value={form.last} onChange={(e) => set('last', e.target.value)} autoComplete="family-name" /></label>
              <label className="pay-field pay-wide"><span>Email</span><input value={session?.email || ''} readOnly /></label>
              <label className="pay-field pay-wide"><span>Phone</span><input value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="07X XXX XXXX" /></label>
              <label className="pay-field pay-wide"><span>Address</span><input value={form.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" /></label>
              <label className="pay-field"><span>City</span><input value={form.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" /></label>
              <label className="pay-field"><span>Country</span><input value={form.country} onChange={(e) => set('country', e.target.value)} autoComplete="country-name" /></label>
            </div>
            <div className="pay-actions">
              <button type="submit" className="button pay-cta" disabled={busy}>{busy ? 'Opening PayHere…' : `Pay ${money(PAYHERE.amount)} with PayHere`}</button>
              <button type="button" className="button secondary" onClick={() => navigate('/student')}>Pay later</button>
            </div>
            {PAYHERE.sandbox && PAYHERE.merchantId && <p className="pay-sandbox">Sandbox mode: no real money is taken.</p>}
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- PayHere return pages ---------- */
export function StudentPaymentSuccess() {
  const { session, refreshProfile } = useAuth();
  const [tries, setTries] = useState(0);
  const paid = session?.paymentStatus === 'paid';
  const timer = useRef(null);

  // The webhook is what marks the account paid, so check a few times.
  useEffect(() => {
    if (paid || tries >= 20) return undefined;
    timer.current = setTimeout(async () => { await refreshProfile?.(); setTries((t) => t + 1); }, 3000);
    return () => clearTimeout(timer.current);
  }, [paid, tries, refreshProfile]);

  if (paid) {
    return (
      <div>
        <PageHead kicker="Payment" title="Payment received." desc="Thank you. Performance is now unlocked for your account." />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/student/performance" className="button">Open Performance →</Link>
          <Link to="/student" className="button secondary">Back to overview</Link>
        </div>
      </div>
    );
  }
  return (
    <div>
      <PageHead kicker="Payment" title="Confirming your payment…" desc="PayHere has sent you back. We are waiting for the payment to be confirmed." />
      <div className="notice" role="status" style={{ marginBottom: 20 }}>
        {tries >= 20
          ? 'This is taking longer than usual. Your payment may still be processing; Performance unlocks as soon as it is confirmed. You can safely carry on in your portal.'
          : 'This usually takes a few seconds. You can leave this page; Performance unlocks as soon as it is confirmed.'}
      </div>
      <Link to="/student" className="button secondary">Back to overview</Link>
    </div>
  );
}

export function StudentPaymentCancelled() {
  return (
    <div>
      <PageHead kicker="Payment" title="Payment cancelled." desc="No charge was made. You can try again whenever you are ready." />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/student/payment" className="button">Try again</Link>
        <Link to="/student" className="button secondary">Continue without paying</Link>
      </div>
    </div>
  );
}

/* ---------- Shown in place of Performance for unpaid students ---------- */
export function PerformanceLocked() {
  return (
    <div>
      <PageHead kicker="Performance" title="Performance is locked." desc="Scores, insights and progress unlock once your registration payment is complete." />
      <div className="pay-locked panel">
        <div className="panel-body">
          <span className="pay-lock-badge"><LockIcon /></span>
          <p>You chose to register without paying. Everything else in your portal works as normal.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/student/payment" className="button">Pay now to unlock</Link>
            <Link to="/student" className="button secondary">Back to overview</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PaidOnly({ children }) {
  const { session } = useAuth();
  return isPerformanceLocked(session) ? <PerformanceLocked /> : children;
}

// Link to a Performance page; becomes a greyed-out, non-clickable pill when locked.
export function PerformanceLink({ to, className = 'button secondary small', children }) {
  const { session } = useAuth();
  if (isPerformanceLocked(session)) {
    return <span className={`${className} locked`} aria-disabled="true" title="Complete your registration payment to unlock Performance"><LockIcon /> {children}</span>;
  }
  return <Link to={to} className={className}>{children}</Link>;
}