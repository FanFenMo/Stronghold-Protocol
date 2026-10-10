import { atan2, hypot, sin, cos } from '../../../detmath.js';
// 丰川祥子 uses the existing hooks, skills, damage and fx contracts. Notes keep their launch ATK.
// PRTS: https://prts.wiki/w/丰川祥子 (motion parameters / Fever notes).
import { bodyInKeys, bodyInRadius } from '../../../body.js';
import { absoluteRangeKeys, canTargetEnemy, sortEnemyTargets } from '../../../targeting.js';
import { dirVec } from '../../../dir.js';
import { COLS } from '../../../constants.js';

const on = (u) => u.alive && u.deployed;
const BAND = new Set(['char_4182_oblvns', 'char_4183_mortis', 'char_4184_dolris', 'char_4185_amoris', 'char_4186_tmoris']);
const member = (u) => u.kind === 'op' && (u.def.raw.teamId === 'mujica' || BAND.has(u.def.charId));
const FEVER_MAX = 450, FEVER_SECONDS = 20;
const MOTION = {
  normal: { delay: 0.1, update: 0.4, free: 1.3, speed: 2, turn: 5, radius: 1, amplitude: 0.3 },
  burst: { delay: 0.6, update: 0.2, free: 1.7, speed: 2.2, turn: 5, radius: 1, amplitude: 0 },
  piano: { delay: 0.4, update: 0.2, free: 1.9, speed: 3.5, turn: 15, radius: 0.8, amplitude: 0.4, pass: 0.5 },
  organ: { delay: 0.4, update: 0.4, free: 0.7, speed: 1, turn: 2.5, radius: 1, amplitude: 0.15 },
  duet: { delay: 0.8, update: 0.4, free: 0.8, speed: 1.3, turn: 7.5, radius: 1, amplitude: 0.5 },
};

function startFever(battle, state) {
  if (state.gauge < FEVER_MAX || state.until > battle.time) return false;
  state.gauge = 0;
  state.until = battle.time + FEVER_SECONDS;
  state.held.clear();
  state.free.clear();
  for (const u of battle.allies(state.ownerId)) if (member(u) && u.skill?.active && u.skill.isTimed) state.held.add(u);
  for (const u of state.sources) if (on(u)) battle.fx('sakikoFever', { id: u.id, x: u.x, y: u.y, duration: FEVER_SECONDS });
  return true;
}

function endFever(battle, state) {
  state.until = 0;
  for (const u of state.free) if (u.skill.active) u.skill.end('feverEnd');
  state.free.clear();
  state.held.clear();
  for (const u of state.doomed) if (on(u)) battle.kill(u, null);
  state.doomed.clear();
}

