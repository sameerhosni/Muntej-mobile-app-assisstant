#!/bin/bash
# iPhone build on a Mac, signed with the Apple account's own certificate in Xcode (owner, 2 Nov: Mohammed uploads each
# release from his Mac; no certificate or admin key leaves Apple's side).
#   bash scripts/ios-mac-build.sh
# Then in Xcode: Product → Archive → Distribute App → App Store Connect → Upload.
# Needs: Xcode, Node 20+, CocoaPods, and the .env file next to package.json (public Supabase URL + publishable key).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Missing .env (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"; exit 1; }
npm ci
npx expo prebuild --platform ios --clean

# over-the-air updates: this build listens on the production channel (what `npm run ship` publishes to)
PLIST=$(find ios -name Expo.plist -path '*Supporting*' | head -1)
/usr/libexec/PlistBuddy -c "Delete :EXUpdatesRequestHeaders" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :EXUpdatesRequestHeaders dict" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :EXUpdatesRequestHeaders:expo-channel-name string production" "$PLIST"

# every upload needs a higher build number than the last one: use the date and time
BUILD=$(date +%Y%m%d%H%M)
INFO=$(find ios -name Info.plist -path '*/Muntej*/Info.plist' -not -path '*Pods*' | head -1)
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" "$INFO"

echo "Ready: version $(node -p "require('./app.json').expo.version") build $BUILD"
echo "In Xcode: target Muntej → Signing & Capabilities → pick the team, then Product → Archive → Distribute App."
open ios/*.xcworkspace
