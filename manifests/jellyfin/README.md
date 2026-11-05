# Jellyfin cutover

Jellyfin replaces Plex using the existing Intel GPU plugin and `/mnt/media`.
The official image includes Jellyfin FFmpeg and Intel userspace drivers. The
Intel device plugin injects the allocated GPU devices; no privileged container
or additional `/dev/dri` host mount is needed. The node still needs its working
i915 driver, `/mnt/media`, and video/render group IDs 44 and 993 (as used by Plex).
UID/GID 1000 needs read/traverse access to the media directories.

Config uses the previous `jellyfin-config` name (10Gi Longhorn), and transcodes
use the previous `jellyfin-transcode` PVC (50Gi) at `/transcode`. Both are protected
from automated Argo pruning. Media is mounted read-only at `/external-drive`
(the old production path) and `/media` (the test path) so restored library
definitions can keep either path. The archived Argo Application is restored;
native manifests replace the old unpinned HelmChart and its invalid symlink init
container, which referenced undeclared host-media/media volumes. The previous
LoadBalancer IP 10.0.0.249 now belongs to Home Assistant and must not be reused.

Read-only inspection on 2026-11-05 found no Jellyfin workloads, Services, or PVCs
and no current Longhorn volumes associated with Jellyfin. These claims will be
created if absent. Restore any separately retained config backup into
`jellyfin-config` before first startup if the old users/history are needed.
This does not import Plex users, metadata, or watch history. Before reusing an
older Jellyfin PVC, snapshot it and check version compatibility; upgrades may
migrate its database. Disposable cache uses a disk-backed 2Gi emptyDir; transcodes remain on Longhorn.

## Cutover after merge

1. Let Argo sync Plex to zero replicas (wave 4), then Jellyfin (wave 5).
   Plex remains managed so self-heal cannot restart it and consume the single
   GPU allocation. Do not simply delete its Application: it has no cascading
   deletion finalizer and could leave its pod running. The GPU request also
   prevents Jellyfin from taking the GPU until Plex has released it.
2. Check scheduling and readiness:
   ```sh
   kubectl -n plex get deploy,pods
   kubectl -n jellyfin rollout status deployment/jellyfin --timeout=600s
   kubectl -n jellyfin get pods -o wide
   kubectl -n jellyfin exec deploy/jellyfin -- ls -l /dev/dri
   kubectl -n jellyfin exec deploy/jellyfin -- \
     /usr/lib/jellyfin-ffmpeg/vainfo --display drm --device /dev/dri/renderD128
   ```
   If Pending, check `kubectl -n jellyfin describe pod` and the Intel plugin.
   The standalone `test-jellyfin` release must also be stopped if it owns the GPU.
3. Finish initial setup privately before publishing the tunnel route:
   ```sh
   kubectl -n jellyfin port-forward service/jellyfin 8096:8096
   ```
   Open `http://localhost:8096`, create the administrator, and add libraries at
   the existing library paths if restoring config, otherwise
   `/external-drive/Movies`, `/external-drive/TV`, and `/external-drive/Anime`.
4. Under Dashboard → Playback → Transcoding, select **Intel QuickSync (QSV)**,
   device `/dev/dri/renderD128`, and enable hardware encoding. Enable hardware
   decoding only for supported codecs. On the N100, leave AV1 *encoding* disabled
   (AV1 decoding is supported). Keep the transcoding directory at `/transcode`.
   These settings persist in `/config`; allocating the GPU alone does not enable
   Jellyfin's application-level hardware acceleration.
5. Configure the Cloudflare route below, then force a lower bitrate/resolution
   from an external client. Confirm playback reports transcoding and the FFmpeg
   log uses a QSV encoder such as `h264_qsv`; direct play does not exercise QSV.
   Check that seeking and WebSocket connections work through the public hostname.

## Cloudflare Tunnel

`manifests/cloudflared/deployment.yaml` runs two replicas of an existing
**remotely managed** tunnel using Secret `cloudflared/tunnel-token`, key `token`.
Its public hostname routes are configured in Cloudflare, not in git. Keep that
secret and connector deployment. Adding a local ingress ConfigMap would not
update the token-managed tunnel.

In Cloudflare Zero Trust, select the tunnel used by that secret and add/update
its published application route:

| Setting | Value |
| --- | --- |
| Public hostname | `jellyfin.nourez.dev` |
| Service type | HTTP |
| Origin URL | `jellyfin.jellyfin.svc.cluster.local:8096` |
| Path | Empty (all paths, including WebSockets) |

The full origin is `http://jellyfin.jellyfin.svc.cluster.local:8096`.
Both cloudflared pods can reach this ClusterIP service using cluster DNS.
Keep any existing media hostname as an additional route to the same origin if
clients use it. Retire its old Plex origin only after Jellyfin works externally.
Do not point the tunnel to localhost:8096 (that is the connector pod itself).
No node port, public ingress, or new tunnel token is required.

In Jellyfin's Network settings, enable remote connections and add the connector
pod IPs to **Known Proxies**, updating them if the pods move. If using a CIDR for
stability, verify and trust only the actual connector network; do not trust all
IP addresses. Leave Base URL empty. `JELLYFIN_PublishedServerUrl` advertises the
public URL; it does not create the Cloudflare route. The existing
optimized-versions-server already references `https://jellyfin.nourez.dev`.

## Rollback

Revert this PR and let Argo sync (or first commit Jellyfin replicas 0, wait for
its pod to terminate, then restore Plex replicas 1). The two services must not
compete for the single GPU. Restore the previous Cloudflare origin in the
dashboard. Plex's PVCs remain managed and untouched throughout this cutover;
Jellyfin's config PVC has `Prune=false` and should be backed up before any
explicit deletion. Do not delete namespaces or storage as part of rollback.

## References

- [Official container setup](https://jellyfin.org/docs/general/installation/container/)
- [Intel acceleration](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/intel/)
- [Reverse proxy settings](https://jellyfin.org/docs/general/post-install/networking/reverse-proxy/)
