// Zerix - Frontend Application Logic

// State
let allRequests = [];
let serverConfig = {
  port: 3001,
  businessName: 'Zerix',
  reviewUrl: 'https://g.page/r/YOUR_REVIEW_LINK/review',
  followUpDays: 3,
  smtpConfigured: false,
  whatsappConfigured: false,
  twilioConfigured: false,
  metaConfigured: false,
};
let templates = {
  email: '',
  sms: '',
  whatsapp: '',
};
let currentTemplateTab = 'email';
let activeTab = 'dashboard';
let autoRefreshTimer = null;
let uptimeInterval = null;
let currentUptime = 0;
let selectedFollowUpIds = new Set();
let activeFollowupModalTarget = null;
let currentFollowupThreshold = 3;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    fetchConfig(),
    fetchTemplates(),
    fetchData(),
  ]);

  // Update live preview in Send Request view
  updateLivePreview();

  // Start auto-refresh polling every 5 seconds
  autoRefreshTimer = setInterval(() => {
    fetchData(false);
  }, 5000);

  // Uptime ticker
  uptimeInterval = setInterval(() => {
    currentUptime++;
    const uptimeBadge = document.getElementById('server-uptime-badge');
    if (uptimeBadge) {
      uptimeBadge.textContent = `Up: ${formatUptime(currentUptime)}`;
    }
  }, 1000);
});

// Switch Main Navigation Tabs
function switchTab(tabId) {
  activeTab = tabId;
  const tabs = ['dashboard', 'send', 'bulk', 'followups', 'templates', 'config', 'api'];
  
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const view = document.getElementById(`view-${t}`);
    
    if (t === tabId) {
      if (btn) {
        btn.classList.add('active-tab');
        btn.classList.remove('inactive-tab');
      }
      if (view) view.classList.remove('hidden');
    } else {
      if (btn) {
        btn.classList.remove('active-tab');
        btn.classList.add('inactive-tab');
      }
      if (view) view.classList.add('hidden');
    }
  });

  if (tabId === 'templates') {
    renderTemplateEditor();
  } else if (tabId === 'followups') {
    renderFollowUpsTable();
  }
}

// Fetch Server Configuration
async function fetchConfig(notify = false) {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to load server config');
    serverConfig = await res.json();
    
    // Update Header & Banner UI
    const portBadge = document.getElementById('server-port-badge');
    if (portBadge) portBadge.textContent = `Port: ${serverConfig.port}`;

    const bannerBiz = document.getElementById('banner-biz-name');
    if (bannerBiz) bannerBiz.textContent = serverConfig.businessName;
    
    const bannerReviewUrl = document.getElementById('banner-review-url');
    if (bannerReviewUrl) {
      bannerReviewUrl.textContent = serverConfig.reviewUrl;
      bannerReviewUrl.href = serverConfig.reviewUrl;
    }

    const bannerSmtpPill = document.getElementById('banner-smtp-pill');
    if (bannerSmtpPill) {
      if (serverConfig.smtpConfigured) {
        bannerSmtpPill.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        bannerSmtpPill.textContent = 'SMTP Ready';
      } else {
        bannerSmtpPill.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20';
        bannerSmtpPill.textContent = 'SMTP Mock / Queued';
      }
    }

    // Populate Editable Form Inputs
    const editBiz = document.getElementById('edit-biz-name');
    if (editBiz) editBiz.value = serverConfig.businessName || '';

    const editReview = document.getElementById('edit-review-url');
    if (editReview) editReview.value = serverConfig.reviewUrl || '';

    const editDays = document.getElementById('edit-followup-days');
    if (editDays) editDays.value = serverConfig.followUpDays || 3;

    const editPort = document.getElementById('edit-port');
    if (editPort) editPort.value = serverConfig.port || 3001;

    // OpenWA inputs
    const editWaUrl = document.getElementById('edit-openwa-url');
    if (editWaUrl) editWaUrl.value = serverConfig.openwaUrl || '';

    const editWaKey = document.getElementById('edit-openwa-key');
    if (editWaKey) {
      if (serverConfig.openwaApiKeyConfigured) {
        editWaKey.placeholder = '•••••••• (Configured - enter new key to change)';
      } else {
        editWaKey.placeholder = 'owa_k1_your_api_key';
      }
    }

    const editWaSession = document.getElementById('edit-openwa-session');
    if (editWaSession) editWaSession.value = serverConfig.openwaSessionId || 'default';

    // SMTP inputs
    const editSmtpHost = document.getElementById('edit-smtp-host');
    if (editSmtpHost) editSmtpHost.value = serverConfig.smtpHost || '';

    const editSmtpPort = document.getElementById('edit-smtp-port');
    if (editSmtpPort) editSmtpPort.value = serverConfig.smtpPort || 587;

    const editSmtpSecure = document.getElementById('edit-smtp-secure');
    if (editSmtpSecure) editSmtpSecure.checked = !!serverConfig.smtpSecure;

    const editSmtpUser = document.getElementById('edit-smtp-user');
    if (editSmtpUser) editSmtpUser.value = serverConfig.smtpUser || '';

    const editSmtpPass = document.getElementById('edit-smtp-pass');
    if (editSmtpPass) {
      if (serverConfig.smtpPassConfigured) {
        editSmtpPass.placeholder = '•••••••• (Configured - enter new pass to change)';
      } else {
        editSmtpPass.placeholder = '•••••••• (Leave blank to keep unchanged)';
      }
    }

    const editSmtpFrom = document.getElementById('edit-smtp-from');
    if (editSmtpFrom) editSmtpFrom.value = serverConfig.smtpFrom || '';

    // Status Badges & Info
    const cfgSmtpBadge = document.getElementById('cfg-smtp-badge');
    if (cfgSmtpBadge) {
      if (serverConfig.smtpConfigured) {
        cfgSmtpBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        cfgSmtpBadge.textContent = 'Connected';
      } else {
        cfgSmtpBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20';
        cfgSmtpBadge.textContent = 'Not Configured (Logs to Console)';
      }
    }

    const cfgWaBadge = document.getElementById('cfg-wa-badge');
    const cfgWaProvider = document.getElementById('cfg-wa-provider');

    if (cfgWaProvider) cfgWaProvider.textContent = serverConfig.activeWhatsAppProvider || 'Direct Link (wa.me)';

    if (cfgWaBadge) {
      if (serverConfig.openwaConfigured) {
        cfgWaBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        cfgWaBadge.textContent = 'Zerix Gateway Active';
      } else if (serverConfig.twilioConfigured) {
        cfgWaBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        cfgWaBadge.textContent = 'Twilio Active';
      } else if (serverConfig.metaConfigured) {
        cfgWaBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        cfgWaBadge.textContent = 'Meta Cloud API';
      } else {
        cfgWaBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
        cfgWaBadge.textContent = 'wa.me Direct Link';
      }
    }

    const cfgNode = document.getElementById('cfg-node');
    if (cfgNode) cfgNode.textContent = `${serverConfig.nodeVersion} (${serverConfig.platform})`;

    const previewFrom = document.getElementById('preview-from-email');
    if (previewFrom) previewFrom.textContent = serverConfig.smtpFrom !== 'Not set' && serverConfig.smtpFrom ? serverConfig.smtpFrom : 'reviews@zerix.app';

    const followupDaysDisplay = document.getElementById('followup-days-display');
    if (followupDaysDisplay) followupDaysDisplay.textContent = `${serverConfig.followUpDays} days`;

    // Check OpenWA Live Status
    const bannerWaPill = document.getElementById('banner-wa-pill');
    const openwaLiveBanner = document.getElementById('openwa-live-session-banner');
    const openwaLivePhone = document.getElementById('openwa-live-phone');
    const openwaLiveName = document.getElementById('openwa-live-name');
    const openwaLiveStatus = document.getElementById('openwa-live-status');

    if (serverConfig.openwaConfigured) {
      try {
        const waStatusRes = await fetch('/api/openwa/status');
        const waData = await waStatusRes.json();

        if (waData.connected && waData.activePhone) {
          if (bannerWaPill) {
            bannerWaPill.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            bannerWaPill.textContent = `Zerix WA: +${waData.activePhone} (${waData.pushName || 'Ready'})`;
          }

          if (openwaLiveBanner) openwaLiveBanner.classList.remove('hidden');
          if (openwaLivePhone) openwaLivePhone.textContent = `+${waData.activePhone}`;
          if (openwaLiveName) openwaLiveName.textContent = waData.pushName ? `(${waData.pushName})` : '';
          if (openwaLiveStatus) openwaLiveStatus.textContent = `${waData.sessionStatus === 'ready' ? 'Ready · Online' : waData.sessionStatus} (${waData.sessions?.length || 1} session)`;
        } else if (waData.connected) {
          if (bannerWaPill) {
            bannerWaPill.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20';
            bannerWaPill.textContent = 'Zerix WA: No Session';
          }
          if (openwaLiveBanner) openwaLiveBanner.classList.add('hidden');
        } else {
          if (bannerWaPill) {
            bannerWaPill.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20';
            bannerWaPill.textContent = 'Zerix Gateway Offline';
          }
          if (openwaLiveBanner) openwaLiveBanner.classList.add('hidden');
        }
      } catch (e) {
        console.warn('Could not query OpenWA status:', e);
      }
    } else {
      if (bannerWaPill) {
        bannerWaPill.className = 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700';
        bannerWaPill.textContent = 'Zerix WA: wa.me Direct';
      }
      if (openwaLiveBanner) openwaLiveBanner.classList.add('hidden');
    }

    if (notify) {
      showToast('Configuration reloaded from server', 'info');
    }

  } catch (err) {
    console.error('Config fetch error:', err);
  }
}

// Fetch Templates
async function fetchTemplates() {
  try {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('Failed to load templates');
    templates = await res.json();
  } catch (err) {
    console.error('Templates fetch error:', err);
  }
}

