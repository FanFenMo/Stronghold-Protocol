import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { DATA, makeMatch, give } from '../match/harness.js';
import { computeBonds } from '../../server/match/bondsMeta.js';
import { GameData } from '../../server/match/gamedata.js';
import { layerGainRoom } from '../../shared/constants.js';
import { applyProsperityData } from '../../tools/prosperity-data.mjs';
import { bondIconUrl } from '../../public/js/ui/assetUrls.js';
import { formatBondEffect } from '../../public/js/ui/richText.js';

const ID = 'prosperityShip';
const B = (layers = 0, tier = 2) => ({ count: tier ? tier + 1 : 0, active: !!tier, tier, layers });
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);
function field(layers = 0, tier = 2, opts = {}) {
  const defs = { chess: Object.fromEntries(['emitter', 'member', 'patient', 'diagonal'].map(id => [id,
    chessRec({ id, skill: null, bonds: id === 'emitter' || id === 'member' ? [ID] : [],
      rangeGrid: [[0, 0], [0, 1], [1, 1]], stats: { maxHp: 100000, atk: 0, blockCnt: 0 } })])),
    enemies: { target: enemyRec({ key: 'target', hp: 100000, def: 10000, res: 100, speed: 0 }) } };
  const h = makeBattle({ defs, bonds: { [ID]: B(layers, tier) }, autoFinish: false, captureNoisy: true,
    units: [{ uid: 1, chessId: 'emitter', row: 10, col: 4 }, { uid: 2, chessId: 'member', row: 12, col: 3 },
      { uid: 3, chessId: 'patient', row: 10, col: 6 }, { uid: 4, chessId: 'diagonal', row: 11, col: 6 }], ...opts });
  h.step();
  for (const u of h.allies()) { u.profile.noAttack = true; if (u.skill) u.skill.rule = 'NEVER'; }
  return h;
}
const clean = h => { assert.deepEqual(h.b.errors, []); checkInvariants(h.b); };

test('繁盛固定卡池15人及精锐，排除波登可等干员；删除两个历史条目及引用，数据生成幂等', () => {
  const names = ['刺玫', '古米', '赫默', '哈洛德', '莎草', '调香师', '白面鸮', '华法琳', '缇缇', '铃兰', '塞雷娅', '录武官', '焰影苇草', '流明', '纯烬艾雅法拉'];
  const roster = Object.values(DATA.chess).filter(c => c.bonds.includes(ID));
  assert.equal(roster.length, 30);
  assert.deepEqual(roster.filter(c => !c.isGolden).map(c => c.name).sort(), names.sort());
  assert.ok(roster.every(c => c.visible && !c.isHidden && !c.supportOperator));
  for (const retired of ['chess_char_4_15_a', 'chess_char_4_15_b', 'chess_char_5_09_a', 'chess_char_5_09_b']) {
    assert.equal(DATA.chess[retired], undefined);
    assert.ok(!JSON.stringify({ bonds: DATA.bonds, garrisons: DATA.garrisons }).includes(retired));
  }
  const copy = structuredClone(DATA); applyProsperityData(copy);
  const once = JSON.stringify(copy); applyProsperityData(copy); assert.equal(JSON.stringify(copy), once);
  for (const mode of Object.values(DATA.config.modes)) assert.ok(mode.activeBondIds.includes(ID));
});

test('繁盛按不同干员计数：普通和精锐同人仅计一次，2人增疗，3人生命球', () => {
  const gd = new GameData(DATA, 'mode_multi_normal');
  const piece = id => ({ uid: id, kind: 'chess', id });
  const state = ids => computeBonds(gd, { board: new Map(ids.map((id, i) => [`10,${i + 2}`, piece(id)])), hand: [], layers: {} })[ID];
  assert.equal(state(['chess_char_1_06_a', 'chess_char_1_06_b']).active, false);
  assert.equal(state(['chess_char_1_06_a', 'chess_char_1_10_a']).tier, 1);
  assert.equal(state(['chess_char_1_06_a', 'chess_char_1_10_a', 'chess_char_2_02_a']).tier, 2);
});

