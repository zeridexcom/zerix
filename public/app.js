// Zerix — WhatsApp Multi-Page Application Logic & Resilience Engine

let allRequests = [];
let allFeedback = [];
let backendOnline = true;
let openwaConnected = false;
let diagnosticCollapsed = false;

let serverConfig = {
  port: 3001,
  businessName: 'zerix',
  reviewUrl: 'https://share.google/LwOYT2Dn1YjKGqlKt',
  followUpDays: 3,
  openwaConfigured: true,
  openwaUrl: 'http://localhost:2886',
};

let templates = {
  whatsapp: '',
  email: '',
  sms: '',
};

let activeTab = 'dashboard';
let activeFilter = 'all';
let searchQuery = '';
let currentChannel = 'whatsapp';
let parsedBulkContacts = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.allSettled([
    fetchConfig(),
    fetchTemplates(),
    fetchData(),
    fetchFeedbackData(false),
    checkOpenWAStatus(false),
  ]);

  updateSimulatorPreview();

  // Polling every 5 seconds for live database & server synchronization
  setInterval(() => {
    fetchData(false);
    fetchFeedbackData(false);
  }, 5000);

  // Polling OpenWA health every 15 seconds
  setInterval(() => {
    checkOpenWAStatus(false);
  }, 15000);

  // Keyboard shortcut: Cmd/Ctrl + Enter to send when in Send tab
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (activeTab === 'send') {
        submitDispatchForm();
      }
    }
  });
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-[#008069] text-white border-[#25d366]',
    error: 'bg-[#ea0038] text-white border-rose-400',
    info: 'bg-[#111b21] text-white border-slate-700',
    warning: 'bg-amber-600 text-white border-amber-400',
  };
  const icons = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
    warning: 'warning',
  };

  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold border pointer-events-auto transition-all transform translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-[18px]">${icons[type] || 'info'}</span>
    <span class="flex-1">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Clipboard copy helper
function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

// Dedicated Page Switcher
function switchTab(tabId) {
  activeTab = tabId;
  const tabs = ['dashboard', 'send', 'bulk', 'followups', 'templates', 'config', 'api'];

  tabs.forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const topTab = document.getElementById(`tab-${t}`);
    const sideBtn = document.getElementById(`sidebar-btn-${t}`);

    if (t === tabId) {
      if (view) view.classList.remove('hidden');
      if (topTab) {
        topTab.className = 'nav-tab-active px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all';
      }
      if (sideBtn) {
        sideBtn.className = 'sidebar-item-active w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-all text-left';
      }
    } else {
      if (view) view.classList.add('hidden');
      if (topTab) {
        topTab.className = 'nav-tab-inactive px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all';
      }
      if (sideBtn) {
        sideBtn.className = 'sidebar-item-inactive w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-all text-left';
      }
    }
  });

  // Close mobile sidebar after tab switch
  const sidebar = document.getElementById('app-sidebar');
  if (sidebar && !sidebar.classList.contains('-translate-x-full') && window.innerWidth < 768) {
    sidebar.classList.add('-translate-x-full');
  }

  if (tabId === 'followups') {
    renderFollowupsHubTable();
  } else if (tabId === 'send') {
    updateSimulatorPreview();
  }
}

// Mobile sidebar toggle
function toggleMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('-translate-x-full');
}

