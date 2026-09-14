import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { supabase, isSupabaseConfigured } from './supabase'
import './styles.css'

registerSW({ immediate: true })

const CURRENCIES = ['CNY', 'USD']
const today = () => new Date().toISOString().slice(0, 10)
const inputDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const addDays = (date, days) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
const money = (amount, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount || 0))
const dateLabel = (date) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)

function periodBounds(anchor, range) {
  const base = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  if (range === 'week') {
    const mondayOffset = (base.getDay() + 6) % 7
    const start = addDays(base, -mondayOffset)
    return { start, end: addDays(start, 7), label: `Week of ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(start)}` }
  }
  if (range === 'year') {
    const start = new Date(base.getFullYear(), 0, 1)
    return { start, end: new Date(base.getFullYear() + 1, 0, 1), label: String(base.getFullYear()) }
  }
  const start = new Date(base.getFullYear(), base.getMonth(), 1)
  return { start, end: new Date(base.getFullYear(), base.getMonth() + 1, 1), label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(start) }
}

function shiftAnchor(anchor, range, direction) {
  const next = new Date(anchor)
  if (range === 'week') next.setDate(next.getDate() + direction * 7)
  if (range === 'month') next.setMonth(next.getMonth() + direction)
  if (range === 'year') next.setFullYear(next.getFullYear() + direction)
  return next
}

function Auth() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  async function signIn(event) {
    event.preventDefault()
    setError('')
    setSending(true)
    const { error: signInError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } })
    setSending(false)
    if (signInError) setError(signInError.message); else setSent(true)
  }
  return <main className="auth-shell"><section className="auth-card">
    <div className="brand-mark">$</div><p className="eyebrow">PERSONAL FINANCE</p><h1>Pocket Ledger</h1>
    <p className="muted">A calm place to keep track of your everyday money.</p>
    {sent ? <p className="notice">Check your inbox for a secure sign-in link.</p> : <form onSubmit={signIn}>
      <label>Email address<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      {error && <p className="error">{error}</p>}<button className="primary" type="submit" disabled={sending}>{sending ? 'Sending sign-in link…' : 'Email me a sign-in link'}</button>
    </form>}
  </section></main>
}

function TransactionForm({ transaction, ledgers, defaultCurrency, onSave, onClose }) {
  const [type, setType] = useState(transaction?.type || 'expense')
  const [amount, setAmount] = useState(transaction?.amount || '')
  const [ledgerId, setLedgerId] = useState(transaction?.ledger_id || '')
  const [date, setDate] = useState(transaction?.date || today())
  const [note, setNote] = useState(transaction?.note || '')
  const [currency, setCurrency] = useState(transaction?.currency || defaultCurrency)
  const [error, setError] = useState('')
  const eligibleLedgers = ledgers.filter(ledger => ledger.type === type)

  useEffect(() => {
    if (!eligibleLedgers.some(ledger => ledger.id === ledgerId)) setLedgerId(eligibleLedgers[0]?.id || '')
  }, [type, ledgers])

  async function submit(event) {
    event.preventDefault()
    const parsed = Number(amount)
    const ledger = eligibleLedgers.find(item => item.id === ledgerId)
    if (!Number.isFinite(parsed) || parsed <= 0) return setError('Enter an amount greater than zero.')
    if (!ledger) return setError(`Create an ${type} ledger before saving a transaction.`)
    await onSave({ type, amount: parsed, ledger_id: ledger.id, ledger_name: ledger.name, date, note: note.trim() || null, currency })
  }
  const editing = Boolean(transaction)
  return <div className="sheet-backdrop" role="presentation"><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="transaction-title">
    <div className="sheet-head"><div><p className="eyebrow">{editing ? 'UPDATE ENTRY' : 'NEW ENTRY'}</p><h2 id="transaction-title">{editing ? 'Edit transaction' : 'Add transaction'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>
    <form onSubmit={submit}><div className="type-toggle"><button type="button" className={type === 'expense' ? 'selected expense' : ''} onClick={() => setType('expense')}>Expense</button><button type="button" className={type === 'income' ? 'selected income' : ''} onClick={() => setType('income')}>Income</button></div>
      <label className="amount-label">Amount<div className="amount-input"><span>{currency === 'CNY' ? '¥' : '$'}</span><input autoFocus inputMode="decimal" type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></div></label>
      <label>Ledger<select value={ledgerId} onChange={event => setLedgerId(event.target.value)} required>{eligibleLedgers.length === 0 && <option value="">No ledgers available</option>}{eligibleLedgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name}</option>)}</select></label>
      <label>Currency<select value={currency} onChange={event => setCurrency(event.target.value)}>{CURRENCIES.map(item => <option key={item} value={item}>{item} — {item === 'CNY' ? 'Chinese Yuan' : 'US Dollar'}</option>)}</select></label>
      <label>Date<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Note <span className="optional">optional</span><input maxLength="140" value={note} onChange={event => setNote(event.target.value)} placeholder="What was this for?" /></label>
      {error && <p className="error">{error}</p>}<button className="primary" type="submit">{editing ? 'Save changes' : 'Save transaction'}</button>
    </form>
  </section></div>
}

