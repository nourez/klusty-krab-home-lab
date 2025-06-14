# Jellyfin Intel N100 Hardware Transcoding Test

This is a test deployment to verify if Jellyfin can properly use Intel N100 hardware transcoding where Plex failed.

## Prerequisites

- Intel GPU plugin already installed ✅
- i915 GuC enabled (`enable_guc=2`) ✅ 
- Node labeled with `intel.feature.node.kubernetes.io/gpu: "true"` ✅

## Setup

1. **Update media path** in `values.yaml`:
   ```yaml
   hostPath: /path/to/your/media  # UPDATE THIS
   ```

2. **Add Jellyfin Helm repository**:
   ```bash
   helm repo add jellyfin https://jellyfin.github.io/jellyfin-helm
   helm repo update
   ```

3. **Create namespace**:
   ```bash
   kubectl create namespace test-jellyfin
   ```

4. **Deploy Jellyfin**:
   ```bash
   helm install jellyfin-test jellyfin/jellyfin -n test-jellyfin -f values.yaml
   ```

## Testing Hardware Transcoding

1. **Access Jellyfin**: 
   - Check LoadBalancer IP: `kubectl get svc -n test-jellyfin`
   - Browse to `http://<LOADBALANCER-IP>:8096`

2. **Configure hardware transcoding**:
   - Go to Dashboard → Playback → Transcoding
   - Hardware acceleration: `Intel QuickSync (QSV)`
   - Enable hardware decoding for: `H264`, `HEVC`, etc.

3. **Test transcoding**:
   - Play a video that needs transcoding (different resolution/codec)
   - Monitor GPU usage: `kubectl exec -n test-jellyfin <pod> -- intel_gpu_top`
   - Check CPU usage: `kubectl top pod -n test-jellyfin`

## Expected Results

- **Success**: Low CPU usage (< 1 core) + GPU utilization visible
- **Failure**: High CPU usage (> 3 cores) like current Plex setup

## Monitoring

```bash
# Watch pod status
kubectl get pods -n test-jellyfin -w

# Check logs
kubectl logs -n test-jellyfin -l app.kubernetes.io/name=jellyfin

# Monitor resource usage
kubectl top pod -n test-jellyfin

# Check GPU allocation
kubectl describe node | grep "gpu.intel.com/i915"
```

## Cleanup

```bash
helm uninstall jellyfin-test -n test-jellyfin
kubectl delete namespace test-jellyfin
```

## Notes

- Using `emptyDir` for config (temporary)
- Running as root for testing (can be hardened later)
- LoadBalancer service (uses your MetalLB setup)
- Same GPU resource requests as your Plex setup 