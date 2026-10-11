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

### Temporary BookOrbit audioless compatibility patch

`audioless-patch.yaml` mounts a Node startup module hook. It changes only the
BookOrbit connector's EPUB request from `/files/:fileId/serve` to
`/files/:fileId/audioless-epub/download`. BookOrbit v3.3.0 preserves chapter XHTML,
sentence anchors, and spine order while stripping narration and media overlays.
This prevents large read-along EPUBs from hitting CrossPoint's 200 MiB archive
limit or its 10-second progress-refresh deadline. It applies to both position
conversion and highlight conversion and survives container/pod replacement.

The hook validates that the pinned connector contains exactly one expected
endpoint, and startup fails if that check does not pass. The immutable ConfigMap
has a versioned name; when editing the hook, create a new version and update the
Deployment's reference so Kubernetes rolls the pod. No credentials are in it.

Remove the hook command/arguments, mount, volume, and ConfigMap once an upstream
image includes an equivalent fix. Review this workaround before changing the
image digest or using a BookOrbit release without the audioless API. The upstream
image's default command is `node dist/index.js`.

Confirmed with a media-overlay EPUB: the original was 440,206,308 bytes; the
audio-free export was 2,314,585 bytes. The endpoint-only live test completed a
progress refresh in 2.01 seconds and imported 11 highlights. Reader testing
confirmed bidirectional position sync; device-originated annotation sync remains
untested.

## Service connectors

`TOKEN_ENC_KEY` comes from the out-of-band Secret `crosspoint-sync-connectors`,
key `token-enc-key`. This enables connector settings; services are only linked
when a user connects them in Settings → Connected services. HTTPS and
trusted-proxy access are configured through Cloudflare Tunnel.

Create this Secret before syncing a fresh installation, using a 32-byte random
key generated outside git. Never regenerate it for an existing installation.
Back up the Secret securely together with the database: changing or losing the
key makes stored connector credentials unreadable. The PVC backup does not
include this Kubernetes Secret. Tokens and connector configuration belong in
the app/PVC and out-of-band Secrets, not in this repository.

### BookOrbit and CrossPoint readers

1. In the CrossPoint Sync web UI, open Settings → Connected services → BookOrbit.
2. Enter `https://bookorbit.nourez.net` (no API path suffix) and the BookOrbit
   account's username and password. These are separate from the CrossPoint Sync
   account credentials. The connector encrypts the stored login and uses it to
   obtain/refresh BookOrbit API sessions.
3. On the reader, set its KOReader/CrossPoint Sync server URL to
   `https://crosspoint.nourez.net`, enter the CrossPoint Sync account credentials,
   and authenticate. Registration is disabled, so use the existing account.
4. Enable Send Metadata so the connector can match books by title/author. Use
   the same EPUB edition/file as BookOrbit for accurate position and highlight
   conversion. Enable Sync Clippings if the installed firmware supports it.
5. Test one book: upload progress from the reader, check the BookOrbit match and
   progress, then read further in BookOrbit and download progress on the reader.

The deployed BookOrbit connector is beta. It supports bidirectional progress
and highlights plus marking finished books as read. It converts positions
between KOReader XPath and EPUB CFI where possible; percentage is the fallback.
It does not implement BookOrbit reading-session or reading-time synchronization.
Book download/catalog browsing is separate from state sync; use BookOrbit's
OPDS catalog or transfer the same EPUB to the reader.

For database backups, stop the deployment before copying `/data`, or use a
SQLite-aware online backup. Copying only a live database file can miss WAL data.
