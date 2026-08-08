# AGENTS.md

## Project overview

**klusty-krab-home-lab** is a GitOps repository for a personal Kubernetes home lab. It contains Argo CD `Application` manifests under `apps/` and workload YAML/Helm values under `manifests/`. There is no application source code (no `package.json`, Dockerfiles for apps, or CI in-repo).

## Cursor Cloud specific instructions

### What runs here vs on the real cluster

- **In Cursor Cloud VMs**, treat this repo as **manifest development and validation**. A full stack (Longhorn, MetalLB, Plex with Intel GPU, host paths like `/mnt/media`) requires your **physical k3s cluster** and secrets that are not in git.
- **k3s/kind inside the Cloud VM usually fails** (nested container: overlayfs/cgroup limits). Do not spend time trying to boot a local cluster unless the VM explicitly supports it (Docker + privileged mode). Use **kubeconform**, **kustomize build**, and **helm template** instead of `kubectl apply` when no API server is available.
- If `kubectl` errors with `failed to download openapi` or `unable to recognize`, **unset `KUBECONFIG`** or point it at a healthy cluster. A broken partial k3s install leaves a bad default kubeconfig at `/etc/rancher/k3s/k3s.yaml`.

### Tooling (expected on the VM)

| Tool | Purpose |
|------|---------|
| `kubectl` | Client dry-run when a cluster exists |
| `helm` | Render charts (Plex via Argo, Jellyfin in `test-jellyfin/`) |
| `kustomize` | Build `manifests/intel-gpu-plugin/` |
| `kubeconform` | Schema-check Kubernetes YAML |
| `yamllint` | Style/syntax for YAML (`pip install --user yamllint`; add `~/.local/bin` to `PATH`) |

### Lint / validate (no cluster)

From repo root, with `KUBECONFIG` unset:

```bash
export PATH="$HOME/.local/bin:$PATH"

# YAML style (warnings OK on long lines)
find manifests apps -name '*.yaml' | xargs yamllint -d relaxed

# Kubernetes schema (exclude Helm values files and MetalLB CRDs without upstream schema)
find manifests -name '*.yaml' ! -name 'values.yaml' ! -path '*/metallb/*' \
  | xargs kubeconform -summary -ignore-missing-schemas

# Kustomize
kustomize build manifests/intel-gpu-plugin

# Helm render (Jellyfin test stack)
helm repo add jellyfin https://jellyfin.github.io/jellyfin-helm
helm repo update
helm template jellyfin-test jellyfin/jellyfin -f test-jellyfin/values.yaml

# Argo CD app YAML parse
python3 -c "import yaml,glob; [list(yaml.safe_load_all(open(f))) for f in glob.glob('apps/*.yaml')]"
```

`manifests/plex/values.yaml` is **Helm values**, not a Kubernetes resource—exclude it from kubeconform.

### Deploy on the real home lab

1. Install Argo CD on the cluster.
2. `kubectl apply -f apps/root-app.yaml` (bootstraps all `apps/*.yaml`).
3. Create required secrets out-of-band (Cloudflare tunnel, Grimmory DB, sync tokens, etc.).
4. Ensure node host paths (e.g. `/mnt/media`) and optional Intel GPU stack before syncing Plex.

Optional GPU test (on cluster, not in Argo apps): see `test-jellyfin/README.md` and `./test-jellyfin/deploy.sh`.

### Key paths

- `apps/` — Argo CD Applications (app-of-apps: `root-app.yaml`)
- `manifests/<service>/` — Per-service Kubernetes manifests
- `test-jellyfin/` — Standalone Jellyfin + Intel QSV experiment

## Home Assistant

GitOps covers the **k8s shell only** (`apps/homeassistant-app.yaml`, `manifests/homeassistant/`). All HA YAML, HACS, entity registry edits, and integrations live on the Longhorn PVC `homeassistant-config` at `/config` — **not in this repo**. Expect to `kubectl exec` / scale the deployment when changing live config.

### Cluster facts