function bandState(battle, ownerId) {
  battle._mujica ??= new Map();
  if (battle._mujica.has(ownerId)) return battle._mujica.get(ownerId);
  const state = { ownerId, gauge: 0, until: 0, sources: new Set(), notes: [], held: new Set(), free: new Set(), doomed: new Set() };
  battle._mujica.set(ownerId, state);
  // Fever counts attempted damage, including a later dodge or shield absorption (PRTS talent-2 note).
  battle.on('hit', (c) => {
    if (state.until > battle.time || c.source?.ownerId !== ownerId || !member(c.source) || c.target.side !== 'enemy' || ![...state.sources].some(on)) return;
    const prev = state.gauge;
    state.gauge = Math.min(FEVER_MAX, state.gauge + 3);
    if (prev < FEVER_MAX && state.gauge === FEVER_MAX) for (const u of state.sources) if (on(u)) battle.fx('sakikoFeverReady', { id: u.id, x: u.x, y: u.y });
  });
  battle.on('skillStart', (c) => {
    if (c.unit.ownerId === ownerId && member(c.unit) && c.skill.manual && c.reason !== 'fullCharge' && c.reason !== 'fever') startFever(battle, state);
  });
  battle.on('fatal', (c) => {
    if (c.prevented || state.until <= battle.time || c.unit.ownerId !== ownerId || !member(c.unit) || !c.unit.skill?.active) return;
    if (![...state.sources].some((u) => on(u) && u.def.skill.id === 'skchr_oblvns_3' && u.skill.active)) return;
    c.prevented = true;
    c.unit.hp = 1;
    state.doomed.add(c.unit);
    battle.fx('sakikoEncore', { id: c.unit.id, x: c.unit.x, y: c.unit.y });
  }, { priority: -3000 });
  battle.on('death', ({ unit }) => { state.doomed.delete(unit); state.held.delete(unit); state.free.delete(unit); });
  battle.on('tick', ({ dt }) => {
    if (state.until && state.until <= battle.time + 1e-9) endFever(battle, state);
    if (state.until > battle.time) {
      for (const u of battle.allies(ownerId)) {
        if (!member(u) || !u.skill) continue;
        const sk = u.skill;
        if (sk.active && sk.isTimed) {
          if (state.held.has(u) && Number.isFinite(sk.timeLeft)) sk.extend(dt);
        } else if (u.canAct && !u.s.flags.silence && sk.id !== 'skchr_oblvns_2' && battle.time >= (u.mem.mujicaFreeAt || 0)) {
          if (sk.activate('fever', { free: true })) {
            u.mem.mujicaFreeAt = battle.time + u.s.interval;
            if (sk.isTimed) state.free.add(u);
          }
        }
      }
    }
    moveNotes(battle, state, dt);
    const count = state.notes.length;
    // Same-name talent is an aura: one strongest instance, shared by this player's band.
    const sources = [...state.sources].filter(on);
    const t = sources[0]?.def.talents[0].bb;
    for (const u of battle.allies(ownerId)) if (member(u)) {
      if (t && count) battle.addBuff(u, { key: 'mujica:notes', duration: 0.15,
        mods: { defIgnorePct: Math.min(t.max_cnt, count) * t.def_penetrate_ratio, resIgnorePct: Math.min(t.max_cnt, count) * t.magic_resist_penetrate_ratio } });
      else battle.removeBuff(u, 'mujica:notes');
    }
  });
  return state;
}

function launch(battle, state, unit, { type, scale = 1, motion = 'normal', target = null, angle = null, isSkill = false }) {
  const [dy, dx] = dirVec(unit.dir);
  const heading = atan2(dy, dx) + (angle ?? battle.rng.range(-20, 20)) * Math.PI / 180;
  const remote = unit.blocking.length ? 1 : unit.def.traitBb.atk_scale;
  state.notes.push({ source: unit, x: unit.x, y: unit.y, angle: heading, age: 0, outside: 0, update: 0, visualAt: 0,
    target, targetSeq: target?.deploySeq, type, motion: MOTION[motion], amount: unit.s.atk * unit.s.atkScaleMul * scale * remote,
    isSkill, keys: new Set(unit.rangeKeys), hit: new Set(), passLeft: null });
}

function noteHit(battle, note, target) {
  note.hit.add(target.id);
  battle.dealDamage(note.source, target, { amount: note.amount, type: note.type, isAttack: true, isSkill: note.isSkill,
    isProjectile: true, tags: ['sakiko', 'note'], attackId: note.attackId });
  battle.fx('sakikoNoteHit', { id: target.id, x: target.x, y: target.y, type: note.type });
}

