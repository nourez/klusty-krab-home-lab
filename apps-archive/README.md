# Archived applications

This directory is outside the root application's `apps/` source. Applications
here are retained for reference and are not deployed by the app-of-apps.

As of 2026-10-15, BookOrbit replaces `abs-kosync-bridge`, `audiobookshelf`,
`audiobookshelf-hardcover-sync`, and `grimmory`. Their workload manifests remain
in `manifests/` with zero replicas, including Grimmory's MariaDB deployment.
PVCs, namespaces, secrets, and host-path data are retained for recovery.

## Rollout

The archived Application manifests have no cascading deletion finalizer.
Removing them from `apps/` can orphan running workloads, so stop the deployments
before the root application prunes the Applications. Once the PR is merged,
sync each child application at the merged revision first (zero replicas), then
sync `root-app`. If root pruning has already happened, stop orphaned workloads:

```sh
kubectl -n abs-kosync-bridge scale deployment/abs-kosync-bridge --replicas=0
kubectl -n audiobookshelf scale deployment/audiobookshelf --replicas=0
kubectl -n audiobookshelf-hardcover-sync scale deployment/audiobookshelf-hardcover-sync --replicas=0
kubectl -n grimmory scale deployment/grimmory deployment/mariadb --replicas=0
```

Check each namespace for remaining pods after rollout. Do not cascade-delete
the archived Applications or delete their namespaces/PVCs: that can remove
retained data. Inspect live Application finalizers before pruning if they
differ from Git. Any separately configured Cloudflare public routes can be
disabled separately; their configuration is not defined here.

Discord–Beeper sync is paused separately with zero replicas in
`manifests/beeper-discord/deployment.yaml`; its Application stays active so
Argo CD enforces the pause. Verify no `beeper-discord` pods remain in `beeper`.

## Restore

Move the desired Application YAML back to `apps/`, change the corresponding
deployment replica counts to 1 (both deployments for Grimmory), and let Argo CD
sync. The archived Applications still point to their original manifest paths.
Ensure the original storage and out-of-band secrets are available first.
