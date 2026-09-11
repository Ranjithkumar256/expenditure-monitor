# Architecture & System Design Document (ADD)
**Document ID:** ARCH-SPEC-PAISA-01  
**Project:** PaisaTrack  
**System:** Enterprise Multi-Tenant Expenditure Monitoring Platform  
**Status:** Approved Architecture Baseline  
**Revision:** 2.0  

---

## 1. System Architecture Overview

PaisaTrack utilizes a **Dual-Tier Hybrid Architecture** combining offline-first edge persistence with scalable cloud microservices.

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|                                                                                   |
|  +---------------------------+   +----------------------+   +------------------+  |
|  | Modern Web UI (SPA)       |   | Capacitor Mobile Host|   | Terms & Privacy  |  |
|  | HTML5 / Vanilla CSS / ES6 |   | Android WKWebView    |   | Gatekeeper       |  |
|  +---------------------------+   +----------------------+   +------------------+  |
|               |                                |                                  |
|  +---------------------------+   +----------------------------------------------+ |
|  | Multi-Tenant Auth Guard   |   | Database Persistence & Startup Sync Engine   | |
|  | PBKDF2 Password Hashing   |   | (Android/data + Documents + Content Hashing) | |
|  +---------------------------+   +----------------------------------------------+ |
+-----------------------------------------------------------------------------------+
                                         |
                       REST APIs (JSON / Bearer Token)
                                         |
+-----------------------------------------------------------------------------------+
|                              BACKEND CLOUD LAYER                                  |
|                                                                                   |
|  +------------------------------------------------------------------------------+ |
|  | FastAPI Microservice (Async Python 3.11 ASGI Engine)                         | |
|  | - Auth & Session Handlers (/api/auth)                                        | |
|  | - Multi-Currency Transactions & Analytics (/api/transactions)                | |
|  | - Cloud Database Snapshot & Restore Engine (/api/cloud-backup)                | |
|  | - System Health & Diagnostics (/health)                                      | |
|  +------------------------------------------------------------------------------+ |
|                                         |                                         |
|  +------------------------------------------------------------------------------+ |
|  | Relational Storage Layer: SQLite with WAL (Write-Ahead Logging) Mode         | |
|  +------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------+
```

---

## 2. Storage & Persistence Architecture

### 2.1 Multi-Layer Storage Hierarchy
PaisaTrack enforces a zero-data-loss storage hierarchy:

1. **Active Session Memory & Local Cache:** Fast client-side read/write access via partitioned `localStorage` keys scoped to active user IDs (e.g. `paisa_local_txs_v1_u<id>`).
2. **Dedicated Primary On-Device Database:**
   - Path: `Internal Storage/Android/data/com.paisatrack.app/files/database_backup.json`
   - Role: Complete, human-readable, schema-validated JSON database of all accounts, cards, loans, investments, categories, and transactions.
   - Access: Pure native Capacitor Filesystem API (`Directory.External`).
3. **Anti-Uninstall Persistent Mirror:**
   - Path: `Internal Storage/Documents/database_backup.json`
   - Role: Permanent backup that survives complete app uninstallation.
   - Access: `Directory.Documents`.
4. **Remote Cloud Backup API:**
   - Endpoint: `POST /api/cloud-backup`
   - Payload: Version-tagged, encrypted snapshot stored securely on remote server.

### 2.2 Startup Synchronization & Dynamic Hash Comparison
Upon app launch, `syncFromDatabaseFileOnStartup()` executes the following algorithm:

```
                  [App Launch / Reinstall]
                             |
         Probe Android/data/com.paisatrack.app/files/
                             |
             +---------------+---------------+
             | File Found?                   | File Not Found?
             v                               v
       Read rawData             Fallback to Documents/
             |                               v
             +---------------+---------------+
                             |
              Compute 32-bit String Hash
                             |
           +-----------------+-----------------+
           | Empty DB (Reinstall)?             | Existing Data?
           v                                   v
      AUTO-LOAD DATABASE             Compare with lastLoadedHash
      Restore all records                      |
           |                     +-------------+-------------+
           v                     | Hash Changed (External    | Hash Unchanged?
      Notify User                | File Manager Edit)?       |
                                 v                           v
                           AUTO-SYNC EDITS             Normal Startup
                           Update Live State           Zero Action Needed
```

---

## 3. Multi-Tenant Cryptographic Isolation

PaisaTrack implements strict multi-tenant isolation at the data tier:
- **User Partitioning:** Each user's data is isolated into unique namespace keys: `paisa_local_txs_v1_u{userId}`, `paisa_local_accounts_v1_u{userId}`.
- **Demo User Sandbox:** The demo user (`userId: 1`, `username: demo`) operates strictly in a sandboxed demonstration environment. When a real user logs in or registers, all demo toggles and dummy data are completely purged from DOM and state.
- **Password Security:** Passwords are never stored in plain text. PBKDF2 with SHA-256 and unique salt per user is enforced.

---

## 4. Anti-Uninstall Preservation Engine

Standard Android applications lose all data stored in `Android/data/` when the user uninstalls the app. PaisaTrack circumvents this with a two-pillar preservation strategy:

1. **OS-Level Flag:**
   `android:hasFragileUserData="true"` inside `AndroidManifest.xml` instructs the Android Package Manager to present an explicit confirmation prompt: *"Keep 8 MB of app data?"*.
2. **Public Directory Mirroring:**
   Android OS architecture strictly prevents deletion of files inside `Directory.Documents` upon application uninstallation. By automatically mirroring `database_backup.json` to `Documents/`, data is guaranteed to survive regardless of whether the user checks the retention box.
