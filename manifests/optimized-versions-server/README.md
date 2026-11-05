# Retired Optimized Versions Server

Streamyfin optimized downloads are no longer used. This directory retains only
its namespace and 50Gi Longhorn cache PVC. The Argo Application remains active so
it prunes the former Deployment and Service; deleting the Application alone
would leave those resources orphaned because it has no deletion finalizer.
The PVC is protected from automated pruning. No BookOrbit workloads are changed.

## Calibre Web cleanup

Calibre Web is also retired through the restored `apps/calibre-web-app.yaml`.
Argo adopts its existing resources and sets its Deployment to zero replicas.
Its previous image, media mounts, Service, and protected config PVC remain in
`manifests/calibre-web/`. No manual administrator cleanup is required.

## Verification

After merge, Argo should remove the Optimized Versions Server Deployment and
Service. The restored Calibre Web Application should scale its Deployment to zero
and terminate its pod. Together these release 500m CPU requests, allowing Jellyfin's 500m
request to fit (approximately 55m of scheduling headroom remains).

```sh
kubectl -n optimized-versions-server get deployment,service,pvc
kubectl -n calibre-web get deployment,service,pvc
kubectl -n jellyfin rollout status deployment/jellyfin --timeout=600s
```

Jellyfin may still need application or image troubleshooting once scheduled;
this change resolves the identified CPU scheduling shortage only.
