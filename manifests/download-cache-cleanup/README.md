# BookOrbit download cache cleanup

Runs daily at **04:30 America/Toronto**. Retains completed local downloads for
at least **seven days after successful BookOrbit import**, not seven days after
file creation. Runs inside Kubernetes independently of desktop Codex.

The script reads BookOrbit records with a dedicated read-only database role.
It only considers the qBittorrent client with the exact internal Decypharr URL
and category `bookorbit`. To qualify, every successful import of the same hash
must be at least seven days old, its request must be available, its linked book
must be present, and all recorded library files must exist with matching sizes
under the three BookOrbit library mounts. Unconfirmed attempts block deletion;
a failed attempt superseded by an imported attempt for the same request is
ignored. An old import with no matched book is skipped rather than guessed.

The queue must independently report complete, 100% progress and no bytes left.
Its content directory must be a direct child of `/downloads/bookorbit` and agree
with the imported path, save directory and queue name. Ambiguous file-named
torrents whose displayed name differs from their download directory are retained.
The script repeats database, queue and library checks
immediately before deletion. These checks reduce races; no cross-application
transaction exists, so avoid manually reusing a completed download directory
while cleanup is running.

Deletion uses **only** Decypharr v2.7's qBittorrent
`POST /api/v2/torrents/delete` with `deleteFiles=true`. That handler removes the
local queued item and its local download path without a TorBox cleanup callback.
It does not delete TorBox cloud content. Library mounts in this job are read-only,
and the downloads directory is not mounted. Request history is retained.
Decypharr's separate managed catalogue may still list the provider entry; that
is not a second local copy. Revalidate API deletion semantics when upgrading
Decypharr, and schema/runtime compatibility when upgrading BookOrbit.

## Credentials

Run `python3 manifests/download-cache-cleanup/provision-credentials.py` with
trusted cluster access before syncing. It creates a dedicated DB login with
SELECT on only the required columns, a read-only transaction default, and a
10-second statement timeout. It copies Decypharr's API token to Secret
`download-cache-cleanup-credentials` in namespace `bookorbit`. No credentials
are printed or stored locally. Database writes and client encrypted credentials
are not granted. The Decypharr token itself is not scoped by upstream; protect
the Secret and refresh it with this script after rotating that token.
Back up the Secret with the database. Do not delete an existing Secret and then
regenerate credentials independently of the DB role.

Network policies allow these pods to reach PostgreSQL and Decypharr. The job
has no service account token, runs as UID/GID 1000, drops capabilities, and has
a read-only container filesystem. It uses BookOrbit 3.3.0's bundled `pg` module.

## Verification and operation

```sh
node --test tests/download-cache-cleanup.test.cjs
kubectl kustomize manifests/download-cache-cleanup
kubectl -n bookorbit get cronjob download-cache-cleanup
kubectl -n bookorbit get jobs -l app=download-cache-cleanup
```

For a dry run, create a Job from the CronJob with `--dry-run=client -o json`,
change the cleanup container's `DRY_RUN` env value to `true`, then create that
Job. Never remove the explicit DRY_RUN setting: the script fails closed without
it. Keep retention at seven or more days. Job logs contain skip reasons and
counts; they do not contain credentials or provider download URLs. Kubernetes
retains three successful and five failed Jobs. `concurrencyPolicy: Forbid`, a
10-minute deadline and one retry limit overlapping or stuck scheduled runs.

The job was deployed suspended and a live dry run passed on 2026-10-12 with
zero deletion candidates, zero deleted files and zero failures. It is now enabled.
Short-lived pods can initially receive a database connection refusal while k3s
network rules converge; bounded transient connection retries were validated
in the live dry run. Authentication failures are not retried.
To pause later, set `suspend: true` in git and let Argo sync.
Suspension does not stop an already-running Job; inspect it before changing it.
Failed checks leave the affected downloads in place. Review failed Jobs rather
than relaxing the guards to force removal. Cleanup does not sweep untracked,
failed, active, pending-review or unmatched downloads by filesystem age.

Successful end-to-end imports were verified in the live database on 2026-10-12.
The initial dry run should delete nothing because all imported downloads are
newer than seven days. Cleanup eligibility for an older unmatched test import
requires repairing its BookOrbit book association or manual review.
