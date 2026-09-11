/**
 * PaisaTrack - Network Connectivity & Internet Guard
 * Enforces active network connection for sponsor advertisements.
 * When network is OFF, displays a blocking overlay requesting the user to turn network ON.
 */

(function () {
  const NetworkMonitor = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    blockerEl: null,

    init() {
      this.createBlockerOverlay();
      this.updateState();

      window.addEventListener('online', () => {
        this.isOnline = true;
        this.updateState();
        if (window.AdsManager) {
          window.AdsManager.refreshBanner();
        }
        if (window.showToast) {
          window.showToast('Network connection restored! 🌐', 'success');
        }
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.updateState();
      });
    },

    createBlockerOverlay() {
      let el = document.getElementById('networkOfflineBlocker');
      if (!el) {
        el = document.createElement('div');
        el.id = 'networkOfflineBlocker';
        el.style.cssText = `
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(10, 15, 29, 0.96);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          z-index: 999999;
          align-items: center;
          justify-content: center;
          padding: 20px;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        el.innerHTML = `
          <div style="
            background: linear-gradient(145deg, #1e293b, #0f172a);
            border: 1px solid rgba(239, 68, 68, 0.4);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(239, 68, 68, 0.2);
            border-radius: 18px;
            max-width: 440px;
            width: 100%;
            padding: 32px 24px;
            text-align: center;
            color: #f8fafc;
            box-sizing: border-box;
          " id="networkBlockerCard">
            <div style="
              width: 72px;
              height: 72px;
              background: rgba(239, 68, 68, 0.15);
              border: 2px solid rgba(239, 68, 68, 0.4);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 20px;
              font-size: 36px;
            ">
              📶
            </div>
            <h2 style="font-size: 22px; font-weight: 800; margin: 0 0 10px; color: #fff; letter-spacing: -0.5px;">
              Network is Off
            </h2>
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px;">
              <p style="font-size: 14.5px; font-weight: 700; color: #fca5a5; margin: 0;">
                ⚠️ Network is off. Please turn network ON.
              </p>
            </div>
            <p style="font-size: 13px; line-height: 1.55; color: #94a3b8; margin: 0 0 24px;">
              An active Internet connection is required for live sponsor advertisements and cloud security sync. Your local financial records remain 100% safely preserved on your phone.
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button type="button" id="btnRetryNetwork" style="
                background: linear-gradient(135deg, #6366f1, #4f46e5);
                color: #ffffff;
                border: none;
                border-radius: 10px;
                padding: 13px 20px;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
                transition: transform 0.15s ease, background 0.2s ease;
              ">
                <span>🔄 Retry Connection / Turn Network On</span>
              </button>
              <span id="networkRetryFeedback" style="font-size: 12px; color: #ef4444; min-height: 18px; display: none;"></span>
            </div>
          </div>
        `;

        document.body.appendChild(el);

        const retryBtn = el.querySelector('#btnRetryNetwork');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => this.checkAndRetry());
        }
      }
      this.blockerEl = el;
    },

    async checkAndRetry() {
      const feedback = document.getElementById('networkRetryFeedback');
      const card = document.getElementById('networkBlockerCard');
      const retryBtn = document.getElementById('btnRetryNetwork');

      if (retryBtn) retryBtn.innerHTML = '<span>⏳ Checking Connection...</span>';

      // Test real reachability or navigator.onLine
      let reachable = navigator.onLine;
      if (reachable) {
        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 2000);
          const res = await fetch('/api/health?t=' + Date.now(), { signal: ctrl.signal }).catch(() => null);
          clearTimeout(timeout);
          if (res && res.ok) reachable = true;
        } catch (e) {}
      }

      if (reachable) {
        this.isOnline = true;
        this.updateState();
        if (window.showToast) window.showToast('Network restored! 🌐', 'success');
        if (window.AdsManager) window.AdsManager.refreshBanner();
      } else {
        this.isOnline = false;
        if (feedback) {
          feedback.textContent = 'Still offline. Please enable Wi-Fi or Mobile Data in your device settings.';
          feedback.style.display = 'block';
        }
        if (card) {
          card.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-8px)' },
            { transform: 'translateX(8px)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(0)' }
          ], { duration: 400 });
        }
      }

      if (retryBtn) {
        retryBtn.innerHTML = '<span>🔄 Retry Connection / Turn Network On</span>';
      }
    },

    updateState() {
      if (!this.blockerEl) this.createBlockerOverlay();
      if (!this.blockerEl) return;

      if (!this.isOnline) {
        this.blockerEl.style.display = 'flex';
      } else {
        this.blockerEl.style.display = 'none';
        const feedback = document.getElementById('networkRetryFeedback');
        if (feedback) feedback.style.display = 'none';
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
