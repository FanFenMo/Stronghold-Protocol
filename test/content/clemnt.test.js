import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';

function field(skillIndex=2,extra={}){
 const id='chess_custom_6_clemnt_a';
 const h=makeBattle({units:[{chessId:id,row:10,col:4,skillIndex}],
  defs:{enemies:{e:enemyRec({key:'e',hp:1e7,def:100,speed:0,atk:0})}},
  enemies:[{key:'e',pos:[10,5]}],autoFinish:false,timeLimit:100,captureNoisy:true,...extra});
 h.step();const u=h.unit(id);u.skill.rule='NEVER';u.profile.noAttack=true;
 return {h,u,e:h.enemies()[0]};
}
const cast=u=>{u.skill.addCharge(1);assert.ok(u.skill.activate('test'));};
test('Clemens: damage talent checks current DEF and frontal reduction respects facing',()=>{
 const {h,u,e}=field();const old=h.b.rng.chance,probs=[];
 h.b.rng.chance=p=>{probs.push(p);return true;};
 let hp=e.hp;h.b.dealDamage(u,e,{amount:1000,type:'phys',canDodge:false});assert.equal(hp-e.hp,1250);assert.equal(probs.at(-1),.25);
 h.b.addBuff(e,{key:'test:def',mods:{defFlat:-50}});
 h.b.dealDamage(u,e,{amount:1000,type:'phys',canDodge:false});assert.equal(probs.at(-1),.5);
 hp=u.hp;h.b.dealDamage(e,u,{amount:1000,type:'arts',canDodge:false});assert.equal(hp-u.hp,630);
 e.x=3;hp=u.hp;h.b.dealDamage(e,u,{amount:100,type:'arts',canDodge:false});assert.equal(hp-u.hp,90);
 h.b.rng.chance=old;assert.deepEqual(h.b.errors,[]);
});
test('Clemens S1: erosion uses actual dealt damage',()=>{
 const {h,u,e}=field(0);cast(u);h.b.rng.chance=()=>false;
 h.b.forceAttack(u,[e]);assert.ok(Math.abs(e.elem.erosion-(u.s.atk*2.05-e.s.def)*.25)<1e-6);
});
test('Clemens S3: normal attacks preserve ammo, global erosion spends one and bombards only the ground cross',()=>{
 const {h,u,e}=field();cast(u);h.b.forceAttack(u,[e]);assert.equal(u.skill.ammoLeft,10);
 // A burst can originate from another unit anywhere on the field.
 const far=h.spawn('e',{pos:[11,8]});h.b.dealDamage(null,far,{amount:1000,type:'element',element:'erosion'});
 h.step();assert.equal(u.skill.ammoLeft,9);
 h.run(3.2);assert.equal(h.hooksOf('damaged').filter(x=>x.source===u&&x.target===far&&x.dmg.tags.includes('clemnt:barrage')).length,6);
 assert.deepEqual(h.b.errors,[]);assert.ok(h.invariants());
});
test('Clemens S2: capsule carries bounded mass, stops inside the lower edge and releases its passengers',()=>{
 const {h,u,e}=field(1,{units:[{chessId:'chess_custom_6_clemnt_a',row:10,col:4,dir:'DOWN',skillIndex:1}],enemies:[{key:'e',pos:[9,4]}]});
 cast(u);h.run(2);assert.ok(e.y>=8.5&&e.y<=10);assert.ok(!e.s.flags.untargetable);assert.ok(!u.s.flags.disarm);
 const fx=h.eventsOf('fx').filter(x=>x[1]==='clemntCapsule');assert.ok(fx.length>0);
 assert.deepEqual(h.b.errors,[]);assert.ok(h.invariants());
});
