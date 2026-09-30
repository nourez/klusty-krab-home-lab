# Codex Runner

Persistent SSH workspace for Codex tasks started from mobile. One replica uses
250m CPU / 512Mi memory requests and 1 CPU / 2Gi memory limits. A 10Gi expandable
Longhorn PVC stores `/home/runner`: projects, Codex login, sessions, preferences,
GitHub credentials, and SSH host keys. The volume has one replica for this
single-node cluster. `Recreate` prevents two pods using the workspace at once.

## Before syncing

Install the supplied AppArmor profile on `klusty-krab-node-1` before syncing.
This node has `kernel.apparmor_restrict_unprivileged_userns=1`; the profile allows
user namespaces for this container without changing the node-wide restriction.
Copy `codex-runner.apparmor` to the node, then run there:

```bash
sudo install -m 0644 codex-runner.apparmor /etc/apparmor.d/codex-runner
sudo apparmor_parser -r /etc/apparmor.d/codex-runner
```

The profile persists on disk and loads with AppArmor on subsequent node boots.
Kubernetes rejects startup if the named profile is not loaded.

Create the namespace and SSH public-key Secret out of band. Use the public key
corresponding to the private key you will select in mobile's SSH setup. Multiple
public keys can be included, one per line; private keys must not go in this Secret
or in git.

```bash
kubectl create namespace codex-runner --dry-run=client -o yaml | kubectl apply -f -
kubectl -n codex-runner create secret generic codex-runner-ssh \
  --from-file=authorized_keys=/path/to/runner-authorized-keys \
  --dry-run=client -o yaml | kubectl apply -f -
```

After these manifests reach the branch watched by the root Argo application,
Argo creates the runner app and syncs it. The pod waits for the Secret if it is
missing. No changes to existing applications or the default StorageClass are
needed. The bootstrap ConfigMap is read at each container start; restart the
Deployment after changing bootstrap scripts or SSH settings.

The SSH public-key file uses a Secret `subPath` mount so its parent directory
has permissions accepted by OpenSSH's `StrictModes`. SubPath mounts do not
receive Secret updates automatically. After adding or replacing authorized
keys in the Secret, restart the Deployment:

```bash
kubectl -n codex-runner rollout restart deployment/codex-runner
```

## Connect and sign in

MetalLB endpoint: **10.0.0.239:2222**, SSH username **runner**. Port 2222 avoids
conflicting with the node's SSH port when k3s ServiceLB starts its helper pod.
This address was unused by cluster Services when the manifests were created.
Use LAN access or an existing VPN to reach it away from home; the manifests do
not configure an internet tunnel.

```bash
kubectl -n codex-runner rollout status deployment/codex-runner --timeout=900s
ssh -p 2222 -i /path/to/runner-private-key runner@10.0.0.239
```

Inside the SSH session:

```bash
codex login --device-auth
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh repo clone nourez/klusty-krab-home-lab /home/runner/projects/klusty-krab-home-lab
kubectl get nodes
kubectl top nodes
```

Complete the displayed device login steps in your browser. In mobile Remote,
choose SSH, enter the address, port, and user above, and select the matching
private key. Choose `/home/runner/projects/klusty-krab-home-lab` as the workspace.
The SSH client manages the Codex server; the pod keeps SSH available without
requiring a running desktop app. Verify the first mobile task while your laptop
is offline, since mobile's SSH setup can vary by app version.

For clients asking for a manual remote-control pairing code instead:

```bash
codex remote-control start
codex remote-control pair
```

Check the SSH host-key fingerprint against the pod before accepting it:

```bash
kubectl -n codex-runner exec deployment/codex-runner -- \
  ssh-keygen -lf /home/runner/.ssh/host-keys/ssh_host_ed25519_key.pub
```

## Tools and permissions

The base image is `node:24-bookworm-slim`, pinned by digest. Each container start installs Codex
CLI **0.159.1**, kubectl **v1.32.5** (matching the cluster minor), Git, GitHub CLI,
Python with PyYAML/venv, yamllint, jq, ripgrep, and bubblewrap. Startup requires
outbound access to Debian, npm, and `dl.k8s.io`, and can take several minutes.
Codex execution requires outbound access to OpenAI. There is no custom image to
build or publish. Debian package updates are not pinned; update the base image
digest and Codex version in `deployment.yaml` deliberately. Helm and kubeconform are not
preinstalled.

SSH sessions run as UID 1000 with no sudo. The root SSH daemon starts sessions
and installs tools; Codex itself runs as `runner`. Container seccomp is unconfined
and the named AppArmor profile permits user namespaces so bubblewrap can create
the namespaces needed for Codex's command sandbox. The pod is not privileged, adds no capabilities,
and mounts no node filesystem or container runtime socket. Test the sandbox
after connecting:

```bash
codex sandbox -- /bin/true
```

Codex starts with `workspace-write` and `on-request` approval defaults. Its
service account can inspect workloads, logs, nodes, metrics, storage, Argo
Applications, and Longhorn health. It cannot read Secrets, exec into other pods,
or change cluster resources. Normal persistent workload changes go through Git
and Argo CD. Operations such as Home Assistant PVC edits require a separately
scoped RBAC grant before the runner can perform them; do not copy your admin
kubeconfig into the runner.

The service-account kubeconfig uses `tokenFile`, so Kubernetes token rotation
continues to work in long-lived SSH sessions. Kubernetes RBAC remains effective
even when a Codex command is approved outside its command sandbox.

## Persistence and recovery

PVC pruning is disabled and the StorageClass uses `Retain`. App removal leaves
the home volume for deliberate cleanup. One Longhorn replica provides no
redundancy; back up this volume, including the Codex and GitHub credentials.
Existing home directories are reused without changing user preferences.

All tasks share the pod's CPU and memory limits. Start with one active task;
use cloud runners or the MacBook for large builds. Losing this node also loses
access to the runner, so retain an independent cluster recovery path.
