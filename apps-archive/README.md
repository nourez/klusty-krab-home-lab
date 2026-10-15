# Archived applications

BookOrbit replaces `abs-kosync-bridge`, `audiobookshelf`,
`audiobookshelf-hardcover-sync`, and `grimmory` as of 2026-10-15.
Discord–Beeper is also retired. This directory preserves their original
Application definitions; original workload manifests remain in `manifests/`
with zero replicas for recovery.

## Retirement rollout

Temporary Application entries remain in `apps/`, pointing to
`manifests/retired/<service>` instead of the original workloads. These sources
contain only retained namespaces and PVCs. Argo CD's automated sync and pruning
therefore remove the retired Deployments, Services, ConfigMap and ABS
IngressRoute while retaining storage. This avoids racing root pruning against
child shutdown and releases the retired MetalLB addresses.

After merge, verify all five Applications have synced the merged revision and
are healthy, all six Deployments (including Grimmory MariaDB) are gone, and
the four public Services plus MariaDB Service and ABS IngressRoute are gone.
Confirm PVCs and namespaces remain. Host-path data and out-of-band secrets
are not removed. Keep the shared `beeper` namespace and bridge-manager Secret
for WhatsApp. No change is made to the WhatsApp Application.

Only after this verification, remove the five temporary entries from `apps/`
in a follow-up PR. Keep `manifests/retired/` and these archived definitions.
The Applications have no cascading deletion finalizer in Git; inspect live
finalizers before removal. Do not cascade-delete Applications or delete
namespaces/PVCs. Live cluster cleanup has not been verified by this PR.

Cloudflare routes are managed outside this repo and can be disabled separately.

## Restore

Replace the temporary Application with its archived definition (or copy it back
to `apps/` after cleanup), set the original deployment replicas to 1 (both for
Grimmory), and let Argo CD sync. Confirm storage and out-of-band secrets exist.
