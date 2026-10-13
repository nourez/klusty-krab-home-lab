# Nest Doorbell to HomeKit

The wired Gen 2 doorbell exposes WebRTC through the Nest integration. HA's
HomeKit camera adapter requires an FFmpeg-readable source; its logs report
`Camera has no stream source`. Nest's WebRTC camera entity also returns a
placeholder snapshot. Keep Nest for events, and bridge a Generic Camera backed
by this local adapter for live video and snapshots.

## Adapter build

go2rtc v1.9.14 has a second bug: cold RTSP clients bind to an empty H.264 receiver
when Nest transmits on a different negotiated payload type. This image applies
the inspected patch from [upstream PR #2480](https://github.com/AlexxIT/go2rtc/pull/2480)
to the checksum-pinned v1.9.14 source. The patch is still unmerged as of
2026-10-13. Remove this custom build once an official release includes the fix.

The unpatched binary negotiated codecs but delivered no decodable video in the
live cluster test. The patched binary delivered a real JPEG frame from a cold
RTSP connection. Full HomeKit playback and long-running renewal still need
verification after deployment.

The cluster downloads the patched Linux/amd64 binary from the repository's
`nest-go2rtc-1.9.14-nest1` GitHub release into an `emptyDir` init volume and
verifies its SHA-256 before execution. The sidecar uses the same cached HA
image, overriding its command to run only go2rtc. No registry publishing or
pull credentials are required. A pod recreation needs GitHub release access.
The pinned binary targets the current amd64 home lab nodes.

Rebuild and publish the asset **before changing its pinned checksum in git**:

```bash
docker buildx build --platform linux/amd64 \
  -t ghcr.io/nourez/go2rtc-nest:1.9.14-nest1 --load tools/nest-go2rtc
docker create --platform linux/amd64 --name nest-go2rtc-extract \
  ghcr.io/nourez/go2rtc-nest:1.9.14-nest1
docker cp nest-go2rtc-extract:/usr/local/bin/go2rtc /tmp/go2rtc-nest-linux-amd64
docker rm nest-go2rtc-extract
shasum -a 256 /tmp/go2rtc-nest-linux-amd64
# Upload to the versioned GitHub release, then update the manifest URL/checksum.
bash tools/nest-go2rtc/create-secret.sh
```

The script copies the existing Nest OAuth credentials directly into the
`homeassistant/nest-go2rtc` Secret without printing them. Re-run it after Nest
reauthorization, then restart the deployment so go2rtc reads the new credentials.
The adapter gets only its own Secret and has no access to the HA PVC. RTSP is
loopback-only on port 18564; its HTTP API, WebRTC listener and SRTP listener are
disabled. The configuration disables logging to prevent upstream source URLs
from exposing credentials.

Merge/sync via Argo CD once the image and Secret exist. Adding the sidecar
recreates the HA pod and briefly interrupts HA. Do not apply a competing live
Deployment; Argo self-heal will revert it.

## HA and Apple Home setup after deployment

1. Add the **Generic Camera** integration. Set Stream Source to
   `rtsp://127.0.0.1:18564/nest_doorbell`, leave Still Image URL empty, and use
   TCP transport. HA's default `stream` integration generates snapshots from
   RTSP. Name the entity `camera.front_door_homekit`.
2. Verify both its live view and snapshot in HA. Disable Preload Stream initially
   so the cloud camera is opened on demand.
3. Reconfigure the existing **Front Door Doorbell:21072** HomeKit accessory to
   include this new camera in place of `camera.front_door_front_door_doorbell`.
   Enable native H.264 (`video_codec: copy`) and audio if desired. Link the
   original Nest doorbell and motion event entities to this camera:
   `event.front_door_front_door_doorbell_chime` and
   `event.front_door_front_door_doorbell_motion`.
4. Keep both camera entities out of other HomeKit bridges to avoid duplicates.
   A separate HASS Bridge N2 was also found in the live config; inspect its
   filter before allowing the new Generic Camera to be auto-exported.
5. Test the thumbnail, live video, audio and a physical doorbell press in Apple
   Home. Repeat live view after more than five minutes to verify Nest stream
   renewal. Changing the exposed entity may require resetting/re-pairing this
   single accessory; preserve its room and notification settings first.

HomeKit pairing/options remain on `/config`, outside git. This setup targets
live video and snapshots; it does not implement HomeKit Secure Video or two-way
talk. To roll back, revert the sidecar manifest and switch the HomeKit filter
back to the original camera; keep the Nest integration and its events.

References: [Nest camera capabilities](https://www.home-assistant.io/integrations/nest/#camera),
[go2rtc Nest source](https://github.com/AlexxIT/go2rtc/blob/master/internal/nest/README.md),
[Generic Camera](https://www.home-assistant.io/integrations/generic/),
[HomeKit Bridge](https://www.home-assistant.io/integrations/homekit/).
