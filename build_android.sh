#!/usr/bin/env bash
# ==============================================================================
# PaisaTrack Android One-Click Build Script
# Supports: Debug APK (for phone testing) & Release AAB (for Google Play Store)
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Set up Java 17 environment
if [ -d "/home/ranjith/.local/jdk17" ]; then
    export JAVA_HOME="/home/ranjith/.local/jdk17"
    export PATH="$JAVA_HOME/bin:$PATH"
fi

# Set up Android SDK environment
if [ -d "/home/ranjith/Android/Sdk" ]; then
    export ANDROID_HOME="/home/ranjith/Android/Sdk"
    export ANDROID_SDK_ROOT="/home/ranjith/Android/Sdk"
    export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
fi

echo "========================================================"
echo "  🚀 PaisaTrack Android Build System"
echo "  Java Version: $(java -version 2>&1 | head -n 1)"
echo "========================================================"

# Step 1: Sync Capacitor web assets to Android project
echo "📦 Step 1/3: Syncing web assets to Android platform..."
npx cap sync android

# Ensure both relative (css/...) and absolute (/static/css/...) paths work in Android WebView
mkdir -p android/app/src/main/assets/public/static
cp -r android/app/src/main/assets/public/css android/app/src/main/assets/public/static/ 2>/dev/null || true
cp -r android/app/src/main/assets/public/js android/app/src/main/assets/public/static/ 2>/dev/null || true
cp android/app/src/main/assets/public/favicon.svg android/app/src/main/assets/public/static/ 2>/dev/null || true
cp android/app/src/main/assets/public/manifest.json android/app/src/main/assets/public/static/ 2>/dev/null || true
echo "✅ Web assets synchronized (root & static fallback paths configured)"

MODE="${1:-all}"

cd android

if [ "$MODE" == "apk" ] || [ "$MODE" == "all" ]; then
    echo "🔨 Step 2: Building Debug APK for phone testing..."
    ./gradlew assembleDebug || {
        echo "⚠️ Gradle build failed. If Android SDK is not installed, install it via Android Studio or sdkmanager."
        exit 1
    }
    echo "✅ Debug APK built successfully!"
    echo "📍 File: android/app/build/outputs/apk/debug/app-debug.apk"
fi

if [ "$MODE" == "aab" ] || [ "$MODE" == "all" ]; then
    echo "📦 Step 3: Building Signed Release AAB for Google Play Store..."
    ./gradlew bundleRelease || {
        echo "⚠️ Gradle build failed. If Android SDK is not installed, install it via Android Studio or sdkmanager."
        exit 1
    }
    echo "✅ Signed Android App Bundle (.aab) created successfully!"
    echo "📍 File: android/app/build/outputs/bundle/release/app-release.aab"
fi

echo "========================================================"
echo "🎉 Build finished!"
echo "========================================================"
