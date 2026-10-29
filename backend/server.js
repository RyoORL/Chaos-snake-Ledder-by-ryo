const http = require('http');
const { Server } = require('socket.io');
const { Room, SNAKES, LADDERS } = require('./game/game');

const ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
const server = http.createServer((req, res) => { res.writeHead(200); res.end('Snake & Chaos server OK'); });
const io = new Server(server, { cors: { origin: ORIGINS.includes('*') ? '*' : ORIGINS } });
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { let c; do { c = Array.from({length:4}, () => CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; };

function broadcast(room) {
  room.idleSince = Date.now();
  for (const p of room.players) if (p.sid && p.connected) io.to(p.sid).emit('state', { ...room.view(p), SNAKES, LADDERS });
}
function attach(room, p, s) {
  p.sid = s.id; p.connected = true; s.data = { code: room.code, pid: p.id };
  s.join(room.code);
  return { code: room.code, token: p.token, name: p.name };
}

io.on('connection', s => {
  s.on('create', (d, ack) => {
    try {
      const room = new Room(newCode(), () => broadcast(room)); rooms.set(room.code, room);
      const p = room.addPlayer(d && d.name); ack && ack(attach(room, p, s)); broadcast(room);
    } catch (e) { ack && ack({ error: e.message }); }
  });
  s.on('join', (d, ack) => {
    try {
      const room = rooms.get(String((d && d.code) || '').toUpperCase().trim());
      if (!room) return ack && ack({ error: 'Room not found', fatal: true });
      let p = d.token && room.players.find(x => x.token === d.token);
      if (!p) p = room.addPlayer(d.name); // throws if full / started
      else if (p.sid && p.sid !== s.id) io.to(p.sid).emit('kicked'); // old tab replaced
      room.say(`${p.name} joined`);
      ack && ack(attach(room, p, s)); broadcast(room);
    } catch (e) { ack && ack({ error: e.message }); }
  });
  const actions = {
    ready: (r, p) => { if (r.phase !== 'lobby') throw new Error('Not in lobby'); p.ready = !p.ready; },
    start: (r, p) => r.start(p),
    roll: (r, p) => r.roll(p),
    end: (r, p) => r.endTurn(p),
    use: (r, p, d) => r.useItem(p, Number(d.slot), d.target, Number(d.value)),
    loot: (r, p, d) => r.resolveLoot(p, d.slot),
    again: (r, p) => r.again(p),
  };
  for (const [ev, fn] of Object.entries(actions)) s.on(ev, (d, ack) => {
    try {
      const room = s.data && rooms.get(s.data.code);
      const p = room && room.players.find(x => x.id === s.data.pid);
      if (!p || p.sid !== s.id) throw new Error('Not in a room');
      fn(room, p, d || {}); broadcast(room); ack && ack({ ok: true });
    } catch (e) { ack && ack({ error: e.message }); }
  });
  s.on('disconnect', () => {
    const room = s.data && rooms.get(s.data.code);
    const p = room && room.players.find(x => x.id === s.data.pid);
    if (p && p.sid === s.id) { p.connected = false; p.ready = room.phase === 'lobby' ? false : p.ready; broadcast(room); }
  });
});

setInterval(() => { // drop abandoned rooms after 10 min
  for (const [c, r] of rooms) if (!r.players.some(p => p.connected) && Date.now() - r.idleSince > 600000) {
    clearTimeout(r.timer); clearTimeout(r.spawnTimer); rooms.delete(c);
  }
}, 60000);

server.listen(process.env.PORT || 3000, () => console.log('Listening'));
