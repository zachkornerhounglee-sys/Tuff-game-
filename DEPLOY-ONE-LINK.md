# One public GitHub Pages link, with invite links for rooms

This version deliberately does **not** use Render or any separate hosted Node server. GitHub Actions builds the frontend, then GitHub Pages publishes the built files. PeerJS Cloud is used only for WebRTC signaling, while the player who creates a room acts as the room host in their browser.

## Publish it

1. Upload this folder's contents to the root of your GitHub repository. Do not upload only the ZIP file or only `index.html`.
2. Go to **Settings → Pages** and set the source to **GitHub Actions**.
3. Push to `main` or `master`, then open **Actions** and check **Build and publish Frontier Detective to GitHub Pages**. Fix any reported build error before testing the site.
4. After the workflow is green, open **Settings → Pages** and copy the published site URL.

## Create and share a room

1. Open the published site URL and wait for **Peer network ready**.
2. Click **Create room**.
3. From the lobby, click **Copy invite link** and send that entire link to friends.
4. Friends click the link, type their player name, and tap **Join room**.

The invite URL includes the room code and the host's PeerJS connection ID. A room code alone cannot locate a browser-hosted room because GitHub Pages does not run a room directory/backend.

## Important behavior

- No one needs to run a server on their own computer, but the room host must keep their game tab open.
- Refreshing or closing the host tab ends that room; create a new room and share a fresh link.
- PeerJS Cloud is a shared signaling service. It does not hold the match state. Some school/public networks may block WebRTC, and this project does not configure a TURN relay.
- The host browser validates the game's actions, so this is best for friends rather than cheat-proof competitive play.
- If the site says “Game files did not load”, the raw project source was likely published instead of the build. Set Pages source to **GitHub Actions**, then inspect the Actions run for the build/deploy workflow.
