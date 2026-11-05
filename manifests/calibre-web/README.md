# Retired Calibre Web

The restored `calibre-web` Argo Application adopts the existing Deployment,
Service, and configuration PVC. The Deployment is deliberately set to zero
replicas, releasing its 250m CPU request without a manual cluster operation.
Argo self-heal keeps it stopped.

The manifest preserves the deployed image, UID/GID, media path
(`/mnt/media/Books` → `/calibre-library`), and `calibre-web-config` PVC name.
The existing LoadBalancer Service remains managed but has no backends while
retired. Configuration storage is protected from automated pruning.
No books or configuration data are deleted.

Verify after merge:

```sh
kubectl -n argocd get application calibre-web
kubectl -n calibre-web get deployment,pods,service,pvc
```
