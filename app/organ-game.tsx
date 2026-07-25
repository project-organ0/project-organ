"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OrganKey = "뇌" | "심장" | "폐" | "간" | "근육";
type Organs = Record<OrganKey, number>;
type Mode = "start" | "play" | "choice" | "pause" | "report";
type Choice = { name: string; desc: string; effect: string; apply: (g: Game) => void };
type Mob = { x:number;y:number;r:number;hp:number;max:number;speed:number;boss?:boolean;kind:number;hit:number };
type Shot = { x:number;y:number;vx:number;vy:number;life:number;r:number;enemy?:boolean };
type Particle = {x:number;y:number;vx:number;vy:number;life:number;color:string};
type Drop = { x:number;y:number;vx:number;vy:number;kind:"xp"|"heal"|"organ";organ?:OrganKey;value:number;life:number;phase:number };
type Game = {
  w:number;h:number;t:number; stage:number; stageT:number; hp:number; maxHp:number;
  x:number;y:number; vx:number;vy:number; dash:number; inv:number; fire:number; kills:number;
  organs:Organs; mobs:Mob[]; shots:Shot[]; parts:Particle[]; drops:Drop[]; keys:Set<string>;
  choices:string[]; augments:string[]; level:number; xp:number; nextXp:number; paused:boolean;
  damage:number; fireRate:number; speed:number; projectiles:number; poison:number; pulse:number;
  bossSpawned:boolean; choiceDone:boolean; augmentDone:boolean; last:number; shake:number;
};

