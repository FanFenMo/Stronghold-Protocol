import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle} from '../helpers/battleHarness.js';
for(const suffix of ['a','b'])test(`Mlynar ${suffix}: current active Kazimierz layers boost natural SP and pause during skills`,()=>{
 const id=`chess_char_5_19_${suffix}`,h=makeBattle({units:[{chessId:id,row:10,col:4,skillIndex:0}],
  bonds:{kazimierzShip:{count:3,active:true,tier:1,layers:100}},autoFinish:false,timeLimit:200});
 h.step();const u=h.unit(id);u.skill.rule='NEVER';u.skill.sp=0;u.skill.charges=0;
 assert.equal(u.s.spRecovery,2.5);h.run(1);assert.ok(Math.abs(u.skill.sp-2.5)<1e-6);
 h.b.addLayers('p1','kazimierzShip',50,'test');h.run(.1);assert.equal(u.s.spRecovery,3.25);
 u.skill.addCharge(1);u.skill.activate('test');h.run(1);assert.equal(u.skill.sp,0);
 u.skill.end('test');h.run(1);assert.ok(Math.abs(u.skill.sp-3.25)<1e-6);
 // The added SP trait keeps working after the original 100-second deployment attribute buff expires.
 h.run(101);assert.equal(u.s.spRecovery,3.25);assert.deepEqual(h.b.errors,[]);assert.ok(h.invariants());
});
test('Mlynar: inactive Kazimierz contributes no layer-derived SP bonus',()=>{
 const h=makeBattle({units:[{chessId:'chess_char_5_19_a',row:10,col:4}],
  bonds:{kazimierzShip:{count:1,active:false,tier:0,layers:100}},autoFinish:false});h.step();
 assert.equal(h.unit('chess_char_5_19_a').s.spRecovery,1);
});
