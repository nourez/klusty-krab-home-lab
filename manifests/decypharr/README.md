# Decypharr

Decypharr v2.7 for TorBox, reachable on the LAN at `http://10.0.0.240`
and from BookOrbit at `http://decypharr.decypharr.svc.cluster.local` (port 80).
There is no Ingress or Cloudflare Tunnel route. Ingress policy allows the
10.0.0.0/24 LAN and BookOrbit app pods; no NodePort is allocated.

## Storage and configuration

The 2Gi Longhorn PVC stores `/app`, including mutable config, authentication,
provider credentials and queue state. Back it up securely. Git contains only
an initial configuration copied when `/app/config.json` does not exist.
Changes to the bootstrap ConfigMap do not overwrite an initialized instance.
Namespace and PVC are protected from Argo pruning.

Downloads use `/mnt/media/BookOrbit/downloads` on `klusty-krab-node-1`, mounted
as `/downloads` in both Decypharr and BookOrbit. The directory must exist on
the mounted USB media drive and be owned by 1000:1000 before syncing. Check
`findmnt -T /mnt/media` and `mountpoint /mnt/media` first; never create it on
an unmounted media path. Download capacity shares the drive's free space.

Use **download** as the default download action and **none** as the mount type.
This downloads real files from TorBox for BookOrbit imports, requiring no FUSE,
SYS_ADMIN, mount propagation, or privileged container. Do not select symlinks
or DFS/rclone mounts with this deployment. Downloads are writable in BookOrbit
to support its hardlink/import workflow. No existing library paths change.

## Finish setup

1. Open `http://10.0.0.240`. Create a Decypharr username and password.
2. Select TorBox and enter its API key privately. Skip Usenet.
3. Set download directory to `/downloads` and mount system to **none**.
4. Finish the wizard. In Settings, confirm default download action is
   **download**; enable uncached downloads only if desired for your TorBox plan.
5. In BookOrbit: Settings > Server > Requests > Download clients, add
   **qBittorrent** with URL `http://decypharr.decypharr.svc.cluster.local`,
   Decypharr credentials, and category `bookorbit`. If separate host/port
   fields are shown, use `decypharr.decypharr.svc.cluster.local`, port `80`,
   and SSL off. Map remote `/downloads` to local `/downloads`.
6. Test the connection and hardlinks. Configure an appropriate torrent source
   in BookOrbit separately. Use a permitted test release to verify download,
   import and library access before enabling automation.

Provider keys and BookOrbit download-client credentials stay outside git.
BookOrbit already has `BOOK_REQUEST_ENCRYPTION_KEY` configured for encrypted
client credentials. TorBox uses the qBittorrent interface here; BookOrbit's
NZBGet integration is not compatible with Decypharr's SABnzbd interface.

## Validation and operations

```sh
yamllint -d relaxed apps/decypharr-app.yaml manifests/decypharr/*.yaml
kubeconform -summary -ignore-missing-schemas manifests/decypharr/*.yaml
kubectl -n decypharr get pods,pvc,svc
kubectl -n decypharr rollout status deployment/decypharr --timeout=300s
kubectl -n bookorbit rollout status deployment/bookorbit --timeout=600s
```

TCP probes permit the initial setup wizard to become reachable before a
provider is configured. They verify the listener, not TorBox functionality.
After completing setup, `/usr/bin/healthcheck --config /app` inside the
container additionally checks API, UI and WebDAV listeners. A permitted
test download is required to establish end-to-end BookOrbit compatibility.

Service environment injection is disabled and `DECYPHARR_PORT` is explicitly
set to 8282. Otherwise Kubernetes injects a `tcp://...` Service URL under this
same name, which Decypharr interprets as its listen port.

To stop the service, set replicas to zero in git. Retain the PVC and download
directory during rollback/removal. Deleting the Application alone does not
cascade-delete resources. Deleting the namespace explicitly deletes its PVC;
the Longhorn storage class has a Delete reclaim policy.

Sources: [installation](https://docs.decypharr.com/guides/installation/),
[v2.7 source](https://github.com/sirrobot01/decypharr/tree/v2.7),
[BookOrbit clients and path mappings](https://bookorbit.app/book-requests/).
