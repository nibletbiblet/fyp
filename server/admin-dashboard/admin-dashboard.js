const els = {
  statusText: document.getElementById('statusText'),
  refreshBtn: document.getElementById('refreshBtn'),
  pageContent: document.getElementById('pageContent'),
}

let dashboardData = null

const pageMeta = {
  overview: ['Admin Overview', 'Platform Operations', 'Summary of payment, settlement, payout, risk, and system health.'],
  payments: ['Payments', 'Payment Monitoring', 'All recent customer crypto payments across merchants.'],
  conversions: ['Conversions', 'Simulated ETH-to-SGD Conversion', 'Accounting-only conversion records. Testnet ETH is recycled; no real SGD is created.'],
  settlements: ['Settlements', 'Settlement Monitoring', 'Converted SGD settlement records before and after payout batching.'],
  payouts: ['Merchant Payouts', 'Payout Batches', 'Merchant payout batches and simulated provider references.'],
  merchants: ['Merchants', 'Merchant Management', 'Merchant accounts, KYC state, and payout totals.'],
  risk: ['Risk & Compliance', 'Compliance Queue', 'Flagged wallets, high-risk payments, and manual review decisions.'],
  activity: ['System Activity', 'System Operations', 'Worker status and recent audit log actions.'],
}

const sectionFromHash = () => {
  const requested = window.location.hash.replace('#', '')
  return pageMeta[requested] ? requested : 'overview'
}

let activeSection = sectionFromHash()

const money = (value) => `S$ ${Number(value || 0).toFixed(2)}`
const short = (value, size = 10) => value ? `${String(value).slice(0, size)}...` : '-'
const dateTime = (value) => value ? new Date(value).toLocaleString() : '-'

const badgeClass = (status = '') => {
  if (['ACTIVE_ONBOARDED', 'APPROVED', 'CONFIRMED', 'CONVERTED_TO_SGD', 'SETTLED', 'PAID_OUT', 'ALLOW', 'LOW'].includes(status)) return 'good'
  if (['PENDING', 'DETECTED', 'CONFIRMING', 'SETTLEMENT_PENDING', 'KYC_REQUIRED', 'MANUAL_REVIEW', 'MANUAL_REVIEW_REQUIRED', 'MEDIUM', 'HIGH', 'ENABLED'].includes(status)) return 'warn'
  if (['SUSPENDED', 'FAILED', 'EXPIRED', 'REJECT', 'REJECTED', 'CRITICAL', 'HELD'].includes(status)) return 'bad'
  return ''
}

const badge = (status) => `<span class="badge ${badgeClass(status)}">${String(status || '-').replaceAll('_', ' ')}</span>`

const parseReason = (raw) => {
  if (!raw) return 'No reason recorded'
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((item) => item.message || item.code).filter(Boolean).join('; ')
    }
  } catch {
    return String(raw)
  }
  return 'No reason recorded'
}

const panel = (title, count, body, wide = true) => `
  <div class="panel table-panel ${wide ? 'wide' : ''}">
    <div class="panel-header">
      <h3>${title}</h3>
      <span>${count}</span>
    </div>
    ${body}
  </div>
`

const table = (headers, rows, emptyText) => `
  <div class="table-scroll">
    <table>
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="empty">${emptyText}</td></tr>`}</tbody>
    </table>
  </div>
