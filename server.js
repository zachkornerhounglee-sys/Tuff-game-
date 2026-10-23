import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';
import { cleanName, cleanMap, clampMurderers, distance2D, makeRoomCode, rolePlan } from './shared/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const APP_NAME = process.env.APP_NAME || 'Frontier Detective';
const app = express();
const httpServer = http.createServer(app);
const allowedOrigins = process.env.CLIENT_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins?.length ? allowedOrigins : true, methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e6
});

app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ ok: true, app: APP_NAME, rooms: rooms.size }));
app.use(express.static(path.join(__dirname, 'dist'), { extensions: ['html'] }));
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  res.sendFile(indexPath, err => {
    if (err) res.status(200).type('text').send(`${APP_NAME} server is running. Start the Vite frontend with npm run dev while developing, or run npm run build before npm start.`);
  });
});

const rooms = new Map();
const disconnectTimers = new Map();
const ROUND_DURATION_MS = 6 * 60 * 1000;
const DISCONNECT_GRACE_MS = 45 * 1000;
const NPC_COUNT = { western: 22, urban: 20, museum: 20 };
const MAP_AREAS = {
  western: ['the saloon', 'the general store', 'the sheriff’s office', 'the town square', 'the back alley', 'the stable'],
  urban: ['the station entrance', 'the market corner', 'the plaza', 'the side street', 'the coffee shop', 'the bus stop'],
  museum: ['the grand gallery', 'the sculpture hall', 'the fossil room', 'the entrance hall', 'the east corridor', 'the exhibit wing']
};
const now = () => Date.now();
const random = (min, max) => min + Math.random() * (max - min);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const randomToken = () => crypto.randomUUID();

