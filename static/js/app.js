/**
 * PaisaTrack - Client Application Core Logic
 * Web & Android Mobile Architecture with Multi-Currency, Carry Forward, and Full CRUD.
 */

(function () {
  'use strict';

  // Application State
  const state = {
    authToken: localStorage.getItem('paisa_auth_token') || null,
    currentUser: null,
    currentTab: 'dashboard',
    activeProfileId: localStorage.getItem('paisatrack_active_profile_id') ? parseInt(localStorage.getItem('paisatrack_active_profile_id')) : null,
    profiles: [],
    activeProfile: null,
    editingProfileId: null,
    currency: 'INR',
    currencySymbol: '₹',
    currencyRate: 1.0,
    availableCurrencies: {},
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1,
    accounts: [],
    cards: [],
    loans: [],
    debts: { borrowed_list: [], lent_list: [] },
    categories: [],
    recentTransactions: [],
    filteredTransactions: [],
    debtDirectionTab: 'borrowed',
    reportSubTab: 'month',
    investments: [],
    investmentsSummary: null,
    salaryPlan: null,
    salaryPlanAnalysis: null,
    financialGoals: [],
    selectedAssetFilter: 'all',
    editingInvestmentId: null,
    editingGoalId: null
  };

  // ====================================================================
  // Currency Formatting (Indian Lakhs/Crores & International)
  // ====================================================================
  function formatCurrency(amount, skipConvert = false) {
    if (amount === null || amount === undefined || isNaN(amount)) amount = 0;
    const isNegative = amount < 0;
    const absVal = Math.abs(amount);

    let converted = absVal;
    if (!skipConvert && state.currency !== 'INR' && state.currencyRate) {
      converted = absVal * state.currencyRate;
    }

    let formatted = '';
    const symbol = state.currencySymbol || '₹';

    if (state.currency === 'INR') {
      // Standard Indian Numbering System: Lakhs and Crores (e.g., 1,50,000.00)
      const dollars = Math.floor(converted);
      const cents = Math.round((converted - dollars) * 100);
      const s = dollars.toString();
      let res = '';
      if (s.length <= 3) {
        res = s;
      } else {
        res = s.substring(s.length - 3);
        let rem = s.substring(0, s.length - 3);
        while (rem.length > 2) {
          res = rem.substring(rem.length - 2) + ',' + res;
          rem = rem.substring(0, rem.length - 2);
        }
        if (rem.length > 0) res = rem + ',' + res;
      }
      formatted = `${symbol} ${res}.${cents.toString().padStart(2, '0')}`;
    } else {
      // Standard International System
      formatted = `${symbol} ${converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    return isNegative ? `-${formatted}` : formatted;
  }

  async function api(endpoint, options = {}) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(state.activeProfileId ? { 'X-Profile-ID': String(state.activeProfileId) } : {}),
        ...(options.headers || {})
      };
      if (state.authToken) {
        headers['Authorization'] = `Bearer ${state.authToken}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(endpoint, {
        cache: 'no-store',
        headers,
        signal: controller.signal,
        ...options
      });
      clearTimeout(timeoutId);

      if (res.status === 401 && !endpoint.includes('/api/auth/login') && !endpoint.includes('/api/auth/register')) {
        state.authToken = null;
        state.currentUser = null;
        localStorage.removeItem('paisa_auth_token');
        localStorage.removeItem('paisatrack_active_profile_id');
        resetClientStateAndDOM();
        showAuthOverlay('Your session expired. Please sign in again.');
        throw new Error('Authentication required');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Request failed' }));
        const error = new Error(err.detail || 'Request failed');
        error.status = res.status;
        throw error;
      }
      return await res.json();
    } catch (err) {
      // If the server explicitly responded with an HTTP error (e.g. 401 Unauthorized, 400 Bad Request, 403 Forbidden):
      // DO NOT fallback to local DB! Re-throw the server error directly so the UI displays it!
      if (err.status && err.status >= 400) {
        throw err;
      }

      // Standalone On-Device Storage Fallback (Zero Server Mode / Network offline)
      if (window.PaisaLocalDB) {
        return await window.PaisaLocalDB.handleApi(endpoint, options);
      }

      if (err.message !== 'Authentication required') {
        showToast(err.message || 'Operation failed', 'error');
      }
      throw err;
    }
  }

  // ====================================================================
  // Toast Notifications
  // ====================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Mobile haptic feedback
    if (window.navigator && window.navigator.vibrate) {
      try { window.navigator.vibrate(type === 'error' ? [30, 50, 30] : [20]); } catch (e) {}
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ====================================================================
  // Authentication & Multi-Tenant User Management
  // ====================================================================
  function showAuthOverlay(msg = null, isSuccess = false) {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.style.display = 'flex';
    const alertBox = document.getElementById('authAlert');
    if (alertBox) {
      if (msg) {
        alertBox.textContent = msg;
        alertBox.className = `auth-alert ${isSuccess ? 'success' : ''}`;
        alertBox.style.display = 'flex';
      } else {
        alertBox.style.display = 'none';
      }
    }
  }

  function hideAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function switchAuthTab(targetTab) {
    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === targetTab);
    });
    const signInPane = document.getElementById('signInTab');
    const signUpPane = document.getElementById('signUpTab');
    if (signInPane) signInPane.style.display = targetTab === 'signInTab' ? 'block' : 'none';
    if (signUpPane) signUpPane.style.display = targetTab === 'signUpTab' ? 'block' : 'none';
    const alertBox = document.getElementById('authAlert');
    if (alertBox) alertBox.style.display = 'none';
  }

  function updateUserDisplay(user) {
    if (!user) return;
    state.currentUser = user;

    const isDemo = Boolean(user.is_demo || user.username === 'demo' || user.email === 'demo@paisatrack.com');

    // 1. Header quick demo toggle button
    const quickBtn = document.getElementById('quickToggleDemoBtn');
    if (quickBtn) {
      quickBtn.style.display = isDemo ? 'flex' : 'none';
    }

    // 2. Mobile drawer demo toggle button
    const drawerBtn = document.getElementById('drawerToggleDemoBtn');
    if (drawerBtn) {
      drawerBtn.style.setProperty('display', isDemo ? 'flex' : 'none', 'important');
    }

    // 3. Settings card: Dummy & Sample Data Control
    const demoCards = document.querySelectorAll('.demo-data-control-card');
    demoCards.forEach(card => {
      card.style.setProperty('display', isDemo ? 'block' : 'none', 'important');
    });

    const name = user.full_name || user.username || 'User';
    const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U';

    const headerInitials = document.getElementById('userAvatarInitials');
    if (headerInitials) headerInitials.textContent = initials;

    const headerName = document.getElementById('userDisplayName');
    if (headerName) headerName.textContent = name;

    const drawerAvatar = document.getElementById('drawerUserAvatar');
    if (drawerAvatar) drawerAvatar.textContent = initials;

    const drawerName = document.getElementById('drawerUserName');
    if (drawerName) drawerName.textContent = name;

    const drawerEmail = document.getElementById('drawerUserEmail');
    if (drawerEmail) drawerEmail.textContent = user.email || `${user.username}@paisatrack.com`;

    const userRoleTag = document.getElementById('userRoleTag');
    if (userRoleTag) {
      userRoleTag.textContent = isDemo ? 'Demo User' : 'Personal Account';
    }
  }

  // ====================================================================
  // Clean Slate & Multi-User State Isolation
  // ====================================================================
  function resetClientStateAndDOM() {
    // 1. In-memory state cleanup
    state.authToken = null;
    state.currentUser = null;
    state.activeProfileId = null;
    state.activeProfile = null;
    state.editingProfileId = null;
    state.profiles = [];
    state.accounts = [];
    state.cards = [];
    state.loans = [];
    state.debts = { borrowed_list: [], lent_list: [] };
    state.categories = [];
    state.recentTransactions = [];
    state.filteredTransactions = [];
    state.investments = [];
    state.investmentsSummary = null;
    state.salaryPlan = null;
    state.salaryPlanAnalysis = null;
    state.financialGoals = [];
    state.selectedAssetFilter = 'all';
    state.editingInvestmentId = null;
    state.editingGoalId = null;
    state.currentTab = 'dashboard';

    // 2. Reset User Display & Badges
    const quickBtn = document.getElementById('quickToggleDemoBtn');
    if (quickBtn) quickBtn.style.display = 'none';
    const drawerBtn = document.getElementById('drawerToggleDemoBtn');
    if (drawerBtn) drawerBtn.style.setProperty('display', 'none', 'important');
    document.querySelectorAll('.demo-data-control-card').forEach(card => card.style.setProperty('display', 'none', 'important'));

    const userDisplay = document.getElementById('userDisplayName');
    if (userDisplay) userDisplay.textContent = 'User';
    const userInitials = document.getElementById('userAvatarInitials');
    if (userInitials) userInitials.textContent = 'U';
    const drawerAvatar = document.getElementById('drawerUserAvatar');
    if (drawerAvatar) drawerAvatar.textContent = 'U';
    const drawerName = document.getElementById('drawerUserName');
    if (drawerName) drawerName.textContent = 'User';
    const drawerEmail = document.getElementById('drawerUserEmail');
    if (drawerEmail) drawerEmail.textContent = '';

    // 3. Reset Profile Widgets
    const headerProfileAvatar = document.getElementById('headerProfileAvatar');
    if (headerProfileAvatar) {
      headerProfileAvatar.style.backgroundColor = '#4f46e5';
      headerProfileAvatar.innerHTML = '<span style="font-size: 13px;">👤</span>';
    }
    const headerProfileName = document.getElementById('headerProfileName');
    if (headerProfileName) headerProfileName.textContent = 'Personal Finances';
    const sidebarProfileAvatar = document.getElementById('sidebarProfileAvatar');
    if (sidebarProfileAvatar) {
      sidebarProfileAvatar.style.backgroundColor = '#4f46e5';
      sidebarProfileAvatar.innerHTML = '<span style="font-size: 15px;">👤</span>';
    }
    const sidebarProfileName = document.getElementById('sidebarProfileName');
    if (sidebarProfileName) sidebarProfileName.textContent = 'Personal Finances';
    const drawerProfileAvatar = document.getElementById('drawerProfileAvatar');
    if (drawerProfileAvatar) {
      drawerProfileAvatar.style.backgroundColor = '#4f46e5';
      drawerProfileAvatar.innerHTML = '<span style="font-size: 15px;">👤</span>';
    }
    const drawerProfileName = document.getElementById('drawerProfileName');
    if (drawerProfileName) drawerProfileName.textContent = 'Personal Finances';
    const profileListQuick = document.getElementById('profileListQuick');
    if (profileListQuick) profileListQuick.innerHTML = '';
    const profilesManagerList = document.getElementById('profilesManagerList');
    if (profilesManagerList) profilesManagerList.innerHTML = '';

    // 4. Reset Dashboard KPIs & Carryover
    const kpiNetworth = document.getElementById('kpiNetworth');
    if (kpiNetworth) kpiNetworth.textContent = '₹ 0.00';
    const kpiIncome = document.getElementById('kpiIncome');
    if (kpiIncome) kpiIncome.textContent = '₹ 0.00';
    const kpiExpense = document.getElementById('kpiExpense');
    if (kpiExpense) kpiExpense.textContent = '₹ 0.00';
    const kpiSavings = document.getElementById('kpiSavings');
    if (kpiSavings) kpiSavings.textContent = '₹ 0.00';
    const kpiSavingsRate = document.getElementById('kpiSavingsRate');
    if (kpiSavingsRate) kpiSavingsRate.textContent = 'Savings Rate: 0.0%';
    const carryoverClosing = document.getElementById('carryoverClosingNumber');
    if (carryoverClosing) carryoverClosing.textContent = '₹ 0.00';
    const carryoverBannerDesc = document.getElementById('carryoverBannerDesc');
    if (carryoverBannerDesc) carryoverBannerDesc.textContent = 'Opening (₹ 0.00) + Inflow (₹ 0.00) - Outflow (₹ 0.00) = Net Surplus';
    const sbAmount = document.getElementById('sidebarCarryoverAmount');
    if (sbAmount) sbAmount.textContent = '₹ 0.00';

    // Wealth & Health Widget Reset
    const dTrueNet = document.getElementById('dashTrueNetworth');
    if (dTrueNet) dTrueNet.textContent = '₹ 0.00';
    const dPortVal = document.getElementById('dashPortfolioValue');
    if (dPortVal) dPortVal.textContent = '₹ 0.00';
    const dPortRet = document.getElementById('dashPortfolioReturns');
    if (dPortRet) { dPortRet.textContent = '+0.0%'; dPortRet.className = 'wh-pill'; }
    const dHealth = document.getElementById('dashHealthScore');
    if (dHealth) dHealth.textContent = '--/100';

    // 5. Reset Lists & Tables
    const dashAccounts = document.getElementById('dashboardAccountsList');
    if (dashAccounts) dashAccounts.innerHTML = '<div class="empty-state-card text-center p-3 text-muted">No accounts available</div>';
    const recentTrans = document.getElementById('recentTransactionsTableBody');
    if (recentTrans) recentTrans.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No transactions found</td></tr>';
    const fullTrans = document.getElementById('transactionsTableBody');
    if (fullTrans) fullTrans.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No transactions found</td></tr>';
    const accountsGrid = document.getElementById('accountsGrid');
    if (accountsGrid) accountsGrid.innerHTML = '<div class="empty-state">No accounts found</div>';
    const cardsGrid = document.getElementById('cardsGrid');
    if (cardsGrid) cardsGrid.innerHTML = '<div class="empty-state">No cards registered</div>';
    const loansGrid = document.getElementById('loansGrid');
    if (loansGrid) loansGrid.innerHTML = '<div class="empty-state">No loans registered</div>';
    const borrowedList = document.getElementById('borrowedList');
    if (borrowedList) borrowedList.innerHTML = '<div class="empty-state">No borrowed records</div>';
    const lentList = document.getElementById('lentList');
    if (lentList) lentList.innerHTML = '<div class="empty-state">No lent records</div>';
    const invTbody = document.getElementById('investmentsTableBody');
    if (invTbody) invTbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No investment records</td></tr>';
    const goalsGrid = document.getElementById('financialGoalsGrid');
    if (goalsGrid) goalsGrid.innerHTML = '<div class="empty-state-card text-center p-3 text-muted">No financial goals defined</div>';

    // 6. Clear Chart.js canvases & internal chart cache
    if (window.PaisaCharts && typeof window.PaisaCharts.clearAll === 'function') {
      window.PaisaCharts.clearAll();
    }

    // 7. Reset Navigation & Tab Views to Dashboard
    document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
    const dashView = document.getElementById('viewDashboard');
    if (dashView) dashView.classList.add('active');
    document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-tab') === 'dashboard');
    });
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = 'Dashboard';
  }

  async function checkAuthSession() {
    if (!state.authToken) {
      resetClientStateAndDOM();
      showAuthOverlay();
      return false;
    }
    try {
      const res = await api('/api/auth/me');
      if (res && res.user) {
        updateUserDisplay(res.user);
        hideAuthOverlay();
        return true;
      }
    } catch (e) {
      state.authToken = null;
      state.currentUser = null;
      localStorage.removeItem('paisa_auth_token');
      localStorage.removeItem('paisatrack_active_profile_id');
      resetClientStateAndDOM();
      showAuthOverlay();
      return false;
    }
    resetClientStateAndDOM();
    showAuthOverlay();
    return false;
  }

  async function handleLogin(usernameOrEmail, password) {
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username_or_email: usernameOrEmail, password: password })
      });
      // 1. Immediately wipe previous user state and DOM
      resetClientStateAndDOM();

      // 2. Set new user auth
      state.authToken = res.token;
      state.currentUser = res.user;
      localStorage.setItem('paisa_auth_token', res.token);
      localStorage.removeItem('paisatrack_active_profile_id');
      updateUserDisplay(res.user);

      // 3. Load fresh data for this user
      await loadAppData();

      // 4. Ensure visual tab is reset to dashboard
      switchTab('dashboard');

      // 5. Hide overlay now that fresh data is ready
      hideAuthOverlay();
      showToast(`Welcome back, ${res.user.full_name || res.user.username}!`, 'success');
    } catch (err) {
      const errMsg = err.message || 'Incorrect username or password';
      showAuthOverlay(errMsg, false);
      showToast(errMsg, 'error');
    }
  }

  async function handleRegister(fullName, username, email, password) {
    try {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName,
          username: username,
          email: email,
          password: password
        })
      });
      // 1. Immediately wipe previous user state and DOM
      resetClientStateAndDOM();

      // 2. Set new user auth
      state.authToken = res.token;
      state.currentUser = res.user;
      localStorage.setItem('paisa_auth_token', res.token);
      localStorage.removeItem('paisatrack_active_profile_id');
      updateUserDisplay(res.user);

      // 3. Load fresh data for this user
      await loadAppData();

      // 4. Ensure visual tab is reset to dashboard
      switchTab('dashboard');

      // 5. Hide overlay now that fresh data is ready
      hideAuthOverlay();
      showToast(`Account created! Welcome to PaisaTrack.`, 'success');
    } catch (err) {
      const errMsg = err.message || 'Registration failed';
      showAuthOverlay(errMsg, false);
      showToast(errMsg, 'error');
    }
  }

  async function handleLogout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('paisa_auth_token');
    localStorage.removeItem('paisatrack_active_profile_id');
    sessionStorage.clear();
    resetClientStateAndDOM();
    switchAuthTab('signInTab');
    showAuthOverlay('You have been logged out successfully.', true);
    showToast('Signed out', 'info');
  }
  window.handleLogout = handleLogout;

  async function loadAppData() {
    // 1. Load Profiles & Active Workspace first so state.activeProfileId is strictly for current user
    await loadProfiles();

    // 2. Load settings and currency
    const settingsData = await api('/api/settings');
    state.availableCurrencies = settingsData.available_currencies;
    state.currency = settingsData.settings.currency_code || 'INR';
    state.currencySymbol = settingsData.settings.currency_symbol || '₹';
    state.currencyRate = settingsData.available_currencies[state.currency]?.rate || 1.0;

    const currSelect = document.getElementById('currencySelect');
    if (currSelect) currSelect.value = state.currency;

    // 3. Populate Dropdowns
    await populateCategoryDropdowns();
    await populateAccountDropdowns();

    // 4. Load Dashboard & Check Data Status
    await loadDashboard();
    await checkDataStatus();
  }

  // ====================================================================
  // Navigation & Tab Switching
  // ====================================================================
  function switchTab(tabId) {
    state.currentTab = tabId;

    // Update active state in sidebar and bottom bar
    document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(el => {
      if (el.getAttribute('data-tab') === tabId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Switch views
    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.remove('active');
    });

    const viewMap = {
      investments: 'viewInvestments',
      salaryplan: 'viewSalaryPlan'
    };
    const targetView = document.getElementById(viewMap[tabId] || `view${capitalize(tabId)}`);
    if (targetView) targetView.classList.add('active');

    // Update Top Header Title
    const titles = {
      dashboard: 'Dashboard',
      transactions: 'Transactions Ledger',
      accounts: 'Bank Accounts & Cards',
      debts: 'Loans & Relatives Debts',
      investments: 'Investment Portfolio & SIPs',
      salaryplan: 'Salary Budget & Life Planner',
      carryover: 'Month-End Carry Forward',
      reports: 'Reports & Analytics',
      settings: 'Settings'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[tabId] || 'Dashboard';

    // Route specific view data loaders
    if (tabId === 'dashboard') loadDashboard();
    else if (tabId === 'transactions') loadTransactions();
    else if (tabId === 'accounts') loadAccounts();
    else if (tabId === 'debts') loadDebts();
    else if (tabId === 'investments') loadInvestments();
    else if (tabId === 'salaryplan') loadSalaryPlan();
    else if (tabId === 'carryover') loadCarryover();
    else if (tabId === 'reports') loadReports();
    else if (tabId === 'settings') loadSettings();

    // Redraw charts if navigating to views with canvases
    if (tabId === 'dashboard' || tabId === 'reports' || tabId === 'investments') {
      setTimeout(() => window.PaisaCharts?.redrawAll(), 100);
    }

    window.scrollTo(0, 0);
    const contentBody = document.querySelector('.content-body');
    if (contentBody) contentBody.scrollTop = 0;
  }
  window.switchTab = switchTab;

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ====================================================================
  // Modal Manager
  // ====================================================================
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // ====================================================================
  // MULTI-PROFILE MANAGEMENT ENGINE
  // ====================================================================
  const PROFILE_ICONS = {
    user: '👤',
    briefcase: '💼',
    home: '🏠',
    building: '🏢',
    plane: '✈️',
    shopping: '🛍️',
    sparkles: '✨',
    heart: '❤️',
    dollar: '💰'
  };

  function getProfileIconEmoji(iconKey) {
    return PROFILE_ICONS[iconKey] || '👤';
  }

  async function loadProfiles() {
    try {
      const data = await api('/api/profiles');
      state.profiles = data.profiles || [];

      // Determine active profile
      let active = state.profiles.find(p => p.id === state.activeProfileId);
      if (!active) {
        active = state.profiles.find(p => p.is_default) || state.profiles[0];
        if (active) {
          state.activeProfileId = active.id;
          localStorage.setItem('paisatrack_active_profile_id', active.id);
        } else {
          state.activeProfileId = null;
          localStorage.removeItem('paisatrack_active_profile_id');
        }
      }
      state.activeProfile = active;

      renderProfileComponents();
    } catch (e) {
      console.error('Failed to load profiles:', e);
    }
  }

  function renderProfileComponents() {
    const active = state.activeProfile;
    if (!active) return;

    const emoji = getProfileIconEmoji(active.icon);
    const color = active.color || '#4f46e5';

    // 1. Header Profile Pill
    const headerAvatar = document.getElementById('headerProfileAvatar');
    const headerName = document.getElementById('headerProfileName');
    if (headerAvatar) {
      headerAvatar.style.backgroundColor = color;
      headerAvatar.innerHTML = `<span style="font-size: 13px;">${emoji}</span>`;
    }
    if (headerName) {
      headerName.textContent = active.name;
    }

    // 2. Sidebar Profile Card
    const sidebarAvatar = document.getElementById('sidebarProfileAvatar');
    const sidebarName = document.getElementById('sidebarProfileName');
    if (sidebarAvatar) {
      sidebarAvatar.style.backgroundColor = color;
      sidebarAvatar.innerHTML = `<span style="font-size: 15px;">${emoji}</span>`;
    }
    if (sidebarName) {
      sidebarName.textContent = active.name;
    }

    // 3. Mobile Drawer Profile Card
    const drawerAvatar = document.getElementById('drawerProfileAvatar');
    const drawerName = document.getElementById('drawerProfileName');
    if (drawerAvatar) {
      drawerAvatar.style.backgroundColor = color;
      drawerAvatar.innerHTML = `<span style="font-size: 15px;">${emoji}</span>`;
    }
    if (drawerName) {
      drawerName.textContent = active.name;
    }

    // 4. Header Dropdown Quick List
    const quickList = document.getElementById('profileListQuick');
    if (quickList) {
      quickList.innerHTML = state.profiles.map(p => {
        const isActive = p.id === active.id;
        const pEmoji = getProfileIconEmoji(p.icon);
        const pColor = p.color || '#4f46e5';
        const netWorthFormatted = formatCurrency(p.net_worth || 0);

        return `
          <div class="profile-quick-item ${isActive ? 'active' : ''}" data-profile-id="${p.id}">
            <div class="profile-quick-item-left">
              <div class="profile-item-avatar" style="background-color: ${pColor};">
                <span>${pEmoji}</span>
              </div>
              <div class="profile-item-info">
                <div class="profile-item-name">${escapeHtml(p.name)}</div>
                <div class="profile-item-desc">${escapeHtml(p.description || (p.is_default ? 'Default Profile' : 'Custom Profile'))}</div>
              </div>
            </div>
            <div class="profile-quick-item-right">
              <span class="profile-item-networth">${netWorthFormatted}</span>
              ${isActive ? '<span class="profile-active-check">✓ Active</span>' : ''}
            </div>
          </div>
        `;
      }).join('');

      // Add click handlers on quick items
      quickList.querySelectorAll('.profile-quick-item').forEach(item => {
        item.addEventListener('click', () => {
          const pid = parseInt(item.dataset.profileId);
          closeProfileDropdown();
          if (pid !== state.activeProfileId) {
            switchProfile(pid);
          }
        });
      });
    }

    // 5. Settings Tab Profiles List
    const settingsList = document.getElementById('profilesSettingsList');
    if (settingsList) {
      settingsList.innerHTML = state.profiles.map(p => {
        const isActive = p.id === active.id;
        const pEmoji = getProfileIconEmoji(p.icon);
        const pColor = p.color || '#4f46e5';
        const netWorthFormatted = formatCurrency(p.net_worth || 0);

        return `
          <div class="profile-settings-item">
            <div class="profile-settings-left">
              <div class="profile-item-avatar" style="background-color: ${pColor};">
                <span>${pEmoji}</span>
              </div>
              <div class="profile-settings-meta">
                <div class="profile-name-row">
                  <strong class="profile-item-name">${escapeHtml(p.name)}</strong>
                  ${isActive ? '<span class="badge-active-profile">✓ Active</span>' : ''}
                  ${p.is_default ? '<span class="badge-default-profile">Primary</span>' : ''}
                </div>
                <div class="profile-desc-row text-sm text-muted">
                  ${p.description ? `<span class="profile-desc-text">${escapeHtml(p.description)}</span> • ` : ''}Net Worth: <strong style="color: var(--emerald);">${netWorthFormatted}</strong>
                </div>
              </div>
            </div>
            <div class="profile-settings-actions">
              ${!isActive ? `<button class="btn btn-primary btn-sm btn-switch-action" data-profile-id="${p.id}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg> <span>Switch</span></button>` : ''}
              <button class="btn btn-secondary btn-sm btn-edit-profile" data-profile-id="${p.id}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> <span>Edit</span></button>
              ${!p.is_default && state.profiles.length > 1 ? `<button class="btn btn-danger btn-sm btn-delete-profile" data-profile-id="${p.id}" data-profile-name="${escapeHtml(p.name)}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> <span>Delete</span></button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Attach actions in settings list
      settingsList.querySelectorAll('.btn-switch-action').forEach(b => {
        b.addEventListener('click', () => switchProfile(parseInt(b.dataset.profileId)));
      });
      settingsList.querySelectorAll('.btn-edit-profile').forEach(b => {
        b.addEventListener('click', () => {
          const prof = state.profiles.find(p => p.id === parseInt(b.dataset.profileId));
          if (prof) openProfileFormModal(prof);
        });
      });
      settingsList.querySelectorAll('.btn-delete-profile').forEach(b => {
        b.addEventListener('click', () => confirmDeleteProfile(parseInt(b.dataset.profileId), b.dataset.profileName));
      });
    }

    // 6. Manage Profiles Modal Cards
    renderManageProfilesModal();
  }

  function renderManageProfilesModal() {
    const list = document.getElementById('manageProfilesCardsList');
    const badge = document.getElementById('profilesCountBadge');
    if (badge) {
      badge.textContent = `${state.profiles.length} Profile${state.profiles.length > 1 ? 's' : ''} Available`;
    }

    if (!list) return;

    list.innerHTML = state.profiles.map(p => {
      const isActive = p.id === state.activeProfileId;
      const pEmoji = getProfileIconEmoji(p.icon);
      const pColor = p.color || '#4f46e5';
      const netWorth = formatCurrency(p.net_worth || 0);

      return `
        <div class="profile-card-item ${isActive ? 'active' : ''}">
          <div class="profile-card-header">
            <div class="profile-card-header-left">
              <div class="profile-card-avatar" style="background-color: ${pColor};">
                <span>${pEmoji}</span>
              </div>
              <div class="profile-card-titles">
                <div class="profile-card-title">${escapeHtml(p.name)}</div>
                <div class="profile-card-desc">${escapeHtml(p.description || (p.is_default ? 'Main primary financial profile' : 'Dedicated workspace'))}</div>
              </div>
            </div>
            <div class="profile-card-badges">
              ${isActive ? '<span class="badge-active-profile">✓ Active</span>' : ''}
              ${p.is_default ? '<span class="badge-default-profile">Primary Default</span>' : ''}
            </div>
          </div>

          <div class="profile-card-stats">
            <div class="profile-stat-box">
              <span class="profile-stat-label">Net Worth</span>
              <span class="profile-stat-value" style="color: var(--emerald);">${netWorth}</span>
            </div>
            <div class="profile-stat-box">
              <span class="profile-stat-label">Records</span>
              <span class="profile-stat-value">${p.accounts_count || 0} Accounts • ${p.transactions_count || 0} Txns</span>
            </div>
          </div>

          <div class="profile-card-actions">
            ${!isActive ? `<button class="btn btn-primary btn-sm btn-modal-switch" data-profile-id="${p.id}">Switch to this Profile</button>` : `<span class="text-sm font-semibold" style="color: var(--emerald); margin-right: auto;">Currently Active</span>`}
            <button class="btn btn-secondary btn-sm btn-modal-edit" data-profile-id="${p.id}">Edit</button>
            ${!p.is_default && state.profiles.length > 1 ? `<button class="btn btn-danger btn-sm btn-modal-delete" data-profile-id="${p.id}" data-profile-name="${escapeHtml(p.name)}">Delete</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach actions in modal list
    list.querySelectorAll('.btn-modal-switch').forEach(b => {
      b.addEventListener('click', () => {
        closeModal('modalManageProfiles');
        switchProfile(parseInt(b.dataset.profileId));
      });
    });
    list.querySelectorAll('.btn-modal-edit').forEach(b => {
      b.addEventListener('click', () => {
        const prof = state.profiles.find(p => p.id === parseInt(b.dataset.profileId));
        if (prof) openProfileFormModal(prof);
      });
    });
    list.querySelectorAll('.btn-modal-delete').forEach(b => {
      b.addEventListener('click', () => confirmDeleteProfile(parseInt(b.dataset.profileId), b.dataset.profileName));
    });
  }

  async function switchProfile(profileId) {
    if (state.activeProfileId === profileId) return;

    try {
      state.activeProfileId = profileId;
      localStorage.setItem('paisatrack_active_profile_id', profileId);

      const res = await api(`/api/profiles/${profileId}/switch`, { method: 'POST' });
      showToast(res.message || 'Switched profile successfully', 'success');

      // Refresh profiles list and active indicator
      await loadProfiles();

      // Refresh all views for this profile
      await populateCategoryDropdowns();
      await populateAccountDropdowns();

      if (state.currentTab === 'dashboard') await loadDashboard();
      else if (state.currentTab === 'transactions') await loadTransactions();
      else if (state.currentTab === 'accounts') await loadAccounts();
      else if (state.currentTab === 'debts') await loadDebts();
      else if (state.currentTab === 'carryover') await loadCarryover();
      else if (state.currentTab === 'reports') await loadReports();
      else if (state.currentTab === 'settings') await loadSettings();

    } catch (err) {
      console.error('Failed to switch profile:', err);
    }
  }

  function openProfileFormModal(profile = null) {
    closeModal('modalManageProfiles');
    closeProfileDropdown();
    state.editingProfileId = profile ? profile.id : null;
    const modalTitle = document.getElementById('modalProfileTitle');
    const idInput = document.getElementById('profileFormId');
    const nameInput = document.getElementById('profileFormName');
    const descInput = document.getElementById('profileFormDesc');
    const currSelect = document.getElementById('profileFormCurrency');
    const colorInput = document.getElementById('profileFormColor');
    const iconInput = document.getElementById('profileFormIcon');

    if (profile) {
      if (modalTitle) modalTitle.textContent = `Edit Profile: ${profile.name}`;
      if (idInput) idInput.value = profile.id;
      if (nameInput) nameInput.value = profile.name || '';
      if (descInput) descInput.value = profile.description || '';
      if (currSelect) currSelect.value = profile.currency || 'INR';
      if (colorInput) colorInput.value = profile.color || '#4f46e5';
      if (iconInput) iconInput.value = profile.icon || 'user';
    } else {
      if (modalTitle) modalTitle.textContent = 'Add New Profile';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      if (currSelect) currSelect.value = state.currency || 'INR';
      if (colorInput) colorInput.value = '#4f46e5';
      if (iconInput) iconInput.value = 'user';
    }

    // Sync swatches and icons UI
    updateColorSwatchesActive(colorInput?.value);
    updateIconGridActive(iconInput?.value);

    openModal('modalProfileForm');
  }

  function updateColorSwatchesActive(selectedColor) {
    document.querySelectorAll('#colorPresetSwatches .swatch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color.toLowerCase() === (selectedColor || '').toLowerCase());
    });
  }

  function updateIconGridActive(selectedIcon) {
    document.querySelectorAll('#profileIconSelector .icon-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.icon === selectedIcon);
    });
  }

  async function handleProfileFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('profileFormId')?.value;
    const name = document.getElementById('profileFormName')?.value?.trim();
    const desc = document.getElementById('profileFormDesc')?.value?.trim();
    const currency = document.getElementById('profileFormCurrency')?.value || 'INR';
    const color = document.getElementById('profileFormColor')?.value || '#4f46e5';
    const icon = document.getElementById('profileFormIcon')?.value || 'user';

    if (!name) {
      showToast('Please enter a profile name', 'error');
      return;
    }

    const payload = {
      name,
      description: desc,
      currency,
      color,
      icon
    };

    try {
      if (id) {
        // Edit Profile
        const res = await api(`/api/profiles/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast(res.message || 'Profile updated successfully', 'success');
        closeModal('modalProfileForm');
        await loadProfiles();
      } else {
        // Create Profile
        const res = await api('/api/profiles', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast(res.message || 'Profile created successfully', 'success');
        closeModal('modalProfileForm');

        // Automatically switch to the newly created profile
        const newProfId = res.profile?.id;
        if (newProfId) {
          await switchProfile(newProfId);
        } else {
          await loadProfiles();
        }
      }
    } catch (err) {
      console.error('Save profile failed:', err);
    }
  }

  async function confirmDeleteProfile(profileId, profileName) {
    if (profileId === 1) {
      showToast('Cannot delete the primary default profile (Profile 1)', 'error');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to delete profile "${profileName}"?\n\nAll accounts, transactions, cards, loans, and debts belonging to this profile will be permanently deleted.`);
    if (!confirmed) return;

    try {
      const res = await api(`/api/profiles/${profileId}`, { method: 'DELETE' });
      showToast(res.message || 'Profile deleted successfully', 'success');

      // If active profile was deleted, switch to Profile 1
      if (state.activeProfileId === profileId) {
        state.activeProfileId = null;
        await switchProfile(1);
      } else {
        await loadProfiles();
      }
    } catch (err) {
      console.error('Delete profile failed:', err);
    }
  }

  function toggleProfileDropdown() {
    const menu = document.getElementById('profileDropdownMenu');
    const btn = document.getElementById('activeProfileBtn');
    if (!menu || !btn) return;

    const isOpen = menu.classList.contains('show');
    if (isOpen) {
      closeProfileDropdown();
    } else {
      menu.classList.add('show');
      btn.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  }

  function closeProfileDropdown() {
    const menu = document.getElementById('profileDropdownMenu');
    const btn = document.getElementById('activeProfileBtn');
    if (menu) menu.classList.remove('show');
    if (btn) {
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  // ====================================================================
  // 1. DASHBOARD LOADER
  // ====================================================================
  async function loadDashboard() {
    try {
      const data = await api(`/api/dashboard?year=${state.selectedYear}&month=${state.selectedMonth}`);

      // Period badge
      const badge = document.getElementById('currentPeriodBadge');
      if (badge) badge.textContent = `${data.selected_period.month_name} ${data.selected_period.year}`;

      // Update KPI values
      document.getElementById('kpiNetworth').textContent = formatCurrency(data.total_networth);
      document.getElementById('kpiIncome').textContent = formatCurrency(data.carryover.total_income);
      document.getElementById('kpiExpense').textContent = formatCurrency(data.carryover.total_expense);
      document.getElementById('kpiSavings').textContent = formatCurrency(data.carryover.net_savings);
      document.getElementById('kpiSavingsRate').textContent = `Savings Rate: ${data.carryover.savings_rate_percent}%`;

      // Carryover Callout Banner
      document.getElementById('carryoverClosingNumber').textContent = formatCurrency(data.carryover.closing_balance);
      document.getElementById('carryoverBannerDesc').textContent =
        `Opening (${formatCurrency(data.carryover.opening_balance)}) + Inflow (${formatCurrency(data.carryover.total_income)}) - Outflow (${formatCurrency(data.carryover.total_expense)}) = Net Surplus`;

      // Sidebar mini card
      const sbAmount = document.getElementById('sidebarCarryoverAmount');
      const sbStatus = document.getElementById('sidebarCarryoverStatus');
      if (sbAmount) sbAmount.textContent = formatCurrency(data.carryover.closing_balance);
      if (sbStatus) {
        sbStatus.textContent = data.carryover.status === 'carried_forward' ? 'Rolled Over' : 'Active Month';
        sbStatus.style.background = data.carryover.status === 'carried_forward' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)';
        sbStatus.style.color = data.carryover.status === 'carried_forward' ? '#a5b4fc' : '#34d399';
      }

      // Wealth & Financial Health Overview Strip
      const dTrueNet = document.getElementById('dashTrueNetworth');
      if (dTrueNet) dTrueNet.textContent = formatCurrency(data.true_net_worth != null ? data.true_net_worth : data.total_networth);

      const dPortVal = document.getElementById('dashPortfolioValue');
      if (dPortVal) dPortVal.textContent = formatCurrency(data.portfolio_value || 0);

      const dPortRet = document.getElementById('dashPortfolioReturns');
      if (dPortRet && data.investments_summary) {
        const retPct = data.investments_summary.returns_percentage || 0;
        const sign = retPct >= 0 ? '+' : '';
        dPortRet.textContent = `${sign}${retPct}%`;
        dPortRet.className = `wh-pill ${retPct >= 0 ? 'text-emerald' : 'text-rose'}`;
      }

      const dHealth = document.getElementById('dashHealthScore');
      if (dHealth && data.salary_plan_analysis) {
        dHealth.textContent = `${data.salary_plan_analysis.health_score}/100`;
        const hBadge = document.getElementById('dashHealthGrade');
        if (hBadge) {
          hBadge.textContent = data.salary_plan_analysis.health_grade;
          hBadge.style.color = data.salary_plan_analysis.health_color;
          hBadge.style.borderColor = data.salary_plan_analysis.health_color;
        }
      }

      // Store local lists
      state.accounts = data.accounts || [];
      state.cards = data.cards || [];
      state.loans = data.loans || [];
      state.recentTransactions = data.recent_transactions || [];

      // Render Accounts list preview
      renderDashboardAccounts(data.accounts);

      // Render Debts preview
      renderDashboardDebts(data.total_borrowed_payable, data.total_lent_receivable, data.debts);

      // Render Recent Transactions
      renderRecentTransactions(data.recent_transactions);

      // Fetch month-wise data for Donut & Trends Charts
      const report = await api(`/api/reports/month-wise?year=${state.selectedYear}&month=${state.selectedMonth}`);
      if (window.PaisaCharts) {
        window.PaisaCharts.renderDonutChart('categoryDonutChart', report.expense_categories, formatCurrency);
        window.PaisaCharts.renderTrendBarChart('trendBarChart', report.monthly_trends, formatCurrency);
        renderDonutLegend(report.expense_categories);
      }
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    }
  }

  function renderDashboardAccounts(accounts) {
    const container = document.getElementById('dashboardAccountsList');
    if (!container) return;
    if (!accounts || accounts.length === 0) {
      container.innerHTML = '<p class="text-muted text-center py-3">No bank accounts registered</p>';
      return;
    }
    container.innerHTML = accounts.map(acc => `
      <div class="account-preview-row" style="border-left-color: ${acc.color || '#6366f1'}">
        <div class="acc-info-box">
          <h4>${escapeHtml(acc.name)}</h4>
          <span>${escapeHtml(acc.institution_name || '')} ${acc.account_number_mask ? '(' + acc.account_number_mask + ')' : ''}</span>
        </div>
        <div class="acc-bal-box text-emerald">${formatCurrency(acc.balance)}</div>
      </div>
    `).join('');
  }

  function renderDashboardDebts(payable, receivable, debts) {
    document.getElementById('dashTotalPayable').textContent = formatCurrency(payable);
    document.getElementById('dashTotalReceivable').textContent = formatCurrency(receivable);

    const list = document.getElementById('dashboardDebtsList');
    if (!list) return;
    if (!debts || debts.length === 0) {
      list.innerHTML = '<p class="text-muted text-center py-2">No active friend/relative borrows or lent amounts</p>';
      return;
    }
    list.innerHTML = debts.slice(0, 4).map(d => {
      const isBorrow = d.direction === 'borrowed';
      return `
        <div class="debt-preview-item">
          <div>
            <strong>${escapeHtml(d.person_name)}</strong>
            <span class="badge ${isBorrow ? 'badge-rose' : 'badge-emerald'} ml-2">${isBorrow ? 'You Owe' : 'Owes You'}</span>
          </div>
          <div class="text-right">
            <strong>${formatCurrency(d.balance_remaining)}</strong>
            <small class="d-block text-muted">Due: ${d.due_date || 'N/A'}</small>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderDonutLegend(categories) {
    const container = document.getElementById('categoryDonutLegend');
    if (!container) return;
    if (!categories || categories.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = categories.map(cat => `
      <div class="legend-item">
        <span class="legend-color-dot" style="background-color: ${cat.category_color}"></span>
        <span>${escapeHtml(cat.category_name)}: <strong>${cat.percentage}%</strong></span>
      </div>
    `).join('');
  }

  function renderRecentTransactions(transactions) {
    const tbody = document.getElementById('dashboardRecentTbody');
    if (!tbody) return;
    if (!transactions || transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No transactions logged yet</td></tr>';
      return;
    }
    tbody.innerHTML = transactions.map(t => {
      const isExpense = t.type === 'expense';
      const isIncome = t.type === 'income';
      const amtClass = isExpense ? 'text-rose' : isIncome ? 'text-emerald' : 'text-indigo';
      const sign = isExpense ? '-' : isIncome ? '+' : '';

      return `
        <tr>
          <td>${t.date}</td>
          <td>
            <strong>${escapeHtml(t.description || 'Transaction')}</strong>
            ${t.tags ? `<div class="text-muted" style="font-size: 11px;">${escapeHtml(t.tags)}</div>` : ''}
          </td>
          <td>
            <span class="badge badge-indigo">${escapeHtml(t.category_name || 'General')}</span>
          </td>
          <td>
            <span>${escapeHtml(t.account_name || 'Bank')}</span>
            <small class="text-muted" style="font-size: 10.5px; display:block;">${(t.payment_mode || 'upi').toUpperCase()}</small>
          </td>
          <td class="text-right font-weight-bold ${amtClass}">
            ${sign}${formatCurrency(t.amount)}
          </td>
          <td class="text-center">
            <button class="btn-link btn-sm edit-trans-btn" data-id="${t.id}">Edit</button>
            <button class="btn-link btn-sm text-rose delete-trans-btn" data-id="${t.id}">Del</button>
          </td>
        </tr>
      `;
    }).join('');

    attachTransactionActionHandlers(tbody);
  }

  // ====================================================================
  // 2. TRANSACTIONS LEDGER LOADER & FILTERS
  // ====================================================================
  async function loadTransactions() {
    const search = document.getElementById('transSearchInput')?.value || '';
    const type = document.getElementById('transTypeFilter')?.value || '';
    const catId = document.getElementById('transCategoryFilter')?.value || '';
    const accId = document.getElementById('transAccountFilter')?.value || '';
    const month = document.getElementById('transMonthFilter')?.value || '';

    let url = `/api/transactions?limit=150`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (catId) url += `&category_id=${encodeURIComponent(catId)}`;
    if (accId) url += `&account_id=${encodeURIComponent(accId)}`;
    if (month) url += `&month=${encodeURIComponent(month)}`;

    const data = await api(url);
    state.filteredTransactions = data.transactions;

    // Update filter summary pill bar
    document.getElementById('transFilterCount').textContent = data.count;
    document.getElementById('transFilterIncome').textContent = formatCurrency(data.total_income);
    document.getElementById('transFilterExpense').textContent = formatCurrency(data.total_expense);
    document.getElementById('transFilterNet').textContent = formatCurrency(data.net);

    const tbody = document.getElementById('transactionsTbody');
    if (!tbody) return;

    if (!data.transactions || data.transactions.length === 0) {
      tbody.innerHTML = '<tr class="empty-state-row"><td colspan="8" class="text-center py-5 text-muted">No transactions found matching your criteria</td></tr>';
      return;
    }

    tbody.innerHTML = data.transactions.map(t => {
      const isExpense = t.type === 'expense';
      const isIncome = t.type === 'income';
      const isTransfer = t.type === 'transfer';
      const amtClass = isExpense ? 'text-rose' : isIncome ? 'text-emerald' : 'text-indigo';
      const sign = isExpense ? '-' : isIncome ? '+' : '';

      return `
        <tr>
          <td>
            <strong>${t.date}</strong>
            <div class="text-muted" style="font-size: 11px;">${t.time || ''}</div>
          </td>
          <td>
            <span class="badge ${isExpense ? 'badge-rose' : isIncome ? 'badge-emerald' : 'badge-indigo'}">
              ${t.type.toUpperCase()}
            </span>
          </td>
          <td>
            <strong>${escapeHtml(t.description || '')}</strong>
            ${t.tags ? `<div class="text-muted" style="font-size: 11px;">${escapeHtml(t.tags)}</div>` : ''}
          </td>
          <td>
            <span class="badge badge-indigo">${escapeHtml(t.category_name || (isTransfer ? 'Transfer' : 'General'))}</span>
          </td>
          <td>
            <span>${escapeHtml(t.account_name || 'Account')}</span>
            ${isTransfer && t.destination_account_name ? ` → <span>${escapeHtml(t.destination_account_name)}</span>` : ''}
            ${t.card_name ? `<div class="text-muted" style="font-size: 11px;">Card: ${escapeHtml(t.card_name)}</div>` : ''}
          </td>
          <td>
            <span class="badge badge-secondary">${(t.payment_mode || 'UPI').toUpperCase()}</span>
          </td>
          <td class="text-right ${amtClass}" style="font-family: var(--font-heading); font-weight: 700; font-size: 15px;">
            ${sign}${formatCurrency(t.amount)}
          </td>
          <td class="text-center">
            <button class="btn-link btn-sm edit-trans-btn" data-id="${t.id}">Edit</button>
            <button class="btn-link btn-sm text-rose delete-trans-btn" data-id="${t.id}">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    attachTransactionActionHandlers(tbody);
  }

  function attachTransactionActionHandlers(container) {
    container.querySelectorAll('.edit-trans-btn').forEach(btn => {
      btn.onclick = () => editTransaction(parseInt(btn.getAttribute('data-id')));
    });

    container.querySelectorAll('.delete-trans-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = parseInt(btn.getAttribute('data-id'));
        if (confirm('Are you sure you want to delete this transaction? Balance will be automatically restored.')) {
          await api(`/api/transactions/${id}`, { method: 'DELETE' });
          showToast('Transaction deleted successfully', 'success');
          loadDashboard();
          if (state.currentTab === 'transactions') loadTransactions();
        }
      };
    });
  }

  // ====================================================================
  // 3. ACCOUNTS & CARDS LOADER
  // ====================================================================
  async function loadAccounts() {
    const accData = await api('/api/accounts');
    const cardsData = await api('/api/cards');
    state.accounts = accData.accounts;
    state.cards = cardsData.cards;

    // Render Accounts Grid
    const accGrid = document.getElementById('accountsGrid');
    if (accGrid) {
      if (!accData.accounts || accData.accounts.length === 0) {
        accGrid.innerHTML = '<p class="text-muted text-center py-4">No accounts added. Click "+ Add Bank Account" to begin.</p>';
      } else {
        accGrid.innerHTML = accData.accounts.map(acc => `
          <div class="bank-account-card" style="border-top: 4px solid ${acc.color || '#2563eb'}">
            <div class="bank-card-top">
              <div>
                <h3 style="font-size: 17px; font-weight: 700;">${escapeHtml(acc.name)}</h3>
                <span class="text-muted" style="font-size: 12px;">${escapeHtml(acc.institution_name || '')}</span>
              </div>
              <div class="bank-chip"></div>
            </div>

            <div class="bank-card-num">${acc.account_number_mask || '•••• •••• •••• 0000'}</div>

            <div class="bank-card-bal-label">Current Balance</div>
            <div class="bank-card-balance text-emerald">${formatCurrency(acc.balance)}</div>

            <div class="card-actions-row">
              <button class="btn-link btn-sm edit-acc-btn" data-id="${acc.id}">Edit</button>
              <button class="btn-link btn-sm text-rose delete-acc-btn" data-id="${acc.id}">Deactivate</button>
            </div>
          </div>
        `).join('');

        accGrid.querySelectorAll('.edit-acc-btn').forEach(btn => {
          btn.onclick = () => editAccount(parseInt(btn.getAttribute('data-id')));
        });
        accGrid.querySelectorAll('.delete-acc-btn').forEach(btn => {
          btn.onclick = async () => {
            if (confirm('Deactivate this account?')) {
              await api(`/api/accounts/${btn.getAttribute('data-id')}`, { method: 'DELETE' });
              showToast('Account updated', 'success');
              loadAccounts();
            }
          };
        });
      }
    }

    // Render Cards Grid
    const cardsGrid = document.getElementById('cardsGrid');
    if (cardsGrid) {
      if (!cardsData.cards || cardsData.cards.length === 0) {
        cardsGrid.innerHTML = '<p class="text-muted text-center py-4">No credit or debit cards linked.</p>';
      } else {
        cardsGrid.innerHTML = cardsData.cards.map(c => {
          const isCredit = c.card_type === 'credit';
          const isAddon = Boolean(c.is_addon === 1 && c.parent_card_id);
          const hasAddons = Boolean(!isAddon && (c.addon_count > 0));
          const used = Math.max(0, (c.credit_limit || 0) - (c.available_limit || 0));
          const pct = c.credit_limit > 0 ? Math.min(100, Math.round((used / c.credit_limit) * 100)) : 0;

          return `
            <div class="credit-card-ui ${isAddon ? 'is-addon-card' : ''}" style="background: linear-gradient(135deg, ${c.color || '#1e293b'}, #0f172a)">
              <div class="bank-card-top">
                <div>
                  <h3 style="font-size: 16px; font-weight: 700;">${escapeHtml(c.card_name)}</h3>
                  <div class="card-badges-row mt-1" style="display: flex; gap: 5px; flex-wrap: wrap; align-items: center;">
                    <span class="badge badge-indigo">${(c.card_network || 'visa').toUpperCase()}</span>
                    ${isAddon ? `
                      <span class="badge badge-amber" style="background: rgba(245, 158, 11, 0.25); color: #fde047; border: 1px solid rgba(245, 158, 11, 0.4);">ADD-ON CARD</span>
                      <span class="badge badge-indigo" style="font-size: 10px;">Shared Limit</span>
                    ` : (hasAddons ? `
                      <span class="badge badge-emerald" style="background: rgba(16, 185, 129, 0.25); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4);">PRIMARY CARD</span>
                      <span class="badge badge-primary" style="font-size: 10px;">${c.addon_count} Add-on${c.addon_count > 1 ? 's' : ''} Linked</span>
                    ` : '')}
                  </div>
                </div>
                <div class="text-right">
                  <span class="badge ${isCredit ? 'badge-amber' : 'badge-emerald'}">${c.card_type.toUpperCase()}</span>
                </div>
              </div>

              <div class="bank-card-num">•••• •••• •••• ${c.card_last4 || '0000'}</div>

              ${isAddon && c.parent_card_name ? `
                <div style="font-size: 11.5px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); padding: 5px 8px; border-radius: 6px; margin: 6px 0; color: #c7d2fe; display: flex; align-items: center; gap: 5px;">
                  <span>🔗</span>
                  <span>Shares limit with <strong>${escapeHtml(c.parent_card_name)}</strong> (•••• ${c.parent_card_last4 || '****'})</span>
                </div>
              ` : ''}

              ${isCredit ? `
                <div class="cc-limits-bar">
                  <div class="d-flex justify-content-between" style="font-size: 12px; display: flex; justify-content: space-between;">
                    <span>${isAddon ? 'Shared Spent' : 'Outstanding'}: <strong>${formatCurrency(used)}</strong></span>
                    <span>Shared Available: <strong>${formatCurrency(c.available_limit)}</strong></span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width: ${pct}%; background: ${pct > 80 ? '#f43f5e' : '#10b981'};"></div>
                  </div>
                  <div class="d-flex justify-content-between" style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-top: 3px;">
                    <span>Total Limit: ${formatCurrency(c.credit_limit)} (${pct}% utilized)</span>
                    ${c.sub_limit > 0 ? `<span style="color: #fbbf24;">Spend Cap: ${formatCurrency(c.sub_limit)}/mo</span>` : ''}
                  </div>
                </div>
                <div style="font-size: 11.5px; color: #cbd5e1; margin-top: 6px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                  <span>📅 Cycle: <strong>${c.billing_start_day || 24}th to ${c.billing_day || 22}nd</strong></span>
                  <span>📄 Stmt: <strong>Day ${c.billing_day || 22}</strong> | ⏰ Due: <strong>Day ${c.due_day || 11}</strong></span>
                </div>
                ${isAddon ? `
                  <div style="font-size: 10.5px; color: #fbbf24; margin-top: 2px;">
                    ✨ Add-on Card Independent Billing Schedule
                  </div>
                ` : ''}
                ${c.linked_account_name ? `
                  <div class="card-bank-status" style="font-size: 11.5px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); padding: 5px 8px; border-radius: 6px; margin-top: 6px; color: #6ee7b7; display: flex; align-items: center; justify-content: space-between;">
                    <span style="display: flex; align-items: center; gap: 5px;">
                      <span>🏦</span>
                      <span>Linked Bank: <strong>${escapeHtml(c.linked_account_name)}</strong></span>
                    </span>
                    <span class="badge badge-emerald" style="font-size: 9.5px; padding: 2px 6px;">Auto-Pay Ready</span>
                  </div>
                ` : `
                  <div class="card-bank-status" style="font-size: 11.5px; background: rgba(148, 163, 184, 0.1); border: 1px solid rgba(148, 163, 184, 0.25); padding: 5px 8px; border-radius: 6px; margin-top: 6px; color: #94a3b8; display: flex; align-items: center; justify-content: space-between;">
                    <span style="display: flex; align-items: center; gap: 5px;">
                      <span>🌐</span>
                      <span>Standalone Card (No Bank Account)</span>
                    </span>
                    <span class="badge" style="background: rgba(148, 163, 184, 0.2); color: #cbd5e1; font-size: 9.5px; padding: 2px 6px; border: 1px solid rgba(148, 163, 184, 0.3);">Pay via Any Bank</span>
                  </div>
                `}
              ` : `
                <div class="bank-card-bal-label">Debit Card</div>
                ${c.linked_account_name ? `
                  <div style="font-size: 12px; color: #6ee7b7; margin-top: 4px; display: flex; align-items: center; gap: 5px;">
                    <span>🏦</span> Linked to: <strong>${escapeHtml(c.linked_account_name)}</strong>
                  </div>
                ` : `
                  <div class="text-muted" style="font-size: 12px; margin-top: 4px;">Unlinked Debit Card</div>
                `}
              `}

              <div class="card-actions-row mt-3" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                ${isCredit ? `<button class="btn btn-primary btn-sm view-billing-cycles-btn" data-id="${c.id}" data-name="${escapeHtml(c.card_name)}" style="font-size: 11px; padding: 4px 10px;">📊 Billing Cycles & Bills</button>` : ''}
                ${isCredit && used > 0 ? `<button class="btn btn-emerald btn-sm pay-card-btn" data-id="${c.id}" data-name="${escapeHtml(c.card_name)}" data-due="${used}" data-account="${c.account_id || ''}" style="font-size: 11px; padding: 4px 10px;">Pay Bill</button>` : ''}
                <button class="btn-link btn-sm edit-card-btn" data-id="${c.id}">Edit</button>
                <button class="btn-link btn-sm text-rose delete-card-btn" data-id="${c.id}">Delete</button>
              </div>
            </div>
          `;
        }).join('');

        cardsGrid.querySelectorAll('.view-billing-cycles-btn').forEach(btn => {
          btn.onclick = () => openBillingCycleModal(parseInt(btn.getAttribute('data-id')));
        });
        cardsGrid.querySelectorAll('.edit-card-btn').forEach(btn => {
          btn.onclick = () => editCard(parseInt(btn.getAttribute('data-id')));
        });
        cardsGrid.querySelectorAll('.delete-card-btn').forEach(btn => {
          btn.onclick = async () => {
            if (confirm('Delete this card?')) {
              await api(`/api/cards/${btn.getAttribute('data-id')}`, { method: 'DELETE' });
              showToast('Card removed', 'success');
              loadAccounts();
            }
          };
        });
        cardsGrid.querySelectorAll('.pay-card-btn').forEach(btn => {
          btn.onclick = () => openPayCardFlow(
            btn.getAttribute('data-id'),
            btn.getAttribute('data-name'),
            parseFloat(btn.getAttribute('data-due')),
            btn.getAttribute('data-account') ? parseInt(btn.getAttribute('data-account')) : null
          );
        });
      }
    }
  }

  // ====================================================================
  // 4. LOANS & RELATIVES DEBTS LOADER
  // ====================================================================
  async function loadDebts() {
    const loansData = await api('/api/loans');
    const borrowsData = await api('/api/borrows');
    state.loans = loansData.loans;
    state.debts = borrowsData;

    // Render Loans Grid
    const loansGrid = document.getElementById('loansGrid');
    if (loansGrid) {
      if (!loansData.loans || loansData.loans.length === 0) {
        loansGrid.innerHTML = '<p class="text-muted text-center py-4">No active loans. Click "+ Add Loan" to log EMIs.</p>';
      } else {
        loansGrid.innerHTML = loansData.loans.map(l => `
          <div class="loan-card">
            <div class="d-flex justify-content-between" style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <h3 style="font-size: 16px; font-weight: 700;">${escapeHtml(l.title)}</h3>
                <span class="badge badge-amber">${(l.loan_type || 'personal').toUpperCase()}</span>
              </div>
              <span class="badge ${l.status === 'active' ? 'badge-emerald' : 'badge-secondary'}">${l.status.toUpperCase()}</span>
            </div>

            <div class="mt-3" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <span class="text-muted" style="font-size: 11.5px;">Remaining Principal</span>
                <div class="text-rose" style="font-family: var(--font-heading); font-size: 18px; font-weight: 700;">${formatCurrency(l.current_balance)}</div>
              </div>
              <div>
                <span class="text-muted" style="font-size: 11.5px;">Monthly EMI</span>
                <div class="text-cyan" style="font-family: var(--font-heading); font-size: 18px; font-weight: 700;">${formatCurrency(l.emi_amount)}</div>
              </div>
            </div>

            <div class="mt-2 text-muted" style="font-size: 12px;">
              EMI Due: Day ${l.emi_due_day || 5} of every month | Interest: ${l.interest_rate || 0}% p.a.
            </div>

            <div class="card-actions-row mt-3">
              ${l.status === 'active' ? `<button class="btn btn-emerald btn-sm pay-loan-emi-btn" data-id="${l.id}" data-title="${escapeHtml(l.title)}" data-emi="${l.emi_amount}">Pay EMI</button>` : ''}
              <button class="btn-link btn-sm edit-loan-btn" data-id="${l.id}">Edit</button>
              <button class="btn-link btn-sm text-rose delete-loan-btn" data-id="${l.id}">Delete</button>
            </div>
          </div>
        `).join('');

        loansGrid.querySelectorAll('.pay-loan-emi-btn').forEach(btn => {
          btn.onclick = () => openPayLoanEmiFlow(btn.getAttribute('data-id'), btn.getAttribute('data-title'), parseFloat(btn.getAttribute('data-emi')));
        });
        loansGrid.querySelectorAll('.edit-loan-btn').forEach(btn => {
          btn.onclick = () => editLoan(parseInt(btn.getAttribute('data-id')));
        });
        loansGrid.querySelectorAll('.delete-loan-btn').forEach(btn => {
          btn.onclick = async () => {
            if (confirm('Delete this loan?')) {
              await api(`/api/loans/${btn.getAttribute('data-id')}`, { method: 'DELETE' });
              showToast('Loan removed', 'success');
              loadDebts();
            }
          };
        });
      }
    }

    // Render Borrows & Lent (Friends & Relatives)
    document.getElementById('badgeTotalBorrowed').textContent = formatCurrency(borrowsData.total_borrowed_remaining);
    document.getElementById('badgeTotalLent').textContent = formatCurrency(borrowsData.total_lent_remaining);

    renderDebtsTable();
  }

  function renderDebtsTable() {
    const list = state.debtDirectionTab === 'borrowed' ? state.debts.borrowed_list : state.debts.lent_list;
    const tbody = document.getElementById('debtsTbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No ${state.debtDirectionTab === 'borrowed' ? 'borrowed debts' : 'lent records'}</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(d => {
      const isBorrow = d.direction === 'borrowed';
      const modeLabel = (d.payment_mode || 'upi').toUpperCase();
      const accHtml = d.account_name ? `
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="font-weight: 600; font-size: 12.5px; color: var(--text-primary);">🏦 ${escapeHtml(d.account_name)}</span>
          <div>
            <span class="badge ${isBorrow ? 'badge-emerald' : 'badge-rose'}" style="font-size: 10px; padding: 2px 6px;">
              ${isBorrow ? '↓ Received' : '↑ Lent'} (${modeLabel})
            </span>
          </div>
        </div>
      ` : `<span class="text-muted" style="font-size: 11px;">Direct / Cash</span>`;

      return `
      <tr>
        <td>
          <strong>${escapeHtml(d.person_name)}</strong>
          ${d.phone ? `<div class="text-muted" style="font-size: 11px;">${escapeHtml(d.phone)}</div>` : ''}
        </td>
        <td><span class="badge badge-indigo">${escapeHtml(d.relationship || 'Friend')}</span></td>
        <td>${accHtml}</td>
        <td>${d.transaction_date}</td>
        <td>${d.due_date || 'N/A'}</td>
        <td>${formatCurrency(d.principal_amount)}</td>
        <td class="font-weight-bold ${d.direction === 'borrowed' ? 'text-rose' : 'text-emerald'}" style="font-family: var(--font-heading); font-size: 15px;">
          ${formatCurrency(d.balance_remaining)}
        </td>
        <td>
          <span class="badge ${d.status === 'settled' ? 'badge-emerald' : d.status === 'partial' ? 'badge-amber' : 'badge-rose'}">
            ${d.status.toUpperCase()}
          </span>
        </td>
        <td class="text-center">
          ${d.status !== 'settled' ? `<button class="btn btn-emerald btn-sm settle-debt-btn" data-id="${d.id}" data-name="${escapeHtml(d.person_name)}" data-dir="${d.direction}" data-bal="${d.balance_remaining}">Settle</button>` : ''}
          <button class="btn-link btn-sm edit-borrow-btn" data-id="${d.id}">Edit</button>
          <button class="btn-link btn-sm text-rose delete-borrow-btn" data-id="${d.id}">Del</button>
        </td>
      </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.settle-debt-btn').forEach(btn => {
      btn.onclick = () => openSettleDebtModal(
        btn.getAttribute('data-id'),
        btn.getAttribute('data-name'),
        btn.getAttribute('data-dir'),
        parseFloat(btn.getAttribute('data-bal'))
      );
    });
    tbody.querySelectorAll('.edit-borrow-btn').forEach(btn => {
      btn.onclick = () => editBorrow(parseInt(btn.getAttribute('data-id')));
    });
    tbody.querySelectorAll('.delete-borrow-btn').forEach(btn => {
      btn.onclick = async () => {
        if (confirm('Delete this debt record? Linked transactions will be removed and bank account balance will be restored.')) {
          await api(`/api/borrows/${btn.getAttribute('data-id')}`, { method: 'DELETE' });
          showToast('Debt record deleted & bank balance restored', 'success');
          await loadDebts();
          await loadAccounts();
          await loadTransactions();
          await loadDashboard();
        }
      };
    });
  }

  // ====================================================================
  // 5. MONTH-END CARRY FORWARD CENTER LOADER
  // ====================================================================
  async function loadCarryover() {
    const picker = document.getElementById('carryoverMonthPicker');
    if (picker && !picker.value) {
      picker.value = `${state.selectedYear}-${state.selectedMonth.toString().padStart(2, '0')}`;
    }

    let y = state.selectedYear;
    let m = state.selectedMonth;
    if (picker && picker.value) {
      const parts = picker.value.split('-');
      y = parseInt(parts[0]);
      m = parseInt(parts[1]);
    }

    const data = await api(`/api/carryover?year=${y}&month=${m}`);
    const hist = await api('/api/carryover/history');

    document.getElementById('carryoverHeroClosingVal').textContent = formatCurrency(data.closing_balance);
    const badge = document.getElementById('carryoverHeroStatusBadge');
    badge.textContent = `Status: ${data.status === 'carried_forward' ? 'Finalized & Rolled Over' : 'Active / Pending Rollover'}`;
    badge.style.background = data.status === 'carried_forward' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(16, 185, 129, 0.25)';

    // Formula Step Values
    document.getElementById('stepOpeningBal').textContent = formatCurrency(data.opening_balance);
    document.getElementById('stepIncomeBal').textContent = formatCurrency(data.total_income);
    document.getElementById('stepExpenseBal').textContent = formatCurrency(data.total_expense);
    document.getElementById('stepNetRollover').textContent = formatCurrency(data.closing_balance);

    // Render Carryover Ledger Table
    const tbody = document.getElementById('carryoverHistoryTbody');
    if (tbody) {
      if (!hist.history || hist.history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">No historical month closures found</td></tr>';
      } else {
        tbody.innerHTML = hist.history.map(h => `
          <tr>
            <td><strong>${h.month_name} ${h.year}</strong></td>
            <td>${formatCurrency(h.opening_balance)}</td>
            <td class="text-emerald font-weight-bold">+${formatCurrency(h.total_income)}</td>
            <td class="text-rose font-weight-bold">-${formatCurrency(h.total_expense)}</td>
            <td>${formatCurrency(h.total_loan_emi)}</td>
            <td>${formatCurrency(h.total_debt_paid)}</td>
            <td>${formatCurrency(h.closing_balance)}</td>
            <td class="text-cyan font-weight-bold" style="font-family: var(--font-heading); font-size: 15px;">
              ${formatCurrency(h.carried_forward_amount)}
            </td>
            <td>
              <span class="badge ${h.status === 'carried_forward' ? 'badge-indigo' : 'badge-amber'}">
                ${h.status.toUpperCase()}
              </span>
            </td>
            <td>${h.closed_at ? h.closed_at.split('T')[0] : 'In Progress'}</td>
          </tr>
        `).join('');
      }
    }
  }

  // ====================================================================
  // 6. REPORTS & CHARTS LOADER (Month-wise & Day-wise)
  // ====================================================================
  async function loadReports() {
    const picker = document.getElementById('reportMonthPicker');
    if (picker && !picker.value) {
      picker.value = `${state.selectedYear}-${state.selectedMonth.toString().padStart(2, '0')}`;
    }

    let y = state.selectedYear;
    let m = state.selectedMonth;
    if (picker && picker.value) {
      const parts = picker.value.split('-');
      y = parseInt(parts[0]);
      m = parseInt(parts[1]);
    }

    if (state.reportSubTab === 'month') {
      const rep = await api(`/api/reports/month-wise?year=${y}&month=${m}`);

      document.getElementById('reportMonthIncome').textContent = formatCurrency(rep.summary.total_income);
      document.getElementById('reportMonthExpense').textContent = formatCurrency(rep.summary.total_expense);
      document.getElementById('reportMonthNet').textContent = formatCurrency(rep.summary.net_savings);
      document.getElementById('reportMonthSavingsRate').textContent = `${rep.summary.savings_rate_percent}%`;

      if (window.PaisaCharts) {
        window.PaisaCharts.renderDonutChart('reportCategoryChart', rep.expense_categories, formatCurrency);
        window.PaisaCharts.renderTrendBarChart('reportTrendChart', rep.monthly_trends, formatCurrency);
      }

      // Render Category Details Table
      const tbody = document.getElementById('reportCategoryTbody');
      if (tbody) {
        if (!rep.expense_categories || rep.expense_categories.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No expenses categorized for this month</td></tr>';
        } else {
          tbody.innerHTML = rep.expense_categories.map(c => `
            <tr>
              <td>
                <span class="legend-color-dot" style="background-color: ${c.category_color}; display: inline-block; vertical-align: middle; margin-right: 6px;"></span>
                <strong>${escapeHtml(c.category_name)}</strong>
              </td>
              <td class="text-rose font-weight-bold">${formatCurrency(c.total_amount)}</td>
              <td>${c.percentage}%</td>
              <td>${c.transaction_count}</td>
              <td>${c.budget_limit > 0 ? formatCurrency(c.budget_limit) : 'No Limit'}</td>
              <td>
                ${c.budget_limit > 0 ? `
                  <div class="progress-track" style="margin: 0;">
                    <div class="progress-fill" style="width: ${Math.min(100, c.budget_used_percent)}%; background: ${c.budget_used_percent > 100 ? '#f43f5e' : '#10b981'};"></div>
                  </div>
                  <small style="font-size: 10px;">${c.budget_used_percent}% used</small>
                ` : '—'}
              </td>
            </tr>
          `).join('');
        }
      }
    } else {
      // Day-wise Report
      const dayRep = await api(`/api/reports/day-wise?year=${y}&month=${m}`);

      document.getElementById('reportDailyAvg').textContent = formatCurrency(dayRep.average_daily_expense);
      document.getElementById('reportActiveDays').textContent = `${dayRep.active_days} of ${dayRep.total_days} Days`;
      document.getElementById('reportDayTotalExpense').textContent = formatCurrency(dayRep.total_expense);

      const peakEl = document.getElementById('reportPeakDayDate');
      const peakAmt = document.getElementById('reportPeakDayAmount');
      if (dayRep.peak_day && dayRep.peak_day.date) {
        peakEl.textContent = dayRep.peak_day.date;
        peakAmt.textContent = `Spent: ${formatCurrency(dayRep.peak_day.expense)}`;
      } else {
        peakEl.textContent = 'None';
        peakAmt.textContent = 'Spent: ₹0.00';
      }

      if (window.PaisaCharts) {
        window.PaisaCharts.renderDailyChart('reportDailyChart', dayRep.days, dayRep.peak_day.date, formatCurrency);
      }

      // Render Day-wise Table
      const tbody = document.getElementById('reportDailyTbody');
      if (tbody) {
        tbody.innerHTML = dayRep.days.map(d => `
          <tr>
            <td><strong>${d.date}</strong></td>
            <td>${d.weekday}</td>
            <td class="${d.expense > 0 ? 'text-rose font-weight-bold' : 'text-muted'}">${formatCurrency(d.expense)}</td>
            <td class="${d.income > 0 ? 'text-emerald font-weight-bold' : 'text-muted'}">${formatCurrency(d.income)}</td>
            <td class="${d.net >= 0 ? 'text-emerald' : 'text-rose'}">${formatCurrency(d.net)}</td>
            <td>${d.transaction_count}</td>
          </tr>
        `).join('');
      }
    }
  }

  // ====================================================================
  // 7. SETTINGS LOADER
  // ====================================================================
  async function loadSettings() {
    const data = await api('/api/settings');
    state.availableCurrencies = data.available_currencies;

    const select = document.getElementById('settingsCurrencySelect');
    if (select) select.value = data.settings.currency_code || 'INR';

    // Load categories
    const catsData = await api('/api/categories');
    state.categories = catsData.categories;
    const catList = document.getElementById('categoriesSettingsList');
    if (catList) {
      catList.innerHTML = catsData.categories.map(c => `
        <span class="category-tag">
          <span class="legend-color-dot" style="background-color: ${c.color}"></span>
          ${escapeHtml(c.name)} (${c.type})
          <button class="btn-link text-rose delete-cat-btn" data-id="${c.id}" style="margin-left: 4px;">&times;</button>
        </span>
      `).join('');

      catList.querySelectorAll('.delete-cat-btn').forEach(btn => {
        btn.onclick = async () => {
          if (confirm('Delete this category?')) {
            await api(`/api/categories/${btn.getAttribute('data-id')}`, { method: 'DELETE' });
            showToast('Category deleted', 'success');
            loadSettings();
            populateCategoryDropdowns();
          }
        };
      });
    }
  }

  // ====================================================================
  // 8. INVESTMENTS & PORTFOLIO ENGINE
  // ====================================================================
  async function loadInvestments() {
    try {
      const summary = await api('/api/investments/summary');
      const listData = await api('/api/investments');
      state.investments = listData.investments || [];
      state.investmentsSummary = summary;

      // Update KPIs
      const curValEl = document.getElementById('invTotalCurrentValue');
      if (curValEl) curValEl.textContent = formatCurrency(summary.current_value);

      const retSubEl = document.getElementById('invTotalReturnsSub');
      if (retSubEl) {
        const sign = summary.total_returns >= 0 ? '+' : '';
        const pctSign = summary.returns_percentage >= 0 ? '+' : '';
        retSubEl.textContent = `Returns: ${sign}${formatCurrency(summary.total_returns)} (${pctSign}${summary.returns_percentage}%)`;
        retSubEl.className = `kpi-subtext ${summary.total_returns >= 0 ? 'text-emerald' : 'text-rose'}`;
      }

      const invEl = document.getElementById('invTotalInvested');
      if (invEl) invEl.textContent = formatCurrency(summary.total_invested);

      const sipEl = document.getElementById('invMonthlySip');
      if (sipEl) sipEl.textContent = formatCurrency(summary.monthly_sip_total) + '/mo';

      const countEl = document.getElementById('invHoldingsCount');
      if (countEl) countEl.textContent = `${summary.count} Holding${summary.count === 1 ? '' : 's'}`;

      const topAssetEl = document.getElementById('invTopAssetClass');
      if (topAssetEl) {
        if (summary.asset_breakdown && summary.asset_breakdown.length > 0) {
          topAssetEl.textContent = `Top: ${summary.asset_breakdown[0].label} (${summary.asset_breakdown[0].percentage}%)`;
        } else {
          topAssetEl.textContent = 'Diversified Across Categories';
        }
      }

      // Render Asset Allocation Donut Chart
      if (window.PaisaCharts) {
        window.PaisaCharts.renderInvestmentAllocationChart('chartInvestmentAllocation', summary.asset_breakdown, formatCurrency);
      }

      // Render Asset Allocation Progress List
      renderInvestmentAllocationBars(summary.asset_breakdown);

      // Render Holdings Table
      renderInvestmentsTable();

      // Populate goal dropdown with latest investments
      const goalInvLinked = document.getElementById('goalLinkedInvestment');
      if (goalInvLinked) {
        goalInvLinked.innerHTML = '<option value="">-- None (Track Separately) --</option>' +
          state.investments.map(i => `<option value="${i.id}">📈 ${escapeHtml(i.name)} (${formatCurrency(i.current_value)})</option>`).join('');
      }
    } catch (e) {
      console.error('Failed to load investments:', e);
    }
  }

  function renderInvestmentAllocationBars(breakdown) {
    const container = document.getElementById('investAllocationList');
    if (!container) return;
    if (!breakdown || breakdown.length === 0) {
      container.innerHTML = '<div class="empty-state-card text-center p-3 text-muted">No investments recorded yet</div>';
      return;
    }

    container.innerHTML = breakdown.map(item => `
      <div class="invest-alloc-row">
        <div class="invest-alloc-meta">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="legend-color-dot" style="background-color: ${item.color}"></span>
            <strong>${escapeHtml(item.label)}</strong>
            <span style="font-size: 11px; color: var(--text-muted);">(${item.count} asset${item.count === 1 ? '' : 's'})</span>
          </div>
          <div>
            <strong class="text-white">${formatCurrency(item.current_value)}</strong>
            <span class="wh-pill" style="margin-left: 6px;">${item.percentage}%</span>
          </div>
        </div>
        <div class="invest-alloc-bar">
          <div class="invest-alloc-fill" style="width: ${Math.min(100, item.percentage)}%; background-color: ${item.color};"></div>
        </div>
      </div>
    `).join('');
  }

  function renderInvestmentsTable() {
    const tbody = document.getElementById('investmentsTableBody');
    if (!tbody) return;

    let items = state.investments || [];
    if (state.selectedAssetFilter && state.selectedAssetFilter !== 'all') {
      items = items.filter(i => (i.asset_type || 'other') === state.selectedAssetFilter);
    }

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No investment assets match this filter</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(inv => {
      const pnl = (inv.current_value || 0) - (inv.invested_amount || 0);
      const pnlPct = (inv.invested_amount > 0) ? ((pnl / inv.invested_amount) * 100).toFixed(1) : 0;
      const isPos = pnl >= 0;
      const sign = isPos ? '+' : '';
      const typeLabel = inv.asset_type ? inv.asset_type.replace(/_/g, ' ').toUpperCase() : 'OTHER';

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: #fff; font-size: 13.5px;">${escapeHtml(inv.name)}</div>
            <span class="wh-pill" style="font-size: 10px; margin-top: 3px; display: inline-block;">${typeLabel}</span>
          </td>
          <td>
            <div style="color: var(--text-primary); font-size: 13px;">${escapeHtml(inv.platform || 'Direct')}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(inv.folio_or_account_number || '')}</div>
          </td>
          <td class="text-right" style="font-weight: 600;">
            ${formatCurrency(inv.invested_amount)}
          </td>
          <td class="text-right" style="font-weight: 700; color: #fff;">
            ${formatCurrency(inv.current_value)}
          </td>
          <td class="text-right">
            <div style="font-weight: 700;" class="${isPos ? 'text-emerald' : 'text-rose'}">
              ${sign}${formatCurrency(pnl)}
            </div>
            <div style="font-size: 11px;" class="${isPos ? 'text-emerald' : 'text-rose'}">
              ${sign}${pnlPct}%
            </div>
          </td>
          <td>
            ${inv.sip_enabled ? `
              <span class="wh-pill text-cyan" style="background: rgba(6,182,212,0.12); border-color: rgba(6,182,212,0.3);">
                🔄 ₹${Number(inv.sip_amount || 0).toLocaleString('en-IN')}/mo (Day ${inv.sip_day || 5})
              </span>
            ` : '<span class="text-muted" style="font-size: 11px;">Lumpsum</span>'}
          </td>
          <td class="text-center">
            <div style="display: inline-flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm edit-inv-btn" data-id="${inv.id}" title="Edit Investment">✏️</button>
              <button class="btn btn-danger btn-sm delete-inv-btn" data-id="${inv.id}" title="Delete Investment">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.edit-inv-btn').forEach(btn => {
      btn.onclick = () => openModalInvestment(parseInt(btn.getAttribute('data-id')));
    });

    tbody.querySelectorAll('.delete-inv-btn').forEach(btn => {
      btn.onclick = () => deleteInvestment(parseInt(btn.getAttribute('data-id')));
    });
  }

  function openModalInvestment(invId = null) {
    state.editingInvestmentId = invId;
    const modal = document.getElementById('modalInvestment');
    const form = document.getElementById('formInvestment');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('invEditId').value = invId || '';
    document.getElementById('modalInvestmentTitle').textContent = invId ? 'Edit Investment Asset' : 'Add Investment Asset';

    populateAccountDropdowns();

    const sipCheck = document.getElementById('invSipEnabled');
    const sipFields = document.getElementById('invSipFields');

    if (invId) {
      const inv = (state.investments || []).find(i => i.id === invId);
      if (inv) {
        document.getElementById('invName').value = inv.name || '';
        document.getElementById('invAssetType').value = inv.asset_type || 'mutual_fund';
        document.getElementById('invPlatform').value = inv.platform || '';
        document.getElementById('invFolio').value = inv.folio_or_account_number || '';
        document.getElementById('invInvestedAmount').value = inv.invested_amount || 0;
        document.getElementById('invCurrentValue').value = inv.current_value || 0;
        if (sipCheck) {
          sipCheck.checked = inv.sip_enabled === 1;
          if (sipFields) sipFields.style.display = sipCheck.checked ? 'block' : 'none';
        }
        document.getElementById('invSipAmount').value = inv.sip_amount || '';
        document.getElementById('invSipDay').value = inv.sip_day || 5;
        document.getElementById('invLinkedAccount').value = inv.linked_account_id || '';
        document.getElementById('invStartDate').value = inv.start_date || '';
        document.getElementById('invNotes').value = inv.notes || '';
      }
    } else {
      if (sipCheck) sipCheck.checked = false;
      if (sipFields) sipFields.style.display = 'none';
      document.getElementById('invStartDate').value = new Date().toISOString().split('T')[0];
    }

    openModal('modalInvestment');
  }

  async function handleSaveInvestment(e) {
    e.preventDefault();
    const invId = state.editingInvestmentId;
    const sipEnabled = document.getElementById('invSipEnabled')?.checked ? 1 : 0;
    const payload = {
      name: document.getElementById('invName').value.trim(),
      asset_type: document.getElementById('invAssetType').value,
      platform: document.getElementById('invPlatform').value.trim() || 'Zerodha',
      folio_or_account_number: document.getElementById('invFolio').value.trim(),
      invested_amount: parseFloat(document.getElementById('invInvestedAmount').value) || 0,
      current_value: parseFloat(document.getElementById('invCurrentValue').value) || 0,
      sip_enabled: sipEnabled,
      sip_amount: sipEnabled ? (parseFloat(document.getElementById('invSipAmount').value) || 0) : 0,
      sip_day: sipEnabled ? (parseInt(document.getElementById('invSipDay').value) || 5) : 5,
      linked_account_id: document.getElementById('invLinkedAccount').value ? parseInt(document.getElementById('invLinkedAccount').value) : null,
      start_date: document.getElementById('invStartDate').value || new Date().toISOString().split('T')[0],
      notes: document.getElementById('invNotes').value.trim()
    };

    try {
      if (invId) {
        await api(`/api/investments/${invId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Investment updated successfully', 'success');
      } else {
        await api('/api/investments', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Investment added to portfolio', 'success');
      }
      closeModal('modalInvestment');
      await loadInvestments();
      if (state.currentTab === 'dashboard') loadDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to save investment', 'error');
    }
  }

  async function deleteInvestment(invId) {
    if (!confirm('Are you sure you want to remove this investment from your portfolio?')) return;
    try {
      await api(`/api/investments/${invId}`, { method: 'DELETE' });
      showToast('Investment deleted', 'success');
      await loadInvestments();
      if (state.currentTab === 'dashboard') loadDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to delete investment', 'error');
    }
  }

  // ====================================================================
  // 9. SALARY BUDGET & LIFE PLANNER ENGINE
  // ====================================================================
  async function loadSalaryPlan() {
    try {
      const picker = document.getElementById('salaryPlanMonthPicker');
      let y = state.selectedYear;
      let m = state.selectedMonth;
      if (picker && picker.value) {
        const parts = picker.value.split('-');
        y = parseInt(parts[0]);
        m = parseInt(parts[1]);
      } else if (picker) {
        picker.value = `${y}-${m < 10 ? '0' + m : m}`;
      }

      const analysis = await api(`/api/salary-plan/analysis?year=${y}&month=${m}`);
      state.salaryPlanAnalysis = analysis;
      state.salaryPlan = analysis.plan;

      // Update Salary & Rule header labels
      const salDisplay = document.getElementById('planDisplaySalary');
      if (salDisplay) salDisplay.textContent = formatCurrency(analysis.monthly_salary);

      const ruleDisplay = document.getElementById('planDisplayRule');
      if (ruleDisplay) {
        const ruleNames = {
          '50_30_20': '50/30/20 Standard Rule',
          '60_20_20': '60/20/20 High-Needs Rule',
          'debt_focus': 'Debt Clear Focus Plan',
          'custom': 'Custom Allocation'
        };
        ruleDisplay.textContent = ruleNames[analysis.plan?.rule_type] || '50/30/20 Rule';
      }

      // Update Health Score Dial & Grade
      const scoreNum = document.getElementById('planHealthScoreNum');
      if (scoreNum) scoreNum.textContent = analysis.health_score;

      const scoreDial = document.getElementById('planHealthScoreDial');
      if (scoreDial) {
        const angle = Math.round((analysis.health_score / 100) * 360);
        scoreDial.style.setProperty('--score-angle', `${angle}deg`);
        scoreDial.style.background = `conic-gradient(${analysis.health_color} ${angle}deg, rgba(255,255,255,0.08) 0deg)`;
      }

      const gradeBadge = document.getElementById('planHealthGradeBadge');
      if (gradeBadge) {
        gradeBadge.textContent = analysis.health_grade;
        gradeBadge.style.color = analysis.health_color;
        gradeBadge.style.background = `${analysis.health_color}22`;
        gradeBadge.style.border = `1px solid ${analysis.health_color}55`;
      }

      // Render Actionable Smart Insights
      const insightsList = document.getElementById('planHealthInsightsList');
      if (insightsList) {
        if (analysis.insights && analysis.insights.length > 0) {
          insightsList.innerHTML = analysis.insights.map(ins => `<div class="insight-item">${ins}</div>`).join('');
        } else {
          insightsList.innerHTML = '<div class="insight-item">✅ All allocations are well-balanced. Keep up the disciplined budgeting!</div>';
        }
      }

      // Update Emergency Fund Cushion
      const ef = analysis.emergency_fund;
      if (ef) {
        const runwayPill = document.getElementById('planRunwayMonthsPill');
        if (runwayPill) {
          runwayPill.textContent = `${ef.runway_months} Months Runway`;
          const isSafe = ef.runway_months >= 3.0;
          runwayPill.style.color = isSafe ? '#10b981' : '#f43f5e';
          runwayPill.style.borderColor = isSafe ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)';
          runwayPill.style.background = isSafe ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)';
        }

        const curRes = document.getElementById('planCurrentReserves');
        if (curRes) curRes.textContent = formatCurrency(ef.current_liquid_reserves);

        const tgtRes = document.getElementById('planTargetReserves');
        if (tgtRes) tgtRes.textContent = formatCurrency(ef.target_amount);

        const gapRes = document.getElementById('planRunwayGap');
        if (gapRes) {
          gapRes.textContent = ef.gap > 0 ? formatCurrency(ef.gap) : 'Funded 🎉';
          gapRes.className = `ef-val ${ef.gap > 0 ? 'text-rose' : 'text-emerald'}`;
        }

        const pct = ef.target_amount > 0 ? Math.min(100, Math.round((ef.current_liquid_reserves / ef.target_amount) * 100)) : 100;
        const fill = document.getElementById('planRunwayProgressFill');
        if (fill) fill.style.width = `${pct}%`;

        const pctLabel = document.getElementById('planRunwayProgressPct');
        if (pctLabel) pctLabel.textContent = `${pct}% Funded of ${ef.target_months}-Month Target`;

        const sipText = document.getElementById('planRecommendedSipText');
        if (sipText) {
          sipText.textContent = ef.recommended_monthly_contribution > 0 ?
            `Recommended Allocation: ₹${Number(ef.recommended_monthly_contribution).toLocaleString('en-IN')}/mo` :
            'Full Cushion Maintained';
        }
      }

      // Render 4 Salary Buckets
      renderSalaryBuckets(analysis.buckets);

      // Render Financial Goals
      await loadFinancialGoals();
    } catch (e) {
      console.error('Failed to load salary plan:', e);
    }
  }

  function renderSalaryBuckets(buckets) {
    const grid = document.getElementById('salaryBucketsGrid');
    if (!grid || !buckets) return;

    grid.innerHTML = buckets.map(b => {
      const isOverspent = b.status === 'overspent';
      const isAchieved = b.status === 'achieved';
      const progressWidth = Math.min(100, b.percent_used || 0);

      let tagHtml = `<span class="bucket-tag" style="background: ${b.color}22; color: ${b.color}; border: 1px solid ${b.color}44;">Target: ${b.target_percent}%</span>`;
      if (isOverspent) {
        tagHtml = `<span class="bucket-tag text-rose" style="background: rgba(244,63,94,0.15); border: 1px solid rgba(244,63,94,0.3);">⚠️ Overspent</span>`;
      } else if (isAchieved) {
        tagHtml = `<span class="bucket-tag text-emerald" style="background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3);">🎉 Target Hit</span>`;
      }

      return `
        <div class="bucket-card" style="border-top: 3px solid ${b.color};">
          <div class="bucket-header">
            <div class="bucket-title-box">
              <span style="font-size: 16px;">${b.key === 'needs' ? '🛡️' : b.key === 'wants' ? '✨' : b.key === 'debts' ? '🏛️' : '📈'}</span>
              <span class="bucket-title">${escapeHtml(b.title)}</span>
            </div>
            ${tagHtml}
          </div>

          <div class="bucket-amount-box">
            <div class="bucket-actual">${formatCurrency(b.actual)}</div>
            <div class="bucket-target">Planned Budget: <strong>${formatCurrency(b.budget)}</strong> (${b.target_percent}%)</div>
          </div>

          <div class="bucket-progress-bar">
            <div class="bucket-progress-fill" style="width: ${progressWidth}%; background-color: ${isOverspent ? '#f43f5e' : b.color};"></div>
          </div>

          <div class="bucket-footer-stats">
            <span>Used: <strong>${b.percent_used}%</strong></span>
            <span>${b.remaining >= 0 ? 'Surplus: ' : 'Over: '}<strong>${formatCurrency(Math.abs(b.remaining))}</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }

  async function openModalSalaryPlan() {
    try {
      const plan = await api('/api/salary-plan');
      state.salaryPlan = plan;

      document.getElementById('planMonthlySalary').value = plan.monthly_salary || 75000;
      document.getElementById('planEmergencyTargetMonths').value = plan.emergency_fund_target_months || 6;

      // Update preset buttons
      const rule = plan.rule_type || '50_30_20';
      document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-rule') === rule);
      });

      // Set sliders
      const needs = plan.needs_percent != null ? plan.needs_percent : 50;
      const wants = plan.wants_percent != null ? plan.wants_percent : 30;
      const debts = plan.debts_percent != null ? plan.debts_percent : 10;
      const savings = plan.savings_percent != null ? plan.savings_percent : 10;

      document.getElementById('sliderNeeds').value = needs;
      document.getElementById('sliderWants').value = wants;
      document.getElementById('sliderDebts').value = debts;
      document.getElementById('sliderSavings').value = savings;

      updateSalarySliderLabels();
      openModal('modalSalaryPlan');
    } catch (e) {
      console.error('Failed to open salary plan modal:', e);
    }
  }

  function updateSalarySliderLabels() {
    const salary = parseFloat(document.getElementById('planMonthlySalary')?.value) || 0;
    const needs = parseFloat(document.getElementById('sliderNeeds')?.value) || 0;
    const wants = parseFloat(document.getElementById('sliderWants')?.value) || 0;
    const debts = parseFloat(document.getElementById('sliderDebts')?.value) || 0;
    const savings = parseFloat(document.getElementById('sliderSavings')?.value) || 0;

    const lblNeeds = document.getElementById('labelNeedsPct');
    if (lblNeeds) lblNeeds.textContent = `${needs}% (${formatCurrency(salary * (needs / 100))})`;

    const lblWants = document.getElementById('labelWantsPct');
    if (lblWants) lblWants.textContent = `${wants}% (${formatCurrency(salary * (wants / 100))})`;

    const lblDebts = document.getElementById('labelDebtsPct');
    if (lblDebts) lblDebts.textContent = `${debts}% (${formatCurrency(salary * (debts / 100))})`;

    const lblSavings = document.getElementById('labelSavingsPct');
    if (lblSavings) lblSavings.textContent = `${savings}% (${formatCurrency(salary * (savings / 100))})`;

    const total = needs + wants + debts + savings;
    const lblTotal = document.getElementById('labelTotalAllocation');
    if (lblTotal) {
      lblTotal.textContent = `${total}%`;
      lblTotal.className = total === 100 ? 'text-emerald' : 'text-rose';
    }
  }

  async function handleSaveSalaryPlan(e) {
    e.preventDefault();
    const salary = parseFloat(document.getElementById('planMonthlySalary').value) || 0;
    const needs = parseFloat(document.getElementById('sliderNeeds').value) || 0;
    const wants = parseFloat(document.getElementById('sliderWants').value) || 0;
    const debts = parseFloat(document.getElementById('sliderDebts').value) || 0;
    const savings = parseFloat(document.getElementById('sliderSavings').value) || 0;
    const efund = parseInt(document.getElementById('planEmergencyTargetMonths').value) || 6;

    const total = needs + wants + debts + savings;
    if (total !== 100) {
      if (!confirm(`Warning: Total allocation is ${total}% (not 100%). Do you still want to apply this budget?`)) return;
    }

    const activePreset = document.querySelector('.btn-preset.active')?.getAttribute('data-rule') || '50_30_20';

    try {
      await api('/api/salary-plan', {
        method: 'POST',
        body: JSON.stringify({
          monthly_salary: salary,
          rule_type: activePreset,
          needs_percent: needs,
          wants_percent: wants,
          debts_percent: debts,
          savings_percent: savings,
          emergency_fund_target_months: efund
        })
      });
      showToast('Salary Budget Plan applied!', 'success');
      closeModal('modalSalaryPlan');
      await loadSalaryPlan();
      if (state.currentTab === 'dashboard') loadDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to save salary plan', 'error');
    }
  }

  // ====================================================================
  // 10. FINANCIAL GOALS ENGINE
  // ====================================================================
  async function loadFinancialGoals() {
    try {
      const data = await api('/api/financial-goals');
      state.financialGoals = data.goals || [];
      renderFinancialGoalsGrid();
    } catch (e) {
      console.error('Failed to load goals:', e);
    }
  }

  function renderFinancialGoalsGrid() {
    const container = document.getElementById('financialGoalsGrid');
    if (!container) return;

    const goals = state.financialGoals || [];
    if (goals.length === 0) {
      container.innerHTML = '<div class="empty-state-card text-center p-3 text-muted">No financial goals defined yet. Click "+ Add Goal" to set a milestone!</div>';
      return;
    }

    const catIcons = {
      emergency_fund: '🛡️',
      vehicle: '🚗',
      home: '🏡',
      retirement: '🏖️',
      education: '🎓',
      vacation: '✈️',
      wealth: '💰'
    };

    container.innerHTML = goals.map(g => {
      const pct = g.target_amount > 0 ? Math.min(100, Math.round(((g.current_amount || 0) / g.target_amount) * 100)) : 0;
      const icon = catIcons[g.category] || '🎯';
      const isAchieved = (g.current_amount || 0) >= g.target_amount;

      return `
        <div class="goal-card">
          <div class="goal-card-top">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">${icon}</span>
              <h4 class="goal-title">${escapeHtml(g.title)}</h4>
            </div>
            <span class="goal-meta-pill ${g.priority === 'high' ? 'text-rose' : g.priority === 'medium' ? 'text-indigo' : 'text-muted'}" style="background: rgba(255,255,255,0.06);">
              ${g.priority || 'medium'}
            </span>
          </div>

          <div class="goal-numbers-row">
            <span class="goal-saved-val">${formatCurrency(g.current_amount)}</span>
            <span class="goal-target-val">Target: <strong>${formatCurrency(g.target_amount)}</strong></span>
          </div>

          <div class="goal-progress-bar">
            <div class="goal-progress-fill" style="width: ${pct}%; background: ${isAchieved ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #6366f1)'};"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-muted);">
            <span>${pct}% Completed</span>
            <span>${g.monthly_contribution > 0 ? `+${formatCurrency(g.monthly_contribution)}/mo` : ''}</span>
          </div>

          <div class="goal-footer-actions">
            <span class="goal-date-label">📅 Target: ${g.target_date || 'Ongoing'}</span>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm edit-goal-btn" data-id="${g.id}">✏️</button>
              <button class="btn btn-danger btn-sm delete-goal-btn" data-id="${g.id}">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.edit-goal-btn').forEach(btn => {
      btn.onclick = () => openModalGoal(parseInt(btn.getAttribute('data-id')));
    });

    container.querySelectorAll('.delete-goal-btn').forEach(btn => {
      btn.onclick = () => deleteFinancialGoal(parseInt(btn.getAttribute('data-id')));
    });
  }

  function openModalGoal(goalId = null) {
    state.editingGoalId = goalId;
    const form = document.getElementById('formFinancialGoal');
    if (!form) return;
    form.reset();

    document.getElementById('goalEditId').value = goalId || '';
    document.getElementById('modalGoalTitle').textContent = goalId ? 'Edit Financial Goal' : 'Add Financial Goal';

    // Populate investments link
    const invSelect = document.getElementById('goalLinkedInvestment');
    if (invSelect) {
      invSelect.innerHTML = '<option value="">-- None (Track Separately) --</option>' +
        (state.investments || []).map(i => `<option value="${i.id}">📈 ${escapeHtml(i.name)} (${formatCurrency(i.current_value)})</option>`).join('');
    }

    if (goalId) {
      const g = (state.financialGoals || []).find(item => item.id === goalId);
      if (g) {
        document.getElementById('goalTitle').value = g.title || '';
        document.getElementById('goalCategory').value = g.category || 'wealth';
        document.getElementById('goalPriority').value = g.priority || 'medium';
        document.getElementById('goalTargetAmount').value = g.target_amount || '';
        document.getElementById('goalCurrentAmount').value = g.current_amount || 0;
        document.getElementById('goalTargetDate').value = g.target_date || '';
        document.getElementById('goalMonthlyContribution').value = g.monthly_contribution || '';
        if (invSelect) invSelect.value = g.linked_investment_id || '';
      }
    }

    openModal('modalFinancialGoal');
  }

  async function handleSaveGoal(e) {
    e.preventDefault();
    const goalId = state.editingGoalId;
    const payload = {
      title: document.getElementById('goalTitle').value.trim(),
      category: document.getElementById('goalCategory').value,
      priority: document.getElementById('goalPriority').value,
      target_amount: parseFloat(document.getElementById('goalTargetAmount').value) || 0,
      current_amount: parseFloat(document.getElementById('goalCurrentAmount').value) || 0,
      target_date: document.getElementById('goalTargetDate').value || null,
      monthly_contribution: parseFloat(document.getElementById('goalMonthlyContribution').value) || 0,
      linked_investment_id: document.getElementById('goalLinkedInvestment').value ? parseInt(document.getElementById('goalLinkedInvestment').value) : null
    };

    try {
      if (goalId) {
        await api(`/api/financial-goals/${goalId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Financial goal updated', 'success');
      } else {
        await api('/api/financial-goals', { method: 'POST', body: JSON.stringify(payload) });
        showToast('New financial goal created!', 'success');
      }
      closeModal('modalFinancialGoal');
      await loadFinancialGoals();
    } catch (err) {
      showToast(err.message || 'Failed to save goal', 'error');
    }
  }

  async function deleteFinancialGoal(goalId) {
    if (!confirm('Are you sure you want to delete this financial goal?')) return;
    try {
      await api(`/api/financial-goals/${goalId}`, { method: 'DELETE' });
      showToast('Financial goal deleted', 'success');
      await loadFinancialGoals();
    } catch (err) {
      showToast(err.message || 'Failed to delete goal', 'error');
    }
  }

  // ====================================================================
  // CRUD & ACTION MODAL HANDLERS
  // ====================================================================

  // Category & Account Dropdown Populators
  async function populateCategoryDropdowns() {
    const catsData = await api('/api/categories');
    state.categories = catsData.categories;

    const catSelect = document.getElementById('transCategory');
    const filterCatSelect = document.getElementById('transCategoryFilter');

    if (catSelect) {
      catSelect.innerHTML = catsData.categories.map(c => `
        <option value="${c.id}" data-type="${c.type}">${escapeHtml(c.name)} (${c.type.toUpperCase()})</option>
      `).join('');
    }

    if (filterCatSelect) {
      filterCatSelect.innerHTML = '<option value="">All Categories</option>' +
        catsData.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
  }

  async function populateAccountDropdowns() {
    const accData = await api('/api/accounts');
    state.accounts = accData.accounts;

    const ids = ['transAccount', 'transDestAccount', 'repayAccount', 'borrowAccount', 'transferFromAcc', 'transferToAcc', 'transAccountFilter'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'transAccountFilter') {
        el.innerHTML = '<option value="">All Accounts</option>' +
          accData.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${formatCurrency(a.balance)})</option>`).join('');
      } else {
        el.innerHTML = accData.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${formatCurrency(a.balance)})</option>`).join('');
      }
    });

    // Populate Linked Bank Account selector (with standalone option)
    const cardLinkedEl = document.getElementById('cardLinkedAccount');
    if (cardLinkedEl) {
      cardLinkedEl.innerHTML = '<option value="">None / Standalone Card (No Account at this Bank)</option>' +
        accData.accounts.map(a => `<option value="${a.id}">🏦 ${escapeHtml(a.name)} (${formatCurrency(a.balance)}) - Auto-Pay Ready</option>`).join('');
    }

    // Populate Investment linked account
    const invLinked = document.getElementById('invLinkedAccount');
    if (invLinked) {
      invLinked.innerHTML = '<option value="">-- Select Bank (Optional) --</option>' +
        accData.accounts.map(a => `<option value="${a.id}">🏦 ${escapeHtml(a.name)} (${formatCurrency(a.balance)})</option>`).join('');
    }

    // Populate Optional Links: Cards, Loans, Borrows
    const cardsData = await api('/api/cards');
    const loansData = await api('/api/loans');
    const borrowsData = await api('/api/borrows');

    const cardLink = document.getElementById('transCardLink');
    if (cardLink) {
      cardLink.innerHTML = '<option value="">None (Standard Account)</option>' +
        cardsData.cards.map(c => {
          const addonTag = c.is_addon ? ' [Add-on • Shared Limit]' : (c.addon_count > 0 ? ` [Primary • ${c.addon_count} Add-on${c.addon_count > 1 ? 's' : ''}]` : '');
          return `<option value="${c.id}">${escapeHtml(c.card_name)} (•••• ${c.card_last4 || '0000'})${addonTag}</option>`;
        }).join('');
    }

    const loanLink = document.getElementById('transLoanLink');
    if (loanLink) {
      loanLink.innerHTML = '<option value="">None</option>' +
        loansData.loans.filter(l => l.status === 'active').map(l => `<option value="${l.id}">${escapeHtml(l.title)} (EMI: ${formatCurrency(l.emi_amount)})</option>`).join('');
    }

    const borrowLink = document.getElementById('transBorrowLink');
    if (borrowLink) {
      const allDebts = [...borrowsData.borrowed_list, ...borrowsData.lent_list];
      borrowLink.innerHTML = '<option value="">None</option>' +
        allDebts.filter(d => d.status !== 'settled').map(d => `<option value="${d.id}">${escapeHtml(d.person_name)} (${d.direction === 'borrowed' ? 'You Owe' : 'Owes You'}: ${formatCurrency(d.balance_remaining)})</option>`).join('');
    }
  }

  // Open Log New Transaction Modal
  function openAddTransaction(defaultType = 'expense') {
    document.getElementById('formTransaction').reset();
    document.getElementById('transEditId').value = '';
    document.getElementById('modalTransactionTitle').textContent = 'Log New Transaction';
    document.getElementById('transDate').value = new Date().toISOString().split('T')[0];

    // Select type pill
    setTransactionTypePill(defaultType);
    openModal('modalTransaction');
  }

  function setTransactionTypePill(type) {
    document.querySelectorAll('.type-toggle-group .type-pill').forEach(pill => {
      if (pill.getAttribute('data-type') === type) {
        pill.classList.add('active');
        pill.querySelector('input').checked = true;
      } else {
        pill.classList.remove('active');
      }
    });

    const isTransfer = type === 'transfer';
    document.getElementById('transDestAccountGroup').style.display = isTransfer ? 'block' : 'none';
    document.getElementById('transCategoryGroup').style.display = isTransfer ? 'none' : 'block';
    document.getElementById('transAccountLabel').textContent = isTransfer ? 'From Source Account *' : 'Account *';
  }

  async function editTransaction(id) {
    const trans = state.filteredTransactions.find(t => t.id === id) ||
                  state.recentTransactions.find(t => t.id === id);
    if (!trans) return;

    document.getElementById('transEditId').value = trans.id;
    document.getElementById('modalTransactionTitle').textContent = 'Edit Transaction';
    setTransactionTypePill(trans.type);
    document.getElementById('transAmount').value = trans.amount;
    document.getElementById('transDate').value = trans.date;
    document.getElementById('transCategory').value = trans.category_id || '';
    document.getElementById('transAccount').value = trans.account_id || '';
    document.getElementById('transPaymentMode').value = trans.payment_mode || 'upi';
    document.getElementById('transDescription').value = trans.description || '';
    document.getElementById('transTags').value = trans.tags || '';

    if (trans.card_id) document.getElementById('transCardLink').value = trans.card_id;
    if (trans.loan_id) document.getElementById('transLoanLink').value = trans.loan_id;
    if (trans.borrow_id) document.getElementById('transBorrowLink').value = trans.borrow_id;

    openModal('modalTransaction');
  }

  // Edit Account
  function editAccount(id) {
    const acc = state.accounts.find(a => a.id === id);
    if (!acc) return;
    document.getElementById('accountEditId').value = acc.id;
    document.getElementById('modalAccountTitle').textContent = 'Edit Account';
    document.getElementById('accName').value = acc.name;
    document.getElementById('accType').value = acc.type;
    document.getElementById('accBalance').value = acc.balance;
    document.getElementById('accInstitution').value = acc.institution_name || '';
    document.getElementById('accNumberMask').value = acc.account_number_mask || '';
    document.getElementById('accColor').value = acc.color || '#2563eb';
    openModal('modalAccount');
  }

  // Helper to configure Card modal for Add-on vs Primary Credit Cards & Billing Cycles
  function setupCardModal(card = null) {
    const parentSelect = document.getElementById('cardParentCard');
    const isAddonCheckbox = document.getElementById('cardIsAddon');
    const addonFields = document.getElementById('cardAddonFields');
    const subLimitInput = document.getElementById('cardSubLimit');
    const creditLimitInput = document.getElementById('cardCreditLimit');
    const availLimitInput = document.getElementById('cardAvailableLimit');
    const billingStartDayInput = document.getElementById('cardBillingStartDay');
    const billingDayInput = document.getElementById('cardBillingDay');
    const dueDayInput = document.getElementById('cardDueDay');
    const cardTypeSelect = document.getElementById('cardType');
    const addonWrap = document.getElementById('cardIsAddonWrap');

    // Populate primary cards options
    const primaryCards = (state.cards || []).filter(c => c.card_type === 'credit' && (!c.is_addon || c.is_addon === 0) && (!card || c.id !== card.id));
    if (parentSelect) {
      parentSelect.innerHTML = '<option value="">-- Select Primary Credit Card to share limit --</option>' +
        primaryCards.map(c => `<option value="${c.id}">${escapeHtml(c.card_name)} (•••• ${c.card_last4 || '0000'} | Limit: ${formatCurrency(c.credit_limit)})</option>`).join('');
    }

    const updateCyclePreview = () => {
      const sDay = parseInt(billingStartDayInput?.value) || 24;
      const bDay = parseInt(billingDayInput?.value) || 22;
      const dDay = parseInt(dueDayInput?.value) || 11;
      const previewEl = document.getElementById('cardCyclePreviewText');
      if (previewEl) {
        previewEl.textContent = `Cycle: ${sDay}th to ${bDay}nd → Statement generates on ${bDay}nd → Payment due on ${dDay}th (~20 days grace).`;
      }
    };

    if (billingStartDayInput) billingStartDayInput.oninput = updateCyclePreview;
    if (billingDayInput) billingDayInput.oninput = updateCyclePreview;
    if (dueDayInput) dueDayInput.oninput = updateCyclePreview;

    const syncAddonUI = () => {
      const isCredit = cardTypeSelect.value === 'credit';
      if (addonWrap) addonWrap.style.display = isCredit ? 'block' : 'none';

      const isChecked = isAddonCheckbox && isAddonCheckbox.checked && isCredit;
      if (addonFields) addonFields.style.display = isChecked ? 'block' : 'none';

      if (isChecked) {
        creditLimitInput.setAttribute('readonly', 'true');
        availLimitInput.setAttribute('readonly', 'true');
        creditLimitInput.style.opacity = '0.75';
        availLimitInput.style.opacity = '0.75';

        // Add-on cards can have independent billing cycles and due dates! Keep them editable!
        billingStartDayInput.removeAttribute('readonly');
        billingDayInput.removeAttribute('readonly');
        dueDayInput.removeAttribute('readonly');
        billingStartDayInput.style.opacity = '1';
        billingDayInput.style.opacity = '1';
        dueDayInput.style.opacity = '1';

        // Auto-fill from selected parent if new card
        if (parentSelect && parentSelect.value) {
          const p = (state.cards || []).find(c => c.id === parseInt(parentSelect.value));
          if (p) {
            creditLimitInput.value = p.credit_limit || 0;
            availLimitInput.value = p.available_limit || 0;
            if (!card) {
              if (!billingStartDayInput.value) billingStartDayInput.value = p.billing_start_day || 24;
              if (!billingDayInput.value) billingDayInput.value = p.billing_day || 22;
              if (!dueDayInput.value) dueDayInput.value = p.due_day || 11;
            }
          }
        }
      } else {
        creditLimitInput.removeAttribute('readonly');
        availLimitInput.removeAttribute('readonly');
        billingStartDayInput.removeAttribute('readonly');
        billingDayInput.removeAttribute('readonly');
        dueDayInput.removeAttribute('readonly');
        creditLimitInput.style.opacity = '1';
        availLimitInput.style.opacity = '1';
        billingStartDayInput.style.opacity = '1';
        billingDayInput.style.opacity = '1';
        dueDayInput.style.opacity = '1';
      }
      updateCyclePreview();
    };

    if (isAddonCheckbox) isAddonCheckbox.onchange = syncAddonUI;
    if (parentSelect) parentSelect.onchange = syncAddonUI;
    if (cardTypeSelect) cardTypeSelect.onchange = syncAddonUI;

    if (card) {
      if (isAddonCheckbox) isAddonCheckbox.checked = Boolean(card.is_addon && card.parent_card_id);
      if (parentSelect) parentSelect.value = card.parent_card_id || '';
      if (subLimitInput) subLimitInput.value = card.sub_limit || '';
      const cardLinkedEl = document.getElementById('cardLinkedAccount');
      if (cardLinkedEl) cardLinkedEl.value = card.account_id || '';
    } else {
      if (isAddonCheckbox) isAddonCheckbox.checked = false;
      if (parentSelect) parentSelect.value = '';
      if (subLimitInput) subLimitInput.value = '';
      if (billingStartDayInput) billingStartDayInput.value = 24;
      if (billingDayInput) billingDayInput.value = 22;
      if (dueDayInput) dueDayInput.value = 11;
      const cardLinkedEl = document.getElementById('cardLinkedAccount');
      if (cardLinkedEl) cardLinkedEl.value = '';
    }

    syncAddonUI();
    updateCyclePreview();
  }

  // Edit Card
  function editCard(id) {
    const card = state.cards.find(c => c.id === id);
    if (!card) return;
    document.getElementById('cardEditId').value = card.id;
    document.getElementById('modalCardTitle').textContent = 'Edit Card';
    document.getElementById('cardName').value = card.card_name;
    document.getElementById('cardType').value = card.card_type;
    document.getElementById('cardNetwork').value = card.card_network || 'visa';
    document.getElementById('cardLast4').value = card.card_last4 || '';
    document.getElementById('cardCreditLimit').value = card.credit_limit || 0;
    document.getElementById('cardAvailableLimit').value = card.available_limit || 0;
    document.getElementById('cardBillingStartDay').value = card.billing_start_day || 24;
    document.getElementById('cardBillingDay').value = card.billing_day || 22;
    document.getElementById('cardDueDay').value = card.due_day || 11;
    document.getElementById('cardLinkedAccount').value = card.account_id || '';
    setupCardModal(card);
    openModal('modalCard');
  }

  // Open Billing Cycles & Statement Inspector Modal
  async function openBillingCycleModal(cardId) {
    try {
      const data = await api(`/api/cards/${cardId}/billing-cycles`);
      if (!data) return;

      const titleEl = document.getElementById('billingCycleCardName');
      const metaEl = document.getElementById('billingCycleCardMeta');
      if (titleEl) titleEl.textContent = `${data.card_name} (•••• ${data.card_last4 || '0000'})`;
      if (metaEl) {
        let metaText = `Type: ${data.card_type.toUpperCase()} | Network: ${data.card_network.toUpperCase()}`;
        if (data.is_addon && data.parent_card_name) {
          metaText += ` | Add-on Card (Shares limit with ${data.parent_card_name})`;
        } else {
          metaText += ` | Limit: ${formatCurrency(data.credit_limit)}`;
        }
        metaText += ` | Cycle: ${data.billing_start_day}th to ${data.billing_day}nd | Stmt: ${data.billing_day}nd | Due: ${data.due_day}th`;
        metaEl.textContent = metaText;
      }

      // Timeline Flow
      const curr = data.current_cycle;
      const prev = data.previous_cycle;
      const nxt = data.next_cycle;

      document.getElementById('cycleStartDayLabel').textContent = curr.start_date ? new Date(curr.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : `${data.billing_start_day}`;
      document.getElementById('cycleStmtDayLabel').textContent = curr.statement_date ? new Date(curr.statement_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : `${data.billing_day}`;
      document.getElementById('cycleDueDayLabel').textContent = curr.due_date ? new Date(curr.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : `${data.due_day}`;

      // Progress bar between start and statement date
      if (curr.start_date && curr.statement_date) {
        const dStart = new Date(curr.start_date).getTime();
        const dEnd = new Date(curr.statement_date).getTime();
        const dToday = Date.now();
        const totalDuration = Math.max(1, dEnd - dStart);
        const elapsed = Math.max(0, Math.min(totalDuration, dToday - dStart));
        const pct = Math.round((elapsed / totalDuration) * 100);
        document.getElementById('cycleProgressFill').style.width = `${pct}%`;
      }

      // 1. Previous Cycle Pane
      const prevBadge = document.getElementById('prevCycleStatusBadge');
      if (prevBadge) {
        prevBadge.textContent = prev.status_label || prev.status;
        prevBadge.style.background = prev.status_color || '#10b981';
        prevBadge.style.color = '#fff';
      }
      document.getElementById('prevCycleDates').textContent = prev.cycle_range || `${prev.start_date} to ${prev.end_date}`;
      document.getElementById('prevCycleAmount').textContent = formatCurrency(prev.billed_amount || 0);
      document.getElementById('prevCycleStmtDate').textContent = prev.statement_date_formatted || prev.statement_date;
      document.getElementById('prevCycleDueDate').textContent = prev.due_date_formatted || prev.due_date;

      const prevPayBtn = document.getElementById('prevCyclePayBtn');
      if (prevPayBtn) {
        if (prev.net_due_amount > 0) {
          prevPayBtn.style.display = 'inline-block';
          prevPayBtn.textContent = `💳 Pay Statement (${formatCurrency(prev.net_due_amount)})`;
          prevPayBtn.onclick = () => {
            closeModal('modalBillingCycle');
            openPayCardFlow(cardId, data.card_name, prev.net_due_amount, data.account_id);
          };
        } else {
          prevPayBtn.style.display = 'none';
        }
      }

      const prevTxList = document.getElementById('prevCycleTxList');
      if (prevTxList) {
        if (!prev.transactions || prev.transactions.length === 0) {
          prevTxList.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); padding: 10px; text-align: center;">No transactions in this statement period.</div>';
        } else {
          prevTxList.innerHTML = prev.transactions.map(t => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.03); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05); font-size: 12px;">
              <div>
                <span style="font-weight: 600; color: #f1f5f9;">${escapeHtml(t.description || 'Card Spend')}</span>
                <div style="font-size: 10.5px; color: #94a3b8;">${t.date} • ${escapeHtml(t.category_name || 'Expense')}</div>
              </div>
              <span style="font-weight: 700; color: #f43f5e;">-${formatCurrency(t.amount)}</span>
            </div>
          `).join('');
        }
      }

      // 2. Current Cycle Pane
      const currBadge = document.getElementById('currCycleStatusBadge');
      if (currBadge) {
        currBadge.textContent = curr.status_label || curr.status;
        currBadge.style.background = curr.status_color || '#38bdf8';
        currBadge.style.color = '#fff';
      }
      document.getElementById('currCycleDates').textContent = curr.cycle_range || `${curr.start_date} to ${curr.end_date}`;
      document.getElementById('currCycleAmount').textContent = formatCurrency(curr.billed_amount || 0);
      document.getElementById('currCycleStmtDate').textContent = curr.statement_date_formatted || curr.statement_date;
      document.getElementById('currCycleDueDate').textContent = curr.due_date_formatted || curr.due_date;
      document.getElementById('currCycleDaysLeft').textContent = curr.days_to_statement > 0 ? `Bill generates in ${curr.days_to_statement} days` : 'Billing generated';

      const currTxList = document.getElementById('currCycleTxList');
      if (currTxList) {
        if (!curr.transactions || curr.transactions.length === 0) {
          currTxList.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); padding: 10px; text-align: center;">No unbilled transactions yet in this cycle.</div>';
        } else {
          currTxList.innerHTML = curr.transactions.map(t => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.03); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05); font-size: 12px;">
              <div>
                <span style="font-weight: 600; color: #f1f5f9;">${escapeHtml(t.description || 'Card Spend')}</span>
                <div style="font-size: 10.5px; color: #94a3b8;">${t.date} • ${escapeHtml(t.category_name || 'Expense')}</div>
              </div>
              <span style="font-weight: 700; color: #f43f5e;">-${formatCurrency(t.amount)}</span>
            </div>
          `).join('');
        }
      }

      // 3. Next Cycle Pane
      document.getElementById('nextCycleDates').textContent = nxt.cycle_range || `${nxt.start_date} to ${nxt.end_date}`;
      document.getElementById('nextCycleStmtDate').textContent = nxt.statement_date_formatted || nxt.statement_date;
      document.getElementById('nextCycleDueDate').textContent = nxt.due_date_formatted || nxt.due_date;
      document.getElementById('nextCycleStartTip').textContent = nxt.start_date ? new Date(nxt.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Next Cycle Start';
      document.getElementById('nextCycleGraceTip').textContent = `${nxt.interest_free_days || 48} days`;
      document.getElementById('nextCycleDueTip').textContent = nxt.due_date_formatted || nxt.due_date;

      // Tab switcher
      const tabBtns = document.querySelectorAll('.cycle-tab-btn');
      const panes = document.querySelectorAll('.cycle-pane');
      tabBtns.forEach(btn => {
        btn.onclick = () => {
          tabBtns.forEach(b => b.classList.remove('active'));
          panes.forEach(p => p.style.display = 'none');
          btn.classList.add('active');
          const targetId = btn.getAttribute('data-cycle-target');
          const targetPane = document.getElementById(targetId);
          if (targetPane) targetPane.style.display = 'block';
        };
      });

      // Default active tab
      if (prev.billed_amount === 0 && curr.billed_amount > 0) {
        document.getElementById('tabCurrCycle')?.click();
      } else {
        document.getElementById('tabPrevCycle')?.click();
      }

      openModal('modalBillingCycle');
    } catch (err) {
      console.error('Failed to load billing cycles', err);
      showToast('Error loading billing cycle details', 'danger');
    }
  }

  // Edit Loan
  function editLoan(id) {
    const loan = state.loans.find(l => l.id === id);
    if (!loan) return;
    document.getElementById('loanEditId').value = loan.id;
    document.getElementById('modalLoanTitle').textContent = 'Edit Loan';
    document.getElementById('loanTitle').value = loan.title;
    document.getElementById('loanType').value = loan.loan_type;
    document.getElementById('loanLender').value = loan.lender_name || '';
    document.getElementById('loanPrincipal').value = loan.principal_amount;
    document.getElementById('loanCurrentBal').value = loan.current_balance;
    document.getElementById('loanEmi').value = loan.emi_amount;
    document.getElementById('loanDueDay').value = loan.emi_due_day || 5;
    document.getElementById('loanInterest').value = loan.interest_rate || 0;
    openModal('modalLoan');
  }

  function updateBorrowModalDirectionUI(dir) {
    const isBorrow = dir === 'borrowed';
    const labelEl = document.getElementById('borrowAccountLabel');
    const noticeEl = document.getElementById('borrowSyncNoticeText');
    const noticeBox = document.getElementById('borrowSyncNoticeBox');

    if (labelEl) {
      labelEl.textContent = isBorrow ? 'Bank Account / Wallet Received Into *' : 'Bank Account / Wallet Lent From *';
    }
    if (noticeEl) {
      noticeEl.innerHTML = isBorrow
        ? '💡 <strong>Bank Account Sync</strong>: Money borrowed will be credited (+) to this account balance and recorded as an <strong>Inflow</strong> in your Transactions history.'
        : '💡 <strong>Bank Account Sync</strong>: Money lent will be debited (-) from this account balance and recorded as an <strong>Outflow</strong> in your Transactions history.';
    }
    if (noticeBox) {
      noticeBox.style.borderColor = isBorrow ? 'rgba(16, 185, 129, 0.35)' : 'rgba(225, 29, 72, 0.35)';
      noticeBox.style.background = isBorrow ? 'rgba(16, 185, 129, 0.12)' : 'rgba(225, 29, 72, 0.12)';
      noticeBox.style.color = isBorrow ? '#a7f3d0' : '#fecdd3';
    }
  }

  function openAddBorrow(preferredDir) {
    document.getElementById('formBorrow').reset();
    document.getElementById('borrowEditId').value = '';
    document.getElementById('modalBorrowTitle').textContent = 'Record Borrow / Lent (Friends & Relatives)';
    document.getElementById('borrowDate').value = new Date().toISOString().split('T')[0];

    const dir = preferredDir || state.debtDirectionTab || 'borrowed';
    document.querySelectorAll('.type-toggle-group [data-dir]').forEach(p => {
      if (p.getAttribute('data-dir') === dir) {
        p.classList.add('active');
        p.querySelector('input').checked = true;
      } else {
        p.classList.remove('active');
      }
    });
    updateBorrowModalDirectionUI(dir);
    openModal('modalBorrow');
  }

  // Edit Borrow
  function editBorrow(id) {
    const allDebts = [...state.debts.borrowed_list, ...state.debts.lent_list];
    const borrow = allDebts.find(d => d.id === id);
    if (!borrow) return;

    document.getElementById('borrowEditId').value = borrow.id;
    document.getElementById('modalBorrowTitle').textContent = 'Edit Debt Record';
    document.querySelectorAll('.type-toggle-group [data-dir]').forEach(p => {
      if (p.getAttribute('data-dir') === borrow.direction) {
        p.classList.add('active');
        p.querySelector('input').checked = true;
      } else {
        p.classList.remove('active');
      }
    });
    document.getElementById('borrowPerson').value = borrow.person_name;
    document.getElementById('borrowRelationship').value = borrow.relationship || 'friend';
    document.getElementById('borrowPrincipal').value = borrow.principal_amount;
    document.getElementById('borrowRemaining').value = borrow.balance_remaining;
    document.getElementById('borrowDate').value = borrow.transaction_date;
    document.getElementById('borrowDueDate').value = borrow.due_date || '';
    if (borrow.account_id && document.getElementById('borrowAccount')) {
      document.getElementById('borrowAccount').value = borrow.account_id;
    }
    if (borrow.payment_mode && document.getElementById('borrowPaymentMode')) {
      document.getElementById('borrowPaymentMode').value = borrow.payment_mode;
    }
    document.getElementById('borrowPhone').value = borrow.phone || '';
    document.getElementById('borrowNotes').value = borrow.notes || '';
    updateBorrowModalDirectionUI(borrow.direction);
    openModal('modalBorrow');
  }

  // Settle Debt Modal
  function openSettleDebtModal(id, name, dir, balance) {
    document.getElementById('repayBorrowId').value = id;
    document.getElementById('repayAmount').value = balance;
    document.getElementById('repayDate').value = new Date().toISOString().split('T')[0];

    const isBorrow = dir === 'borrowed';
    document.getElementById('repayPersonInfo').innerHTML = `
      <div class="debt-counter-badge ${isBorrow ? 'payable' : 'receivable'} mb-3">
        <span>${isBorrow ? 'You are repaying to:' : 'Receiving repayment from:'}</span>
        <strong>${escapeHtml(name)}</strong>
        <small>Total Balance Remaining: ${formatCurrency(balance)}</small>
      </div>
    `;
    openModal('modalRepay');
  }

  // Pay Card Flow
  function openPayCardFlow(cardId, cardName, due, linkedAccountId = null) {
    openAddTransaction('expense');
    document.getElementById('transAmount').value = due;
    document.getElementById('transDescription').value = `Credit card bill payment for ${cardName}`;
    document.getElementById('transCardLink').value = cardId;
    document.getElementById('transPaymentMode').value = 'netbanking';
    if (linkedAccountId) {
      const accSelect = document.getElementById('transAccount');
      if (accSelect) accSelect.value = linkedAccountId;
    }
  }

  // Pay Loan EMI Flow
  function openPayLoanEmiFlow(loanId, loanTitle, emi) {
    openAddTransaction('expense');
    document.getElementById('transAmount').value = emi;
    document.getElementById('transDescription').value = `Monthly EMI for ${loanTitle}`;
    document.getElementById('transLoanLink').value = loanId;
  }

  // Carryover Wizard Modal
  async function openCarryoverWizard() {
    const data = await api(`/api/carryover?year=${state.selectedYear}&month=${state.selectedMonth}`);
    document.getElementById('carryoverCustomAmount').value = data.closing_balance;
    document.getElementById('carryoverWizardSummary').innerHTML = `
      <div class="formula-card highlight mb-3">
        <h4>Month-End Closing Balance:</h4>
        <div class="amount-val text-emerald" style="font-size: 26px;">${formatCurrency(data.closing_balance)}</div>
        <p>This entire surplus balance will be carried forward as the opening balance for next month.</p>
      </div>
    `;
    openModal('modalCarryoverWizard');
  }

  // Escape HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ====================================================================
  // Dummy & Sample Data Management Engine
  // ====================================================================
  async function checkDataStatus() {
    try {
      const isDemo = Boolean(state.currentUser && (state.currentUser.is_demo || state.currentUser.username === 'demo' || state.currentUser.email === 'demo@paisatrack.com'));

      const quickBtn = document.getElementById('quickToggleDemoBtn');
      const drawerBtn = document.getElementById('drawerToggleDemoBtn');
      const demoCards = document.querySelectorAll('.demo-data-control-card');

      if (!isDemo) {
        if (quickBtn) quickBtn.style.display = 'none';
        if (drawerBtn) drawerBtn.style.setProperty('display', 'none', 'important');
        demoCards.forEach(card => card.style.setProperty('display', 'none', 'important'));
        return;
      }

      if (quickBtn) quickBtn.style.display = 'flex';
      if (drawerBtn) drawerBtn.style.setProperty('display', 'flex', 'important');
      demoCards.forEach(card => card.style.setProperty('display', 'block', 'important'));

      const status = await api('/api/data-status');
      state.hasDummyData = status.has_dummy_data;

      // Update Header Quick Button
      const quickIcon = document.getElementById('quickDemoIcon');
      const quickText = document.getElementById('quickDemoText');
      if (quickIcon && quickText) {
        quickIcon.textContent = status.has_dummy_data ? '🗑️' : '✨';
        quickText.textContent = status.has_dummy_data ? 'Remove Dummy Data' : 'Add Dummy Data';
      }
      if (quickBtn) {
        quickBtn.title = status.has_dummy_data ? 'Remove sample data and start fresh' : 'Load sample dummy data';
        if (status.has_dummy_data) {
          quickBtn.classList.remove('btn-primary');
          quickBtn.classList.add('btn-secondary');
        } else {
          quickBtn.classList.remove('btn-secondary');
          quickBtn.classList.add('btn-primary');
        }
      }

      // Update Mobile Drawer Button
      const drawerIcon = document.getElementById('drawerDemoIcon');
      const drawerText = document.getElementById('drawerDemoText');
      if (drawerIcon && drawerText) {
        drawerIcon.textContent = status.has_dummy_data ? '🗑️' : '✨';
        drawerText.textContent = status.has_dummy_data ? 'Remove Dummy Data' : 'Add Dummy Data';
      }

      // Update Settings Badge
      const badge = document.getElementById('dataStatusBadge');
      if (badge) {
        if (status.has_dummy_data) {
          badge.className = 'badge badge-amber';
          badge.textContent = `Sample Dummy Data Active (${status.transaction_count} Trans, ${status.card_count} Cards)`;
        } else {
          badge.className = 'badge badge-emerald';
          badge.textContent = 'Clean Slate (0 Dummy Records)';
        }
      }
    } catch (err) {
      console.error('Failed to check data status:', err);
    }
  }

  async function removeDummyData() {
    const confirmed = window.confirm(
      'Are you sure you want to remove all dummy data?\n\n' +
      'This will clear sample transactions, demo credit cards, loans, and friend debts so you have a clean slate to track your real personal finances.\n\n' +
      'All categories and a clean starter account with ₹0 balance will be preserved.'
    );
    if (!confirmed) return;

    try {
      const res = await api('/api/clear-demo', { method: 'POST' });
      showToast(res.message || 'Dummy data removed! Clean slate ready.', 'success');
      await refreshAllDataViews();
    } catch (err) {
      console.error('Failed to remove dummy data:', err);
    }
  }

  async function addDummyData() {
    const confirmed = window.confirm(
      'Restore realistic Indian sample dummy data?\n\n' +
      'This will populate sample bank accounts (HDFC, SBI), credit cards (Regalia, Amazon Pay), Add-on cards, car loans, cousin debt, Swiggy, Zepto, and salary records to explore charts and reports.'
    );
    if (!confirmed) return;

    try {
      const res = await api('/api/reset-demo', { method: 'POST' });
      showToast(res.message || 'Sample dummy data loaded!', 'success');
      await refreshAllDataViews();
    } catch (err) {
      console.error('Failed to add dummy data:', err);
    }
  }

  async function refreshAllDataViews() {
    await loadProfiles();
    await checkDataStatus();
    await loadDashboard();
    if (state.currentTab === 'transactions') loadTransactions();
    if (state.currentTab === 'accounts') loadAccounts();
    if (state.currentTab === 'debts') loadDebts();
    if (state.currentTab === 'investments') loadInvestments();
    if (state.currentTab === 'salaryplan') loadSalaryPlan();
    if (state.currentTab === 'reports') loadReports();
    if (state.currentTab === 'carryover') loadCarryover();
  }

  // ====================================================================
  // INITIALIZATION & EVENT LISTENERS
  // ====================================================================
  function initEvents() {
    // Mobile Drawer Open & Close
    const drawerBackdrop = document.getElementById('mobileDrawerBackdrop');
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
      drawerBackdrop?.classList.add('open');
    });
    document.getElementById('closeDrawerBtn')?.addEventListener('click', () => {
      drawerBackdrop?.classList.remove('open');
    });
    drawerBackdrop?.addEventListener('click', (e) => {
      if (e.target === drawerBackdrop) drawerBackdrop.classList.remove('open');
    });
    document.querySelectorAll('.mobile-drawer-nav .nav-link').forEach(btn => {
      btn.addEventListener('click', () => {
        drawerBackdrop?.classList.remove('open');
      });
    });

    // Nav link click events (Desktop Sidebar & Mobile Bottom Bar)
    document.querySelectorAll('.nav-link, .bottom-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // Links inside cards (View All buttons)
    document.querySelectorAll('.btn-link[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // Mobile FAB and Header Add Button
    document.getElementById('mobileFabBtn')?.addEventListener('click', () => openAddTransaction('expense'));
    document.getElementById('headerAddBtn')?.addEventListener('click', () => openAddTransaction('expense'));

    // Quick Action Buttons on Dashboard
    document.getElementById('quickAddExpenseBtn')?.addEventListener('click', () => openAddTransaction('expense'));
    document.getElementById('quickAddIncomeBtn')?.addEventListener('click', () => openAddTransaction('income'));
    document.getElementById('quickAddTransferBtn')?.addEventListener('click', () => openModal('modalTransfer'));
    document.getElementById('quickAddBorrowBtn')?.addEventListener('click', () => openAddBorrow('borrowed'));
    document.getElementById('quickPayEmiBtn')?.addEventListener('click', () => switchTab('debts'));

    // Mobile Dashboard Segment Switcher
    function switchMobileSegment(seg) {
      const dashView = document.getElementById('viewDashboard');
      if (dashView) {
        dashView.setAttribute('data-active-segment', seg);
      }
      document.querySelectorAll('#mobileDashSegmentNav .mobile-segment-tab').forEach(b => {
        if (b.getAttribute('data-dash-segment') === seg) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      if (seg === 'analytics') {
        setTimeout(() => window.PaisaCharts?.redrawAll(), 50);
      }
    }
    window.switchMobileSegment = switchMobileSegment;

    const dashView = document.getElementById('viewDashboard');
    if (dashView) {
      dashView.setAttribute('data-active-segment', 'overview');
    }
    document.querySelectorAll('#mobileDashSegmentNav .mobile-segment-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const seg = btn.getAttribute('data-dash-segment') || 'overview';
        switchMobileSegment(seg);
      });
    });

    // Mobile Settings Segment Switcher
    function switchMobileSettingsSegment(seg) {
      const settingsView = document.getElementById('viewSettings');
      if (settingsView) {
        settingsView.setAttribute('data-active-segment', seg);
      }
      document.querySelectorAll('#mobileSettingsSegmentNav .mobile-segment-tab').forEach(b => {
        if (b.getAttribute('data-settings-segment') === seg) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      const body = document.querySelector('.content-body');
      if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.switchMobileSettingsSegment = switchMobileSettingsSegment;

    document.querySelectorAll('#mobileSettingsSegmentNav .mobile-segment-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const seg = btn.getAttribute('data-settings-segment') || 'all';
        switchMobileSettingsSegment(seg);
      });
    });

    // Section Add Buttons
    document.getElementById('openAddTransactionBtn')?.addEventListener('click', () => openAddTransaction('expense'));
    document.getElementById('openAddAccountBtn')?.addEventListener('click', () => {
      document.getElementById('formAccount').reset();
      document.getElementById('accountEditId').value = '';
      openModal('modalAccount');
    });
    document.getElementById('openAddCardBtn')?.addEventListener('click', () => {
      document.getElementById('formCard').reset();
      document.getElementById('cardEditId').value = '';
      document.getElementById('modalCardTitle').textContent = 'Add Credit or Debit Card';
      setupCardModal(null);
      openModal('modalCard');
    });
    document.getElementById('openAddLoanBtn')?.addEventListener('click', () => {
      document.getElementById('formLoan').reset();
      document.getElementById('loanEditId').value = '';
      openModal('modalLoan');
    });
    document.getElementById('openAddBorrowBtn')?.addEventListener('click', () => openAddBorrow());
    document.getElementById('openTransferModalBtn')?.addEventListener('click', () => openModal('modalTransfer'));
    document.getElementById('openAddCategoryBtn')?.addEventListener('click', () => openModal('modalCategory'));
    document.getElementById('openCarryoverWizardBtn')?.addEventListener('click', openCarryoverWizard);
    document.getElementById('executeCarryoverActionBtn')?.addEventListener('click', openCarryoverWizard);

    // Modal Close Buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close')));
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal(backdrop.id);
      });
    });

    // Type Toggle Pills in Transaction Modal
    document.querySelectorAll('.type-toggle-group .type-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const type = pill.getAttribute('data-type') || pill.getAttribute('data-dir');
        if (type) {
          if (pill.hasAttribute('data-type')) setTransactionTypePill(type);
          else {
            document.querySelectorAll('.type-toggle-group [data-dir]').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            pill.querySelector('input').checked = true;
            updateBorrowModalDirectionUI(type);
          }
        }
      });
    });

    // Accordion in Transaction Modal
    document.getElementById('toggleOptionalLinks')?.addEventListener('click', () => {
      const content = document.getElementById('optionalLinksContent');
      if (content) {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
      }
    });

    // Debt direction sub-tabs
    document.getElementById('debtTabBorrowed')?.addEventListener('click', () => {
      state.debtDirectionTab = 'borrowed';
      document.getElementById('debtTabBorrowed').classList.add('active');
      document.getElementById('debtTabLent').classList.remove('active');
      renderDebtsTable();
    });
    document.getElementById('debtTabLent')?.addEventListener('click', () => {
      state.debtDirectionTab = 'lent';
      document.getElementById('debtTabLent').classList.add('active');
      document.getElementById('debtTabBorrowed').classList.remove('active');
      renderDebtsTable();
    });

    // Reports sub-tabs
    document.getElementById('subTabMonthWise')?.addEventListener('click', () => {
      state.reportSubTab = 'month';
      document.getElementById('subTabMonthWise').classList.add('active');
      document.getElementById('subTabDayWise').classList.remove('active');
      document.getElementById('subViewMonthWise').classList.add('active');
      document.getElementById('subViewDayWise').classList.remove('active');
      loadReports();
    });
    document.getElementById('subTabDayWise')?.addEventListener('click', () => {
      state.reportSubTab = 'day';
      document.getElementById('subTabDayWise').classList.add('active');
      document.getElementById('subTabMonthWise').classList.remove('active');
      document.getElementById('subViewDayWise').classList.add('active');
      document.getElementById('subViewMonthWise').classList.remove('active');
      loadReports();
    });

    // Currency selector
    const currSelect = document.getElementById('currencySelect');
    const settingsCurrSelect = document.getElementById('settingsCurrencySelect');

    const handleCurrencyChange = async (newCode) => {
      if (!state.availableCurrencies[newCode]) return;
      state.currency = newCode;
      state.currencySymbol = state.availableCurrencies[newCode].symbol;
      state.currencyRate = state.availableCurrencies[newCode].rate;

      if (currSelect) currSelect.value = newCode;
      if (settingsCurrSelect) settingsCurrSelect.value = newCode;

      await api('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ currency_code: newCode })
      });

      showToast(`Switched currency to ${newCode} (${state.currencySymbol})`, 'info');
      switchTab(state.currentTab);
    };

    currSelect?.addEventListener('change', (e) => handleCurrencyChange(e.target.value));
    settingsCurrSelect?.addEventListener('change', (e) => handleCurrencyChange(e.target.value));

    // Filters event listeners
    document.getElementById('transSearchInput')?.addEventListener('input', debounce(loadTransactions, 300));
    document.getElementById('transTypeFilter')?.addEventListener('change', loadTransactions);
    document.getElementById('transCategoryFilter')?.addEventListener('change', loadTransactions);
    document.getElementById('transAccountFilter')?.addEventListener('change', loadTransactions);
    document.getElementById('transMonthFilter')?.addEventListener('change', loadTransactions);
    document.getElementById('reportMonthPicker')?.addEventListener('change', loadReports);
    document.getElementById('carryoverMonthPicker')?.addEventListener('change', loadCarryover);
    document.getElementById('recalcCarryoverBtn')?.addEventListener('click', loadCarryover);

    // Export buttons
    document.getElementById('exportReportCsvBtn')?.addEventListener('click', () => {
      window.location.href = '/api/reports/export?format=csv';
    });
    document.getElementById('exportReportJsonBtn')?.addEventListener('click', () => {
      window.location.href = '/api/reports/export?format=json';
    });

    // Dummy Data Management Action Listeners
    document.getElementById('removeDemoDataBtn')?.addEventListener('click', removeDummyData);
    document.getElementById('resetDemoDataBtn')?.addEventListener('click', addDummyData);

    document.getElementById('quickToggleDemoBtn')?.addEventListener('click', () => {
      if (state.hasDummyData) {
        removeDummyData();
      } else {
        addDummyData();
      }
    });

    document.getElementById('drawerToggleDemoBtn')?.addEventListener('click', () => {
      document.getElementById('mobileDrawerBackdrop')?.classList.remove('open');
      if (state.hasDummyData) {
        removeDummyData();
      } else {
        addDummyData();
      }
    });

    // Multi-Profile UI and Switcher Events
    document.getElementById('activeProfileBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleProfileDropdown();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#profileSwitcherWrap')) {
        closeProfileDropdown();
      }
    });

    document.getElementById('menuManageProfilesBtn')?.addEventListener('click', () => {
      closeProfileDropdown();
      renderManageProfilesModal();
      openModal('modalManageProfiles');
    });

    document.getElementById('sidebarSwitchProfileBtn')?.addEventListener('click', () => {
      renderManageProfilesModal();
      openModal('modalManageProfiles');
    });

    document.getElementById('drawerSwitchProfileBtn')?.addEventListener('click', () => {
      document.getElementById('mobileDrawerBackdrop')?.classList.remove('open');
      renderManageProfilesModal();
      openModal('modalManageProfiles');
    });

    document.getElementById('menuAddProfileBtn')?.addEventListener('click', () => {
      closeProfileDropdown();
      openProfileFormModal(null);
    });

    document.getElementById('modalOpenAddProfileBtn')?.addEventListener('click', () => {
      openProfileFormModal(null);
    });

    document.getElementById('settingsAddProfileBtn')?.addEventListener('click', () => {
      openProfileFormModal(null);
    });

    // Profile Color Swatches Click
    document.querySelectorAll('#colorPresetSwatches .swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        const input = document.getElementById('profileFormColor');
        if (input) input.value = color;
        updateColorSwatchesActive(color);
      });
    });

    document.getElementById('profileFormColor')?.addEventListener('input', (e) => {
      updateColorSwatchesActive(e.target.value);
    });

    // Profile Icon Selector Click
    document.querySelectorAll('#profileIconSelector .icon-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const icon = btn.dataset.icon;
        const input = document.getElementById('profileFormIcon');
        if (input) input.value = icon;
        updateIconGridActive(icon);
      });
    });

    // Profile Form Cancel Button
    document.getElementById('cancelProfileBtn')?.addEventListener('click', () => {
      closeModal('modalProfileForm');
    });

    // Profile Form Submit
    document.getElementById('formProfile')?.addEventListener('submit', handleProfileFormSubmit);

    // Form Submissions
    initFormHandlers();
  }

  function initFormHandlers() {
    // 1. Transaction Form Submit
    document.getElementById('formTransaction')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('transEditId').value;
      const type = document.querySelector('input[name="transType"]:checked').value;
      const amount = parseFloat(document.getElementById('transAmount').value);
      const date = document.getElementById('transDate').value;
      const category_id = document.getElementById('transCategory').value ? parseInt(document.getElementById('transCategory').value) : null;
      const account_id = document.getElementById('transAccount').value ? parseInt(document.getElementById('transAccount').value) : null;
      const destination_account_id = document.getElementById('transDestAccount').value ? parseInt(document.getElementById('transDestAccount').value) : null;
      const card_id = document.getElementById('transCardLink').value ? parseInt(document.getElementById('transCardLink').value) : null;
      const loan_id = document.getElementById('transLoanLink').value ? parseInt(document.getElementById('transLoanLink').value) : null;
      const borrow_id = document.getElementById('transBorrowLink').value ? parseInt(document.getElementById('transBorrowLink').value) : null;
      const payment_mode = document.getElementById('transPaymentMode').value;
      const description = document.getElementById('transDescription').value;
      const tags = document.getElementById('transTags').value;

      const payload = {
        date, type, amount, category_id, account_id, destination_account_id,
        card_id, loan_id, borrow_id, payment_mode, description, tags
      };

      if (editId) {
        await api(`/api/transactions/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Transaction updated', 'success');
      } else {
        await api('/api/transactions', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Transaction saved', 'success');
      }

      closeModal('modalTransaction');
      loadDashboard();
      if (state.currentTab === 'transactions') loadTransactions();
    });

    // 2. Account Form Submit
    document.getElementById('formAccount')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('accountEditId').value;
      const payload = {
        name: document.getElementById('accName').value,
        type: document.getElementById('accType').value,
        balance: parseFloat(document.getElementById('accBalance').value) || 0,
        institution_name: document.getElementById('accInstitution').value,
        account_number_mask: document.getElementById('accNumberMask').value,
        color: document.getElementById('accColor').value
      };

      if (editId) {
        await api(`/api/accounts/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Account modified', 'success');
      } else {
        await api('/api/accounts', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Account added', 'success');
      }

      closeModal('modalAccount');
      loadAccounts();
      populateAccountDropdowns();
    });

    // 3. Card Form Submit
    document.getElementById('formCard')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('cardEditId').value;
      const isAddon = document.getElementById('cardIsAddon') ? document.getElementById('cardIsAddon').checked : false;
      const parentCardId = isAddon && document.getElementById('cardParentCard').value ? parseInt(document.getElementById('cardParentCard').value) : null;
      const subLimit = isAddon && document.getElementById('cardSubLimit').value ? parseFloat(document.getElementById('cardSubLimit').value) : 0;

      const payload = {
        card_name: document.getElementById('cardName').value,
        card_type: document.getElementById('cardType').value,
        card_network: document.getElementById('cardNetwork').value,
        card_last4: document.getElementById('cardLast4').value,
        is_addon: isAddon ? 1 : 0,
        parent_card_id: parentCardId,
        sub_limit: subLimit,
        credit_limit: parseFloat(document.getElementById('cardCreditLimit').value) || 0,
        available_limit: parseFloat(document.getElementById('cardAvailableLimit').value) || 0,
        billing_start_day: parseInt(document.getElementById('cardBillingStartDay')?.value) || 24,
        billing_day: parseInt(document.getElementById('cardBillingDay')?.value) || 22,
        due_day: parseInt(document.getElementById('cardDueDay')?.value) || 11,
        account_id: document.getElementById('cardLinkedAccount').value ? parseInt(document.getElementById('cardLinkedAccount').value) : null
      };

      if (editId) {
        await api(`/api/cards/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Card updated', 'success');
      } else {
        await api('/api/cards', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Card added', 'success');
      }

      closeModal('modalCard');
      loadAccounts();
      populateAccountDropdowns();
    });

    // 4. Loan Form Submit
    document.getElementById('formLoan')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('loanEditId').value;
      const payload = {
        title: document.getElementById('loanTitle').value,
        loan_type: document.getElementById('loanType').value,
        lender_name: document.getElementById('loanLender').value,
        principal_amount: parseFloat(document.getElementById('loanPrincipal').value) || 0,
        current_balance: parseFloat(document.getElementById('loanCurrentBal').value) || 0,
        emi_amount: parseFloat(document.getElementById('loanEmi').value) || 0,
        emi_due_day: parseInt(document.getElementById('loanDueDay').value) || 5,
        interest_rate: parseFloat(document.getElementById('loanInterest').value) || 0
      };

      if (editId) {
        await api(`/api/loans/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Loan updated', 'success');
      } else {
        await api('/api/loans', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Loan recorded', 'success');
      }

      closeModal('modalLoan');
      loadDebts();
      populateAccountDropdowns();
    });

    // 5. Borrow Form Submit
    document.getElementById('formBorrow')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('borrowEditId').value;
      const dir = document.querySelector('input[name="borrowDirection"]:checked').value;
      const principal = parseFloat(document.getElementById('borrowPrincipal').value) || 0;
      const remaining = document.getElementById('borrowRemaining').value ? parseFloat(document.getElementById('borrowRemaining').value) : principal;
      const accVal = document.getElementById('borrowAccount')?.value;
      const modeVal = document.getElementById('borrowPaymentMode')?.value || 'upi';

      const payload = {
        person_name: document.getElementById('borrowPerson').value,
        relationship: document.getElementById('borrowRelationship').value,
        direction: dir,
        principal_amount: principal,
        balance_remaining: remaining,
        transaction_date: document.getElementById('borrowDate').value,
        due_date: document.getElementById('borrowDueDate').value || null,
        account_id: accVal ? parseInt(accVal) : null,
        payment_mode: modeVal,
        phone: document.getElementById('borrowPhone').value,
        notes: document.getElementById('borrowNotes').value
      };

      if (editId) {
        await api(`/api/borrows/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Debt record updated & bank balance adjusted', 'success');
      } else {
        await api('/api/borrows', { method: 'POST', body: JSON.stringify(payload) });
        showToast(`Debt record created & ${dir === 'borrowed' ? 'credited to' : 'debited from'} account`, 'success');
      }

      closeModal('modalBorrow');
      await loadDebts();
      await loadAccounts();
      await loadTransactions();
      await loadDashboard();
      await populateAccountDropdowns();
    });

    // 6. Settle Debt Form Submit
    document.getElementById('formRepay')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        borrow_id: parseInt(document.getElementById('repayBorrowId').value),
        amount: parseFloat(document.getElementById('repayAmount').value),
        payment_date: document.getElementById('repayDate').value,
        account_id: parseInt(document.getElementById('repayAccount').value),
        payment_mode: document.getElementById('repayMode').value,
        notes: 'Debt Settlement'
      };

      const res = await api('/api/borrows/repay', { method: 'POST', body: JSON.stringify(payload) });
      showToast(res.message, 'success');
      closeModal('modalRepay');
      await loadDebts();
      await loadAccounts();
      await loadTransactions();
      await loadDashboard();
      await populateAccountDropdowns();
    });

    // 7. Transfer Form Submit
    document.getElementById('formTransfer')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        from_account_id: parseInt(document.getElementById('transferFromAcc').value),
        to_account_id: parseInt(document.getElementById('transferToAcc').value),
        amount: parseFloat(document.getElementById('transferAmount').value),
        date: document.getElementById('transferDate').value,
        notes: document.getElementById('transferNotes').value
      };

      const res = await api('/api/accounts/transfer', { method: 'POST', body: JSON.stringify(payload) });
      showToast(res.message, 'success');
      closeModal('modalTransfer');
      loadDashboard();
      if (state.currentTab === 'accounts') loadAccounts();
    });

    // 8. Carryover Wizard Submit
    document.getElementById('formCarryoverExecute')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        year: state.selectedYear,
        month: state.selectedMonth,
        carry_forward_amount: parseFloat(document.getElementById('carryoverCustomAmount').value),
        notes: document.getElementById('carryoverNotes').value
      };

      const res = await api('/api/carryover/execute', { method: 'POST', body: JSON.stringify(payload) });
      showToast(res.message, 'success');
      closeModal('modalCarryoverWizard');
      loadCarryover();
      loadDashboard();
    });

    // 9. Category Form Submit
    document.getElementById('formCategory')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('catName').value,
        type: document.getElementById('catType').value,
        budget_limit: parseFloat(document.getElementById('catBudget').value) || 0,
        classification: document.getElementById('catClassification')?.value || 'need',
        color: document.getElementById('catColor').value
      };

      await api('/api/categories', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Category created', 'success');
      closeModal('modalCategory');
      loadSettings();
      populateCategoryDropdowns();
    });

    // 10. Investments, Salary Plan & Goals Event Handlers
    document.getElementById('dashInvestmentsBox')?.addEventListener('click', () => switchTab('investments'));
    document.getElementById('dashHealthScoreBox')?.addEventListener('click', () => switchTab('salaryplan'));

    document.getElementById('btnOpenAddInvestment')?.addEventListener('click', () => openModalInvestment());
    document.getElementById('formInvestment')?.addEventListener('submit', handleSaveInvestment);
    document.getElementById('invSipEnabled')?.addEventListener('change', (e) => {
      const fields = document.getElementById('invSipFields');
      if (fields) fields.style.display = e.target.checked ? 'block' : 'none';
    });
    document.querySelectorAll('#investFilterPills .invest-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#investFilterPills .invest-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedAssetFilter = btn.getAttribute('data-filter') || 'all';
        renderInvestmentsTable();
      });
    });

    document.getElementById('btnOpenConfigureSalaryPlan')?.addEventListener('click', openModalSalaryPlan);
    document.getElementById('formSalaryPlan')?.addEventListener('submit', handleSaveSalaryPlan);
    document.getElementById('salaryPlanMonthPicker')?.addEventListener('change', () => loadSalaryPlan());

    document.querySelectorAll('.rule-presets-flex .btn-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rule-presets-flex .btn-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const rule = btn.getAttribute('data-rule');
        if (rule === '50_30_20') {
          document.getElementById('sliderNeeds').value = 50;
          document.getElementById('sliderWants').value = 30;
          document.getElementById('sliderDebts').value = 10;
          document.getElementById('sliderSavings').value = 10;
        } else if (rule === '60_20_20') {
          document.getElementById('sliderNeeds').value = 60;
          document.getElementById('sliderWants').value = 20;
          document.getElementById('sliderDebts').value = 0;
          document.getElementById('sliderSavings').value = 20;
        } else if (rule === 'debt_focus') {
          document.getElementById('sliderNeeds').value = 40;
          document.getElementById('sliderWants').value = 20;
          document.getElementById('sliderDebts').value = 30;
          document.getElementById('sliderSavings').value = 10;
        }
        updateSalarySliderLabels();
      });
    });

    ['sliderNeeds', 'sliderWants', 'sliderDebts', 'sliderSavings', 'planMonthlySalary'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateSalarySliderLabels);
    });

    document.getElementById('btnOpenAddGoal')?.addEventListener('click', () => openModalGoal());
    document.getElementById('formFinancialGoal')?.addEventListener('submit', handleSaveGoal);

    // 11. Authentication & Multi-Tenant Events
    document.getElementById('tabSignInBtn')?.addEventListener('click', () => switchAuthTab('signInTab'));
    document.getElementById('tabSignUpBtn')?.addEventListener('click', () => switchAuthTab('signUpTab'));

    document.getElementById('formSignIn')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ident = document.getElementById('loginUsername').value.trim();
      const pass = document.getElementById('loginPassword').value;
      await handleLogin(ident, pass);
    });

    document.getElementById('formSignUp')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('regFullName').value.trim();
      const username = document.getElementById('regUsername').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const pass = document.getElementById('regPassword').value;
      await handleRegister(fullName, username, email, pass);
    });

    document.getElementById('btnQuickDemoLogin')?.addEventListener('click', async () => {
      const usernameInput = document.getElementById('loginUsername');
      const passwordInput = document.getElementById('loginPassword');
      if (usernameInput) usernameInput.value = 'demo';
      if (passwordInput) passwordInput.value = 'demo123';
      await handleLogin('demo', 'demo123');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleLogout();
    });

    document.getElementById('mobileLogoutBtn')?.addEventListener('click', () => {
      document.getElementById('mobileDrawerBackdrop')?.classList.remove('open');
      handleLogout();
    });
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ====================================================================
  // Bootstrap Application
  // ====================================================================
  async function init() {
    try {
      // 1. Attach Events first so Auth Modal and tabs work immediately
      initEvents();

      // 2. Check user authentication session
      const isAuthenticated = await checkAuthSession();
      if (!isAuthenticated) {
        // Waiting for user to sign in or create account
        return;
      }

      // 3. User authenticated: load data for this user
      await loadAppData();

      // Register PWA service worker if available (skip in native Capacitor app)
      if ('serviceWorker' in navigator && !window.Capacitor) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }

      window.switchTab = switchTab;
      window.openBillingCycleModal = openBillingCycleModal;
      window.openAddBorrow = openAddBorrow;
    } catch (e) {
      console.error('App init failed:', e);
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
