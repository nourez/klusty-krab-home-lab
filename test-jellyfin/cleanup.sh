#!/bin/bash

# Jellyfin Test Cleanup Script

set -e

echo "🧹 Cleaning up Jellyfin test deployment..."
echo "========================================"

# Uninstall Helm release
echo "📦 Uninstalling Helm release..."
helm uninstall jellyfin-test -n test-jellyfin || echo "Release not found or already removed"

# Delete namespace
echo "🗑️  Deleting namespace..."
kubectl delete namespace test-jellyfin || echo "Namespace not found or already removed"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "🔍 Verify cleanup:"
echo "   kubectl get pods -n test-jellyfin  (should show 'No resources found')"
echo "   kubectl get svc -n test-jellyfin   (should show 'No resources found')" 