import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args=process.argv.slice(2),input=args.find(arg=>!arg.startsWith("--"));
if(!input)throw new Error("Usage: node scripts/analyze-run-telemetry.mjs <telemetry.json> [--out=report-base] [--include-debug]");
const outArg=args.find(arg=>arg.startsWith("--out="))?.slice(6),includeDebug=args.includes("--include-debug");
const raw=JSON.parse(await readFile(path.resolve(input),"utf8")),runs=Array.isArray(raw)?raw:Array.isArray(raw.runs)?raw.runs:[raw];
const usable=runs.filter(run=>(includeDebug||!run.debug)&&run.class),classes=["heart","brain","liver","lung","muscle"];
const avg=(items,key)=>items.length?items.reduce((sum,item)=>sum+Number(item[key]||0),0)/items.length:0;
const round=(value,digits=1)=>Number(value.toFixed(digits));
const summarize=items=>({
  runs:items.length,
  clearRate:round(items.filter(run=>run.result==="clear").length/Math.max(1,items.length)*100),
  avgSurvivalSeconds:round(avg(items,"survivalSeconds")),
  avgKills:round(avg(items,"kills")),
  avgDps:round(items.reduce((sum,run)=>sum+run.damageDealt/Math.max(1,run.survivalSeconds),0)/Math.max(1,items.length),2),
  avgDamageTakenPerMinute:round(items.reduce((sum,run)=>sum+run.damageTaken/Math.max(1,run.survivalSeconds)*60,0)/Math.max(1,items.length),2),
  avgHitsPerMinute:round(items.reduce((sum,run)=>sum+run.hitsTaken/Math.max(1,run.survivalSeconds)*60,0)/Math.max(1,items.length),2),
  avgBossKills:round(avg(items,"bossKills"),2),
  avgActionsPerMinute:round(items.reduce((sum,run)=>sum+run.actionsUsed/Math.max(1,run.survivalSeconds)*60,0)/Math.max(1,items.length),2),
});
const byClass=Object.fromEntries(classes.map(key=>[key,summarize(usable.filter(run=>run.class===key))]));
const payload={generatedAt:new Date().toISOString(),source:path.resolve(input),includeDebug,totalRuns:runs.length,usableRuns:usable.length,byClass};
const names={heart:"심장",brain:"뇌",liver:"간",lung:"폐",muscle:"근육"};
const rows=classes.map(key=>{const item=byClass[key];return`| ${names[key]} | ${item.runs} | ${item.clearRate}% | ${item.avgSurvivalSeconds}s | ${item.avgKills} | ${item.avgDps} | ${item.avgDamageTakenPerMinute} | ${item.avgHitsPerMinute} | ${item.avgBossKills} | ${item.avgActionsPerMinute} |`}).join("\n");
const markdown=`# 본게임 전투 텔레메트리 분석\n\n생성: ${payload.generatedAt}  \n입력: \`${payload.source}\`  \n전체 런: ${payload.totalRuns}  \n분석 런: ${payload.usableRuns}\n\n| 직업 | 런 | 클리어율 | 평균 생존 | 평균 처치 | 평균 DPS | 분당 피해 | 분당 피격 | 평균 보스 | 분당 액션 |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows}\n\n디버그 런은 기본적으로 제외한다. 직업이 없는 미각성 런은 직업 비교표에서 제외하지만 전체 런 수에는 포함한다.\n`;
if(outArg){await Promise.all([writeFile(path.resolve(`${outArg}.json`),JSON.stringify(payload,null,2)+"\n"),writeFile(path.resolve(`${outArg}.md`),markdown)])}
console.table(classes.map(key=>({class:names[key],...byClass[key]})));
if(outArg)console.log(`Saved ${outArg}.md and ${outArg}.json`);
