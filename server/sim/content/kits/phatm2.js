// 酒神: ritualist neural riders, lure and cages use the existing status/token APIs.
import {bodyInKeys,bodyOnTile} from '../../body.js';
import {findSummonTile} from '../tokens.js';
const LURE='token_10054_phatm2_encdool',CAGE='token_10055_phatm2_mndclv';
const live=u=>u.alive&&u.deployed;
const neural=(b,u,e,n)=>b.dealDamage(u,e,{amount:n,type:'element',element:'neural',canDodge:false,tags:['phatm2:neural']});
const burst=e=>!!e.findBuff('neuralBurst');

export function refreshCage(b,cage){
  const targets=b.enemies.filter(e=>live(e)&&!e.s.flags.unblockable&&bodyOnTile(e,cage.tileR,cage.tileC));
  for(const e of targets){
    if(e.blockedBy!==cage){b._unblock(e);e.blockedBy=cage;cage.blocking.push(e);}
    const dx=e.x-cage.x,dy=e.y-cage.y,d=Math.hypot(dx,dy);
    if(d>.2){const n=b.rng.range(0,.2);e.x=cage.x+dx/d*n;e.y=cage.y+dy/d*n;if(e.route)e.route.pts=null;}
  }
  cage.base.blockCnt=cage.blocking.reduce((n,e)=>n+(e.blockWeight||1),0);cage.markDirty();cage.hp=cage.s.maxHp;
}
function cageAt(b,u,e){
  const r=Math.round(e.y),c=Math.round(e.x);
  const existing=b.unitAt(r,c);
  if(existing?.ownerUnit===u&&existing.defId===CAGE){refreshCage(b,existing);return existing;}
  if(existing||!b.grid.inRect(r,c)||b.grid.tile(r,c).height!=='LOW')return null;
  const cage=b.spawnToken(u,CAGE,r,c);
  if(cage){refreshCage(b,cage);b.fx('phatm2Cage',{id:cage.id,x:c,y:r});}
  return cage;
}
export function cageKit(){return {
  trait:{noAttack:true,blockFly:true},skill:null,
  install(b,u){
    u.mem.expires=Infinity;
    b.addBuff(u,{key:'phatm2:cage',flags:{noHeal:true,isolated:true},persist:true});
    b.on('hit',({source,target,dmg})=>{
      if(target!==u)return;
      if(!source||source.blockedBy!==u||!dmg.isAttack){dmg.cancel=true;return;}
      dmg.amount=1;dmg.type='true';dmg.mul=1;dmg.canDodge=false;
    },{owner:u,priority:-500});
    b.on('tick',()=>{
      if(!live(u))return;
      u.blocking=u.blocking.filter(e=>live(e)&&e.blockedBy===u);
      u.base.blockCnt=u.blocking.reduce((n,e)=>n+(e.blockWeight||1),0);u.markDirty();
      if(!live(u.ownerUnit)||!u.blocking.length||b.time>=u.mem.expires)b.retreat(u,{reason:'expired',permanent:true});
    },{owner:u});
  },
};}

export function lureKit(bb){return {
  trait:{noAttack:true},skill:null,
  install(b,u){
    const owner=u.ownerUnit,atk=owner.s.atk,targets=new Set();let fired=false;
    b.addBuff(u,{key:'phatm2:lure',flags:{untargetable:true,invulnerable:true,noBlock:true},persist:true});
    const explode=()=>{
      if(fired)return;fired=true;
      for(const e of targets){const buff=e.findBuff('attract');if(buff?.source===u)b.removeBuff(e,buff);}
      const x=u.x,y=u.y;
      for(let i=1;i<=bb.buff_time/bb.interval_damage;i++)b.after(i*bb.interval_damage,()=>{
        for(const e of b.foesInRadius(x,y,1.5)){
          b.applyStatus(e,'sluggish',{duration:bb.interval_damage+.1,source:owner});
          b.dealDamage(owner,e,{amount:atk*bb.atk_scale,type:'arts',isSkill:true,canDodge:false,tags:['phatm2:lure']});
          neural(b,owner,e,atk*bb.ep_damage_ratio_token);
        }
        b.fx('phatm2Dream',{id:owner.id,x,y,r:1.5});
      },{owner});
    };
    b.on('death',({unit})=>{if(unit===u)explode();},{owner:u});
    b.every(.1,()=>{
      if(!live(u))return;
      if(!live(owner)){b.retreat(u,{reason:'expired',permanent:true});return;}
      const foes=b.enemiesInKeys(u.rangeKeys,owner,{canHitFly:false})
        .sort((a,c)=>Number(!!c.isBoss)-Number(!!a.isBoss)||Number(c.def.rank==='ELITE')-Number(a.def.rank==='ELITE')||a.spawnSeq-c.spawnSeq);
      for(const e of foes){
        if(targets.size>=bb.max_target)break;
        if(targets.has(e)||!b.grid.findPath(Math.round(e.y),Math.round(e.x),u.tileR,u.tileC))continue;
        if(b.applyStatus(e,'attract',{duration:10,source:u,point:[u.tileR,u.tileC]}))targets.add(e);
      }
      if([...targets].some(e=>live(e)&&Math.hypot(e.x-u.x,e.y-u.y)<=bb.ability_range_radius))b.retreat(u,{reason:'expired',permanent:true});
    },{owner:u});
    b.after(bb.interval,()=>{if(live(u))b.retreat(u,{reason:'expired',permanent:true});},{owner:u});
  },
};}

