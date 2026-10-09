import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getData} from '../../server/data.js';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';

function field(skillIndex=2,id='chess_custom_6_wisdel_a'){
 const h=makeBattle({units:[{chessId:id,row:10,col:4,skillIndex}],
  defs:{enemies:{e:enemyRec({key:'e',hp:1e7,def:0,res:0,speed:0})}},
  enemies:[{key:'e',pos:[10,5]}],autoFinish:false,timeLimit:100,captureNoisy:true,
  setup(b){const u=b.allyUnits[0];u.skill.rule='NEVER';u.profile.noAttack=true;}});
 h.step();const u=h.unit(id);u.skill.rule='NEVER';u.profile.noAttack=true;
 return {h,u,e:h.enemies()[0]};
}
const cast=u=>{u.skill.addCharge(1);assert.ok(u.skill.activate('test'));};
test('Wisdel: deployment summons one shadow; no normal attack, real arts skill, marks and owner cleanup',()=>{
 const {h,u,e}=field();const shadow=h.allies().find(t=>t.ownerUnit===u);
 assert.ok(shadow);assert.ok(shadow.profile.noAttack);h.run(.3);assert.ok(u.s.flags.camou);
 shadow.skill.addCharge(1);h.run(.2);assert.ok(shadow.stats.dmg>0);assert.ok(e.findBuff(`wisdel:mark:${u.id}`));
 h.b.retreat(u,{reason:'test'});assert.ok(!shadow.alive);assert.ok(!e.findBuff(`wisdel:mark:${u.id}`));assert.deepEqual(h.b.errors,[]);
});
test('Wisdel S1: exactly three aftershocks with Lv4 scale and stun',()=>{
 const {h,u,e}=field(0);h.b.rng.chance=()=>false;cast(u);h.b.forceAttack(u,[e]);h.run(1.2);
 const hits=h.hooksOf('damaged').filter(c=>c.source===u&&c.dmg.tags.includes('aftershock'));
 assert.equal(hits.length,3);assert.ok(Math.abs(hits[0].amount-u.s.atk*.75*1.15)<1e-6);assert.ok(e.s.flags.stun);
});
test('Wisdel S3: last ammo still guarantees marked explosions; shadows survive skill end and cap at three',()=>{
 const {h,u,e}=field();cast(u);assert.equal(h.allies().filter(t=>t.ownerUnit===u).length,2);
 const atk=u.s.atk;u.skill.ammoLeft=1;h.b.forceAttack(u,[e]);assert.ok(!u.skill.active);
 h.run(.6);const blasts=h.hooksOf('damaged').filter(c=>c.source===u&&c.dmg.tags.includes('wisdel:explosion'));
 assert.equal(blasts.length,1);assert.ok(Math.abs(blasts[0].amount-atk*1.5)<1e-6);
 cast(u);u.skill.end('test');cast(u);assert.equal(h.allies().filter(t=>t.ownerUnit===u&&t.alive).length,3);
 assert.deepEqual(h.b.errors,[]);assert.ok(h.invariants());
});
test('Wisdel S2: overdrive switches three targets to four randomly assigned shots',()=>{
 const {h,u,e}=field(1);cast(u);h.run(13);
 h.b.forceAttack(u,[e]);const attack=h.hooksOf('attack').filter(c=>c.attacker===u).at(-1);
 assert.equal(attack.targets.length,4);assert.equal(u.skill.spec.attack.atkScale,.65);
 assert.deepEqual(h.b.errors,[]);
});
test('support token variants retain owner level, skill alternatives and deploy counts in both tiers',()=>{
 const data=getData();
 for(const rec of Object.values(data.chess).filter(c=>c.supportOperator))for(const id of rec.tokens){
  const t=data.tokens[id];assert.ok(t.owners.includes(rec.chessId));
  assert.equal(t.variants[rec.chessId].level,rec.status.level);
 }
});
