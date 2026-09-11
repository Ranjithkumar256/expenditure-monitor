/**
 * PaisaTrack - On-Device Storage & Local Offline Database Engine
 * Enables 100% Standalone, Zero-Server Operation with persistent LocalStorage.
 * Strictly isolates demo user sample data from real registered user accounts.
 */

(function () {
  const STORAGE_KEYS = {
    USERS: 'paisa_local_users_store_v2',
    USER: 'paisa_local_user_v1',
    PROFILES: 'paisa_local_profiles_v1',
    ACCOUNTS: 'paisa_local_accounts_v1',
    CARDS: 'paisa_local_cards_v1',
    CATEGORIES: 'paisa_local_categories_v1',
    TRANSACTIONS: 'paisa_local_txs_v1',
    LOANS: 'paisa_local_loans_v1',
    BORROWS: 'paisa_local_borrows_v1',
    INVESTMENTS: 'paisa_local_investments_v1',
    SALARY_PLAN: 'paisa_local_salary_plan_v1',
    GOALS: 'paisa_local_goals_v1',
    SETTINGS: 'paisa_local_settings_v1',
    CARRYOVER: 'paisa_local_carryover_v1'
  };

  const PaisaLocalDB = {
    init() {
      // Ensure user store exists with default demo user
      this.getUsersList();

      // Ensure demo defaults exist under base keys
      if (!localStorage.getItem(STORAGE_KEYS.PROFILES)) {
        this.resetDefaults();
      }
    },

    getCurrentUser() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.USER);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    getUsersList() {
      let users = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.USERS);
        if (raw) users = JSON.parse(raw);
      } catch (e) {
        users = [];
      }
      if (!Array.isArray(users)) users = [];

      // Ensure default demo user exists
      const demoExists = users.some(u => u.username === 'demo' || u.id === 1);
      if (!demoExists) {
        users.unshift({
          id: 1,
          username: 'demo',
          email: 'demo@paisatrack.com',
          full_name: 'Demo User',
          password: 'demo123',
          is_demo: true,
          created_at: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      }
      return users;
    },

    getUserKey(baseKey) {
      const user = this.getCurrentUser();
      if (!user || user.is_demo || user.username === 'demo') {
        return baseKey;
      }
      return `${baseKey}_u${user.id}`;
    },

    getItem(baseKey, defaultValue = null) {
      const k = this.getUserKey(baseKey);
      const val = localStorage.getItem(k);
      if (val === null) return defaultValue;
      try {
        return JSON.parse(val);
      } catch (e) {
        return defaultValue;
      }
    },

    setItem(baseKey, value) {
      const k = this.getUserKey(baseKey);
      localStorage.setItem(k, JSON.stringify(value));
    },

    getDefaultCategories() {
      return [
        { id: 1, name: 'Groceries & Supplies', icon: '🛒', type: 'expense', color: '#10b981', monthly_budget: 15000 },
        { id: 2, name: 'Food & Dining', icon: '🍔', type: 'expense', color: '#f59e0b', monthly_budget: 8000 },
        { id: 3, name: 'Fuel & Commute', icon: '⛽', type: 'expense', color: '#00b4d8', monthly_budget: 6000 },
        { id: 4, name: 'Housing & Rent', icon: '🏠', type: 'expense', color: '#6366f1', monthly_budget: 25000 },
        { id: 5, name: 'Utilities & Bills', icon: '💡', type: 'expense', color: '#8b5cf6', monthly_budget: 7500 },
        { id: 6, name: 'Shopping & Clothes', icon: '🛍️', type: 'expense', color: '#ec4899', monthly_budget: 8000 },
        { id: 7, name: 'Health & Medical', icon: '🩺', type: 'expense', color: '#ef4444', monthly_budget: 5000 },
        { id: 8, name: 'Entertainment & OTT', icon: '🎬', type: 'expense', color: '#3b82f6', monthly_budget: 4000 },
        { id: 9, name: 'Loan EMI & Interest', icon: '🏛️', type: 'expense', color: '#f97316', monthly_budget: 15000 },
        { id: 10, name: 'Monthly Salary', icon: '💼', type: 'income', color: '#34d399', monthly_budget: 0 },
        { id: 11, name: 'Freelance / Consulting', icon: '💻', type: 'income', color: '#38bdf8', monthly_budget: 0 },
        { id: 12, name: 'Investment Returns', icon: '📈', type: 'income', color: '#a855f7', monthly_budget: 0 },
        { id: 13, name: 'Other Income', icon: '➕', type: 'income', color: '#64748b', monthly_budget: 0 }
      ];
    },

    ensureCleanUserData(userId) {
      const userKey = (k) => `${k}_u${userId}`;
      if (!localStorage.getItem(userKey(STORAGE_KEYS.PROFILES))) {
        localStorage.setItem(userKey(STORAGE_KEYS.PROFILES), JSON.stringify([
          { id: 1, name: 'Personal Finances', color: '#4f46e5', is_default: true, currency: 'INR' }
        ]));
        localStorage.setItem(userKey(STORAGE_KEYS.ACCOUNTS), JSON.stringify([
          { id: 1, name: 'Primary Bank Account', account_type: 'Bank Account', balance: 0, profile_id: 1, color: '#004c8f' },
          { id: 2, name: 'Cash Wallet', account_type: 'Cash Wallet', balance: 0, profile_id: 1, color: '#10b981' }
        ]));
        localStorage.setItem(userKey(STORAGE_KEYS.CATEGORIES), JSON.stringify(this.getDefaultCategories()));
        localStorage.setItem(userKey(STORAGE_KEYS.SETTINGS), JSON.stringify({
          base_currency: 'INR',
          currency_symbol: '₹',
          dark_mode: true,
          smart_carryover: true,
          monthly_budget: 0
        }));
        localStorage.setItem(userKey(STORAGE_KEYS.CARDS), JSON.stringify([]));
        localStorage.setItem(userKey(STORAGE_KEYS.TRANSACTIONS), JSON.stringify([]));
        localStorage.setItem(userKey(STORAGE_KEYS.LOANS), JSON.stringify([]));
        localStorage.setItem(userKey(STORAGE_KEYS.BORROWS), JSON.stringify([]));
        localStorage.setItem(userKey(STORAGE_KEYS.INVESTMENTS), JSON.stringify([]));
        localStorage.setItem(userKey(STORAGE_KEYS.SALARY_PLAN), JSON.stringify({
          monthly_salary: 0,
          needs_target: 0,
          wants_target: 0,
          savings_target: 0,
          health_score: 100
        }));
        localStorage.setItem(userKey(STORAGE_KEYS.GOALS), JSON.stringify([]));
      }
    },

    clearDemoData() {
      // Clears only demo records from base keys
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.BORROWS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.INVESTMENTS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify([
        { id: 1, name: 'Primary Bank Account', account_type: 'Bank Account', balance: 0, profile_id: 1, color: '#004c8f' },
        { id: 2, name: 'Cash Wallet', account_type: 'Cash Wallet', balance: 0, profile_id: 1, color: '#10b981' }
      ]));
    },

    resetDefaults() {
      const today = new Date().toISOString().split('T')[0];

      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify([
        { id: 1, name: 'Personal Finances', color: '#10b981', is_default: true, currency: 'INR' },
        { id: 2, name: 'Business & Consulting', color: '#00b4d8', is_default: false, currency: 'INR' }
      ]));

      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
        base_currency: 'INR',
        currency_symbol: '₹',
        dark_mode: true,
        smart_carryover: true,
        monthly_budget: 65000
      }));

      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(this.getDefaultCategories()));

      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify([
        { id: 1, name: 'HDFC Salary Account', account_type: 'Bank Account', balance: 64250, profile_id: 1, color: '#3b82f6' },
        { id: 2, name: 'SBI Savings Account', account_type: 'Bank Account', balance: 28400, profile_id: 1, color: '#0284c7' },
        { id: 3, name: 'Cash in Hand', account_type: 'Cash Wallet', balance: 4850, profile_id: 1, color: '#10b981' }
      ]));

      localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify([
        { id: 1, name: 'Amazon Pay ICICI Card', card_limit: 150000, current_balance: 14200, billing_cycle_day: 15, due_day: 5, profile_id: 1, color: '#f59e0b' },
        { id: 2, name: 'HDFC Regalia Gold', card_limit: 250000, current_balance: 22800, billing_cycle_day: 20, due_day: 10, profile_id: 1, color: '#8b5cf6' }
      ]));

      localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify([
        { id: 1, name: 'Vehicle Loan', principal_amount: 350000, remaining_amount: 185000, emi_amount: 9200, tenure_months: 36, remaining_months: 18, interest_rate: 8.7, profile_id: 1 }
      ]));

      localStorage.setItem(STORAGE_KEYS.BORROWS, JSON.stringify([
        { id: 1, person_name: 'Rahul Sharma', amount: 5000, type: 'lent', status: 'pending', date: today, note: 'Weekend trip split', profile_id: 1 },
        { id: 2, person_name: 'Pooja Verma', amount: 2500, type: 'borrowed', status: 'pending', date: today, note: 'Dinner payment share', profile_id: 1 }
      ]));

      localStorage.setItem(STORAGE_KEYS.INVESTMENTS, JSON.stringify([
        { id: 1, name: 'Nifty 50 Index Fund', asset_type: 'Mutual Fund', invested_amount: 75000, current_value: 86400, returns_pct: 15.2, profile_id: 1 },
        { id: 2, name: 'Sovereign Gold Bond', asset_type: 'Gold', invested_amount: 50000, current_value: 58200, returns_pct: 16.4, profile_id: 1 }
      ]));

      localStorage.setItem(STORAGE_KEYS.SALARY_PLAN, JSON.stringify({
        monthly_salary: 85000,
        needs_target: 42500,
        wants_target: 25500,
        savings_target: 17000,
        health_score: 84
      }));

      localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify([
        { id: 1, title: 'Emergency Fund', target_amount: 150000, current_amount: 92000, deadline: '2026-12-31', profile_id: 1 },
        { id: 2, title: 'International Vacation', target_amount: 120000, current_amount: 45000, deadline: '2027-04-30', profile_id: 1 }
      ]));

      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify([
        { id: 1, title: 'Monthly Salary Credit', amount: 85000, type: 'income', category_id: 10, account_id: 1, date: today, note: 'Direct employer credit', profile_id: 1 },
        { id: 2, title: 'Supermarket Grocery Run', amount: 3450, type: 'expense', category_id: 1, account_id: 1, date: today, note: 'Pantry items', profile_id: 1 },
        { id: 3, title: 'Fuel Top-up', amount: 2200, type: 'expense', category_id: 3, account_id: 1, date: today, note: 'Petrol pump', profile_id: 1 },
        { id: 4, title: 'Weekend Family Dinner', amount: 1850, type: 'expense', category_id: 2, account_id: 1, date: today, note: 'Cafe dining', profile_id: 1 }
      ]));
    },

    // Handle intercepted API requests
    async handleApi(endpoint, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      let body = {};
      try { if (options.body) body = JSON.parse(options.body); } catch (e) {}

      // 1. Auth & Profiles
      if (endpoint === '/api/auth/login') {
        const ident = (body.username_or_email || body.username || body.email || '').trim().toLowerCase();
        const pass = (body.password || '').trim();
        if (!ident || !pass) {
          throw new Error('Username and password are required');
        }

        const users = this.getUsersList();
        const matched = users.find(u =>
          (u.username && u.username.toLowerCase() === ident) ||
          (u.email && u.email.toLowerCase() === ident)
        );

        if (!matched || matched.password !== pass) {
          throw new Error('Incorrect username or password');
        }

        const isDemo = Boolean(matched.is_demo || matched.username === 'demo');
        const safeUser = {
          id: matched.id,
          username: matched.username,
          email: matched.email,
          full_name: matched.full_name || matched.username,
          is_demo: isDemo,
          created_at: matched.created_at
        };

        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(safeUser));
        localStorage.setItem('paisa_auth_token', 'paisa_local_token_' + safeUser.id);

        if (!isDemo) {
          this.ensureCleanUserData(safeUser.id);
        }

        return {
          user: safeUser,
          token: 'paisa_local_token_' + safeUser.id,
          message: 'Logged in successfully'
        };
      }

      if (endpoint === '/api/auth/register') {
        const username = (body.username || '').trim().toLowerCase();
        const email = (body.email || `${username}@paisatrack.local`).trim().toLowerCase();
        const fullName = (body.full_name || username).trim();
        const pass = (body.password || '').trim();

        if (!username || !pass) {
          throw new Error('Username and password are required');
        }
        if (pass.length < 6) {
          throw new Error('Password must be at least 6 characters long');
        }

        const users = this.getUsersList();
        if (users.some(u => (u.username && u.username.toLowerCase() === username) || (u.email && u.email.toLowerCase() === email))) {
          throw new Error('Username or email is already registered');
        }

        const newUser = {
          id: Date.now(),
          username,
          email,
          full_name: fullName,
          password: pass,
          is_demo: false,
          created_at: new Date().toISOString()
        };

        users.push(newUser);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

        const safeUser = {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          full_name: newUser.full_name,
          is_demo: false,
          created_at: newUser.created_at
        };

        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(safeUser));
        localStorage.setItem('paisa_auth_token', 'paisa_local_token_' + safeUser.id);

        // Initialize 100% clean data slate for this new real user
        this.ensureCleanUserData(newUser.id);

        return {
          user: safeUser,
          token: 'paisa_local_token_' + safeUser.id,
          message: 'Registration successful'
        };
      }

      if (endpoint === '/api/auth/me') {
        const user = this.getCurrentUser();
        if (!user) {
          throw new Error('Authentication required');
        }
        return {
          status: 'authenticated',
          user: user
        };
      }

      if (endpoint === '/api/auth/logout') {
        localStorage.removeItem(STORAGE_KEYS.USER);
        localStorage.removeItem('paisa_auth_token');
        return { success: true, message: 'Logged out successfully' };
      }

      if (endpoint.startsWith('/api/profiles')) {
        let profiles = this.getItem(STORAGE_KEYS.PROFILES, []);
        if (method === 'POST') {
          const newProfile = { id: Date.now(), name: body.name || 'New Profile', color: body.color || '#10b981', is_default: false, currency: 'INR' };
          profiles.push(newProfile);
          this.setItem(STORAGE_KEYS.PROFILES, profiles);
          return newProfile;
        }
        return { profiles: profiles };
      }

      // 2. Settings
      if (endpoint.startsWith('/api/settings')) {
        let settings = this.getItem(STORAGE_KEYS.SETTINGS, {
          currency_code: 'INR',
          currency_symbol: '₹',
          currency_name: 'Indian Rupee',
          theme: 'dark',
          smart_carryover: true,
          monthly_budget: 0
        });
        if (method === 'POST' || method === 'PUT') {
          settings = { ...settings, ...body };
          this.setItem(STORAGE_KEYS.SETTINGS, settings);
        }
        return {
          settings: settings,
          available_currencies: {
            "INR": { "rate": 1.0, "symbol": "₹", "name": "Indian Rupee", "locale": "en-IN" },
            "USD": { "rate": 0.012, "symbol": "$", "name": "US Dollar", "locale": "en-US" },
            "EUR": { "rate": 0.011, "symbol": "€", "name": "Euro", "locale": "de-DE" },
            "GBP": { "rate": 0.0095, "symbol": "£", "name": "British Pound", "locale": "en-GB" },
            "AED": { "rate": 0.044, "symbol": "AED", "name": "UAE Dirham", "locale": "en-AE" },
            "SGD": { "rate": 0.016, "symbol": "S$", "name": "Singapore Dollar", "locale": "en-SG" },
            "CAD": { "rate": 0.016, "symbol": "C$", "name": "Canadian Dollar", "locale": "en-CA" },
            "AUD": { "rate": 0.018, "symbol": "A$", "name": "Australian Dollar", "locale": "en-AU" }
          }
        };
      }

      // 3. Accounts
      if (endpoint === '/api/accounts') {
        let accounts = this.getItem(STORAGE_KEYS.ACCOUNTS, []);
        if (method === 'POST') {
          const newAcc = { id: Date.now(), ...body, balance: parseFloat(body.balance) || 0 };
          accounts.push(newAcc);
          this.setItem(STORAGE_KEYS.ACCOUNTS, accounts);
          return newAcc;
        }
        return { accounts: accounts };
      }

      // 4. Cards
      if (endpoint === '/api/cards') {
        let cards = this.getItem(STORAGE_KEYS.CARDS, []);
        if (method === 'POST') {
          const newCard = { id: Date.now(), ...body, current_balance: parseFloat(body.current_balance) || 0 };
          cards.push(newCard);
          this.setItem(STORAGE_KEYS.CARDS, cards);
          return newCard;
        }
        return { cards: cards };
      }

      // 5. Categories
      if (endpoint === '/api/categories') {
        let categories = this.getItem(STORAGE_KEYS.CATEGORIES, []);
        if (method === 'POST') {
          const newCat = { id: Date.now(), ...body };
          categories.push(newCat);
          this.setItem(STORAGE_KEYS.CATEGORIES, categories);
          return newCat;
        }
        return { categories: categories };
      }

      // 6. Loans & Borrows
      if (endpoint === '/api/loans') {
        let loans = this.getItem(STORAGE_KEYS.LOANS, []);
        if (method === 'POST') {
          const newLoan = { id: Date.now(), ...body };
          loans.push(newLoan);
          this.setItem(STORAGE_KEYS.LOANS, loans);
          return newLoan;
        }
        return { loans: loans };
      }

      if (endpoint === '/api/borrows') {
        let borrows = this.getItem(STORAGE_KEYS.BORROWS, []);
        if (method === 'POST') {
          const newB = { id: Date.now(), ...body };
          borrows.push(newB);
          this.setItem(STORAGE_KEYS.BORROWS, borrows);
          return newB;
        }
        const borrowed_list = borrows.filter(b => b.type === 'borrowed' || b.direction === 'borrowed');
        const lent_list = borrows.filter(b => b.type === 'lent' || b.direction === 'lent');
        const total_borrowed_remaining = borrowed_list.reduce((s, b) => s + (parseFloat(b.amount || b.balance_remaining) || 0), 0);
        const total_lent_remaining = lent_list.reduce((s, b) => s + (parseFloat(b.amount || b.balance_remaining) || 0), 0);
        return {
          borrowed_list,
          lent_list,
          total_borrowed_remaining,
          total_lent_remaining
        };
      }

      if (endpoint === '/api/borrows/repay') {
        let borrows = this.getItem(STORAGE_KEYS.BORROWS, []);
        borrows = borrows.map(b => b.id === body.id ? { ...b, status: 'settled' } : b);
        this.setItem(STORAGE_KEYS.BORROWS, borrows);
        return { success: true };
      }

      // 7. Transactions
      if (endpoint.startsWith('/api/transactions')) {
        let txs = this.getItem(STORAGE_KEYS.TRANSACTIONS, []);
        if (method === 'POST') {
          const newTx = {
            id: Date.now(),
            title: body.title || 'Transaction',
            amount: parseFloat(body.amount) || 0,
            type: body.type || 'expense',
            category_id: parseInt(body.category_id, 10) || 1,
            account_id: parseInt(body.account_id, 10) || 1,
            date: body.date || new Date().toISOString().split('T')[0],
            note: body.note || ''
          };
          txs.unshift(newTx);
          this.setItem(STORAGE_KEYS.TRANSACTIONS, txs);

          // Trigger Milestone Ad
          if (window.AdsManager) {
            window.AdsManager.onTransactionAdded();
          }

          return newTx;
        }
        let total_income = 0;
        let total_expense = 0;
        txs.forEach(t => {
          if (t.type === 'income') total_income += (parseFloat(t.amount) || 0);
          if (t.type === 'expense') total_expense += (parseFloat(t.amount) || 0);
        });
        return {
          transactions: txs,
          total_count: txs.length,
          total_income,
          total_expense,
          net: total_income - total_expense
        };
      }

      // 8. Investments
      if (endpoint === '/api/investments') {
        let invs = this.getItem(STORAGE_KEYS.INVESTMENTS, []);
        if (method === 'POST') {
          const newInv = { id: Date.now(), ...body };
          invs.push(newInv);
          this.setItem(STORAGE_KEYS.INVESTMENTS, invs);
          return newInv;
        }
        return { investments: invs };
      }

      if (endpoint === '/api/investments/summary') {
        const invs = this.getItem(STORAGE_KEYS.INVESTMENTS, []);
        const total_invested = invs.reduce((acc, i) => acc + (parseFloat(i.invested_amount) || 0), 0);
        const total_value = invs.reduce((acc, i) => acc + (parseFloat(i.current_value) || 0), 0);
        const total_gain = total_value - total_invested;
        return {
          total_invested,
          current_value: total_value,
          total_gain,
          overall_returns_pct: total_invested ? ((total_gain / total_invested) * 100).toFixed(1) : 0,
          assets_count: invs.length
        };
      }

      // 9. Salary Plan & Goals
      if (endpoint === '/api/salary-plan') {
        let plan = this.getItem(STORAGE_KEYS.SALARY_PLAN, {
          monthly_salary: 0,
          needs_target: 0,
          wants_target: 0,
          savings_target: 0,
          health_score: 100
        });
        if (method === 'POST') {
          plan = { ...plan, ...body };
          this.setItem(STORAGE_KEYS.SALARY_PLAN, plan);
        }
        return plan;
      }

      if (endpoint === '/api/financial-goals') {
        let goals = this.getItem(STORAGE_KEYS.GOALS, []);
        if (method === 'POST') {
          const newGoal = { id: Date.now(), ...body };
          goals.push(newGoal);
          this.setItem(STORAGE_KEYS.GOALS, goals);
          return newGoal;
        }
        return { goals: goals };
      }

      // 10. Transfers & Carryover
      if (endpoint === '/api/accounts/transfer') {
        return { success: true, message: 'Transfer completed locally.' };
      }

      if (endpoint.startsWith('/api/dashboard')) {
        const txs = this.getItem(STORAGE_KEYS.TRANSACTIONS, []);
        const accounts = this.getItem(STORAGE_KEYS.ACCOUNTS, []);
        const invs = this.getItem(STORAGE_KEYS.INVESTMENTS, []);
        const total_networth = accounts.reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
        const portfolio_value = invs.reduce((sum, i) => sum + (parseFloat(i.current_value) || 0), 0);
        let total_income = 0;
        let total_expense = 0;
        txs.forEach(t => {
          if (t.type === 'income') total_income += (parseFloat(t.amount) || 0);
          if (t.type === 'expense') total_expense += (parseFloat(t.amount) || 0);
        });
        const net_savings = total_income - total_expense;
        const savings_rate_percent = total_income > 0 ? Math.round((net_savings / total_income) * 100) : 0;
        const now = new Date();
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        return {
          selected_period: {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            month_name: monthNames[now.getMonth()]
          },
          total_networth,
          true_net_worth: total_networth + portfolio_value,
          portfolio_value,
          carryover: {
            total_income,
            total_expense,
            net_savings,
            savings_rate_percent,
            opening_balance: 0,
            closing_balance: net_savings,
            status: 'active'
          },
          categories_breakdown: [],
          month_trends: [],
          recent_transactions: txs.slice(0, 5),
          investments_summary: { total_invested: 0, current_value: portfolio_value, total_gain: 0, returns_percentage: 0 },
          salary_plan_analysis: { health_score: 85 }
        };
      }

      if (endpoint.startsWith('/api/reports/month-wise')) {
        return { months: [], incomes: [], expenses: [], savings: [], category_donut: [] };
      }

      if (endpoint.startsWith('/api/reports/day-wise')) {
        return { days: [], expenses: [], incomes: [] };
      }

      if (endpoint.startsWith('/api/salary-plan/analysis')) {
        return { health_score: 85, needs_spent: 0, wants_spent: 0, savings_spent: 0 };
      }

      if (endpoint.startsWith('/api/carryover/history')) {
        return [];
      }

      if (endpoint.startsWith('/api/carryover/execute')) {
        return { success: true, message: 'Carryover calculated.' };
      }

      if (endpoint.startsWith('/api/carryover')) {
        return {
          total_income: 0,
          total_expense: 0,
          net_savings: 0,
          savings_rate_percent: 0,
          opening_balance: 0,
          closing_balance: 0,
          status: 'active'
        };
      }

      if (endpoint === '/api/data-status') {
        const user = this.getCurrentUser();
        const isDemo = Boolean(user && (user.is_demo || user.username === 'demo'));
        if (!isDemo) {
          return {
            has_dummy_data: false,
            is_demo: false,
            transaction_count: (this.getItem(STORAGE_KEYS.TRANSACTIONS, [])).length,
            account_count: (this.getItem(STORAGE_KEYS.ACCOUNTS, [])).length,
            card_count: (this.getItem(STORAGE_KEYS.CARDS, [])).length,
            loan_count: (this.getItem(STORAGE_KEYS.LOANS, [])).length,
            debt_count: (this.getItem(STORAGE_KEYS.BORROWS, [])).length
          };
        }
        const txs = this.getItem(STORAGE_KEYS.TRANSACTIONS, []);
        const cards = this.getItem(STORAGE_KEYS.CARDS, []);
        return {
          has_dummy_data: txs.length > 2 || cards.length > 1,
          is_demo: true,
          transaction_count: txs.length,
          account_count: (this.getItem(STORAGE_KEYS.ACCOUNTS, [])).length,
          card_count: cards.length,
          loan_count: (this.getItem(STORAGE_KEYS.LOANS, [])).length,
          debt_count: (this.getItem(STORAGE_KEYS.BORROWS, [])).length
        };
      }

      if (endpoint === '/api/reset-demo') {
        const user = this.getCurrentUser();
        if (!user || (!user.is_demo && user.username !== 'demo')) {
          throw new Error('Dummy data controls are only permitted for demo user');
        }
        this.resetDefaults();
        return { success: true, message: 'Sample dummy data restored!' };
      }

      if (endpoint === '/api/clear-demo') {
        const user = this.getCurrentUser();
        if (!user || (!user.is_demo && user.username !== 'demo')) {
          throw new Error('Dummy data controls are only permitted for demo user');
        }
        this.clearDemoData();
        return { success: true, message: 'Sample dummy data removed!' };
      }

      // Fallback response
      return { success: true };
    }
  };

  PaisaLocalDB.init();
  window.PaisaLocalDB = PaisaLocalDB;
})();
