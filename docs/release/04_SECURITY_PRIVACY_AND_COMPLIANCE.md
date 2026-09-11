# Security, Privacy & Regulatory Compliance Assessment
**Document ID:** SEC-COMP-PAISA-01  
**Project:** PaisaTrack  
**Classification:** Enterprise Security & Data Governance  
**Compliance Standards:** India Digital Personal Data Protection (DPDP) Act 2023, GDPR (EU 2016/679), ISO/IEC 27001  

---

## 1. Threat Modeling & STRIDE Analysis

| Threat Category | Potential Attack Vector | PaisaTrack Defense & Mitigation Strategy | Residual Risk |
| :--- | :--- | :--- | :---: |
| **Spoofing** | Credential stuffing / Session hijacking | PBKDF2-SHA256 salted password hashing; JWT tokens with strict expiration and signature validation. | Low |
| **Tampering** | External tampering with `database_backup.json` | Hash-based integrity checks; JSON schema parsing validation; malformed files rejected gracefully without crashing app. | Low |
| **Repudiation** | Denying financial transaction creation | Immutable transaction timestamps (`ISO8601`), unique transaction IDs, client-side audit trails. | Low |
| **Information Disclosure** | Data leakage across multi-tenant user accounts | Strict namespace isolation; zero cross-tenant query capability; server-side user ID verification on every API request. | Low |
| **Denial of Service** | API flooding or large payload imports | Payload size limits (max 10MB on JSON import), client-side debounced requests, FastAPI async throttling. | Low |
| **Elevation of Privilege** | Normal user accessing admin controls | Role-Based Access Control (RBAC); strict boolean flags on user object (`is_admin: false`). | None |

---

## 2. Permissions Audit & Principle of Least Privilege

PaisaTrack adheres strictly to the **Principle of Least Privilege**. Only essential permissions are declared:

### 2.1 `android.permission.INTERNET` & `ACCESS_NETWORK_STATE`
- **Purpose:** Used to deliver Google AdMob banner and rewarded ads that keep PaisaTrack 100% free with unlimited features. Also used if the user chooses to sync with their private Cloud Database.
- **Data Flow:** No personal financial records or transaction titles are ever transmitted over ad network calls.

### 2.2 Storage & File Manager Access
- **Purpose:** Limited strictly to storing and restoring database backups.
- **Designated Directory:**
  `Internal Storage/Android/data/com.paisatrack.app/files/database_backup.json`
- **Zero-Access Guarantee:** PaisaTrack **DOES NOT scan, read, access, or touch ANY other files, folders, photos, videos, contacts, or documents** on the user's device.

---

## 3. Regulatory Compliance Verification

### 3.1 India Digital Personal Data Protection (DPDP) Act 2023
- **Explicit Consent (Section 6):** Mandatory Terms of Service & Privacy Onboarding modal requires explicit opt-in before data logging begins.
- **Purpose Limitation (Section 5):** Financial data is collected strictly for personal budget visualization and expense calculation.
- **Right to Erasure (Section 12):** One-click "Wipe & Reset" feature in Settings allows instantaneous zero-trace data deletion.

### 3.2 EU General Data Protection Regulation (GDPR)
- **Data Portability (Article 20):** Full export to open `.json` standard anytime via File Manager export.
- **Privacy by Design (Article 25):** 100% offline-first edge architecture ensures user financial data remains on-device by default.
- **Right to Rectification (Article 16):** Users can directly edit transactions in-app or externally via `database_backup.json`.

---

## 4. Cryptographic Standards & Transport Security

- **Transport Security:** Strict TLS 1.3 encryption enforced on all API endpoints.
- **Content Security Policy (CSP):** `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;` blocks unauthorized remote code execution.
- **HTTP Security Headers:**
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
