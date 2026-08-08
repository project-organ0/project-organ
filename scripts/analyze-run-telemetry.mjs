import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args=process.argv.slice(2),input=args.find(arg=>!arg.startsWith("--"));
if(!input)throw new Error("Usage: node scripts/analyze-run-telemetry.mjs <telemetry.json> [--out=report-base] [--include-debug]");
const outArg=args.find(arg=>arg.startsWith("--out="))?.slice(6),includeDebug=args.includes("--include-debug");
const raw=JSON.parse(await readFile(path.resolve(input),"utf8")),runs=Array.isArray(raw)?raw:Array.isArray(raw.runs)?raw.runs:[raw];
const usable=runs.filter(run=>(includeDebug||!run.debug)&&(run.class||run.benchmarkTarget)),classes=["heart","brain","liver","lung","muscle"];
const runClass=run=>run.class??run.benchmarkTarget;
const avg=(items,key)=>items.length?items.reduce((sum,item)=>sum+Number(item[key]||0),0)/items.length:0;
const round=(value,digits=1)=>Number(value.toFixed(digits));
const median=values=>{if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2};
const awakeningTime=run=>run.choices?.find(choice=>choice.id?.startsWith("awaken_"))?.time??null;
const summarize=items=>({
  runs:items.length,
  awakeningRate:round(items.filter(run=>run.class).length/Math.max(1,items.length)*100),
  clearRate:round(items.filter(run=>run.result==="clear").length/Math.max(1,items.length)*100),
  avgSurvivalSeconds:round(avg(items,"survivalSeconds")),
  medianSurvivalSeconds:round(median(items.map(run=>run.survivalSeconds))),
  avgAwakeningSeconds:round(avg(items.map(run=>({value:awakeningTime(run)})).filter(item=>item.value!==null),"value")),
  avgKills:round(avg(items,"kills")),
  avgKillsPerMinute:round(items.reduce((sum,run)=>sum+run.kills/Math.max(1,run.survivalSeconds)*60,0)/Math.max(1,items.length),2),
  avgDps:round(items.reduce((sum,run)=>sum+run.damageDealt/Math.max(1,run.survivalSeconds),0)/Math.max(1,items.length),2),
  avgDamageTakenPerMinute:round(items.reduce((sum,run)=>sum+run.damageTaken/Math.max(1,run.survivalSeconds)*60,0)/Math.max(1,items.length),2),
  avgHitsPerMinute:round(items.reduce((sum,run)=>sum+run.hitsTaken/Math.max(1,run.survivalSeconds)*60,0)/Math.max(1,items.length),2),
  avgBossKills:round(avg(items,"bossKills"),2),
  avgActionsPerMinute:round(items.reduce((sum,run)=>sum+run.actionsUsed/Math.max(1,run.survivalSeconds)*60,0)/Math.max(1,items.length),2),
});
const byClass=Object.fromEntries(classes.map(key=>[key,summarize(usable.filter(run=>runClass(run)===key))]));
const payload={generatedAt:new Date().toISOString(),source:input.replaceAll("\\","/"),includeDebug,totalRuns:runs.length,usableRuns:usable.length,byClass};
const names={heart:"심장",brain:"뇌",liver:"간",lung:"폐",muscle:"근육"};
const rows=classes.map(key=>{const item=byClass[key];return`| ${names[key]} | ${item.runs} | ${item.awakeningRate}% | ${item.avgAwakeningSeconds}s | ${item.clearRate}% | ${item.avgSurvivalSeconds}s | ${item.medianSurvivalSeconds}s | ${item.avgKillsPerMinute} | ${item.avgDps} | ${item.avgDamageTakenPerMinute} | ${item.avgHitsPerMinute} | ${item.avgBossKills} |`}).join("\n");
const markdown=`# 본게임 전투 텔레메트리 분석\n\n생성: ${payload.generatedAt}  \n입력: \`${payload.source}\`  \n전체 런: ${payload.totalRuns}  \n분석 런: ${payload.usableRuns}\n\n| 목표 직업 | 런 | 각성률 | 평균 각성 | 클리어율 | 평균 생존 | 중앙 생존 | 분당 처치 | 평균 DPS | 분당 피해 | 분당 피격 | 평균 보스 |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n\n디버그 런은 기본적으로 제외한다. 미각성 자동 플레이 런은 \`benchmarkTarget\` 기준으로 집계해 각성 실패가 통계에서 사라지지 않게 한다.\n`;
if(outArg){await Promise.all([writeFile(path.resolve(`${outArg}.json`),JSON.stringify(payload,null,2)+"\n"),writeFile(path.resolve(`${outArg}.md`),markdown)])}
console.table(classes.map(key=>({class:names[key],...byClass[key]})));
if(outArg)console.log(`Saved ${outArg}.md and ${outArg}.json`);
