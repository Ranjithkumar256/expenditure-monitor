# Disaster Recovery & Business Continuity Plan (DRP/BCP)
**Document ID:** DRP-BCP-PAISA-01  
**Project:** PaisaTrack  
**Scope:** Production Resilience, Data Loss Prevention, System Recovery  
**Target Metrics:** Recovery Point Objective (RPO) = 0 sec (Local); Recovery Time Objective (RTO) < 5 min  

---

## 1. Business Impact Analysis (BIA) & Objectives

| Objective | Target Threshold | Architecture Solution |
| :--- | :---: | :--- |
| **Recovery Point Objective (RPO)** | **0 seconds** | On-device transaction updates are committed synchronously to storage. |
| **Recovery Time Objective (RTO)** | **< 5 minutes** | Automated Docker container restart; zero-click mobile reinstall auto-sync. |
| **Data Retention Guarantee** | **100% Survival** | Dual-tier mirroring (`Android/data` + `Documents/`) ensures data survives uninstall. |

---

## 2. Disaster Recovery Playbooks

### Playbook A: Mobile Device Factory Reset or App Reinstall
- **Symptom:** User reinstalled the app or bought a new device with backed-up storage.
- **Automated Workflow:**
  1. User installs PaisaTrack APK/AAB.
  2. On first app launch, `syncFromDatabaseFileOnStartup()` queries:
     - `Internal Storage/Android/data/com.paisatrack.app/files/database_backup.json`
     - `Internal Storage/Documents/database_backup.json`
  3. If found, all accounts, transactions, and categories are re-hydrated with zero user intervention.
- **Manual Workflow (Fallback):**
  - If files were moved to external SD card or Google Drive, user taps **"Restore from File Manager"** and selects the `.json` file.

### Playbook B: External File Corruption or Incomplete JSON Edit
- **Symptom:** User manually edited `database_backup.json` in a text editor and introduced syntax errors.
- **Automated Protection:**
  - `JSON.parse()` is wrapped in `try/catch`.
  - If parse fails, the app rejects the corrupt file gracefully, retains active local state, and logs a descriptive warning without crashing.
- **Recovery Workflow:**
  - App displays a toast alert: `"Invalid database file structure"`.
  - User can restore from the secondary `Documents/` mirror or re-export a valid database file.

### Playbook C: Cloud Server Outage or Container Crash
- **Symptom:** Docker container crashes or cloud VM host becomes unresponsive.
- **Automated Protection:**
  - Docker daemon restart policy: `--restart unless-stopped`.
  - Docker healthcheck probes `/health` every 30s. If 3 consecutive probes fail, container is restarted.
- **Manual Failover:**
  - Spin up replacement container on backup host using `docker-compose.yml` mounting the persistent volume `/app/data`.
  - Mobile clients continue functioning in 100% offline-first mode without disruption.
