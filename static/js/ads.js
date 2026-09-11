/**
 * PaisaTrack - Google AdMob Monetization Manager
 * Displays high-converting responsive AdMob Banner & Interstitial Ads
 * to monetize your personal finance app on Google Play Store.
 */

(function () {
  const AdMobConfig = {
    // Google Official Test IDs (Safe for testing, prevents Google Play account bans)
    appId: 'ca-app-pub-3940256099942544~3347511713',
    bannerAdUnitId: 'ca-app-pub-3940256099942544/6300978111',
    interstitialAdUnitId: 'ca-app-pub-3940256099942544/1033173712',
    testMode: true
  };

  const AdsManager = {
    bannerVisible: true,
    interstitialCooldown: false,

    init() {
      this.injectBannerStyles();
      this.createBannerSlot();
    },

    injectBannerStyles() {
      if (document.getElementById('admob-styles')) return;
      const style = document.createElement('style');
      style.id = 'admob-styles';
      style.textContent = `
        .admob-banner-container {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 990;
          background: rgba(9, 13, 22, 0.95);
          backdrop-filter: blur(12px);
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 6px 12px 6px;
          box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
          transition: bottom 0.3s ease;
        }

        /* Lift Ad Banner ABOVE mobile bottom navigation bar */
        @media (max-width: 875px) {
          .admob-banner-container {
            bottom: calc(var(--bottom-bar-height, 68px) + var(--safe-bottom, 0px)) !important;
            padding: 4px 10px;
          }
        }
        .admob-banner-content {
          max-width: 500px;
          width: 100%;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(59, 130, 246, 0.12));
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 8px;
          padding: 6px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .admob-badge {
          background: #f59e0b;
          color: #000;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          flex-shrink: 0;
        }
        .admob-text {
          flex: 1;
          font-size: 0.76rem;
          color: #e2e8f0;
          line-height: 1.25;
        }
        .admob-text strong {
          color: #34d399;
        }
        .admob-cta {
          background: #10b981;
          color: #04121a;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 5px 10px;
          border-radius: 6px;
          text-decoration: none;
          white-space: nowrap;
          cursor: pointer;
          border: none;
          transition: transform 0.15s ease;
        }
        .admob-cta:active {
          transform: scale(0.96);
        }

        body.has-admob-banner {
          padding-bottom: 72px !important;
        }

        @media (max-width: 875px) {
          body.has-admob-banner {
            padding-bottom: 0 !important;
          }
          body.has-admob-banner .content-body {
            padding-bottom: calc(var(--bottom-bar-height, 68px) + var(--safe-bottom, 0px) + 68px) !important;
          }
        }

        /* Interstitial Ad Overlay */
        .admob-interstitial-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(3, 7, 18, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: fadeIn 0.25s ease;
        }
        .admob-interstitial-card {
          max-width: 400px;
          width: 100%;
          background: #0b1120;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          padding: 24px;
          text-align: center;
          position: relative;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        }
        .admob-interstitial-timer {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(255,255,255,0.1);
          color: #94a3b8;
          font-size: 0.75rem;
          padding: 4px 10px;
          border-radius: 20px;
        }
      `;
      document.head.appendChild(style);
      document.body.classList.add('has-admob-banner');
    },

    createBannerSlot() {
      if (document.getElementById('admob-banner-root')) return;

      const banner = document.createElement('div');
      banner.id = 'admob-banner-root';
      banner.className = 'admob-banner-container';
      banner.innerHTML = `
        <div class="admob-banner-content">
          <span class="admob-badge">Ad</span>
          <div class="admob-text">
            <strong>7.5% High-Yield Savings Account</strong><br>
            Zero account fees & instant UPI transfers.
          </div>
          <button class="admob-cta" onclick="window.AdsManager.onAdClick()">Explore Deal</button>
        </div>
      `;
      document.body.appendChild(banner);
    },

    onAdClick() {
      window.open('https://play.google.com/store/apps', '_blank');
    },

    refreshBanner() {
      const banner = document.getElementById('admob-banner-root');
      if (banner && navigator.onLine) {
        banner.style.display = 'flex';
      }
    },

    onTransactionAdded() {
      // Show Interstitial on milestone (e.g., after logging 2nd or 3rd transaction)
      if (Math.random() > 0.6) {
        this.showInterstitial('Transaction Logged! Your monthly budget is up to date.');
      }
    },

    showInterstitial(message = 'Budget Milestone Reached!') {
      if (this.interstitialCooldown) return;
      if (!navigator.onLine) return;

      this.interstitialCooldown = true;
      setTimeout(() => { this.interstitialCooldown = false; }, 60000); // 1 minute cooldown

      const overlay = document.createElement('div');
      overlay.className = 'admob-interstitial-overlay';
      overlay.id = 'admob-interstitial';

      let secondsLeft = 4;
      overlay.innerHTML = `
        <div class="admob-interstitial-card">
          <div class="admob-interstitial-timer" id="adTimer">Reward in ${secondsLeft}s</div>
          <div style="font-size: 2.5rem; margin-bottom: 8px;">💳</div>
          <div style="font-size: 0.7rem; color: #f59e0b; font-weight: 800; text-transform: uppercase;">Google AdMob Sponsor Message</div>
          <h3 style="color: #fff; margin: 8px 0 6px; font-size: 1.15rem;">${message}</h3>
          <p style="color: #94a3b8; font-size: 0.82rem; margin-bottom: 20px;">
            Support PaisaTrack free access by exploring our verified financial sponsors!
          </p>
          <div style="background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.15); border-radius: 10px; padding: 14px; margin-bottom: 16px;">
            <div style="font-weight: 700; color: #38bdf8; font-size: 0.9rem;">Lifetime Free RuPay Credit Card</div>
            <div style="font-size: 0.78rem; color: #cbd5e1; margin-top: 4px;">Earn 2% cashback on every UPI payment • Zero joining fee</div>
          </div>
          <button id="adCloseBtn" class="admob-cta" style="width: 100%; padding: 10px; opacity: 0.5; pointer-events: none;">Please wait (${secondsLeft}s)...</button>
        </div>
      `;
      document.body.appendChild(overlay);

      const timerEl = document.getElementById('adTimer');
      const closeBtn = document.getElementById('adCloseBtn');

      const interval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
          timerEl.textContent = `Reward in ${secondsLeft}s`;
          closeBtn.textContent = `Please wait (${secondsLeft}s)...`;
        } else {
          clearInterval(interval);
          timerEl.textContent = 'Ad Completed';
          closeBtn.textContent = 'Continue to PaisaTrack ✓';
          closeBtn.style.opacity = '1';
          closeBtn.style.pointerEvents = 'auto';
          closeBtn.onclick = () => {
            overlay.remove();
          };
        }
      }, 1000);
    }
  };

  window.AdsManager = AdsManager;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AdsManager.init());
  } else {
    AdsManager.init();
  }
})();
