Hide & Seek Murder Mystery 3D
Keep index.html and the assets/ folder together (models are packed as assets/*.js).
Upload both to GitHub Pages and share the invite link from the lobby.

Models for friends: they load automatically from your site. If a friend's browser can't load them,
the host's browser sends them over the connection (once, then cached in the friend's browser).

NEW
- Roles: 1 Sheriff, everyone else is a Murderer (a team). Murderers cannot kill the Sheriff or each other;
  they win by killing every NPC civilian. The Sheriff wins by shooting every Murderer (or when the timer ends).
- Lobby (host controls): NPC count (5-200), round timer, Sheriff mistakes allowed, murder-alert marker on/off.
- Lobby shows every player with a model status: ✔ models / ⬇ downloading % / ✖ missing. Host can Kick.
- Tab in game = player list (kills, alive/dead, ping, model status). Murderers see red name tags on teammates.
- Set your name on the menu. End screen shows each Murderer's kill count.

Esc in game = Settings: Day/Night, sensitivity, FOV, graphics quality. F = flashlight (night).
