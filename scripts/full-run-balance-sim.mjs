import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const balance = JSON.parse(await readFile(path.join(root, "app/game/augment-balance.json"), "utf8"));

const CLASS_KEYS = ["heart", "brain", "liver", "lung", "muscle"];
const CLASS_NAMES = { heart:"심장", brain:"뇌", liver:"간", lung:"폐", muscle:"근육" };
const CLASS_CARDS = {
  heart:["heart_adrenaline","heart_shock","heart_overload","heart_bloodflow"],
  brain:["brain_synapse","brain_chain","brain_focus","brain_frenzy"],
  liver:["liver_footprints","liver_overlap","liver_rupture","liver_concentrated"],
  lung:["lung_bladewind","lung_eyestorm","lung_circulation","lung_afterimage"],
  muscle:["muscle_overcontract","muscle_chaincollide","muscle_painfuel","muscle_gravity"],
};
const MARGINAL_AUGMENTS = [
  ["heart","heart_bloodflow","혈류 가속"],
  ["brain","brain_focus","집중 사고"],
  ["brain","brain_frenzy","사고 폭주"],
  ["liver","liver_overlap","오염 중첩"],
  ["liver","liver_concentrated","농축 독"],
  ["lung","lung_circulation","순환 가속"],
  ["muscle","muscle_gravity","중력 압박"],
];
const DIFFICULTY = {
  easy:{hp:.72,count:.72,damage:.65},normal:{hp:1,count:1,damage:1},hard:{hp:1.45,count:1.28,damage:1.35},
};

const argv = Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,value="true"]=arg.replace(/^--/,"").split("=");return[key,value]}));
const runs = Math.max(100, Number(argv.runs||2000));
const baseSeed = Number(argv.seed||20260808);
const difficultyName = ["easy","normal","hard"].includes(argv.difficulty)?argv.difficulty:"normal";
const reportBase = argv.out||path.join("docs",`balance-simulation-${new Date().toISOString().slice(0,10)}`);

const makeRandom=(seed)=>{let state=seed>>>0;return()=>{state+=0x6d2b79f5;let value=state;value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return((value^value>>>14)>>>0)/4294967296}};
const atLevel=(values,level)=>level>0?values[Math.min(values.length,level)-1]:0;
const poisson=(lambda,random)=>{if(lambda<=0)return 0;const limit=Math.exp(-lambda);let product=1,count=0;do{count++;product*=random()}while(product>limit);return count-1};
const average=(items,key)=>items.reduce((sum,item)=>sum+item[key],0)/items.length;
const percentile=(items,key,p)=>{const values=items.map(item=>item[key]).sort((a,b)=>a-b);return values[Math.min(values.length-1,Math.floor((values.length-1)*p))]};
const round=(value,digits=1)=>Number(value.toFixed(digits));

function augmentLevel(state,id){return state.cardLevels[id]||0}

function makeChoice(state,random,forced){
  if(!state.awakened){
    state.organGrowth++;if(state.organGrowth>=3){state.awakened=true;state.awakeningAt=state.t;if(forced){for(const id of CLASS_CARDS[state.classKey])state.cardLevels[id]=1;state.cardLevels[forced.id]=forced.level}}
    return;
  }
  if(forced)return;
  if(random()<.68){
    const cards=CLASS_CARDS[state.classKey],available=cards.filter(id=>(state.cardLevels[id]||0)<3);if(!available.length)return;
    const min=Math.min(...available.map(id=>state.cardLevels[id]||0)),candidates=available.filter(id=>(state.cardLevels[id]||0)===min),id=candidates[Math.floor(random()*candidates.length)];state.cardLevels[id]=(state.cardLevels[id]||0)+1;
  }
}

