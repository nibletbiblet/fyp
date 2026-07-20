const state = {
  cases: [],
  selectedPaymentId: null
};

const els = {
  statusText: document.querySelector("#statusText"),
  refreshBtn: document.querySelector("#refreshBtn"),
  caseFilter: document.querySelector("#caseFilter"),
  caseList: document.querySelector("#caseList"),
  pendingList: document.querySelector("#pendingList"),
  completedList: document.querySelector("#completedList"),
  selectedBadge: document.querySelector("#selectedBadge"),
  caseDetail: document.querySelector("#caseDetail"),
  reviewSummary: document.querySelector("#reviewSummary"),
  reviewReason: document.querySelector("#reviewReason"),
  rejectBtn: document.querySelector("#rejectBtn"),
  approveBtn: document.querySelector("#approveBtn"),
  poiPreviewBox: document.querySelector("#poiPreviewBox")
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badge(status) {
  const safe = escapeHtml(status || "unknown");
  const cls = safe === "VERIFIED" ? "verified" : safe === "REJECTED" || safe === "REJECT" || safe === "CRITICAL" ? "blocked" : safe === "NONE" ? "muted" : "pending";
  return `<span class="badge ${cls}">${safe.replaceAll("_", " ")}</span>`;
}

function money(value) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(Number(value || 0));
}

function selectedCase() {
  return state.cases.find((item) => item.paymentId === state.selectedPaymentId);
}

function renderCaseItem(item, className = "customer-item") {
  return `
    <article class="${className} ${item.paymentId === state.selectedPaymentId ? "active" : ""}" data-id="${escapeHtml(item.paymentId)}">
      <div class="item-title">
        <span>${escapeHtml(item.customer?.name || item.paymentReference)}</span>
        ${badge(item.status)}
      </div>
      <div class="item-meta">${escapeHtml(item.customer?.email || "No customer email")}</div>
      <div class="item-meta">${escapeHtml(item.paymentReference)} | ${money(item.amountSgd)}</div>
    </article>
  `;
}

function bindCaseClicks() {
  document.querySelectorAll("[data-id]").forEach((item) => {
    item.addEventListener("click", () => {
      state.selectedPaymentId = item.dataset.id;
      render();
    });
  });
}

function renderLists() {
  const filter = els.caseFilter.value.trim().toLowerCase();
  const filtered = state.cases.filter((item) => {
    const haystack = `${item.paymentReference} ${item.customer?.email || ""} ${item.customer?.name || ""}`.toLowerCase();
    return haystack.includes(filter);
  });

  els.caseList.innerHTML = filtered.length
    ? filtered.map((item) => renderCaseItem(item)).join("")
    : `<div class="detail-empty">No identity review cases found.</div>`;

  const pending = state.cases.filter((item) => item.status !== "VERIFIED" && item.status !== "REJECTED");
  const completed = state.cases.filter((item) => item.status === "VERIFIED" || item.status === "REJECTED");

  els.pendingList.innerHTML = pending.length
    ? pending.map((item) => renderCaseItem(item, "identity-item sidebar-customer")).join("")
    : `<div class="result-box">No pending cases.</div>`;
  els.completedList.innerHTML = completed.length
    ? completed.map((item) => renderCaseItem(item, "identity-item sidebar-customer")).join("")
    : `<div class="result-box">No completed cases.</div>`;

  bindCaseClicks();
}

function kv(label, value) {
  return `<div class="kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`;
}

