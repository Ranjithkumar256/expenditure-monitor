# Operations & Maintenance Manual (Standard Operating Procedure)
**Document ID:** OPS-SOP-PAISA-01  
**Project:** PaisaTrack  
**Audience:** Site Reliability Engineering (SRE), Cloud Operations, L1/L2 Application Support  

---

## 1. System Health Monitoring & Diagnostics

### 1.1 Container Status Check
```bash
docker ps -f name=paisatrack-app --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 1.2 Health Endpoint Inspection
```bash
curl -i http://localhost:8000/health
```
Response must return `HTTP/1.1 200 OK` with payload:
```json
{
  "status": "healthy",
  "service": "paisatrack",
  "version": "1.2.0"
}
```

### 1.3 Cloud Backup Endpoint Verification
```bash
curl -i http://localhost:8000/api/cloud-backup
```
Response:
- If unpopulated: `{"status": "empty", "message": "No cloud backup found on server"}`
- If populated: `{"app": "PaisaTrack", "version": "1.2.0", ...}`

---

## 2. Routine Maintenance Procedures

### Daily Checklist
- [ ] Inspect container health: `docker inspect --format='{{json .State.Health}}' paisatrack-app`.
- [ ] Check disk space on server: `df -h /`. Ensure minimum 20% free space.

### Weekly Checklist
- [ ] Execute automated backup script:
  ```bash
  docker exec paisatrack-app sqlite3 /app/finance.db ".backup '/app/data/finance_weekly_$(date +%F).db'"
  ```
- [ ] Rotate application logs: `docker logs --tail 1000 paisatrack-app > /var/log/paisatrack/app.log`.

### Monthly Checklist
- [ ] Verify SSL/TLS certificate validity (if using reverse proxy): `certbot certificates`.
- [ ] Run automated scenario regression suite to verify data sync:
  ```bash
  node /home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor/test_all_scenarios_comprehensive.mjs
  ```

---

## 3. Incident Escalation & Support Matrix

| Support Level | Role | Responsibilities | SLA Response Time |
| :--- | :--- | :--- | :---: |
| **Level 1 (L1)** | Help Desk Support | User account resets, general UI assistance, initial bug logging. | < 15 minutes |
| **Level 2 (L2)** | Application Operations | Container restarts, cloud backup restores, log investigations. | < 30 minutes |
| **Level 3 (L3)** | Core Engineering & Architecture | Schema migration failures, native Android crashes, code hotfixes. | < 1 hour |
