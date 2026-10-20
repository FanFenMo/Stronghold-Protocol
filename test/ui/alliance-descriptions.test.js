import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../match/harness.js';
import { bondDescriptionClauses } from '../../public/js/ui/bondDescriptions.js';
import { mergeGarrisonDescriptions } from '../../public/js/ui/garrisonDescriptions.js';
import { richTextPlain } from '../../public/js/ui/richText.js';

const clauses = (id, layers, tier = 1, active = true) => bondDescriptionClauses(DATA.bonds[id], { layers, tier, active });
const text = list => list.map(c => richTextPlain(c.text)).join(' ');
const traits = id => mergeGarrisonDescriptions(DATA.chess[id].garrisonIds.map(id => DATA.garrisons[id]), id => DATA.bonds[id].name);

test('all bonds have one concise description, complete tier requirements, no formulas or unresolved markup', () => {
  for (const b of Object.values(DATA.bonds)) for (const layers of [0, 39, 40, 100, 200, 700]) {
    const list = clauses(b.bondId, layers, b.thresholds.length);
    assert.ok(list.length, b.bondId);
    assert.ok(list.every(c => typeof c.active === 'boolean'));
    const plain = text(list);
    assert.doesNotMatch(plain, /undefined|NaN|\{\d|每层|受层数影响|÷|公式|基础.*＋/);
    assert.ok(!plain.includes('\n'));
    for (const threshold of b.thresholds) assert.ok(plain.includes(`${threshold}名`), b.bondId);
    assert.ok(clauses(b.bondId, layers, 0, false).every(c => !c.active));
  }
});

test('Aegir final HP and devour ATK update live; the five-member clause stays inactive at three', () => {
  assert.match(text(clauses('egirShip', 0)), /生命值\+35%.*基础攻击力的40%/);
  const list = clauses('egirShip', 100);
  assert.match(text(list), /生命值\+135%.*基础攻击力的100%/);
  assert.match(text(list), /重叠吞噬链仅保留最长一条造成伤害，每名目标仅承受一次吞噬/);
  assert.deepEqual(list.map(c => c.active), [true, false]);
  assert.ok(clauses('egirShip', 100, 2).every(c => c.active));
  assert.doesNotMatch(text(list), /灼烧|真伤|阻挡的非远程/);
});

test('layer gates, chance caps, prosperity blast size and small duration changes remain visible', () => {
  assert.deepEqual(clauses('swiftShip', 39).map(c => c.active), [true, false]);
  assert.deepEqual(clauses('swiftShip', 40).map(c => c.active), [true, true]);
  assert.match(text(clauses('swiftShip', 700)), /100%概率/);
  assert.match(text(clauses('sargonShip', 1)), /5.22.*秒/);
  assert.match(text(clauses('prosperityShip', 39, 2)), /造成一次周围五格真实伤害/);
  assert.match(text(clauses('prosperityShip', 40, 2)), /40层时爆炸范围扩大至九格/);
  assert.match(text(clauses('prosperityShip', 700, 2)), /治疗效果\+60%/);
  assert.doesNotMatch(text(clauses('prosperityShip', 100, 2)), /晕眩|÷/);
  assert.match(text(clauses('soloShip', 0)), /1名及以下/);
  assert.match(text(clauses('suntShip', 0, 2)), /5名精锐/);
});

test('哥伦比亚三人显示实时增幅和装备选择门槛，六人激活专属效果', () => {
  const zero = clauses('columbiaShip', 0, 1);
  assert.match(text(zero), /装备效果提升50%.*每100层再提升30%/);
  assert.match(text(zero), /20\/50\/100\/170\/250\/350.*二选一.*最后一种直接领取/);
  assert.deepEqual(zero.map(c => c.active), [true, false]);
  const six = clauses('columbiaShip', 500, 2);
  assert.match(text(six), /装备效果提升200%/);
  assert.match(text(six), /激活哥伦比亚科技装备的专属效果/);
  assert.deepEqual(six.map(c => c.active), [true, true]);
  assert.doesNotMatch(text(six), /共享|过载|50攻速/);
});

test('every operator keeps all executable garrison IDs and original records after display merging', () => {
  for (const c of Object.values(DATA.chess)) {
    const records = c.garrisonIds.map(id => DATA.garrisons[id]);
    const before = JSON.stringify(records), merged = traits(c.chessId);
    assert.deepEqual(merged.flatMap(g => g.sourceGarrisonIds).sort(), [...c.garrisonIds].sort(), c.chessId);
    assert.equal(JSON.stringify(records), before, c.chessId);
    assert.ok(merged.every(g => g.descRaw && !/undefined|NaN|^【\d+】/.test(g.descRaw)), c.chessId);
  }
});

test('matching kill triggers merge gains while different triggers and separate caps retain their meaning', () => {
  const make = (id, bond, amount, cap, trigger = '自身每击杀1名敌人时') => ({ garrisonId: id, eventType: 'IN_BATTLE',
    desc: `<战斗中>${trigger}，使已激活的【${bond}】层数+${amount}，每回合最多叠加${cap}层` });
  const records = [make('a', '阿戈尔', 1, 18), make('b', '不屈', 2, 30), make('c', '繁盛', 3, 40, '开启技能时')];
  const merged = mergeGarrisonDescriptions(records, id => id);
  assert.equal(merged.length, 2);
  assert.match(merged[0].desc, /阿戈尔】层数\+1，每回合最多叠加18层.*不屈】层数\+2，每回合最多叠加30层/);
  assert.deepEqual(merged[0].sourceGarrisonIds, ['a', 'b']);
});

for (const [suffix, mul] of [['a', 1], ['b', 2]]) test(`merged traits ${suffix} retain triggers, per-bond caps and elite values`, () => {
  const vendla = traits(`chess_char_1_06_${suffix}`);
  assert.equal(vendla.length, 1);
  assert.match(vendla[0].desc, new RegExp(`维多利亚】层数\\+${mul}.*繁盛】层数\\+${mul}`));
  const doll = traits(`chess_char_5_13_${suffix}`);
  assert.equal(doll.length, 3);
  assert.match(doll[1].desc, new RegExp(`阿戈尔】层数\\+${5 * mul}.*不屈】层数\\+${10 * mul}`));
  assert.match(doll[2].desc, new RegExp(`最多叠加${30 * mul}层`));
  const exe = traits(`chess_char_5_01_${suffix}`);
  assert.equal(exe.length, 1);
  assert.match(exe[0].desc, new RegExp(`拉特兰】层数\\+${7 * mul}.*至多${49 * mul}层.*远见】层数\\+${3 * mul}.*至多${21 * mul}层`));
  assert.equal(traits(`chess_char_3_19_${suffix}`).length, 1);
  assert.equal(traits(`chess_char_3_17_${suffix}`).length, 1, 'weakness description appears once');
  const nearLight = traits(`chess_char_6_17_${suffix}`);
  assert.equal(nearLight.length, 1, 'shared front-tile traits are displayed together');
  assert.match(nearLight[0].desc, /自身和身前一格干员.*再部署时间.*攻击速度/);
  assert.equal(traits(`chess_char_6_20_${suffix}`).length, 1);
  assert.equal(traits(`chess_char_5_21_${suffix}`).length, 2, 'prep start and prep end remain distinct');
});
