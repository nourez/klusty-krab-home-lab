# CrossPoint Sync

Self-hosted [CrossPoint Sync](https://github.com/crosspoint-reader/crosspoint-sync)
for CrossPoint, CrossInk, and KOReader. One replica uses SQLite on a 2 GiB
Longhorn PVC mounted at `/data`. `Recreate` prevents overlapping writers during
updates. The PVC is excluded from Argo pruning; deleting the namespace or PVC
manually can still delete its Longhorn volume.

## Access and initial setup

- Web UI: `http://10.0.0.240/app/`
- Reader sync server URL: `http://10.0.0.240` (no `/app/` suffix)
- Health: `http://10.0.0.240/healthz`

Create an account in the web UI or your reader's KOReader Sync settings.
After creating the required accounts, change `REGISTRATION_DISABLED` to `"true"`
in `deployment.yaml` and merge the change so Argo applies it.

## Deployment

`apps/crosspoint-sync-app.yaml` is discovered by the root Argo application.
Merge these manifests into the default branch and let Argo sync them.
The upstream `main` image is pinned by digest; update the digest explicitly
when upgrading.

## Optional service connectors

Connectors require HTTPS and a persistent `TOKEN_ENC_KEY`. Before enabling them,
configure a trusted HTTPS reverse proxy, restrict direct access to the pod to
that proxy, and ensure it overwrites client-supplied `X-Forwarded-Proto`.
Only then enable `TRUST_PROXY`.

Generate a 32-byte random key outside git and store it in a Kubernetes Secret;
reference it as `TOKEN_ENC_KEY` with `secretKeyRef`. Back up that key together
with the database: changing or losing it makes stored connector credentials
unreadable. Tokens and connector configuration belong in the app/PVC and
out-of-band Secrets, not in this repository.

For database backups, stop the deployment before copying `/data`, or use a
SQLite-aware online backup. Copying only a live database file can miss WAL data.
