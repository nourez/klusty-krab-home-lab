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
