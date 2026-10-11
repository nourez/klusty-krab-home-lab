# CrossPoint Sync

Self-hosted [CrossPoint Sync](https://github.com/crosspoint-reader/crosspoint-sync)
for CrossPoint, CrossInk, and KOReader. One replica uses SQLite on a 2 GiB
Longhorn PVC mounted at `/data`. `Recreate` prevents overlapping writers during
updates. The PVC is excluded from Argo pruning; deleting the namespace or PVC
manually can still delete its Longhorn volume.

## Access

- Web UI: `https://crosspoint.nourez.net/app/`
- Reader sync server URL: `https://crosspoint.nourez.net` (no `/app/` suffix)
- Health: `https://crosspoint.nourez.net/healthz`

Use the existing account. Registration is disabled. Moving the endpoint does
not change accounts or data on the PVC; sign in again on the new hostname and
update the sync URL on each reader.

The Service is ClusterIP only. A NetworkPolicy permits inbound port 8080 only
from `app=cloudflared` pods in the `cloudflared` namespace. Kubelet health probes
continue to work. There is no LAN load balancer or Traefik route for this app.

## Cloudflare Tunnel

In the existing remotely managed `klusty-krab` tunnel, configure a published
application route:

- Hostname: `crosspoint.nourez.net`
- Service URL: `http://crosspoint-sync.crosspoint-sync.svc.cluster.local:80`
- Path: empty (all paths)

Cloudflare provisions the DNS record and terminates public HTTPS. It overwrites
client-supplied `X-Forwarded-Proto`, and `TRUST_PROXY=true` lets the application
recognize HTTPS behind the tunnel. Keep the NetworkPolicy in place when trusting
the proxy. Cloudflare's browser-only Access login can break KOSync clients;
the app's existing account authentication protects reading data.

## Deployment

`apps/crosspoint-sync-app.yaml` is discovered by the root Argo application.
Merge these manifests into the default branch and let Argo sync them.
The upstream `main` image is pinned by digest; update the digest explicitly
when upgrading.

## Optional service connectors

Connectors remain disabled until a persistent `TOKEN_ENC_KEY` is configured.
HTTPS and trusted-proxy access are already configured through Cloudflare Tunnel.

Generate a 32-byte random key outside git and store it in a Kubernetes Secret;
reference it as `TOKEN_ENC_KEY` with `secretKeyRef`. Back up that key together
with the database: changing or losing it makes stored connector credentials
unreadable. Tokens and connector configuration belong in the app/PVC and
out-of-band Secrets, not in this repository.

For database backups, stop the deployment before copying `/data`, or use a
SQLite-aware online backup. Copying only a live database file can miss WAL data.
