// 赤刃明霄陈 — PRTS Lv4 / Lv7. Uses the existing damage, movement and projectile hooks.
import { mitigate } from '../../damage.js';
import { dirVec } from '../../dir.js';

const live = u => u.alive && u.deployed;
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

// Rows increase upward. A clockwise turn maps (dx, dy) to (dy, -dx).
// Check the next tile before crossing its edge, including the simulation rect's
// bottom edge, which need not have an explicit wall tile in the stage data.
function advanceWave(grid, wave, remaining) {
  const legs = [];
  let turns = 0;
  while (remaining > 1e-8 && turns < 4) {
    const r = Math.round(wave.y), c = Math.round(wave.x);
    const nr = r + wave.dy, nc = c + wave.dx, tile = grid.tile(nr, nc);
    const blocked = !grid.inRect(nr, nc) || tile.height === 'HIGH' || tile.pass === 'NONE'
      || tile.special === 'start' || tile.special === 'end' || grid.isObstacle(nr, nc);
    const edge = wave.dx ? (c + wave.dx * 0.5 - wave.x) * wave.dx
      : (r + wave.dy * 0.5 - wave.y) * wave.dy;
    const step = Math.min(remaining, Math.max(0, edge + (blocked ? -0.25 : 1e-6)));
    const from = { x: wave.x, y: wave.y };
    wave.x += wave.dx * step;
    wave.y += wave.dy * step;
    remaining -= step;
    const turn = blocked && remaining > 1e-8;
    legs.push({ from, to: { x: wave.x, y: wave.y }, turn });
    if (turn) {
      [wave.dx, wave.dy] = [wave.dy, -wave.dx];
      turns++;
    } else turns = 0;
  }
  return legs;
}

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
          const [dr,dc]=dirVec(unit.dir);
          const wave={x:unit.x,y:unit.y,dx:dc,dy:dr},hit=new Set();let age=0;
          const off=battle.on('tick',({dt})=>{
            if(!live(unit)||age>=6){battle.off(off);return;}
            const elapsed=Math.min(dt,6-age);age+=elapsed;
            for(const leg of advanceWave(battle.grid,wave,elapsed*1.5)){
              const length=distance(leg.from,leg.to);
              if(length>1e-8){
                const x=(leg.from.x+leg.to.x)/2,y=(leg.from.y+leg.to.y)/2;
                for(const e of battle.foesInRadius(x,y,1.3+length/2))if(!hit.has(e.id)){
                  const dx=leg.to.x-leg.from.x,dy=leg.to.y-leg.from.y;
                  const t=Math.max(0,Math.min(1,((e.x-leg.from.x)*dx+(e.y-leg.from.y)*dy)/(length*length)));
                  if(Math.hypot(e.x-leg.from.x-t*dx,e.y-leg.from.y-t*dy)>1.3)continue;
                  hit.add(e.id);battle.dealDamage(unit,e,{amount:Math.max(e.hp*bb.hp_ratio,unit.s.atk*bb.projectile_min_atk_scale),type:'arts',isSkill:true,canDodge:false,tags:['skill','chen3:wave']});
                }
              }
              if(leg.turn)hit.clear(); // Once per enemy on each straight leg (PRTS).
            }
            if(Math.floor(age*10)!==Math.floor((age-elapsed)*10))battle.fx('chenSwordWave',{id:unit.id,x:wave.x,y:wave.y,dx:wave.dx,dy:wave.dy});
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
