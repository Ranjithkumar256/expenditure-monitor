/**
 * PaisaTrack - Network Connectivity & Internet Guard
 * Monitors network state to ensure live ads and currency exchange rates can be loaded.
 */

(function () {
  const NetworkMonitor = {
    isOnline: navigator.onLine,
    bannerEl: null,

    init() {
      this.createBanner();
      this.updateState();

      window.addEventListener('online', () => {
        this.isOnline = true;
        this.updateState();
        if (window.AdsManager) {
          window.AdsManager.refreshBanner();
        }
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.updateState();
      });
    },

    createBanner() {
      let el = document.getElementById('networkStatusBanner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'networkStatusBanner';
        el.style.cssText = `
          display: none;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95));
          color: #ffffff;
          padding: 8px 16px;
          text-align: center;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.3px;
          position: sticky;
          top: 0;
          z-index: 9999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          transition: all 0.3s ease;
        `;
        document.body.prepend(el);
      }
      this.bannerEl = el;
    },

    updateState() {
      if (!this.bannerEl) this.createBanner();
      if (!this.isOnline) {
        this.bannerEl.innerHTML = `
          <span>📶 <strong>No Internet Connection</strong> — Expenses & balances are safely saved on this phone! Reconnect to access financial sponsor rewards and live currency rates.</span>
        `;
        this.bannerEl.style.display = 'block';
      } else {
        this.bannerEl.style.display = 'none';
      }
    }
  };

  window.NetworkMonitor = NetworkMonitor;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NetworkMonitor.init());
  } else {
    NetworkMonitor.init();
  }
})();
