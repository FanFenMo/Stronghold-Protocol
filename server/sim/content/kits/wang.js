// 望 — linked stones follow the project's automatic battle operations.
// A player's placed 棋子 joins the network; stock is automatically laid near enemy routes.
import { bodyInKeys } from '../../body.js';
import { rotateOffset, toLocal } from '../../dir.js';
const TOKEN='token_10064_wang_stone1';
const live=u=>u.alive&&u.deployed;
const key=(r,c)=>r*21+c;
const directions=[[1,0],[0,1]];
export function stoneKit(){return {profile:{noAttack:true},install(b,u){b.addBuff(u,{key:'wang:stone',flags:{untargetable:true,invulnerable:true,noBlock:true},persist:true,allowDead:true});}};}
export default function wang(bb,chess,def){
  const talent=def.talents[0].bb, insight=def.talents[1].bb, sid=def.skill.id;
  const s1=sid==='skchr_wang_1',s2=sid==='skchr_wang_2',s3=sid==='skchr_wang_3';
  return {
    profile:{atkFX:'wangShot'},
    skills:{
      skchr_wang_1:{kind:'instant',trigger:'SP_FULL',onStart({unit}){unit.mem.wang.stock=Math.min(7,unit.mem.wang.stock+bb.cnt);}},
      skchr_wang_2:{kind:'instant',trigger:'SP_FULL',onStart({unit}){unit.mem.wang.stock=Math.min(7,unit.mem.wang.stock+bb.cnt);}},
      skchr_wang_3:{kind:'ammo',ammo:bb.trigger_time,flags:{disarm:true},targeting:{rangeGrid:def.skill.rangeGrid},
        onStart({unit}){unit.mem.wang.stock+=bb.cnt;unit.mem.wang.placeAt=-Infinity;},
        onEnd({unit,skill}){unit.mem.wang.stock=Math.min(7,unit.mem.wang.stock+skill.ammoLeft);}},
    },
    talents:[{install(battle,unit){
      const state=unit.mem.wang={stock:talent.cnt,stones:[],placeAt:-Infinity};
      const remove=stone=>{const i=state.stones.indexOf(stone);if(i>=0)state.stones.splice(i,1);if(stone.piece?.alive)battle.retreat(stone.piece,{reason:'expired',permanent:true});};
      const add=(r,c,piece=null)=>{
        if(state.stones.some(s=>s.r===r&&s.c===c)||!battle.grid.inRect(r,c))return null;
        const s={r,c,x:c,y:r,piece};state.stones.push(s);battle.fx('wangStone',{id:unit.id,x:c,y:r,duration:1.2});return s;
      };
      const canFollow=(r,c)=>battle.grid.inRect(r,c)&&battle.grid.tile(r,c).pass==='ALL'&&!battle.unitAt(r,c)&&!battle.downOn(r,c)&&!state.stones.some(s=>s.r===r&&s.c===c);
      const follow=(stone,n)=>{
        const tiles=[[1,0],[0,1],[-1,0],[0,-1]].map(([dr,dc])=>{const [r,c]=rotateOffset(dr,dc,unit.dir);return [stone.r+r,stone.c+c];}).filter(([r,c])=>canFollow(r,c));
        tiles.sort((a,b)=>battle.foesInRadius(b[1],b[0],0.6).length-battle.foesInRadius(a[1],a[0],0.6).length);
        let placed=0;
        for(const [r,c] of tiles.slice(0,n))if(state.stones.length<talent['attack@max_spawn_cnt']){add(r,c);placed++;}
        return placed;
      };
      const placeFollowers=stone=>{
        const active=s3&&unit.skill.active;
        const placed=follow(stone,active?Math.min(3,unit.skill.ammoLeft):1);
        if(active){unit.skill.ammoLeft-=placed;if(unit.skill.ammoLeft<=0||state.stock<=0)unit.skill.end('ammo');}
      };
      battle.on('deploy',({unit:u,move})=>{
        if(u===unit&&!move){state.stock=talent.cnt;state.placeAt=-Infinity;}
        if(u.ownerUnit===unit&&u.defId===TOKEN){const stone=add(u.tileR,u.tileC,u);if(stone){state.stock=Math.max(0,state.stock-1);placeFollowers(stone);}}
      },{owner:unit});
      battle.on('death',({unit:u})=>{if(u===unit)for(const s of state.stones.slice())remove(s);},{owner:unit});
      const trigger=(stone,axis,count)=>{
        const layers=Math.min(insight['attack@max_trigger_cnt'],count);
        const scale=s3?bb.atk_scale:bb['attack@atk_scale'];
        const damage=unit.s.atk*scale*(1+layers*insight['attack@per_atk_scale']);
        const ignore=layers*insight['attack@per_magic_resist_penetrate_fixed'];
        let foes;
        if(s2){const keys=[];for(let n=-3;n<=3;n++)keys.push(key(stone.r+axis[0]*n,stone.c+axis[1]*n));foes=battle.enemies.filter(e=>live(e)&&!e.isFlying&&bodyInKeys(e,keys));}
        else foes=battle.foesInRadius(stone.x,stone.y,s3?1.2:0.7).filter(e=>!e.isFlying);
        for(const e of foes){
          if(s1){battle.applyStatus(e,'sluggish',{duration:bb['attack@sluggish'],source:unit});
            battle.addBuff(e,{key:`wang:dot:${unit.id}`,duration:bb['attack@sluggish'],interval:1,refresh:'replace',onTick:()=>battle.dealDamage(unit,e,{amount:damage,type:'arts',resIgnoreFlat:ignore,canDodge:false,tags:['skill','dot','wang:stone']})});
          }else{battle.dealDamage(unit,e,{amount:damage,type:'arts',resIgnoreFlat:ignore,isSkill:true,canDodge:false,tags:['skill','wang:stone']});
            if(s2&&e.alive)battle.addBuff(e,{key:`wang:slow:${unit.id}`,duration:bb['attack@duration'],mods:{moveMul:1+bb['attack@move_speed']},refresh:'replace'});}
        }
        battle.fx(s2?'wangLine':'wangBurst',{id:unit.id,x:stone.x,y:stone.y,r:s3?1.2:0.7});remove(stone);
      };
      battle.every(0.2,()=>{
        if(!live(unit))return;
        const active=s3&&unit.skill.active;
        if(state.stock>0&&battle.time>=state.placeAt&&state.stones.length<talent['attack@max_spawn_cnt']){
          const foes=battle.enemiesInKeys(unit.rangeKeys,unit,{canHitFly:false}),tiles=[];
          for(const k of unit.rangeKeys){const r=Math.floor(k/21),c=k%21;if(!canFollow(r,c))continue;
            if(battle.foesInRadius(c,r,0.65).length&&!active)continue;
            const score=foes.reduce((v,e)=>Math.min(v,Math.hypot(e.x-c,e.y-r)),Infinity);tiles.push({r,c,score,local:toLocal(r-unit.tileR,c-unit.tileC,unit.dir)});}
          tiles.sort((a,b)=>a.score-b.score||a.local[0]-b.local[0]||a.local[1]-b.local[1]);
          if(foes.length&&tiles.length){
            const t=tiles[0],stone=add(t.r,t.c);if(state.stock>0)state.stock--;
            placeFollowers(stone);state.placeAt=battle.time+1;
          }
        }
        const occupied=new Map(state.stones.map(s=>[key(s.r,s.c),s]));
        for(const s of state.stones.slice()){
          if(!state.stones.includes(s))continue;
          let axis=null,count=1;
          for(const offset of directions){const d=rotateOffset(...offset,unit.dir);let n=1;for(const sign of [-1,1])for(let k=1;k<=9;k++){if(!occupied.has(key(s.r+d[0]*k*sign,s.c+d[1]*k*sign)))break;n++;}if(n>count){count=n;axis=d;}}
          if(count<2)continue;
          if(battle.foesInRadius(s.x,s.y,s3?1.2:0.6).some(e=>!e.isFlying))trigger(s,axis,count);
          else if(Math.floor(battle.time*2)!==Math.floor((battle.time-0.2)*2))battle.fx('wangStone',{id:unit.id,x:s.x,y:s.y,duration:0.6});
        }
      },{owner:unit});
    }}],
  };
}
