#!/bin/bash

# AdGuard Configuration Persistence Fix Script

set -e

echo "🚨 AdGuard Configuration Persistence Fix"
echo "========================================="

# Backup current configuration from the running pod
echo "📥 Backing up current configuration..."
kubectl exec -n adguard adguard-deployment-5cd46f5dd5-nv7c2 -- cat /opt/adguardhome/conf/AdGuardHome.yaml > adguard-backup-config.yaml

echo "✅ Configuration backed up to: adguard-backup-config.yaml"
echo ""

# Create the new config PVC
echo "🔧 Creating configuration PVC..."
kubectl apply -f manifests/adguard/adguard-config-pvc.yaml

# Wait for PVC to be bound
echo "⏳ Waiting for PVC to be ready..."
kubectl wait --for=condition=Bound pvc/adguard-config-pvc -n adguard --timeout=60s

# Apply the updated deployment
echo "🚀 Updating AdGuard deployment..."
kubectl apply -f manifests/adguard/adguard-deployment.yaml

# Wait for rollout
echo "⏳ Waiting for deployment rollout..."
kubectl rollout status deployment/adguard-deployment -n adguard --timeout=120s

# Get new pod name
NEW_POD=$(kubectl get pods -n adguard -l app=adguard -o jsonpath='{.items[0].metadata.name}')

# Restore configuration
echo "📤 Restoring configuration to new pod..."
kubectl cp adguard-backup-config.yaml adguard/${NEW_POD}:/opt/adguardhome/conf/AdGuardHome.yaml

# Restart the pod to load the configuration
echo "🔄 Restarting AdGuard to load configuration..."
kubectl delete pod -n adguard $NEW_POD

# Wait for new pod
echo "⏳ Waiting for AdGuard to come back online..."
kubectl wait --for=condition=ready pod -l app=adguard -n adguard --timeout=120s

echo ""
echo "✅ AdGuard configuration fix complete!"
echo ""
echo "🎯 Next steps:"
echo "1. Access AdGuard at: http://10.0.0.241"
echo "2. Verify your DNS settings and rewrites are restored"
echo "3. Test DNS resolution to make sure everything works"
echo ""
echo "📋 Your configuration is now properly persisted in both:"
echo "   - /opt/adguardhome/conf/ (DNS settings, rewrites)"
echo "   - /opt/adguardhome/work/ (logs, stats, sessions)" 