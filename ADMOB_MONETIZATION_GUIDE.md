# 💰 Google AdMob Monetization Guide - PaisaTrack

This guide details how **PaisaTrack** is monetized using **Google AdMob**, how on-device storage eliminates server costs, and how to start earning revenue from the Google Play Store.

---

## 🏗️ 1. Monetization & Architecture Overview

Your application is configured with two key systems:

1. **100% On-Device Local Storage**:
   * All user accounts, expenses, bank balances, cards, loans, borrows, and investments are stored **directly inside the phone's storage (`localStorage` / `IndexedDB`)**.
   * **Result**: **$0 Server Cost** for you forever. No monthly cloud bills.

2. **Google AdMob Ad Placements**:
   * **Bottom Sticky Banner Ad**: Displays relevant financial sponsor deals (high-yield savings, credit cards, investment platforms) at the bottom of the screen.
   * **Milestone Interstitial Ad**: Triggers an ad when users log expenses or update budget milestones.
   * **Internet Connection Required**: Network monitoring is built-in (`static/js/network.js`). If users go offline, a prompt reminds them to reconnect to internet to access financial rewards and live currency rates.

---

## 💵 2. How You Earn Money from Play Store Ads

AdMob pays you based on two metrics:
* **eCPM (Cost per 1,000 Impressions)**: Finance apps have some of the highest eCPMs in the industry ($5 - $25+ per 1,000 views).
* **CPC (Cost per Click)**: High-paying credit card and investment sponsor clicks.
* **Monthly Payout**: Google automatically deposits your earnings into your local bank account via wire transfer around the 21st of each month (once you reach the $100 threshold).

---

## 🛠️ 3. How to Set Up Your Real AdMob Account (3 Steps)

Currently, the app uses **Google's official Test Ad IDs** to allow testing without risking Google account suspension. When you are ready to launch to the Play Store, replace them with your real IDs:

### Step 3.1: Create an AdMob Account
1. Go to [https://admob.google.com/](https://admob.google.com/) and sign in with your Google account.
2. Click **Apps** $\rightarrow$ **Add App**.
3. Select **Android**.
4. App Name: `PaisaTrack`
5. Note your **AdMob App ID** (format: `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`).

### Step 3.2: Create Ad Units
Inside your AdMob dashboard:
1. **Banner Ad**:
   * Click **Ad units** $\rightarrow$ **Add Ad Unit** $\rightarrow$ select **Banner**.
   * Name: `PaisaTrack Bottom Banner`
   * Copy the generated **Ad Unit ID** (format: `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ`).
2. **Interstitial Ad**:
   * Click **Add Ad Unit** $\rightarrow$ select **Interstitial**.
   * Name: `Transaction Milestone Interstitial`
   * Copy the generated **Ad Unit ID**.

### Step 3.3: Paste Your Real IDs in the Code
Open these two files and replace the sample IDs with your real IDs:

1. **In [AndroidManifest.xml](file:///home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor/android/app/src/main/AndroidManifest.xml)**:
   ```xml
   <meta-data
       android:name="com.google.android.gms.ads.APPLICATION_ID"
       android:value="ca-app-pub-YOUR_APP_ID~HERE"/>
   ```

2. **In [static/js/ads.js](file:///home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor/static/js/ads.js)**:
   ```javascript
   const AdMobConfig = {
     appId: 'ca-app-pub-YOUR_APP_ID~HERE',
     bannerAdUnitId: 'ca-app-pub-YOUR_BANNER_UNIT_ID/HERE',
     interstitialAdUnitId: 'ca-app-pub-YOUR_INTERSTITIAL_UNIT_ID/HERE',
     testMode: false // Set to false when publishing to Google Play
   };
   ```

3. **Rebuild the Play Store Bundle**:
   ```bash
   cd /home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor
   ./build_android.sh aab
   ```
   The updated file is generated at:
   `android/app/build/outputs/bundle/release/app-release.aab`

---

## 🔒 4. Free Privacy Policy for Play Store

Google Play requires an HTTPS Privacy Policy URL. Because PaisaTrack stores all data 100% locally on the user's phone, your privacy policy is very simple and easy to approve:

> *"PaisaTrack respects your privacy. All personal financial records, bank accounts, and transactions are stored exclusively on your device and are never transmitted to external servers. Google AdMob displays ads using Google's standard advertising identifier."*

You can host this for free on GitHub Pages at:
`https://ranjithkumar256.github.io/expenditure-monitor/privacy.html`