function LedgerManager({ ledgers, onCreate, onRename, onDelete, onClose }) {
  const [type, setType] = useState('expense')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const visible = ledgers.filter(ledger => ledger.type === type)
  async function create(event) {
    event.preventDefault(); setError('')
    const result = await onCreate({ type, name: name.trim() })
    if (result) setError(result); else setName('')
  }
  async function rename(ledger) {
    const next = window.prompt(`Rename ${ledger.name}`, ledger.name)?.trim()
    if (!next || next === ledger.name) return
    const result = await onRename(ledger, next)
    if (result) setError(result)
  }
  async function remove(ledger) {
    if (!window.confirm(`Delete “${ledger.name}”? Existing transactions will keep their historical ledger name.`)) return
    const result = await onDelete(ledger)
    if (result) setError(result)
  }
  return <div className="sheet-backdrop" role="presentation"><section className="sheet ledger-sheet" role="dialog" aria-modal="true" aria-labelledby="ledger-title">
    <div className="sheet-head"><div><p className="eyebrow">YOUR LEDGERS</p><h2 id="ledger-title">Manage ledgers</h2></div><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>
    <div className="type-toggle"><button type="button" className={type === 'expense' ? 'selected expense' : ''} onClick={() => setType('expense')}>Expense</button><button type="button" className={type === 'income' ? 'selected income' : ''} onClick={() => setType('income')}>Income</button></div>
    <ul className="ledger-list">{visible.map(ledger => <li key={ledger.id}><strong>{ledger.name}</strong>{ledger.is_default ? <span className="tag">Built-in</span> : <span className="ledger-actions"><button onClick={() => rename(ledger)}>Rename</button><button className="danger-link" onClick={() => remove(ledger)}>Delete</button></span>}</li>)}</ul>
    <form className="ledger-create" onSubmit={create}><label>New {type} ledger<input maxLength="60" required value={name} onChange={event => setName(event.target.value)} placeholder={type === 'expense' ? 'e.g. Travel' : 'e.g. Freelance'} /></label><button className="primary" type="submit">Create ledger</button></form>
    {error && <p className="error">{error}</p>}
  </section></div>
}

function Totals({ totals }) {
  const render = (key, empty) => CURRENCIES.some(currency => totals[currency][key])
    ? CURRENCIES.filter(currency => totals[currency][key]).map(currency => <span key={currency}>{money(totals[currency][key], currency)}</span>)
    : <span>{empty}</span>
  return <section className="summary"><article><span>Income</span><strong className="positive">{render('income', '—')}</strong></article><article><span>Expenses</span><strong className="negative">{render('expense', '—')}</strong></article><article className="balance"><span>Balance</span><strong>{CURRENCIES.some(currency => totals[currency].income || totals[currency].expense) ? CURRENCIES.map(currency => <span key={currency}>{money(totals[currency].income - totals[currency].expense, currency)}</span>) : <span>—</span>}</strong></article></section>
}