| Item | Value |
|------|--------|
| Namespace / deploy | `homeassistant` / `homeassistant` |
| Image | `ghcr.io/home-assistant/home-assistant:2026.8.0` (bump tag in `deployment.yaml` to upgrade) |
| UI | MetalLB `http://10.0.0.249` (Service `80 → 8123`); also node `:8123` via `hostNetwork` |
| Strategy | `Recreate` (single replica + hostNetwork) |
| Networking | `hostNetwork: true` + `dnsPolicy: ClusterFirstWithHostNet` (discovery / HomeKit / Cast) |
| Bluetooth | Host `/run/dbus` mounted; `NET_ADMIN`/`NET_RAW`; `appArmorProfile: Unconfined`. Node needs `bluez` / `bluetooth.service` running |
| Access model | LAN + HomeKit Bridge (Apple home hub). Do **not** Cloudflare-tunnel HA unless explicitly requested |

### Known pitfalls

- **Pending pod / host port clash:** LoadBalancer must stay `port: 80` → `targetPort: 8123`. Publishing Service port `8123` makes k3s ServiceLB claim host `8123`, so the hostNetwork pod cannot schedule (same pattern as Homebridge).
- **Argo self-heal:** Live `kubectl apply` on git-managed manifests gets reverted. Change git (or only mutate `/config` on the PVC).
- **Config vs git:** Packages, `configuration.yaml`, `.storage/*`, `custom_components/` are on the PVC. Back them up before risky edits.

### Safe PVC / registry edits

Entity registry and restore-state edits need HA stopped so it does not overwrite files:

```bash
kubectl -n homeassistant scale deployment/homeassistant --replicas=0
kubectl -n homeassistant wait --for=delete pod -l app=homeassistant --timeout=120s
# edit via a short-lived pod mounting PVC homeassistant-config at /config, or after scale-up via exec
kubectl -n homeassistant scale deployment/homeassistant --replicas=1
kubectl -n homeassistant rollout status deployment/homeassistant --timeout=180s
```

Key paths on the PVC:

- `/config/configuration.yaml` — includes `homeassistant.packages: !include_dir_named packages`
- `/config/packages/unified_sony_tvs.yaml` — unified Sony BRAVIA media players
- `/config/custom_components/` — HACS + `template_media_player` (`EuleMitKeule/template-media-player`)
- `/config/.storage/core.entity_registry` — hide/disable entities (`hidden_by: user`)
- `/config/.storage/core.restore_state` — remove orphan entity IDs so they do not return after restart

Recorder DB history (`home-assistant_v2.db` / `states_meta`) can still list old `entity_id`s; that does **not** mean they are live. Prefer registry + restore_state over deleting DB rows.

### Unified TVs (current design)

Sony BRAVIA sets expose both **Cast** and **Android TV Remote**. A HACS custom component **`template_media_player`** merges them:

| Unified entity | Area | Cast (metadata / browse) | Android TV Remote (power / volume) |
|----------------|------|--------------------------|-------------------------------------|
| `media_player.living_room_bravia` (“Living Room TV”) | `living_room` | `media_player.living_room_tv` | `media_player.living_room_tv_2` |
| `media_player.nourez_s_bedroom_bravia` (“Nourez's Bedroom TV”) | `bedroom` | `media_player.nourezs_tv` | `media_player.nourezs_tv_2` |

Backing Cast / Android TV / `remote.*` entities are `hidden_by: user`. Volume uses step up/down (no `volume_set` on Android TV Remote); power uses on/off buttons (`assumed_state`).

Also hidden for now: `media_player.basement_tv` (unused; may be disconnected later).

After renames, **orphan** `entity_id`s (e.g. old `media_player.sony_tv`) can linger in restore_state and show under Media → **Other media players**. Remove them from `core.restore_state` with HA scaled to 0, then restart.

### HACS / upgrades

- HACS install (in pod): `wget -O - https://get.hacs.xyz | bash -` into `/config/custom_components/hacs`, then restart HA; finish GitHub OAuth in UI.
- Image upgrades: change the tag in `manifests/homeassistant/deployment.yaml`, PR/merge, let Argo sync. PVC `/config` persists across upgrades.
- Prefer validating package YAML with HA stopped or via `exec` + config check; avoid committing secrets from `/config` into git.
