# Frontier Detective — multiplayer 3D browser game

A first-person, non-graphic social-deduction game for **2–8 players**, built with Three.js and a real Socket.IO server. The project includes three maps (Frontier Town, Downtown, Museum), the uploaded GLB model pack, NPC wandering, secret roles, room codes and invitation links, clue-scene inspection, detentions, an end-of-round role reveal, and desktop/touch controls.

> **Gameplay note:** The round uses stylised, non-graphic NPC eliminations and a detention/investigation mechanic. It intentionally does not implement firearm controls or graphic effects.

## What is included

- Browser frontend: Vite + Three.js + GLTFLoader.
- Live multiplayer: Socket.IO client and Node.js/Express host; the server assigns roles, validates actions and player movement, owns NPC state, tracks the round timer, and checks win conditions.
- Rooms: 5-character code, shareable link, host settings, ready-up, 8-player limit, short reconnect grace period, and rematch flow.
- NPCs: 20–22 independently wandering NPCs per round, with simple route changes and pauses. AI is intentionally lightweight so the scene stays usable on phones.
- Roles: one sheriff, one to three murderers depending on player count, and deputies where applicable. Role names are only sent privately until the end-of-round reveal.
- Inputs: WASD, mouse look, Shift sprint, Space jump, E primary action, F inspect, plus mobile joystick/camera drag and on-screen buttons.
- Hosting: a `render.yaml` Blueprint for a single-service deploy, plus a GitHub Pages workflow for an optional split frontend/backend deployment.

## Requirements

- Node.js 20 or newer (Node 22 recommended).
- npm (included with Node.js).
- A modern browser with WebGL.

## Run locally

Open a terminal in the project folder, then:

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. The development command starts the Socket.IO server on port `3000` and the Vite frontend on port `5173`; Vite proxies `/socket.io` and `/health` to the Node server. For a production-style local run:

```bash
npm run build
npm start
```

Then open **http://localhost:3000**. To play with a friend on another device on your home network, both devices need to reach the computer running the server. Use that computer's LAN address and configure the frontend to point to the server if necessary; browser/device firewalls can block connections. For an internet game, deploy the project instead of exposing a development server directly.

## Quick game flow

1. Enter a name and select a map, then choose **Create room**.
2. Share the 5-character code or **Copy invite link**.
3. Each joining player presses **I’m ready**. The host can select the map and murderer count.
4. The host starts the match when at least two players are connected and all connected players are ready.
5. The sheriff/deputies inspect glowing clue scenes and can detain nearby players; murderers blend among NPCs and use the cooldown-limited NPC action. Incorrect detentions briefly slow the officer.
6. At round end, the game reveals roles and statistics. The host can return everyone to the lobby for another round.

## Environment variables

Copy `.env.example` to `.env` for local configuration. `npm start` reads:

- `PORT`: HTTP/WebSocket server port; the hosting platform will normally set this automatically.
- `APP_NAME`: name printed by the server and `/health` endpoint.
- `CLIENT_ORIGIN`: optional comma-separated list of allowed browser origins. Leave it blank for the default same-service setup.

The frontend build can read:

- `VITE_SERVER_URL`: optional full URL for a separately hosted multiplayer server, e.g. `https://your-server.onrender.com`. Leave blank for the recommended single-service Render deployment.
- `VITE_BASE_PATH`: optional Vite base path, mainly needed for GitHub Pages project sites. It must begin and end with `/`, e.g. `/frontier-detective/`.

Never put credentials or secrets into `VITE_*` variables; these are included in browser assets.

## Recommended deployment: GitHub + one Render web service

This is the easiest way to get a single public game URL. Render serves the built frontend and runs the Node/Socket.IO server on the same origin, so no separate frontend URL or CORS configuration is needed.

1. **Create a GitHub repository.** Sign in at GitHub, choose **New repository**, call it `frontier-detective` (or another name), and create it. Do not add a generated README if you will push this folder as-is.
2. **Push this project from your computer.** In a terminal opened in this project folder, run:

   ```bash
   git init
   git add .
   git commit -m "Build Frontier Detective multiplayer game"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/frontier-detective.git
   git push -u origin main
   ```

   Replace `YOUR-USERNAME` and the repository URL with the repository you actually created. If this folder is already inside a Git repository, skip `git init` and inspect `git status` before committing.