function combatProfile(state){
  if(!state.awakened)return{dps:28,avoidance:.82,bossMultiplier:1};
  const density=Math.min(1,state.enemyCount/80),killRate=state.recentKills/8;
  if(state.classKey==="heart"){
    const adrenaline=augmentLevel(state,"heart_adrenaline"),shock=augmentLevel(state,"heart_shock"),overload=augmentLevel(state,"heart_overload"),bloodflow=augmentLevel(state,"heart_bloodflow");
    const attackMultiplier=adrenaline?1/(Math.max(.5,.75-adrenaline*.05)):1;
    const duration=atLevel(balance.heartBloodflow.durationSeconds,bloodflow),speed=atLevel(balance.heartBloodflow.speedBonus,bloodflow),uptime=bloodflow?1-Math.exp(-killRate*.55*duration):0;
    return{dps:40*attackMultiplier*(1+overload*.1)*(1+shock*.12*density)*(1+speed*uptime*.45),avoidance:.86*(1-speed*uptime*.45),bossMultiplier:1+overload*.06};
  }
  if(state.classKey==="brain"){
    const cores=2+augmentLevel(state,"brain_synapse"),chain=augmentLevel(state,"brain_chain"),focus=augmentLevel(state,"brain_focus"),frenzy=augmentLevel(state,"brain_frenzy"),threshold=atLevel(balance.brainFrenzy.killsPerProc,frenzy);
    const frenzyMultiplier=frenzy?1+Math.min(.7,killRate*.4704/threshold):1;
    return{dps:17.6*cores*(1+chain*.18*density)*frenzyMultiplier,avoidance:.64,bossMultiplier:1+atLevel(balance.brainFocus.eliteBossDamageBonus,focus)};
  }
  if(state.classKey==="liver"){
    const footprints=augmentLevel(state,"liver_footprints"),overlap=augmentLevel(state,"liver_overlap"),rupture=augmentLevel(state,"liver_rupture"),concentrated=augmentLevel(state,"liver_concentrated");
    const stacks=atLevel(balance.liverOverlap.maxStacks,overlap)||1,radius=balance.liverOverlap.baseRadius*Math.pow(balance.liverOverlap.radiusGrowth,Math.max(0,stacks-1)),areaMultiplier=Math.pow(radius/balance.liverOverlap.baseRadius,2),tick=atLevel(balance.liverConcentrated.tickSeconds,concentrated)||2;
    return{dps:(38+footprints*8)*(1+Math.min(1.1,(areaMultiplier-1)*.48))*(1+rupture*.13*density)*(1+concentrated*.11/tick),avoidance:.69,bossMultiplier:1+concentrated*.08};
  }
  if(state.classKey==="lung"){
    const blade=augmentLevel(state,"lung_bladewind"),storm=augmentLevel(state,"lung_eyestorm"),circulation=augmentLevel(state,"lung_circulation"),afterimage=augmentLevel(state,"lung_afterimage"),duration=atLevel(balance.lungCirculation.durationSeconds,circulation),speed=atLevel(balance.lungCirculation.speedBonus,circulation),uptime=circulation?1-Math.exp(-killRate*duration):0;
    return{dps:52*(1+blade*.14)*(1+storm*.11*density)*(1+afterimage*.07)*(1+speed*uptime*.2),avoidance:.48*(1-speed*uptime*.5),bossMultiplier:1};
  }
  const contraction=augmentLevel(state,"muscle_overcontract"),collision=augmentLevel(state,"muscle_chaincollide"),pain=augmentLevel(state,"muscle_painfuel"),gravity=augmentLevel(state,"muscle_gravity"),range=atLevel(balance.muscleGravity.rangeMultiplier,gravity)||1,pull=atLevel(balance.muscleGravity.pullDistance,gravity)||0;
  return{dps:50*(1+contraction*.16)*(1+collision*.16*density)*(1+pain*.06)*(1+(range-1)*.22+pull/140*.08),avoidance:.79*(1-gravity*.035),bossMultiplier:1+pain*.04};
}