// OpenWA Diagnostic toggle
function toggleOpenwaDiagnostic(forceExpand = false) {
  const content = document.getElementById('diagnostic-content');
  const chevron = document.getElementById('diagnostic-chevron');
  if (!content) return;

  if (forceExpand) {
    content.classList.remove('hidden');
    if (chevron) chevron.textContent = 'expand_more';
    diagnosticCollapsed = false;
    switchTab('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  diagnosticCollapsed = !diagnosticCollapsed;
  if (diagnosticCollapsed) {
    content.classList.add('hidden');
    if (chevron) chevron.textContent = 'expand_less';
  } else {
    content.classList.remove('hidden');
    if (chevron) chevron.textContent = 'expand_more';
  }
}

// Update Server & Connection Status UI
function updateServerStatusUI(online) {
  backendOnline = online;
  const banner = document.getElementById('backend-offline-banner');
  const headerIndicator = document.getElementById('header-gateway-indicator');
  const headerInfo = document.getElementById('header-gateway-info');

  if (banner) {
    if (online) banner.classList.add('hidden');
    else banner.classList.remove('hidden');
  }

  if (!online) {
    if (headerIndicator) headerIndicator.className = 'w-2 h-2 rounded-full bg-[#ea0038] shadow-[0_0_6px_#ea0038]';
    if (headerInfo) headerInfo.textContent = 'Backend Offline (Local Mode)';
  } else if (!openwaConnected) {
    if (headerIndicator) headerIndicator.className = 'w-2 h-2 rounded-full bg-[#25d366]';
    if (headerInfo) headerInfo.textContent = 'WhatsApp Direct';
  }
}

// Live Gateway & QR State
let latestQrDataUrl = null;
let qrPollInterval = null;
let linkedPhone = null;

// Check OpenWA Live Status (Baileys Multi-Device)
async function checkOpenWAStatus(notify = false) {
  const card = document.getElementById('openwa-diagnostic-card');
  const sideCard = document.getElementById('sidebar-gateway-card');
  const sideDot = document.getElementById('sidebar-gateway-dot');
  const sideTitle = document.getElementById('sidebar-gateway-title');
  const sideDesc = document.getElementById('sidebar-gateway-desc');
  const cfgStatusDisp = document.getElementById('cfg-openwa-status-disp');
  const metricProvider = document.getElementById('metric-provider-name');
  const metricDetail = document.getElementById('metric-provider-detail');

  // Composer Gateway Card Elements
  const compCard = document.getElementById('composer-gateway-status-card');
  const compDot = document.getElementById('composer-gw-dot');
  const compTitle = document.getElementById('composer-gw-title');
  const compDesc = document.getElementById('composer-gw-desc');
  const compBtn = document.getElementById('composer-gw-btn');
  const compBtnText = document.getElementById('composer-gw-btn-text');

  // QR Modal Elements
  const qrLoading = document.getElementById('qr-modal-loading');
  const qrConnected = document.getElementById('qr-modal-connected');
  const qrConnectedPhone = document.getElementById('qr-modal-connected-phone');
  const qrScanBox = document.getElementById('qr-modal-scan-box');
  const qrImg = document.getElementById('qr-modal-img');

  try {
    const res = await fetch('/api/openwa/status', { signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();

    if (data.connected) {
      openwaConnected = true;
      linkedPhone = data.activePhone || null;
      if (card) card.classList.add('hidden');

      if (sideDot) sideDot.className = 'w-2 h-2 rounded-full bg-[#25d366] shadow-[0_0_6px_#25d366]';
      if (sideTitle) sideTitle.textContent = 'WhatsApp Linked';
      if (sideDesc) sideDesc.textContent = `+${data.activePhone || 'ready'}`;

      if (cfgStatusDisp) {
        cfgStatusDisp.className = 'font-bold text-emerald-600';
        cfgStatusDisp.textContent = `🟢 Connected (+${data.activePhone || 'ready'})`;
      }
      if (metricProvider) metricProvider.textContent = 'WhatsApp Gateway';
      if (metricDetail) metricDetail.textContent = `+${data.activePhone || 'ready'} (Background)`;

      const headerInfo = document.getElementById('header-gateway-info');
      if (headerInfo && backendOnline) headerInfo.textContent = `WhatsApp: +${data.activePhone || 'ready'}`;

      // Update composer card to active green
      if (compCard) compCard.className = 'p-3 rounded-xl border border-emerald-300 bg-emerald-50/80 flex items-center justify-between text-xs transition-all';
      if (compDot) compDot.className = 'w-2.5 h-2.5 rounded-full bg-[#25d366] shadow-[0_0_6px_#25d366]';
      if (compTitle) compTitle.textContent = `🟢 WhatsApp Linked (+${data.activePhone || 'ready'})`;
      if (compDesc) compDesc.textContent = 'Direct background dispatch active. Messages land straight in customer WhatsApp.';
      if (compBtnText) compBtnText.textContent = 'Manage';

      // Update QR modal to connected view
      if (qrLoading) qrLoading.classList.add('hidden');
      if (qrScanBox) qrScanBox.classList.add('hidden');
      if (qrConnected) {
        qrConnected.classList.remove('hidden');
        if (qrConnectedPhone) qrConnectedPhone.textContent = `+${data.activePhone || 'ready'}`;
      }

      if (notify) showToast(`WhatsApp Gateway connected (+${data.activePhone || 'ready'})`, 'success');

    } else if (data.sessionStatus === 'scan_qr' || data.qrDataUrl) {
      openwaConnected = false;
      latestQrDataUrl = data.qrDataUrl || null;
      if (card) card.classList.add('hidden');

      if (sideDot) sideDot.className = 'w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6] animate-pulse';
      if (sideTitle) sideTitle.textContent = 'Pair WhatsApp';
      if (sideDesc) sideDesc.textContent = 'Scan QR to Link';

      if (cfgStatusDisp) {
        cfgStatusDisp.className = 'font-bold text-blue-600';
        cfgStatusDisp.innerHTML = 'Scan QR Code Required · <button onclick="openWhatsAppQrModal()" class="underline font-bold text-[#008069]">Open QR Scanner</button>';
      }
      if (metricProvider) metricProvider.textContent = 'WhatsApp Direct';
      if (metricDetail) metricDetail.textContent = 'Scan QR to automate';

      const headerInfo = document.getElementById('header-gateway-info');
      if (headerInfo && backendOnline) headerInfo.textContent = 'WhatsApp: Scan QR';

      // Update composer card to prompt QR scan
      if (compCard) compCard.className = 'p-3 rounded-xl border border-blue-200 bg-blue-50/70 flex items-center justify-between text-xs transition-all';
      if (compDot) compDot.className = 'w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse';
      if (compTitle) compTitle.textContent = '📱 WhatsApp Permission Required';
      if (compDesc) compDesc.textContent = 'Scan QR code with your phone to enable direct background dispatch.';
      if (compBtnText) compBtnText.textContent = 'Scan QR';

      // Update QR modal
      if (qrLoading) qrLoading.classList.add('hidden');
      if (qrConnected) qrConnected.classList.add('hidden');
      if (qrScanBox && data.qrDataUrl) {
        qrScanBox.classList.remove('hidden');
        if (qrImg) qrImg.src = data.qrDataUrl;
      }

      if (notify) showToast('Scan QR code to authorize WhatsApp background sending', 'info');

    } else {
      openwaConnected = false;
      if (card) card.classList.remove('hidden');
      if (sideDot) sideDot.className = 'w-2 h-2 rounded-full bg-amber-500';
      if (sideTitle) sideTitle.textContent = 'OpenWA Offline';
      if (sideDesc) sideDesc.textContent = 'Direct wa.me active';

      if (cfgStatusDisp) {
        cfgStatusDisp.className = 'font-bold text-amber-600';
        cfgStatusDisp.textContent = 'Offline (Port 2886 connection refused)';
      }
      if (metricProvider) metricProvider.textContent = 'WhatsApp Direct';
      if (metricDetail) metricDetail.textContent = 'wa.me 1-click links';

      const headerInfo = document.getElementById('header-gateway-info');
      if (headerInfo && backendOnline) headerInfo.textContent = 'WhatsApp Direct';

      if (compCard) compCard.className = 'p-3 rounded-xl border border-amber-200 bg-amber-50/70 flex items-center justify-between text-xs transition-all';
      if (compDot) compDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
      if (compTitle) compTitle.textContent = 'Direct WhatsApp Mode';
      if (compDesc) compDesc.textContent = '1-click wa.me links active. Background gateway is currently offline.';
      if (compBtnText) compBtnText.textContent = 'Fix';

      if (notify) showToast('OpenWA Gateway offline — Direct WhatsApp mode active', 'warning');
    }
  } catch (err) {
    openwaConnected = false;
    if (card) card.classList.remove('hidden');
    if (sideDot) sideDot.className = 'w-2 h-2 rounded-full bg-amber-500';
    if (sideTitle) sideTitle.textContent = 'OpenWA Offline';
    if (sideDesc) sideDesc.textContent = 'Direct wa.me active';
    if (cfgStatusDisp) {
      cfgStatusDisp.className = 'font-bold text-amber-600';
      cfgStatusDisp.textContent = 'Unreachable (Check port 2886)';
    }
    if (notify) showToast('Could not reach OpenWA — using Direct WhatsApp links', 'warning');
  }
}

// Open WhatsApp QR Code Pairing Modal
function openWhatsAppQrModal() {
  const modal = document.getElementById('whatsapp-qr-modal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Trigger immediate status check
  checkOpenWAStatus();

  // Poll while modal is open to auto-close when paired
  if (!qrPollInterval) {
    qrPollInterval = setInterval(async () => {
      await checkOpenWAStatus();
      if (openwaConnected) {
        showToast('🎉 WhatsApp linked successfully!', 'success');
      }
    }, 2500);
  }
}

// Close WhatsApp QR Code Pairing Modal
function closeWhatsAppQrModal() {
  const modal = document.getElementById('whatsapp-qr-modal');
  if (modal) modal.classList.add('hidden');
  if (qrPollInterval) {
    clearInterval(qrPollInterval);
    qrPollInterval = null;
  }
}

// Refresh QR Code
async function refreshQrCode() {
  const loading = document.getElementById('qr-modal-loading');
  const scanBox = document.getElementById('qr-modal-scan-box');
  if (loading) loading.classList.remove('hidden');
  if (scanBox) scanBox.classList.add('hidden');
  await checkOpenWAStatus();
}

// Unlink / Logout WhatsApp Device
async function unlinkWhatsAppDevice() {
  if (!confirm('Unlink this WhatsApp account and reset gateway? You will need to scan the QR code again to reconnect.')) return;
  try {
    const res = await fetch('/api/openwa/logout', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'WhatsApp account unlinked', 'info');
    await checkOpenWAStatus();
  } catch (e) {
    showToast('Failed to unlink: ' + e.message, 'error');
  }
}

// Fetch Configuration from .env via /api/config
async function fetchConfig() {
  try {
    const res = await fetch('/api/config', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('Config fetch failed');
    serverConfig = await res.json();
    updateServerStatusUI(true);

    const brandName = serverConfig.businessName || 'zerix';
    const reviewUrl = serverConfig.reviewUrl || '';
    const followUpDays = serverConfig.followUpDays || 3;

    // Header & Avatar
    const hBrand = document.getElementById('header-brand-name');
    if (hBrand) hBrand.textContent = brandName;

    const initial = brandName.charAt(0).toUpperCase() || 'Z';
    const hAvatar = document.getElementById('header-avatar-initials');
    if (hAvatar) hAvatar.textContent = initial;

    const sAvatar = document.getElementById('sidebar-biz-initial');
    if (sAvatar) sAvatar.textContent = initial;

    const sBiz = document.getElementById('sidebar-biz-name');
    if (sBiz) sBiz.textContent = brandName;

    const simAvatar = document.getElementById('sim-avatar');
    if (simAvatar) simAvatar.textContent = initial;

    const simBiz = document.getElementById('sim-biz-name');
    if (simBiz) simBiz.textContent = brandName;

    const simBubbleBiz = document.getElementById('sim-bubble-biz');
    if (simBubbleBiz) simBubbleBiz.textContent = brandName;

    // Review Links
    const hGoogle = document.getElementById('header-google-link');
    if (hGoogle && reviewUrl) hGoogle.href = reviewUrl;

    const simGoogle = document.getElementById('sim-review-url-btn');
    if (simGoogle && reviewUrl) simGoogle.href = reviewUrl;

    const simReviewText = document.getElementById('sim-review-url-text');
    if (simReviewText && reviewUrl) simReviewText.textContent = reviewUrl;

    const mDueDays = document.getElementById('metric-due-days-label');
    if (mDueDays) mDueDays.textContent = followUpDays;

    const fHubDays = document.getElementById('followup-page-days');
    if (fHubDays) fHubDays.textContent = followUpDays;

    // Config Page Inputs
    const cfgBiz = document.getElementById('cfg-biz-name');
    if (cfgBiz) cfgBiz.value = brandName;

    const cfgRev = document.getElementById('cfg-review-url');
    if (cfgRev) cfgRev.value = reviewUrl;

    const cfgDays = document.getElementById('cfg-followup-days');
    if (cfgDays) cfgDays.value = followUpDays;

    const cfgMgr = document.getElementById('cfg-manager-phone');
    if (cfgMgr) cfgMgr.value = serverConfig.managerPhone || '';

    const cfgWaDisp = document.getElementById('cfg-openwa-url-disp');
    if (cfgWaDisp) cfgWaDisp.textContent = serverConfig.openwaUrl || 'http://localhost:2886';

  } catch (err) {
    console.warn('Backend config offline, running in resilient mode:', err.message);
    updateServerStatusUI(false);
  }
}

// Fetch Templates
async function fetchTemplates() {
  try {
    const res = await fetch('/api/templates', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      templates = await res.json();
      const tplWa = document.getElementById('tpl-whatsapp-input');
      if (tplWa) tplWa.value = templates.whatsapp || '';

      const tplMail = document.getElementById('tpl-email-input');
      if (tplMail) tplMail.value = templates.email || '';

      const tplSms = document.getElementById('tpl-sms-input');
      if (tplSms) tplSms.value = templates.sms || '';
    }
  } catch (err) {
    console.warn('Templates fetch error (offline fallback):', err.message);
  }
}

// Fetch Real Requests & Metrics
async function fetchData(notify = false) {
  try {
    const res = await fetch('/api/requests', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('Failed to load records from server');

    allRequests = await res.json();
    updateServerStatusUI(true);

    // Save cache to localStorage for offline resilience
    try {
      localStorage.setItem('zerix_cached_requests', JSON.stringify(allRequests));
    } catch (e) {}

    updateMetrics();
    renderLedgerTable();
    if (activeTab === 'followups') {
      renderFollowupsHubTable();
    }

    if (notify) showToast('Database synchronized', 'success');
  } catch (err) {
    console.warn('Fetch requests error, checking local resilience cache:', err.message);
    updateServerStatusUI(false);

    // Load from local resilience cache if server is offline
    try {
      const cached = localStorage.getItem('zerix_cached_requests');
      if (cached) {
        allRequests = JSON.parse(cached);
      }
    } catch (e) {}

    updateMetrics();
    renderLedgerTable();
    if (activeTab === 'followups') {
      renderFollowupsHubTable();
    }
  }
}

// Calculate Metrics
function updateMetrics() {
  const total = allRequests.length;
  const now = Date.now();
  const thresholdDays = serverConfig.followUpDays || 3;
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  const sentTodayList = allRequests.filter(r => now - r.createdAt < oneDayMs);
  const waToday = sentTodayList.filter(r => r.channel === 'whatsapp').length;
  const mailToday = sentTodayList.filter(r => r.channel === 'email').length;
  const smsToday = sentTodayList.filter(r => r.channel === 'sms').length;

  const dueList = allRequests.filter(r => !r.followUpSent && (now - r.createdAt >= thresholdMs));
  const followUpSentCount = allRequests.filter(r => r.followUpSent === true).length;

  const mTotal = document.getElementById('metric-total-requests');
  if (mTotal) mTotal.textContent = total;

  const mSentToday = document.getElementById('metric-sent-today');
  if (mSentToday) mSentToday.textContent = sentTodayList.length;

  const cWa = document.getElementById('count-wa-today');
  if (cWa) cWa.textContent = `${waToday} WhatsApp`;
  const cMail = document.getElementById('count-mail-today');
  if (cMail) cMail.textContent = `${mailToday} Email`;
  const cSms = document.getElementById('count-sms-today');
  if (cSms) cSms.textContent = `${smsToday} SMS`;

  const mDue = document.getElementById('metric-due-count');
  if (mDue) mDue.textContent = dueList.length;

  const mDuePill = document.getElementById('metric-due-count-text');
  if (mDuePill) mDuePill.textContent = `${dueList.length} Due`;

  const mFollowupSent = document.getElementById('metric-followup-sent-count');
  if (mFollowupSent) mFollowupSent.textContent = followUpSentCount;

  // Header and Sidebar Due Badges
  const dueBadge = document.getElementById('due-badge');
  const sideDueBadge = document.getElementById('sidebar-due-badge');
  if (dueList.length > 0) {
    if (dueBadge) {
      dueBadge.classList.remove('hidden');
      dueBadge.textContent = dueList.length;
    }
    if (sideDueBadge) {
      sideDueBadge.classList.remove('hidden');
      sideDueBadge.textContent = `${dueList.length} Due`;
    }
  } else {
    if (dueBadge) dueBadge.classList.add('hidden');
    if (sideDueBadge) sideDueBadge.classList.add('hidden');
  }

  // Filter tab counts
  const fAll = document.getElementById('filter-count-all');
  if (fAll) fAll.textContent = total;

  const fDue = document.getElementById('filter-count-due');
  if (fDue) fDue.textContent = dueList.length;

  const fSent = document.getElementById('filter-count-sent');
  if (fSent) fSent.textContent = allRequests.filter(r => r.status === 'sent').length;

  const footerCount = document.getElementById('footer-count-text');
  if (footerCount) footerCount.textContent = total;
}

// Render Ledger Table (in Dashboard Page)
function renderLedgerTable() {
  const tbody = document.getElementById('ledger-table-body');
  if (!tbody) return;

  const now = Date.now();
  const thresholdMs = (serverConfig.followUpDays || 3) * 24 * 60 * 60 * 1000;

  let filtered = allRequests.filter(r => {
    if (activeFilter === 'due') {
      return !r.followUpSent && (now - r.createdAt >= thresholdMs);
    } else if (activeFilter === 'sent') {
      return r.status === 'sent';
    }
    return true;
  });

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(r =>
      (r.customerName && r.customerName.toLowerCase().includes(q)) ||
      (r.phone && r.phone.toLowerCase().includes(q)) ||
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.jobReference && r.jobReference.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-[#667781]">
          <span class="material-symbols-outlined text-[36px] text-slate-300 block mb-1">inbox</span>
          <p class="font-semibold text-sm">No review requests found</p>
          <p class="text-xs text-slate-400 mt-0.5">Switch to the "Send Request" tab to create your first invite.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const isDue = !r.followUpSent && (now - r.createdAt >= thresholdMs);
    const isFollowupSent = r.followUpSent;

    const initials = (r.customerName || 'C')
      .split(' ')
      .map(w => w[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    let channelBadge = '';
    if (r.channel === 'whatsapp') {
      channelBadge = `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#008069] text-[11px] font-bold font-mono">
          <span class="w-1.5 h-1.5 rounded-full bg-[#25d366]"></span> WhatsApp
        </span>
      `;
    } else if (r.channel === 'email') {
      channelBadge = `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e0f2fe] text-[#0369a1] text-[11px] font-bold font-mono">
          Email
        </span>
      `;
    } else {
      channelBadge = `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#b45309] text-[11px] font-bold font-mono">
          SMS
        </span>
      `;
    }

    let statusBadge = '';
    if (isDue) {
      statusBadge = `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#fef3c7] text-[#b45309] text-[11px] font-bold">
          Needs Reminder
        </span>
      `;
    } else if (isFollowupSent) {
      statusBadge = `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#f0f2f5] text-[#008069] text-[11px] font-semibold">
          <span class="material-symbols-outlined text-[13px]">check</span> Reminder Sent
        </span>
      `;
    } else {
      statusBadge = `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#dcfce7] text-[#15803d] text-[11px] font-semibold">
          <span class="material-symbols-outlined text-[14px]">done_all</span> Sent
        </span>
      `;
    }

    const timeAgo = formatTimeAgo(r.createdAt);
    const waLink = r.whatsappLink || (r.phone ? `https://wa.me/${r.phone.replace(/[^0-9]/g, '')}` : null);

    return `
      <tr class="hover:bg-[#f0f2f5]/70 transition-colors border-b border-[#f0f2f5]">
        <td class="pl-4 px-3 py-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-[#dcfce7] text-[#008069] font-bold flex items-center justify-center text-xs">
              ${initials}
            </div>
            <div>
              <div class="font-bold text-[#111b21]">${escapeHtml(r.customerName)}</div>
              <div class="text-[11px] font-mono text-[#667781]">
                ${escapeHtml(r.phone || r.email || '—')}
              </div>
            </div>
          </div>
        </td>
        <td class="px-3 py-3">${channelBadge}</td>
        <td class="px-3 py-3 font-mono text-[#008069] font-semibold">${escapeHtml(r.jobReference || '—')}</td>
        <td class="px-3 py-3 text-[#667781]">${timeAgo}</td>
        <td class="px-3 py-3">${statusBadge}</td>
        <td class="pr-4 px-3 py-3 text-right">
          <div class="inline-flex items-center gap-1">
            ${isDue ? `
              <button onclick="sendSingleFollowup('${r.id}')" class="px-2.5 py-1 rounded bg-[#008069] hover:bg-[#006a57] text-white text-xs font-semibold transition-colors" type="button">
                Remind
              </button>
            ` : ''}
            <a href="/r/${r.id}?stars=5" target="_blank" class="p-1 rounded hover:bg-amber-100 text-amber-600 transition-colors" title="Preview Customer 5★ 1-Tap Funnel">
              <span class="material-symbols-outlined text-[18px]">stars</span>
            </a>
            <a href="/r/${r.id}?stars=1" target="_blank" class="p-1 rounded hover:bg-rose-100 text-rose-500 transition-colors" title="Preview Customer 1★ Feedback Shield">
              <span class="material-symbols-outlined text-[18px]">shield</span>
            </a>
            ${waLink ? `
              <a href="${waLink}" target="_blank" class="p-1 rounded hover:bg-[#f0f2f5] text-[#008069]" title="Direct WhatsApp">
                <span class="material-symbols-outlined text-[18px]">chat</span>
              </a>
            ` : ''}
            <button onclick="openInspectModal('${r.id}')" class="p-1 rounded hover:bg-[#f0f2f5] text-[#667781]" title="Details">
              <span class="material-symbols-outlined text-[18px]">info</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Follow-up Hub Table
function renderFollowupsHubTable() {
  const tbody = document.getElementById('hub-due-tbody');
  if (!tbody) return;

  const now = Date.now();
  const thresholdDays = serverConfig.followUpDays || 3;
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const dueList = allRequests.filter(r => !r.followUpSent && (now - r.createdAt >= thresholdMs));

  if (dueList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-10 text-center text-[#667781]">
          <span class="material-symbols-outlined text-[32px] text-[#25d366] block mb-1">task_alt</span>
          <p class="font-semibold text-sm">All caught up!</p>
          <p class="text-xs text-slate-400 mt-0.5">No customers currently due for review reminders.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = dueList.map(r => {
    const daysPending = Math.floor((now - r.createdAt) / (24 * 60 * 60 * 1000));
    return `
      <tr class="hover:bg-[#f0f2f5]/70 border-b border-[#f0f2f5]">
        <td class="px-3 py-2.5 font-bold text-[#111b21]">${escapeHtml(r.customerName)}</td>
        <td class="px-3 py-2.5 font-mono text-[11px] text-[#667781]">${escapeHtml(r.phone || r.email || '—')}</td>
        <td class="px-3 py-2.5 font-mono text-[#008069]">${escapeHtml(r.jobReference || '—')}</td>
        <td class="px-3 py-2.5 text-[#667781]">${formatTimeAgo(r.createdAt)}</td>
        <td class="px-3 py-2.5 text-[#ea580c] font-bold font-mono">${daysPending}d pending</td>
        <td class="px-3 py-2.5 text-right">
          <button onclick="sendSingleFollowup('${r.id}')" class="px-3 py-1 rounded bg-[#008069] hover:bg-[#006a57] text-white text-xs font-semibold">
            Send Reminder
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Channel Selector for Send Request View
function setDispatchChannel(channel) {
  currentChannel = channel;
  const btnWa = document.getElementById('channel-btn-whatsapp');
  const btnMail = document.getElementById('channel-btn-email');
  const btnSms = document.getElementById('channel-btn-sms');
  const label = document.getElementById('composer-contact-label');
  const input = document.getElementById('composer-phone');
  const sendBtnText = document.getElementById('composer-send-btn-text');

  const inactiveClass = 'px-2.5 py-1.5 rounded-md text-[#667781] hover:text-[#111b21] flex items-center gap-1 transition-all';
  const activeClass = 'px-3 py-1.5 rounded-md bg-[#008069] text-white flex items-center gap-1.5 shadow-sm transition-all';

  if (btnWa) btnWa.className = channel === 'whatsapp' ? activeClass : inactiveClass;
  if (btnMail) btnMail.className = channel === 'email' ? activeClass : inactiveClass;
  if (btnSms) btnSms.className = channel === 'sms' ? activeClass : inactiveClass;

  const countryInput = document.getElementById('composer-country-code');
  const countryHint = document.getElementById('composer-country-hint');
  const contactSubtext = document.getElementById('composer-contact-subtext');

  if (channel === 'email') {
    if (label) label.textContent = 'Email Address *';
    if (input) {
      input.placeholder = 'e.g. customer@example.com';
      input.type = 'email';
    }
    if (countryInput) countryInput.classList.add('hidden');
    if (countryHint) countryHint.classList.add('hidden');
    if (contactSubtext) contactSubtext.textContent = 'Enter valid email address for customer review invite.';
    if (sendBtnText) sendBtnText.textContent = 'Send via Email';
  } else {
    if (label) label.textContent = channel === 'whatsapp' ? 'WhatsApp Phone Number *' : 'Mobile Phone Number *';
    if (input) {
      input.placeholder = 'e.g. 98765 43210';
      input.type = 'text';
    }
    if (countryInput) countryInput.classList.remove('hidden');
    if (countryHint) countryHint.classList.remove('hidden');
    if (contactSubtext) contactSubtext.innerHTML = 'Prefix defaults to Indian standard <strong>+91</strong> (editable). 10-digit mobile numbers are auto-formatted.';
    if (sendBtnText) sendBtnText.textContent = channel === 'whatsapp' ? 'Send via WhatsApp' : 'Send via SMS';
  }

  updateSimulatorPreview();
}

// Combine Country Code Prefix + Phone Number (with Indian Standard +91 Base)
function getFullComposerPhone() {
  const codeInput = document.getElementById('composer-country-code');
  const phoneInput = document.getElementById('composer-phone');
  let code = codeInput ? codeInput.value.trim() : '+91';
  let phone = phoneInput ? phoneInput.value.trim() : '';

  if (!phone) return '';
  if (currentChannel === 'email') return phone;

  // Clean country code e.g. +91 or 91
  let codeDigits = code.replace(/[^0-9]/g, '') || '91';
  let phoneDigits = phone.replace(/[^0-9]/g, '');

  // Strip leading 0 if 11 digits (e.g. 07349710647 -> 7349710647)
  if (phoneDigits.length === 11 && phoneDigits.startsWith('0')) {
    phoneDigits = phoneDigits.slice(1);
  }

  // If user already pasted a number starting with the country code digits (e.g. 917349710647)
  if (phoneDigits.startsWith(codeDigits) && phoneDigits.length === codeDigits.length + 10) {
    return `+${phoneDigits}`;
  }

  // Standard combine: +[code][digits]
  return `+${codeDigits}${phoneDigits}`;
}

// Live Update Simulator Preview in Send Page
function updateSimulatorPreview(lastSentRecord = null) {
  const nameInput = document.getElementById('composer-name')?.value.trim();
  const phone = lastSentRecord?.phone || getFullComposerPhone() || '';
  const cleanDigits = phone.replace(/[^0-9]/g, '');

  const baseUrl = window.location.origin;
  const reqId = lastSentRecord?.id || 'demo';

  const star5 = `${baseUrl}/r/${reqId}?stars=5`;
  const star4 = `${baseUrl}/r/${reqId}?stars=4`;
  const star3 = `${baseUrl}/r/${reqId}?stars=3`;
  const star2 = `${baseUrl}/r/${reqId}?stars=2`;
  const star1 = `${baseUrl}/r/${reqId}?stars=1`;

  const simGreeting = document.getElementById('sim-bubble-greeting');
  if (simGreeting) {
    simGreeting.innerHTML = `Hi <strong>${escapeHtml(customerName)}</strong>! 👋`;
  }

  const simBody = document.getElementById('sim-bubble-body');
  if (simBody) {
    simBody.innerHTML = `Thank you for choosing <strong class="capitalize">${escapeHtml(bizName)}</strong>! How was your experience today? Tap your rating below:`;
  }

  const simStarsContainer = document.getElementById('sim-bubble-stars-container');
  if (simStarsContainer) {
    simStarsContainer.innerHTML = `
      <div class="space-y-1.5 pt-1">
        <a href="${star5}" target="_blank" class="block p-1.5 rounded-lg bg-white/95 border border-emerald-300 text-left hover:bg-emerald-50 transition shadow-xs group" title="Preview 5★ Auto-Copy Funnel">
          <div class="text-[11px] font-bold text-amber-500 group-hover:text-amber-600">⭐⭐⭐⭐⭐ Excellent (5/5)</div>
          <div class="text-[9px] text-[#008069] font-mono truncate">👉 ${star5}</div>
        </a>
        <a href="${star4}" target="_blank" class="block p-1.5 rounded-lg bg-white/95 border border-emerald-300 text-left hover:bg-emerald-50 transition shadow-xs group" title="Preview 4★ Auto-Copy Funnel">
          <div class="text-[11px] font-bold text-amber-500 group-hover:text-amber-600">⭐⭐⭐⭐ Good (4/5)</div>
          <div class="text-[9px] text-[#008069] font-mono truncate">👉 ${star4}</div>
        </a>
        <a href="${star3}" target="_blank" class="block p-1.5 rounded-lg bg-white/95 border border-slate-200 text-left hover:bg-slate-50 transition shadow-xs group" title="Preview 3★ Shield Form">
          <div class="text-[11px] font-bold text-amber-600 group-hover:text-amber-700">⭐⭐⭐ Okay / Fair (3/5)</div>
          <div class="text-[9px] text-slate-500 font-mono truncate">👉 ${star3}</div>
        </a>
        <a href="${star2}" target="_blank" class="block p-1.5 rounded-lg bg-white/95 border border-rose-200 text-left hover:bg-rose-50 transition shadow-xs group" title="Preview 2★ Shield Form">
          <div class="text-[11px] font-bold text-rose-500 group-hover:text-rose-600">⭐⭐ Poor (2/5)</div>
          <div class="text-[9px] text-rose-600 font-mono truncate">👉 ${star2}</div>
        </a>
        <a href="${star1}" target="_blank" class="block p-1.5 rounded-lg bg-white/95 border border-rose-200 text-left hover:bg-rose-50 transition shadow-xs group" title="Preview 1★ Shield Form">
          <div class="text-[11px] font-bold text-rose-600 group-hover:text-rose-700">⭐ Very Poor (1/5)</div>
          <div class="text-[9px] text-rose-600 font-mono truncate">👉 ${star1}</div>
        </a>
      </div>
    `;
  }

  const simTime = document.getElementById('sim-timestamp');
  if (simTime) {
    const d = new Date();
    simTime.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Update simulator header gateway info
  const simSub = document.getElementById('sim-biz-subtitle');
  const simBadge = document.getElementById('sim-status-badge');
  const simTag = document.getElementById('sim-gateway-tag');
  const simFooterDesc = document.getElementById('sim-footer-gateway-desc');

  if (openwaConnected) {
    if (simSub) simSub.textContent = 'OpenWA Automated Gateway';
    if (simBadge) simBadge.textContent = 'OpenWA Online (Direct)';
    if (simTag) simTag.innerHTML = '<span class="material-symbols-outlined text-[12px] text-[#25d366]">verified</span> Direct OpenWA Delivery';
    if (simFooterDesc) simFooterDesc.textContent = 'OpenWA: Connected (Port 2886)';
  } else {
    if (simSub) simSub.textContent = 'Direct WhatsApp Mode';
    if (simBadge) simBadge.textContent = 'WhatsApp Direct';
    if (simTag) simTag.innerHTML = '<span class="material-symbols-outlined text-[12px]">link</span> wa.me 1-click delivery';
    if (simFooterDesc) simFooterDesc.textContent = 'Direct wa.me fallback active';
  }

  // If a live record was dispatched, trigger delivery toast inside the simulator
  const alertBox = document.getElementById('sim-live-delivery-alert');
  const alertText = document.getElementById('sim-live-delivery-text');
  if (alertBox && alertText && lastSentRecord) {
    alertText.textContent = `Dispatched directly to +${cleanDigits || phone} via OpenWA!`;
    alertBox.classList.remove('hidden');
    setTimeout(() => alertBox.classList.add('hidden'), 5000);
  }

  // Composer wa.me text display
  const wameDisplay = document.getElementById('composer-wame-text');
  if (wameDisplay) {
    if (phone) {
      const waText = `Hi ${customerName}! 👋\n\nThank you for choosing ${bizName}! How was your experience today? Tap your rating below:\n\n⭐⭐⭐⭐⭐ Excellent (5/5)\n👉 ${star5}\n\n⭐⭐⭐⭐ Good (4/5)\n👉 ${star4}\n\n⭐⭐⭐ Average (3/5)\n👉 ${star3}\n\n⭐ Had an issue (1/5)\n👉 ${star1}\n\nThank you!\n— ${bizName} Team`;
      wameDisplay.textContent = `wa.me/${cleanDigits}?text=${encodeURIComponent(waText)}`;
    } else {
      wameDisplay.textContent = 'Enter customer phone to generate link';
    }
  }
}

// Copy wa.me link
function copyWameLink() {
  const text = document.getElementById('composer-wame-text')?.textContent;
  if (text && text.startsWith('wa.me/')) {
    navigator.clipboard.writeText(`https://${text}`);
    showToast('Direct WhatsApp chat link copied!', 'success');
  } else {
    showToast('Please enter a valid phone number first', 'info');
  }
}

// Submit Single Dispatch (Handles both Online & Offline Resilient mode)
async function submitDispatchForm() {
  const nameInput = document.getElementById('composer-name');
  const jobInput = document.getElementById('composer-job-ref');
  const sendBtn = document.getElementById('composer-send-btn');

  const customerName = nameInput?.value.trim();
  const contact = getFullComposerPhone();
  const jobReference = jobInput?.value.trim() || null;

  if (!customerName || !contact) {
    showToast('Please enter customer name and contact details', 'error');
    return;
  }

  let phone = null;
  let email = null;
  if (currentChannel === 'email') {
    email = contact;
  } else {
    phone = contact;
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.classList.add('opacity-70');
  }

  const cleanDigits = phone ? phone.replace(/[^0-9]/g, '') : '';
  const bizName = serverConfig.businessName || 'zerix';

  try {
    // Attempt backend dispatch
    const res = await fetch('/api/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName,
        phone,
        email,
        channel: currentChannel,
        jobReference,
        force: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to dispatch request');

    updateServerStatusUI(true);

    const dispatchedRecord = data.results?.[0] || data.firstRecord || {
      id: data.results?.[0]?.id || 'demo',
      customerName,
      phone,
      email,
      channel: currentChannel,
      jobReference,
      provider: data.provider || (openwaConnected ? 'openwa' : 'direct'),
    };

    // Update Live Simulator Preview with the dispatched record
    updateSimulatorPreview(dispatchedRecord);

    // Show inline success banner in the composer
    const successBanner = document.getElementById('composer-dispatch-success');
    const successTitle = document.getElementById('dispatch-success-title');
    const successDesc = document.getElementById('dispatch-success-desc');
    const manualBtn = document.getElementById('dispatch-manual-wame-btn');

    if (successBanner) {
      if (dispatchedRecord.provider === 'openwa' || openwaConnected) {
        if (successTitle) successTitle.textContent = `Dispatched directly to +${cleanDigits} via WhatsApp!`;
        if (successDesc) successDesc.textContent = `Automated delivery succeeded! The 5-star rating invite was sent directly to customer WhatsApp in background. Zero manual typing!`;
        if (manualBtn && data.whatsappLink) {
          manualBtn.href = data.whatsappLink;
          manualBtn.textContent = 'Open in WhatsApp Web anyway →';
        }
      } else {
        if (successTitle) successTitle.textContent = `WhatsApp Permission Needed for +${cleanDigits}`;
        if (successDesc) successDesc.innerHTML = `Your device is not linked to WhatsApp yet. <button type="button" onclick="openWhatsAppQrModal()" class="font-bold underline text-amber-800">Scan QR Code</button> to enable direct background dispatch, or tap below to send via WhatsApp Web now:`;
        if (manualBtn && data.whatsappLink) {
          manualBtn.href = data.whatsappLink;
          manualBtn.textContent = '🚀 Send via WhatsApp Web Now →';
        }
      }
      successBanner.classList.remove('hidden');
    }

    if (dispatchedRecord.provider === 'openwa' || openwaConnected) {
      showToast(`✅ Dispatched directly to ${customerName} (+${cleanDigits}) via WhatsApp!`, 'success');
    } else {
      showToast(`Saved request for ${customerName}. Scan QR in Settings or send via WhatsApp Web!`, 'info');
    }

  } catch (err) {
    // Backend is offline: Run resilient local fallback
    console.warn('Backend unavailable, saving in Local Resilient Mode:', err.message);
    updateServerStatusUI(false);

    const offlineRecord = {
      id: 'local-' + Date.now(),
      customerName,
      phone,
      email,
      channel: currentChannel,
      jobReference,
      status: 'sent',
      createdAt: Date.now(),
      followUpSent: false,
      whatsappLink: cleanDigits ? `https://wa.me/${cleanDigits}` : null,
      provider: 'direct',
    };

    allRequests.unshift(offlineRecord);
    try {
      localStorage.setItem('zerix_cached_requests', JSON.stringify(allRequests));
    } catch (e) {}

    updateSimulatorPreview(offlineRecord);
    showToast(`Saved locally (Offline Mode).`, 'warning');

  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.classList.remove('opacity-70');
    }

    if (nameInput) nameInput.value = '';
    if (contactInput) contactInput.value = '';
    if (jobInput) jobInput.value = '';

    updateMetrics();
    renderLedgerTable();
  }
}

function handleDispatchSubmit(e) {
  e.preventDefault();
  submitDispatchForm();
}

// Single Follow-up dispatch
async function sendSingleFollowup(id) {
  const customMessage = document.getElementById('hub-reminder-textarea')?.value.trim();
  const req = allRequests.find(r => r.id === id);

  try {
    const res = await fetch(`/api/requests/${id}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customMessage }),
      signal: AbortSignal.timeout(4000),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Follow-up failed');

    showToast('Reminder successfully sent!', 'success');
    await fetchData();
  } catch (err) {
    // Offline fallback for follow-up
    console.warn('Follow-up offline fallback:', err.message);
    if (req) {
      req.followUpSent = true;
      req.followUpSentAt = Date.now();
      updateMetrics();
      renderLedgerTable();
      renderFollowupsHubTable();

      if (req.phone) {
        const cleanDigits = req.phone.replace(/[^0-9]/g, '');
        const bizName = serverConfig.businessName || 'zerix';
        const reviewUrl = serverConfig.reviewUrl || '';
        const msg = customMessage || `Hi ${req.customerName}, just a gentle reminder from ${bizName} — could you take a moment to leave us a quick Google review? ⭐ ${reviewUrl}`;
        window.open(`https://wa.me/${cleanDigits}?text=${encodeURIComponent(msg)}`, '_blank');
      }
      showToast('Reminder marked as sent (Direct link opened)', 'warning');
    }
  }
}

// Batch Follow-up from Hub
async function triggerBatchFollowupFromHub() {
  const now = Date.now();
  const thresholdDays = serverConfig.followUpDays || 3;
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const dueList = allRequests.filter(r => !r.followUpSent && (now - r.createdAt >= thresholdMs));

  if (dueList.length === 0) {
    showToast('No customers currently due for follow-up', 'info');
    return;
  }

  const customMessage = document.getElementById('hub-reminder-textarea')?.value.trim();
  const btn = document.getElementById('hub-batch-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-70');
  }

  let count = 0;
  for (const r of dueList) {
    try {
      await fetch(`/api/requests/${r.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customMessage }),
      });
      count++;
    } catch (e) {
      r.followUpSent = true;
      count++;
    }
  }

  showToast(`Dispatched ${count} review reminders!`, 'success');
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('opacity-70');
  }

  await fetchData();
}

// Bulk Import Handling (SheetJS Excel, CSV, Paste)
function handleBulkFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      if (rawRows.length === 0) {
        showToast('The uploaded sheet is empty', 'error');
        return;
      }

      const contacts = [];
      const startIdx = (typeof rawRows[0][0] === 'string' && rawRows[0][0].toLowerCase().includes('name')) ? 1 : 0;

// Normalize Imported Phone or Email (Indian standard +91 for 10-digit mobile)
function normalizeBulkContact(contact) {
  if (!contact) return '';
  const trimmed = contact.trim();
  if (trimmed.includes('@')) return trimmed;

  let digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  // Auto-prefix Indian 10-digit mobile numbers with +91
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  return '+' + digits;
}

      for (let i = startIdx; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;
        const name = String(row[0] || '').trim();
        const rawContact = String(row[1] || '').trim();
        const ref = String(row[2] || '').trim();
        if (name && rawContact) {
          contacts.push({ name, contact: normalizeBulkContact(rawContact), ref });
        }
      }

      displayBulkParsed(contacts);
    } catch (err) {
      showToast('Error parsing file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function handleBulkPasteParse() {
  const text = document.getElementById('bulk-paste-area')?.value.trim();
  if (!text) {
    showToast('Please paste contacts first', 'info');
    return;
  }

  const lines = text.split('\n');
  const contacts = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(',');
    const name = parts[0]?.trim();
    const rawContact = parts[1]?.trim();
    const ref = parts[2]?.trim() || '';
    if (name && rawContact) {
      contacts.push({ name, contact: normalizeBulkContact(rawContact), ref });
    }
  }

  displayBulkParsed(contacts);
}

function displayBulkParsed(contacts) {
  parsedBulkContacts = contacts;
  const container = document.getElementById('bulk-preview-container');
  const countSpan = document.getElementById('bulk-parsed-count');
  const tbody = document.getElementById('bulk-preview-body');

  if (contacts.length === 0) {
    showToast('No valid contact rows detected', 'error');
    if (container) container.classList.add('hidden');
    return;
  }

  if (countSpan) countSpan.textContent = contacts.length;

  if (tbody) {
    tbody.innerHTML = contacts.map(c => `
      <tr class="hover:bg-[#f0f2f5]/50 border-b border-[#f0f2f5]">
        <td class="px-3 py-1.5 font-bold">${escapeHtml(c.name)}</td>
        <td class="px-3 py-1.5 font-mono text-[#667781]">${escapeHtml(c.contact)}</td>
        <td class="px-3 py-1.5 font-mono uppercase text-[#008069]">${c.contact.includes('@') ? 'Email' : 'WhatsApp'}</td>
        <td class="px-3 py-1.5 font-mono text-[#667781]">${escapeHtml(c.ref || '—')}</td>
      </tr>
    `).join('');
  }

  if (container) container.classList.remove('hidden');
  showToast(`Parsed ${contacts.length} customer records`, 'success');
}

async function dispatchBulkImport() {
  if (parsedBulkContacts.length === 0) return;

  const btn = document.getElementById('bulk-dispatch-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-70');
  }

  let sentCount = 0;
  for (const c of parsedBulkContacts) {
    const isEmail = c.contact.includes('@');
    try {
      await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: c.name,
          phone: isEmail ? null : c.contact,
          email: isEmail ? c.contact : null,
          channel: isEmail ? 'email' : 'whatsapp',
          jobReference: c.ref,
        }),
      });
      sentCount++;
    } catch (e) {
      console.warn('Bulk dispatch row failed:', e);
    }
  }

  showToast(`Bulk dispatch complete! Sent ${sentCount} invites`, 'success');
  parsedBulkContacts = [];
  document.getElementById('bulk-preview-container')?.classList.add('hidden');
  const pasteArea = document.getElementById('bulk-paste-area');
  if (pasteArea) pasteArea.value = '';

  if (btn) {
    btn.disabled = false;
    btn.classList.remove('opacity-70');
  }

  await fetchData();
  switchTab('dashboard');
}

// Template Studio saving
async function saveAllTemplates() {
  const wa = document.getElementById('tpl-whatsapp-input')?.value;
  const mail = document.getElementById('tpl-email-input')?.value;
  const sms = document.getElementById('tpl-sms-input')?.value;

  try {
    if (wa !== undefined) {
      await fetch('/api/templates/whatsapp-template.md', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: wa }),
      });
    }
    if (mail !== undefined) {
      await fetch('/api/templates/email-template.md', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: mail }),
      });
    }
    if (sms !== undefined) {
      await fetch('/api/templates/sms-template.md', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: sms }),
      });
    }

    showToast('Templates successfully saved', 'success');
    await fetchTemplates();
  } catch (err) {
    showToast('Failed to save templates: ' + err.message, 'error');
  }
}

// Config form saving
async function handleConfigSubmit(e) {
  e.preventDefault();
  const businessName = document.getElementById('cfg-biz-name')?.value.trim();
  const reviewUrl = document.getElementById('cfg-review-url')?.value.trim();
  const followUpDays = parseInt(document.getElementById('cfg-followup-days')?.value, 10) || 3;
  const managerPhone = document.getElementById('cfg-manager-phone')?.value.trim();

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName,
        reviewUrl,
        followUpDays,
        managerPhone,
      }),
    });

    if (!res.ok) throw new Error('Failed to update config');

    showToast('Configuration updated in .env', 'success');
    await fetchConfig();
    updateSimulatorPreview();
    updateMetrics();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Table Filter & Search Controls
function setLedgerFilter(filter) {
  activeFilter = filter;
  const tabs = ['all', 'due', 'sent'];

  tabs.forEach(t => {
    const btn = document.getElementById(`filter-tab-${t}`);
    if (btn) {
      if (t === filter) {
        btn.className = 'px-3 py-1 rounded-md bg-white text-[#111b21] shadow-xs font-bold transition-all';
      } else {
        btn.className = 'px-3 py-1 rounded-md text-[#667781] hover:bg-white/60 transition-all';
      }
    }
  });

  renderLedgerTable();
}

function handleLedgerSearch() {
  const input = document.getElementById('ledger-search-input');
  searchQuery = input?.value || '';
  renderLedgerTable();
}

function exportToCSV() {
  if (allRequests.length === 0) {
    showToast('No records to export', 'info');
    return;
  }

  const headers = ['ID', 'Customer Name', 'Phone', 'Email', 'Channel', 'Job Ref', 'Status', 'FollowUp Sent', 'Created At'];
  const rows = allRequests.map(r => [
    r.id,
    `"${(r.customerName || '').replace(/"/g, '""')}"`,
    `"${r.phone || ''}"`,
    `"${r.email || ''}"`,
    r.channel,
    `"${r.jobReference || ''}"`,
    r.status,
    r.followUpSent ? 'YES' : 'NO',
    new Date(r.createdAt).toISOString(),
  ]);

  const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `zerix_reviews_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Exported dispatches to CSV', 'success');
}

// Inspect Modal
function openInspectModal(id) {
  const req = allRequests.find(r => r.id === id);
  if (!req) return;

  const modal = document.getElementById('inspect-modal');
  const fields = document.getElementById('inspect-fields');
  const jsonPre = document.getElementById('inspect-json');

  if (fields) {
    fields.innerHTML = `
      <div class="flex justify-between py-1 border-b border-[#f0f2f5]"><span class="text-[#667781]">Customer:</span><strong class="text-[#111b21]">${escapeHtml(req.customerName)}</strong></div>
      <div class="flex justify-between py-1 border-b border-[#f0f2f5]"><span class="text-[#667781]">Channel:</span><span class="font-mono text-[#008069] font-bold uppercase">${req.channel}</span></div>
      <div class="flex justify-between py-1 border-b border-[#f0f2f5]"><span class="text-[#667781]">Contact:</span><span class="font-mono text-[#111b21]">${escapeHtml(req.phone || req.email || '—')}</span></div>
      <div class="flex justify-between py-1 border-b border-[#f0f2f5]"><span class="text-[#667781]">Job Ref:</span><span class="font-mono text-[#008069]">${escapeHtml(req.jobReference || '—')}</span></div>
      <div class="flex justify-between py-1 border-b border-[#f0f2f5]"><span class="text-[#667781]">Status:</span><span class="font-bold text-[#111b21]">${req.status}</span></div>
      <div class="flex justify-between py-1"><span class="text-[#667781]">Created:</span><span class="font-mono text-[#667781]">${new Date(req.createdAt).toLocaleString()}</span></div>
    `;
  }

  if (jsonPre) {
    jsonPre.textContent = JSON.stringify(req, null, 2);
  }

  if (modal) modal.classList.remove('hidden');
}

function closeInspectModal() {
  const modal = document.getElementById('inspect-modal');
  if (modal) modal.classList.add('hidden');
}

function formatTimeAgo(timestamp) {
  const elapsed = Date.now() - timestamp;
  const mins = Math.floor(elapsed / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =========================================================================
// 🌟 1-TAP REVIEW FUNNEL & NEGATIVE SENTIMENT SHIELD ENGINE
// =========================================================================

// Open Funnel Demo or Live Customer Funnel in New Tab
function openFunnelPreview(stars, id = 'demo') {
  const url = `/r/${id}${stars ? `?stars=${stars}` : ''}`;
  window.open(url, '_blank');
}

// Fetch Intercepted Negative Feedback from Database
async function fetchFeedbackData(notify = false) {
  try {
    const res = await fetch('/api/feedback', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('Failed to load feedback');
    allFeedback = await res.json();

    const badge = document.getElementById('feedback-shielded-badge');
    if (badge) {
      badge.textContent = `${allFeedback.length} Intercepted`;
    }

    renderFeedbackTable();
    if (notify) showToast('Shielded feedback database synchronized', 'success');
  } catch (err) {
    console.warn('Feedback fetch error:', err.message);
  }
}

// Render Shielded Negative Feedback Table
function renderFeedbackTable() {
  const tbody = document.getElementById('feedback-table-body');
  if (!tbody) return;

  if (!allFeedback || allFeedback.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-[#667781]">
          <span class="material-symbols-outlined text-[30px] text-[#25d366] block mb-1">verified_user</span>
          <p class="font-semibold text-xs text-[#111b21]">No Negative Reviews Intercepted</p>
          <p class="text-[11px] text-[#667781] mt-0.5">Your Google reputation is clean! Any unhappy customers venting will be shielded here.</p>
        </td>
      </tr>
    `;
    return;
  }

  // Sort newest first
  const sorted = [...allFeedback].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  tbody.innerHTML = sorted.map(fb => {
    const stars = fb.stars || 1;
    let starBadge = '';
    if (stars === 1) {
      starBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[11px]">★☆☆☆☆ (1 Star)</span>`;
    } else if (stars === 2) {
      starBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold text-[11px]">★★☆☆☆ (2 Stars)</span>`;
    } else if (stars === 3) {
      starBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[11px]">★★★☆☆ (3 Stars)</span>`;
    } else {
      starBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-[#008069] font-bold text-[11px]">★★★★★ (${stars} Stars)</span>`;
    }

    const isResolved = fb.status === 'resolved';
    const statusBadge = isResolved
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#dcfce7] text-[#008069] font-semibold text-[11px]"><span class="material-symbols-outlined text-[13px]">check_circle</span> Resolved</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[11px]"><span class="material-symbols-outlined text-[13px]">pending</span> Action Needed</span>`;

    let resolutionLabel = '📞 Manager Call';
    if (fb.resolutionType === 'fix_work' || fb.desiredResolution === 'fix_work') {
      resolutionLabel = '🔧 Free Re-work / Fix';
    } else if (fb.resolutionType === 'refund_discount' || fb.desiredResolution === 'refund_discount') {
      resolutionLabel = '💰 Refund / Credit';
    } else if (fb.resolutionType || fb.desiredResolution) {
      resolutionLabel = `📞 ${fb.resolutionType || fb.desiredResolution}`;
    }

    const contactStr = [fb.phone, fb.email].filter(Boolean).join(' • ') || fb.contact || 'No contact provided';
    const commentStr = fb.feedbackText || fb.feedback || 'No comments provided.';
    const timeAgo = fb.createdAt ? formatTimeAgo(fb.createdAt) : 'Recently';
    const cleanPhone = (fb.phone || '').replace(/[^0-9]/g, '');

    return `
      <tr class="hover:bg-[#f0f2f5]/70 transition-colors border-b border-[#f0f2f5]">
        <td class="pl-4 px-3 py-3">
          <div class="font-bold text-[#111b21]">${escapeHtml(fb.customerName || 'Anonymous Customer')}</div>
          <div class="text-[11px] font-mono text-[#667781]">${escapeHtml(contactStr)}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">${timeAgo}</div>
        </td>
        <td class="px-3 py-3">${starBadge}</td>
        <td class="px-3 py-3 max-w-xs">
          ${fb.primaryIssue ? `<div class="inline-block px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold mb-1 border border-rose-200">${escapeHtml(fb.primaryIssue)}</div>` : ''}
          <p class="text-xs text-[#111b21] leading-relaxed line-clamp-3">${escapeHtml(commentStr)}</p>
        </td>
        <td class="px-3 py-3 font-semibold text-slate-700 text-xs">
          <span class="inline-block px-2 py-0.5 rounded bg-[#f0f2f5] text-[#111b21] font-medium text-[11px]">${escapeHtml(resolutionLabel)}</span>
        </td>
        <td class="px-3 py-3">${statusBadge}</td>
        <td class="pr-4 px-3 py-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${cleanPhone ? `
              <a href="https://wa.me/${cleanPhone}" target="_blank" class="p-1 rounded hover:bg-[#dcfce7] text-[#008069] transition-colors" title="Message Customer on WhatsApp">
                <span class="material-symbols-outlined text-[17px]">chat</span>
              </a>
              <a href="tel:${cleanPhone}" class="p-1 rounded hover:bg-slate-200 text-slate-700 transition-colors" title="Call Customer">
                <span class="material-symbols-outlined text-[17px]">call</span>
              </a>
            ` : ''}
            ${!isResolved ? `
              <button onclick="resolveFeedback('${fb.id}')" class="px-2.5 py-1 rounded bg-[#008069] hover:bg-[#006a57] text-white text-xs font-semibold flex items-center gap-1 transition-colors shadow-xs" type="button" title="Mark as resolved">
                <span class="material-symbols-outlined text-[14px]">done</span>
                <span>Resolve</span>
              </button>
            ` : `
              <span class="text-[11px] text-[#008069] font-semibold flex items-center gap-0.5">
                <span class="material-symbols-outlined text-[14px]">task_alt</span> Done
              </span>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Mark Intercepted Complaint as Resolved
async function resolveFeedback(feedbackId) {
  try {
    const res = await fetch(`/api/feedback/${feedbackId}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to resolve feedback');
    showToast('Customer complaint marked as resolved!', 'success');
    await fetchFeedbackData(false);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