function currentRoom(socket) {
  return rooms.get(socket.data.roomCode);
}
function currentPlayer(socket, room = currentRoom(socket)) {
  if (!room) return null;
  return room.players.find(p => p.id === socket.data.playerId && p.socketId === socket.id) || null;
}
function emitError(socket, message) {
  socket.emit('room:error', { message });
}
function roomSummary(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    settings: { map: room.settings.map, murdererCount: room.settings.murdererCount },
    createdAt: room.createdAt,
    players: room.players.map(p => ({
      id: p.id, name: p.name, ready: p.ready, connected: p.connected,
      isHost: p.id === room.hostId, alive: p.alive, score: p.score
    }))
  };
}
function publicSnapshot(room) {
  return {
    code: room.code,
    phase: room.phase,
    map: room.settings.map,
    players: room.players.map(p => ({
      id: p.id, name: p.name, x: p.x, z: p.z, yaw: p.yaw,
      alive: p.alive, connected: p.connected, score: p.score,
      captured: p.captured
    })),
    npcs: room.npcs.map(n => ({ id: n.id, x: n.x, z: n.z, yaw: n.yaw, alive: n.alive, area: n.area })),
    events: room.events.slice(-10),
    remainingNPCs: room.npcs.filter(n => n.alive).length,
    totalNPCs: room.npcs.length,
    timeRemainingMs: Math.max(0, ROUND_DURATION_MS - (now() - room.startedAt))
  };
}
function broadcastRoom(room) {
  io.to(room.code).emit('room:updated', roomSummary(room));
}
function broadcastState(room) {
  io.to(room.code).emit('game:state', publicSnapshot(room));
}
function addEvent(room, text) {
  room.events.push({ id: randomToken(), at: now(), text: String(text).slice(0, 220) });
  if (room.events.length > 30) room.events.shift();
}
function makeNpcSet(map) {
  const areaNames = MAP_AREAS[map] || MAP_AREAS.western;
  const total = NPC_COUNT[map] || 20;
  return Array.from({ length: total }, (_, i) => ({
    id: `npc-${i + 1}`,
    x: random(-24, 24), z: random(-24, 24),
    yaw: random(-Math.PI, Math.PI),
    alive: true,
    area: areaNames[i % areaNames.length],
    targetX: random(-24, 24), targetZ: random(-24, 24),
    speed: random(1.0, 2.2),
    pauseUntil: now() + random(0, 4500),
    nextWanderAt: now() + random(2500, 6500),
    deathAt: null, deathX: null, deathZ: null,
    nearbyPlayerIdsAtDeath: [],
    witnessSawMovement: false,
    inspectedBy: new Set()
  }));
}
function clearPlayerRoles(room) {
  for (const p of room.players) {
    p.role = null; p.alive = true; p.captured = false;
    p.kills = 0; p.arrests = 0; p.wrongDetentions = 0;
    p.lastEliminationAt = 0; p.lastActionAt = 0; p.stunnedUntil = 0;
  }
}
function startRound(room) {
  const connected = room.players.filter(p => p.connected);
  if (connected.length < 2) return false;
  const plan = rolePlan(connected.length, room.settings.murdererCount);
  room.settings.murdererCount = plan.murderers;
  const shuffled = [...connected].sort(() => Math.random() - 0.5);
  clearPlayerRoles(room);
  shuffled.forEach((p, index) => {
    p.role = index === 0 ? 'sheriff' : index <= plan.murderers ? 'murderer' : 'deputy';
    p.x = random(-2.8, 2.8); p.z = random(4, 9); p.yaw = random(-Math.PI, Math.PI);
    p.connected = true;
  });
  room.npcs = makeNpcSet(room.settings.map);
  room.events = [];
  room.phase = 'playing';
  room.startedAt = now();
  room.endedAt = null;
  room.lastStateAt = 0;
  addEvent(room, `Round started in ${room.settings.map === 'western' ? 'Frontier Town' : room.settings.map === 'urban' ? 'Downtown' : 'the Museum'}. Watch behaviour and investigate carefully.`);
  for (const p of connected) {
    io.to(p.socketId).emit('game:started', {
      role: p.role,
      objective: p.role === 'murderer'
        ? 'Blend in with the visitors. Quietly remove every NPC from the round and avoid detention.'
        : p.role === 'sheriff'
          ? 'Investigate the scene, identify the murderers, and detain them before all NPCs are gone.'
          : 'Support the sheriff. Inspect scenes, watch suspicious behaviour, and detain suspected murderers carefully.',
      state: publicSnapshot(room),
      isReconnect: false
    });
  }
  broadcastRoom(room);
  broadcastState(room);
  return true;
}
function finishRound(room, winner, reason) {
  if (room.phase !== 'playing') return;
  room.phase = 'ended'; room.endedAt = now();
  const reveal = room.players.map(p => ({
    id: p.id, name: p.name, role: p.role || 'departed',
    score: p.score + p.kills * 2,
    kills: p.kills, arrests: p.arrests, captured: p.captured
  }));
  const result = {
    winner, reason,
    roles: reveal,
    remainingNPCs: room.npcs.filter(n => n.alive).length,
    totalNPCs: room.npcs.length,
    durationSec: Math.max(0, Math.round(((room.endedAt || now()) - room.startedAt) / 1000)),
    events: room.events.slice(-12)
  };
  io.to(room.code).emit('game:ended', result);
  addEvent(room, winner === 'officers' ? 'The officers secured the town.' : 'The murderers emptied the town of innocent NPCs.');
  broadcastRoom(room);
}
function checkWinner(room) {
  if (room.phase !== 'playing') return;
  const activeMurderers = room.players.filter(p => p.role === 'murderer' && p.alive && !p.captured);
  const livingNPCs = room.npcs.filter(n => n.alive);
  if (activeMurderers.length === 0) {
    finishRound(room, 'officers', 'All murderers were detained.');
  } else if (livingNPCs.length === 0) {
    finishRound(room, 'murderers', 'Every innocent NPC has been eliminated.');
  } else if (now() - room.startedAt >= ROUND_DURATION_MS) {
    finishRound(room, 'officers', 'Time ran out before the town was emptied.');
  }
}
function removePlayer(room, player) {
  room.players = room.players.filter(p => p.id !== player.id);
  if (room.hostId === player.id) room.hostId = room.players[0]?.id || null;
  if (room.players.length === 0) rooms.delete(room.code);
  else {
    broadcastRoom(room);
    if (room.phase === 'playing') {
      // Keep the round playable if a sheriff disconnects for good: promote the first connected deputy.
      if (!room.players.some(p => p.role === 'sheriff' && p.alive && p.connected)) {
        const nextOfficer = room.players.find(p => p.role === 'deputy' && p.alive && p.connected);
        if (nextOfficer) {
          nextOfficer.role = 'sheriff';
          io.to(nextOfficer.socketId).emit('game:private-role-change', { role: 'sheriff', objective: 'The sheriff left. You are now responsible for leading the investigation.' });
          addEvent(room, 'An officer has taken over the investigation.');
        }
      }
      checkWinner(room);
    }
  }
}
function validToken(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{24,64}$/.test(value) ? value : randomToken();
}
function createPlayer({ token, socket, name }) {
  return {
    id: token, socketId: socket.id, name: cleanName(name),
    connected: true, ready: false, role: null,
    x: random(-2, 2), z: random(5, 9), yaw: 0,
    alive: true, captured: false, score: 0, kills: 0, arrests: 0, wrongDetentions: 0,
    lastEliminationAt: 0, lastActionAt: 0, lastMoveAt: now(), stunnedUntil: 0
  };
}
function attachPlayerToSocket(socket, room, player) {
  if (room.phase === 'lobby') room.settings.murdererCount = clampMurderers(room.settings.murdererCount, Math.max(2, room.players.filter(p => p.connected).length));
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  player.socketId = socket.id;
  player.connected = true;
  const timer = disconnectTimers.get(player.id);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(player.id);
  socket.join(room.code);
  socket.emit('room:joined', { room: roomSummary(room), playerId: player.id });
  if (room.phase === 'playing' && player.role) {
    socket.emit('game:private-role-change', {
      role: player.role,
      objective: player.role === 'murderer'
        ? 'Blend in with the visitors. Quietly remove every NPC from the round and avoid detention.'
        : player.role === 'sheriff'
          ? 'Investigate the scene, identify the murderers, and detain them before all NPCs are gone.'
          : 'Support the sheriff. Inspect scenes, watch suspicious behaviour, and detain suspected murderers carefully.'
    });
    socket.emit('game:state', publicSnapshot(room));
  }
  broadcastRoom(room);
}
function sendPrivateClue(room, clue) {
  for (const p of room.players) {
    if (p.connected && (p.role === 'sheriff' || p.role === 'deputy')) {
      io.to(p.socketId).emit('investigation:clue', clue);
    }
  }
}

