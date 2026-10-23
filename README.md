# Frontier Detective — GitHub Pages multiplayer

A colorful first-person social-deduction browser game with three maps (Frontier Town, Downtown, and Museum), uploaded GLB character/prop models, NPC routines, private roles, room lobbies, and shareable invitation links.

## This version is designed for GitHub Pages — no Render setup

The frontend is built by Vite and published through the included GitHub Actions workflow in `.github/workflows/pages.yml`. Multiplayer uses PeerJS/WebRTC: the room creator's browser acts as the room host, and player browsers exchange live game state directly. PeerJS Cloud is used as the free signaling service that helps browsers find one another; it is not a game server and does not store match state.

**Host requirement:** the person who creates the room must keep the game tab open for the room to remain available. If the host closes or refreshes that tab, the room is lost and a new room/link is needed. Peer-to-peer connections can fail on some networks that block WebRTC; this project does not include a TURN relay. The host browser is the game authority, so this is best for playing with friends, not cheat-proof competitive play.

## Publish to GitHub Pages

1. Create a GitHub repository, for example `frontier-detective`.
2. Upload the **contents of this folder** to the repository root. The top level should contain `package.json`, `index.html`, `src/`, `public/`, `shared/`, and `.github/workflows/pages.yml`. Do not upload the ZIP file itself as the repository content.
3. On GitHub, open the repository's **Settings → Pages**. Under **Build and deployment**, set the source to **GitHub Actions**.
4. Open the **Actions** tab and select **Build and publish Frontier Detective to GitHub Pages**. The workflow runs when you push to `main` or `master`, and you can also choose **Run workflow**.
5. Wait until the workflow completes successfully. GitHub will show the published URL in **Settings → Pages**. A project site normally uses `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`; a user site named `YOUR-USERNAME.github.io` uses `https://YOUR-USERNAME.github.io/`.
6. Open the published URL and wait for the home menu and “Peer network ready” status.

The workflow runs `npm install` and `npm run build` on GitHub's runner. You do **not** need to run Node or a server on your own computer to play once the site is deployed.

## Invite friends to your room

1. Open the published game site.
2. Enter your name and choose a map, then click **Create room**.
3. In the lobby, click **Copy invite link**.
4. Send that entire copied link to your friends. It contains both the room code and the host's PeerJS ID, so clicking it takes them to the correct host. A room code by itself is not enough to discover the host in this serverless version.
5. Friends open the link, enter their name if prompted, and click **Join room**. Everyone should press **Ready**, then the host starts the round.
6. Keep the host's tab open while playing. The host should avoid refreshing the page after creating the room.

## Local development

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Vite will print the local development URL (normally `http://localhost:5173`). To test WebRTC multiplayer, use two different browsers/devices and a room invitation link. Both devices must be online and able to reach PeerJS Cloud and establish WebRTC connections.

Build and test:

```bash
npm test
npm run build
npm run preview
```

## Troubleshooting

- **“Game files did not load”**: do not publish the raw source `index.html`. In GitHub **Settings → Pages**, choose **GitHub Actions**, then inspect the newest workflow in the Actions tab. The build must finish successfully.
- **Page loads at a 404 or has missing CSS/models**: make sure you uploaded the project contents at the repository root and used the included workflow. It calculates the correct base path for project sites.
- **“Peer network unavailable”**: check internet access, browser extensions, and whether the network blocks PeerJS Cloud/WebRTC.
- **Friend cannot join**: send the full link copied from the lobby, not just the five-character room code. The host must still have the original room open.
- **Host refreshed or closed the page**: browser-hosted rooms are temporary. Create a new room and send a fresh invite link.
- **Peer connection fails on a school/public network**: some managed networks restrict WebRTC. This build does not configure a TURN relay, so a connection may not be possible on every network.
- **3D models do not appear**: check the browser console for asset path errors. The included GitHub Actions build sets `BASE_URL`, which the asset loader uses.

## Assets and project limits

Uploaded models are copied into `public/assets/`. Their original licence/redistribution terms were not included in the files; confirm permissions before making the repository public. See `ASSET-LICENSES.md`.

This is a hobby/social game. Because GitHub Pages does not run a Node process, the host player's browser performs the room simulation and validates actions. It is less tamper-resistant than a dedicated server, and a host leaving ends the match. Rooms and results are not saved permanently. The current AI uses simple waypoint-style wandering and reactions rather than a learned model. There is no voice chat.
