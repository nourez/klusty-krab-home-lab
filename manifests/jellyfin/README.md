# Jellyfin Production Deployment

Production-ready Jellyfin media server with Intel N100 hardware transcoding and external HTTPS access.

## 🎯 Features

- **Hardware Transcoding**: Intel QuickSync Video (QSV) with Intel N100 GPU
- **External Access**: HTTPS via `jellyfin.nourez.dev` with Let's Encrypt certificates
- **Persistent Storage**: Longhorn PVCs for config and transcode cache
- **Media Access**: Direct hostPath mount to `/mnt/media` (2.7TB+ media library)
- **High Availability**: Health checks and proper resource limits
- **Security**: HTTPS-only with security headers via Traefik middleware

## 📊 Resource Allocation

- **LoadBalancer IP**: `10.0.0.249` (MetalLB)
- **GPU**: Intel i915 (1 unit)
- **Memory**: 1Gi request, 4Gi limit
- **CPU**: 500m request, 2000m limit
- **Storage**:
  - Config: 10Gi Longhorn PVC
  - Transcode: 50Gi Longhorn PVC
  - Media: Direct mount from `/mnt/media`

## 🌐 Access

- **External**: https://jellyfin.nourez.dev (Traefik + Let's Encrypt)
- **Internal**: http://10.0.0.249:8096 (LoadBalancer IP)
- **Split DNS**: Configure in AdGuard Home:
  ```
  jellyfin.nourez.dev → 10.0.0.249
  ```

## 🔧 Hardware Transcoding Setup

After deployment, configure hardware acceleration in Jellyfin:

1. Go to **Dashboard** → **Playback** → **Transcoding**
2. Set **Hardware acceleration** to: `Intel QuickSync (QSV)`
3. Enable hardware decoding for: `H264`, `HEVC`, `VP8`, `VP9`
4. Set **Hardware encoding** to: `Intel QuickSync (QSV)`

## 📈 Performance

Based on successful testing:
- **Software transcoding**: 3.5+ CPU cores
- **Hardware transcoding**: 1.7 CPU cores (~54% reduction)
- GPU utilization visible in `intel_gpu_top`

## 🚀 Deployment

Managed via ArgoCD - deploys automatically from Git.

### Manual Deployment (if needed):
```bash
kubectl apply -k manifests/jellyfin/
```

### Verification:
```bash
# Check pods
kubectl get pods -n jellyfin

# Check services
kubectl get svc -n jellyfin

# Check ingress
kubectl get ingressroute -n jellyfin

# Monitor logs
kubectl logs -n jellyfin -l app=jellyfin -f
```

## 🔍 Monitoring

```bash
# Resource usage
kubectl top pod -n jellyfin

# GPU usage (exec into pod)
kubectl exec -n jellyfin <pod-name> -- intel_gpu_top

# Health checks
kubectl describe pod -n jellyfin <pod-name>
```

## 🛠️ Troubleshooting

### Common Issues:

1. **GPU not accessible**:
   ```bash
   kubectl describe node | grep "gpu.intel.com/i915"
   ```

2. **Media mount issues**:
   ```bash
   kubectl exec -n jellyfin <pod-name> -- ls -la /media
   ```

3. **Certificate issues**:
   ```bash
   kubectl logs -n kube-system -l app.kubernetes.io/name=traefik
   ```

### Manual Patching (if Helm chart doesn't respect hostPath):
```bash
# Delete auto-created media PVC
kubectl delete pvc jellyfin-media -n jellyfin

# Patch deployment for hostPath
kubectl patch deployment jellyfin -n jellyfin --type='json' \
  -p='[{"op": "replace", "path": "/spec/template/spec/volumes/1",
        "value": {"name": "media", "hostPath": {"path": "/mnt/media", "type": "Directory"}}}]'
```

## 🔐 Security

- **HTTPS-only**: HTTP automatically redirects to HTTPS
- **Security headers**: X-Frame-Options, X-Content-Type-Options, etc.
- **Let's Encrypt**: Automatic certificate renewal
- **Proper permissions**: Minimal required privileges for hardware access

## 📝 Migration Notes

Migrated from `test-jellyfin` with the following changes:
- ✅ EmptyDir → Longhorn PVC for persistence
- ✅ Test IP (.246) → Production IP (.249)
- ✅ Added HTTPS ingress with certificates
- ✅ Added health checks and proper resource limits
- ✅ Added security headers and HTTPS redirect
- ✅ Added transcode cache PVC for better performance 