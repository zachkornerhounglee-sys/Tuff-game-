# Get one public link that friends can click

You do **not** need to run a server on your own computer while playing. The game does need a server hosted online so everyone's browser can share the same room. This project is configured so one hosted service runs both the website and the multiplayer server.

## Important: do not publish this as a static-only site

Do not upload `index.html` by itself, open it directly from your Downloads folder, or create a Render **Static Site** for the game. The source `index.html` points to `/src/main.js`; that source is meant to be compiled by Vite. A static source deployment commonly looks like a blank page. GitHub Pages can host only the built frontend and still would need a separate multiplayer server, so it is not the simple one-link option.

## Recommended setup: one Render Web Service

1. Put the **contents of this project folder** (the folder containing `package.json`, `server.js`, and `render.yaml`) into a GitHub repository. Do not nest another copy of the project folder inside the repository unless you also set Render's Root Directory to that nested folder.
2. In Render, create **New → Web Service** (not Static Site) and connect that repository. You can also create a Blueprint using the included `render.yaml`.
3. Set these values:
   - Root Directory: leave blank when `package.json` is in the repository root
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Health Check Path: `/health`
4. Deploy and wait for the deployment status to say **Live**.
5. Open the Render URL. It should show the Frontier Detective home menu. When you create a room, click **Copy invite link** and send that copied link to your friends. They open it, enter a name, and join your room.

Render may put the app to sleep on its free tier after inactivity. The first visit later can take time to wake. Restarting the service clears rooms that exist only in server memory.

## Check the published service

Replace `YOUR-SERVICE` below with the exact hostname Render assigned you.

- `https://YOUR-SERVICE.onrender.com/health` should show JSON containing `"ok":true`.
- `https://YOUR-SERVICE.onrender.com/` should show the game menu, not raw source code or a blank page.
- If `/health` does not return JSON with `"ok":true`, the live service is not the expected Node app or deployment has failed.
- If the homepage's page source contains `<script type="module" src="/src/main.js">`, you are seeing the **unbuilt source**. For Render, check that it is a **Web Service**, the root directory is correct, the build command is `npm install && npm run build`, and the last deploy completed successfully.
- In Render's Logs, the server should print `Frontier Detective server listening ...`. The deployment must be Live before a room link can work.

## If it is still white

The fix depends on where the current link points. Check the public URL and the latest deployment/build logs. A ZIP download is project source; it is not itself a live multiplayer website. Do not share a room invite until the hosted homepage is working and `/health` passes.
