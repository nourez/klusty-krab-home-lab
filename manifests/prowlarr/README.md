# Prowlarr

LAN UI: `http://10.0.0.242`. BookOrbit endpoint:
`http://prowlarr.prowlarr.svc.cluster.local` (port 80).

The LinuxServer stable image is pinned to the multi-architecture Docker Hub
index digest retrieved on 2026-10-11. Port 80 forwards to Prowlarr's 9696.
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
[Prowlarr](https://prowlarr.com/),
[BookOrbit sources](https://bookorbit.app/book-requests/).