3. **Create the Render web service.** Sign up at [Render](https://render.com/), choose **New → Web Service**, connect GitHub, and select your repository. Or use the included `render.yaml` if creating a Blueprint from the repository.
4. **Use these settings if asked:**
   - Runtime: Node
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Health check path: `/health`
   - Plan: Free to start, if it is offered to your account/region
5. Deploy. Render will provide a URL like `https://your-service-name.onrender.com`. Open it, create a room, and test from a second browser/device. Share the same public URL plus the room invitation link with friends.
6. Future pushes to the connected branch can trigger deployments automatically. Watch the Render deploy log if a deployment fails.

**Free-tier caveat:** Render's free web services sleep after 15 minutes without inbound traffic; the next request or new WebSocket connection may take around a minute to wake the service. Free services can also restart, and active room data is in memory, so an instance restart ends active rooms. This is suitable for a hobby game/test but is not a production guarantee. Upgrade the service if you need more reliable always-on play.

## Optional deployment: GitHub Pages frontend + Render server

GitHub Pages only hosts static files; it does not run this project's persistent Node.js/Socket.IO server. You must still deploy `server.js` to a Web Service that supports WebSockets.

1. Deploy a copy of this repository to Render as a web service with the same build and start commands above. It will provide the server URL.
2. In GitHub, open your repository **Settings → Secrets and variables → Actions → Variables**, choose **New repository variable**, and set:
   - Name: `VITE_SERVER_URL`
   - Value: the full Render URL, for example `https://your-service-name.onrender.com`
3. In the Render service's environment settings, set `CLIENT_ORIGIN` to the GitHub Pages site origin, such as `https://YOUR-USERNAME.github.io` (no `/repository-name/` path). Save the change and redeploy.
4. Enable GitHub Pages for the repository using **Settings → Pages → Build and deployment → GitHub Actions**.
5. The included `.github/workflows/pages.yml` builds and deploys the static `dist` frontend on pushes to `main`. It automatically builds with `/${repository-name}/` as the Vite base path. After the workflow succeeds, GitHub displays the Pages URL in Settings → Pages.
6. Open the Pages URL and create a room. If the server does not connect, check that `VITE_SERVER_URL` is set to the public Render URL and that `CLIENT_ORIGIN` matches the Pages origin exactly, then check both the Actions log and Render logs.

Note: the GitHub Pages build is configured to read `VITE_SERVER_URL` as a GitHub Actions repository variable. Set it before running/re-running the Pages workflow. The free Render server may sleep between games.

## Tests

```bash
npm test
npm run build
```

`npm test` checks shared rule helpers (name cleaning, map validation, role-count bounds, distance math and room code generation). The production build compiles the browser app. These checks do not replace a full multi-device playtest or a hosted network test.

## Blank or white page

The startup HTML now displays a loading panel before the JavaScript app starts. If the app bundle fails to load, the panel shows a startup message instead of leaving a blank page. For the recommended single-service Render deployment, use the repository root as the **Root Directory**, the build command `npm install && npm run build`, and the start command `npm start`. Do not deploy the raw `index.html` as a static site by itself: the game needs the Vite build and the Node/Socket.IO server. After changing files, push the changes to the connected GitHub branch and trigger a new deployment. If the panel reports a script error, inspect the browser developer console and the Render build/runtime logs; the first error in those logs is the useful one.

## Troubleshooting

- **Room code not found:** codes exist only while the in-memory server room exists. Verify the host is still in the room and copy the current code again.
- **Server unreachable:** confirm the frontend URL is deployed and `/health` returns JSON. On a split deployment, check `VITE_SERVER_URL` and Render `CLIENT_ORIGIN`.
- **Room stays on “waiting”:** the host cannot start until two players are connected and every connected player is ready.
- **First connection is slow:** a free server may be waking from idle. Wait for the URL to respond and retry the room join.
- **3D view is blank:** update the browser, enable hardware acceleration/WebGL, and check the browser console for GLB loading errors.
- **Models are missing but simple figures appear:** the fallback characters are intentional. Check that `public/assets/` exists in the repository and that the build copied the assets into `dist/assets/`.
- **Players appear to move oddly:** network latency or server movement limits can show up as movement correction; run a fresh test round with both players on a stable connection.
- **Install fails:** check that Node.js 20+ is installed and the package registry is reachable; run `npm install` again. For reproducible deployments, run `npm install` locally and commit the generated `package-lock.json` after resolving dependency installs.
- **GLB rights/credits:** see [ASSET-LICENSES.md](ASSET-LICENSES.md). The uploaded model files did not include licence metadata, so confirm redistribution permissions before making the repository public.

## Scope and limitations

This is a runnable multiplayer project and not an audited production service. It uses an in-memory room store (no account system or persistent match history), simple waypoint/pause NPC AI, simplified collisions, no authoritative physics engine, no voice chat, and procedural sound cues rather than a full ambience soundtrack. Role assignment, actions, NPC positions, clue visibility, capture checks, and win conditions are server-controlled; no claim is made that this is cheat-proof against a determined modified client. Test with several browsers/devices before inviting a large group.
