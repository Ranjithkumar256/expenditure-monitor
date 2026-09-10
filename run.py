#!/usr/bin/env python3
"""
PaisaTrack - Expenditure & Personal Finance Monitor
Launcher script for Web & Android backend.
"""
import sys
import os
import uvicorn

if __name__ == "__main__":
    project_dir = os.path.dirname(os.path.abspath(__file__))
    if project_dir not in sys.path:
        sys.path.insert(0, project_dir)

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")

    print("\n" + "=" * 65)
    print("💰 PAISATRACK - Expenditure & Personal Finance Monitor")
    print("=" * 65)
    print(f"-> Web Application:    http://localhost:{port}")
    print(f"-> Interactive Docs:   http://localhost:{port}/docs")
    print(f"-> Android PWA:        Open on Android & tap 'Add to Home Screen'")
    print(f"-> Primary Currency:   Indian Rupee (₹ INR) with Multi-Currency")
    print("=" * 65 + "\n")

    uvicorn.run("app.main:app", host=host, port=port, reload=True)