test('治疗提升按50层分档，200层最高60%，只作用于成员；未激活不增疗', () => {
  for (const [layers, ratio] of [[0, 1.2], [49, 1.2], [50, 1.3], [99, 1.3], [100, 1.4], [150, 1.5], [199, 1.5], [200, 1.6]]) {
    const h = field(layers, 1), u = h.unit(1), p = h.unit(3); p.hp -= 10000;
    approx(h.b.heal(u, p, 100), 100 * ratio);
    approx(h.b.heal(h.unit(4), p, 100), 100);
    assert.equal(u.mem.prosperityHealing, undefined, '2人只增疗'); clean(h);
  }
  const h = field(0, 0); h.unit(3).hp -= 1000;
  approx(h.b.heal(h.unit(1), h.unit(3), 100), 100); clean(h);
});

test('治疗计数使用实际回复量，排除溢出、自疗、非干员和装置治疗；无敌人时保留', () => {
  const h = field(), u = h.unit(1), p = h.unit(3);
  p.hp -= 50; approx(h.b.heal(u, p, 1000), 50);
  h.b.heal(u, p, 1000); u.hp -= 500; h.b.heal(u, u, 100);
  p.kind = 'token'; p.hp -= 500; h.b.heal(u, p, 100); p.kind = 'op';
  u.kind = 'device'; h.b.heal(u, p, 100); u.kind = 'op';
  h.run(2); approx(u.mem.prosperityHealing, 50); clean(h);
});

for (const layers of [39, 40]) test(`生命球${layers}层：${layers < 40 ? '十字五格' : '九宫格'}，群体真伤、精确半量治疗、0.5秒晕眩`, () => {
  const h = field(layers), u = h.unit(1), p = h.unit(3), diagonal = h.unit(4);
  p.hp -= 20000; diagonal.hp -= 20000;
  const cross = h.spawn('target', { pos: [10, 5] }), diag = h.spawn('target', { pos: [11, 6] }), far = h.spawn('target', { pos: [10, 7] });
  // 计入6000实际治疗后释放1200真伤，每名范围内友军600治疗。
  approx(h.b.heal(u, p, 5000), 6000);
  const beforeP = p.hp, beforeDiag = diagonal.hp;
  h.run(1);
  approx(cross.s.maxHp - cross.hp, 1200);
  approx(diag.s.maxHp - diag.hp, layers < 40 ? 0 : 1200);
  approx(far.s.maxHp - far.hp, 0);
  approx(p.hp - beforeP, 600);
  approx(diagonal.hp - beforeDiag, layers < 40 ? 0 : 600);
  assert.ok(h.hooksOf('statusApplied').some(c => c.target === cross && c.status === 'stun' && c.duration === 0.5));
  assert.equal(u.mem.prosperityHealing, 0); clean(h);
});

test('生命球上限5000/2500，每次清空全部计数，超过上限的积累不保留，空计数不再发射', () => {
  const h = field(200), u = h.unit(1), p = h.unit(3); p.hp -= 80000;
  const e = h.spawn('target', { pos: [10, 5] });
  approx(h.b.heal(u, p, 30000), 48000);
  const before = p.hp; h.run(1);
  approx(e.s.maxHp - e.hp, 5000); approx(p.hp - before, 2500);
  assert.equal(u.mem.prosperityHealing, 0); h.run(2);
  approx(e.s.maxHp - e.hp, 5000); assert.equal(h.eventsOf('fx').filter(e => e[1] === 'lifeOrb').length, 1); clean(h);
});