const STAGES = [
  ["0—20세 · 학교", "학생들의 식욕"],
  ["20—40세 · 회사", "끝나지 않는 업무"],
  ["40—60세 · 아파트", "생활의 무게"],
  ["60—80세 · 병원", "마지막 진료"],
];
const ORGAN_KEYS: OrganKey[] = ["뇌","심장","폐","간","근육"];
const LIFE: Choice[][] = [
  [
    {name:"밤샘 공부",desc:"시험은 잘 봤지만 잠은 거의 자지 못했습니다.",effect:"뇌 강화 · 심장 약화 · 연사 증가",apply:g=>{g.organs.뇌+=15;g.organs.심장-=8;g.fireRate*=.86}},
    {name:"운동부 입단",desc:"수업이 끝나면 운동장부터 달렸습니다.",effect:"폐·근육 강화 · 대시 거리 증가",apply:g=>{g.organs.폐+=10;g.organs.근육+=10;g.organs.뇌-=5;g.speed+=24}},
    {name:"매점 풀코스",desc:"점심시간보다 매점 시간이 더 기다려졌습니다.",effect:"즉시 회복 · 공격 속도 증가 · 간 약화",apply:g=>{g.hp=Math.min(g.maxHp,g.hp+28);g.organs.심장+=5;g.organs.간-=8;g.fireRate*=.9}},
  ],
  [
    {name:"야근 특근",desc:"능력은 늘었지만 퇴근 시간은 사라졌습니다.",effect:"뇌 강화 · 심장 약화 · 투사체 추가",apply:g=>{g.organs.뇌+=15;g.organs.심장-=10;g.projectiles++}},
    {name:"회식의 제왕",desc:"분위기는 살렸지만 간은 살리지 못했습니다.",effect:"범위 증가 · 흡혈 · 간 크게 약화",apply:g=>{g.organs.간-=15;g.poison+=1;g.damage+=4}},
    {name:"헬스장 회원권",desc:"이번에는 정말 꾸준히 다니기로 했습니다.",effect:"근육·폐 강화 · 공격력 증가",apply:g=>{g.organs.근육+=15;g.organs.폐+=5;g.damage+=7}},
  ],
  [
    {name:"배달 야식",desc:"힘든 하루에는 역시 야식이었습니다.",effect:"대량 회복 · 공격 강화 · 간·폐 약화",apply:g=>{g.hp=Math.min(g.maxHp,g.hp+45);g.damage+=8;g.organs.간-=10;g.organs.폐-=5}},
    {name:"건강검진",desc:"미뤄왔던 몸의 상태를 확인했습니다.",effect:"가장 약한 장기 크게 회복",apply:g=>{const k=ORGAN_KEYS.reduce((a,b)=>g.organs[a]<g.organs[b]?a:b);g.organs[k]+=18}},
    {name:"주말 등산",desc:"정상에 오르니 아직은 할 만했습니다.",effect:"폐·심장 강화 · 이동 지속 회복",apply:g=>{g.organs.폐+=12;g.organs.심장+=8;g.speed+=16;g.pulse+=1}},
  ],
  [
    {name:"재활 운동",desc:"예전처럼 강하지 않아도 다시 움직입니다.",effect:"근육·심장 회복 · 대시 강화",apply:g=>{g.organs.근육+=10;g.organs.심장+=8;g.dash=0;g.speed+=12}},
    {name:"식단 관리",desc:"먹고 싶은 것보다 필요한 것을 먹습니다.",effect:"간·심장 회복 · 부작용 완화",apply:g=>{g.organs.간+=15;g.organs.심장+=5;ORGAN_KEYS.forEach(k=>g.organs[k]+=g.organs[k]<35?3:0)}},
    {name:"명상과 산책",desc:"빠르게 가는 대신 오래 가는 법을 배웠습니다.",effect:"뇌·폐 회복 · 피해 감소",apply:g=>{g.organs.뇌+=10;g.organs.폐+=10;g.maxHp+=18;g.hp+=18}},
  ],
];
const AUG: Choice[] = [
  {name:"시냅스 연쇄",desc:"생각은 하나에서 끝나지 않습니다.",effect:"추가 투사체 +1",apply:g=>g.projectiles++},
  {name:"아드레날린",desc:"벼랑 끝에서 몸이 먼저 반응합니다.",effect:"공격 속도 18% 증가",apply:g=>g.fireRate*=.82},
  {name:"맥박 충격",desc:"심장 박동이 적을 밀어냅니다.",effect:"주기적 범위 충격",apply:g=>g.pulse+=2},
  {name:"잔상 호흡",desc:"지나간 자리에도 호흡이 남습니다.",effect:"대시 피해 강화",apply:g=>g.damage+=5},
  {name:"자동 해독",desc:"몸이 대가를 견디는 법을 익힙니다.",effect:"모든 위험 장기 소폭 회복",apply:g=>ORGAN_KEYS.forEach(k=>g.organs[k]+=g.organs[k]<50?8:2)},
  {name:"독성 전환",desc:"쌓인 부작용을 공격으로 바꿉니다.",effect:"독성 오라 활성화",apply:g=>g.poison+=2},
  {name:"근섬유 폭발",desc:"모든 힘을 한 점에서 터뜨립니다.",effect:"기본 공격력 +8",apply:g=>g.damage+=8},
  {name:"심폐 순환",desc:"계속 움직일수록 다시 살아납니다.",effect:"최대 체력 +22 · 속도 증가",apply:g=>{g.maxHp+=22;g.hp+=22;g.speed+=12}},
  {name:"뇌근 동기화",desc:"판단과 힘이 같은 박자로 움직입니다.",effect:"연사·공격력 동시 강화",apply:g=>{g.fireRate*=.9;g.damage+=5}},
];

function fresh():Game {
  return {w:1280,h:720,t:0,stage:0,stageT:0,hp:100,maxHp:100,x:640,y:360,vx:0,vy:0,dash:0,inv:0,fire:0,kills:0,
    organs:{뇌:55,심장:55,폐:55,간:55,근육:55},mobs:[],shots:[],parts:[],drops:[],keys:new Set(),choices:[],augments:[],
    level:1,xp:0,nextXp:12,paused:false,damage:14,fireRate:.42,speed:210,projectiles:1,poison:0,pulse:0,
    bossSpawned:false,choiceDone:false,augmentDone:false,last:0,shake:0};
}

