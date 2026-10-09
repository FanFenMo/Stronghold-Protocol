import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
const ID='chess_custom_6_mantra_a';
function field(skillIndex=2){
 const h=makeBattle({units:[{chessId:ID,row:10,col:4,skillIndex}],defs:{enemies:{e:enemyRec({key:'e',hp:1e7,speed:0,def:0,res:0,atk:0})}},
  enemies:[{key:'e',pos:[10,5]}],autoFinish:false,timeLimit:100,captureNoisy:true,
  setup(b){b.allyUnits[0].skill.rule='NEVER';b.allyUnits[0].profile.noAttack=true;}});
 h.step();return {h,u:h.unit(ID),e:h.enemies()[0]};
}
const cast=u=>{u.skill.addCharge(1);assert.ok(u.skill.activate('test'));};
test('Mantra: palsy talent triggers only an interrupted normal attack, with a single highest-probability retention',()=>{
 const {h,u,e}=field(0);e.x=4.5;e.base.atk=100;e.markDirty();
 h.b.applyStatus(e,'palsy',{value:2,source:u});assert.equal(h.hooksOf('damaged').length,0);
 h.b.rng.chance=()=>false;e.atkCd=0;h.runUntil(()=>e.findBuff('palsy')?.stacks===1,2);assert.equal(e.findBuff('palsy').stacks,1);
 const hp=e.hp;h.b.rng.chance=()=>true;e.atkCd=0;
 h.runUntil(()=>h.hooksOf('damaged').filter(x=>x.dmg.tags.includes('mantra:palsy')).length===2,2);assert.equal(e.findBuff('palsy').stacks,1);
 assert.ok(Math.abs(hp-e.hp-u.s.atk*1.35)<1e-6);assert.deepEqual(h.b.errors,[]);
});
test('Mantra: nearest invasion point receives one palsy, other points do not',()=>{
 const {h,u}=field();const a=h.spawn('e',{pos:[9,10]}),other=h.spawn('e',{pos:[12,10]});
 assert.equal(a.findBuff('palsy').stacks,1);assert.ok(!other.findBuff('palsy'));assert.deepEqual(h.b.errors,[]);
});
test('Mantra S2: main arts hit plus two distinct chains, all with actual-damage neural riders',()=>{
 const {h,u,e}=field(1);const b=h.spawn('e',{pos:[10,6]}),c=h.spawn('e',{pos:[10,7]});cast(u);
 h.b.forceAttack(u,[e]);h.run(1);
 const hits=h.hooksOf('damaged').filter(x=>x.source===u&&x.dmg.tags.includes('mantra:chain'));
 assert.equal(hits.length,2);assert.ok([e,b,c].every(x=>x.elem.neural>0));assert.deepEqual(h.b.errors,[]);
});
test('Mantra S3: reveals stealth, caps palsy at two, chains overflow and accepts at most three allied casts',()=>{
 const {h,u,e}=field();h.b.addBuff(e,{key:'test:stealth',flags:{stealth:true}});cast(u);h.step();
 assert.ok(e.s.flags.reveal);assert.equal(e.findBuff('palsy').stacks,2);
 for(let i=0;i<3;i++)h.b.emit('skillStart',{unit:u,skill:u.skill});
 h.run(.5);assert.equal(u.mem.mantra.triggers,3);assert.equal(e.findBuff('palsy').stacks,2);
 assert.equal(h.hooksOf('damaged').filter(x=>x.source===u&&x.dmg.tags.includes('mantra:overflow')).length,4);
 u.skill.end('test');assert.ok(!e.s.flags.reveal);assert.deepEqual(h.b.errors,[]);assert.ok(h.invariants());
});
