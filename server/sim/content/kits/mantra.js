// 真言: exact palsy interruption, neural riders and overflow chains.
import {bodyInKeys} from '../../body.js';
import {canTargetEnemy} from '../../targeting.js';
const live=u=>u.alive&&u.deployed;
const elemental=(b,u,e,n,tag)=>b.dealDamage(u,e,{amount:n,type:'elemental',isSkill:true,canDodge:false,tags:[tag]});
function rider(b,u,e,dealt,ratio,scale){
  if(dealt>0)b.dealDamage(u,e,{amount:dealt*ratio,type:'element',element:'neural',canDodge:false});
  if(e.findBuff('neuralBurst'))elemental(b,u,e,u.s.atk*scale,'mantra:burstRider');
}
function overflow(b,u,e,n,bb){
  for(let i=0;i<n;i++)b.after(i*.15,()=>{
    if(!live(u))return;
    elemental(b,u,e,u.s.atk*bb.atk_scale,'mantra:overflow');
    const other=b.foesInRadius(e.x,e.y,2).filter(t=>t!==e).sort((a,c)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(c.x-e.x,c.y-e.y))[0];
    if(other)elemental(b,u,other,u.s.atk*bb.atk_scale,'mantra:overflow');
    b.fx('mantraChain',{id:u.id,x:e.x,y:e.y,r:2});
  },{owner:u});
}
export default function mantra(bb,chess,def){
 const talent=def.talents[0].bb;
 return {
  skills:{
   skchr_mantra_1:{kind:'instant',attack:{atkScale:bb.atk_scale,
     onEachHit({battle,unit,target,dealt}){rider(battle,unit,target,dealt,bb.ep_damage_ratio,bb.element_atk_scale);}}},
   skchr_mantra_2:{kind:'duration',mods:{batFlat:bb.base_attack_time},attack:{atkScale:bb['attack@atk_scale'],
     onEachHit({battle,unit,target,dealt}){rider(battle,unit,target,dealt,bb['attack@ep_damage_ratio'],bb['attack@element_atk_scale']);},
     onHit({battle,unit,target}){
       const hit=new Set([target.id]);let prev=target;
       const next=()=>{
         if(!live(unit))return;
         const foes=battle.foesInRadius(prev.x,prev.y,2).filter(e=>!hit.has(e.id));
         foes.sort((a,c)=>Math.hypot(a.x-prev.x,a.y-prev.y)-Math.hypot(c.x-prev.x,c.y-prev.y)||a.spawnSeq-c.spawnSeq);
         const e=foes[0];if(!e)return;
         hit.add(e.id);
         const dealt=battle.dealDamage(unit,e,{amount:unit.s.atk*bb['attack@chain.atk_scale'],type:'arts',isAttack:true,isSkill:true,canDodge:false,tags:['mantra:chain']});
         rider(battle,unit,e,dealt,bb['attack@ep_damage_ratio'],bb['attack@element_atk_scale']);
         battle.fx('mantraChain',{id:unit.id,x:e.x,y:e.y});prev=e;
         if(hit.size<=bb.chain_times)battle.after(.15,next,{owner:unit});
       };
       battle.after(.15,next,{owner:unit});
     }}},
   skchr_mantra_3:{kind:'duration',mods:{atkPct:bb.atk},targeting:{rangeGrid:def.skill.rangeGrid,maxTargets:bb['attack@max_target']},
     onStart({battle,unit}){
       unit.mem.mantra.triggers=0;
       for(const e of battle.enemies.filter(e=>live(e)&&bodyInKeys(e,unit.rangeKeys))){
         battle.addBuff(e,{key:`mantra:reveal:${unit.id}`,duration:.2,flags:{reveal:true}});
         const p=e.findBuff('palsy');
         if(p&&p.stacks>bb.max_target){overflow(battle,unit,e,p.stacks-bb.max_target,bb);p.stacks=bb.max_target;e.markDirty();}
       }
     },onEnd({battle,unit}){for(const e of battle.enemies)battle.removeBuff(e,`mantra:reveal:${unit.id}`);}},
  },
  talents:[{install(b,u){
    const state=u.mem.mantra={triggers:0};
    const active=()=>live(u)&&u.skill.active&&u.skill.id==='skchr_mantra_3';
    b.on('palsyTrigger',ctx=>{
      if(!live(u)||!canTargetEnemy(u,ctx.enemy,{canHitFly:true}))return;
      elemental(b,u,ctx.enemy,u.s.atk*talent.atk_scale,'mantra:palsy');
      ctx.keepProbability=Math.max(ctx.keepProbability,talent.prob);
    },{owner:u});
    b.on('enemySpawn',({enemy})=>{
      if(!live(u))return;
      const gates=b.grid.specialTiles('start').sort((a,c)=>Math.hypot(a[1]-u.x,a[0]-u.y)-Math.hypot(c[1]-u.x,c[0]-u.y)||a[0]-c[0]||a[1]-c[1]);
      const gate=gates[0];if(gate&&Math.hypot(enemy.x-gate[1],enemy.y-gate[0])<.5)b.applyStatus(enemy,'palsy',{value:1,source:u});
    },{owner:u});
    b.on('beforeStatus',ctx=>{
      if(ctx.status!=='palsy'||ctx.target.side!=='enemy'||!active()||!bodyInKeys(ctx.target,u.rangeKeys))return;
      const old=ctx.target.findBuff('palsy')?.stacks||0,added=ctx.value??1;
      const extra=Math.max(0,old+added-bb.max_target);
      if(extra)overflow(b,u,ctx.target,extra,bb);
      ctx.value=Math.max(0,Math.min(added,bb.max_target-old));if(!ctx.value)ctx.cancel=true;
    },{owner:u});
    b.on('skillStart',({unit})=>{
      if(!active()||unit.kind!=='op'||unit.ownerId!==u.ownerId||!u.rangeKeys.includes(unit.tileR*21+unit.tileC)||state.triggers>=bb.max_trigger_cnt)return;
      state.triggers++;
      for(const e of b.enemies.filter(e=>live(e)&&bodyInKeys(e,u.rangeKeys)))b.applyStatus(e,'palsy',{value:bb.per_active,source:u});
    },{owner:u});
    b.on('tick',()=>{
      if(active())for(const e of b.enemies.filter(e=>live(e)&&bodyInKeys(e,u.rangeKeys)))
        b.addBuff(e,{key:`mantra:reveal:${u.id}`,duration:.2,flags:{reveal:true}});
    },{owner:u});
  }}],
 };
}