function App() {
  const [session, setSession] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [ledgers, setLedgers] = useState([])
  const [currency, setCurrency] = useState('CNY')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState(null)
  const [range, setRange] = useState('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [ledgerFilter, setLedgerFilter] = useState('all')
  const bounds = useMemo(() => periodBounds(anchor, range), [anchor, range])

  useEffect(() => {
    if (!isSupabaseConfigured) return setLoading(false)
    supabase.auth.getSession().then(({ data, error: sessionError }) => { if (sessionError) setError(sessionError.message); setSession(data.session); setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  async function loadData() {
    if (!session) return
    setLoading(true); setError('')
    await supabase.from('user_settings').upsert({ user_id: session.user.id, currency: 'CNY', updated_at: new Date().toISOString() }, { onConflict: 'user_id', ignoreDuplicates: true })
    let query = supabase.from('transactions').select('*').gte('date', inputDate(bounds.start)).lt('date', inputDate(bounds.end)).order('date', { ascending: false }).order('created_at', { ascending: false })
    if (ledgerFilter !== 'all') query = query.eq('ledger_id', ledgerFilter)
    const [transactionResult, ledgerResult, settingResult] = await Promise.all([
      query,
      supabase.from('ledgers').select('*').order('type').order('name'),
      supabase.from('user_settings').select('currency').single()
    ])
    if (transactionResult.error || ledgerResult.error || settingResult.error) setError(transactionResult.error?.message || ledgerResult.error?.message || settingResult.error?.message)
    else { setTransactions(transactionResult.data); setLedgers(ledgerResult.data); setCurrency(settingResult.data.currency) }
    setLoading(false)
  }
  useEffect(() => { loadData() }, [session, range, anchor, ledgerFilter])

  const totals = useMemo(() => transactions.reduce((result, transaction) => {
    result[transaction.currency][transaction.type] += Number(transaction.amount)
    return result
  }, { CNY: { income: 0, expense: 0 }, USD: { income: 0, expense: 0 } }), [transactions])

  async function saveTransaction(values) {
    setSaving(true); setError('')
    const result = modal?.kind === 'edit' ? await supabase.from('transactions').update(values).eq('id', modal.transaction.id) : await supabase.from('transactions').insert(values)
    setSaving(false)
    if (result.error) return setError(result.error.message)
    setModal(null); loadData()
  }
  async function deleteTransaction(id) {
    if (!window.confirm('Delete this transaction?')) return
    const { error: deleteError } = await supabase.from('transactions').delete().eq('id', id)
    if (deleteError) setError(deleteError.message); else loadData()
  }
  async function updateCurrency(next) {
    const { error: updateError } = await supabase.from('user_settings').update({ currency: next, updated_at: new Date().toISOString() }).eq('user_id', session.user.id)
    if (updateError) setError(updateError.message); else setCurrency(next)
  }
  async function createLedger(values) {
    if (!values.name) return 'Enter a ledger name.'
    const { error: createError } = await supabase.from('ledgers').insert({ ...values, is_default: false })
    if (createError) return createError.code === '23505' ? 'A ledger with this name already exists.' : createError.message
    loadData(); return null
  }
  async function renameLedger(ledger, name) {
    const { error: renameError } = await supabase.from('ledgers').update({ name }).eq('id', ledger.id)
    if (renameError) return renameError.code === '23505' ? 'A ledger with this name already exists.' : renameError.message
    const { error: historyError } = await supabase.from('transactions').update({ ledger_name: name }).eq('ledger_id', ledger.id)
    if (historyError) return historyError.message
    loadData(); return null
  }
  async function deleteLedger(ledger) {
    const { error: deleteError } = await supabase.from('ledgers').delete().eq('id', ledger.id)
    if (deleteError) return deleteError.message
    if (ledgerFilter === ledger.id) setLedgerFilter('all')
    loadData(); return null
  }

  if (!isSupabaseConfigured) return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">$</div><h1>Set up Pocket Ledger</h1><p className="muted">Add your Supabase URL and publishable key to a <code>.env</code> file, then restart the app.</p></section></main>
  if (!session) return <Auth />
  return <main className="app"><header><div><p className="eyebrow">{dateLabel(new Date())}</p><h1>Good to see you</h1></div><button className="signout" onClick={() => supabase.auth.signOut()}>Sign out</button></header>
    <section className="dashboard-controls"><div className="range-tabs">{['week', 'month', 'year'].map(item => <button key={item} className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item}</button>)}</div><div className="period-nav"><button onClick={() => setAnchor(shiftAnchor(anchor, range, -1))} aria-label="Previous period">‹</button><strong>{bounds.label}</strong><button onClick={() => setAnchor(shiftAnchor(anchor, range, 1))} aria-label="Next period">›</button></div><div className="filters"><label>Ledger<select value={ledgerFilter} onChange={event => setLedgerFilter(event.target.value)}><option value="all">All ledgers</option>{ledgers.map(ledger => <option key={ledger.id} value={ledger.id}>{ledger.name} · {ledger.type}</option>)}</select></label><label>Default currency<select value={currency} onChange={event => updateCurrency(event.target.value)}>{CURRENCIES.map(item => <option key={item}>{item}</option>)}</select></label><button className="manage-button" onClick={() => setModal({ kind: 'ledgers' })}>Manage ledgers</button></div></section>
    <Totals totals={totals} />
    <section className="transactions"><div className="section-heading"><div><p className="eyebrow">{bounds.label}</p><h2>Transactions</h2></div><button className="add-button" onClick={() => setModal({ kind: 'add' })}>+ Add</button></div>{error && <p className="error">{error}</p>}{loading ? <p className="muted">Loading transactions…</p> : transactions.length === 0 ? <div className="empty"><span>✦</span><h3>No transactions found</h3><p>Add an entry or choose another time range or ledger.</p></div> : <ul>{transactions.map(transaction => <li key={transaction.id}><span className="category-icon">{transaction.type === 'income' ? '↗' : '↘'}</span><button className="transaction-main" onClick={() => setModal({ kind: 'edit', transaction })}><strong>{transaction.ledger_name}</strong><span>{transaction.note || new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${transaction.date}T00:00:00`))}</span></button><strong className={transaction.type === 'income' ? 'positive' : 'negative'}>{transaction.type === 'income' ? '+' : '−'}{money(transaction.amount, transaction.currency)}</strong><button className="edit" onClick={() => setModal({ kind: 'edit', transaction })}>Edit</button><button className="delete" onClick={() => deleteTransaction(transaction.id)} aria-label={`Delete ${transaction.ledger_name}`}>×</button></li>)}</ul>}</section>
    <button className="fab" onClick={() => setModal({ kind: 'add' })} aria-label="Add transaction">+</button>{saving && <div className="saving">Saving…</div>}
    {modal?.kind === 'add' && <TransactionForm ledgers={ledgers} defaultCurrency={currency} onSave={saveTransaction} onClose={() => setModal(null)} />}
    {modal?.kind === 'edit' && <TransactionForm transaction={modal.transaction} ledgers={ledgers} defaultCurrency={currency} onSave={saveTransaction} onClose={() => setModal(null)} />}
    {modal?.kind === 'ledgers' && <LedgerManager ledgers={ledgers} onCreate={createLedger} onRename={renameLedger} onDelete={deleteLedger} onClose={() => setModal(null)} />}
  </main>
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
