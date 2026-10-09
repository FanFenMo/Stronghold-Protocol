import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
const CAGE='token_10055_phatm2_mndclv',LURE='token_10054_phatm2_encdool';
function field(skillIndex=2){
 const id='chess_custom_6_phatm2_a',h=makeBattle({units:[{chessId:id,row:10,col:4,skillIndex}],
  defs:{enemies:{e:enemyRec({key:'e',hp:1e7,speed:0,def:0,res:0,atk:0})}},enemies:[{key:'e',pos:[10,6]}],
  autoFinish:false,timeLimit:100,captureNoisy:true,setup(b){const u=b.allyUnits[0];u.profile.noAttack=true;u.skill.rule='NEVER';}});
 h.step();return {h,u:h.unit(id),e:h.enemies()[0]};
}
const cast=u=>{u.skill.addCharge(1);assert.ok(u.skill.activate('test'));};
test('Phantom S1: two arts hits attach neural, bind and amplify allied neural during that bind',()=>{
 const {h,u,e}=field(0);cast(u);h.b.forceAttack(u,[e]);h.run(.6);
 assert.equal(h.hooksOf('damaged').filter(c=>c.source===u&&c.dmg.isAttack).length,2);
 assert.ok(e.findBuff('bind'));const before=e.elem.neural;
 h.b.dealDamage(null,e,{amount:100,type:'element',element:'neural'});assert.ok(Math.abs(e.elem.neural-before-130)<1e-6);
 assert.deepEqual(h.b.errors,[]);
});
test('Phantom S3: neural rider keeps accumulating until burst and cooldown recovers 50% faster',()=>{
 const {h,u,e}=field();cast(u);h.b.forceAttack(u,[e]);h.run(.6);const before=e.elem.neural;
 h.run(1);assert.ok(e.elem.neural>before);
 h.b.dealDamage(u,e,{amount:1000,type:'element',element:'neural'});
 const lock=e.findBuff('neuralBurst'),left=lock.timeLeft;h.run(1);assert.ok(Math.abs(left-lock.timeLeft-1.5)<.05);
 assert.equal(e.s.aspd,88);assert.deepEqual(h.b.errors,[]);
});
test('Phantom cages: multiple tiles, only blocked attacks count, exactly three hits and owner cleanup',()=>{
 const {h,u,e}=field();cast(u);h.b.dealDamage(u,e,{amount:1000,type:'element',element:'neural'});
 const cage=h.allies().find(t=>t.defId===CAGE);assert.ok(cage);assert.equal(e.blockedBy,cage);
 const other=h.spawn('e',{pos:[11,6]});h.b.dealDamage(u,other,{amount:1000,type:'element',element:'neural'});
 assert.equal(h.allies().filter(t=>t.defId===CAGE&&t.alive).length,2);
 h.b.dealDamage(u,cage,{amount:1e5,type:'true'});assert.equal(cage.hp,3);
 for(let i=0;i<2;i++)h.b.dealDamage(e,cage,{amount:1e5,type:'phys',isAttack:true});assert.equal(cage.hp,1);assert.ok(cage.alive);
 h.b.dealDamage(e,cage,{amount:1e5,type:'phys',isAttack:true});assert.ok(!cage.alive);
 h.b.retreat(u,{reason:'test'});assert.ok(!h.allies().some(t=>t.defId===CAGE&&t.alive));assert.deepEqual(h.b.errors,[]);
});
test('Phantom S2: lure attracts reachable enemies and leaves a six-second arts/neural field',()=>{
 const {h,u,e}=field(1);cast(u);u.mem.phatm2.nextLure=Infinity;
 const lure=h.b.spawnToken(u,LURE,10,5);assert.ok(lure);
 h.run(.2);assert.ok(e.s.flags.attract);
 e.x=lure.x;e.y=lure.y;h.run(.2);assert.ok(!lure.alive);assert.ok(!e.s.flags.attract);
 h.run(.7);assert.ok(h.hooksOf('damaged').some(c=>c.source===u&&c.dmg.tags.includes('phatm2:lure')));assert.ok(e.findBuff('sluggish'));
 assert.deepEqual(h.b.errors,[]);assert.ok(h.invariants());
});
