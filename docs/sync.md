# Syncing the desktop app with a server

The desktop app can keep your library in step with your account on an Inquizitive
server: a school's, or one you host yourself.

## Set it up

1. On the server, sign in and open **Settings → Desktop sync**. Name the device and
   choose **Create token**. Copy the token; it's shown only once.
2. In the desktop app, open **Settings → Sync with a server**. Enter the server address
   (for example `https://study.example.edu`) and paste the token.
3. Choose **Connect and sync**.

After that the app syncs when it starts, every 15 minutes, and when you choose
**Sync now**. Revoke a device under **Settings → Desktop sync** on the server.

## What syncs

| Syncs | Doesn't sync |
|---|---|
| Your folders, sets, tags, cards, alternative answers and images | Sets other people shared with you |
| Archive and trash state, deletions | Unfinished study sessions and match best times |
| Stars, known/unknown marks, spaced-repetition schedules | App settings and theme |
| Review history | |

## When both sides changed

Each folder, set, card and progress record keeps the most recent edit. If you
delete something on one side and edit it on the other, whichever happened later
wins. Review history is merged, not overwritten.

Keep your computer's clock set automatically: sync compares edit times from both
machines.

## Troubleshooting

| Message | Fix |
|---|---|
| "The server didn't accept this sync token" | The token was revoked or mistyped. Create a new one on the server. |
| "Can't reach …" | Check the address, VPN and that the server is up (`/api/health/`). |
| "… doesn't look like an Inquizitive server" | The address points at something else; include `https://` and no path. |
| An image is missing after sync | The image file was missing on the side that sent it. Add it again on either side. |

## For administrators

Sync uses `POST /api/sync`, `/api/media` and `/api/devices`, with bearer tokens stored
hashed in `api_tokens`. Put the server behind HTTPS: the token is a password. The
protocol and its trade-offs are described in
[ADR 0006](adr/0006-desktop-server-sync.md).
