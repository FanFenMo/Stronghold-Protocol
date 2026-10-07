// 予愿安洁莉娜 — takes off using 蒂比's existing liftoff / blockFly semantics.
import { absoluteRangeKeys } from '../../targeting.js';
import { dirVec } from '../../dir.js';
const live=u=>u.alive&&u.deployed;
const air={liftoff:true,blockFly:true};
const takeoff=({battle,unit})=>{unit.mem.aglnaHome=[unit.tileR,unit.tileC];battle.releaseBlocked(unit);battle.fx('aglnaTakeoff',{id:unit.id,x:unit.x,y:unit.y});};
const land=({battle,unit})=>{battle.releaseBlocked(unit);battle.setExtraRange(unit,null);const home=unit.mem.aglnaHome;if(home&&(unit.tileR!==home[0]||unit.tileC!==home[1]))battle.moveRedeploy(unit,...home);};
export default function aglna2(bb,chess,def){
  const [floating,dance]=def.talents, sid=def.skill.id;
  const extra=chess.skill.extraRangeGrid;
  const skillRange = sid==='skchr_aglna2_3'
    ? [...new Map([...def.skill.rangeGrid,...extra].map(p=>[p.join(','),p])).values()]
    : def.skill.rangeGrid;
  return {
    trait:{blockFly:false},profile:{atkFX:'aglnaShot'},
    skills:{
      skchr_aglna2_1:{kind:'duration',activateOnDeploy:true,spCost:0,spType:'none',trigger:'NEVER',flags:air,mods:{atkPct:bb.atk},
        targeting:{rangeGrid:def.skill.rangeGrid,maxTargets:2},onStart:takeoff,onEnd:land},
      skchr_aglna2_2:{kind:'duration',flags:air,mods:{atkPct:bb.atk,batPct:bb.base_attack_time/def.stats.bat},
        targeting:{rangeGrid:def.skill.rangeGrid,maxTargets:bb['attack@max_target']},attack:{dmgType:'arts'},
        onStart(ctx){const {battle,unit,skill}=ctx;takeoff(ctx);skill.extend(bb.chant_duration);
          battle.addBuff(unit,{key:'aglna:glide',duration:bb.chant_duration,flags:{disarm:true}});
          const [dr,dc]=dirVec(unit.dir), seen=new Set();
          for(let n=0;n<=3;n++)battle.after(n*bb.chant_duration/3,()=>{
            if(!live(unit)||!skill.active)return;
            for(const e of battle.enemiesInKeys(unit.rangeKeys,unit,{canHitFly:true}))if(!seen.has(e.id)){
              seen.add(e.id);
              if(e.isFlying){
                const motion=e.motion;
                battle.applyStatus(e,'bind',{duration:bb.buff_duration_ground_bound,source:unit});e.motion='WALK';
                battle.addBuff(e,{key:'aglna:groundBound',duration:bb.buff_duration_ground_bound,onExpire:()=>{e.motion=motion;},onRemove:()=>{e.motion=motion;}});
              }else battle.applyStatus(e,'levitate',{duration:bb.buff_duration_levitate,source:unit});
            }
            if(n&&battle.grid.canStand(unit.tileR+dr,unit.tileC+dc))battle.moveRedeploy(unit,unit.tileR+dr,unit.tileC+dc);
            battle.fx('aglnaGravity',{id:unit.id,x:unit.x,y:unit.y});
          },{owner:unit});
        },onEnd:land},
      skchr_aglna2_3:{kind:'ammo',ammo:bb['attack@trigger_time'],flags:air,mods:{atkPct:bb.atk},
        targeting:{rangeGrid:skillRange,maxTargets:4},attack:{dmgType:'phys',atkScale:bb['attack@atk_scale']},
        onStart:takeoff,onEnd:land},
    },
    talents:[{install(battle,unit){
      battle.removeBuff(unit,'trait:skywalker');
      battle.on('damaged',c=>{if(c.source!==unit||!c.dmg.isAttack||!c.target.alive)return;
        battle.dealDamage(unit,c.target,{amount:unit.s.atk*(c.target.s.massLevel<=floating.bb.mass_level?floating.bb.atk_scale_hi:floating.bb.atk_scale_lo),type:'arts',canDodge:false,tags:['talent','addition','aglna2']});
      },{owner:unit});
      battle.on('hit',c=>{if(c.target===unit&&sid==='skchr_aglna2_3'&&unit.skill.active&&c.source?.isFlying)c.dmg.amount*=1-bb.damage_resistance;},{owner:unit});
      battle.on('beforeAttack',c=>{if(c.attacker!==unit||!unit.skill.active||sid!=='skchr_aglna2_3')return;
        const all=battle.enemiesInKeys(unit.rangeKeys,unit,{canHitFly:true});
        const ground=all.filter(e=>!e.isFlying).slice(0,bb['attack@max_walk_target']);
        const flying=all.filter(e=>e.isFlying).slice(0,1);c.targets.splice(0,c.targets.length,...ground,...flying);
      },{owner:unit});
      battle.every(0.2,()=>{
        if(!live(unit))return;
        for(const a of battle.allies(unit.ownerId))if(a.kind==='op'&&a.s.flags.liftoff)
          battle.addBuff(a,{key:'aglna:dance',duration:0.3,mods:{atkPct:dance.bb.atk,hpRegenRatio:a.blocking.length?dance.bb.hp_recovery_per_sec_by_max_hp_ratio:0},refresh:'replace'});
        if(!unit.s.flags.liftoff)return;
        for(const e of battle.enemiesInKeys(unit.rangeKeys,unit,{canHitFly:true})){
          battle.addBuff(e,{key:'aglna:weightless',duration:0.3,mods:{massFlat:-1},refresh:'replace'});
          if(sid==='skchr_aglna2_3'&&unit.skill.active&&e.isFlying)battle.addBuff(e,{key:'aglna:airSlow',duration:0.3,mods:{moveMul:1+bb.move_speed},refresh:'replace'});
        }
        if(sid==='skchr_aglna2_3'&&unit.skill.active&&!unit.blocking.length){
          const keys=absoluteRangeKeys(def.skill.rangeGrid,unit.tileR,unit.tileC,unit.dir,battle.grid);
          const e=battle.enemiesInKeys(keys,unit,{canHitFly:true}).find(e=>e.isFlying&&!e.blockedBy&&!e.s.flags.unblockable);
          if(e&&battle.grid.canStand(e.tileR,e.tileC))battle.moveRedeploy(unit,e.tileR,e.tileC);
        }
      },{owner:unit});
    }}],
  };
}
