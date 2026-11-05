# Retired Optimized Versions Server

Streamyfin optimized downloads are no longer used. This directory retains only
its namespace and 50Gi Longhorn cache PVC. The Argo Application remains active so
it prunes the former Deployment and Service; deleting the Application alone
would leave those resources orphaned because it has no deletion finalizer.
The PVC is protected from automated pruning. No BookOrbit workloads are changed.

## Calibre Web cleanup

Calibre Web is also retired, but its Argo Application is already absent and its
Deployment and Service are orphaned. The Codex cluster account has read access
but cannot delete or scale these resources. An administrator must run:

```sh
kubectl -n calibre-web delete deployment/calibre-web service/calibre-web
```

Keep `calibre-web/calibre-web-config` and the namespace to retain configuration.
No library files or PVCs need to be removed. Calibre Web uses the image
`crocodilestick/calibre-web-automated:latest`.

## Verification

After merge, Argo should remove the Optimized Versions Server Deployment and
Service. After the administrator command above, the Calibre Web pod should also
terminate. Together these release 500m CPU requests, allowing Jellyfin's 500m
request to fit (approximately 55m of scheduling headroom remains).

```sh
kubectl -n optimized-versions-server get deployment,service,pvc
kubectl -n calibre-web get deployment,service,pvc
kubectl -n jellyfin rollout status deployment/jellyfin --timeout=600s
```

Jellyfin may still need application or image troubleshooting once scheduled;
this change resolves the identified CPU scheduling shortage only.
