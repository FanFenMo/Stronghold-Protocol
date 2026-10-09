// 克莱门莎: PRTS Lv4/Lv7, zero potential, no module.
import { dirVec } from '../../dir.js';
import { bodyInKeys } from '../../body.js';

const live = u => u.alive && u.deployed;
const erosion = (b,u,e,n) => b.dealDamage(u,e,{amount:n,type:'element',element:'erosion',canDodge:false});
const phys = (b,u,e,n,tag) => b.dealDamage(u,e,{amount:n,type:'phys',isSkill:true,canDodge:false,tags:[tag]});

function capsule(b,u,bb) {
  const [dy,dx]=dirVec(u.dir),p={x:u.x,y:u.y},passengers=[];
  let travel=0,mass=0,finished=false;
  b.addBuff(u,{key:'clemnt:launch',duration:10,flags:{disarm:true}});
  const finish=()=>{
    finished=true;b.removeBuff(u,'clemnt:launch');
    for(const e of passengers)b.removeBuff(e,`clemnt:banish:${u.id}`);
    const expires=b.time+u.skill.timeLeft;
    b.fx('clemntWhirlpool',{id:u.id,x:p.x,y:p.y,r:1.5,duration:u.skill.timeLeft});
    const off=b.every(1,()=>{
      if(!live(u)||b.time>expires){b.off(off);return;}
      for(const e of b.foesInRadius(p.x,p.y,1.5)){
        b.addBuff(e,{key:`clemnt:slow:${u.id}`,duration:1.1,mods:{moveMul:1+bb['attack@move_speed']}});
        erosion(b,u,e,bb['attack@water_element']);
        phys(b,u,e,u.s.atk*bb['attack@physical_atk_scale'],'clemnt:whirlpool');
      }
    },{owner:u});
  };
  const off=b.on('tick',({dt})=>{
    if(finished||!live(u)||!u.skill.active){
      b.off(off);b.removeBuff(u,'clemnt:launch');
      for(const e of passengers)b.removeBuff(e,`clemnt:banish:${u.id}`);
      return;
    }
    let left=Math.min(3-travel,dt*2);
    while(left>1e-8){
      const n=Math.min(left,0.05),nx=p.x+dx*n,ny=p.y+dy*n;
      // Capsule stops 0.4 tiles before an impassable edge, including the lower field boundary.
      if(!b.grid.groundPassable(Math.round(ny+dy*0.4),Math.round(nx+dx*0.4))){finish();break;}
      p.x=nx;p.y=ny;travel+=n;left-=n;
      for(const e of b.foesInRadius(p.x,p.y,0.8)){
        if(e.isFlying||passengers.includes(e)||e.s.flags.selfBound||e.def.immune.has('teleport')
          ||Math.abs(e.x-p.x)>0.55||Math.abs(e.y-p.y)>0.55
          ||passengers.length>=bb['attack@max_passenger_cnt']||mass+e.weight>bb['attack@max_passenger_mass'])continue;
        mass+=e.weight;passengers.push(e);
        b.addBuff(e,{key:`clemnt:banish:${u.id}`,duration:10,flags:{disarm:true,unblockable:true,untargetable:true,root:true}});
        b._unblock(e);
      }
      for(const e of passengers)if(live(e)){
        e.x=p.x;e.y=p.y;if(e.route)e.route.pts=null;
      }
    }
    b.fx('clemntCapsule',{id:u.id,x:p.x,y:p.y});
    if(!finished&&travel>=3-1e-8)finish();
  },{owner:u});
}