export default function OrganGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game>(fresh());
  const raf = useRef(0);
  const [mode,setMode]=useState<Mode>("start");
  const [hud,setHud]=useState({hp:100,max:100,t:0,stage:0,organs:game.current.organs,level:1,xp:0,nextXp:12,loot:""});
  const [cards,setCards]=useState<Choice[]>([]);
  const [choiceType,setChoiceType]=useState<"생활 선택"|"전투 증강">("생활 선택");
  const [report,setReport]=useState({win:false,kills:0,t:0,organs:game.current.organs,choices:[] as string[],augments:[] as string[]});

  const openChoice=useCallback((type:"생활 선택"|"전투 증강", picks:Choice[])=>{
    game.current.paused=true; setChoiceType(type); setCards(picks); setMode("choice");
  },[]);

  const endGame=useCallback((win:boolean)=>{
    const g=game.current; g.paused=true;
    const organs={...g.organs}; ORGAN_KEYS.forEach(k=>organs[k]=Math.max(0,Math.min(100,Math.round(organs[k]))));
    setReport({win,kills:g.kills,t:g.t,organs,choices:[...g.choices],augments:[...g.augments]});
    const strongest=ORGAN_KEYS.reduce((a,b)=>organs[a]>organs[b]?a:b);
    localStorage.setItem("organ-gene",strongest);
    setMode("report");
  },[]);

  const start=useCallback(()=>{
    const g=fresh(); const gene=localStorage.getItem("organ-gene") as OrganKey|null;
    if(gene&&ORGAN_KEYS.includes(gene)) g.organs[gene]+=8;
    game.current=g; setHud({hp:g.hp,max:g.maxHp,t:0,stage:0,organs:{...g.organs},level:1,xp:0,nextXp:g.nextXp,loot:""}); setMode("play");
  },[]);

  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      if(["KeyW","KeyA","KeyS","KeyD","Space","Escape"].includes(e.code))e.preventDefault();
      if(e.code==="Escape"&&mode==="play"){game.current.paused=true;setMode("pause");return}
      if(e.code==="Escape"&&mode==="pause"){game.current.paused=false;game.current.last=performance.now();setMode("play");return}
      game.current.keys.add(e.code);
      if(e.code==="Space"&&game.current.dash<=0&&mode==="play"){
        const g=game.current; let dx=(g.keys.has("KeyD")?1:0)-(g.keys.has("KeyA")?1:0),dy=(g.keys.has("KeyS")?1:0)-(g.keys.has("KeyW")?1:0);
        const n=Math.hypot(dx,dy)||1; dx/=n;dy/=n;g.vx=dx*760;g.vy=dy*760;g.dash=1.55;g.inv=.28;g.shake=7;
      }
    };
    const up=(e:KeyboardEvent)=>game.current.keys.delete(e.code);
    addEventListener("keydown",down);addEventListener("keyup",up);return()=>{removeEventListener("keydown",down);removeEventListener("keyup",up)};
  },[mode]);

  useEffect(()=>{
    const c=canvas.current;if(!c)return;const ctx=c.getContext("2d")!;
    const spawn=(g:Game,boss=false)=>{
      const side=Math.floor(Math.random()*4);let x=0,y=0;
      if(side===0){x=Math.random()*g.w;y=-25}else if(side===1){x=g.w+25;y=Math.random()*g.h}else if(side===2){x=Math.random()*g.w;y=g.h+25}else{x=-25;y=Math.random()*g.h}
      const base=20+g.stage*12+g.t*.035;
      g.mobs.push({x,y,r:boss?(g.stage===3?52:38):10+Math.random()*8,hp:boss?base*18:base,max:boss?base*18:base,speed:boss?58:65+Math.random()*44+g.stage*8,boss,kind:Math.floor(Math.random()*3),hit:0});
    };
    const burst=(g:Game,x:number,y:number,color:string,n=7)=>{for(let i=0;i<n;i++){const a=Math.random()*6.28,s=40+Math.random()*150;g.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.35,color})}};
    const loop=(now:number)=>{
      const g=game.current;const dt=Math.min(.033,(now-(g.last||now))/1000);g.last=now;
      if(!g.paused&&mode==="play"){
        g.t+=dt;g.stageT+=dt;g.dash-=dt;g.inv-=dt;g.fire-=dt;g.shake=Math.max(0,g.shake-dt*30);
        const targetStage=Math.min(3,Math.floor(g.t/120));
        if(targetStage!==g.stage){g.stage=targetStage;g.stageT=0;g.bossSpawned=false;g.choiceDone=false;g.augmentDone=false;ORGAN_KEYS.forEach(k=>g.organs[k]-=3+targetStage)}
        if(!g.choiceDone&&g.stageT>38){g.choiceDone=true;openChoice("생활 선택",LIFE[g.stage]);}
        if(!g.bossSpawned&&g.stageT>100){g.bossSpawned=true;spawn(g,true)}
        if(g.t>=480){const boss=g.mobs.find(m=>m.boss);if(!boss)spawn(g,true)}
        const dx=(g.keys.has("KeyD")?1:0)-(g.keys.has("KeyA")?1:0),dy=(g.keys.has("KeyS")?1:0)-(g.keys.has("KeyW")?1:0),n=Math.hypot(dx,dy)||1;
        if(g.inv<=.12){g.vx=dx/n*g.speed;g.vy=dy/n*g.speed}
        g.x=Math.max(18,Math.min(g.w-18,g.x+g.vx*dt));g.y=Math.max(18,Math.min(g.h-18,g.y+g.vy*dt));
        const cap=Math.min(155,26+g.stage*18+Math.floor(g.stageT/3));
        if(g.mobs.filter(m=>!m.boss).length<cap&&Math.random()<dt*(5+g.stage*3+g.stageT*.05))spawn(g);
        let nearest:Mob|undefined,nd=Infinity;for(const m of g.mobs){const d=(m.x-g.x)**2+(m.y-g.y)**2;if(d<nd){nd=d;nearest=m}}
        if(g.fire<=0&&nearest){g.fire=g.fireRate;const a=Math.atan2(nearest.y-g.y,nearest.x-g.x);for(let j=0;j<g.projectiles;j++){const off=(j-(g.projectiles-1)/2)*.13;g.shots.push({x:g.x,y:g.y,vx:Math.cos(a+off)*560,vy:Math.sin(a+off)*560,life:1.5,r:5})}}
        for(const m of g.mobs){
          const a=Math.atan2(g.y-m.y,g.x-m.x);m.x+=Math.cos(a)*m.speed*dt;m.y+=Math.sin(a)*m.speed*dt;m.hit-=dt;
          const d=Math.hypot(m.x-g.x,m.y-g.y);
          if(d<m.r+16&&g.inv<=0){g.hp-=m.boss?18:8;g.inv=.55;g.shake=10;burst(g,g.x,g.y,"#ff715b",12);if(g.hp<=0)endGame(false)}
          if(g.poison&&d<95){m.hp-=g.poison*6*dt}
        }
        for(const s of g.shots){s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(!s.enemy){for(const m of g.mobs){if(Math.hypot(s.x-m.x,s.y-m.y)<s.r+m.r){m.hp-=g.damage;s.life=0;m.hit=.08;burst(g,s.x,s.y,"#d8ff3e",3);break}}}}
        const dead=g.mobs.filter(m=>m.hp<=0);for(const m of dead){
          g.kills++;burst(g,m.x,m.y,m.boss?"#ff715b":"#4ee5e1",m.boss?30:8);
          const dropCount=m.boss?7:1;
          for(let i=0;i<dropCount;i++){
            const roll=Math.random(),a=Math.random()*6.28,s=35+Math.random()*90;
            const kind=m.boss?(i<3?"xp":i<5?"heal":"organ"):(roll<.72?"xp":roll<.88?"heal":"organ");
            g.drops.push({x:m.x,y:m.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,kind,organ:kind==="organ"?ORGAN_KEYS[Math.floor(Math.random()*ORGAN_KEYS.length)]:undefined,value:kind==="xp"?(m.boss?4:1):kind==="heal"?(m.boss?18:7):(m.boss?5:2),life:14,phase:Math.random()*6.28});
          }
          if(m.boss){if(g.stage===3&&g.stageT>100){endGame(true)}else if(!g.augmentDone){g.augmentDone=true;const pool=[...AUG].sort(()=>Math.random()-.5).slice(0,3);openChoice("전투 증강",pool)}}
        }
        g.mobs=g.mobs.filter(m=>m.hp>0);g.shots=g.shots.filter(s=>s.life>0&&s.x>-30&&s.x<g.w+30&&s.y>-30&&s.y<g.h+30);
        let picked="";
        for(const d of g.drops){
          d.life-=dt;d.phase+=dt*4;d.x+=d.vx*dt;d.y+=d.vy*dt;d.vx*=.92;d.vy*=.92;
          const dist=Math.hypot(g.x-d.x,g.y-d.y);
          if(dist<150){const pull=Math.max(180,620*(1-dist/150));d.x+=(g.x-d.x)/Math.max(1,dist)*pull*dt;d.y+=(g.y-d.y)/Math.max(1,dist)*pull*dt}
          if(dist<23){
            d.life=0;
            if(d.kind==="xp"){
              g.xp+=d.value;picked=`경험 세포 +${d.value}`;
              while(g.xp>=g.nextXp){g.xp-=g.nextXp;g.level++;g.nextXp=Math.round(g.nextXp*1.28);g.damage+=2;g.fireRate=Math.max(.18,g.fireRate*.97);g.maxHp+=3;g.hp=Math.min(g.maxHp,g.hp+3);picked=`레벨 ${g.level} · 세포 강화`}
            }else if(d.kind==="heal"){g.hp=Math.min(g.maxHp,g.hp+d.value);picked=`회복 세포 +${d.value}`}
            else if(d.organ){g.organs[d.organ]=Math.min(100,g.organs[d.organ]+d.value);picked=`${d.organ} 영양소 +${d.value}`}
            burst(g,d.x,d.y,d.kind==="xp"?"#d8ff3e":d.kind==="heal"?"#ff715b":"#4ee5e1",6);
          }
        }
        g.drops=g.drops.filter(d=>d.life>0);
        for(const p of g.parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt}g.parts=g.parts.filter(p=>p.life>0).slice(-280);
        if(g.pulse&&Math.floor(g.t*2)%18===0){for(const m of g.mobs){if(Math.hypot(m.x-g.x,m.y-g.y)<115)m.hp-=g.pulse*.3}}
        if(Math.floor(g.t*10)%3===0)setHud({hp:g.hp,max:g.maxHp,t:g.t,stage:g.stage,organs:{...g.organs},level:g.level,xp:g.xp,nextXp:g.nextXp,loot:picked});
      }
      const sx=(Math.random()-.5)*g.shake,sy=(Math.random()-.5)*g.shake;ctx.save();ctx.translate(sx,sy);
      const palettes=[["#172321","#23322e"],["#1c2429","#29353b"],["#26231f","#36302a"],["#1e2324","#2c3435"]];const pal=palettes[g.stage];
      ctx.fillStyle=pal[0];ctx.fillRect(-20,-20,g.w+40,g.h+40);ctx.strokeStyle=pal[1];ctx.lineWidth=1;
      for(let x=0;x<g.w;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,g.h);ctx.stroke()}for(let y=0;y<g.h;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(g.w,y);ctx.stroke()}
      ctx.fillStyle="rgba(255,255,255,.035)";for(let i=0;i<20;i++){ctx.beginPath();ctx.arc((i*187+g.stage*61)%g.w,(i*113+g.stage*29)%g.h,22+(i%4)*13,0,6.28);ctx.fill()}
      for(const p of g.parts){ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4)}ctx.globalAlpha=1;
      for(const d of g.drops){
        const bob=Math.sin(d.phase)*3;ctx.save();ctx.translate(d.x,d.y+bob);ctx.rotate(d.phase*.35);
        ctx.shadowBlur=16;ctx.shadowColor=d.kind==="xp"?"#d8ff3e":d.kind==="heal"?"#ff715b":"#4ee5e1";
        ctx.fillStyle=d.kind==="xp"?"#d8ff3e":d.kind==="heal"?"#ff715b":"#4ee5e1";
        if(d.kind==="heal"){ctx.fillRect(-3,-9,6,18);ctx.fillRect(-9,-3,18,6)}
        else if(d.kind==="organ"){ctx.beginPath();for(let i=0;i<6;i++){const a=i/6*6.28;ctx.lineTo(Math.cos(a)*9,Math.sin(a)*9)}ctx.closePath();ctx.fill()}
        else{ctx.beginPath();ctx.arc(0,0,7,0,6.28);ctx.fill();ctx.strokeStyle="#101515";ctx.lineWidth=2;ctx.stroke()}
        ctx.restore();
      }
      for(const s of g.shots){ctx.fillStyle="#d8ff3e";ctx.shadowBlur=13;ctx.shadowColor="#d8ff3e";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,6.28);ctx.fill()}ctx.shadowBlur=0;
      for(const m of g.mobs){
        ctx.save();ctx.translate(m.x,m.y);if(m.hit>0)ctx.fillStyle="#fff";else ctx.fillStyle=m.boss?"#ff715b":m.kind===0?"#76c8b9":m.kind===1?"#a49bd8":"#d1bc7a";
        ctx.beginPath();for(let i=0;i<12;i++){const a=i/12*6.28,r=m.r*(i%2?1:.76);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();
        ctx.fillStyle="#101515";ctx.beginPath();ctx.arc(-m.r*.25,-2,2.5,0,6.28);ctx.arc(m.r*.25,-2,2.5,0,6.28);ctx.fill();
        if(m.boss){ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillRect(-m.r,-m.r-13,m.r*2,5);ctx.fillStyle="#d8ff3e";ctx.fillRect(-m.r,-m.r-13,m.r*2*(m.hp/m.max),5)}ctx.restore();
      }
      ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.t*1.4);ctx.fillStyle=g.inv>0&&Math.floor(g.t*20)%2?"#fff":"#d8ff3e";ctx.shadowBlur=20;ctx.shadowColor="#d8ff3e";ctx.beginPath();for(let i=0;i<10;i++){const a=i/10*6.28,r=i%2?12:19;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.restore();ctx.shadowBlur=0;
      ctx.restore();raf.current=requestAnimationFrame(loop);
    };
    raf.current=requestAnimationFrame(loop);return()=>cancelAnimationFrame(raf.current);
  },[mode,endGame,openChoice]);

  const choose=(c:Choice)=>{const g=game.current;c.apply(g);ORGAN_KEYS.forEach(k=>g.organs[k]=Math.max(0,Math.min(100,g.organs[k])));if(choiceType==="생활 선택")g.choices.push(c.name);else g.augments.push(c.name);g.paused=false;g.last=performance.now();setMode("play")};
  const gene=typeof window!=="undefined"?localStorage.getItem("organ-gene"):null;
  const strongest=ORGAN_KEYS.reduce((a,b)=>report.organs[a]>report.organs[b]?a:b),weakest=ORGAN_KEYS.reduce((a,b)=>report.organs[a]<report.organs[b]?a:b);
  const build=strongest==="뇌"?(report.organs.간>55?"신경 마법사":"기동 마법사"):strongest==="근육"?(report.organs.심장>55?"심장 버서커":"독성 파이터"):strongest==="폐"?"심폐 러너":"균형형 인간";
  const fmt=(t:number)=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,"0")}`;
  const state=(v:number)=>v>=70?"healthy":v>=30?"normal":"danger";

  return <main className="game-shell"><section className="frame">
    <canvas ref={canvas} width={1280} height={720} aria-label="장기 프로젝트 게임 화면"/>
    {mode==="start"&&<div className="screen">
      <div className="eyebrow">ORGAN PROJECT / LIFE-01</div>
      <h1 className="title">장기<br/><span>프로젝트</span></h1>
      <p className="lede">매 순간 더 강해질 수 있지만, 그 대가는 몸 어딘가에 남습니다. 생활을 선택하고, 장기를 성장시키며, 마지막 적 <b>‘노화’</b>와 맞서세요.</p>
      <div className="start-row"><button className="primary" onClick={start}>생애 시작하기 ↗</button><div className="keys"><kbd>WASD</kbd> 이동 &nbsp; <kbd>SPACE</kbd> 대시</div></div>
      <div className="gene">{gene?`유전 특성 감지: 타고난 ${gene} +8`:"저장된 유전 특성이 없습니다. 첫 생애를 시작하세요."}</div>
    </div>}
    {(mode==="play"||mode==="pause")&&<><div className="hud"><div className="hud-top"><div className="stage"><small>LIFE STAGE 0{hud.stage+1}</small>{STAGES[hud.stage][0]}</div><div><div className="clock">{fmt(hud.t)} <small>/ 8:00</small></div><div className="hp"><i style={{width:`${Math.max(0,hud.hp/hud.max*100)}%`}}/></div></div></div></div>
      <div className="level-hud"><b>LV.{hud.level}</b><span><i style={{width:`${hud.xp/hud.nextXp*100}%`}}/></span>{hud.loot&&<em>{hud.loot}</em>}</div>
      <div className="organs">{ORGAN_KEYS.map(k=><div className={`organ ${state(hud.organs[k])}`} key={k}><i/>{k}<br/>{state(hud.organs[k])==="healthy"?"건강":state(hud.organs[k])==="normal"?"주의":"위험"}</div>)}</div>
      <div className="dash-hint">SPACE 대시 · ESC 일시정지</div></>}
    {mode==="choice"&&<div className="choice-wrap"><div className="choice-head"><div><div className="eyebrow">LIFE INTERRUPT</div><h2>{choiceType}</h2></div><p>{choiceType==="생활 선택"?"어떤 선택도 공짜는 아닙니다. 강해진 만큼, 몸 어딘가에 흔적이 남습니다.":"현재의 몸이 새로운 생존 방식을 제안합니다."}</p></div><div className="cards">{cards.map((c,i)=><button className="card" key={c.name} onClick={()=>choose(c)}><span className="card-no">OPTION 0{i+1}</span><h3>{c.name}</h3><p>{c.desc}</p><strong>{c.effect} ↗</strong></button>)}</div></div>}
    {mode==="pause"&&<div className="pause"><div><div className="eyebrow">SYSTEM PAUSED</div><h2>잠시 숨 고르기</h2><button className="primary" onClick={()=>{game.current.paused=false;game.current.last=performance.now();setMode("play")}}>계속하기</button></div></div>}
    {mode==="report"&&<div className="screen report"><div className="report-grid"><div><div className="eyebrow">LIFE REPORT / COMPLETE</div><h1>{report.win?"노화를 넘어섰습니다.":"생애가 끝났습니다."}</h1><p className="report-copy"><b>{build}</b>의 삶이었습니다. {strongest}은(는) 끝까지 강하게 버텼지만, {weakest}에는 선택의 대가가 깊게 남았습니다. 다음 생애에는 <b>타고난 {strongest}</b>이 유전됩니다.</p><div className="stats"><div className="stat"><small>SURVIVAL</small><b>{fmt(report.t)}</b></div><div className="stat"><small>ZOMBIES</small><b>{report.kills} 처치</b></div><div className="stat"><small>BUILD</small><b>{build}</b></div><div className="stat"><small>GENE</small><b>타고난 {strongest}</b></div></div><div className="report-actions"><button className="primary" onClick={start}>다음 생애 시작 ↗</button></div></div><div><div className="organ-report">{ORGAN_KEYS.map(k=><div className="organ-line" key={k}><span>{k}</span><div className="bar"><i style={{width:`${report.organs[k]}%`}}/></div><b>{report.organs[k]}</b></div>)}</div><p className="gene">생활: {report.choices.join(" · ")||"기록 없음"}<br/>증강: {report.augments.join(" · ")||"기록 없음"}</p></div></div></div>}
  </section></main>;
}
