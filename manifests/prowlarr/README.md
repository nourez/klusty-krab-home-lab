# Prowlarr

LAN UI: `http://10.0.0.242`. BookOrbit endpoint:
`http://prowlarr.prowlarr.svc.cluster.local` (port 80).

The BitlessByte AudioBookBay fork image is pinned to the multi-architecture
Docker Hub index digest retrieved on 2026-10-12. Port 80 forwards to Prowlarr's 9696.
There is no Ingress, Cloudflare route, or NodePort. Ingress is limited to
10.0.0.0/24 and BookOrbit app pods. Outbound access remains available for
indexer searches and fetching torrent metadata.

Prowlarr state, SQLite databases, API keys and indexer credentials persist on
the dedicated 2Gi Longhorn PVC at `/config`. The namespace and PVC are protected
from Argo pruning. LinuxServer's init runs as root to set permissions, then
launches Prowlarr as UID/GID 1000. No media or download directory is mounted.
Back up `/config` securely before upgrades; use Prowlarr's built-in backups
for a consistent database backup. Deleting the namespace explicitly still
deletes the PVC; Longhorn's storage class uses Delete reclaim policy.

## Setup with BookOrbit

1. Open the LAN UI and complete authentication setup. Keep authentication
   enabled; enter credentials privately.
2. Add your chosen torrent indexers in Prowlarr and test each one.
3. Copy each indexer's Torznab feed URL using Prowlarr's UI. In BookOrbit's
   Settings > Server > Requests > Sources, add a Torznab source for each feed.
   Replace only the URL's origin with
   `http://prowlarr.prowlarr.svc.cluster.local`, preserving its indexer ID/path
   (normally `/<indexer-id>/api`). Supply Prowlarr's API key separately.
   Enable **Allow private addresses** in BookOrbit for this cluster endpoint.
   Do not commit keys or credentialed feed URLs.
4. Choose supported book categories and media types, then test the source.
   Leave BookOrbit's existing Decypharr qBittorrent client as the downloader.
   Prowlarr does not need a download client configured for this workflow.
5. Use a permitted test release to validate search, TorBox download,
   BookOrbit import, and opening the imported book. Confirm the source file
   remains separate from the successfully imported library file.

TCP probes check the listener; they do not establish indexer functionality.

## Validation

```sh
yamllint -d relaxed apps/prowlarr-app.yaml manifests/prowlarr/*.yaml
kubeconform -summary -ignore-missing-schemas manifests/prowlarr/*.yaml
kubectl -n prowlarr get pods,pvc,svc
kubectl -n prowlarr rollout status deployment/prowlarr --timeout=300s
```

## Later download cleanup

Cleanup remains deferred until a complete download/import cycle is verified
and a retention period is selected. The eventual job should act only on
BookOrbit-owned, successfully imported, completed downloads older than that
period. It must skip active downloads and requests awaiting import/review,
scope deletion to `/mnt/media/BookOrbit/downloads`, and leave library files
and TorBox cloud content alone. Validate a dry-run candidate report before
enabling deletion. Directory modification time alone is not proof of import.

Sources: [LinuxServer image](https://docs.linuxserver.io/images/docker-prowlarr/),
[ABB fork](https://github.com/BitlessByte0/prowlarr-abb),
[Prowlarr](https://prowlarr.com/),
[BookOrbit sources](https://bookorbit.app/book-requests/).

## ABB fork migration (2026-10-12)

The fork changes the HTTP User-Agent and bundles custom indexer definitions.
It retains the LinuxServer `/config`, PUID/PGID and port conventions. The pinned
image reports application version `10.0.0.19985`, branch `master`, and migration
level 44; the previous LinuxServer `2.6.5.5623-ls163` image also used migration
level 44. Compare actual schema compatibility rather than its custom version
number. An isolated restore test precedes the production image change.

Pre-migration backup: `/config/Backups/manual/prowlarr_backup_v2.6.5.5623_2026.10.12_09.04.23.zip`.
It contains credentials; retain it securely on the PVC and never commit it.
For rollback, stop the workload through GitOps and restore this backup before
starting the prior image:
`docker.io/linuxserver/prowlarr:latest@sha256:f9151e5bc1025c6d0a630d503210cdcb6bb55a7cc098562609d96a408d838902`.
Do not assume changing only the image is safe after later database migrations.
