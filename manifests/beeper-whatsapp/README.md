# Beeper WhatsApp bridge

Argo CD deploys one `bbctl run sh-whatsapp` instance using Beeper's bridge-manager
container. The Longhorn PVC at `/data` keeps the bridge config, database, and
WhatsApp session across pod restarts. The official bridge uses an outbound
appservice websocket, so it needs no Kubernetes Service or Ingress.

Before syncing, create the `beeper` namespace and supply your Beeper Matrix
access token as a Kubernetes Secret. Keep the token out of Git and shell history.
Run `bbctl login` on your computer first. It can use your Beeper Desktop login
or send a login code by email. The token is then stored as
`environments.prod.access_token` in bbctl's config file. The default path is
`~/Library/Application Support/bbctl/config.json` on macOS and
`~/.config/bbctl/config.json` on Linux. Current Beeper Desktop versions do not
show this Matrix token in Settings > Help & About; a token from Desktop's
Developer API is not interchangeable with it.

For macOS, create the Secret without printing the token or writing another
plaintext copy (requires `jq`):

```sh
brew install beeper/tap/bbctl
bbctl login
kubectl create namespace beeper
set -o pipefail
jq -erj '.environments.prod.access_token' \
  "$HOME/Library/Application Support/bbctl/config.json" |
  kubectl -n beeper create secret generic beeper-bridge-manager \
    --from-file=MATRIX_ACCESS_TOKEN=/dev/stdin
```

On Linux, use `$HOME/.config/bbctl/config.json` in the `jq` command. The token
usually starts with `syt_` or `bat_`. To confirm the Secret has the expected
key without printing its value, run
`kubectl -n beeper describe secret beeper-bridge-manager`.

After Argo CD syncs, check the pod logs:

```sh
kubectl -n beeper logs deployment/beeper-whatsapp -f
```

Connect WhatsApp by messaging `@sh-whatsappbot:beeper.local` in Beeper and
following the bridge bot's instructions. Back up the PVC with your usual
Longhorn backup process: it contains credentials and session state. The
bridge-manager image currently uses the upstream `latest` tag because upstream
does not publish matching versioned container tags.

Sources: [bridge-manager login](https://github.com/beeper/bridge-manager/blob/main/README.md),
[bbctl config path](https://github.com/beeper/bridge-manager/blob/main/cmd/bbctl/main.go),
[container usage](https://github.com/beeper/bridge-manager/blob/main/docker/README.md).
