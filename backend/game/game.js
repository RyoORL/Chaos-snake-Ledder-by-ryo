const crypto = require('crypto');
const SNAKES = {16:6,47:26,49:11,56:53,62:19,64:60,87:24,93:73,95:75,98:78};
const LADDERS = {3:22,4:14,9:31,21:42,28:84,36:44,51:67,71:91,80:99};
const WEIGHTS = {rocket:16,shield:15,bomb:15,freeze:10,swap:8,precision:10,magnet:8,lucky:12,trap:6}; // sums to 100
const TURN_MS = 15000, MAX_ITEMS = 3;
const fail = m => { throw new Error(m); };
const pickItem = () => { let r = Math.random()*100; for (const [k,w] of Object.entries(WEIGHTS)) if ((r-=w) < 0) return k; return 'rocket'; };

class Room {
  constructor(code, onChange) {
    Object.assign(this, {code, onChange, phase:'lobby', players:[], boxes:[], traps:{}, log:[], turn:0,
      stage:'roll', winner:null, deadline:0, timer:null, spawnTimer:null, rollN:0, lastRoll:null, hostId:null, idleSince:Date.now()});
  }
  say(m) { this.log.push(m); if (this.log.length > 40) this.log.shift(); }
  cur() { return this.players[this.turn]; }
  addPlayer(name) {
    if (this.phase !== 'lobby') fail('Game already started');
    if (this.players.length >= 6) fail('Room is full');
    const p = {id:crypto.randomBytes(3).toString('hex'), token:crypto.randomBytes(12).toString('hex'),
      name:(name||'').trim().slice(0,12)||'Player', sid:null, connected:true, ready:false};
    this.resetPlayer(p); this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }
  resetPlayer(p) { Object.assign(p, {pos:0, items:[], frozen:false, pending:null, precision:null, lucky:false}); }
  start(p) {
    if (p.id !== this.hostId) fail('Only the host can start');
    if (this.phase !== 'lobby') fail('Already started');
    if (this.players.length < 2) fail('Need at least 2 players');
    if (!this.players.every(x => x.ready && x.connected)) fail('Everyone must be ready and online');
    this.phase = 'playing'; this.boxes = []; this.traps = {}; this.winner = null;
    this.players.forEach(x => this.resetPlayer(x));
    this.turn = crypto.randomInt(this.players.length);
    this.say('Match started!');
    for (let i = 0; i < 3; i++) this.spawn();
    this.scheduleSpawn(); this.startTurn();
  }
  again(p) {
    if (p.id !== this.hostId || this.phase !== 'ended') fail('Not allowed');
    this.phase = 'lobby'; this.log = []; this.players.forEach(x => { x.ready = false; this.resetPlayer(x); });
  }
  eligible() {
    const occ = new Set(this.players.map(p => p.pos)); const out = [];
    for (let i = 2; i <= 99; i++) if (!occ.has(i) && !this.boxes.includes(i)) out.push(i);
    return out;
  }
  spawn() { const e = this.eligible(); if (e.length) this.boxes.push(e[crypto.randomInt(e.length)]); }
  scheduleSpawn() {
    clearTimeout(this.spawnTimer);
    this.spawnTimer = setTimeout(() => {
      if (this.phase !== 'playing') return;
      if (this.boxes.length < 6) this.spawn();
      this.scheduleSpawn(); this.onChange();
    }, 5000 + Math.random()*3000);
  }
  setTimer(ms, fn) { clearTimeout(this.timer); this.deadline = Date.now()+ms; this.timer = setTimeout(() => { if (this.phase==='playing') { fn(); this.onChange(); } }, ms); }
  startTurn() {
    const p = this.cur(); this.stage = 'roll';
    if (p.frozen) { p.frozen = false; this.say(`❄️ ${p.name} is frozen and loses the turn`); return this.nextTurn(); }
    this.setTimer(TURN_MS, () => { this.say(`⏰ ${p.name} ran out of time`); this.nextTurn(); });
  }
  nextTurn() {
    if (this.phase !== 'playing') return;
    this.turn = (this.turn+1) % this.players.length; this.startTurn();
  }
  endTurn(p) { if (this.cur() !== p || this.stage !== 'act' || this.phase !== 'playing') fail('Not your turn'); this.nextTurn(); }
  roll(p) {
    if (this.phase !== 'playing' || this.cur() !== p) fail('Not your turn');
    if (this.stage !== 'roll') fail('Already rolled');
    this.stage = 'act'; // set first: blocks duplicate rolls
    let v = p.precision || crypto.randomInt(1,7);
    if (p.lucky) v = Math.min(6, v+2);
    p.precision = null; p.lucky = false;
    this.rollN++; this.lastRoll = {id:p.id, v, n:this.rollN};
    this.say(`🎲 ${p.name} rolled ${v}`);
    this.land(p, p.pos+v);
    if (this.phase !== 'playing') return;
    this.setTimer(p.items.length ? TURN_MS : 1800, () => this.nextTurn());
  }
  blocked(t) {
    const i = t.items.indexOf('shield');
    if (i < 0) return false;
    t.items.splice(i,1); this.say(`🛡️ ${t.name}'s shield blocked it`); return true;
  }
  land(p, to) {
    p.pos = Math.max(1, Math.min(100, to));
    if (LADDERS[p.pos]) { this.say(`🪜 ${p.name} climbs ${p.pos}→${LADDERS[p.pos]}`); p.pos = LADDERS[p.pos]; }
    else if (SNAKES[p.pos]) { this.say(`🐍 ${p.name} slides ${p.pos}→${SNAKES[p.pos]}`); p.pos = SNAKES[p.pos]; }
    const t = this.traps[p.pos];
    if (t && t.owner !== p.id) {
      delete this.traps[p.pos];
      if (!this.blocked(p)) { this.say(`🪤 ${p.name} hit a trap! Back 4`); p.pos = Math.max(1, p.pos-4); }
    }
    const b = this.boxes.indexOf(p.pos);
    if (b >= 0) { this.boxes.splice(b,1); this.give(p, pickItem()); }
    if (p.pos >= 100) this.win(p);
  }
  give(p, item) {
    if (p.items.length < MAX_ITEMS) { p.items.push(item); this.say(`🎁 ${p.name} got ${item}`); }
    else { p.pending = item; this.say(`🎁 ${p.name} found ${item} but is full`); }
  }
  resolveLoot(p, slot) {
    if (!p.pending) fail('Nothing pending');
    if (slot === null || slot === undefined) { p.pending = null; return; }
    slot = +slot; if (!(slot >= 0 && slot < p.items.length)) fail('Bad slot');
    p.items[slot] = p.pending; p.pending = null;
  }
  win(p) {
    this.phase = 'ended'; this.winner = p.id; clearTimeout(this.timer); clearTimeout(this.spawnTimer);
    this.say(`🏆 ${p.name} wins!`);
  }
  useItem(p, slot, targetId, value) {
    if (this.phase !== 'playing' || this.cur() !== p) fail('Not your turn');
    const item = p.items[slot]; if (!item) fail('No item there');
    const needT = ['bomb','freeze','swap','magnet'].includes(item);
    const t = needT ? this.players.find(x => x.id === targetId) : null;
    if (needT && (!t || t === p)) fail('Pick an opponent');
    if (item === 'shield') fail('Shield works automatically');
    if ((item === 'precision' || item === 'lucky') && this.stage !== 'roll') fail('Use before rolling');
    if (item === 'precision' && !(Number.isInteger(value) && value >= 1 && value <= 6)) fail('Pick 1-6');
    if (item === 'swap' && (p.pos < 1 || t.pos < 1)) fail('Both players must be on the board');
    if (item === 'magnet' && !t.items.length) fail('Target has no items');
    if (item === 'trap' && (p.pos < 1 || this.traps[p.pos])) fail('Cannot trap here');
    p.items.splice(slot,1); // consume before effect: no duplicate use
    this.say(`${p.name} used ${item}${t ? ' on '+t.name : ''}`);
    switch (item) {
      case 'rocket': this.land(p, p.pos+5); break;
      case 'bomb': if (!this.blocked(t)) this.land(t, t.pos-3); break;
      case 'freeze': if (!this.blocked(t)) t.frozen = true; break;
      case 'swap': if (!this.blocked(t)) [p.pos, t.pos] = [t.pos, p.pos]; break;
      case 'precision': p.precision = value; break;
      case 'lucky': p.lucky = true; break;
      case 'magnet': if (!this.blocked(t)) { const s = t.items.splice(crypto.randomInt(t.items.length),1)[0]; this.give(p, s); } break;
      case 'trap': this.traps[p.pos] = {owner:p.id}; break;
    }
  }
  view(me) {
    const now = Date.now();
    return {code:this.code, me:me.id, host:this.hostId, phase:this.phase, stage:this.stage, winner:this.winner,
      turn: this.phase==='playing' ? this.cur().id : null, left: Math.max(0, this.deadline-now),
      boxes:this.boxes, traps:Object.entries(this.traps).filter(([,t]) => t.owner===me.id).map(([k]) => +k),
      lastRoll:this.lastRoll, log:this.log.slice(-10),
      players:this.players.map((p,i) => ({id:p.id, name:p.name, color:i, pos:p.pos, items:p.items, ready:p.ready,
        connected:p.connected, frozen:p.frozen, pending:p.id===me.id ? p.pending : null,
        precision:p.id===me.id ? p.precision : null, lucky:p.id===me.id ? p.lucky : false}))};
  }
}
module.exports = {Room, SNAKES, LADDERS, WEIGHTS};