function renderRiskRules(item) {
  const rules = item.risk?.rules || [];
  if (!item.risk) {
    return `<div class="result-box">No risk assessment linked to this case.</div>`;
  }
  if (!rules.length) {
    return `<div class="result-box">No risk policy rules were triggered.</div>`;
  }
  return `
    <div class="rule-list">
      ${rules.map((rule) => `
        <div class="rule-row">
          <span>${escapeHtml(rule.message || rule.code)}</span>
          <strong class="rule-severity ${escapeHtml(String(rule.severity || "").toLowerCase())}">
            ${escapeHtml(rule.severity || "policy")}
          </strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDetail() {
  const item = selectedCase();
  if (!item) {
    els.selectedBadge.className = "badge muted";
    els.selectedBadge.textContent = "None";
    els.caseDetail.className = "detail-empty";
    els.caseDetail.textContent = "Select an identity review case.";
    els.reviewSummary.textContent = "Select an identity review case.";
    els.poiPreviewBox.textContent = "No POI selected.";
    els.approveBtn.disabled = true;
    els.rejectBtn.disabled = true;
    return;
  }

  els.selectedBadge.className = `badge ${item.status === "VERIFIED" ? "verified" : item.status === "REJECTED" ? "blocked" : "pending"}`;
  els.selectedBadge.textContent = item.status.replaceAll("_", " ");
  els.caseDetail.className = "";
  els.caseDetail.innerHTML = `
    <div class="detail-grid">
      ${kv("Payment", item.paymentReference)}
      ${kv("Amount", money(item.amountSgd))}
      ${kv("Customer", item.customer?.name)}
      ${kv("Email", item.customer?.email)}
      ${kv("DOB", item.customer?.dob)}
      ${kv("Country", item.customer?.countryCode)}
      ${kv("Singpass", item.singpass?.status)}
      ${kv("POI", item.poi?.status)}
      ${kv("Risk Level", item.risk?.riskLevel)}
      ${kv("Risk Decision", item.risk?.decision?.replaceAll("_", " "))}
    </div>
    <div class="record-section">
      <h3>Risk Policy Rules</h3>
      ${renderRiskRules(item)}
    </div>
    ${item.poi?.declinedReason ? `<div class="result-box">${escapeHtml(item.poi.declinedReason)}</div>` : ""}
  `;

  const canApprove = item.singpass?.status === "VERIFIED" && item.poi?.status === "PENDING_REVIEW";
  const canReject = item.poi?.status === "PENDING_REVIEW";
  els.approveBtn.disabled = !canApprove;
  els.rejectBtn.disabled = !canReject;
  els.reviewSummary.innerHTML = `
    <strong>${escapeHtml(item.customer?.name || "Unknown customer")}</strong><br />
    ${escapeHtml(item.paymentReference)} is waiting for identity review.<br />
    Approval requires mock Singpass VERIFIED and POI PENDING REVIEW. Approved cases allow the payment flow to continue.
  `;
  els.poiPreviewBox.innerHTML = item.poi?.previewDataUrl
    ? `<img class="poi-preview" src="${item.poi.previewDataUrl}" alt="Uploaded POI preview" />`
    : "No POI uploaded.";
}

function render() {
  renderLists();
  renderDetail();
}

async function loadCases() {
  els.statusText.textContent = "Loading identity review cases...";
  const data = await request("/api/identity-review/cases");
  state.cases = data.cases || [];
  if (!state.selectedPaymentId && state.cases[0]) {
    state.selectedPaymentId = state.cases[0].paymentId;
  }
  if (!state.cases.some((item) => item.paymentId === state.selectedPaymentId)) {
    state.selectedPaymentId = state.cases[0]?.paymentId || null;
  }
  els.statusText.textContent = `${state.cases.length} identity review case(s) loaded`;
  render();
}

async function submitReview(status) {
  const item = selectedCase();
  if (!item) return;
  const reason = els.reviewReason.value.trim();
  if (status === "DECLINED" && !reason) {
    els.statusText.textContent = "Enter a rejection reason first.";
    return;
  }

  await request(`/api/identity-review/payments/${encodeURIComponent(item.paymentId)}/review`, {
    method: "POST",
    body: JSON.stringify({ status, reason: reason || null })
  });
  els.reviewReason.value = "";
  await loadCases();
  els.statusText.textContent = status === "ACCEPTED" ? "POI approved. Customer can continue payment." : "POI rejected.";
}

els.refreshBtn.addEventListener("click", () => loadCases().catch((error) => (els.statusText.textContent = error.message)));
els.caseFilter.addEventListener("input", render);
els.approveBtn.addEventListener("click", () => submitReview("ACCEPTED").catch((error) => (els.statusText.textContent = error.message)));
els.rejectBtn.addEventListener("click", () => submitReview("DECLINED").catch((error) => (els.statusText.textContent = error.message)));

loadCases().catch((error) => {
  els.statusText.textContent = error.message;
});