function simulateRun({classKey,seed,forced}){
  const random=makeRandom(seed),diff=DIFFICULTY[difficultyName],dt=.5;
  const state={classKey,t:0,hp:100,maxHp:100,stage:0,stageT:0,kills:0,recentKills:0,xp:0,level:1,nextXp:12,organGrowth:0,awakened:false,awakeningAt:null,cardLevels:{},enemyCount:0,enemyHealth:0,bosses:[],bossSpawned:[false,false,false,false],bossesKilled:0,damageTaken:0,hitsTaken:0,choices:0};
  let win=false;
  for(;state.t<480&&state.hp>0&&!win;state.t+=dt){
    state.stage=Math.min(3,Math.floor(state.t/100));state.stageT=state.t-state.stage*100;
    const cap=Math.min(190,26+state.stage*18+Math.floor(state.stageT/3)),spawnRate=(5+state.stage*3+state.stageT*.05)*diff.count,spawnCount=Math.min(cap-state.enemyCount,poisson(spawnRate*dt,random)),enemyHp=(20+state.stage*12+state.t*.035)*diff.hp;
    if(spawnCount>0){state.enemyCount+=spawnCount;state.enemyHealth+=spawnCount*enemyHp}
    if(state.stageT>=78&&!state.bossSpawned[state.stage]){state.bossSpawned[state.stage]=true;state.bosses.push({stage:state.stage,hp:enemyHp*18})}

    const profile=combatProfile(state),totalDamage=profile.dps*dt*(.88+random()*.24),bossDamage=state.bosses.length?totalDamage*(state.classKey==="brain"?.62:.48)*profile.bossMultiplier:0;
    let remainingBossDamage=bossDamage;
    for(const boss of state.bosses){const dealt=Math.min(boss.hp,remainingBossDamage);boss.hp-=dealt;remainingBossDamage-=dealt;if(remainingBossDamage<=0)break}
    const defeatedBosses=state.bosses.filter(boss=>boss.hp<=0);state.bosses=state.bosses.filter(boss=>boss.hp>0);
    for(const boss of defeatedBosses){state.bossesKilled++;state.choices++;makeChoice(state,random,forced);if(boss.stage===3)win=true}

    const regularDamage=Math.max(0,totalDamage-bossDamage),averageHp=state.enemyCount?state.enemyHealth/state.enemyCount:enemyHp,killed=Math.min(state.enemyCount,Math.floor(regularDamage/Math.max(1,averageHp)));
    state.enemyHealth=Math.max(0,state.enemyHealth-regularDamage);state.enemyCount-=killed;if(state.enemyCount<=0){state.enemyCount=0;state.enemyHealth=0}
    state.kills+=killed;state.recentKills=state.recentKills*.82+killed;
    if(killed){
      state.hp=Math.min(state.maxHp,state.hp+killed*7*.16*.42);
      state.xp+=killed*.72;
      while(state.xp>=state.nextXp){state.xp-=state.nextXp;state.level++;state.nextXp=Math.round(state.nextXp*1.28);state.choices++;makeChoice(state,random,forced)}
    }

    const pressure=cap?state.enemyCount/cap:0,bossPressure=state.bosses.length*.8,incoming=([.8,1.2,1.8,1.6][state.stage]*(.25+pressure*.9)+bossPressure)*profile.avoidance*diff.damage*.87,damage=incoming*dt*(.72+random()*.56);
    state.hp-=damage;state.damageTaken+=damage;state.hitsTaken+=poisson(incoming/8*dt,random);
  }
  return{classKey,win,survivalSeconds:Math.min(480,state.t),kills:state.kills,bossesKilled:state.bossesKilled,stage:state.stage+1,level:state.level,awakeningAt:state.awakeningAt??480,damageTaken:state.damageTaken,hitsTaken:state.hitsTaken,cardLevels:state.cardLevels};
}

function summarize(results){
  return{runs:results.length,clearRate:round(results.filter(result=>result.win).length/results.length*100),avgSurvival:round(average(results,"survivalSeconds")),p50Survival:round(percentile(results,"survivalSeconds",.5)),p90Survival:round(percentile(results,"survivalSeconds",.9)),avgKills:round(average(results,"kills")),avgBosses:round(average(results,"bossesKilled"),2),avgLevel:round(average(results,"level"),2),avgAwakening:round(average(results,"awakeningAt")),avgDamageTaken:round(average(results,"damageTaken"))};
}

const natural={};
for(let classIndex=0;classIndex<CLASS_KEYS.length;classIndex++){
  const classKey=CLASS_KEYS[classIndex],results=[];for(let run=0;run<runs;run++)results.push(simulateRun({classKey,seed:baseSeed+classIndex*100000+run,forced:null}));natural[classKey]=summarize(results);
}

const marginal={};
for(let augmentIndex=0;augmentIndex<MARGINAL_AUGMENTS.length;augmentIndex++){
  const [classKey,id,name]=MARGINAL_AUGMENTS[augmentIndex];marginal[id]={name,classKey,levels:{}};
  for(let level=0;level<=3;level++){const results=[];for(let run=0;run<runs;run++)results.push(simulateRun({classKey,seed:baseSeed+500000+augmentIndex*100000+run,forced:{id,level}}));marginal[id].levels[level]=summarize(results)}
}

const payload={generatedAt:new Date().toISOString(),model:"headless-macro-v1",runsPerScenario:runs,seed:baseSeed,difficulty:difficultyName,assumptions:{durationSeconds:480,timeStepSeconds:.5,finalBossAtSeconds:378,choicePolicy:"각성 전 목표 장기 우선, 각성 후 직업 카드 균등 성장",marginalPolicy:"각성 시 같은 직업의 다른 증강은 Lv.1, 대상 증강만 Lv.0~3 고정"},natural,marginal};

const naturalRows=CLASS_KEYS.map(key=>{const item=natural[key];return`| ${CLASS_NAMES[key]} | ${item.clearRate}% | ${item.avgSurvival}s | ${item.p50Survival}s | ${item.avgKills} | ${item.avgBosses} | ${item.avgLevel} | ${item.avgAwakening}s |`}).join("\n");
const marginalSections=MARGINAL_AUGMENTS.map(([,id,name])=>{
  const levels=marginal[id].levels,baseline=levels[0];
  const rows=[0,1,2,3].map(level=>{const item=levels[level];return`| Lv.${level} | ${item.clearRate}% | ${item.clearRate-baseline.clearRate>=0?"+":""}${round(item.clearRate-baseline.clearRate)}%p | ${item.avgSurvival}s | ${round(item.avgSurvival-baseline.avgSurvival)}s | ${item.avgKills} | ${round(item.avgKills-baseline.avgKills)} |`}).join("\n");
  return`### ${name}\n\n| 레벨 | 클리어율 | Lv.0 대비 | 평균 생존 | Lv.0 대비 | 평균 처치 | Lv.0 대비 |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}`;
}).join("\n\n");

