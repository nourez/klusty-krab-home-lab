# Beeper WhatsApp bridge

Argo CD deploys one `bbctl run sh-whatsapp` instance using Beeper's bridge-manager
container. The Longhorn PVC at `/data` keeps the bridge config, database, and
WhatsApp session across pod restarts. The official bridge uses an outbound
appservice websocket, so it needs no Kubernetes Service or Ingress.

Before syncing, create the `beeper` namespace and supply your Beeper Matrix
access token as a Kubernetes Secret. Keep the token out of Git and shell history.
The token is available in Beeper Desktop under Settings > Help & About or in
`~/.config/bbctl/config.json` after `bbctl login`. Put only the token in the
file, with no trailing newline.

```sh
kubectl create namespace beeper
kubectl -n beeper create secret generic beeper-bridge-manager \
  --from-file=MATRIX_ACCESS_TOKEN=/path/to/token-file
```

After Argo CD syncs, check the pod logs:

```sh
kubectl -n beeper logs deployment/beeper-whatsapp -f
```

Connect WhatsApp by messaging `@sh-whatsappbot:beeper.local` in Beeper and
following the bridge bot's instructions. Back up the PVC with your usual
Longhorn backup process: it contains credentials and session state. The
bridge-manager image currently uses the upstream `latest` tag because upstream
does not publish matching versioned container tags.

Sources: [bridge-manager](https://github.com/beeper/bridge-manager),
[container usage](https://github.com/beeper/bridge-manager/blob/main/docker/README.md).