export default function clemnt(bb,chess,def) {
  const talent=def.talents[0].bb,guard=def.talents[1].bb;
  return {
    trait:{afterAttack(b,u,targets){for(const e of targets)b.fx('clemntSlash',{id:u.id,x:e.x,y:e.y});}},
    skills:{
      skchr_clemnt_1:{kind:'instant',attack:{atkScale:bb.atk_scale},
        onHit({battle,unit,target,dealt}){erosion(battle,unit,target,dealt*bb.ep_damage_ratio);}},
      skchr_clemnt_2:{kind:'duration',mods:{aspd:bb.attack_speed},targeting:{rangeGrid:def.skill.rangeGrid},
        attack:{atkScale:bb['attack@aoe_atk_scale']},
        onStart({battle,unit}){capsule(battle,unit,bb);},
        onHit({battle,unit,target}){
          for(const e of battle.foesInRadius(target.x,target.y,1.1).filter(e=>e!==target&&!e.isFlying).slice(0,bb['attack@max_target']))
            phys(battle,unit,e,unit.s.atk*bb['attack@aoe_atk_scale'],'clemnt:splash');
        },
        onEnd({battle,unit}){battle.removeBuff(unit,'clemnt:launch');}},
      skchr_clemnt_3:{kind:'ammo',ammo:bb.trigger_time,targeting:{rangeGrid:def.skill.rangeGrid,maxTargets:bb['attack@max_target']},
        attack:{atkScale:bb['attack@atk_scale'],onEachHit({battle,unit,target,dealt}){
          erosion(battle,unit,target,dealt*bb['attack@ep_damage_ratio']);
        }},onAttack(ctx){ctx.noAmmo=true;},
        onStart({unit}){unit.mem.clemnt.marks.clear();}},
    },
    talents:[{install(b,u){
      const state=u.mem.clemnt={marks:new Map(),shells:new Map()};
      b.on('hit',({source,target,dmg})=>{
        if(dmg.type!=='phys'&&dmg.type!=='arts')return;
        if(source===u&&dmg.type==='phys'&&b.rng.chance(target.s.def<target.base.def?talent.prob_special:talent.prob_normal))dmg.amount*=talent.t1_atk_scale;
        if(target===u&&source){
          const [dy,dx]=dirVec(u.dir);
          if((Math.round(source.x)-u.tileC)*dx+(Math.round(source.y)-u.tileR)*dy>=0)
            dmg.mul*=1-(source.def.tags?.includes('seamonster')?guard.damage_resistance_seamonster:guard.damage_resistance_normal);
        }
      },{owner:u});
      b.on('elementBurst',({target,element})=>{
        if(live(u)&&u.skill.active&&u.skill.id==='skchr_clemnt_3'&&element==='erosion'&&target.side==='enemy'&&!target.isFlying)
          state.marks.set(target,{until:b.time+bb.ep_break_duration,r:Math.round(target.y),c:Math.round(target.x)});
      },{owner:u});
      b.on('tick',()=>{
        if(!live(u)||!u.skill.active||u.skill.id!=='skchr_clemnt_3')return;
        for(const [e,m] of state.marks)if(!live(e)||m.until<b.time)state.marks.delete(e);
        const entries=[...state.marks].sort(([a],[c])=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(c.x-u.x,c.y-u.y));
        for(const [e,m] of entries){
          const key=m.r*21+m.c;if((state.shells.get(key)||0)>b.time)continue;
          state.marks.delete(e);state.shells.set(key,b.time+bb.projectile_life_time);
          const keys=[[0,0],[1,0],[-1,0],[0,1],[0,-1]].map(([r,c])=>(m.r+r)*21+m.c+c);
          // Existing projectile scheduler: the first shell lands after one second, followed by two at 1 s intervals.
          for(let i=1;i<=3;i++)b.after(i,()=>{
            if(!live(u))return;
            for(const target of b.enemies.filter(e=>live(e)&&!e.isFlying&&bodyInKeys(e,keys))){
              phys(b,u,target,u.s.atk*bb.s3_atk_scale,'clemnt:barrage');
              b.dealDamage(u,target,{amount:u.s.atk*bb.ep_damage_scale,type:'elemental',isSkill:true,canDodge:false,tags:['clemnt:barrage']});
            }
            b.fx('clemntBarrage',{id:u.id,x:m.c,y:m.r,r:1.5});
          },{owner:u});
          u.skill.ammoLeft--;if(u.skill.ammoLeft<=0){u.skill.end('ammo');break;}
        }
      },{owner:u});
    }}],
  };
}