function moveNotes(battle, state, dt) {
  for (let i = state.notes.length - 1; i >= 0; i--) {
    const n = state.notes[i], m = n.motion;
    n.age += dt;
    n.update -= dt;
    if (n.update <= 0 && n.passLeft === null) {
      n.update = m.update;
      if (n.target && (!canTargetEnemy(n.source, n.target, { canHitFly: true }) || n.target.deploySeq !== n.targetSeq)) n.target = null;
      if (!n.target) {
        n.target = battle.foesInRadius(n.x, n.y, m.radius, true).filter((e) => canTargetEnemy(n.source, e, { canHitFly: true }))
          .sort((a, b) => hypot(a.x - n.x, a.y - n.y) - hypot(b.x - n.x, b.y - n.y) || a.id - b.id)[0] || null;
        n.targetSeq = n.target?.deploySeq;
      }
    }
    const tracking = n.target && n.age >= m.delay && n.passLeft === null;
    if (tracking) {
      const desired = atan2(n.target.y - n.y, n.target.x - n.x);
      const delta = atan2(sin(desired - n.angle), cos(desired - n.angle));
      n.angle += Math.max(-m.turn * dt, Math.min(m.turn * dt, delta));
    }
    const speed = n.passLeft !== null ? 3 : tracking ? m.speed : m.free;
    const side = !tracking && n.passLeft === null ? m.amplitude * sin(n.age * 5) : 0;
    n.x += (cos(n.angle) * speed - sin(n.angle) * side) * dt;
    n.y += (sin(n.angle) * speed + cos(n.angle) * side) * dt;
    if (tracking && bodyInRadius(n.target, n.x, n.y, 0.2 + speed * dt)) {
      noteHit(battle, n, n.target);
      if (m.pass) { n.passLeft = m.pass; n.target = null; }
      else { state.notes.splice(i, 1); continue; }
    }
    if (n.passLeft !== null) {
      for (const e of battle.foesInRadius(n.x, n.y, 0.8, true)) if (!n.hit.has(e.id) && canTargetEnemy(n.source, e, { canHitFly: true })) noteHit(battle, n, e);
      n.passLeft -= dt;
      if (n.passLeft <= 0) { state.notes.splice(i, 1); continue; }
    }
    const keys = on(n.source) ? n.source.rangeKeySet : n.keys;
    n.outside = keys.has(Math.round(n.y) * COLS + Math.round(n.x)) ? 0 : n.outside + dt;
    if (n.outside >= n.source.def.talents[0].bb.delay) { state.notes.splice(i, 1); continue; }
    if (battle.time >= n.visualAt) {
      battle.fx(n.type === 'arts' ? 'sakikoArtsNote' : 'sakikoPhysicalNote', { x: n.x, y: n.y, angle: n.angle });
      n.visualAt = battle.time + 0.1;
    }
  }
}

