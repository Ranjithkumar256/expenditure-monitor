# Release Deployment Runbook & Operational Procedures
**Document ID:** SOP-DEP-PAISA-01  
**Project:** PaisaTrack  
**Applicable Version:** v1.2.0  
**Target Environments:** Staging / Production (Cloud VM, Docker, Google Play Store)  
**Standard Maintenance Window:** Sunday 02:00 - 04:00 UTC (Estimated Downtime: < 60 seconds)  

---

## 1. Pre-Deployment Checklist & Prerequisites

Ensure the following operational conditions are satisfied before commencing deployment:

- [x] Host Server: Linux Ubuntu 22.04 / 24.04 LTS (x86_64 / arm64) with minimum 2 vCPU, 4GB RAM, 20GB SSD.
- [x] Docker Engine `24.0+` and Docker Compose `v2.20+` installed and running.
- [x] Port `8000` (or reverse-proxy `80`/`443`) available and firewall rules configured.
- [x] Android SDK Build-Tools `34.0.0` and Java JDK 17 installed for native builds.
- [x] Google Play Console Developer Account with Service Account API key configured.
- [x] Production database backup verified before applying binary updates.

---

## 2. Deployment Procedure: Docker Microservices

### Step 2.1: Pull Latest Production Container
```bash
docker pull ranjith256/expenditure-monitor:latest
```

### Step 2.2: Perform Database & Configuration Snapshot
```bash
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p /opt/paisatrack/backups
docker cp paisatrack-app:/app/finance.db /opt/paisatrack/backups/finance_${BACKUP_DATE}.db 2>/dev/null || true
```

### Step 2.3: Zero-Downtime Container Restart
```bash
# Gracefully stop existing container
docker stop paisatrack-app 2>/dev/null || true
docker rm paisatrack-app 2>/dev/null || true

# Run updated production container
docker run -d \
  --name paisatrack-app \
  --restart unless-stopped \
  -p 8000:8000 \
  -v paisatrack_data:/app/data \
  -e ENVIRONMENT=production \
  -e PORT=8000 \
  --health-cmd="curl -f http://localhost:8000/health || exit 1" \
  --health-interval=30s \
  --health-timeout=5s \
  --health-retries=3 \
  ranjith256/expenditure-monitor:latest
```

### Step 2.4: Validate Container Health
```bash
sleep 5
docker ps --filter "name=paisatrack-app"
curl -s http://localhost:8000/health | jq .
```
Expected output: `{"status": "healthy", "service": "paisatrack", "version": "1.2.0"}`

---

## 3. Deployment Procedure: Android Google Play Store

### Step 3.1: Build Release Bundle
```bash
cd /home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor
npm run build
npx cap sync android
cd android
./gradlew bundleRelease
```

### Step 3.2: Sign & Align Android App Bundle (AAB)
```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore /path/to/release-key.jks \
  app/build/outputs/bundle/release/app-release.aab release_alias
```

### Step 3.3: Play Console Track Promotion
1. Navigate to **Google Play Console** > **PaisaTrack** (`com.paisatrack.app`).
2. Upload `app-release.aab` to **Internal Testing Track**.
3. Perform Smoke Test on minimum 3 physical devices (Android 10, Android 13, Android 14).
4. Promote from **Internal Testing** -> **Closed Alpha** -> **Production Release**.
5. Set staged rollout to 20% on Day 1, 50% on Day 2, 100% on Day 3.

---

## 4. Post-Deployment Verification & Smoke Tests

Run the following automated smoke test script immediately post-deployment:

```bash
cd /home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor
node test_all_scenarios_comprehensive.mjs
```

Verify the following key test items:
1. Terms Consent dialog renders and enforces mandatory checkbox check.
2. Demo user login operates properly; new real user account starts clean.
3. Database backup writes to `Android/data/com.paisatrack.app/files/database_backup.json`.
4. Startup sync loads data on empty install and synchronizes external file edits.
5. `/api/cloud-backup` responds with HTTP 200 OK.

---

## 5. Rollback & Emergency Contingency Plan

If critical incidents (P0 / P1) occur within the 2-hour post-deployment window:

### Container Rollback
```bash
docker stop paisatrack-app
docker run -d --name paisatrack-app --restart unless-stopped -p 8000:8000 \
  ranjith256/expenditure-monitor:previous_stable
# Restore database snapshot if schema migration occurred
docker cp /opt/paisatrack/backups/finance_${BACKUP_DATE}.db paisatrack-app:/app/finance.db
docker restart paisatrack-app
```

### Mobile App Rollback
1. In Google Play Console, halt the Staged Rollout immediately.
2. Promote the previous stable release bundle (`v1.1.0`) with an incremented version code if emergency patch distribution is required.