const comparisons=MARGINAL_AUGMENTS.map(([,id,name])=>{const levels=marginal[id].levels,base=levels[0],max=levels[3],survivalPct=(max.avgSurvival/base.avgSurvival-1)*100,killPct=(max.avgKills/base.avgKills-1)*100,clearDelta=max.clearRate-base.clearRate,stepGains=[1,2,3].map(level=>levels[level].avgKills-levels[level-1].avgKills);return{name,survivalPct:round(survivalPct),killPct:round(killPct),clearDelta:round(clearDelta),stepGains:stepGains.map(value=>round(value))}});
const comparisonRows=comparisons.map(item=>`| ${item.name} | ${item.survivalPct>=0?"+":""}${item.survivalPct}% | ${item.killPct>=0?"+":""}${item.killPct}% | ${item.clearDelta>=0?"+":""}${item.clearDelta}%p | ${item.stepGains.join(" / ")} |`).join("\n");
const largest=[...comparisons].sort((a,b)=>b.killPct-a.killPct).slice(0,3).map(item=>item.name).join(", ");
const smallest=[...comparisons].sort((a,b)=>a.killPct-b.killPct).slice(0,2).map(item=>item.name).join(", ");
const cliffs=comparisons.filter(item=>Math.abs(item.clearDelta)>=40).map(item=>item.name).join(", ")||"없음";

const markdown=`# 전체 런 밸런스 시뮬레이션\n\n생성: ${payload.generatedAt}  \n모델: \`${payload.model}\`  \n난이도: \`${difficultyName}\`  \n시나리오별 반복: ${runs.toLocaleString()}회  \n기준 시드: ${baseSeed}\n\n## 해석 범위\n\n이 결과는 브라우저 조작 결과가 아니라 현재 게임의 스폰 증가식, 적 체력, 보스 시점, 카드 성장, 직업별 공격 주기와 새 증강 수치를 사용한 헤드리스 거시 모델이다. Canvas 좌표 충돌, 실제 투사체 명중, 플레이어의 순간 판단은 평균화되어 있으므로 절대적인 클리어율보다 직업·레벨 간 상대 차이를 우선해서 본다.\n\n## 자연 진행 비교\n\n| 목표 장기 | 클리어율 | 평균 생존 | 중앙 생존 | 평균 처치 | 평균 보스 | 평균 레벨 | 평균 각성 |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${naturalRows}\n\n## 새 레벨 한계효과\n\n각성 시 같은 직업의 다른 증강은 Lv.1로 고정하고 대상 증강만 Lv.0~3으로 바꿨다. 같은 시드를 레벨별로 재사용해 난수 차이를 줄였다.\n\n${marginalSections}\n\n## 자동 판독\n\n| 증강 | Lv.3 생존 변화 | Lv.3 처치 변화 | 클리어율 변화 | 레벨별 추가 처치량 |\n| --- | ---: | ---: | ---: | --- |\n${comparisonRows}\n\n- 처치 영향이 가장 큰 증강: **${largest}**\n- 처치 영향이 가장 작은 증강: **${smallest}**\n- 클리어 임계점을 40%p 이상 넘긴 증강: **${cliffs}**\n- 클리어율 급변은 최종 보스 도달 임계점의 영향일 수 있으므로 생존시간과 처치량을 함께 본다.\n\n## 평가 시 주의\n\n- 이 단계에서는 티어가 없으므로 강한 증강 자체를 오류로 판정하지 않는다.\n- Lv.1→2와 Lv.2→3의 증가폭이 지나치게 급격하거나 결과 변화가 거의 없는지를 우선 확인한다.\n- 최종 수치 결정 전 실제 플레이 5~10회로 모델의 직업별 생존시간을 보정해야 한다.\n`;

await mkdir(path.dirname(path.join(root,reportBase)),{recursive:true});
await Promise.all([writeFile(path.join(root,`${reportBase}.json`),JSON.stringify(payload,null,2)+"\n"),writeFile(path.join(root,`${reportBase}.md`),markdown)]);
console.log(`Saved ${reportBase}.md and ${reportBase}.json`);
console.table(CLASS_KEYS.map(key=>({class:CLASS_NAMES[key],...natural[key]})));