export default function phatm2(bb,chess,def){
 const first=def.talents[0].bb,second=def.talents[1].bb;
 const prefer=(b,u,ctx)=>{
   const foes=b.enemiesInKeys(u.rangeKeys,u,{canHitFly:true});
   foes.sort((a,c)=>Number(burst(a))-Number(burst(c))||a.spawnSeq-c.spawnSeq);if(foes.length)ctx.targets=[foes[0]];
 };
 return {
  skills:{
   skchr_phatm2_1:{kind:'instant',attack:{hits:bb.times,atkScale:bb.atk_scale,
    onHit({battle,unit,target}){
      if(battle.applyStatus(target,'bind',{duration:bb.unmove,source:unit}))
        battle.addBuff(target,{key:`phatm2:bound:${unit.id}`,duration:bb.unmove});
    }}},
   skchr_phatm2_2:{kind:'toggle',mods:{aspd:bb.attack_speed},onStart({unit}){unit.mem.phatm2.nextLure=0;}},
   skchr_phatm2_3:{kind:'duration',mods:{atkPct:bb.atk},targeting:{rangeGrid:def.skill.rangeGrid},
    onStart({battle,unit}){
      unit.mem.phatm2.touched.clear();
      for(const e of battle.enemiesInKeys(unit.rangeKeys,unit,{canHitFly:true}))if(burst(e))cageAt(battle,unit,e);
    },
    onEnd({battle,unit}){
      unit.mem.phatm2.touched.clear();
      for(const cage of battle.allyUnits.filter(t=>live(t)&&t.ownerUnit===unit&&t.defId===CAGE))cage.mem.expires=battle.time+30;
    }},
  },
  talents:[{install(b,u){
    const state=u.mem.phatm2={touched:new Set(),nextLure:0};let elapsed=0;
    b.on('hit',({source,target,dmg})=>{
      if(source!==u||!dmg.isAttack||dmg.type==='element')return;
      neural(b,u,target,u.s.atk*first['attack@ep_damage_ratio']);
      const r=u.skill.active&&u.skill.id==='skchr_phatm2_2'?bb['talent@range_radius']:first.range_radius;
      for(const e of b.foesInRadius(target.x,target.y,r,true))if(e!==target)neural(b,u,e,u.s.atk*first.ep_damage_ratio);
      b.fx('phatm2Dream',{id:u.id,x:target.x,y:target.y,r});
    },{owner:u});
    b.on('elementHit',({target,dmg})=>{
      if(dmg.element==='neural'&&target.findBuff(`phatm2:bound:${u.id}`))dmg.mul*=bb.ep_damage_scale;
    },{owner:u});
    b.on('damaged',({source,target,type,dmg})=>{
      if(source===u&&type==='element'&&dmg.element==='neural'&&u.skill.active&&u.skill.id==='skchr_phatm2_3')state.touched.add(target);
    },{owner:u});
    b.on('beforeAttack',ctx=>{
      if(!live(u))return;
      const e=ctx.attacker;
      if(e===u&&u.skill.active&&['skchr_phatm2_1','skchr_phatm2_3'].includes(u.skill.id))prefer(b,u,ctx);
      if(e.side==='enemy'&&bodyInKeys(e,u.rangeKeys)){
        const old=burst(e);neural(b,u,e,second.value);
        if(!old&&burst(e))ctx.targets=[];
      }
    },{owner:u});
    b.on('elementBurst',({target,element})=>{
      if(element!=='neural'||target.side!=='enemy')return;
      state.touched.delete(target);
      if(live(u)&&u.skill.active&&u.skill.id==='skchr_phatm2_3'&&bodyInKeys(target,u.rangeKeys))cageAt(b,u,target);
    },{owner:u});
    b.on('tick',({dt})=>{
      if(!live(u))return;
      const active=u.skill.active,s2=active&&u.skill.id==='skchr_phatm2_2',s3=active&&u.skill.id==='skchr_phatm2_3';
      for(const e of b.enemies)if(live(e)&&burst(e)){
        b.addBuff(e,{key:'phatm2:aspd',duration:.2,mods:{aspd:second.attack_speed}});
        if(s3&&bodyInKeys(e,u.rangeKeys))e.findBuff('neuralBurst').timeLeft=Math.max(0,e.findBuff('neuralBurst').timeLeft-dt*bb['talent@ep_break_recover_speed']);
      }
      if(s2&&b.time>=state.nextLure&&!b.allyUnits.some(t=>live(t)&&t.ownerUnit===u&&t.defId===LURE)){
        const tile=findSummonTile(b,u,'path');
        if(tile&&b.enemiesInKeys(u.rangeKeys,u,{canHitFly:false}).length){
          const lure=b.spawnToken(u,LURE,...tile);if(lure)state.nextLure=b.time+10+lure.base.respawnTime;
        }
      }
      elapsed+=dt;if(elapsed<1)return;elapsed-=1;
      if(s3)for(const e of [...state.touched]){
        if(!live(e)||burst(e)){state.touched.delete(e);continue;}
        neural(b,u,e,u.s.atk*bb.ep_damage_ratio);
      }
    },{owner:u});
    b.on('death',({unit})=>{
      if(unit!==u)return;state.touched.clear();
      for(const t of b.allyUnits.filter(t=>live(t)&&t.ownerUnit===u))b.retreat(t,{reason:'expired',permanent:true});
    },{owner:u});
  }}],
 };
}
