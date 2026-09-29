# Beeper Discord bridge

Argo CD runs one `bbctl run sh-discord` instance in the existing `beeper`
namespace. It reuses the manually created `beeper-bridge-manager` Secret and
stores bridge configuration, database, and Discord session on its own Longhorn
PVC at `/data`. The bridge connects outbound to Beeper, so it needs no Service
or Ingress. Back up the PVC with the usual Longhorn backup process; it contains
session credentials.

Before syncing, confirm that the Secret exists in the `beeper` namespace and
has the `MATRIX_ACCESS_TOKEN` key. Do not put the token in Git:

```sh
kubectl -n beeper describe secret beeper-bridge-manager
```

After Argo CD syncs, check the rollout and logs:

```sh
kubectl -n beeper rollout status deployment/beeper-discord
kubectl -n beeper logs deployment/beeper-discord -f
```

In Beeper, start a DM with `@sh-discordbot:beeper.local` and send `login-qr`.
Scan the QR code with the Discord mobile app and approve the login. Confirm
that a recent DM can send and receive messages through the new bridge before
removing the old Beeper Cloud Discord connection. Do not keep both connected
long term because they can create duplicate chats.

Removing the old connection removes its Beeper chat rooms and messages. Beeper
currently imports only limited Discord history (five recent DMs with 50
messages each, and no channel history), so review anything you need to retain
before the cutover. Your chats in Discord itself are unaffected.

Sources: [Bridge Manager](https://github.com/beeper/bridge-manager),
[Discord QR login](https://docs.mau.fi/bridges/go/discord/authentication.html),
[Beeper account removal](https://help.beeper.com/en_US/chat-networks/deleting-a-chat-network-from-beeper),
[Beeper history import](https://help.beeper.com/history-import).