io.on('connection', socket => {
  socket.emit('server:hello', { app: APP_NAME, version: 1 });

  socket.on('room:create', payload => {
    try {
      const token = validToken(payload?.token);
      const code = makeRoomCode(new Set(rooms.keys()));
      const player = createPlayer({ token, socket, name: payload?.name });
      player.ready = true;
      const room = {
        code, hostId: player.id, players: [player],
        settings: { map: cleanMap(payload?.map), murdererCount: 1 },
        phase: 'lobby', npcs: [], events: [], createdAt: now(), startedAt: 0, endedAt: null
      };
      rooms.set(code, room);
      attachPlayerToSocket(socket, room, player);
    } catch (err) {
      emitError(socket, `Could not create room: ${err.message}`);
    }
  });

  socket.on('room:join', payload => {
    const code = String(payload?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    const room = rooms.get(code);
    if (!room) return emitError(socket, 'Room not found. Ask the host for a fresh room code.');
    const token = validToken(payload?.token);
    let player = room.players.find(p => p.id === token);
    if (player) {
      attachPlayerToSocket(socket, room, player);
      return;
    }
    if (room.phase !== 'lobby') return emitError(socket, 'This round has already started. Rejoin with the same browser session or wait for the next lobby.');
    if (room.players.length >= 8) return emitError(socket, 'This room is full (maximum 8 players).');
    player = createPlayer({ token, socket, name: payload?.name });
    room.players.push(player);
    attachPlayerToSocket(socket, room, player);
  });

  socket.on('room:leave', () => {
    const room = currentRoom(socket);
    const player = currentPlayer(socket, room);
    if (!room || !player) return;
    socket.leave(room.code);
    socket.data.roomCode = null; socket.data.playerId = null;
    const timer = disconnectTimers.get(player.id);
    if (timer) clearTimeout(timer);
    disconnectTimers.delete(player.id);
    removePlayer(room, player);
  });

  socket.on('player:ready', () => {
    const room = currentRoom(socket); const player = currentPlayer(socket, room);
    if (!room || !player || room.phase !== 'lobby') return;
    player.ready = !player.ready;
    broadcastRoom(room);
  });

  socket.on('room:settings', payload => {
    const room = currentRoom(socket); const player = currentPlayer(socket, room);
    if (!room || !player || room.hostId !== player.id || room.phase !== 'lobby') return;
    room.settings.map = cleanMap(payload?.map);
    const connectedCount = room.players.filter(p => p.connected).length;
    room.settings.murdererCount = clampMurderers(payload?.murdererCount, Math.max(2, connectedCount));
    broadcastRoom(room);
  });

  socket.on('game:start', () => {
    const room = currentRoom(socket); const player = currentPlayer(socket, room);
    if (!room || !player) return;
    if (room.hostId !== player.id) return emitError(socket, 'Only the host can start the round.');
    if (room.phase !== 'lobby') return;
    const connected = room.players.filter(p => p.connected);
    if (connected.length < 2) return emitError(socket, 'At least 2 players must be connected.');
    if (!connected.every(p => p.ready)) return emitError(socket, 'Everyone connected must press Ready first.');
    if (!startRound(room)) return emitError(socket, 'The round could not be started.');
  });

  socket.on('game:rematch', () => {
    const room = currentRoom(socket); const player = currentPlayer(socket, room);
    if (!room || !player || room.phase !== 'ended' || room.hostId !== player.id) return;
    room.phase = 'lobby'; room.startedAt = 0; room.endedAt = null; room.npcs = []; room.events = [];
    clearPlayerRoles(room);
    for (const p of room.players) { p.ready = p.id === room.hostId; p.x = random(-2, 2); p.z = random(5, 9); }
    broadcastRoom(room);
    io.to(room.code).emit('game:back-to-lobby');
  });

  socket.on('player:move', payload => {
    const room = currentRoom(socket); const player = currentPlayer(socket, room);
    if (!room || !player || room.phase !== 'playing' || !player.alive || player.captured) return;
    if (now() < player.stunnedUntil) return;
    const x = Number(payload?.x), z = Number(payload?.z), yaw = Number(payload?.yaw);
    if (![x, z, yaw].every(Number.isFinite)) return;
    const wanted = { x: clamp(x, -34, 34), z: clamp(z, -34, 34) };
    const t = now();
    const dt = clamp((t - player.lastMoveAt) / 1000, 0.05, 0.5);
    const sprint = Boolean(payload?.sprint);
    const maxDistance = (sprint ? 8.8 : 5.7) * dt + 0.9;
    const dx = wanted.x - player.x, dz = wanted.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance > maxDistance && distance > 0) {
      wanted.x = player.x + dx / distance * maxDistance;
      wanted.z = player.z + dz / distance * maxDistance;
    }
    player.x = wanted.x; player.z = wanted.z;
    player.yaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    player.lastMoveAt = t;
  });

  socket.on('game:action', payload => {
    const room = currentRoom(socket); const player = currentPlayer(socket, room);
    if (!room || !player || room.phase !== 'playing' || !player.alive || player.captured) return;
    const action = String(payload?.action || '');
    const t = now();
    if (t - player.lastActionAt < 450) return;
    player.lastActionAt = t;

    if (action === 'eliminate') {
      if (player.role !== 'murderer') return emitError(socket, 'Only a murderer can use that action.');
      if (t - player.lastEliminationAt < 12000) return emitError(socket, `Stay blended in. Your next action is ready in ${Math.ceil((12000 - (t - player.lastEliminationAt)) / 1000)}s.`);
      const npcId = String(payload?.npcId || '').slice(0, 32);
      const npc = room.npcs.find(n => n.id === npcId && n.alive);
      if (!npc || distance2D(player, npc) > 3.7) return emitError(socket, 'Move closer to an NPC before using that action.');
      npc.alive = false; npc.deathAt = t; npc.deathX = npc.x; npc.deathZ = npc.z;
      npc.nearbyPlayerIdsAtDeath = room.players.filter(p => p.alive && !p.captured && distance2D(p, npc) < 12).map(p => p.id);
      const witnesses = room.npcs.filter(w => w.alive && distance2D(w, npc) < 7 && Math.random() < 0.65);
      npc.witnessSawMovement = witnesses.length > 0;
      // Nearby NPCs react to a sudden event by moving away, then resume their wandering routine.
      for (const witness of witnesses) {
        const awayX = witness.x - npc.x, awayZ = witness.z - npc.z;
        const length = Math.max(0.1, Math.hypot(awayX, awayZ));
        witness.targetX = clamp(witness.x + (awayX / length) * random(7, 12), -24, 24);
        witness.targetZ = clamp(witness.z + (awayZ / length) * random(7, 12), -24, 24);
        witness.pauseUntil = t;
        witness.nextWanderAt = t + random(3500, 6000);
      }
      npc.lastKillerId = player.id;
      player.lastEliminationAt = t; player.kills++;
      const area = npc.area || 'nearby';
      addEvent(room, `An NPC has been found missing near ${area}. Investigators should inspect the scene.`);
      io.to(room.code).emit('game:crime-scene', { id: npc.id, x: npc.deathX, z: npc.deathZ, area, at: t });
      broadcastState(room);
      checkWinner(room);
      return;
    }

    if (action === 'detain') {
      if (!['sheriff', 'deputy'].includes(player.role)) return emitError(socket, 'Your role cannot detain suspects.');
      const targetId = String(payload?.targetId || '').slice(0, 64);
      const target = room.players.find(p => p.id === targetId && p.id !== player.id && p.alive && !p.captured);
      if (!target || distance2D(player, target) > 3.6) return emitError(socket, 'No player is close enough to detain.');
      if (target.role === 'murderer') {
        target.alive = false; target.captured = true; player.arrests++; player.score += 3;
        addEvent(room, `${target.name} has been detained by the officers.`);
        io.to(room.code).emit('game:detained', { playerId: target.id });
        broadcastRoom(room); broadcastState(room); checkWinner(room);
      } else {
        player.wrongDetentions++;
        player.stunnedUntil = t + 1800;
        socket.emit('game:mistake', { message: 'That person was innocent. Take a moment before detaining anyone else.', x: player.x, z: player.z, durationMs: 1800 });
      }
      return;
    }

    if (action === 'inspect') {
      if (!['sheriff', 'deputy'].includes(player.role)) return emitError(socket, 'Only investigators can inspect a scene.');
      const npcId = String(payload?.npcId || '').slice(0, 32);
      const npc = room.npcs.find(n => n.id === npcId && !n.alive);
      if (!npc || distance2D(player, { x: npc.deathX ?? npc.x, z: npc.deathZ ?? npc.z }) > 4.6) return emitError(socket, 'Stand near a crime scene to inspect it.');
      if (npc.inspectedBy.has(player.id)) return emitError(socket, 'You have already inspected this scene.');
      npc.inspectedBy.add(player.id);
      const candidateIds = new Set(npc.nearbyPlayerIdsAtDeath);
      const livingPlayers = room.players.filter(p => p.alive && !p.captured && p.role !== 'murderer');
      for (const candidate of livingPlayers.sort(() => Math.random() - 0.5).slice(0, 2)) candidateIds.add(candidate.id);
      const names = [...candidateIds]
        .map(id => room.players.find(p => p.id === id))
        .filter(Boolean)
        .map(p => p.name)
        .slice(0, 5);
      const clue = {
        id: randomToken(), area: npc.area, at: npc.deathAt,
        text: npc.witnessSawMovement
          ? `A witness noticed someone leaving ${npc.area}. People possibly nearby: ${names.length ? names.join(', ') : 'no clear description'}. This is a lead, not proof.`
          : `No reliable witness came forward near ${npc.area}. These people may have been nearby: ${names.length ? names.join(', ') : 'no reliable leads'}. This is a lead, not proof.`,
        names
      };
      sendPrivateClue(room, clue);
      socket.emit('investigation:clue', clue);
      return;
    }
  });

  socket.on('disconnect', () => {
    const room = currentRoom(socket);
    const player = currentPlayer(socket, room);
    if (!room || !player) return;
    player.connected = false;
    broadcastRoom(room);
    const existing = disconnectTimers.get(player.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const stillRoom = rooms.get(room.code);
      const stillPlayer = stillRoom?.players.find(p => p.id === player.id);
      if (stillPlayer && !stillPlayer.connected) removePlayer(stillRoom, stillPlayer);
      disconnectTimers.delete(player.id);
    }, DISCONNECT_GRACE_MS);
    disconnectTimers.set(player.id, timer);
  });
});

