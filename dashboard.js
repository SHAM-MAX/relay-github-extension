/*
 * Relay AI — Full-Page AI Project Management Workspace Controller
 * Adheres strictly to extension security guidelines:
 * - Uses RelayAIAssistant client for API communications
 * - Never uses innerHTML, eval, raw fetch, or unescaped strings
 * - Safe DOM element manipulation using document.createElement & textContent
 */

(() => {
  "use strict";

  /* =========================================================
     DOM SELECTORS
     ========================================================= */

  const $ = id => document.getElementById(id);

  const ui = {
    app: $("relay-workspace-app"),
    sidebar: $("relay-workspace-sidebar"),
    sidebarToggle: $("relay-sidebar-toggle"),
    statusDot: $("relay-status-dot"),
    connectionText: $("relay-connection-text"),
    connectionAccount: $("relay-connection-account"),
    sidebarAuthBtn: $("relay-sidebar-auth-btn"),
    topbarAuthBtn: $("relay-topbar-auth-btn"),
    topbarBadge: $("relay-topbar-badge"),
    repoSelect: $("relay-repo-select"),
    viewGithubLink: $("relay-view-github-link"),
    workspaceRefresh: $("relay-workspace-refresh"),
    alert: $("relay-workspace-alert"),
    alertMsg: $("relay-workspace-alert-msg"),
    alertClose: $("relay-workspace-alert-close"),
    // Views
    viewDashboard: $("relay-view-dashboard"),
    viewChat: $("relay-view-chat"),
    viewHealth: $("relay-view-health"),
    viewTraceability: $("relay-view-traceability"),
    viewAssignment: $("relay-view-assignment"),
    viewReports: $("relay-view-reports"),
    viewTeam: $("relay-view-team"),
    viewRisks: $("relay-view-risks"),
    viewHistory: $("relay-view-history"),
    viewSettings: $("relay-view-settings"),
    // Chat components
    chatMessages: $("relay-chat-messages"),
    chatEmptyState: $("relay-chat-empty-state"),
    chatForm: $("relay-chat-form"),
    chatInput: $("relay-chat-input"),
    chatFile: $("relay-chat-file"),
    chatSend: $("relay-chat-send"),
    chatCharCounter: $("relay-chat-char-counter"),
    chatAttachments: $("relay-chat-attachments-list"),
    modelSelect: $("relay-model-select"),
    clearChatBtn: $("relay-clear-chat-btn"),
    proposedPanel: $("relay-proposed-issues-panel"),
    proposedList: $("relay-proposed-list"),
    proposedCount: $("relay-proposed-count"),
    // Health components
    healthLoading: $("relay-health-loading"),
    healthContainer: $("relay-health-container"),
    healthRefreshBtn: $("relay-health-refresh-btn"),
    // Traceability components
    traceabilityLoading: $("relay-traceability-loading"),
    traceabilityContainer: $("relay-traceability-container"),
    traceabilityRefreshBtn: $("relay-traceability-refresh-btn"),
    // Reports components
    reportsLoading: $("relay-reports-loading"),
    reportsContainer: $("relay-reports-container"),
    reportsRefreshBtn: $("relay-reports-refresh-btn"),
    // Profile Modal
    profileModal: $("relay-profile-modal-overlay"),
    profileModalClose: $("relay-modal-profile-close"),
    profileModalCancel: $("relay-modal-profile-cancel"),
    profileModalSave: $("relay-modal-profile-save"),
    modalSkills: $("relay-modal-skills"),
    modalCapacity: $("relay-modal-capacity"),
    modalMaxTasks: $("relay-modal-maxtasks"),
    modalAvailability: $("relay-modal-availability"),
    modalStatus: $("relay-modal-profile-status"),
    // Settings elements
    settingsAuthStatus: $("relay-settings-auth-status"),
    settingsLoginBtn: $("relay-settings-login-btn"),
    settingsLogoutBtn: $("relay-settings-logout-btn"),
    settingsSkills: $("relay-setting-skills"),
    settingsCapacity: $("relay-setting-capacity"),
    settingsMaxTasks: $("relay-setting-maxtasks"),
    settingsSaveProfile: $("relay-settings-save-profile"),
    settingsProfileMsg: $("relay-settings-profile-msg"),
    // Assignment evaluation elements
    assignTaskTitle: $("relay-assign-task-title"),
    assignTaskSkills: $("relay-assign-task-skills"),
    assignEvaluateBtn: $("relay-assign-evaluate-btn"),
    assignLoading: $("relay-assignment-loading"),
    assignResults: $("relay-assignment-results")
  };

  /* =========================================================
     WORKSPACE STATE
     ========================================================= */

  const state = {
    activeView: "dashboard",
    currentContext: null,
    isAuthenticated: false,
    user: null,
    repositories: [],
    messages: [],
    attachments: [],
    chatBusy: false,
    healthData: null,
    traceabilityData: null,
    reportsData: null,
    cachedProfiles: new Map()
  };

  /* =========================================================
     INITIALIZATION & CONTEXT DETECTION
     ========================================================= */

  function initContext() {
    let owner = null;
    let repo = null;

    try {
      if (typeof location !== "undefined" && location.search) {
        const params = new URLSearchParams(location.search);
        owner = params.get("owner");
        repo = params.get("repo");
      }
    } catch (_) {}

    if (!owner || !repo) {
      owner = "SHAM-MAX";
      repo = "new-kanban-board";
    }

    state.currentContext = {
      host: "github.com",
      owner,
      repository: repo,
      url: `https://github.com/${owner}/${repo}`,
      pageType: "repository",
      issueNumber: null,
      pullRequestNumber: null,
      branch: null
    };

    updateTopbarRepo();
  }

  function updateTopbarRepo() {
    const ctx = state.currentContext;
    if (!ctx) return;

    if (ui.viewGithubLink) {
      ui.viewGithubLink.href = ctx.url;
      ui.viewGithubLink.title = `Open https://github.com/${ctx.owner}/${ctx.repository} in GitHub`;
    }

    if (ui.repoSelect) {
      const currentVal = `${ctx.owner}/${ctx.repository}`;
      let hasOption = false;
      const optionsList = ui.repoSelect.options || ui.repoSelect.children || [];
      for (const opt of optionsList) {
        if (opt.value === currentVal) {
          opt.selected = true;
          hasOption = true;
          break;
        }
      }
      if (!hasOption) {
        const newOpt = document.createElement("option");
        newOpt.value = currentVal;
        newOpt.textContent = currentVal;
        newOpt.selected = true;
        ui.repoSelect.append(newOpt);
      }
      ui.repoSelect.value = currentVal;
    }
  }

  /* =========================================================
     VIEW SWITCHING & NAVIGATION
     ========================================================= */

  function switchView(viewName) {
    state.activeView = viewName;

    // Update active nav item
    const navItems = document.querySelectorAll(".relay-nav-item");
    for (const item of navItems) {
      if (item.getAttribute("data-view") === viewName) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    }

    // Hide all view sections
    const views = [
      ui.viewDashboard,
      ui.viewChat,
      ui.viewHealth,
      ui.viewTraceability,
      ui.viewAssignment,
      ui.viewReports,
      ui.viewTeam,
      ui.viewRisks,
      ui.viewHistory,
      ui.viewSettings
    ];

    for (const v of views) {
      if (!v) continue;
      if (v.id === `relay-view-${viewName}`) {
        v.classList.remove("hidden");
      } else {
        v.classList.add("hidden");
      }
    }

    // Trigger lazy loading of view data if needed
    if (viewName === "health" && !state.healthData) {
      loadHealthView();
    } else if (viewName === "traceability" && !state.traceabilityData) {
      loadTraceabilityView();
    } else if (viewName === "reports" && !state.reportsData) {
      loadReportsView();
    } else if (viewName === "dashboard") {
      loadDashboardOverview();
    }
  }

  function setupNavigation() {
    const navButtons = document.querySelectorAll(".relay-nav-item");
    for (const btn of navButtons) {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        if (view) switchView(view);
      });
    }

    // Sidebar collapse toggle
    if (ui.sidebarToggle && ui.sidebar) {
      ui.sidebarToggle.addEventListener("click", () => {
        ui.sidebar.classList.toggle("collapsed");
      });
    }

    // Quick action buttons in Dashboard overview
    const askAssistantBtn = $("relay-dashboard-run-assistant");
    if (askAssistantBtn) {
      askAssistantBtn.addEventListener("click", () => switchView("chat"));
    }

    const planWorkBtn = $("relay-action-plan-work");
    if (planWorkBtn) {
      planWorkBtn.addEventListener("click", () => {
        switchView("chat");
        if (ui.chatInput) {
          ui.chatInput.value = "Please analyze the current project requirements and create a structured implementation plan with traceable GitHub issues.";
          updateChatInputState();
        }
      });
    }

    const matrixBtn = $("relay-action-view-matrix");
    if (matrixBtn) {
      matrixBtn.addEventListener("click", () => switchView("traceability"));
    }

    const reportBtn = $("relay-action-generate-report");
    if (reportBtn) {
      reportBtn.addEventListener("click", () => switchView("reports"));
    }

    const profileBtn = $("relay-action-edit-profile");
    if (profileBtn) {
      profileBtn.addEventListener("click", () => openProfileModal());
    }

    const assignProfileBtn = $("relay-assignment-profile-btn");
    if (assignProfileBtn) {
      assignProfileBtn.addEventListener("click", () => openProfileModal());
    }

    const teamProfileBtn = $("relay-team-add-profile-btn");
    if (teamProfileBtn) {
      teamProfileBtn.addEventListener("click", () => openProfileModal());
    }
  }

  /* =========================================================
     AUTHENTICATION & SESSION HANDLING
     ========================================================= */

  async function checkAuthentication() {
    if (!globalThis.RelayAIAssistant?.checkAuth) {
      setAuthUI(false);
      return;
    }

    try {
      const isAuth = await RelayAIAssistant.checkAuth();
      state.isAuthenticated = Boolean(isAuth);
      setAuthUI(state.isAuthenticated);
      if (state.isAuthenticated) {
        await loadRepositoriesList();
      }
    } catch (_) {
      setAuthUI(false);
    }
  }

  function setAuthUI(authenticated, username) {
    state.isAuthenticated = authenticated;
    const userLabel = username || "GitHub User";

    if (ui.statusDot) {
      ui.statusDot.className = authenticated
        ? "relay-status-dot relay-status-connected"
        : "relay-status-dot relay-status-disconnected";
    }

    if (ui.connectionText) {
      ui.connectionText.textContent = authenticated ? "Relay Connected" : "Not Connected";
    }

    if (ui.connectionAccount) {
      ui.connectionAccount.textContent = authenticated ? userLabel : "Click to sign in";
    }

    if (ui.sidebarAuthBtn) {
      ui.sidebarAuthBtn.textContent = authenticated ? "Sign Out" : "Connect Relay";
    }

    if (ui.topbarAuthBtn) {
      ui.topbarAuthBtn.textContent = authenticated ? "Sign Out" : "Sign In";
    }

    if (ui.topbarBadge) {
      ui.topbarBadge.className = authenticated
        ? "relay-auth-badge relay-auth-badge-connected"
        : "relay-auth-badge relay-auth-badge-disconnected";
      ui.topbarBadge.textContent = authenticated ? "Connected" : "Disconnected";
    }

    if (ui.settingsAuthStatus) {
      ui.settingsAuthStatus.className = authenticated
        ? "relay-pill-badge relay-pill-success"
        : "relay-pill-badge relay-pill-danger";
      ui.settingsAuthStatus.textContent = authenticated ? `Connected (${userLabel})` : "Disconnected";
    }

    if (ui.settingsLoginBtn) {
      ui.settingsLoginBtn.classList.toggle("hidden", authenticated);
    }
    if (ui.settingsLogoutBtn) {
      ui.settingsLogoutBtn.classList.toggle("hidden", !authenticated);
    }
  }

  async function handleAuthAction() {
    if (state.isAuthenticated) {
      if (globalThis.RelayAIAssistant?.logout) {
        try {
          await RelayAIAssistant.logout();
        } catch (_) {}
      }
      setAuthUI(false);
      showAlert("Logged out from Relay.", "info");
    } else {
      if (globalThis.RelayAIAssistant?.login) {
        try {
          const res = await RelayAIAssistant.login();
          setAuthUI(true, res?.username);
          showAlert("Successfully authenticated with GitHub.", "success");
          await loadRepositoriesList();
          loadDashboardOverview();
        } catch (err) {
          showAlert(err.message || "Failed to connect to Relay.", "danger");
        }
      }
    }
  }

  async function loadRepositoriesList() {
    if (!globalThis.RelayAIAssistant?.getRepositories) return;
    try {
      const res = await RelayAIAssistant.getRepositories();
      if (!res.ok) return;
      const data = await res.json();
      const repos = data.repositories || (Array.isArray(data) ? data : []);
      if (Array.isArray(repos) && repos.length > 0) {
        state.repositories = repos;
        renderRepositoriesDropdown(repos);
      }
    } catch (_) {}
  }

  function renderRepositoriesDropdown(repos) {
    if (!ui.repoSelect) return;
    ui.repoSelect.replaceChildren();

    const currentFullName = state.currentContext
      ? `${state.currentContext.owner}/${state.currentContext.repository}`
      : "";

    for (const repo of repos) {
      const fullName = repo.full_name || (repo.owner && repo.name ? `${repo.owner.login || repo.owner}/${repo.name}` : String(repo));
      const opt = document.createElement("option");
      opt.value = fullName;
      opt.textContent = fullName;
      if (fullName.toLowerCase() === currentFullName.toLowerCase()) {
        opt.selected = true;
      }
      ui.repoSelect.append(opt);
    }
  }

  function handleRepoChange(newFullName) {
    if (!newFullName || !newFullName.includes("/")) return;
    const [newOwner, newRepo] = newFullName.split("/");

    state.currentContext = {
      host: "github.com",
      owner: newOwner,
      repository: newRepo,
      url: `https://github.com/${newOwner}/${newRepo}`,
      pageType: "repository",
      issueNumber: null,
      pullRequestNumber: null,
      branch: null
    };

    updateTopbarRepo();

    // Reset view caches
    state.healthData = null;
    state.traceabilityData = null;
    state.reportsData = null;

    // Refresh active view
    switchView(state.activeView);
    showAlert(`Switched repository context to ${newFullName}`, "info");
  }

  /* =========================================================
     ALERT NOTIFICATIONS
     ========================================================= */

  function showAlert(message, type = "info") {
    if (!ui.alert || !ui.alertMsg) return;
    ui.alertMsg.textContent = message;
    ui.alert.className = `relay-alert relay-alert-${type}`;
    ui.alert.classList.remove("hidden");
  }

  function hideAlert() {
    if (ui.alert) ui.alert.classList.add("hidden");
  }

  /* =========================================================
     1. DASHBOARD OVERVIEW ENGINE
     ========================================================= */

  async function loadDashboardOverview() {
    const ctx = state.currentContext;
    if (!ctx) return;

    const findingsLoading = $("relay-dashboard-findings-loading");
    const findingsList = $("relay-dashboard-findings-list");

    if (findingsLoading) findingsLoading.classList.remove("hidden");
    if (findingsList) {
      findingsList.classList.add("hidden");
      findingsList.replaceChildren();
    }

    // Fetch health data in parallel for KPIs
    if (globalThis.RelayAIAssistant?.getProjectHealth) {
      try {
        const res = await RelayAIAssistant.getProjectHealth(ctx);
        if (res.ok) {
          const data = await res.json();
          state.healthData = data.health;
          updateDashboardKPIs(data.health);
          renderDashboardFindings(data.health);
        }
      } catch (_) {}
    }

    // Fetch traceability for coverage KPI
    if (globalThis.RelayAIAssistant?.getTraceability) {
      try {
        const res = await RelayAIAssistant.getTraceability(ctx);
        if (res.ok) {
          const data = await res.json();
          state.traceabilityData = data;
          updateTraceabilityKPI(data);
        }
      } catch (_) {}
    }

    // Fetch reports for forecast KPI
    if (globalThis.RelayAIAssistant?.getPmReports) {
      try {
        const res = await RelayAIAssistant.getPmReports(ctx);
        if (res.ok) {
          const data = await res.json();
          state.reportsData = data.data || data;
          updateForecastKPI(state.reportsData);
        }
      } catch (_) {}
    }

    if (findingsLoading) findingsLoading.classList.add("hidden");
    if (findingsList) findingsList.classList.remove("hidden");
  }

  function updateDashboardKPIs(health) {
    const kpiVal = $("relay-kpi-health-value");
    const kpiBadge = $("relay-kpi-health-badge");
    const kpiOverdueVal = $("relay-kpi-overdue-value");
    const kpiOverdueBadge = $("relay-kpi-overdue-badge");

    if (kpiVal && health) {
      const score = health.score !== undefined ? `${health.score}%` : "Good";
      kpiVal.textContent = score;
    }
    if (kpiBadge && health) {
      const status = health.overallStatus || "healthy";
      kpiBadge.textContent = status === "healthy" ? "HEALTHY" : status === "needs_attention" ? "ATTENTION" : "AT RISK";
      kpiBadge.className = `relay-pill-badge relay-pill-${status === "healthy" ? "success" : status === "needs_attention" ? "warning" : "danger"}`;
    }

    if (kpiOverdueVal && health) {
      const overdueCount = health.overdueTasksCount || (health.stalledTasks || []).length || 0;
      kpiOverdueVal.textContent = String(overdueCount);
    }
    if (kpiOverdueBadge && health) {
      const overdueCount = health.overdueTasksCount || (health.stalledTasks || []).length || 0;
      kpiOverdueBadge.textContent = overdueCount === 0 ? "Zero Overdue" : `${overdueCount} Flagged`;
      kpiOverdueBadge.className = `relay-pill-badge relay-pill-${overdueCount === 0 ? "success" : "warning"}`;
    }
  }

  function updateTraceabilityKPI(data) {
    const kpiVal = $("relay-kpi-traceability-value");
    const kpiBadge = $("relay-kpi-traceability-badge");
    if (!kpiVal) return;

    const summary = data?.summary || {};
    const total = summary.totalRequirements || (data?.traceability || []).length || 0;
    const verified = summary.verifiedRequirements || 0;

    if (total > 0) {
      const pct = Math.round((verified / total) * 100);
      kpiVal.textContent = `${pct}%`;
      if (kpiBadge) {
        kpiBadge.textContent = `${verified}/${total} Verified`;
        kpiBadge.className = `relay-pill-badge relay-pill-${pct >= 70 ? "success" : pct >= 40 ? "warning" : "danger"}`;
      }
    } else {
      kpiVal.textContent = "0 Req";
      if (kpiBadge) {
        kpiBadge.textContent = "None Registered";
        kpiBadge.className = "relay-pill-badge relay-pill-neutral";
      }
    }
  }

  function updateForecastKPI(reports) {
    const kpiVal = $("relay-kpi-forecast-value");
    const kpiBadge = $("relay-kpi-forecast-badge");
    if (!kpiVal) return;

    const forecast = reports?.deliveryForecast;
    if (forecast?.estimatedCompletionDate) {
      kpiVal.textContent = String(forecast.estimatedCompletionDate).slice(0, 10);
      if (kpiBadge) {
        kpiBadge.textContent = `${forecast.confidence || "High"} Confidence`;
        kpiBadge.className = "relay-pill-badge relay-pill-success";
      }
    } else {
      kpiVal.textContent = "Flexible";
      if (kpiBadge) {
        kpiBadge.textContent = "Continuous Flow";
        kpiBadge.className = "relay-pill-badge relay-pill-accent";
      }
    }
  }

  function renderDashboardFindings(health) {
    const findingsList = $("relay-dashboard-findings-list");
    if (!findingsList) return;
    findingsList.replaceChildren();

    const findings = [];
    if (health?.stalledTasks && health.stalledTasks.length > 0) {
      findings.push({
        type: "warning",
        title: `${health.stalledTasks.length} Stalled Task(s) Detected`,
        detail: `Issues without activity for more than the configured stalled threshold. Review blockers with assignees.`
      });
    }

    if (health?.pullRequestsNeedingReview && health.pullRequestsNeedingReview.length > 0) {
      findings.push({
        type: "accent",
        title: `${health.pullRequestsNeedingReview.length} Pull Request(s) Awaiting Review`,
        detail: `Code reviews pending approval. Assign reviewers to maintain delivery velocity.`
      });
    }

    if (health?.actionItems && health.actionItems.length > 0) {
      for (const item of health.actionItems.slice(0, 3)) {
        findings.push({
          type: "info",
          title: item.title || "Recommended Next Step",
          detail: item.description || item.action || String(item)
        });
      }
    }

    if (findings.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "relay-empty-notice";
      emptyDiv.textContent = "No critical delivery bottlenecks or risks detected. Project velocity is optimal.";
      findingsList.append(emptyDiv);
      return;
    }

    for (const f of findings) {
      const card = document.createElement("div");
      card.className = "relay-card";
      card.style.marginBottom = "10px";

      const top = document.createElement("div");
      top.style.display = "flex";
      top.style.alignItems = "center";
      top.style.justifyContent = "space-between";
      top.style.marginBottom = "6px";

      const title = document.createElement("strong");
      title.style.fontSize = "13px";
      title.textContent = f.title;

      const badge = document.createElement("span");
      badge.className = `relay-pill-badge relay-pill-${f.type}`;
      badge.textContent = f.type.toUpperCase();

      top.append(title, badge);

      const desc = document.createElement("p");
      desc.style.fontSize = "12px";
      desc.style.color = "var(--text-secondary)";
      desc.textContent = f.detail;

      card.append(top, desc);
      findingsList.append(card);
    }
  }

  /* =========================================================
     2. AI ASSISTANT & CHAT ENGINE
     ========================================================= */

  function setupChat() {
    if (ui.chatForm) {
      ui.chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSendMessage();
      });
    }

    if (ui.chatInput) {
      ui.chatInput.addEventListener("input", updateChatInputState);
      ui.chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      });
    }

    if (ui.chatFile) {
      ui.chatFile.addEventListener("change", handleFileSelection);
    }

    if (ui.clearChatBtn) {
      ui.clearChatBtn.addEventListener("click", () => {
        state.messages = [];
        if (ui.chatMessages) {
          ui.chatMessages.replaceChildren();
          if (ui.chatEmptyState) ui.chatMessages.append(ui.chatEmptyState);
        }
        if (ui.proposedPanel) ui.proposedPanel.classList.add("hidden");
        showAlert("Conversation cleared.", "info");
      });
    }

    // Preset prompts
    const promptChips = document.querySelectorAll(".relay-prompt-chip");
    for (const chip of promptChips) {
      chip.addEventListener("click", () => {
        const text = chip.getAttribute("data-prompt");
        if (text && ui.chatInput) {
          ui.chatInput.value = text;
          updateChatInputState();
          handleSendMessage();
        }
      });
    }
  }

  function updateChatInputState() {
    if (!ui.chatInput) return;
    const val = ui.chatInput.value;
    if (ui.chatCharCounter) {
      ui.chatCharCounter.textContent = `${val.length.toLocaleString()} / 4,000`;
    }
    if (ui.chatSend) {
      ui.chatSend.disabled = state.chatBusy || (!val.trim() && state.attachments.length === 0);
    }
  }

  function handleFileSelection() {
    if (!ui.chatFile || !ui.chatFile.files) return;
    for (const file of ui.chatFile.files) {
      state.attachments.push({ name: file.name, size: file.size });
    }
    renderAttachments();
    updateChatInputState();
  }

  function renderAttachments() {
    if (!ui.chatAttachments) return;
    ui.chatAttachments.replaceChildren();

    state.attachments.forEach((att, idx) => {
      const tag = document.createElement("div");
      tag.className = "relay-attachment-tag";

      const nameSpan = document.createElement("span");
      nameSpan.textContent = att.name;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", `Remove ${att.name}`);
      removeBtn.addEventListener("click", () => {
        state.attachments.splice(idx, 1);
        renderAttachments();
        updateChatInputState();
      });

      tag.append(nameSpan, removeBtn);
      ui.chatAttachments.append(tag);
    });
  }

  async function handleSendMessage() {
    if (state.chatBusy) return;
    const text = ui.chatInput ? ui.chatInput.value.trim() : "";
    if (!text && state.attachments.length === 0) return;

    if (state.attachments.length > 0 && !text) {
      showAlert("Please enter a message or prompt explaining your attached reference file.", "danger");
      return;
    }

    const ctx = state.currentContext;
    if (!ctx) {
      showAlert("No repository selected. Please choose a GitHub repository.", "danger");
      return;
    }

    // Hide empty state if present
    if (ui.chatEmptyState && ui.chatEmptyState.parent) {
      ui.chatEmptyState.remove();
    }

    // Render user message
    renderChatMessage("user", text);
    if (ui.chatInput) ui.chatInput.value = "";
    state.attachments = [];
    renderAttachments();
    updateChatInputState();

    state.chatBusy = true;
    const selectedModel = ui.modelSelect ? ui.modelSelect.value : "claude-3-7-sonnet";

    const loadingCard = renderChatMessage("assistant", "Relay AI is synthesizing repository intelligence…", true);

    try {
      if (!globalThis.RelayAIAssistant?.send) {
        throw new Error("Relay Assistant client is unavailable.");
      }

      const response = await RelayAIAssistant.send(text, ctx, { model: selectedModel });
      loadingCard.remove();

      renderChatMessage("assistant", response.reply);

      // Handle proposed issues if generated
      if (response.issuePlan && response.issuePlan.issues && response.issuePlan.issues.length > 0) {
        renderProposedIssues(response.issuePlan);
      }
    } catch (err) {
      loadingCard.remove();
      renderChatMessage("assistant", `⚠ ${err.message || "Relay backend communication error."}`);
    } finally {
      state.chatBusy = false;
      updateChatInputState();
    }
  }

  function renderChatMessage(sender, text, isLoading = false) {
    if (!ui.chatMessages) return null;

    const card = document.createElement("div");
    card.className = `relay-msg-card relay-msg-${sender}`;

    const meta = document.createElement("div");
    meta.className = "relay-msg-meta";
    meta.textContent = sender === "user" ? "You" : "Relay AI";

    const body = document.createElement("div");
    body.className = "relay-msg-body";
    body.textContent = text;

    if (isLoading) {
      const spinner = document.createElement("span");
      spinner.className = "relay-spinner";
      spinner.style.display = "inline-block";
      spinner.style.marginRight = "8px";
      const textSpan = document.createElement("span");
      textSpan.textContent = text;
      body.textContent = "";
      body.append(spinner, textSpan);
    }

    card.append(meta, body);
    ui.chatMessages.append(card);
    ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;

    state.messages.push({ sender, text });
    return card;
  }

  function renderProposedIssues(issuePlan) {
    if (!ui.proposedPanel || !ui.proposedList) return;
    ui.proposedPanel.classList.remove("hidden");
    ui.proposedList.replaceChildren();

    const issues = issuePlan.issues || [];
    if (ui.proposedCount) {
      ui.proposedCount.textContent = `${issues.length} Ticket${issues.length === 1 ? "" : "s"}`;
    }

    issues.forEach((issue, idx) => {
      const card = document.createElement("div");
      card.className = "relay-card";

      const header = document.createElement("div");
      header.className = "relay-card-header";

      const title = document.createElement("strong");
      title.style.fontSize = "13px";
      title.textContent = issue.title;

      const badge = document.createElement("span");
      badge.className = "relay-pill-badge relay-pill-accent";
      badge.textContent = issue.priority || "Medium";

      header.append(title, badge);

      const desc = document.createElement("p");
      desc.style.fontSize = "12px";
      desc.style.color = "var(--text-secondary)";
      desc.style.marginBottom = "10px";
      desc.textContent = issue.body || "No ticket description provided.";

      // Assignee dropdown
      const assignRow = document.createElement("div");
      assignRow.style.display = "flex";
      assignRow.style.alignItems = "center";
      assignRow.style.gap = "8px";
      assignRow.style.marginBottom = "10px";

      const assignLabel = document.createElement("label");
      assignLabel.style.fontSize = "11px";
      assignLabel.style.color = "var(--text-muted)";
      assignLabel.textContent = "Assignee:";

      const assignSelect = document.createElement("select");
      assignSelect.className = "relay-select relay-select-sm";
      const unassignedOpt = document.createElement("option");
      unassignedOpt.value = "";
      unassignedOpt.textContent = "Unassigned";
      assignSelect.append(unassignedOpt);

      assignRow.append(assignLabel, assignSelect);

      // Actions
      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      const createBtn = document.createElement("button");
      createBtn.className = "relay-btn relay-btn-primary relay-btn-sm";
      createBtn.type = "button";
      createBtn.textContent = "Confirm & Create in GitHub";

      createBtn.addEventListener("click", async () => {
        createBtn.disabled = true;
        createBtn.textContent = "Creating issue…";

        try {
          if (!globalThis.RelayAIAssistant?.createIssue) {
            throw new Error("Issue creation client unavailable.");
          }
          const payload = {
            issues: [{ ...issue, assignee: assignSelect.value || null }]
          };
          const res = await RelayAIAssistant.createIssue(payload, state.currentContext);
          if (res.ok) {
            const data = await res.json();
            const result = data.results?.[0];
            createBtn.className = "relay-btn relay-btn-secondary relay-btn-sm";
            createBtn.textContent = `✓ Created #${result?.number || "OK"}`;
            showAlert(`Created GitHub issue #${result?.number || ""}: ${issue.title}`, "success");
          } else {
            createBtn.disabled = false;
            createBtn.textContent = "Retry Create";
            showAlert("Failed to create issue in GitHub.", "danger");
          }
        } catch (err) {
          createBtn.disabled = false;
          createBtn.textContent = "Retry Create";
          showAlert(err.message || "Failed to create issue.", "danger");
        }
      });

      actions.append(createBtn);
      card.append(header, desc, assignRow, actions);
      ui.proposedList.append(card);
    });
  }

  /* =========================================================
     3. PROJECT HEALTH INTELLIGENCE ENGINE
     ========================================================= */

  async function loadHealthView() {
    if (!ui.healthLoading || !ui.healthContainer) return;
    ui.healthLoading.classList.remove("hidden");
    ui.healthContainer.classList.add("hidden");
    ui.healthContainer.replaceChildren();

    const ctx = state.currentContext;
    if (!ctx) return;

    try {
      if (!globalThis.RelayAIAssistant?.getProjectHealth) {
        throw new Error("Project Health service unavailable.");
      }

      const res = await RelayAIAssistant.getProjectHealth(ctx);
      let data = null;
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) {
        throw new Error(data?.error || `Health evaluation failed (HTTP ${res.status}).`);
      }

      state.healthData = data.health;
      renderHealthDetails(data.health);
    } catch (err) {
      const errBox = document.createElement("div");
      errBox.className = "relay-empty-notice";
      errBox.textContent = `Unable to evaluate project health: ${err.message}`;
      ui.healthContainer.append(errBox);
    } finally {
      ui.healthLoading.classList.add("hidden");
      ui.healthContainer.classList.remove("hidden");
    }
  }

  function renderHealthDetails(health) {
    if (!ui.healthContainer || !health) return;
    ui.healthContainer.replaceChildren();

    // Health Summary Card
    const summaryCard = document.createElement("div");
    summaryCard.className = "relay-card";

    const sHeader = document.createElement("div");
    sHeader.className = "relay-card-header";

    const sTitle = document.createElement("h2");
    sTitle.className = "relay-card-title";
    sTitle.textContent = `Overall Status: ${(health.overallStatus || "healthy").toUpperCase()}`;

    const sBadge = document.createElement("span");
    sBadge.className = `relay-pill-badge relay-pill-${health.overallStatus === "healthy" ? "success" : "warning"}`;
    sBadge.textContent = `Score: ${health.score || 85}%`;

    sHeader.append(sTitle, sBadge);

    const sDesc = document.createElement("p");
    sDesc.className = "relay-card-desc";
    sDesc.textContent = health.summary || "Project health metrics calculated from active issues, open pull requests, and commit velocity.";

    summaryCard.append(sHeader, sDesc);
    ui.healthContainer.append(summaryCard);

    // Stalled Tasks Section
    if (health.stalledTasks && health.stalledTasks.length > 0) {
      const stalledSec = document.createElement("div");
      stalledSec.className = "relay-card";

      const h = document.createElement("h3");
      h.className = "relay-card-title";
      h.textContent = `Stalled Tasks (${health.stalledTasks.length})`;
      stalledSec.append(h);

      for (const t of health.stalledTasks) {
        const item = document.createElement("div");
        item.style.padding = "8px 0";
        item.style.borderBottom = "1px solid var(--border-subtle)";

        const itemTitle = document.createElement("strong");
        itemTitle.style.fontSize = "13px";
        itemTitle.textContent = `#${t.number || ""} ${t.title || ""}`;

        const itemSub = document.createElement("div");
        itemSub.style.fontSize = "11px";
        itemSub.style.color = "var(--text-muted)";
        itemSub.textContent = `Assignee: ${t.assignee || "None"} · Days Inactive: ${t.daysInactive || "—"}`;

        item.append(itemTitle, itemSub);
        stalledSec.append(item);
      }
      ui.healthContainer.append(stalledSec);
    }
  }

  /* =========================================================
     4. REQUIREMENTS TRACEABILITY MATRIX ENGINE
     ========================================================= */

  async function loadTraceabilityView() {
    if (!ui.traceabilityLoading || !ui.traceabilityContainer) return;
    ui.traceabilityLoading.classList.remove("hidden");
    ui.traceabilityContainer.classList.add("hidden");
    ui.traceabilityContainer.replaceChildren();

    const ctx = state.currentContext;
    if (!ctx) return;

    try {
      if (!globalThis.RelayAIAssistant?.getTraceability) {
        throw new Error("Traceability service unavailable.");
      }

      const res = await RelayAIAssistant.getTraceability(ctx);
      let data = null;
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) {
        throw new Error(data?.error || `Traceability load failed (HTTP ${res.status}).`);
      }

      state.traceabilityData = data;
      renderTraceabilityMatrix(data);
    } catch (err) {
      const errBox = document.createElement("div");
      errBox.className = "relay-empty-notice";
      errBox.textContent = `Unable to build Traceability Matrix: ${err.message}`;
      ui.traceabilityContainer.append(errBox);
    } finally {
      ui.traceabilityLoading.classList.add("hidden");
      ui.traceabilityContainer.classList.remove("hidden");
    }
  }

  function renderTraceabilityMatrix(data) {
    if (!ui.traceabilityContainer) return;
    ui.traceabilityContainer.replaceChildren();

    const list = data.traceability || [];
    if (list.length === 0) {
      const emptyNotice = document.createElement("div");
      emptyNotice.className = "relay-empty-notice";
      emptyNotice.textContent = "No requirements registered in Relay for this repository. Use AI Assistant to extract and persist requirements from project specs.";
      ui.traceabilityContainer.append(emptyNotice);
      return;
    }

    for (const req of list) {
      const card = document.createElement("div");
      card.className = "relay-card";
      card.style.marginBottom = "14px";

      const header = document.createElement("div");
      header.className = "relay-card-header";

      const title = document.createElement("h3");
      title.className = "relay-card-title";
      title.textContent = `${req.id || "REQ"}: ${req.title || "Requirement"}`;

      const statusBadge = document.createElement("span");
      const isVerified = req.verified || req.status === "verified";
      statusBadge.className = `relay-pill-badge relay-pill-${isVerified ? "success" : "warning"}`;
      statusBadge.textContent = isVerified ? "VERIFIED" : "IN PROGRESS";

      header.append(title, statusBadge);

      const desc = document.createElement("p");
      desc.className = "relay-card-desc";
      desc.textContent = req.description || "No requirement description provided.";

      // Linked work items / issues
      const itemsSec = document.createElement("div");
      itemsSec.style.display = "flex";
      itemsSec.style.flexDirection = "column";
      itemsSec.style.gap = "6px";
      itemsSec.style.marginTop = "10px";

      const itemsTitle = document.createElement("strong");
      itemsTitle.style.fontSize = "12px";
      itemsTitle.style.color = "var(--text-secondary)";
      itemsTitle.textContent = "Linked Work Items & Test Evidence:";
      itemsSec.append(itemsTitle);

      const workItems = req.workItems || req.linkedIssues || [];
      if (workItems.length > 0) {
        for (const item of workItems) {
          const itemRow = document.createElement("div");
          itemRow.style.fontSize = "12px";
          itemRow.style.padding = "4px 8px";
          itemRow.style.background = "var(--bg-canvas)";
          itemRow.style.borderRadius = "var(--radius-sm)";
          itemRow.textContent = `• Issue #${item.number || item.id || ""}: ${item.title || "Task"} (${item.state || "open"})`;
          itemsSec.append(itemRow);
        }
      } else {
        const noItems = document.createElement("span");
        noItems.style.fontSize = "12px";
        noItems.style.color = "var(--text-muted)";
        noItems.textContent = "No issues or PRs currently linked.";
        itemsSec.append(noItems);
      }

      card.append(header, desc, itemsSec);
      ui.traceabilityContainer.append(card);
    }
  }

  /* =========================================================
     5. PM REPORTS & DELIVERY FORECASTING ENGINE
     ========================================================= */

  async function loadReportsView() {
    if (!ui.reportsLoading || !ui.reportsContainer) return;
    ui.reportsLoading.classList.remove("hidden");
    ui.reportsContainer.classList.add("hidden");
    ui.reportsContainer.replaceChildren();

    const ctx = state.currentContext;
    if (!ctx) return;

    try {
      if (!globalThis.RelayAIAssistant?.getPmReports) {
        throw new Error("PM Reports service unavailable.");
      }

      const res = await RelayAIAssistant.getPmReports(ctx);
      let data = null;
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) {
        throw new Error(data?.error || `PM Reports load failed (HTTP ${res.status}).`);
      }

      state.reportsData = data.data || data;
      renderReportsView(state.reportsData);
    } catch (err) {
      const errBox = document.createElement("div");
      errBox.className = "relay-empty-notice";
      errBox.textContent = `Unable to generate PM report: ${err.message}`;
      ui.reportsContainer.append(errBox);
    } finally {
      ui.reportsLoading.classList.add("hidden");
      ui.reportsContainer.classList.remove("hidden");
    }
  }

  function renderReportsView(report) {
    if (!ui.reportsContainer || !report) return;
    ui.reportsContainer.replaceChildren();

    // 1. Executive Status
    const statusCard = document.createElement("div");
    statusCard.className = "relay-card";
    statusCard.style.marginBottom = "16px";

    const sTitle = document.createElement("h2");
    sTitle.className = "relay-card-title";
    sTitle.textContent = "Executive Status Summary";

    const sDesc = document.createElement("p");
    sDesc.className = "relay-card-desc";
    sDesc.textContent = report.executiveSummary || report.statusSummary || "Delivery progress on track with current sprint objectives.";

    statusCard.append(sTitle, sDesc);
    ui.reportsContainer.append(statusCard);

    // 2. Delivery Forecast & Critical Path
    const forecast = report.deliveryForecast;
    if (forecast) {
      const fCard = document.createElement("div");
      fCard.className = "relay-card";
      fCard.style.marginBottom = "16px";

      const fTitle = document.createElement("h3");
      fTitle.className = "relay-card-title";
      fTitle.textContent = `Critical Path Forecast: Estimated Completion ${forecast.estimatedCompletionDate || "Continuous Flow"}`;

      const fDesc = document.createElement("p");
      fDesc.className = "relay-card-desc";
      fDesc.textContent = `Confidence: ${forecast.confidence || "High"}. ${forecast.assumptions || ""}`;

      fCard.append(fTitle, fDesc);
      ui.reportsContainer.append(fCard);
    }

    // 3. Editable Stakeholder Update Draft with Copy Button
    const draftCard = document.createElement("div");
    draftCard.className = "relay-card";

    const dHeader = document.createElement("div");
    dHeader.className = "relay-card-header";

    const dTitle = document.createElement("h3");
    dTitle.className = "relay-card-title";
    dTitle.textContent = "Draft Stakeholder Update";

    const copyBtn = document.createElement("button");
    copyBtn.className = "relay-btn relay-btn-secondary relay-btn-sm";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy Update";

    dHeader.append(dTitle, copyBtn);

    const updateTextarea = document.createElement("textarea");
    updateTextarea.className = "relay-input";
    updateTextarea.rows = 6;
    updateTextarea.value = report.stakeholderUpdateDraft ||
      `Sprint Status Update for ${state.currentContext?.owner}/${state.currentContext?.repository}\n` +
      `• Health: ${report.healthStatus || "Healthy"}\n` +
      `• Milestone: ${report.currentMilestone || "Sprint 1"}\n` +
      `• Estimated Completion: ${forecast?.estimatedCompletionDate || "On Track"}\n` +
      `• Outstanding Blockers: None`;

    copyBtn.addEventListener("click", () => {
      try {
        navigator.clipboard.writeText(updateTextarea.value);
        copyBtn.textContent = "✓ Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy Update"; }, 2000);
      } catch (_) {
        showAlert("Failed to copy automatically. Please select text and copy manually.", "warning");
      }
    });

    draftCard.append(dHeader, updateTextarea);
    ui.reportsContainer.append(draftCard);
  }

  /* =========================================================
     6. DEVELOPER PROFILE MODAL & ASSIGNMENT
     ========================================================= */

  function setupProfileModal() {
    if (ui.profileModalClose) {
      ui.profileModalClose.addEventListener("click", closeProfileModal);
    }
    if (ui.profileModalCancel) {
      ui.profileModalCancel.addEventListener("click", closeProfileModal);
    }
    if (ui.profileModalSave) {
      ui.profileModalSave.addEventListener("click", saveProfileModal);
    }
    if (ui.settingsSaveProfile) {
      ui.settingsSaveProfile.addEventListener("click", saveProfileSettings);
    }

    // Assignment evaluation button
    if (ui.assignEvaluateBtn) {
      ui.assignEvaluateBtn.addEventListener("click", evaluateAssignmentCandidates);
    }
  }

  async function openProfileModal() {
    if (!ui.profileModal) return;
    ui.profileModal.classList.remove("hidden");

    if (ui.modalStatus) {
      ui.modalStatus.classList.add("hidden");
      ui.modalStatus.textContent = "";
    }

    // Pre-populate if available
    const ctx = state.currentContext;
    if (ctx && globalThis.RelayAIAssistant?.getDeveloperProfile) {
      try {
        const res = await RelayAIAssistant.getDeveloperProfile(ctx);
        if (res.ok) {
          const data = await res.json();
          const p = data.profile || {};
          if (ui.modalSkills) ui.modalSkills.value = (p.skills || []).join(", ");
          if (ui.modalCapacity) ui.modalCapacity.value = p.weeklyHoursCapacity || 40;
          if (ui.modalMaxTasks) ui.modalMaxTasks.value = p.maxConcurrentTasks || 3;
          if (ui.modalAvailability) ui.modalAvailability.value = p.availabilityStatus || "available";
        }
      } catch (_) {}
    }
  }

  function closeProfileModal() {
    if (ui.profileModal) ui.profileModal.classList.add("hidden");
  }

  async function saveProfileModal() {
    if (!ui.profileModalSave) return;
    ui.profileModalSave.disabled = true;
    ui.profileModalSave.textContent = "Saving…";

    const skills = ui.modalSkills ? ui.modalSkills.value.split(",").map(s => s.trim()).filter(Boolean) : [];
    const weeklyHoursCapacity = ui.modalCapacity ? Number(ui.modalCapacity.value) || 40 : 40;
    const maxConcurrentTasks = ui.modalMaxTasks ? Number(ui.modalMaxTasks.value) || 3 : 3;
    const availabilityStatus = ui.modalAvailability ? ui.modalAvailability.value : "available";

    const payload = {
      skills,
      weeklyHoursCapacity,
      maxConcurrentTasks,
      availabilityStatus
    };

    try {
      if (!globalThis.RelayAIAssistant?.upsertDeveloperProfile) {
        throw new Error("Profile service unavailable.");
      }
      const res = await RelayAIAssistant.upsertDeveloperProfile(payload, state.currentContext);
      if (res.ok) {
        showAlert("Developer profile saved successfully.", "success");
        closeProfileModal();
      } else {
        throw new Error("Server rejected profile update.");
      }
    } catch (err) {
      if (ui.modalStatus) {
        ui.modalStatus.className = "relay-modal-status relay-modal-status-error";
        ui.modalStatus.textContent = err.message || "Failed to save profile.";
        ui.modalStatus.classList.remove("hidden");
      }
    } finally {
      ui.profileModalSave.disabled = false;
      ui.profileModalSave.textContent = "Save Profile";
    }
  }

  async function saveProfileSettings() {
    if (!ui.settingsSaveProfile) return;
    ui.settingsSaveProfile.disabled = true;
    ui.settingsSaveProfile.textContent = "Saving…";

    const skills = ui.settingsSkills ? ui.settingsSkills.value.split(",").map(s => s.trim()).filter(Boolean) : [];
    const weeklyHoursCapacity = ui.settingsCapacity ? Number(ui.settingsCapacity.value) || 40 : 40;
    const maxConcurrentTasks = ui.settingsMaxTasks ? Number(ui.settingsMaxTasks.value) || 3 : 3;

    try {
      if (globalThis.RelayAIAssistant?.upsertDeveloperProfile) {
        await RelayAIAssistant.upsertDeveloperProfile({
          skills,
          weeklyHoursCapacity,
          maxConcurrentTasks
        }, state.currentContext);
      }
      if (ui.settingsProfileMsg) {
        ui.settingsProfileMsg.textContent = "✓ Saved defaults successfully";
        ui.settingsProfileMsg.className = "relay-msg-feedback success";
        ui.settingsProfileMsg.classList.remove("hidden");
        setTimeout(() => ui.settingsProfileMsg.classList.add("hidden"), 3000);
      }
    } catch (_) {
      if (ui.settingsProfileMsg) {
        ui.settingsProfileMsg.textContent = "Failed to save settings.";
        ui.settingsProfileMsg.className = "relay-msg-feedback error";
        ui.settingsProfileMsg.classList.remove("hidden");
      }
    } finally {
      ui.settingsSaveProfile.disabled = false;
      ui.settingsSaveProfile.textContent = "Save Profile Defaults";
    }
  }

  async function evaluateAssignmentCandidates() {
    if (!ui.assignEvaluateBtn || !ui.assignResults) return;
    ui.assignEvaluateBtn.disabled = true;
    if (ui.assignLoading) ui.assignLoading.classList.remove("hidden");
    ui.assignResults.replaceChildren();

    const title = ui.assignTaskTitle ? ui.assignTaskTitle.value : "Task";
    const skills = ui.assignTaskSkills ? ui.assignTaskSkills.value.split(",").map(s => s.trim()).filter(Boolean) : [];

    const task = {
      title,
      requiredSkills: skills,
      priority: "Medium"
    };

    try {
      if (!globalThis.RelayAIAssistant?.getAssignmentRecommendations) {
        throw new Error("Assignment recommendations client unavailable.");
      }

      const res = await RelayAIAssistant.getAssignmentRecommendations(task, state.currentContext);
      let data = null;
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) {
        throw new Error(data?.error || `Recommendation evaluation failed (${res.status}).`);
      }

      const recs = data.recommendations || [];
      if (recs.length === 0) {
        const emptyNotice = document.createElement("div");
        emptyNotice.className = "relay-empty-notice";
        emptyNotice.textContent = "No registered team members found. Update developer profiles in Team & Capacity settings.";
        ui.assignResults.append(emptyNotice);
        return;
      }

      for (const r of recs) {
        const card = document.createElement("div");
        card.className = "relay-card";
        card.style.marginBottom = "10px";

        const top = document.createElement("div");
        top.style.display = "flex";
        top.style.alignItems = "center";
        top.style.justifyContent = "space-between";
        top.style.marginBottom = "6px";

        const devName = document.createElement("strong");
        devName.style.fontSize = "14px";
        devName.textContent = `@${r.githubUsername || r.userId || "developer"}`;

        const isOverloaded = r.isOverloaded || (r.criteria?.workloadAndEffort?.score <= 15);
        const fitScore = r.overallScore || 0;

        const badge = document.createElement("span");
        if (isOverloaded) {
          badge.className = "relay-pill-badge relay-pill-danger";
          badge.textContent = `OVERLOADED (${fitScore}% fit)`;
        } else if (fitScore >= 75) {
          badge.className = "relay-pill-badge relay-pill-success";
          badge.textContent = `★ RECOMMENDED (${fitScore}% fit)`;
        } else {
          badge.className = "relay-pill-badge relay-pill-warning";
          badge.textContent = `MODERATE FIT (${fitScore}% fit)`;
        }

        top.append(devName, badge);

        const breakdown = document.createElement("div");
        breakdown.style.fontSize = "12px";
        breakdown.style.color = "var(--text-secondary)";
        const skillsScore = r.criteria?.technicalSkills?.score || 0;
        const workScore = r.criteria?.workloadAndEffort?.score || 0;
        breakdown.textContent = `Skills Alignment: ${skillsScore}% · Workload Capacity: ${workScore}% · Familiarity: ${r.criteria?.domainFamiliarity?.score || 0}%`;

        card.append(top, breakdown);
        ui.assignResults.append(card);
      }
    } catch (err) {
      const errBox = document.createElement("div");
      errBox.className = "relay-empty-notice";
      errBox.textContent = `Evaluation failed: ${err.message}`;
      ui.assignResults.append(errBox);
    } finally {
      if (ui.assignLoading) ui.assignLoading.classList.add("hidden");
      ui.assignEvaluateBtn.disabled = false;
    }
  }

  /* =========================================================
     GLOBAL EVENT LISTENERS
     ========================================================= */

  function setupGlobalEvents() {
    if (ui.sidebarAuthBtn) {
      ui.sidebarAuthBtn.addEventListener("click", handleAuthAction);
    }
    if (ui.topbarAuthBtn) {
      ui.topbarAuthBtn.addEventListener("click", handleAuthAction);
    }
    if (ui.settingsLoginBtn) {
      ui.settingsLoginBtn.addEventListener("click", handleAuthAction);
    }
    if (ui.settingsLogoutBtn) {
      ui.settingsLogoutBtn.addEventListener("click", handleAuthAction);
    }

    if (ui.repoSelect) {
      ui.repoSelect.addEventListener("change", (e) => {
        handleRepoChange(e.target.value);
      });
    }

    if (ui.workspaceRefresh) {
      ui.workspaceRefresh.addEventListener("click", () => {
        state.healthData = null;
        state.traceabilityData = null;
        state.reportsData = null;
        loadDashboardOverview();
        showAlert("Workspace data refreshed.", "info");
      });
    }

    if (ui.healthRefreshBtn) {
      ui.healthRefreshBtn.addEventListener("click", loadHealthView);
    }
    if (ui.traceabilityRefreshBtn) {
      ui.traceabilityRefreshBtn.addEventListener("click", loadTraceabilityView);
    }
    if (ui.reportsRefreshBtn) {
      ui.reportsRefreshBtn.addEventListener("click", loadReportsView);
    }

    const dashHealthRefresh = $("relay-dash-refresh-health");
    if (dashHealthRefresh) {
      dashHealthRefresh.addEventListener("click", () => {
        state.healthData = null;
        loadDashboardOverview();
      });
    }

    if (ui.alertClose) {
      ui.alertClose.addEventListener("click", hideAlert);
    }
  }

  /* =========================================================
     BOOTSTRAP
     ========================================================= */

  function start() {
    initContext();
    setupNavigation();
    setupChat();
    setupProfileModal();
    setupGlobalEvents();
    checkAuthentication();
    loadDashboardOverview();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