`

function updateTopbar() {
  const [eyebrow, title, status] = pageMeta[activeSection]
  document.querySelector('.eyebrow').textContent = eyebrow
  document.querySelector('.topbar h2').textContent = title
  els.statusText.textContent = dashboardData ? status : 'Loading admin dashboard...'
}

function renderSummaryCards(stats) {
  const cards = [
    ['Total Payment Volume', money(stats.totalPaymentVolume), `${stats.totalPayments} total payment records`],
    ['Confirmed Payments', stats.confirmedPayments, 'Confirmed, converted, settled, or paid out'],
    ['Pending Conversions', stats.pendingConversions, 'Simulated ETH-to-SGD conversion queue'],
    ['Completed Conversions', stats.completedConversions, 'Testnet ETH returned to faucet after accounting conversion'],
    ['Pending Settlements', stats.pendingSettlements, `${money(stats.totalSettlementValue)} net settlement value`],
    ['Completed Payouts', stats.completedPayouts, `${money(stats.totalPayoutValue)} total paid out via Stripe Sandbox`],
    ['Failed / Flagged', stats.failedOrFlagged, 'Failed payments plus flagged risk cases'],
    ['Active Merchants', stats.activeMerchants, `${stats.totalMerchants} total merchant records`],
  ]

  return `<section class="summary-grid">${cards.map(([label, value, note]) => `
    <article class="summary-card">
      <div class="summary-label">${label}</div>
      <div class="summary-value">${value}</div>
      <div class="summary-note">${note}</div>
    </article>
  `).join('')}</section>`
}

function renderPaymentStatus(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  if (rows.length === 0) return '<div class="empty">No payment statuses yet.</div>'

  return `<div class="status-chart">${rows.map((row) => {
    const count = Number(row.count || 0)
    const pct = total > 0 ? Math.round((count / total) * 100) : 0
    return `
      <div class="status-row">
        <span>${String(row.status).replaceAll('_', ' ')}</span>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <span class="mono">${count}</span>
      </div>`
  }).join('')}</div>`
}

function paymentRows(rows) {
  return rows.map((row) => `
    <tr>
      <td class="mono">${short(row.payment_id, 8)}</td>
      <td class="mono">${short(row.customer_wallet, 12)}</td>
      <td>${row.merchant_name || '-'}</td>
      <td>${money(row.amount_sgd)}</td>
      <td>${row.expected_crypto_amount ? `${Number(row.expected_crypto_amount).toFixed(6)} expected` : '-'}<br />${row.received_crypto_amount ? `${Number(row.received_crypto_amount).toFixed(6)} received` : '0 received'}</td>
      <td class="mono">${short(row.tx_hash, 12)}</td>
      <td>${badge(row.status)}</td>
      <td>${dateTime(row.created_at)}</td>
    </tr>`)
}

function settlementRows(rows) {
  return rows.map((row) => `
    <tr>
      <td class="mono">${short(row.settlement_id, 8)}</td>
      <td>${row.merchant_name || '-'}</td>
      <td>${money(row.gross_sgd_amount)}</td>
      <td>${money(row.provider_fee_sgd)}</td>
      <td>${money(row.platform_fee_sgd)}</td>
      <td>${money(row.net_settlement_sgd_amount)}</td>
      <td>${badge(row.status)}</td>
      <td class="mono">${row.provider_reference || '-'}</td>
      <td>${dateTime(row.created_at)}</td>
    </tr>`)
}

function conversionRows(rows) {
  return rows.map((row) => `
    <tr>
      <td class="mono">${short(row.conversion_id, 8)}</td>
      <td class="mono">${short(row.payment_id, 8)}</td>
      <td>${row.quote_exchange_rate ? money(row.quote_exchange_rate) : '-'}</td>
      <td>${row.conversion_exchange_rate ? money(row.conversion_exchange_rate) : '-'}</td>
      <td>${money(row.quoted_fiat_amount)}</td>
      <td>${money(row.actual_fiat_proceeds)}</td>
      <td class="${Number(row.conversion_gain_loss || 0) < 0 ? 'loss' : 'gain'}">${money(row.conversion_gain_loss)}</td>
      <td class="mono">${short(row.faucet_return_tx_hash, 12)}</td>
      <td>${badge(row.status)}</td>
      <td>${dateTime(row.converted_at || row.created_at)}</td>
    </tr>`)
}

function payoutRows(rows) {
  return rows.map((row) => `
    <tr>
      <td class="mono">${short(row.payout_id, 8)}</td>
      <td>${row.merchant_name || '-'}</td>
      <td>${row.settlement_count || 0}</td>
      <td>${money(row.gross_sgd_amount)}</td>
      <td>${money(row.payout_fee_sgd)}</td>
      <td>${money(row.net_payout_sgd_amount)}</td>
      <td>${badge(row.status)}</td>
      <td class="mono">${row.stripe_transfer_id || row.provider_reference || row.payout_reference || '-'}</td>
      <td class="mono">${row.stripe_payout_id || '-'}</td>
      <td>${dateTime(row.paid_out_at)}</td>
    </tr>`)
}

function merchantRows(rows) {
  return rows.map((row) => `
    <tr>
      <td>${row.name || '-'}</td>
      <td>${row.email || '-'}</td>
      <td>${badge(row.status)}</td>
      <td>${badge(row.kyc_status)}</td>
      <td>${row.payout_enabled ? badge('ENABLED') : badge('HELD')}</td>
      <td class="mono">${row.stripe_connected_account_id || '-'}</td>
      <td>${money(row.total_transaction_value)}</td>
      <td>${money(row.total_payouts)}</td>
      <td><button class="mini-button" type="button" disabled>View</button></td>
    </tr>`)
}

function flaggedCards(rows) {
  if (rows.length === 0) return '<div class="empty">No flagged transactions.</div>'
  return `<div class="flagged-list">${rows.map((row) => `
    <article class="flagged-item">
      <div class="item-title">${row.payment_reference || short(row.payment_id, 8)} ${badge(row.decision)}</div>
      <div class="item-meta">
        ${row.merchant_name || '-'} - ${money(row.amount_sgd)} - ${row.risk_level} risk<br />
        Wallet: <span class="mono">${short(row.wallet_address, 18)}</span><br />
        ${parseReason(row.reasons)}
      </div>
    </article>`).join('')}</div>`
}

function activityCards(systemActivity) {
  const rows = systemActivity.recentActivity || []
  if (rows.length === 0) return '<div class="empty">No system activity yet.</div>'
  return `<div class="activity-list">${rows.map((row) => `
    <article class="activity-item">
      <div class="item-title">${String(row.action || '-').replaceAll('_', ' ')}</div>
      <div class="item-meta">
        ${dateTime(row.created_at)}
        ${row.payment_id ? ` - payment ${short(row.payment_id, 8)}` : ''}
        ${row.settlement_id ? ` - settlement ${short(row.settlement_id, 8)}` : ''}
        ${row.payout_id ? ` - payout ${short(row.payout_id, 8)}` : ''}
      </div>
    </article>`).join('')}</div>`
}

function renderOverview(data) {
  return `
    <div class="notice">Simulated ETH-to-SGD conversion / Stripe Sandbox payout / Testnet ETH returned to faucet / No real funds transferred</div>
    ${renderSummaryCards(data.stats)}
    <section class="content-grid">
      ${panel('Payment Status', `${data.paymentStatuses.length} statuses`, renderPaymentStatus(data.paymentStatuses), false)}
      ${panel('Flagged Transactions', `${data.flaggedTransactions.length} records`, flaggedCards(data.flaggedTransactions), false)}
      ${panel('Recent Payments', `${data.recentPayments.length} records`, table(['Payment ID', 'Wallet', 'Merchant', 'SGD', 'Crypto', 'Tx Hash', 'Status', 'Created'], paymentRows(data.recentPayments), 'No payments yet.'))}
      ${panel('Recent Payouts', `${data.recentPayouts.length} records`, table(['Payout Batch', 'Merchant', 'Settlements', 'Gross', 'Fee', 'Net', 'Status', 'Stripe Transfer ID', 'Stripe Payout ID', 'Paid Out'], payoutRows(data.recentPayouts), 'No payouts yet.'))}
    </section>`
}

function renderPage() {
  if (!dashboardData) return
  updateTopbar()
  const data = dashboardData
  if (activeSection === 'overview') {
    els.pageContent.innerHTML = renderOverview(data)
    return
  }
  if (activeSection === 'payments') {
    els.pageContent.innerHTML = panel('Payments', `${data.recentPayments.length} records`, table(['Payment ID', 'Customer Wallet', 'Merchant', 'SGD Amount', 'Expected / Received ETH', 'Transaction Hash', 'Payment Status', 'Created Date'], paymentRows(data.recentPayments), 'No payments yet.'))
    return
  }
  if (activeSection === 'conversions') {
    els.pageContent.innerHTML = `
      <div class="notice">Simulated ETH-to-SGD conversion. Sepolia ETH is testnet-only and is returned to faucet for recycling.</div>
      ${panel('Conversions', `${data.recentConversions.length} records`, table(['Conversion ID', 'Payment ID', 'Quoted Rate', 'Conversion Rate', 'Quoted Fiat', 'Actual Fiat Proceeds', 'Gain / Loss', 'Faucet Return Tx', 'Status', 'Converted Date'], conversionRows(data.recentConversions), 'No conversion records yet.'))}`
    return
  }
  if (activeSection === 'settlements') {
    els.pageContent.innerHTML = panel('Settlements', `${data.recentSettlements.length} records`, table(['Settlement ID', 'Merchant', 'Gross SGD', 'Provider Fee', 'Platform Fee', 'Net Settlement', 'Status', 'Provider Reference', 'Created Date'], settlementRows(data.recentSettlements), 'No settlements yet.'))
    return
  }
  if (activeSection === 'payouts') {
    els.pageContent.innerHTML = `
      <div class="notice">Stripe Sandbox payout. Sepolia ETH does not fund Stripe; this is backend accounting simulation only.</div>
      ${panel('Merchant Payouts', `${data.recentPayouts.length} records`, table(['Payout Batch ID', 'Merchant', 'Settlements', 'Gross Payout', 'Payout Fee', 'Net Payout', 'Payout Status', 'Stripe Transfer ID', 'Stripe Payout ID', 'Paid-out Time'], payoutRows(data.recentPayouts), 'No payout batches yet.'))}`
    return
  }
  if (activeSection === 'merchants') {
    els.pageContent.innerHTML = panel('Merchants', `${data.merchants.length} records`, table(['Merchant Name', 'Email', 'Account Status', 'KYC Status', 'Payout Status', 'Stripe Connected Account', 'Total Transaction Value', 'Total Payouts', 'Actions'], merchantRows(data.merchants), 'No merchants yet.'))
    return
  }
  if (activeSection === 'risk') {
    els.pageContent.innerHTML = panel('Risk & Compliance', `${data.flaggedTransactions.length} records`, flaggedCards(data.flaggedTransactions))
    return
  }
  if (activeSection === 'activity') {
    els.pageContent.innerHTML = panel('System Activity', `Worker: ${data.systemActivity.settlementWorker || 'UNKNOWN'}`, activityCards(data.systemActivity))
  }
}

async function loadOverview() {
  updateTopbar()
  els.refreshBtn.disabled = true
  try {
    const res = await fetch('/api/admin-dashboard/overview', { credentials: 'include' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load admin dashboard')
    dashboardData = data
    renderPage()
  } catch (err) {
    els.statusText.textContent = err.message || 'Failed to load admin dashboard.'
  } finally {
    els.refreshBtn.disabled = false
  }
}

function setActiveSection(section) {
  activeSection = pageMeta[section] ? section : 'overview'
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.section === activeSection)
  })
  renderPage()
}

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault()
    const section = button.dataset.section
    if (window.location.hash === `#${section}`) {
      setActiveSection(section)
      return
    }
    window.location.hash = section
  })
})

window.addEventListener('hashchange', () => {
  setActiveSection(sectionFromHash())
})

setActiveSection(activeSection)
els.refreshBtn.addEventListener('click', loadOverview)
loadOverview()
