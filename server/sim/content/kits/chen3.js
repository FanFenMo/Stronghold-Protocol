// 赤刃明霄陈 — PRTS Lv4 / Lv7. Uses the existing damage, movement and projectile hooks.
import { mitigate } from '../../damage.js';
import { dirVec } from '../../dir.js';

const live = u => u.alive && u.deployed;
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export default function chen3(bb, chess, def) {
  const [sight, recovery] = def.talents;
  return {
    profile: { atkFX: 'chenFlameSlash' },
    skills: {
      skchr_chen3_1: { kind:'duration',mods:{atkPct:bb.atk},attack:{hits:2},
        onHit({battle,unit,target}) { battle.applyStatus(target,'silence',{duration:unit.skill.timeLeft,source:unit}); } },
      skchr_chen3_2: { kind:'duration',
        targeting:{rangeGrid:def.skill.rangeGrid},
        onStart({battle,unit,skill}) {
          const home=[unit.tileR,unit.tileC];
          let remaining=10, target=battle.enemiesInKeys(unit.rangeKeys,unit,{canHitFly:true})
            .sort((a,b)=>distance(a,unit)-distance(b,unit)||a.deploySeq-b.deploySeq)[0];
          battle.addBuff(unit,{key:'chen3:slashes',flags:{invulnerable:true,disarm:true,noBlock:true}});
          battle.releaseBlocked(unit);
          const finish=()=>{
            battle.removeBuff(unit,'chen3:slashes');
            const r=target?.tileR,c=target?.tileC;
            if(target?.alive && battle.grid.canStand(r,c) && battle.grid.isLow(r,c)) battle.moveRedeploy(unit,r,c,{clearSp:true});
            else if(unit.tileR!==home[0]||unit.tileC!==home[1])battle.moveRedeploy(unit,...home,{clearSp:true});
            skill.timeLeft=def.skill.duration;
            battle.addBuff(unit,{key:'chen3:afterDash',duration:def.skill.duration,
              mods:{atkPct:bb['chen3_s2[respawn_buff].atk'],dodgePhys:bb['chen3_s2[respawn_buff].prob'],dodgeArts:bb['chen3_s2[respawn_buff].prob']}});
            battle.fx('chenDash',{id:unit.id,x:unit.x,y:unit.y});
          };
          const slash=()=>{
            if(!live(unit)||!skill.active)return;
            if(!target?.alive||remaining<=0){finish();return;}
            const at={x:target.x,y:target.y};
            battle.dealDamage(unit,target,{amount:unit.s.atk*bb.atk_scale,type:'arts',isSkill:true,canDodge:false,tags:['skill','chen3:slash']});
            battle.fx('chenFlameSlash',{id:unit.id,x:at.x,y:at.y});
            remaining--;
            if(!target.alive){remaining++;target=battle.foesInRadius(at.x,at.y,1.5)
              .sort((a,b)=>distance(a,at)-distance(b,at)||a.deploySeq-b.deploySeq)[0];}
            if(remaining>0&&target?.alive){skill.extend(0.08);battle.after(0.08,slash,{owner:unit});}else finish();
          };
          slash();
        },
        onEnd({battle,unit}){battle.removeBuff(unit,'chen3:slashes');battle.removeBuff(unit,'chen3:afterDash');},
      },
      skchr_chen3_3: {kind:'duration',targeting:{rangeGrid:def.skill.rangeGrid,maxTargets:3},attack:{hits:3,atkScale:bb['attack@atk_scale'],dmgType:'arts'},
        onStart({battle,unit}){
          const [dr,dc]=dirVec(unit.dir);let x=unit.x,y=unit.y,age=0;
          let heading=Math.atan2(dr,dc);const hit=new Set();
          const off=battle.on('tick',({dt})=>{
            if(!live(unit)||age>6){battle.off(off);return;}age+=dt;
            const targets=battle.foesInRadius(x,y,4).filter(e=>!hit.has(e.id));
            const t=targets.sort((a,b)=>distance(a,{x,y})-distance(b,{x,y})||a.deploySeq-b.deploySeq)[0];
            if(t){const a=Math.atan2(t.y-y,t.x-x);const diff=Math.atan2(Math.sin(a-heading),Math.cos(a-heading));heading+=Math.max(-dt*2,Math.min(dt*2,diff));}
            x+=Math.cos(heading)*dt*3;y+=Math.sin(heading)*dt*3;
            for(const e of battle.foesInRadius(x,y,0.7+dt*3))if(!hit.has(e.id)){
              hit.add(e.id);battle.dealDamage(unit,e,{amount:Math.max(e.hp*bb.hp_ratio,unit.s.atk*bb.projectile_min_atk_scale),type:'arts',isSkill:true,canDodge:false,tags:['skill','chen3:wave']});
            }
            if(Math.floor(age*10)!==Math.floor((age-dt)*10))battle.fx('chenSwordWave',{id:unit.id,x,y});
          },{owner:unit});
        },
      },
    },
    talents:[{install(battle,unit){
      battle.addBuff(unit,{key:'chen3:sight',persist:true,allowDead:true,mods:{atkPct:sight.bb.atk,aspd:sight.bb.attack_speed}});
      let quiet=0,evade=false;
      battle.on('deploy',({unit:u,move})=>{if(u===unit&&!move){quiet=0;evade=false;}},{owner:unit});
      battle.on('hit',ctx=>{
        if(ctx.source===unit&&(ctx.dmg.type==='phys'||ctx.dmg.type==='arts')){
          const s=unit.s,ign={defIgnoreFlat:ctx.dmg.defIgnoreFlat+s.defIgnoreFlat,defIgnorePct:ctx.dmg.defIgnorePct+s.defIgnorePct,
            resIgnoreFlat:ctx.dmg.resIgnoreFlat+s.resIgnoreFlat,resIgnorePct:ctx.dmg.resIgnorePct+s.resIgnorePct};
          const p=mitigate(ctx.dmg.amount,'phys',ctx.target.s,ign),a=mitigate(ctx.dmg.amount,'arts',ctx.target.s,ign);
          if(Math.abs(p-a)>1e-6)ctx.dmg.type=p>a?'phys':'arts';
        }
        if(ctx.target===unit){quiet=0;if(evade&&(ctx.dmg.type==='phys'||ctx.dmg.type==='arts')){evade=false;ctx.dmg.cancel=true;battle.emit('dodge',{source:ctx.source,target:unit,dmg:ctx.dmg});}}
      },{owner:unit,priority:-1000});
      battle.on('damaged',c=>{if(c.target===unit&&c.dealt>0)quiet=0;},{owner:unit});
      battle.on('tick',({dt})=>{if(!live(unit))return;quiet+=dt;if(quiet<recovery.bb.stack_time)return;quiet=0;
        const n=recovery.bb.heal_atk_scale_min+Math.floor(battle.rng()*(recovery.bb.heal_atk_scale_max-recovery.bb.heal_atk_scale_min));
        battle.heal(unit,unit,unit.s.atk*n/100);evade=true;battle.fx('chenRecover',{id:unit.id,x:unit.x,y:unit.y});
      },{owner:unit});
    }}],
  };
}
