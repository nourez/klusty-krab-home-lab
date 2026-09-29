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

The bridge starts with recent DMs, but it can also bridge server channels. In
the bot's management chat, send `guilds status` to list your Discord servers
and their IDs, then `guilds bridge <server ID>` to create a Space for that
server. Channels are added as messages arrive; add `--entire` to create all
channel rooms immediately. You can also bridge one channel with
`!discord bridge <channel ID>`. The Discord account must have access to the
server and channels. Channel message backfill is disabled by default in the
bridge, so it will not automatically import old channel history.

Removing the old connection removes its Beeper chat rooms and messages. Beeper
Cloud imports only five recent DMs with 50 messages each and no channel history
when an account is connected. This is separate from bridging live server
channels with the self-hosted bridge. Review anything you need to retain before
removing the old connection. Your chats in Discord itself are unaffected.

Sources: [Bridge Manager](https://github.com/beeper/bridge-manager),
[Discord QR login](https://docs.mau.fi/bridges/go/discord/authentication.html),
[Discord server and channel bridging](https://docs.mau.fi/bridges/go/discord/bridging-rooms.html),
[Beeper account removal](https://help.beeper.com/en_US/chat-networks/deleting-a-chat-network-from-beeper),
[Beeper history import](https://help.beeper.com/history-import).