test('成员独立储存计数；范围外敌人不会释放；晕眩免疫按引擎生效', () => {
  const h = field(), u = h.unit(1), other = h.unit(2), p = h.unit(3); p.hp -= 10000;
  h.b.heal(u, p, 1000); h.b.heal(other, p, 500);
  const e = h.spawn('target', { pos: [12, 9] }); h.run(1); approx(u.mem.prosperityHealing, 1200);
  e.x = 5; e.y = 10; e.def.immune.add('stun'); h.b._buildEnemyIndex(); h.run(1);
  approx(e.s.maxHp - e.hp, 240); assert.equal(e.findBuff('stun'), null);
  assert.equal(u.mem.prosperityHealing, 0); approx(other.mem.prosperityHealing, 600); clean(h);
});

test('生命球无来源真伤不触发咒愈治疗，自身治疗也不再次充能', () => {
  const h = field(0, 2, { defs: { chess: { emitter: chessRec({ id: 'emitter', profession: 'MEDIC', subProf: 'incantationmedic',
    bonds: [ID], skill: null, stats: { atk: 0, maxHp: 100000 }, rangeGrid: [[0, 0], [0, 1], [0, 2]] }),
    patient: chessRec({ id: 'patient', skill: null, stats: { maxHp: 100000, atk: 0 } }) },
    enemies: { target: enemyRec({ key: 'target', hp: 100000, speed: 0 }) } },
    units: [{ uid: 1, chessId: 'emitter', row: 10, col: 4 }, { uid: 3, chessId: 'patient', row: 10, col: 6 }] });
  const u = h.unit(1), p = h.unit(3); p.hp -= 30000;
  const e = h.spawn('target', { pos: [10, 5] });
  h.b.dealDamage(u, e, { amount: 1000, type: 'true' });
  assert.ok(u.mem.prosperityHealing > 0, '普通咒愈会累计治疗');
  const count = u.mem.prosperityHealing, before = p.hp; h.run(1);
  approx(p.hp - before, count / 10); assert.equal(u.mem.prosperityHealing, 0); clean(h);
});

test('共享战场按玩家区分繁盛加成，生命球可治疗范围内队友，其他玩家治疗不替成员充能', () => {
  const h = field(0, 2, { players: [
    { playerId: 'p1', bonds: { [ID]: B(0) }, units: [{ uid: 1, chessId: 'emitter', row: 10, col: 4 }] },
    { playerId: 'p2', bonds: { [ID]: B(0, 0) }, units: [{ uid: 2, chessId: 'member', row: 10, col: 6 }] },
  ] });
  const u = h.unit(1), p = h.unit(2); p.hp -= 10000; u.hp -= 1000;
  approx(h.b.heal(p, u, 100), 100); assert.equal(u.mem.prosperityHealing, undefined);
  approx(h.b.heal(u, p, 1000), 1200);
  h.spawn('target', { pos: [10, 5] }); const before = p.hp; h.run(1);
  approx(p.hp - before, 120); assert.equal(u.mem.prosperityHealing, 0); clean(h);
});

test('铃兰技能回复速度享受繁盛并按实际恢复归属，其他自然回复不计数', () => {
  const h = field(50, 2, { units: [{ uid: 1, chessId: 'chess_char_5_10_a', row: 10, col: 4 },
    { uid: 3, chessId: 'patient', row: 10, col: 5 }] });
  const u = h.unit(1), p = h.unit(3); p.hp -= 10000;
  h.b.addBuff(p, { key: 'test:natural', mods: { hpRegen: 100 } }); h.run(1);
  assert.equal(u.mem.prosperityHealing || 0, 0);
  h.b.removeBuff(p, 'test:natural');
  assert.ok(u.skill.activate('test', { free: true }));
  h.run(1.1); const before = p.hp, counted = u.mem.prosperityHealing || 0;
  h.run(1);
  const expected = u.s.atk * u.def.skill.bb['attack@atk_to_hp_recovery_ratio'] * 1.3;
  approx(p.hp - before, expected); approx(u.mem.prosperityHealing - counted, expected);
  p.hp = p.s.maxHp - 1; const last = u.mem.prosperityHealing; h.run(0.5);
  approx(u.mem.prosperityHealing - last, 1); clean(h);
});

