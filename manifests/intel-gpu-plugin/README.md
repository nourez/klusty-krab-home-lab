# Intel GPU Plugin GitOps Setup

This directory contains the GitOps-ready configuration for Intel GPU device plugin deployment.

## Overview

The Intel GPU plugin setup consists of:

1. **Dependencies** (`intel-gpu-dependencies/`):
   - Node Feature Discovery (NFD)
   - cert-manager
   - Intel Device Plugins Operator

2. **System Configuration** (`system-config-daemonset.yaml`):
   - Automatically configures inotify limits on GPU nodes
   - Ensures persistent configuration across reboots
   - Monitors and maintains proper limits

3. **GPU Device Plugin** (`gpu-device-plugin-values.yaml`):
   - Intel GPU device plugin custom resource
   - Configured for hardware transcoding workloads

## Deployment Order

The sync waves ensure proper deployment order:

1. **Wave 1**: Dependencies (NFD, cert-manager, Intel operator)
2. **Wave 2**: System configuration (inotify limits)
3. **Wave 3**: GPU device plugin

## ArgoCD Applications

Deploy these ArgoCD applications in order:

```bash
kubectl apply -f argocd-apps/intel-gpu-dependencies.yaml
kubectl apply -f argocd-apps/intel-gpu-plugin.yaml
```

## System Requirements

- Nodes with Intel GPUs
- Sufficient inotify limits (automatically configured)
- k3s or standard Kubernetes cluster

## Verification

After deployment, verify:

```bash
# Check GPU resources are available
kubectl describe node <node-name> | grep gpu.intel.com

# Check plugin is running
kubectl get pods -n intel-device-plugins-system

# Check system configuration
kubectl logs -n intel-device-plugins-system -l app=intel-gpu-system-config
```

## Troubleshooting

- If GPU plugin fails with "too many open files", check system-config DaemonSet logs
- Ensure NFD has labeled nodes with `intel.feature.node.kubernetes.io/gpu=true`
- Verify cert-manager is running for webhook certificates

## Manual Cleanup

If needed to clean up manually installed components:

```bash
helm uninstall gpu-device-plugin -n intel-device-plugins
helm uninstall intel-device-plugins-operator -n intel-device-plugins-system
helm uninstall node-feature-discovery -n node-feature-discovery
helm uninstall cert-manager -n cert-manager
``` 