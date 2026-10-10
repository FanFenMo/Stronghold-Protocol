import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { makeMatch, give } from '../match/harness.js';

const AS = 'chess_custom_5_ascln_', SA = 'chess_custom_6_oblvns_';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function field(id, skillIndex = 1, extra = {}) {
  const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4, skillIndex }],
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e6, speed: 0 }), fly: enemyRec({ key: 'fly', hp: 1e6, speed: 0, motion: 'FLY' }) } },
    enemies: [{ key: 'e', pos: [10, 5] }], captureNoisy: true, autoFinish: false, timeLimit: 120, ...extra });
  h.run(0.1);
  const u = h.unit(id);
  u.skill.rule = 'NEVER';
  if (id.startsWith(AS)) { u.profile.noAttack = true; for (const e of h.enemies()) h.b.removeBuff(e, `ascln:dread#${u.id}`); }
  return { h, u, e: h.enemies()[0] };
}
const cast = (u) => { u.skill.addCharge(1); assert.equal(u.skill.activate('test'), true); };
const poke = (b, u, e) => b.dealDamage(u, e, { amount: 1, type: 'phys', isAttack: true, canDodge: false });

for (const suffix of ['a', 'b']) {
  for (const base of [AS, SA]) for (let skillIndex = 0; skillIndex < 3; skillIndex++) {
    test(`${base}${suffix} S${skillIndex + 1}: authored kit deploys, attacks and deals damage`, () => {
      const { h, u } = field(base + suffix, skillIndex);
      u.profile.noAttack = base === SA;
      cast(u);
      h.run(12);
      assert.equal(u.kit.skillSource, 'skills');
      assert.ok(u.alive && u.deployed);
      assert.ok(u.stats.attacks > 2);
      assert.ok(u.stats.dmg > u.def.stats.atk * 2);
      assert.deepEqual(h.b.errors, []);
      assert.equal(h.invariants(), true);
    });
  }

  test(`Ascalon ${suffix}: three venom layers, linear slow, live ATK, refreshed duration and death cleanup`, () => {
    const { h, u, e } = field(AS + suffix);
    for (let i = 0; i < 4; i++) poke(h.b, u, e);
    const key = `ascln:dread#${u.id}`, mark = e.buffs.find((b) => b.key === key);
    assert.equal(mark.data.n, 3);
    near(mark.mods.moveMul, 0.46);
    h.run(1);
    const before = e.hp;
    h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 } });
    h.run(1);
    near(before - e.hp, u.s.atk * 0.1 * 3);
    h.run(4);
    poke(h.b, u, e);
    near(mark.timeLeft, 25);
    h.b.kill(u, e);
    assert.ok(!e.buffs.some((b) => b.key === key));
    const hp = e.hp;
    h.run(2);
    near(e.hp, hp);
    assert.deepEqual(h.b.errors, []);
  });

  test(`Ascalon ${suffix}: S1 hits twice and attaches two venom layers`, () => {
    const { h, u, e } = field(AS + suffix, 0);
    cast(u);
    assert.ok(h.b.forceAttack(u, [e]));
    assert.equal(e.buffs.find((b) => b.key === `ascln:dread#${u.id}`).data.n, 2);
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && c.dmg.isSkill).length, 2);
  });

  test(`Ascalon ${suffix}: S2 slows air units but corpse spread marks only ground units`, () => {
    const { h, u, e } = field(AS + suffix);
    const ground = h.spawn('e', { pos: [10, 6] }), fly = h.spawn('fly', { pos: [10, 6] });
    cast(u);
    h.run(0.2);
    assert.ok(fly.buffs.some((b) => b.key === 'ascln:s2slow'));
    h.b.kill(e, null);
    assert.equal(ground.buffs.find((b) => b.key === `ascln:dread#${u.id}`).data.n, 1);
    assert.ok(!fly.buffs.some((b) => b.key === `ascln:dread#${u.id}`));
    assert.ok(h.eventsOf('fx').some((e) => e[1] === 'aoe'));
  });

  test(`Ascalon ${suffix}: S3 shortens BAT and heals only a missed or dodged attack`, () => {
    const { h, u, e } = field(AS + suffix, 2);
    cast(u);
    near(u.s.bat, u.def.stats.bat + u.skill.bb.base_attack_time);
    assert.equal(u.s.taunt, 1);
    u.hp = 100;
    h.b.rng.chance = () => true;
    h.b.dealDamage(e, u, { amount: 100, type: 'phys', isAttack: true });
    near(u.hp, 100 + u.s.maxHp * u.skill.bb['attack@hp_ratio']);
    h.b.rng.chance = () => false;
    const before = u.hp;
    h.b.dealDamage(e, u, { amount: 1000, type: 'arts', isAttack: true });
    assert.ok(u.hp < before);
    assert.equal(h.hooksOf('heal').filter((c) => c.target === u).length, 1);
  });

  test(`Sakiko ${suffix}: continuous attacks without enemies build attack SP and bounded notes`, () => {
    const { h, u } = field(SA + suffix, 0, { enemies: [] });
    h.run(10);
    assert.ok(u.stats.attacks >= 7);
    assert.ok(u.skill.activations >= 1, 'full two-charge arpeggio casts with no target');
    const state = h.b._mujica.get(u.ownerId);
    assert.equal(state.until, 0);
    assert.ok(state.notes.length < 24, 'notes expire a second after leaving range');
    assert.ok(h.eventsOf('fx').some((e) => e[1] === 'sakikoArpeggio'));
  });

  test(`Sakiko ${suffix}: S1 emits eight distinct scales, keeps launch ATK and full-charge cast cannot start Fever`, () => {
    const { h, u } = field(SA + suffix, 0, { enemies: [] });
    const state = h.b._mujica.get(u.ownerId);
    state.notes.length = 0;
    state.gauge = 450;
    u.skill.addCharge(2);
    h.step();
    assert.equal(state.until, 0);
    const notes = state.notes.filter((n) => n.isSkill);
    assert.equal(notes.length, 8);
    for (let i = 0; i < 8; i++) near(notes[i].amount, u.s.atk * 0.8 * u.skill.bb[i ? `atk_scale_${i + 1}` : 'atk_scale']);
    const amount = notes[0].amount;
    h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 2 } });
    h.run(0.1);
    near(notes[0].amount, amount);
  });

  test(`Sakiko ${suffix}: S2 starts as piano and switches to faster arts organ`, () => {
    const { h, u } = field(SA + suffix, 1);
    near(u.s.atk, u.def.stats.atk * (1 + u.skill.bb['attack@atk']));
    const state = h.b._mujica.get(u.ownerId);
    cast(u);
    assert.equal(u.mem.sakikoOrgan, true);
    near(u.s.atk, u.def.stats.atk);
    assert.ok(u.s.aspd >= 100 + u.skill.bb['attack@attack_speed']);
    state.notes.length = 0;
    u.mem.sakikoCd = 0;
    h.run(3);
    assert.ok(h.hooksOf('damaged').some((c) => c.source === u && c.type === 'arts'));
  });

  test(`Sakiko ${suffix}: S3 emits two physical + two arts notes with separate high-RES / high-DEF targets`, () => {
    const { h, u, e } = field(SA + suffix, 2);
    const armor = h.spawn('e', { pos: [11, 5] });
    e.base.res = 60; e.markDirty(); armor.base.def = 1000; armor.markDirty();
    cast(u);
    const state = h.b._mujica.get(u.ownerId);
    state.notes.length = 0;
    u.mem.sakikoCd = 0;
    h.step();
    assert.equal(state.notes.length, 4);
    assert.deepEqual(state.notes.filter((n) => n.type === 'phys').map((n) => n.target.id), [e.id, e.id]);
    assert.deepEqual(state.notes.filter((n) => n.type === 'arts').map((n) => n.target.id), [armor.id, armor.id]);
    h.run(4);
    assert.ok(h.hooksOf('damaged').some((c) => c.type === 'phys' && c.dmg.isSkill));
    assert.ok(h.hooksOf('damaged').some((c) => c.type === 'arts' && c.dmg.isSkill));
    assert.ok(u.s.defIgnorePct <= 0.3 && u.s.resIgnorePct <= 0.2);
    assert.ok(u.s.defIgnorePct > 0);
  });

  test(`Sakiko ${suffix}: 450 Fever, 20-second held skill, fatal deferral then withdrawal`, () => {
    const { h, u, e } = field(SA + suffix, 2);
    const state = h.b._mujica.get(u.ownerId);
    state.gauge = 0;
    for (let i = 0; i < 150; i++) poke(h.b, u, e);
    assert.equal(state.gauge, 450);
    cast(u);
    assert.equal(state.gauge, 0);
    const left = u.skill.timeLeft;
    h.run(3);
    near(u.skill.timeLeft, left);
    h.b.dealDamage(e, u, { amount: 1e7, type: 'true', canDodge: false });
    assert.equal(u.hp, 1);
    assert.ok(u.alive && state.doomed.has(u));
    h.run(18);
    assert.equal(state.until, 0);
    assert.equal(u.alive, false);
    assert.deepEqual(h.b.errors, []);
  });
}

test('both operators belong only to 协防干员 and acquire / merge in the real preparation engine', () => {
  const ds = getDefaultSource();
  const h = makeMatch({ mode: 'solo', humans: 1, bots: 0, fake: true });
  h.start();
  const supports = { 5: [], 6: [] };
  for (const id of [AS + 'a', SA + 'a']) if (ds.getChess(id).raw?.supportOperator) supports[ds.getChess(id).tier].push(id);
  assert.equal(h.m.setSupportOperators('p_0', supports).ok, true);
  h.toPrep(1);
  const p = h.m.players.get('p_0');
  for (const [id, tier] of [[AS + 'a', 5], [SA + 'a', 6]]) {
    assert.deepEqual(ds.getChess(id).bonds, ['emptyShip']);
    assert.equal(ds.getChess(id).tier, tier);
    give(h.m, p, id, 'board', [10, tier === 5 ? 4 : 5]);
    p.acquireChess(id); p.acquireChess(id);
    assert.ok(p.allChess().some((x) => x.id === id.replace(/_a$/, '_b')));
  }
});