// Fetch Requests & Stats
async function fetchData(showSpin = false) {
  if (showSpin) {
    const icon = document.getElementById('refresh-icon');
    if (icon) icon.classList.add('animate-spin');
    setTimeout(() => icon?.classList.remove('animate-spin'), 600);
  }

  try {
    const [requestsRes, statsRes] = await Promise.all([
      fetch('/api/requests'),
      fetch('/api/stats'),
    ]);

    if (!requestsRes.ok || !statsRes.ok) throw new Error('API request failed');

    allRequests = await requestsRes.json();
    const stats = await statsRes.json();

    currentUptime = stats.uptimeSeconds || currentUptime;

    // Update Stats Display
    document.getElementById('stat-total').textContent = stats.totalRequests;
    document.getElementById('stat-sent').textContent = stats.sent;
    document.getElementById('stat-queued').textContent = stats.queued;
    document.getElementById('stat-failed').textContent = stats.failed;
    document.getElementById('stat-due').textContent = stats.followUpsDue;
    document.getElementById('stat-followup-sent').textContent = stats.followUpsSent;

    // Due badge on header
    const dueBadge = document.getElementById('due-badge');
    if (dueBadge) dueBadge.textContent = stats.followUpsDue;

    // Render tables
    applyFilters();
    if (activeTab === 'followups') {
      renderFollowUpsTable();
    }

    // Set server pulse green
    setServerOnline(true);

  } catch (err) {
    console.error('Data fetch error:', err);
    setServerOnline(false);
  }
}

function setServerOnline(online) {
  const dot = document.getElementById('server-dot');
  const pulse = document.getElementById('server-pulse');
  const text = document.getElementById('server-status-text');

  if (online) {
    dot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500';
    pulse.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75';
    text.textContent = 'Server Online';
  } else {
    dot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500';
    pulse.className = 'hidden';
    text.textContent = 'Server Offline';
  }
}

// Apply Search & Filters to Requests Table
function applyFilters() {
  const searchTerm = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('filter-status')?.value || 'all';
  const channelFilter = document.getElementById('filter-channel')?.value || 'all';

  const filtered = allRequests.filter(req => {
    // Search matching
    const matchSearch = !searchTerm ||
      (req.customerName && req.customerName.toLowerCase().includes(searchTerm)) ||
      (req.email && req.email.toLowerCase().includes(searchTerm)) ||
      (req.phone && req.phone.toLowerCase().includes(searchTerm)) ||
      (req.jobReference && req.jobReference.toLowerCase().includes(searchTerm)) ||
      (req.id && req.id.toLowerCase().includes(searchTerm));

    // Status matching
    const matchStatus = statusFilter === 'all' || req.status === statusFilter;

    // Channel matching
    const matchChannel = channelFilter === 'all' || req.channel === channelFilter;

    return matchSearch && matchStatus && matchChannel;
  });

  renderRequestsTable(filtered);
}

