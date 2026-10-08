# BookOrbit

Isolated deployment alongside Grimmory, Audiobookshelf, ABS-KoSync and their
existing sync services. BookOrbit has its own writable ebook, audiobook and comics
folders for evaluation and continued use. No existing workload or media file is
changed, moved or copied automatically.

## Verified upstream configuration (2026-10-08)

- [BookOrbit 3.3.0](https://github.com/bookorbit/bookorbit/releases/tag/v3.3.0)
  publishes `ghcr.io/bookorbit/bookorbit:3.3.0` for amd64 and arm64.
- [Official installation](https://bookorbit.app/installation) and
  [Compose](https://github.com/bookorbit/bookorbit/blob/main/docker-compose.yml)
  use port 3000, `/data`, PostgreSQL plus pgvector, and `POSTGRES_*`,
  `JWT_SECRET`, `SETUP_BOOTSTRAP_TOKEN`, `APP_URL`, `PUID` and `PGID`.
- Database: upstream's `pgvector/pgvector:pg18`, pinned to the multi-architecture
  digest returned by the Docker Hub tag API on 2026-10-08. PostgreSQL 16+
  requires `uuid-ossp`, `pg_trgm`, `unaccent` and `vector`. The app runs database
  migrations at startup; verify the extensions after rollout.
- App probes use upstream's `/api/v1/health`; database probes use `pg_isready`.
- Writable storage must have local filesystem semantics; upstream does not
  support network/distributed writable filesystems. No Longhorn is used.

## Storage and prerequisites

The repository's actual media root is `/mnt/media`, not `/media`. During
preflight, Grimmory reported `/books` backed by ext4 on `/dev/sdc`, with owner
1000:1000. Verify the host mount again before creating directories.

Run on `klusty-krab-node-1`:

```sh
findmnt -T /mnt/media -o SOURCE,TARGET,FSTYPE,OPTIONS
mountpoint /mnt/media
df -h /mnt/media
sudo install -d -m 0755 -o 1000 -g 1000 \
  /mnt/media/BookOrbit/app /mnt/media/BookOrbit/books \
  /mnt/media/BookOrbit/audiobooks /mnt/media/BookOrbit/comics
sudo install -d -m 0700 /mnt/media/BookOrbit/postgres
```

Do not proceed if the USB drive is absent or the target resolves to the node's
root filesystem. Keep the drive mounted before k3s starts. The local PV paths
must exist; Kubernetes does not create them. The PostgreSQL init container sets
only its mounted volume root to the image's `postgres:postgres` owner and mode
0700. This allows PostgreSQL to traverse a directory created by root. The image
entrypoint initializes and owns its dedicated `pgdata` subdirectory. Never
recursively chown the media root.

- App and database have dedicated local PVs/PVCs, node affinity, `Retain`, and
  Argo `Prune=false`. Namespace and PVCs are also protected from pruning.
- PV capacities of 10Gi are binding declarations, **not disk quotas**. Both
  directories share the USB drive's free space. Monitor disk usage.
- `/mnt/media/BookOrbit/books` -> `/books/ebooks`: writable ebook library.
- `/mnt/media/BookOrbit/audiobooks` -> `/books/audiobooks`: writable audio library.
- `/mnt/media/BookOrbit/comics` -> `/books/comics`: writable comics library.
- `/mnt/media/BookOrbit/app` -> `/data`: writable BookOrbit state.
- Media directories must be owned by UID/GID 1000:1000. Startup adjusts
  ownership under `/data`, but does not repair the media directories.
- Uploads, folder creation, renames and metadata writeback can use BookOrbit's
  own libraries. Existing Grimmory and Audiobookshelf folders are not mounted.
- When upgrading from the initial shared-library manifests, remove any library
  configured for `/books/evaluation` from BookOrbit settings and review libraries
  using `/books/ebooks` and `/books/audiobooks`: those paths now point to fresh
  dedicated folders. The old `app/evaluation-books` directory is retained on disk
  but no longer mounted as a library; no files are moved or deleted. Do not run
  a missing-file cleanup against old library records until reviewing them.
- This is application/data isolation, not a security boundary for a compromised
  hostPath workload. PostgreSQL ingress is restricted to BookOrbit pods.

## Secrets

Create a dedicated `bookorbit-secrets` Secret out of band. Do not commit it or
reuse existing app/integration credentials. This script generates three
independent values without printing them or putting them in command arguments:

```sh
kubectl apply -f manifests/bookorbit/namespace.yaml
python3 - <<'PY'
import json, secrets, subprocess
values = {
    "POSTGRES_PASSWORD": secrets.token_hex(24),
    "JWT_SECRET": secrets.token_hex(32),
    "SETUP_BOOTSTRAP_TOKEN": secrets.token_hex(16),
}
resource = {
    "apiVersion": "v1", "kind": "Secret",
    "metadata": {"name": "bookorbit-secrets", "namespace": "bookorbit"},
    "type": "Opaque", "stringData": values,
}
existing = subprocess.run(
    ["kubectl", "-n", "bookorbit", "get", "secret", "bookorbit-secrets",
     "--ignore-not-found", "-o", "name"],
    check=True, capture_output=True, text=True,
)
if existing.stdout.strip():
    raise SystemExit("Secret already exists; do not rotate initialized database credentials")
subprocess.run(["kubectl", "create", "-f", "-"],
               input=json.dumps(resource), text=True, check=True)
PY
```

Retrieve the setup bootstrap token privately when opening the setup wizard:

```sh
kubectl -n bookorbit get secret bookorbit-secrets \
  -o jsonpath='{.data.SETUP_BOOTSTRAP_TOKEN}' | base64 --decode
```

Back up the Secret securely with the database and app data. Do not regenerate
the database password for an already initialized PGDATA directory.

## GitOps rollout and initial Cloudflare Tunnel access

1. Prepare the node directories and Secret before publishing the app manifest.
2. Merge the BookOrbit-only changes to the branch tracked by `root-app` (`HEAD`
   resolves to the repository default branch). Root-app discovers
   `apps/bookorbit-app.yaml` and BookOrbit automatically syncs.
3. In the existing remotely managed Cloudflare Tunnel, add one published
   application route:
   - Hostname: `bookorbit.nourez.net`
   - Service type: HTTP
   - URL: `http://traefik.kube-system.svc.cluster.local:80`
   - HTTP Host Header: `bookorbit.nourez.net`
   This uses the new Traefik IngressRoute and ClusterIP app Service. Cloudflare
   terminates public HTTPS; the existing connector reaches Traefik inside k3s.
   No router port forward, new MetalLB IP, or cloudflared manifest edit is needed.
4. `APP_URL` and `CLIENT_URL` are already `https://bookorbit.nourez.net`.
   Use this same URL in the web, iOS and KOReader clients. A browser-only Access
   login can interfere with native clients; evaluate that separately rather than
   placing an untested interactive login flow in front of the BookOrbit APIs.
5. Complete the bootstrap wizard and create an administrator account. Leave
   Hardcover disconnected and all migration credentials absent.

Cloudflare hostname/DNS routes are dashboard-managed, outside this GitOps repo.
Existing routes must remain unchanged. Cloudflare plan limits on uploads and
long requests should be tested with representative files before relying on
remote imports. A hostname response alone is not proof that audiobook seeking,
downloads or Watch transfers work.

## Validation

From the repository:

```sh
yamllint -d relaxed apps/bookorbit-app.yaml manifests/bookorbit/*.yaml
kubeconform -summary -ignore-missing-schemas manifests/bookorbit/*.yaml
kubectl apply --dry-run=server -f manifests/bookorbit/
kubectl apply --dry-run=server -f apps/bookorbit-app.yaml
```

Live rollout:

```sh
kubectl -n argocd get application bookorbit
kubectl -n bookorbit get pvc,pods,services
kubectl -n bookorbit rollout status deployment/bookorbit-postgres --timeout=300s
kubectl -n bookorbit rollout status deployment/bookorbit --timeout=600s
kubectl -n bookorbit logs deployment/bookorbit --tail=100
kubectl -n bookorbit exec deployment/bookorbit-postgres -- \
  psql -U bookorbit -d bookorbit -c \
  "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp','pg_trgm','unaccent','vector');"
curl --fail https://bookorbit.nourez.net/api/v1/health
kubectl -n bookorbit exec deployment/bookorbit -- sh -c \
  'awk '\''$2 == "/books/ebooks" || $2 == "/books/audiobooks" || $2 == "/books/comics" {print $2, $4}'\'' /proc/mounts'
```

All three dedicated media mounts must report `rw`. Verify folder creation and an
upload in each library through BookOrbit. Check the existing Argo apps remain
healthy. Backups must cover all three media directories as well as app/database state.

Evaluation sequence:

1. Create separate libraries using `/books/ebooks`, `/books/audiobooks` and
   `/books/comics`.
   Upload independent books or explicitly copy sample files into these new
   directories; do not move files out of the existing libraries. Use Folder as
   Book for multi-track audiobooks. Confirm counts and representative titles.
2. On cellular, log into the official BookOrbit iOS app, play/seek an audiobook,
   download it, play offline, reconnect and verify progress reconciliation.
   Upstream requires server 3.0+, iOS 26+, and watchOS 26+ for Watch features.
3. Transfer an audiobook to Watch and play offline with the phone unavailable.
4. Pair a test KOReader profile with BookOrbit's official plugin. Test sync in
   both directions without changing the existing bridge/client profiles.
5. Test CrossPoint KoSync separately against the pinned server and record the
   firmware version; compatibility has had upstream regressions. Do not assume
   the KOReader plugin and CrossPoint share exact position representations.
6. Put a legally owned test EPUB3 with SMIL media overlays and embedded narration
   in `/books/ebooks`; test Read Along and offline playback. Separate EPUB
   and M4B files alone do not provide sentence-aligned read-along timing.
7. Hardcover is a required later test, but **do not supply a token or enable
   sync until explicitly approved**. Use selected books only when approved,
   verify matches and edition page counts, and test with an isolated book.
   The existing ABS-Hardcover service keeps running; avoid competing writers
   to the same Hardcover record during evaluation.
8. History import is a separate evaluation step after scanning: back up
   BookOrbit, perform a dry run and review user/path mapping before import.
   Upstream supports Grimmory and ABS, with source-dependent omissions; this
   repo's ABS 2.34.0 is older than the docs' tested 2.36.0. No source database,
   credential, or live config PVC is attached by this deployment.

References: [Hardcover](https://bookorbit.app/hardcover/),
[migration](https://bookorbit.app/migration/),
[read-along](https://bookorbit.app/storyteller-read-aloud/),
[KOReader](https://bookorbit.app/koreader/),
[CrossPoint issue](https://github.com/bookorbit/bookorbit/issues/951).

## Backup and rollback

Back up the dedicated BookOrbit database with `pg_dump`, app state, the Secret
and all three media directories before image upgrades or history imports. Do not
copy live PGDATA as a database backup. Stop BookOrbit while taking a consistent app/database backup;
set replicas to zero **in git**, since Argo self-heal reverts live scaling.

To stop the evaluation, set both BookOrbit deployment replicas to zero in git
and let Argo sync. Remove only `bookorbit.nourez.net` from the Cloudflare Tunnel.
Existing applications and their routes remain unchanged.

For removal, first stop BookOrbit via git, then remove its app and manifests.
Since the child Application has no cascade finalizer, deleting it alone does
not remove its workloads. Explicitly remove only BookOrbit's Deployments,
Services, ConfigMap, IngressRoute and NetworkPolicy if they remain. Keep its
namespace, Secrets, PVCs, PVs and `/mnt/media/BookOrbit` directories until the
evaluation data is no longer needed. Do not delete the namespace: that would
also delete its Secrets and PVCs.

For a failed upgrade, restore the corresponding database backup into a fresh
BookOrbit-only data directory and restore matching app state and image version.
Reverting an image alone may fail after automatic schema migrations. Never
delete or restore over existing Audiobookshelf/Grimmory directories.
