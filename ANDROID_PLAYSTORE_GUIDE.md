# 📱 Complete Guide: Publishing PaisaTrack to Google Play Store (Capacitor Android)

This comprehensive guide explains how to convert PaisaTrack into an **Android App Bundle (.aab)** and publish it to the **Google Play Store**.

---

## 🏗️ 1. Architecture Overview for Play Store

Before building the APK/AAB, understand the client-server architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                 Mobile Phone (User's Device)               │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │   PaisaTrack Android Native Shell (Capacitor)       │   │
│   │   HTML / CSS / JavaScript / Charts Engine            │   │
│   └──────────────────────────┬──────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────┘
                               │ HTTPS API calls
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                Cloud Hosted Production Server               │
│  (e.g., Render.com, Railway.app, DigitalOcean, or AWS)      │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │   FastAPI Python Server (run.py / app/main.py)      │   │
│   │   SQLite / PostgreSQL Database (finance.db)         │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Why `localhost` cannot be used in Play Store:**
> A user downloading your app from Google Play in another city/country cannot connect to your laptop (`localhost` or `10.x.x.x`).
> 1. **For Play Store release**: Deploy your Python FastAPI backend to any cloud provider (e.g. Render, Railway, DigitalOcean).
> 2. **For personal testing on your phone right now**: You can connect to your laptop using your local Wi-Fi IP.

---

## 🛠️ 2. Step-by-Step: Generating the Android Project

All required Capacitor configuration is already set up in `package.json` and `capacitor.config.json`.

### Step 2.1: Install Dependencies
In the project directory, run:
```bash
cd /home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor
npm install
```

### Step 2.2: Add Android Native Platform
Run the Capacitor command to create the native Android Gradle project:
```bash
npx cap add android
```
*This creates the `android/` directory containing the complete Android Studio / Gradle project.*

### Step 2.3: Sync Web Assets
Whenever you edit HTML, CSS, or JS, copy the latest assets into the native Android shell:
```bash
npx cap sync android
```

---

## 🌐 3. Pointing the Android App to Your Production API

Open `static/js/app.js` and set your production cloud URL:

```javascript
// In static/js/app.js:
const API_BASE = window.location.origin.includes('localhost') 
  ? '' 
  : 'https://api.yourdomain.com'; // Your hosted FastAPI backend URL

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  // ... rest of fetch call
}
```

Or configure it in `capacitor.config.json`:
```json
{
  "appId": "com.paisatrack.expenditure",
  "appName": "PaisaTrack",
  "webDir": "static",
  "server": {
    "url": "https://your-production-app.onrender.com",
    "cleartext": true
  }
}
```

---

## 🔑 4. Release Keystore (Already Generated & Configured!)

A production release keystore has already been generated and configured inside your project:
- **Keystore File**: `android/paisatrack-release.keystore`
- **Alias**: `paisatrack`
- **Store Password**: `PaisaTrack@2026`
- **Key Password**: `PaisaTrack@2026`
- **Validity**: 10,000 days

> [!IMPORTANT]
> This key is already linked to your `android/app/build.gradle` so release builds are automatically signed. Keep a backup of `android/paisatrack-release.keystore` in a secure location (Google Play updates require this exact key).

---

## 📦 5. Building the Signed Android App Bundle (.aab)

Google Play Store strictly requires **`.aab` (Android App Bundle)** instead of `.apk`.

### Option A: Using the One-Click Build Script (Recommended)
Simply run the helper script in the project root:
```bash
# To build both Debug APK and Signed Play Store AAB:
./build_android.sh

# Or build only the Play Store bundle:
./build_android.sh aab

# Or build only the phone testing APK:
./build_android.sh apk
```

### Option B: Using Android Studio (Visual)
1. Launch Android Studio:
   ```bash
   npx cap open android
   ```
2. Wait for Gradle to finish syncing.
3. In the top menu, navigate to:
   **Build** $\rightarrow$ **Generate Signed Bundle / APK...**
4. Select **Android App Bundle** $\rightarrow$ Click **Next**.
5. Select `android/paisatrack-release.keystore`, enter password `PaisaTrack@2026` and alias `paisatrack`.
6. Select **Release** build variant $\rightarrow$ Click **Create**.
7. Android Studio will generate the bundle at:
   ```
   android/app/release/app-release.aab
   ```

### Option C: Using Terminal Gradle directly
```bash
cd android
./gradlew bundleRelease
```
The signed AAB file will be generated in `android/app/build/outputs/bundle/release/app-release.aab`.

---

## 🧪 6. For Quick Testing on Your Phone (Debug APK)

If you want an `.apk` file right now to install directly on your phone without Play Store:

```bash
cd android
./gradlew assembleDebug
```
The APK file will be located at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```
You can send this APK to your phone via USB or WhatsApp/Drive and tap **Install**.

---

## 🚀 7. Google Play Console Publishing Steps

1. **Create a Developer Account**:
   - Go to [Google Play Console](https://play.google.com/console).
   - Pay the one-time $25 registration fee.

2. **Create New App**:
   - Click **Create app**.
   - App Name: `PaisaTrack`
   - Default language: `English (United States)` or `English (India)`
   - App or Game: `App`
   - Free or Paid: `Free`

3. **Store Listing Assets**:
   - **App Icon**: $512 \times 512$ PNG (with transparent or solid background).
   - **Feature Graphic**: $1024 \times 500$ PNG/JPEG.
   - **Phone Screenshots**: At least 4 screenshots (minimum 1080p). Capture your Dashboard, Donut & Trend charts, Accounts, and Carryover wizard.
   - **Short Description**: *"All-in-one personal finance, cards, loans & expenditure monitor."*
   - **Full Description**: Detail features: INR currency formatting, multi-currency conversion, multiple bank accounts, loan EMIs, and carry forward system.

4. **Mandatory App Content Policies**:
   - **Privacy Policy**: Add a URL to your privacy policy page (FastAPI can serve `/privacy` static page).
   - **Target Audience**: 18+ (Finance app).
   - **Financial Features Declaration**: Declare as Personal Finance / Budget Tracker (no direct banking access or real payment processing required).

5. **Upload the Bundle**:
   - Go to **Production** (or **Closed Testing**) $\rightarrow$ **Create new release**.
   - Upload `app-release.aab`.
   - Add Release notes: *"Initial release of PaisaTrack with multi-account support, loan tracking, and rollover engine."*
   - Click **Review release** $\rightarrow$ **Start rollout to Production**!