// Render Requests Table
function renderRequestsTable(requests) {
  const tbody = document.getElementById('requests-table-body');
  const emptyState = document.getElementById('table-empty-state');
  const countBadge = document.getElementById('table-count-badge');

  if (countBadge) countBadge.textContent = `${requests.length} item${requests.length === 1 ? '' : 's'}`;

  if (!requests || requests.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  tbody.innerHTML = requests.map(req => {
    // Status Badge
    let statusPill = '';
    if (req.status === 'sent') {
      statusPill = '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Sent</span>';
    } else if (req.status === 'queued') {
      statusPill = '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>Queued</span>';
    } else if (req.status === 'failed') {
      statusPill = `<span title="${escapeHtml(req.errorMessage || 'Unknown error')}" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 cursor-help"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Failed</span>`;
    } else {
      statusPill = '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Pending</span>';
    }

    // Channel Icon & Destination
    let channelIcon = '';
    if (req.channel === 'whatsapp') {
      channelIcon = '<span class="text-emerald-400 font-mono flex items-center gap-1.5 font-bold"><i class="fa-brands fa-whatsapp text-sm"></i> WhatsApp</span>';
    } else if (req.channel === 'sms') {
      channelIcon = '<span class="text-cyan-400 font-mono flex items-center gap-1.5"><i class="fa-solid fa-comment-sms"></i> SMS</span>';
    } else {
      channelIcon = '<span class="text-indigo-400 font-mono flex items-center gap-1.5"><i class="fa-solid fa-envelope"></i> Email</span>';
    }

    let destination = req.email || req.phone || '<span class="text-slate-600">None</span>';

    // Follow-up status
    let followupPill = req.followUpSent 
      ? '<span class="text-cyan-400 font-medium text-[11px] flex items-center gap-1"><i class="fa-solid fa-check-double"></i> Sent</span>' 
      : '<span class="text-slate-500 text-[11px]">Not sent</span>';

    // Direct WhatsApp Button if WhatsApp or Phone present
    let directWaButton = '';
    if (req.whatsappLink || (req.phone && req.channel === 'whatsapp')) {
      const waUrl = req.whatsappLink || `https://wa.me/${req.phone.replace(/[^0-9]/g, '')}`;
      directWaButton = `
        <a href="${waUrl}" target="_blank" title="Open in WhatsApp" class="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition flex items-center gap-1 text-[11px]">
          <i class="fa-brands fa-whatsapp text-xs"></i>
          <span class="hidden sm:inline font-mono">Chat</span>
        </a>
      `;
    }

    return `
      <tr class="hover:bg-slate-800/40 transition group">
        <td class="px-4 py-3">
          <div class="font-semibold text-slate-100">${escapeHtml(req.customerName)}</div>
          <div class="text-[10px] font-mono text-slate-500">${req.id.substring(0, 8)}...</div>
        </td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            ${channelIcon}
          </div>
          <div class="text-slate-300 font-mono text-[11px] mt-0.5 truncate max-w-xs">${escapeHtml(destination)}</div>
        </td>
        <td class="px-4 py-3">
          ${req.jobReference ? `<span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono text-[10px] border border-slate-700">${escapeHtml(req.jobReference)}</span>` : '<span class="text-slate-600">—</span>'}
        </td>
        <td class="px-4 py-3">${statusPill}</td>
        <td class="px-4 py-3">${followupPill}</td>
        <td class="px-4 py-3">
          <div class="text-slate-300 text-[11px]">${formatTimeAgo(req.createdAt)}</div>
          <div class="text-[10px] text-slate-500 font-mono">${new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </td>
        <td class="px-4 py-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${directWaButton}
            <button onclick="openCustomFollowUpModal('${req.id}')" title="Send Follow-up Reminder" class="p-1.5 rounded-lg text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition">
              <i class="fa-solid fa-clock-rotate-left text-xs"></i>
            </button>
            <button onclick="viewRequestDetails('${req.id}')" title="View details" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition">
              <i class="fa-solid fa-circle-info text-xs"></i>
            </button>
            <button onclick="deleteRequest('${req.id}')" title="Delete record" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition">
              <i class="fa-solid fa-trash text-xs"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Follow-Ups Candidates Table
function renderFollowUpsTable() {
  const tbody = document.getElementById('followup-table-body');
  const dueCountPill = document.getElementById('due-count-pill');
  const scopeFilter = document.getElementById('followup-scope-filter')?.value || 'eligible';
  const channelFilter = document.getElementById('followup-channel-filter')?.value || 'all';
  const searchTerm = (document.getElementById('followup-search')?.value || '').toLowerCase().trim();
  
  const thresholdSelect = document.getElementById('followup-threshold-select');
  const thresholdVal = thresholdSelect ? parseInt(thresholdSelect.value, 10) : 3;
  const cutoff = Date.now() - thresholdVal * 24 * 60 * 60 * 1000;

  const filtered = allRequests.filter(r => {
    // Valid status
    const validStatus = r.status === 'sent' || r.status === 'queued';
    if (!validStatus) return false;

    // Scope filter
    let matchScope = true;
    if (scopeFilter === 'eligible') {
      matchScope = !r.followUpSent && r.createdAt <= cutoff;
    } else if (scopeFilter === 'unsent') {
      matchScope = !r.followUpSent;
    } else if (scopeFilter === 'sent') {
      matchScope = !!r.followUpSent;
    } else {
      matchScope = true; // all
    }

    // Channel filter
    const matchChannel = channelFilter === 'all' || r.channel === channelFilter;

    // Search filter
    const matchSearch = !searchTerm ||
      (r.customerName && r.customerName.toLowerCase().includes(searchTerm)) ||
      (r.email && r.email.toLowerCase().includes(searchTerm)) ||
      (r.phone && r.phone.toLowerCase().includes(searchTerm)) ||
      (r.jobReference && r.jobReference.toLowerCase().includes(searchTerm)) ||
      (r.id && r.id.toLowerCase().includes(searchTerm));

    return matchScope && matchChannel && matchSearch;
  });

  if (dueCountPill) {
    dueCountPill.textContent = `${filtered.length} candidate${filtered.length === 1 ? '' : 's'}`;
  }

  updateBatchBar();

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-4 py-8 text-center text-slate-500">
          <i class="fa-solid fa-check-circle text-emerald-400 text-lg mb-2"></i>
          <p class="font-medium text-slate-300">No candidates match current criteria!</p>
          <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Switch scope to <button onclick="setFollowupScope('unsent')" class="text-purple-400 hover:underline font-semibold">"All Unsent"</button> or set threshold to <button onclick="setFollowupThreshold(0)" class="text-purple-400 hover:underline font-semibold">"Instant (0+ days)"</button> to follow up with any customer on demand.
          </p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const daysElapsed = Math.floor((Date.now() - r.createdAt) / (24 * 60 * 60 * 1000));
    const isDue = !r.followUpSent && r.createdAt <= cutoff;
    const isChecked = selectedFollowUpIds.has(r.id);

    let channelIcon = '';
    if (r.channel === 'whatsapp') {
      channelIcon = '<span class="text-emerald-400 font-mono text-[10px] flex items-center gap-1 font-semibold"><i class="fa-brands fa-whatsapp text-xs"></i> WhatsApp</span>';
    } else if (r.channel === 'sms') {
      channelIcon = '<span class="text-cyan-400 font-mono text-[10px] flex items-center gap-1"><i class="fa-solid fa-comment-sms text-xs"></i> SMS</span>';
    } else {
      channelIcon = '<span class="text-indigo-400 font-mono text-[10px] flex items-center gap-1"><i class="fa-solid fa-envelope text-xs"></i> Email</span>';
    }

    let statusPill = '';
    if (r.followUpSent) {
      statusPill = `<span class="px-2 py-0.5 rounded-full font-medium text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"><i class="fa-solid fa-check-double mr-1"></i>Sent ${r.followUpSentAt ? formatTimeAgo(r.followUpSentAt) : ''}</span>`;
    } else if (isDue) {
      statusPill = '<span class="px-2 py-0.5 rounded-full font-bold text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/30"><i class="fa-solid fa-circle-exclamation mr-1"></i>Due Now</span>';
    } else {
      statusPill = `<span class="px-2 py-0.5 rounded-full font-medium text-[10px] bg-slate-800 text-slate-400">Waiting (&lt; ${thresholdVal}d)</span>`;
    }

    return `
      <tr class="hover:bg-slate-800/40 transition ${isChecked ? 'bg-purple-950/20' : ''}">
        <td class="px-4 py-3 text-center">
          <input type="checkbox" onchange="toggleSelectFollowup('${r.id}', this.checked)" ${isChecked ? 'checked' : ''} class="rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 h-4 w-4 cursor-pointer">
        </td>
        <td class="px-4 py-3">
          <div class="font-semibold text-slate-100">${escapeHtml(r.customerName)}</div>
          <div class="text-[10px] font-mono text-slate-500">${r.jobReference ? escapeHtml(r.jobReference) : r.id.substring(0, 8)}</div>
        </td>
        <td class="px-4 py-3">
          <div class="flex items-center gap-1.5">
            ${channelIcon}
          </div>
          <div class="text-slate-300 font-mono text-[11px] mt-0.5 truncate max-w-xs">${escapeHtml(r.email || r.phone || 'N/A')}</div>
        </td>
        <td class="px-4 py-3 text-slate-300">${new Date(r.createdAt).toLocaleDateString()} (${formatTimeAgo(r.createdAt)})</td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">${daysElapsed}d ago</span>
        </td>
        <td class="px-4 py-3">${statusPill}</td>
        <td class="px-4 py-3 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="openCustomFollowUpModal('${r.id}')" title="Customize message & preview" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded-lg text-xs font-semibold border border-purple-500/30 transition flex items-center gap-1">
              <i class="fa-solid fa-pen-to-square text-[10px]"></i>
              <span class="hidden sm:inline">Customize</span>
            </button>
            <button onclick="sendSingleFollowUp('${r.id}', this)" title="Send follow-up reminder now" class="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm">
              <i class="fa-solid fa-paper-plane text-[10px]"></i>
              <span>Send</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Send Request Form Handling
function handleChannelChange() {
  const channel = document.querySelector('input[name="req-channel"]:checked')?.value || 'email';
  const emailStar = document.getElementById('email-req-star');
  const phoneHint = document.getElementById('phone-hint');
  
  const previewEmailBox = document.getElementById('preview-email-box');
  const previewWhatsappBox = document.getElementById('preview-whatsapp-box');
  const previewSmsBox = document.getElementById('preview-sms-box');
  const previewPill = document.getElementById('preview-channel-pill');

  // Channel Card Highlights
  const cardEmail = document.getElementById('card-channel-email');
  const cardWa = document.getElementById('card-channel-whatsapp');
  const cardSms = document.getElementById('card-channel-sms');

  if (cardEmail) cardEmail.className = `channel-card flex items-center gap-2.5 p-3 bg-slate-950 border ${channel === 'email' ? 'border-indigo-500 bg-slate-800/40' : 'border-slate-800'} rounded-lg cursor-pointer hover:bg-slate-800/50 transition`;
  if (cardWa) cardWa.className = `channel-card flex items-center gap-2.5 p-3 bg-slate-950 border ${channel === 'whatsapp' ? 'border-emerald-500 bg-slate-800/40' : 'border-slate-800'} rounded-lg cursor-pointer hover:bg-slate-800/50 transition`;
  if (cardSms) cardSms.className = `channel-card flex items-center gap-2.5 p-3 bg-slate-950 border ${channel === 'sms' ? 'border-cyan-500 bg-slate-800/40' : 'border-slate-800'} rounded-lg cursor-pointer hover:bg-slate-800/50 transition`;

  if (channel === 'email') {
    emailStar.style.display = 'inline';
    phoneHint.textContent = '(Optional)';
    previewEmailBox.classList.remove('hidden');
    previewWhatsappBox.classList.add('hidden');
    previewSmsBox.classList.add('hidden');
    previewPill.textContent = 'Email View';
    previewPill.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300';
  } else if (channel === 'whatsapp') {
    emailStar.style.display = 'none';
    phoneHint.textContent = '(Required for WhatsApp)';
    previewEmailBox.classList.add('hidden');
    previewWhatsappBox.classList.remove('hidden');
    previewSmsBox.classList.add('hidden');
    previewPill.textContent = 'WhatsApp View';
    previewPill.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300';
  } else {
    emailStar.style.display = 'none';
    phoneHint.textContent = '(Required for SMS)';
    previewEmailBox.classList.add('hidden');
    previewWhatsappBox.classList.add('hidden');
    previewSmsBox.classList.remove('hidden');
    previewPill.textContent = 'SMS View';
    previewPill.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300';
  }

  updateLivePreview();
}

function updateLivePreview() {
  const name = document.getElementById('req-name')?.value.trim() || 'Alex Morgan';
  const biz = serverConfig.businessName || 'Your Business Name';
  const reviewUrl = serverConfig.reviewUrl || 'https://g.page/r/YOUR_REVIEW_LINK/review';

  // Email Subject
  const previewSubject = document.getElementById('preview-subject');
  if (previewSubject) previewSubject.textContent = `How was your experience, ${name}?`;

  // Render Email HTML Body
  const emailTemplateRaw = templates.email || 'Hi {{customerName}}, leave us a review: {{reviewUrl}}';
  const emailRendered = emailTemplateRaw
    .replace(/\{\{customerName\}\}/g, escapeHtml(name))
    .replace(/\{\{businessName\}\}/g, escapeHtml(biz))
    .replace(/\{\{reviewUrl\}\}/g, escapeHtml(reviewUrl));

  const emailBox = document.getElementById('preview-rendered-email');
  if (emailBox) emailBox.innerHTML = emailRendered;

  // Render WhatsApp Body
  const waHeaderBiz = document.getElementById('wa-preview-header-biz');
  if (waHeaderBiz) waHeaderBiz.textContent = biz;

  const waTemplateRaw = templates.whatsapp || 'Hi {{customerName}}! 👋\n\nThank you for choosing {{businessName}}! Could you please leave us a quick Google review?\n\n⭐ {{reviewUrl}}\n\nThank you!';
  const waRendered = waTemplateRaw
    .replace(/\{\{customerName\}\}/g, name)
    .replace(/\{\{businessName\}\}/g, biz)
    .replace(/\{\{reviewUrl\}\}/g, reviewUrl);

  const waBox = document.getElementById('preview-rendered-whatsapp');
  if (waBox) waBox.textContent = waRendered;

  // Render SMS Text Body
  const smsTemplateRaw = templates.sms || 'Hi {{customerName}}! How was your experience? Leave us a quick review: {{reviewUrl}}';
  const smsRendered = smsTemplateRaw
    .replace(/\{\{customerName\}\}/g, name)
    .replace(/\{\{businessName\}\}/g, biz)
    .replace(/\{\{reviewUrl\}\}/g, reviewUrl);

  const smsBox = document.getElementById('preview-rendered-sms');
  if (smsBox) smsBox.textContent = smsRendered;
}

// Submit New Request
async function submitRequest(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> <span>Sending...</span>';

  const name = document.getElementById('req-name').value.trim();
  const channel = document.querySelector('input[name="req-channel"]:checked')?.value || 'email';
  const email = document.getElementById('req-email').value.trim();
  const phone = document.getElementById('req-phone').value.trim();
  const jobReference = document.getElementById('req-job').value.trim();

  try {
    const res = await fetch('/api/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: name,
        email: email || undefined,
        phone: phone || undefined,
        channel,
        jobReference: jobReference || undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit review request');
    }

    showToast(`Review request for ${name} created via ${channel.toUpperCase()} (${data.status})!`, 'success');
    
    // Reset form
    document.getElementById('send-request-form').reset();
    handleChannelChange();
    updateLivePreview();
    
    // Switch back to dashboard to see the new row
    await fetchData();
    switchTab('dashboard');

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane text-xs"></i> <span>Send Review Request</span>';
  }
}

// Quick Sample Autofill
function fillSampleForm() {
  const samples = [
    { name: 'Liam Davies', email: 'liam.davies@example.com', phone: '+44 7700 900555', job: 'JOB-BATHROOM-12', channel: 'whatsapp' },
    { name: 'Charlotte Reed', email: 'charlotte.reed@example.com', phone: '+44 7700 900666', job: 'JOB-BOILER-99', channel: 'email' },
    { name: 'Oliver Taylor', email: 'oliver.t@example.com', phone: '+44 7700 900777', job: 'JOB-SERVICE-401', channel: 'sms' },
  ];
  const item = samples[Math.floor(Math.random() * samples.length)];
  
  document.getElementById('req-name').value = item.name;
  document.getElementById('req-email').value = item.email;
  document.getElementById('req-phone').value = item.phone;
  document.getElementById('req-job').value = item.job;
  
  const radio = document.querySelector(`input[name="req-channel"][value="${item.channel}"]`);
  if (radio) {
    radio.checked = true;
    handleChannelChange();
  }
  
  updateLivePreview();
  showToast(`Sample customer (${item.channel.toUpperCase()}) loaded`, 'info');
}

// Follow-up Selection & Workflow Functions
function onFollowupThresholdChange() {
  const sel = document.getElementById('followup-threshold-select');
  if (sel) {
    currentFollowupThreshold = parseInt(sel.value, 10);
    const display = document.getElementById('followup-days-display');
    if (display) display.textContent = `${currentFollowupThreshold} days`;
  }
  renderFollowUpsTable();
}

function setFollowupThreshold(val) {
  const sel = document.getElementById('followup-threshold-select');
  if (sel) {
    sel.value = String(val);
    onFollowupThresholdChange();
  }
}

function setFollowupScope(scope) {
  const filter = document.getElementById('followup-scope-filter');
  if (filter) filter.value = scope;
  renderFollowUpsTable();
}

function toggleSelectFollowup(id, isChecked) {
  if (isChecked) {
    selectedFollowUpIds.add(id);
  } else {
    selectedFollowUpIds.delete(id);
  }
  updateBatchBar();
}

function updateBatchBar() {
  const batchBar = document.getElementById('followup-batch-bar');
  const countEl = document.getElementById('selected-followup-count');
  const selectAllBox = document.getElementById('followup-select-all');

  if (countEl) countEl.textContent = selectedFollowUpIds.size;

  if (batchBar) {
    if (selectedFollowUpIds.size > 0) {
      batchBar.classList.remove('hidden');
    } else {
      batchBar.classList.add('hidden');
    }
  }

  if (selectAllBox) {
    const visibleCheckboxes = document.querySelectorAll('#followup-table-body input[type="checkbox"]');
    if (visibleCheckboxes.length > 0) {
      selectAllBox.checked = Array.from(visibleCheckboxes).every(cb => cb.checked);
    } else {
      selectAllBox.checked = false;
    }
  }
}

function toggleSelectAllFollowups(isChecked) {
  const visibleCheckboxes = document.querySelectorAll('#followup-table-body input[type="checkbox"]');
  visibleCheckboxes.forEach(cb => {
    cb.checked = isChecked;
  });

  const scopeFilter = document.getElementById('followup-scope-filter')?.value || 'eligible';
  const thresholdVal = parseInt(document.getElementById('followup-threshold-select')?.value || '3', 10);
  const cutoff = Date.now() - thresholdVal * 24 * 60 * 60 * 1000;

  if (isChecked) {
    allRequests.forEach(r => {
      const validStatus = r.status === 'sent' || r.status === 'queued';
      if (!validStatus) return;
      if (scopeFilter === 'eligible' && (r.followUpSent || r.createdAt > cutoff)) return;
      if (scopeFilter === 'unsent' && r.followUpSent) return;
      if (scopeFilter === 'sent' && !r.followUpSent) return;
      selectedFollowUpIds.add(r.id);
    });
  } else {
    selectedFollowUpIds.clear();
  }
  updateBatchBar();
}

function selectAllFollowupsVisible() {
  const visibleCheckboxes = document.querySelectorAll('#followup-table-body input[type="checkbox"]');
  visibleCheckboxes.forEach(cb => {
    cb.checked = true;
    const match = cb.getAttribute('onchange')?.match(/toggleSelectFollowup\('([^']+)'/);
    if (match && match[1]) {
      selectedFollowUpIds.add(match[1]);
    }
  });
  updateBatchBar();
}

function deselectAllFollowups() {
  selectedFollowUpIds.clear();
  renderFollowUpsTable();
}

// Automated Trigger Follow-up Cycle
async function triggerFollowUps() {
  const triggerBtn = document.getElementById('trigger-followups-btn');
  const originalHtml = triggerBtn ? triggerBtn.innerHTML : '';
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> <span>Checking...</span>';
  }

  const thresholdVal = parseInt(document.getElementById('followup-threshold-select')?.value || String(serverConfig.followUpDays || 3), 10);

  try {
    const res = await fetch('/api/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thresholdDays: thresholdVal,
      }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Follow-up cycle failed');

    if (data.followUpsSent > 0) {
      showToast(`Follow-up cycle complete: sent ${data.followUpsSent} reminder(s)!`, 'success');
    } else {
      showToast(`No customers were due past ${thresholdVal} days. You can switch scope to 'All Unsent' or check checkboxes to send manually!`, 'info');
    }

    await fetchData();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = originalHtml;
    }
  }
}

// Single Customer Direct Follow-up
async function sendSingleFollowUp(id, btn) {
  const req = allRequests.find(r => r.id === id);
  if (!req) return;

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i>';
  }

  try {
    const res = await fetch(`/api/requests/${id}/follow-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send follow-up');

    showToast(`Follow-up reminder sent to ${req.customerName} via ${req.channel.toUpperCase()}!`, 'success');
    await fetchData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

// Batch Follow-up to Selected Customers
async function sendFollowUpsToSelected() {
  if (selectedFollowUpIds.size === 0) {
    showToast('Please select at least one customer first', 'info');
    return;
  }

  const sendBtn = document.getElementById('send-selected-btn');
  const originalHtml = sendBtn ? sendBtn.innerHTML : '';
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> <span>Sending...</span>';
  }

  try {
    const res = await fetch('/api/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestIds: Array.from(selectedFollowUpIds),
        force: true,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send batch follow-ups');

    showToast(`Dispatched follow-up reminders to ${data.followUpsSent} customer(s)!`, 'success');
    selectedFollowUpIds.clear();
    await fetchData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalHtml;
    }
  }
}

// Custom Follow-up Modal Logic
function openCustomFollowUpModal(id) {
  const req = allRequests.find(r => r.id === id);
  if (!req) return;

  activeFollowupModalTarget = req;

  document.getElementById('followup-modal-title').textContent = `Send Follow-up to ${req.customerName}`;
  document.getElementById('followup-modal-subtitle').textContent = `Destination: ${req.email || req.phone || 'N/A'}`;
  document.getElementById('followup-modal-recipient-names').textContent = `${req.customerName} (${req.phone || req.email || 'N/A'})`;

  const badge = document.getElementById('followup-modal-channel-badge');
  if (badge) {
    badge.textContent = req.channel.toUpperCase();
    badge.className = req.channel === 'whatsapp'
      ? 'px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
      : (req.channel === 'sms' ? 'px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20');
  }

  const textarea = document.getElementById('followup-modal-textarea');
  if (req.channel === 'whatsapp') {
    textarea.value = `Hi {{customerName}}, just a gentle follow-up! 👋\n\nIf you have a quick 30 seconds, we'd really appreciate your Google review:\n\n⭐ {{reviewUrl}}\n\nThank you!\n— {{businessName}}`;
  } else if (req.channel === 'sms') {
    textarea.value = `Hi {{customerName}}, quick reminder to leave us a Google review: {{reviewUrl}}`;
  } else {
    textarea.value = `<p>Hi {{customerName}},</p><p>Just a quick follow-up — if you have a moment, we'd really appreciate a Google review.</p><p><a href="{{reviewUrl}}" style="background-color:#4f46e5;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Leave a Google Review</a></p><p>Thanks,<br>{{businessName}}</p>`;
  }

  updateFollowupModalPreview();
  document.getElementById('followup-modal').classList.remove('hidden');
}

function openCustomFollowUpModalForSelected() {
  if (selectedFollowUpIds.size === 0) {
    showToast('Please select at least one customer first', 'info');
    return;
  }

  const selectedList = allRequests.filter(r => selectedFollowUpIds.has(r.id));
  activeFollowupModalTarget = selectedList;

  document.getElementById('followup-modal-title').textContent = `Batch Follow-up (${selectedList.length} Customers)`;
  document.getElementById('followup-modal-subtitle').textContent = `Custom reminder will be sent to all selected recipients`;
  document.getElementById('followup-modal-recipient-names').textContent = selectedList.map(r => r.customerName).join(', ');

  const badge = document.getElementById('followup-modal-channel-badge');
  if (badge) {
    badge.textContent = `${selectedList.length} SELECTED`;
    badge.className = 'px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20';
  }

  const textarea = document.getElementById('followup-modal-textarea');
  textarea.value = `Hi {{customerName}}, just a gentle follow-up! 👋\n\nIf you have a quick 30 seconds, we'd really appreciate your Google review:\n\n⭐ {{reviewUrl}}\n\nThank you!\n— {{businessName}}`;

  updateFollowupModalPreview();
  document.getElementById('followup-modal').classList.remove('hidden');
}

function closeFollowupModal() {
  document.getElementById('followup-modal').classList.add('hidden');
  activeFollowupModalTarget = null;
}

function insertFollowupTag(tag) {
  const textarea = document.getElementById('followup-modal-textarea');
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + tag + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tag.length;
  updateFollowupModalPreview();
}

function updateFollowupModalPreview() {
  const textarea = document.getElementById('followup-modal-textarea');
  const previewBox = document.getElementById('followup-modal-preview-box');
  if (!textarea || !previewBox) return;

  const sampleName = Array.isArray(activeFollowupModalTarget) ? (activeFollowupModalTarget[0]?.customerName || 'Alex Morgan') : (activeFollowupModalTarget?.customerName || 'Alex Morgan');
  const biz = serverConfig.businessName || 'Our Team';
  const reviewUrl = serverConfig.reviewUrl || 'https://g.page/r/YOUR_REVIEW_LINK/review';

  const raw = textarea.value;
  const rendered = raw
    .replace(/\{\{customerName\}\}/g, escapeHtml(sampleName))
    .replace(/\{\{businessName\}\}/g, escapeHtml(biz))
    .replace(/\{\{reviewUrl\}\}/g, escapeHtml(reviewUrl));

  if (raw.includes('<p>') || raw.includes('<div>') || raw.includes('<a ')) {
    previewBox.innerHTML = rendered;
  } else {
    previewBox.textContent = rendered;
  }
}

async function submitModalFollowUp() {
  const textarea = document.getElementById('followup-modal-textarea');
  const customMessage = textarea?.value.trim();
  const sendBtn = document.getElementById('followup-modal-send-btn');
  const originalHtml = sendBtn ? sendBtn.innerHTML : '';

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> <span>Sending...</span>';
  }

  try {
    if (Array.isArray(activeFollowupModalTarget)) {
      // Batch
      const requestIds = activeFollowupModalTarget.map(r => r.id);
      const res = await fetch('/api/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestIds,
          customMessage: customMessage || undefined,
          force: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch follow-up failed');
      showToast(`Dispatched custom follow-up to ${data.followUpsSent} customer(s)!`, 'success');
      selectedFollowUpIds.clear();
    } else if (activeFollowupModalTarget && activeFollowupModalTarget.id) {
      // Single
      const res = await fetch(`/api/requests/${activeFollowupModalTarget.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customMessage: customMessage || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Single follow-up failed');
      showToast(`Follow-up sent to ${activeFollowupModalTarget.customerName}!`, 'success');
    }

    closeFollowupModal();
    await fetchData();
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalHtml;
    }
  }
}


// Template Studio Logic
function selectTemplateTab(type) {
  currentTemplateTab = type;
  const emailTab = document.getElementById('template-tab-email');
  const waTab = document.getElementById('template-tab-whatsapp');
  const smsTab = document.getElementById('template-tab-sms');

  [emailTab, waTab, smsTab].forEach(btn => {
    if (btn) btn.className = 'px-3 py-1 text-xs font-medium rounded-md text-slate-400 hover:text-slate-200 transition';
  });

  if (type === 'email' && emailTab) {
    emailTab.className = 'px-3 py-1 text-xs font-semibold rounded-md bg-indigo-600 text-white transition';
  } else if (type === 'whatsapp' && waTab) {
    waTab.className = 'px-3 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white transition';
  } else if (type === 'sms' && smsTab) {
    smsTab.className = 'px-3 py-1 text-xs font-semibold rounded-md bg-cyan-600 text-white transition';
  }

  renderTemplateEditor();
}

function renderTemplateEditor() {
  const label = document.getElementById('template-editor-label');
  const textarea = document.getElementById('template-editor-textarea');

  if (currentTemplateTab === 'email') {
    label.textContent = 'templates/email-template.md (HTML Template)';
    textarea.value = templates.email;
  } else if (currentTemplateTab === 'whatsapp') {
    label.textContent = 'templates/whatsapp-template.md (WhatsApp Markdown & Emoji Template)';
    textarea.value = templates.whatsapp;
  } else {
    label.textContent = 'templates/sms-template.md (Plain Text / SMS Template)';
    textarea.value = templates.sms;
  }

  handleTemplateEditorInput();
}

function handleTemplateEditorInput() {
  const textarea = document.getElementById('template-editor-textarea');
  const content = textarea.value;
  const renderedBox = document.getElementById('template-rendered-output');

  const biz = serverConfig.businessName || 'Our Team';
  const reviewUrl = serverConfig.reviewUrl || 'https://g.page/r/YOUR_REVIEW_LINK/review';
  const name = 'John Doe';

  if (currentTemplateTab === 'email') {
    templates.email = content;
    const emailRendered = content
      .replace(/\{\{customerName\}\}/g, escapeHtml(name))
      .replace(/\{\{businessName\}\}/g, escapeHtml(biz))
      .replace(/\{\{reviewUrl\}\}/g, escapeHtml(reviewUrl));
    renderedBox.innerHTML = emailRendered;
  } else if (currentTemplateTab === 'whatsapp') {
    templates.whatsapp = content;
    const waRendered = content
      .replace(/\{\{customerName\}\}/g, name)
      .replace(/\{\{businessName\}\}/g, biz)
      .replace(/\{\{reviewUrl\}\}/g, reviewUrl);
    renderedBox.innerHTML = `
      <div class="bg-[#0b141a] p-4 rounded-xl border border-slate-700 font-sans">
        <div class="bg-[#005c4b] text-white p-3.5 rounded-xl rounded-tl-sm text-xs leading-relaxed max-w-sm whitespace-pre-wrap shadow">
          ${escapeHtml(waRendered)}
          <div class="text-[9px] text-emerald-300 text-right mt-1">12:00 PM · ✓✓</div>
        </div>
      </div>
    `;
  } else {
    templates.sms = content;
    const smsRendered = content
      .replace(/\{\{customerName\}\}/g, name)
      .replace(/\{\{businessName\}\}/g, biz)
      .replace(/\{\{reviewUrl\}\}/g, reviewUrl);
    renderedBox.innerHTML = `<div class="bg-indigo-600 text-white p-4 rounded-xl text-xs leading-relaxed max-w-sm font-sans">${escapeHtml(smsRendered)}</div>`;
  }

  document.getElementById('template-save-status').textContent = 'Unsaved edits present...';
}

function insertTag(tag) {
  const textarea = document.getElementById('template-editor-textarea');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + tag + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tag.length;
  handleTemplateEditorInput();
}

async function saveCurrentTemplate() {
  let filename = 'email-template.md';
  let content = templates.email;

  if (currentTemplateTab === 'whatsapp') {
    filename = 'whatsapp-template.md';
    content = templates.whatsapp;
  } else if (currentTemplateTab === 'sms') {
    filename = 'sms-template.md';
    content = templates.sms;
  }

  try {
    const res = await fetch(`/api/templates/${filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save template');

    document.getElementById('template-save-status').textContent = `Saved at ${new Date().toLocaleTimeString()}`;
    showToast(`Template ${filename} saved successfully!`, 'success');
    updateLivePreview();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Seed Demo Data
async function seedSampleData() {
  try {
    const res = await fetch('/api/seed', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to seed sample data');

    showToast(`Loaded ${data.count} demo review records!`, 'success');
    await fetchData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// View Request Details Modal
function viewRequestDetails(id) {
  const req = allRequests.find(r => r.id === id);
  if (!req) return;

  const modal = document.getElementById('details-modal');
  const fields = document.getElementById('modal-fields');
  const jsonPre = document.getElementById('modal-json');

  let waDirectAction = '';
  if (req.whatsappLink) {
    waDirectAction = `
      <div class="col-span-2 bg-emerald-950/40 border border-emerald-800/50 p-2.5 rounded-lg flex items-center justify-between">
        <span class="text-emerald-300 font-medium text-[11px] flex items-center gap-1.5">
          <i class="fa-brands fa-whatsapp text-sm"></i> WhatsApp Link Generated
        </span>
        <a href="${req.whatsappLink}" target="_blank" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[10px] transition">
          Open Chat
        </a>
      </div>
    `;
  }

  fields.innerHTML = `
    <div class="grid grid-cols-2 gap-2 text-slate-300">
      <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
        <span class="text-slate-500 block text-[10px]">Customer Name:</span>
        <span class="font-bold text-slate-100">${escapeHtml(req.customerName)}</span>
      </div>
      <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
        <span class="text-slate-500 block text-[10px]">Channel:</span>
        <span class="font-bold uppercase ${req.channel === 'whatsapp' ? 'text-emerald-400' : 'text-indigo-400'}">${escapeHtml(req.channel)}</span>
      </div>
      <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
        <span class="text-slate-500 block text-[10px]">Email:</span>
        <span class="font-mono text-slate-200">${escapeHtml(req.email || 'None')}</span>
      </div>
      <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
        <span class="text-slate-500 block text-[10px]">Phone:</span>
        <span class="font-mono text-slate-200">${escapeHtml(req.phone || 'None')}</span>
      </div>
      <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
        <span class="text-slate-500 block text-[10px]">Job Reference:</span>
        <span class="font-mono text-slate-200">${escapeHtml(req.jobReference || 'None')}</span>
      </div>
      <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
        <span class="text-slate-500 block text-[10px]">Status:</span>
        <span class="font-bold capitalize text-slate-100">${escapeHtml(req.status)}</span>
      </div>
      <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
        <span class="text-slate-500 block text-[10px]">Created At:</span>
        <span class="text-slate-200">${new Date(req.createdAt).toLocaleString()}</span>
      </div>
      <div class="bg-slate-950 p-2.5 rounded border border-slate-800">
        <span class="text-slate-500 block text-[10px]">Follow-Up Sent:</span>
        <span class="text-slate-200">${req.followUpSent ? `Yes (${new Date(req.followUpSentAt || req.createdAt).toLocaleDateString()})` : 'No'}</span>
      </div>
      ${waDirectAction}
    </div>
  `;

  jsonPre.textContent = JSON.stringify(req, null, 2);
  modal.classList.remove('hidden');
}

function closeDetailsModal() {
  document.getElementById('details-modal').classList.add('hidden');
}

// Delete Request
async function deleteRequest(id) {
  if (!confirm('Are you sure you want to delete this review request record?')) return;

  try {
    const res = await fetch(`/api/requests/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');

    showToast('Record deleted', 'info');
    await fetchData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function testGoogleReviewUrl() {
  if (serverConfig.reviewUrl) {
    window.open(serverConfig.reviewUrl, '_blank');
  }
}

function testGoogleReviewUrlFromInput() {
  const url = document.getElementById('edit-review-url')?.value.trim();
  if (url) {
    window.open(url, '_blank');
  } else {
    showToast('Please enter a Google Review URL first', 'info');
  }
}

function togglePasswordVisibility(fieldId, btn) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) {
      icon.className = 'fa-solid fa-eye-slash';
    }
  } else {
    input.type = 'password';
    if (icon) {
      icon.className = 'fa-solid fa-eye';
    }
  }
}

async function saveServerConfig(e) {
  if (e) e.preventDefault();
  const saveBtn = document.getElementById('save-config-btn');
  const originalHtml = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> <span>Saving...</span>';
  }

  try {
    const businessName = document.getElementById('edit-biz-name')?.value.trim();
    const reviewUrl = document.getElementById('edit-review-url')?.value.trim();
    const followUpDays = parseInt(document.getElementById('edit-followup-days')?.value, 10) || 3;
    const port = parseInt(document.getElementById('edit-port')?.value, 10) || 3001;

    const openwaUrl = document.getElementById('edit-openwa-url')?.value.trim();
    const openwaApiKey = document.getElementById('edit-openwa-key')?.value.trim();
    const openwaSessionId = document.getElementById('edit-openwa-session')?.value.trim() || 'default';

    const smtpHost = document.getElementById('edit-smtp-host')?.value.trim();
    const smtpPort = parseInt(document.getElementById('edit-smtp-port')?.value, 10) || 587;
    const smtpSecure = document.getElementById('edit-smtp-secure')?.checked || false;
    const smtpUser = document.getElementById('edit-smtp-user')?.value.trim();
    const smtpPass = document.getElementById('edit-smtp-pass')?.value.trim();
    const smtpFrom = document.getElementById('edit-smtp-from')?.value.trim();

    const payload = {
      businessName,
      reviewUrl,
      followUpDays,
      port,
      openwaUrl,
      openwaSessionId,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpFrom,
    };

    if (openwaApiKey) payload.openwaApiKey = openwaApiKey;
    if (smtpPass) payload.smtpPass = smtpPass;

    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update configuration');

    showToast('Configuration updated and saved to .env!', 'success');

    // Clear password inputs if values were provided
    const passInput = document.getElementById('edit-smtp-pass');
    if (passInput && smtpPass) passInput.value = '';
    const waKeyInput = document.getElementById('edit-openwa-key');
    if (waKeyInput && openwaApiKey) waKeyInput.value = '';

    await fetchConfig();
    updateLivePreview();
  } catch (err) {
    showToast(`Failed to save config: ${err.message}`, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalHtml;
    }
  }
}

async function testOpenWAConnection() {
  try {
    showToast('Testing Zerix Gateway connection...', 'info');
    const res = await fetch('/api/openwa/status');
    const data = await res.json();

    if (!data.configured) {
      showToast(`Zerix Gateway is not configured in .env yet. Follow setup instructions above.`, 'info');
      return;
    }

    if (data.connected && data.activePhone) {
      showToast(`Connected to Zerix Gateway (${data.url})! Phone: +${data.activePhone} (${data.pushName || 'Ready'}) · Status: ${data.sessionStatus}`, 'success');
      await fetchConfig();
    } else if (data.connected) {
      const sessionCount = data.sessions?.length || 0;
      showToast(`Connected to Zerix Gateway (${data.url})! Found ${sessionCount} session(s), but none in 'ready' state yet. Scan QR code in Gateway.`, 'info');
      await fetchConfig();
    } else {
      showToast(`Could not reach Zerix Gateway at ${data.url}: ${data.error || data.message || 'Offline'}`, 'error');
    }
  } catch (err) {
    showToast(`Zerix Gateway check error: ${err.message}`, 'error');
  }
}


function copySnippet(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    showToast('cURL command copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Could not copy to clipboard', 'error');
  });
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const icon = type === 'success' 
    ? '<i class="fa-solid fa-circle-check text-emerald-400"></i>' 
    : (type === 'error' ? '<i class="fa-solid fa-circle-xmark text-rose-400"></i>' : '<i class="fa-solid fa-circle-info text-indigo-400"></i>');

  toast.className = `toast pointer-events-auto flex items-center gap-3 p-3.5 rounded-xl border bg-slate-900 shadow-2xl text-xs text-slate-100 ${
    type === 'success' ? 'border-emerald-500/40' : (type === 'error' ? 'border-rose-500/40' : 'border-slate-700')
  }`;

  toast.innerHTML = `
    <div class="text-sm">${icon}</div>
    <div class="flex-1 font-medium">${escapeHtml(message)}</div>
    <button onclick="this.parentElement.remove()" class="text-slate-500 hover:text-slate-300"><i class="fa-solid fa-xmark"></i></button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// =========================================================================
// BULK CONTACT IMPORT (CSV, EXCEL, COPY/PASTE)
// =========================================================================

let bulkContacts = [];
let bulkMode = 'upload';
let bulkImporting = false;
let bulkSelectedFile = null;

// Switch Bulk Input Mode (Upload vs Copy & Paste)
function switchBulkMode(mode) {
  bulkMode = mode;
  const uploadPanel = document.getElementById('bulk-upload-panel');
  const pastePanel = document.getElementById('bulk-paste-panel');
  const uploadBtn = document.getElementById('bulk-tab-upload');
  const pasteBtn = document.getElementById('bulk-tab-paste');

  if (mode === 'upload') {
    if (uploadPanel) uploadPanel.classList.remove('hidden');
    if (pastePanel) pastePanel.classList.add('hidden');
    if (uploadBtn) {
      uploadBtn.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/20 transition flex items-center gap-2';
    }
    if (pasteBtn) {
      pasteBtn.className = 'px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition flex items-center gap-2';
    }
  } else {
    if (uploadPanel) uploadPanel.classList.add('hidden');
    if (pastePanel) pastePanel.classList.remove('hidden');
    if (uploadBtn) {
      uploadBtn.className = 'px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition flex items-center gap-2';
    }
    if (pasteBtn) {
      pasteBtn.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/20 transition flex items-center gap-2';
    }
  }
}

// Drag & Drop Handlers for File Dropzone
function handleBulkDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropzone = document.getElementById('bulk-dropzone');
  if (dropzone) {
    dropzone.classList.add('border-indigo-500', 'bg-indigo-950/20');
  }
}

function handleBulkDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropzone = document.getElementById('bulk-dropzone');
  if (dropzone) {
    dropzone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
  }
}

function handleBulkDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dropzone = document.getElementById('bulk-dropzone');
  if (dropzone) {
    dropzone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
  }

  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    processBulkFile(e.dataTransfer.files[0]);
  }
}

function handleBulkFileSelect(e) {
  if (e.target && e.target.files && e.target.files.length > 0) {
    processBulkFile(e.target.files[0]);
  }
}

// Process selected file (Excel .xlsx/.xls or CSV/TSV)
function processBulkFile(file) {
  if (!file) return;
  bulkSelectedFile = file;

  const fileName = file.name || 'file';
  const fileExt = fileName.split('.').pop().toLowerCase();
  const fileSizeStr = file.size > 1024 * 1024 
    ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.round(file.size / 1024)} KB`;

  // Update file info display
  const infoCard = document.getElementById('bulk-file-loaded-info');
  const nameSpan = document.getElementById('bulk-file-name');
  const sizeSpan = document.getElementById('bulk-file-size');
  const icon = document.getElementById('bulk-file-icon');

  if (infoCard) infoCard.classList.remove('hidden');
  if (infoCard) infoCard.classList.add('flex');
  if (nameSpan) nameSpan.textContent = fileName;
  if (sizeSpan) sizeSpan.textContent = fileSizeStr;

  if (icon) {
    if (fileExt === 'xlsx' || fileExt === 'xls') {
      icon.className = 'fa-solid fa-file-excel text-emerald-400 text-lg';
    } else {
      icon.className = 'fa-solid fa-file-csv text-sky-400 text-lg';
    }
  }

  if (fileExt === 'xlsx' || fileExt === 'xls') {
    if (typeof XLSX === 'undefined') {
      showToast('SheetJS Excel library is not available. Please refresh or check connection.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        parseRawRowsToContacts(rawRows);
        showToast(`Parsed ${bulkContacts.length} contacts from Excel sheet "${firstSheetName}"`, 'success');
      } catch (err) {
        console.error('Error reading Excel file:', err);
        showToast(`Failed to parse Excel file: ${err.message}`, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    // CSV, TSV, or TXT
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const text = e.target.result || '';
        parseTextToContacts(text);
        showToast(`Parsed ${bulkContacts.length} contacts from ${fileName}`, 'success');
      } catch (err) {
        console.error('Error reading CSV file:', err);
        showToast(`Failed to parse CSV file: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  }
}

// Copy-Paste Text Area Handler
function handleBulkPasteInput() {
  const textarea = document.getElementById('bulk-paste-textarea');
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) {
    bulkContacts = [];
    renderBulkPreview();
    return;
  }
  parseTextToContacts(text);
}

// Parse Raw Text (CSV, TSV, Tab-delimited copy-paste)
function parseTextToContacts(text) {
  if (!text) {
    bulkContacts = [];
    renderBulkPreview();
    return;
  }

  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    bulkContacts = [];
    renderBulkPreview();
    return;
  }

  // Detect delimiter: check tabs vs commas vs semicolons in top 5 lines
  let tabCount = 0;
  let commaCount = 0;
  let semiCount = 0;
  const sample = lines.slice(0, 5);
  sample.forEach(l => {
    tabCount += (l.match(/\t/g) || []).length;
    commaCount += (l.match(/,/g) || []).length;
    semiCount += (l.match(/;/g) || []).length;
  });

  let delimiter = ',';
  if (tabCount >= commaCount && tabCount >= semiCount && tabCount > 0) {
    delimiter = '\t';
  } else if (semiCount > commaCount && semiCount > 0) {
    delimiter = ';';
  }

  const rawRows = lines.map(line => parseDelimitedLine(line, delimiter));
  parseRawRowsToContacts(rawRows);
}

// Delimited line tokenizer respecting quotes
function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

// Main parser translating 2D array of cells into contact objects
function parseRawRowsToContacts(rawRows) {
  bulkContacts = [];
  if (!rawRows || rawRows.length === 0) {
    renderBulkPreview();
    return;
  }

  // Check row 0 for header indicators
  const row0 = rawRows[0].map(c => String(c || '').trim().toLowerCase());
  let hasHeader = false;
  let colName = -1;
  let colEmail = -1;
  let colPhone = -1;
  let colChannel = -1;
  let colJob = -1;

  row0.forEach((cell, idx) => {
    if (colName === -1 && (cell.includes('name') || cell.includes('customer') || cell.includes('client'))) {
      colName = idx;
      hasHeader = true;
    } else if (colEmail === -1 && (cell.includes('email') || cell.includes('mail'))) {
      colEmail = idx;
      hasHeader = true;
    } else if (colPhone === -1 && (cell.includes('phone') || cell.includes('mobile') || cell.includes('tel') || cell.includes('whatsapp') || cell.includes('number'))) {
      colPhone = idx;
      hasHeader = true;
    } else if (colChannel === -1 && (cell.includes('channel') || cell.includes('method') || cell.includes('type') || cell.includes('via'))) {
      colChannel = idx;
      hasHeader = true;
    } else if (colJob === -1 && (cell.includes('job') || cell.includes('ref') || cell.includes('invoice') || cell.includes('order'))) {
      colJob = idx;
      hasHeader = true;
    }
  });

  const startIndex = hasHeader ? 1 : 0;
  const channelStrategy = document.getElementById('bulk-channel-strategy')?.value || 'auto';
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  for (let i = startIndex; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every(cell => String(cell || '').trim() === '')) {
      continue; // Skip blank rows
    }

    let customerName = '';
    let email = '';
    let phone = '';
    let rowChannel = '';
    let jobReference = '';

    if (hasHeader) {
      if (colName !== -1 && row[colName] !== undefined) customerName = String(row[colName]).trim();
      if (colEmail !== -1 && row[colEmail] !== undefined) email = String(row[colEmail]).trim();
      if (colPhone !== -1 && row[colPhone] !== undefined) phone = String(row[colPhone]).trim();
      if (colChannel !== -1 && row[colChannel] !== undefined) rowChannel = String(row[colChannel]).trim().toLowerCase();
      if (colJob !== -1 && row[colJob] !== undefined) jobReference = String(row[colJob]).trim();
    } else {
      // Heuristic column detection
      customerName = String(row[0] || '').trim();
      for (let c = 1; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        if (!val) continue;

        if (val.includes('@') && !email) {
          email = val;
        } else if ((val.startsWith('+') || /^[0-9\s\-()]{7,}$/.test(val)) && !phone) {
          phone = val;
        } else if (['whatsapp', 'email', 'sms', 'auto'].includes(val.toLowerCase()) && !rowChannel) {
          rowChannel = val.toLowerCase();
        } else if (!jobReference) {
          jobReference = val;
        }
      }
    }

    // Clean phone number (remove spaces, parentheses, dashes)
    let cleanPhone = phone ? phone.replace(/[\s\-\(\)]/g, '') : '';
    if (cleanPhone && !cleanPhone.startsWith('+') && cleanPhone.length === 10) {
      // Default clean
      cleanPhone = cleanPhone;
    }

    // Determine target channel based on strategy & inputs
    let targetChannel = 'auto';
    if (channelStrategy === 'whatsapp') {
      targetChannel = 'whatsapp';
    } else if (channelStrategy === 'email') {
      targetChannel = 'email';
    } else if (channelStrategy === 'sms') {
      targetChannel = 'sms';
    } else if (channelStrategy === 'column' && rowChannel && ['whatsapp', 'email', 'sms'].includes(rowChannel)) {
      targetChannel = rowChannel;
    } else {
      // Auto-detect: WhatsApp if phone exists, else Email
      if (cleanPhone) {
        targetChannel = 'whatsapp';
      } else if (email) {
        targetChannel = 'email';
      } else {
        targetChannel = 'whatsapp';
      }
    }

    // Check for recent duplicates in existing requests
    const isDuplicate = allRequests.some(r => {
      if (r.createdAt < sevenDaysAgo) return false;
      if (cleanPhone && r.phone && r.phone === cleanPhone) return true;
      if (email && r.email && r.email.toLowerCase() === email.toLowerCase()) return true;
      return false;
    });

    // Validation checks
    let valid = true;
    let reason = 'Ready';

    if (!customerName) {
      valid = false;
      reason = 'Missing customer name';
    } else if (!email && !cleanPhone) {
      valid = false;
      reason = 'Missing both email and phone';
    } else if (targetChannel === 'whatsapp' && !cleanPhone) {
      valid = false;
      reason = 'WhatsApp requires phone number';
    } else if (targetChannel === 'sms' && !cleanPhone) {
      valid = false;
      reason = 'SMS requires phone number';
    } else if (targetChannel === 'email' && !email) {
      valid = false;
      reason = 'Email channel requires valid email';
    } else if (isDuplicate) {
      reason = 'Duplicate: Requested within 7 days';
    }

    bulkContacts.push({
      originalIndex: i + 1,
      customerName,
      email,
      phone: cleanPhone,
      channel: targetChannel,
      jobReference,
      valid,
      reason,
      isDuplicate,
    });
  }

  renderBulkPreview();
}

// Recalculate preview when user modifies strategy
function recalculateBulkPreview() {
  const channelStrategy = document.getElementById('bulk-channel-strategy')?.value || 'auto';
  const dispatchMode = document.getElementById('bulk-dispatch-mode')?.value || 'send';
  const submitLabel = document.getElementById('bulk-submit-label');

  bulkContacts.forEach(c => {
    let targetChannel = 'auto';
    if (channelStrategy === 'whatsapp') {
      targetChannel = 'whatsapp';
    } else if (channelStrategy === 'email') {
      targetChannel = 'email';
    } else if (channelStrategy === 'sms') {
      targetChannel = 'sms';
    } else {
      targetChannel = c.phone ? 'whatsapp' : 'email';
    }
    c.channel = targetChannel;

    let valid = true;
    let reason = 'Ready';
    if (!c.customerName) {
      valid = false;
      reason = 'Missing customer name';
    } else if (!c.email && !c.phone) {
      valid = false;
      reason = 'Missing both email and phone';
    } else if (targetChannel === 'whatsapp' && !c.phone) {
      valid = false;
      reason = 'WhatsApp requires phone number';
    } else if (targetChannel === 'sms' && !c.phone) {
      valid = false;
      reason = 'SMS requires phone number';
    } else if (targetChannel === 'email' && !c.email) {
      valid = false;
      reason = 'Email channel requires valid email';
    } else if (c.isDuplicate) {
      reason = 'Duplicate: Requested within 7 days';
    }

    c.valid = valid;
    c.reason = reason;
  });

  renderBulkPreview();
}

// Render Preview Table & Statistics
function renderBulkPreview() {
  const tbody = document.getElementById('bulk-preview-tbody');
  const countTotal = document.getElementById('bulk-count-total');
  const countValid = document.getElementById('bulk-count-valid');
  const countInvalid = document.getElementById('bulk-count-invalid');
  const waCountSpan = document.getElementById('bulk-wa-count');
  const emailCountSpan = document.getElementById('bulk-email-count');
  const smsCountSpan = document.getElementById('bulk-sms-count');
  const channelBreakdown = document.getElementById('bulk-channel-breakdown');
  const submitBtn = document.getElementById('bulk-submit-btn');
  const submitLabel = document.getElementById('bulk-submit-label');
  const dispatchMode = document.getElementById('bulk-dispatch-mode')?.value || 'send';

  if (!tbody) return;

  const total = bulkContacts.length;
  const validCount = bulkContacts.filter(c => c.valid).length;
  const invalidCount = total - validCount;

  let waCount = 0;
  let emailCount = 0;
  let smsCount = 0;

  bulkContacts.forEach(c => {
    if (c.valid) {
      if (c.channel === 'whatsapp') waCount++;
      else if (c.channel === 'email') emailCount++;
      else if (c.channel === 'sms') smsCount++;
    }
  });

  // Update counters
  if (countTotal) countTotal.textContent = `${total} rows parsed`;
  if (countValid) countValid.textContent = `${validCount} valid`;
  if (countInvalid) {
    if (invalidCount > 0) {
      countInvalid.classList.remove('hidden');
      countInvalid.textContent = `${invalidCount} issues`;
    } else {
      countInvalid.classList.add('hidden');
    }
  }

  if (channelBreakdown) {
    if (total > 0) {
      channelBreakdown.classList.remove('hidden');
      channelBreakdown.classList.add('flex');
    } else {
      channelBreakdown.classList.add('hidden');
    }
  }

  if (waCountSpan) waCountSpan.textContent = `WA: ${waCount}`;
  if (emailCountSpan) emailCountSpan.textContent = `Email: ${emailCount}`;
  if (smsCountSpan) smsCountSpan.textContent = `SMS: ${smsCount}`;

  // Update submit button
  if (submitBtn) {
    submitBtn.disabled = validCount === 0 || bulkImporting;
  }
  if (submitLabel) {
    const verb = dispatchMode === 'queue' ? 'Import & Queue' : 'Import & Dispatch';
    submitLabel.textContent = `${verb} (${validCount})`;
  }

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="px-4 py-12 text-center text-slate-500">
          <i class="fa-solid fa-file-excel text-3xl mb-2 text-slate-600 block"></i>
          <p class="font-medium text-slate-400">No contacts loaded yet</p>
          <p class="text-xs text-slate-600 mt-1">Upload an Excel/CSV file or paste contacts above to view preview.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = bulkContacts.map((c, index) => {
    // Channel Badge
    let channelBadge = '';
    if (c.channel === 'whatsapp') {
      channelBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium text-[11px]"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>`;
    } else if (c.channel === 'email') {
      channelBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium text-[11px]"><i class="fa-solid fa-envelope"></i> Email</span>`;
    } else if (c.channel === 'sms') {
      channelBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium text-[11px]"><i class="fa-solid fa-comment-sms"></i> SMS</span>`;
    } else {
      channelBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium text-[11px]">Auto</span>`;
    }

    // Status Badge
    let statusBadge = '';
    if (!c.valid) {
      statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium text-[10px]" title="${escapeHtml(c.reason)}"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(c.reason)}</span>`;
    } else if (c.isDuplicate) {
      statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium text-[10px]" title="Customer received a request in the past 7 days"><i class="fa-solid fa-shield-halved"></i> 7-Day Duplicate</span>`;
    } else {
      statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium text-[10px]"><i class="fa-solid fa-check"></i> Ready</span>`;
    }

    return `
      <tr class="hover:bg-slate-800/40 transition ${!c.valid ? 'bg-rose-950/10' : ''}">
        <td class="px-3 py-2.5 text-center text-slate-500 font-mono text-[11px]">${index + 1}</td>
        <td class="px-4 py-2.5 font-medium text-slate-200">
          ${c.customerName ? escapeHtml(c.customerName) : '<span class="text-rose-400 italic">Missing name</span>'}
        </td>
        <td class="px-4 py-2.5 text-slate-400 font-mono text-[11px]">
          ${c.email ? escapeHtml(c.email) : '<span class="text-slate-600">—</span>'}
        </td>
        <td class="px-4 py-2.5 text-slate-400 font-mono text-[11px]">
          ${c.phone ? escapeHtml(c.phone) : '<span class="text-slate-600">—</span>'}
        </td>
        <td class="px-4 py-2.5">${channelBadge}</td>
        <td class="px-4 py-2.5 text-slate-400 font-mono text-[11px]">
          ${c.jobReference ? escapeHtml(c.jobReference) : '<span class="text-slate-600">—</span>'}
        </td>
        <td class="px-4 py-2.5">${statusBadge}</td>
        <td class="px-4 py-2.5 text-right">
          <button type="button" onclick="removeBulkContact(${index})" title="Remove contact from import" class="text-slate-500 hover:text-rose-400 p-1 transition rounded">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Remove single row from bulk array
function removeBulkContact(index) {
  if (index >= 0 && index < bulkContacts.length) {
    bulkContacts.splice(index, 1);
    renderBulkPreview();
    showToast('Row removed from import list', 'info');
  }
}

// Clear individual sections
function clearBulkFile() {
  bulkSelectedFile = null;
  const fileInput = document.getElementById('bulk-file-input');
  if (fileInput) fileInput.value = '';
  const infoCard = document.getElementById('bulk-file-loaded-info');
  if (infoCard) {
    infoCard.classList.add('hidden');
    infoCard.classList.remove('flex');
  }
  bulkContacts = [];
  renderBulkPreview();
}

function clearBulkPaste() {
  const textarea = document.getElementById('bulk-paste-textarea');
  if (textarea) textarea.value = '';
  bulkContacts = [];
  renderBulkPreview();
}

function clearBulkAll() {
  clearBulkFile();
  clearBulkPaste();
  dismissBulkResults();
  showToast('Bulk import queue cleared', 'info');
}

function dismissBulkResults() {
  const card = document.getElementById('bulk-results-card');
  if (card) card.classList.add('hidden');
}

// Populate sample contacts into copy-paste box for testing
function pasteSampleBulkData() {
  switchBulkMode('paste');
  const textarea = document.getElementById('bulk-paste-textarea');
  if (!textarea) return;

  const sampleTsv = 
`Customer Name\tEmail\tPhone\tChannel\tReference
Alex Morgan\talex.morgan@example.com\t+447700900000\twhatsapp\tINV-1001
Sarah Jenkins\tsarah.jenkins@example.com\t\temail\tINV-1002
David Patel\t\t+447700900002\tsms\tJOB-8842
Elena Rostova\telena.rostova@example.com\t+447700900003\twhatsapp\tINV-1004
Marcus Vance\tmarcus.v@example.com\t+447700900004\tauto\tPO-9912
Priya Sharma\tpriya@example.com\t+447700900005\twhatsapp\tJOB-3319`;

  textarea.value = sampleTsv;
  handleBulkPasteInput();
  showToast('Loaded 6 demo contacts for bulk testing', 'success');
}

// Download Sample CSV Template
function downloadSampleCsv() {
  const csvContent = 
`Customer Name,Email,Phone,Channel,Job Reference
Alex Morgan,alex.morgan@example.com,+447700900000,whatsapp,INV-1001
Sarah Jenkins,sarah.jenkins@example.com,,email,INV-1002
David Patel,,+447700900002,sms,JOB-8842
Elena Rostova,elena.rostova@example.com,+447700900003,whatsapp,INV-1004
Marcus Vance,marcus.v@example.com,+447700900004,auto,PO-9912`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'zerix_sample_contacts.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Downloaded sample CSV template', 'info');
}

// Download Sample Excel (.xlsx) Template using SheetJS
function downloadSampleExcel() {
  if (typeof XLSX === 'undefined') {
    downloadSampleCsv();
    return;
  }

  const sampleData = [
    ['Customer Name', 'Email', 'Phone', 'Channel', 'Job Reference'],
    ['Alex Morgan', 'alex.morgan@example.com', '+447700900000', 'whatsapp', 'INV-1001'],
    ['Sarah Jenkins', 'sarah.jenkins@example.com', '', 'email', 'INV-1002'],
    ['David Patel', '', '+447700900002', 'sms', 'JOB-8842'],
    ['Elena Rostova', 'elena.rostova@example.com', '+447700900003', 'whatsapp', 'INV-1004'],
    ['Marcus Vance', 'marcus.v@example.com', '+447700900004', 'auto', 'PO-9912']
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
  // Auto-width columns
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 16 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
  XLSX.writeFile(workbook, 'zerix_sample_contacts.xlsx');
  showToast('Downloaded sample Excel (.xlsx) template', 'info');
}

// Submit Bulk Import to Server API
async function submitBulkImport() {
  if (bulkImporting) return;

  const validContacts = bulkContacts.filter(c => c.valid);
  if (validContacts.length === 0) {
    showToast('No valid contacts to import. Please check rows with errors.', 'error');
    return;
  }

  const channelStrategy = document.getElementById('bulk-channel-strategy')?.value || 'auto';
  const duplicateStrategy = document.getElementById('bulk-duplicate-strategy')?.value || 'skip';
  const dispatchMode = document.getElementById('bulk-dispatch-mode')?.value || 'send';

  const force = duplicateStrategy === 'force';
  const queueOnly = dispatchMode === 'queue';

  bulkImporting = true;
  const submitBtn = document.getElementById('bulk-submit-btn');
  const submitLabel = document.getElementById('bulk-submit-label');
  const progressContainer = document.getElementById('bulk-progress-container');
  const progressFill = document.getElementById('bulk-progress-fill');
  const progressPercent = document.getElementById('bulk-progress-percent');
  const progressStatus = document.getElementById('bulk-progress-status');

  if (submitBtn) submitBtn.disabled = true;
  if (submitLabel) submitLabel.textContent = 'Processing import...';
  if (progressContainer) progressContainer.classList.remove('hidden');
  if (progressFill) progressFill.style.width = '20%';
  if (progressPercent) progressPercent.textContent = '20%';
  if (progressStatus) progressStatus.textContent = `Dispatching ${validContacts.length} review requests...`;

  try {
    const payload = {
      contacts: validContacts.map(c => ({
        customerName: c.customerName,
        email: c.email || undefined,
        phone: c.phone || undefined,
        channel: c.channel,
        jobReference: c.jobReference || undefined,
      })),
      defaultChannel: channelStrategy,
      force,
      queueOnly,
    };

    if (progressFill) progressFill.style.width = '60%';
    if (progressPercent) progressPercent.textContent = '60%';

    const res = await fetch('/api/requests/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (progressFill) progressFill.style.width = '95%';
    if (progressPercent) progressPercent.textContent = '95%';

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Bulk import request failed (${res.status})`);
    }

    const report = await res.json();

    if (progressFill) progressFill.style.width = '100%';
    if (progressPercent) progressPercent.textContent = '100%';
    if (progressStatus) progressStatus.textContent = 'Import finished successfully!';

    // Render Results Card
    const resultsCard = document.getElementById('bulk-results-card');
    const sentP = document.getElementById('bulk-res-sent');
    const queuedP = document.getElementById('bulk-res-queued');
    const skippedP = document.getElementById('bulk-res-skipped');
    const failedP = document.getElementById('bulk-res-failed');
    const timestampP = document.getElementById('bulk-results-timestamp');
    const detailsContainer = document.getElementById('bulk-details-container');
    const detailsList = document.getElementById('bulk-details-list');

    if (sentP) sentP.textContent = report.sent || 0;
    if (queuedP) queuedP.textContent = report.queued || 0;
    if (skippedP) skippedP.textContent = report.skipped || 0;
    if (failedP) failedP.textContent = (report.failed || 0) + (report.errors ? report.errors.length : 0);
    if (timestampP) timestampP.textContent = `Finished at ${new Date().toLocaleTimeString()} · Processed ${report.total} items`;

    // Populate review list for skipped or failed
    const issues = [];
    if (Array.isArray(report.results)) {
      report.results.filter(r => r.status === 'skipped').forEach(r => {
        issues.push(`<div class="p-2 bg-purple-950/30 border border-purple-900/50 rounded flex items-center justify-between text-purple-300">
          <span>Row #${r.index} — <strong>${escapeHtml(r.customerName)}</strong> (${r.channel}): ${escapeHtml(r.reason || 'Duplicate skipped')}</span>
          <span class="text-[10px] bg-purple-900/40 px-2 py-0.5 rounded font-mono">SKIPPED</span>
        </div>`);
      });
      report.results.filter(r => r.status === 'failed').forEach(r => {
        issues.push(`<div class="p-2 bg-rose-950/30 border border-rose-900/50 rounded flex items-center justify-between text-rose-300">
          <span>Row #${r.index} — <strong>${escapeHtml(r.customerName)}</strong>: ${escapeHtml(r.errorMessage || 'Dispatch failed')}</span>
          <span class="text-[10px] bg-rose-900/40 px-2 py-0.5 rounded font-mono">FAILED</span>
        </div>`);
      });
    }
    if (Array.isArray(report.errors)) {
      report.errors.forEach(e => {
        issues.push(`<div class="p-2 bg-rose-950/30 border border-rose-900/50 rounded flex items-center justify-between text-rose-300">
          <span>Row #${e.index} — <strong>${escapeHtml(e.customerName)}</strong>: ${escapeHtml(e.error)}</span>
          <span class="text-[10px] bg-rose-900/40 px-2 py-0.5 rounded font-mono">ERROR</span>
        </div>`);
      });
    }

    if (detailsContainer && detailsList) {
      if (issues.length > 0) {
        detailsContainer.classList.remove('hidden');
        detailsList.innerHTML = issues.join('');
      } else {
        detailsContainer.classList.add('hidden');
      }
    }

    if (resultsCard) {
      resultsCard.classList.remove('hidden');
      resultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    showToast(`Bulk import complete: ${report.sent} sent, ${report.queued} queued, ${report.skipped} skipped`, 'success');

    // Refresh application requests & metrics
    await fetchData(true);

  } catch (err) {
    console.error('Error submitting bulk import:', err);
    showToast(`Bulk import failed: ${err.message}`, 'error');
  } finally {
    bulkImporting = false;
    if (submitBtn) submitBtn.disabled = false;
    setTimeout(() => {
      if (progressContainer) progressContainer.classList.add('hidden');
      if (progressFill) progressFill.style.width = '0%';
    }, 1500);
    renderBulkPreview();
  }
}