for (const [suffix, mul] of [['a', 1], ['b', 2]]) test(`四条叠层特性 ${suffix}：获取、休整期、同行技能、激活限制和200层上限`, () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start().toPrep(1), ps = h.ps('p_0');
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.bandId = null; ps.layers = {}; ps.recompute();
  assert.ok(ps.acquireChess(`chess_char_2_06_${suffix}`, { source: 'test' }));
  assert.equal(ps.layers[ID], 3 * mul);
  assert.ok(ps.acquireChess(`chess_char_4_26_${suffix}`, { source: 'test' }));
  assert.equal(ps.layers[ID], 7 * mul);
  give(h.m, ps, `chess_char_1_06_${suffix}`, 'board', [10, 4]);
  h.m.dispatch(ps, 'onPrepEnd', {}); assert.equal(ps.layers[ID], 7 * mul, '未激活不能叠休整层数');
  give(h.m, ps, 'chess_char_1_10_a', 'board', [10, 5]);
  h.m.dispatch(ps, 'onPrepEnd', {}); assert.equal(ps.layers[ID], 8 * mul);
  ps.addLayers(ID, 1000); assert.equal(ps.layers[ID], 200); h.m.dispatch(ps, 'onPrepEnd', {}); assert.equal(ps.layers[ID], 200);
  assert.equal(layerGainRoom(199, 8, ID), 1); assert.equal(layerGainRoom(200, 8, ID), 0); assert.equal(layerGainRoom(998, 8, 'yanShip'), 1);
  h.m.dispose();
  const f = field(0, 1, { units: [{ uid: 1, chessId: `chess_char_6_20_${suffix}`, row: 10, col: 4 },
    { uid: 2, chessId: 'patient', row: 10, col: 5 }, { uid: 3, chessId: 'diagonal', row: 11, col: 6 }],
    bonds: { [ID]: B(0, 1), yanShip: { count: 3, active: true, tier: 1, layers: 100 } } });
  const u = f.unit(1); f.b.emit('skillStart', { unit: u, skill: u.skill });
  assert.equal(f.b.getPlayer('p1').bonds[ID].layers, 2 * mul);
  assert.equal(f.b.getPlayer('p1').bonds.yanShip.layers, 100 + 3 * mul, '保留原有最高盟约特性');
  f.b.retreat(f.unit(2)); f.b.emit('skillStart', { unit: u, skill: u.skill });
  assert.equal(f.b.getPlayer('p1').bonds[ID].layers, 3 * mul);
  f.b.addLayers('p1', ID, 999); assert.equal(f.b.getPlayer('p1').bonds[ID].layers, 200);
  f.b.getPlayer('p1').bonds[ID].active = false; f.b.emit('skillStart', { unit: u, skill: u.skill });
  assert.equal(f.b.getPlayer('p1').bonds[ID].layers, 200); clean(f);
});

test('跨50层时治疗加成及时更新；繁盛图标根据激活状态选取用户提供的资源', () => {
  const h = field(49), u = h.unit(1), p = h.unit(3); h.b.addLayers('p1', ID, 1); h.step();
  p.hp -= 1000; approx(h.b.heal(u, p, 100), 130); clean(h);
  assert.equal(bondIconUrl(DATA.assets, ID), '/img/bonds/prosperity-inactive.png');
  assert.equal(bondIconUrl(DATA.assets, ID, true), '/img/bonds/prosperity-active.png');
  assert.match(formatBondEffect(DATA.bonds[ID], 39), /治疗效果\+20%[\s\S]*范围为5格/);
  assert.match(formatBondEffect(DATA.bonds[ID], 50), /治疗效果\+30%[\s\S]*范围为9格/);
  assert.match(formatBondEffect(DATA.bonds[ID], 200), /治疗效果\+60%/);
});