function sakiko(bb, chess, def) {
  const selected = def.skill.id;
  const s1 = selected === 'skchr_oblvns_1', s2 = selected === 'skchr_oblvns_2', s3 = selected === 'skchr_oblvns_3';
  const setForm = (battle, unit) => {
    battle.addBuff(unit, { key: 'sakiko:form', mods: unit.mem.sakikoOrgan ? { aspd: bb['attack@attack_speed'] } : { atkPct: bb['attack@atk'] } });
  };
  return {
    skills: {
      skchr_oblvns_1: {
        kind: 'charges', trigger: 'NEVER',
        onStart({ battle, unit }) {
          const state = bandState(battle, unit.ownerId);
          for (let i = 0; i < 8; i++) launch(battle, state, unit, { type: 'arts', scale: bb[i ? `atk_scale_${i + 1}` : 'atk_scale'], motion: 'burst', angle: -13.125 + i * 3.75, isSkill: true });
          battle.fx('sakikoArpeggio', { id: unit.id, x: unit.x, y: unit.y });
        },
      },
      skchr_oblvns_2: {
        kind: 'instant', trigger: 'NEVER',
        onStart({ battle, unit }) {
          const state = bandState(battle, unit.ownerId);
          if (!startFever(battle, state) && state.until <= battle.time) {
            unit.mem.sakikoOrgan = !unit.mem.sakikoOrgan;
            setForm(battle, unit);
            battle.fx('sakikoChange', { id: unit.id, x: unit.x, y: unit.y });
          }
        },
      },
      skchr_oblvns_3: {
        kind: 'duration', targeting: { rangeGrid: def.skill.rangeGrid },
        onStart({ battle, unit }) { battle.fx('sakikoDuet', { id: unit.id, x: unit.x, y: unit.y }); },
      },
    },
    install(battle, unit) {
      const state = bandState(battle, unit.ownerId);
      state.sources.add(unit);
      unit.profile.noAttack = true; // continuous attack can fire without a selected enemy
      battle.on('deploy', (c) => {
        if (c.unit !== unit) return;
        unit.mem.sakikoCd = 0;
        unit.mem.sakikoOrgan = false;
        unit.mem.mujicaFreeAt = 0;
        if (s2) setForm(battle, unit);
      }, { owner: unit });
      battle.every(0.2, () => {
        if (!on(unit)) return;
        const original = new Set(unit.baseRangeKeys);
        const extra = new Set();
        for (const a of battle.allies(unit.ownerId)) {
          if (member(a) && a !== unit && a.baseRangeKeys.some((k) => original.has(k))) {
            const own = absoluteRangeKeys(a.skill?.active && a.skill.spec.targeting?.rangeGrid || a.rangeGrid, a.tileR, a.tileC, a.dir, a.s.rangeExtend);
            for (const k of own) extra.add(k);
          }
        }
        battle.setExtraRange(unit, [...extra]);
        for (const a of battle.allies(unit.ownerId)) if (bodyInKeys(a, unit.rangeKeySet)) {
          battle.addBuff(a, { key: 'mujica:tempo', duration: 0.3, mods: { aspd: def.talents[1].bb.attack_speed } });
        }
      }, { owner: unit });
      battle.on('tick', ({ dt }) => {
        if (!unit.canAct || unit.s.flags.disarm) return;
        const sk = unit.skill, fever = state.until > battle.time;
        const targets = sortEnemyTargets(battle, unit, battle.enemiesInKeys(unit.rangeKeys, unit, { canHitFly: true }), unit.profile.priority);
        if (!fever && !unit.s.flags.silence && !sk._opCooling() && sk.ready) {
          const engaged = targets.length || state.notes.some((n) => n.source === unit && n.target?.alive);
          if ((s1 || s2) && engaged) sk.activate('DEFAULT');
          else if (s1 && sk.charges === sk.maxCharges) sk.activate('fullCharge');
        }
        unit.mem.sakikoCd -= dt;
        if (unit.mem.sakikoCd > 0) return;
        unit.mem.sakikoCd += unit.s.interval;
        const [dr, dc] = dirVec(unit.dir);
        if (!targets.length && battle.grid.tile(unit.tileR + dr, unit.tileC + dc).pass === 'NONE') return;
        unit.stats.attacks++;
        unit.lastAttackAt = battle.time;
        const attackId = ++battle._attackSeq;
        const duet = s3 && sk.active;
        const specs = [];
        if (duet) {
          const physical = targets.slice().sort((a, b) => b.s.res - a.s.res || a.id - b.id)[0];
          const arts = targets.slice().sort((a, b) => b.s.def - a.s.def || a.id - b.id)[0];
          for (let i = 0; i < 2; i++) specs.push({ type: 'phys', target: physical, scale: bb['attack@atk_scale'], motion: 'duet', isSkill: true }, { type: 'arts', target: arts, scale: bb['attack@atk_scale'], motion: 'duet', isSkill: true });
        } else {
          const organ = s2 && unit.mem.sakikoOrgan;
          for (let i = 0; i < (s2 && fever ? 2 : 1); i++) specs.push({ type: organ ? 'arts' : 'phys', motion: s2 ? organ ? 'organ' : 'piano' : 'normal', target: targets[0] || null });
        }
        for (const spec of specs) { launch(battle, state, unit, spec); state.notes.at(-1).attackId = attackId; }
        if (targets.length) {
          if (!unit.mem.engaged) { unit.mem.engaged = true; battle._ev(['engage', unit.id]); }
          battle._ev(['atk', unit.id, targets[0].id, 'none']);
        }
        battle.emit('attack', { attacker: unit, targets: targets.slice(0, 1), isSkill: duet });
        sk.onAttackPerformed(targets.slice(0, 1), duet);
      }, { owner: unit });
    },
  };
}

export default { char_4182_oblvns: sakiko };
