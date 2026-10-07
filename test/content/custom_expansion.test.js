import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,chessRec,enemyRec} from '../helpers/battleHarness.js';
import {GameData} from '../../server/match/gamedata.js';
import {computeBonds,bondSnapshot} from '../../server/match/bondsMeta.js';
import {makeMatch,give,DATA} from '../match/harness.js';
import {applyCustomData} from '../../tools/custom-data.mjs';
import {readFileSync} from 'node:fs';
const bases=['chess_custom_5_chen3_','chess_custom_6_aglna2_','chess_custom_6_wang_'];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function field(id,index=2,extra={}){
  const h=makeBattle({units:[{chessId:id,row:10,col:4,skillIndex:index}],
    defs:{enemies:{e:enemyRec({key:'e',hp:1e7,speed:0,def:0,res:0}),fly:enemyRec({key:'fly',hp:1e7,speed:0,motion:'FLY'})}},
    enemies:[{key:'e',pos:[10,5]}],autoFinish:false,timeLimit:200,captureNoisy:true,...extra});
  h.run(0.1);const u=h.unit(id);u.skill.rule='NEVER';return {h,u,e:h.enemies()[0]};
}
function cast(u){if(!u.skill.active){u.skill.addCharge(1);assert.equal(u.skill.activate('test'),true);}}
for(const suffix of ['a','b']){
  for(const base of bases)for(let index=0;index<3;index++)test(`${base}${suffix} S${index+1}: real kit, damage, finite stats and invariants`,()=>{
    const {h,u}=field(base+suffix,index);cast(u);h.run(15);
    assert.equal(u.kit.skillSource,'skills');assert.ok(u.stats.dmg>0);
    assert.ok(Number.isFinite(u.s.atk)&&Number.isFinite(u.s.bat));assert.deepEqual(h.b.errors,[]);assert.equal(h.invariants(),true);
  });
  test(`Chen ${suffix}: weakness damage selects the better mitigation, keeps true damage, S1 silence`,()=>{
    const {h,u,e}=field(bases[0]+suffix,0);u.profile.noAttack=true;cast(u);
    e.base.def=10000;e.base.res=0;e.markDirty();
    const hp=e.hp;h.b.dealDamage(u,e,{amount:100,type:'phys',isAttack:true,canDodge:false});close(hp-e.hp,100);
    e.base.def=0;e.base.res=95;e.markDirty();const hp2=e.hp;
    h.b.dealDamage(u,e,{amount:100,type:'arts',isAttack:true,canDodge:false});close(hp2-e.hp,100);
    h.b.dealDamage(u,e,{amount:100,type:'true',canDodge:false});
    assert.ok(h.b.forceAttack(u,[e]));assert.ok(e.s.flags.silence);
  });
  test(`Chen ${suffix}: quiet healing arms one dodge; S2 makes ten slashes then moves without a death`,()=>{
    const {h,u,e}=field(bases[0]+suffix,1);u.profile.noAttack=true;u.hp=100;h.run(7.2);
    assert.ok(u.hp>100);const hp=u.hp;
    h.b.dealDamage(e,u,{amount:10,type:'arts',canDodge:false,ignoreSelect:true});close(u.hp,hp);
    cast(u);h.run(1);
    assert.equal(h.hooksOf('damaged').filter(c=>c.source===u&&c.dmg.tags.includes('chen3:slash')).length,10);
    assert.equal(u.tileC,5);assert.ok(!u.s.flags.invulnerable);assert.ok(u.s.atk>u.def.stats.atk*3);
    assert.equal(h.hooksOf('death').filter(c=>c.unit===u).length,0);assert.deepEqual(h.b.errors,[]);
  });
  test(`Angelina ${suffix}: airborne ignores ground attacks, blocks flyers, aura weight and additional arts damage`,()=>{
    const {h,u,e}=field(bases[1]+suffix,0);h.run(0.4);
    assert.ok(u.s.flags.liftoff&&u.s.flags.blockFly);assert.ok(e.findBuff('aglna:weightless'));
    const hp=u.hp;h.b.dealDamage(e,u,{amount:100,type:'phys',isAttack:true});close(u.hp,hp);
    const before=e.hp;h.b.forceAttack(u,[e]);assert.ok(before-e.hp>u.s.atk-e.s.def);
    u.skill.end('test');assert.ok(!u.s.flags.liftoff);assert.deepEqual(h.b.errors,[]);
  });
  test(`Angelina ${suffix}: S2 levitates ground and grounds flying enemies, then restores flying motion`,()=>{
    const {h,u,e}=field(bases[1]+suffix,1);const fly=h.spawn('fly',{pos:[10,5]});h.run(0.1);cast(u);h.run(0.1);
    assert.ok(e.s.flags.levitate);assert.equal(fly.motion,'WALK');assert.ok(fly.s.flags.bind);
    h.run(u.skill.bb.buff_duration_ground_bound+0.2);assert.equal(fly.motion,'FLY');assert.deepEqual(h.b.errors,[]);
  });
  test(`Angelina ${suffix}: S3 shoots three ground targets plus one flyer and returns after ammo exhaustion`,()=>{
    const {h,u,e}=field(bases[1]+suffix);u.profile.noAttack=true;
    h.spawn('e',{pos:[10,5]});h.spawn('e',{pos:[10,5]});h.spawn('e',{pos:[10,5]});const fly=h.spawn('fly',{pos:[10,5]});
    cast(u);h.run(0.3);const before=h.hooksOf('damaged').length;
    assert.ok(h.b.forceAttack(u,[e]));const hits=h.hooksOf('damaged').slice(before).filter(c=>c.source===u&&c.dmg.isAttack);
    assert.equal(hits.length,4);assert.ok(hits.some(c=>c.target===fly));u.skill.ammoLeft=1;h.b.forceAttack(u,[e]);
    assert.ok(!u.skill.active);assert.equal(u.tileC,4);assert.equal(u.extraRangeKeys,null);assert.deepEqual(h.b.errors,[]);
  });
  test(`Wang ${suffix}: manually placed stone joins the linked network and triggers S2 arts + slow`,()=>{
    const {h,u,e}=field(bases[2]+suffix,1);u.profile.noAttack=true;u.mem.wang.stock=0;
    const t=h.b.spawnToken(u,'token_10064_wang_stone1',10,6);assert.ok(t);
    h.run(0.4);assert.ok(e.findBuff(`wang:slow:${u.id}`));assert.ok(u.stats.dmg>0);
    assert.deepEqual(h.b.errors,[]);assert.equal(h.invariants(),true);
  });
}
test('Siracusa pity starts at 3%, grows by 3 points per failure, guarantees attempt 34, then resets; members share the counter',()=>{
  const rec=id=>chessRec({id,bonds:['siracusaShip'],skill:null});
  const h=makeBattle({defs:{chess:{a:rec('a'),b:rec('b')},enemies:{e:enemyRec({key:'e',hp:1e9,speed:0})}},
    units:[{chessId:'a',row:10,col:3},{chessId:'b',row:10,col:4}],enemies:[{key:'e',pos:[12,9]}],
    bonds:{siracusaShip:{count:6,active:true,tier:2,layers:0}},autoFinish:false,timeLimit:120,captureNoisy:true});
  h.step(1);const [a,b]=[h.unit('a'),h.unit('b')],e=h.enemies()[0];a.profile.noAttack=b.profile.noAttack=true;
  const poke=u=>h.b.dealDamage(u,e,{amount:1,type:'phys',isAttack:true,canDodge:false});
  const procs=()=>h.hooksOf('damaged').filter(c=>c.dmg.tags.includes('bond:siracusa')).length;
  h.b.rng=Object.assign(()=>0.04,h.b.rng);poke(a);assert.equal(procs(),0);poke(b);assert.equal(procs(),1);
  poke(a);assert.equal(procs(),1,'probability reset to 3%');
  h.b.rng=Object.assign(()=>0.9999,h.b.rng);for(let i=0;i<32;i++)poke(a);assert.equal(procs(),1);
  poke(a);assert.equal(procs(),2);poke(a);assert.equal(procs(),2);
  assert.deepEqual(h.b.errors,[]);
});
test('standard solo bond is enabled for one member, disabled at two, represented in battle and without off-view entries',()=>{
  const gd=new GameData(DATA,'mode_single_funny');assert.ok(!gd.modeInactiveBonds.has('soloShip'));
  const ids=Object.values(DATA.chess).filter(c=>c.visible&&!c.isGolden&&c.bonds.includes('soloShip')).slice(0,2).map(c=>c.chessId);
  const ps={board:new Map([['10,4',{kind:'chess',id:ids[0]}]]),hand:[],layers:{}};
  let bonds=computeBonds(gd,ps);assert.ok(bonds.soloShip.active);assert.ok(bondSnapshot(bonds).soloShip.active);
  const h=makeBattle({units:[{chessId:ids[0],row:10,col:4}],bonds:bondSnapshot(bonds),autoFinish:false});h.step(1);
  const u=h.unit(ids[0]);assert.ok(u.s.atk>=u.def.stats.atk*1.6-1e-6);assert.ok(u.s.maxHp>=u.def.stats.maxHp*1.6-1e-6);
  ps.board.set('10,5',{kind:'chess',id:ids[1]});bonds=computeBonds(gd,ps);assert.equal(bonds.soloShip.active,false);
  const mh=makeMatch({mode:'solo',humans:1,bots:0,fake:true});mh.start().toPrep(1);const m=mh.m,p=m.players.get('p_0');
  give(m,p,ids[0]);assert.equal(m.publicView().players[0].bonds.some(b=>b.off),false);assert.equal(p.privateView().bonds.some(b=>b.off),false);
});
test('custom roster survives rebuild overlay idempotently and retains exactly the assigned bonds',()=>{
  const custom=JSON.parse(readFileSync(new URL('../../tools/data/custom-operators.json',import.meta.url),'utf8'));
  const files=structuredClone({chess:DATA.chess,bonds:DATA.bonds,config:DATA.config,tokens:DATA.tokens});
  applyCustomData(files,custom);const first=JSON.stringify(files);applyCustomData(files,custom);assert.equal(JSON.stringify(files),first);
  for(const [base,bond,tier]of [[bases[0],'yanShip',5],[bases[1],'siracusaShip',6],[bases[2],'yanShip',6]])for(const s of ['a','b']){
    const c=files.chess[base+s];assert.deepEqual(c.bonds,[bond]);assert.equal(c.tier,tier);
  }
});
