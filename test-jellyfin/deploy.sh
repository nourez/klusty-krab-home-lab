#!/bin/bash

# Jellyfin Intel N100 Test Deployment Script

set -e

echo "🧪 Jellyfin Intel N100 Hardware Transcoding Test"
echo "================================================"

# Check if values.yaml has been customized
if grep -q "/path/to/your/media" values.yaml; then
    echo "⚠️  WARNING: Please update the media path in values.yaml first!"
    echo "   Edit the line: hostPath: /path/to/your/media"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Add Jellyfin Helm repo
echo "📦 Adding Jellyfin Helm repository..."
helm repo add jellyfin https://jellyfin.github.io/jellyfin-helm
helm repo update

# Create namespace
echo "🔧 Creating test namespace..."
kubectl create namespace test-jellyfin --dry-run=client -o yaml | kubectl apply -f -

# Deploy Jellyfin
echo "🚀 Deploying Jellyfin..."
helm upgrade --install jellyfin-test jellyfin/jellyfin \
    --namespace test-jellyfin \
    --values values.yaml \
    --wait

# Show status
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Pod status:"
kubectl get pods -n test-jellyfin

echo ""
echo "🌐 Service status:"
kubectl get svc -n test-jellyfin

echo ""
echo "🎯 Next steps:"
echo "1. Get LoadBalancer IP: kubectl get svc -n test-jellyfin"
echo "2. Access Jellyfin at: http://<LOADBALANCER-IP>:8096"
echo "3. Configure Intel QuickSync in Dashboard → Playback → Transcoding"
echo "4. Test with a video that needs transcoding"
echo ""
echo "📈 Monitor transcoding:"
echo "   kubectl top pod -n test-jellyfin"
echo "   kubectl logs -n test-jellyfin -l app.kubernetes.io/name=jellyfin -f" 