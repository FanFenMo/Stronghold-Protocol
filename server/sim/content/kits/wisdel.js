// 维什戴尔 and 魂灵之影, PRTS Lv4/Lv7.
const TOKEN='token_10035_wisdel_wward';
const live=u=>u.alive&&u.deployed;
const markKey=u=>`wisdel:mark:${u.id}`;
export function mark(b,u,e){b.addBuff(e,{key:markKey(u),visible:true,refresh:'keep'});}

function shadows(b,u,n){
  const count=b.allyUnits.filter(t=>live(t)&&t.ownerUnit===u&&t.defId===TOKEN).length;
  const tiles=u.rangeKeys.map(k=>[Math.floor(k/21),k%21])
    .filter(([r,c])=>b.grid.canStand(r,c,{ranged:true})&&!b.isReservedTile(r,c))
    .sort((a,c)=>Math.hypot(a[1]-u.x,a[0]-u.y)-Math.hypot(c[1]-u.x,c[0]-u.y)||a[0]-c[0]||a[1]-c[1]);
  for(const [r,c] of tiles.slice(0,Math.min(n,3-count)))b.spawnToken(u,TOKEN,r,c);
}
export function spirit(bb){return {
  trait:{noAttack:true},
  skill:{kind:'instant',trigger:'NEVER',onStart({battle,unit}){
    const owner=unit.ownerUnit,foes=battle.enemiesInKeys(owner.rangeKeys,owner,{canHitFly:false});
    foes.sort((a,c)=>Number(!!a.findBuff(markKey(owner)))-Number(!!c.findBuff(markKey(owner)))||a.spawnSeq-c.spawnSeq);
    const target=foes[0];
    if(!target){unit.skill.addCharge(1);return;}
    battle.dealDamage(unit,target,{amount:unit.s.atk,type:'arts',isSkill:true,canDodge:false,tags:['wisdel:spirit']});
    if(target.alive){mark(battle,owner,target);battle.applyStatus(target,'sluggish',{duration:bb.sluggish,source:unit});}
    battle.fx('wisdelSpirit',{id:unit.id,x:target.x,y:target.y});
    battle.after(0,()=>unit.skill.gainSp(bb.sp_min+battle.rng.int(bb.sp_max-bb.sp_min),'skill'),{owner:unit});
  }},
  install(b,u){
    b.every(.1,()=>{
      if(!live(u))return;
      if(!live(u.ownerUnit)){b.retreat(u,{reason:'expired',permanent:true});return;}
      if(u.canAct&&u.skill.ready&&b.enemiesInKeys(u.ownerUnit.rangeKeys,u.ownerUnit,{canHitFly:false}).length)u.skill.activate('shadow');
    },{owner:u});
  },
};}

export default function wisdel(bb,chess,def){
 const t=def.talents[0].bb;
 const shock=(count,scale,r,stun=0,attackScale=1,fly=false)=> (b,u,target,info)=>{
   const atk=u.s.atk;
   for(let i=1;i<=count;i++)b.after(.3*i,()=>{
     for(const e of b.foesInRadius(info.x,info.y,r,true)){
       if(!fly&&e.isFlying)continue;
       b.dealDamage(u,e,{amount:atk*scale*attackScale,type:'phys',isSplash:true,isSkill:info.isSkill,canDodge:false,
         tags:['aftershock',...(e===target?['wisdel:mainShock']:[])]});
       if(stun&&e.alive)b.applyStatus(e,'stun',{duration:stun,source:u});
       // Retain this shot's S3 guarantee and ATK even when it spent the final bullet.
       if(e.findBuff(markKey(u))&&b.rng.chance(fly?1:t['attack@prob'])){
         for(const other of b.foesInRadius(e.x,e.y,t['attack@range_radius'],true)){
           b.dealDamage(u,other,{amount:atk*t['attack@bomb_atk_scale'],type:'phys',isSkill:true,canDodge:false,tags:['wisdel:explosion']});
           if(other.alive)b.applyStatus(other,'stun',{duration:t['attack@stun'],source:u});
         }
         b.fx('wisdelExplosion',{id:u.id,x:e.x,y:e.y,r:t['attack@range_radius']});
       }
     }
     b.fx('wisdelShock',{id:u.id,x:info.x,y:info.y,r});
   },{owner:u});
 };
 return {
  trait:{afterHit:shock(1,.5,.9)},
  skills:{
   skchr_wisdel_1:{kind:'instant',attack:{splashRadius:1.1,afterHit:shock(3,bb.append_atk_scale,1.1,bb.stun_duration),
     onEachHit({battle,unit,target}){battle.applyStatus(target,'stun',{duration:bb.stun_duration,source:unit});}}},
   skchr_wisdel_2:{kind:'duration',mods:{atkPct:bb.atk,batFlat:bb.base_attack_time},targeting:{maxTargets:3},attack:{atkScale:1},
     onStart({unit}){unit.mem.wisdel.overdrive=false;unit.skill.spec.targeting.maxTargets=3;unit.skill.spec.attack.atkScale=1;},
     onTick({unit,skill}){
       if(!unit.mem.wisdel.overdrive&&skill.timeLeft<=skill.duration/2){
         unit.mem.wisdel.overdrive=true;skill.spec.targeting.maxTargets=1;skill.spec.attack.atkScale=bb['attack@atk_scale_ol'];
       }
     },onEnd({unit}){unit.mem.wisdel.overdrive=false;}},
   skchr_wisdel_3:{kind:'ammo',ammo:bb['attack@trigger_time'],mods:{atkPct:bb.atk,batFlat:bb.base_attack_time},
     targeting:{canHitFly:true},attack:{atkScale:bb['attack@atk_scale_3'],splashRadius:2.5,canHitFly:true,groundOnly:false,projectile:'beam',
       afterHit:shock(1,.5,2.5,0,bb['attack@atk_scale_3'],true)},
     onStart({battle,unit}){shadows(battle,unit,bb.max_cnt);}},
  },
  talents:[{install(b,u){
    u.mem.wisdel={overdrive:false};
    b.on('deploy',({unit,move})=>{if(unit===u&&!move)shadows(b,u,1);},{owner:u});
    b.on('beforeAttack',ctx=>{
      if(ctx.attacker!==u)return;
      if(u.skill.id==='skchr_wisdel_2'&&u.skill.active&&u.mem.wisdel.overdrive){
        const foes=b.enemiesInKeys(u.rangeKeys,u,{canHitFly:false});
        if(foes.length)ctx.targets=Array.from({length:4},()=>b.rng.pick(foes));
      }
      for(const e of ctx.targets)mark(b,u,e);
    },{owner:u});
    b.on('hit',({source,target,dmg})=>{
      if(source!==u)return;
      if(dmg.isAttack&&!dmg.isSplash||dmg.tags.includes('wisdel:mainShock'))dmg.amount*=t['attack@main_atk_scale'];
    },{owner:u});
    b.every(.1,()=>{
      if(!live(u))return;
      const near=b.allyUnits.some(t=>live(t)&&t.ownerUnit===u&&t.defId===TOKEN&&Math.hypot(t.x-u.x,t.y-u.y)<=1.5);
      if(near)b.addBuff(u,{key:'wisdel:camou',duration:.2,flags:{camou:true}});
    },{owner:u});
    b.on('death',({unit})=>{
      if(unit!==u)return;
      for(const e of b.enemies)b.removeBuff(e,markKey(u));
      for(const t of b.allyUnits.filter(t=>live(t)&&t.ownerUnit===u))b.retreat(t,{reason:'expired',permanent:true});
    },{owner:u});
  }}],
 };
}