setInterval(() => {
  const t = now();
  for (const room of rooms.values()) {
    if (room.phase !== 'playing') continue;
    for (const npc of room.npcs) {
      if (!npc.alive) continue;
      if (t > npc.nextWanderAt) {
        npc.targetX = random(-24, 24);
        npc.targetZ = random(-24, 24);
        npc.nextWanderAt = t + random(3000, 9000);
        npc.pauseUntil = Math.random() < 0.27 ? t + random(1000, 4200) : t;
      }
      if (t < npc.pauseUntil) continue;
      const dx = npc.targetX - npc.x, dz = npc.targetZ - npc.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) { npc.pauseUntil = t + random(800, 3000); continue; }
      const step = Math.min(d, npc.speed * 0.16);
      npc.x += (dx / d) * step; npc.z += (dz / d) * step;
      npc.yaw = Math.atan2(dx, dz);
    }
    if (t - room.lastStateAt > 90) {
      broadcastState(room);
      room.lastStateAt = t;
    }
    checkWinner(room);
  }
}, 160).unref();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`${APP_NAME} server listening on 0.0.0.0:${PORT}`);
});

process.on('SIGINT', () => {
  for (const timer of disconnectTimers.values()) clearTimeout(timer);
  httpServer.close(() => process.exit(0));
});
