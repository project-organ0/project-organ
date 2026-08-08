"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSoundEngine } from "./game/audio";
import { OrganGlyph, SoundGlyph, FullscreenGlyph } from "./game/icons";
import type { CardKind, Choice, CoreOrgan, Difficulty, Game, MainClass, Mob, Mode, OrganKey, SkillFx } from "./game/types";

const STAGES = [
  ["0—20세 · 학교", "학생들의 식욕"],
  ["20—40세 · 회사", "끝나지 않는 업무"],
  ["40—60세 · 아파트", "생활의 무게"],
  ["60—80세 · 병원", "마지막 진료"],
];
const STAGE_LENGTH = 100;
const FIRST_CHOICE_AT = 18;
const LATER_CHOICE_AT = 22;
const BOSS_AT = 78;
const RUN_TARGET = STAGE_LENGTH * 3 + BOSS_AT;
const ORGAN_KEYS: OrganKey[] = ["뇌","심장","폐","간","근육"];
const ORGAN_META:Record<OrganKey,{icon:string,color:string}> = {
  뇌:{icon:"🧠",color:"#a49bd8"},심장:{icon:"♥",color:"#ff715b"},폐:{icon:"🫁",color:"#4ee5e1"},간:{icon:"◆",color:"#d1bc7a"},근육:{icon:"💪",color:"#d8ff3e"}
};
const CORE_META:Record<CoreOrgan,{key:OrganKey;icon:string;color:string;className:string;action:string}> = {
  heart:{key:"심장",icon:"♥",color:"#ff715b",className:"격투가",action:"PUNCH"},
  brain:{key:"뇌",icon:"🧠",color:"#a49bd8",className:"에너지술사",action:"CORE"},
  liver:{key:"간",icon:"◆",color:"#a8d43a",className:"독술사",action:"TOXIN"},
  lung:{key:"폐",icon:"🫁",color:"#4ee5e1",className:"질풍술사",action:"DASH"},
  muscle:{key:"근육",icon:"💪",color:"#d8ff3e",className:"파괴자",action:"SLAM"},
};
// 3직업 도감 데이터 (form: player-forms 시트 인덱스, question: 핵심 플레이 판단)
const CLASS_CODEX:{core:CoreOrgan;form:number;question:string;passive:string;play:string}[] = [
  {core:"heart",form:3,question:"적에게 얼마나 가까이 붙을 것인가",passive:"가까운 적을 자동으로 근접 공격하며 4타 콤보를 쌓습니다.",play:"거리를 좁혀 콤보를 유지하고 4타 충격파와 과부하 강타로 밀집한 적을 부순다."},
  {core:"brain",form:1,question:"적과 어떤 거리를 유지할 것인가",passive:"주위를 도는 에너지 코어가 스스로 적을 사격합니다.",play:"안전 거리를 유지하며 코어 수와 연쇄를 늘리고 5킬 폭주로 화력을 터뜨린다."},
  {core:"liver",form:5,question:"적을 어디로 유도할 것인가",passive:"이동 경로에 독 지대를 남겨 밟고 지난 적을 서서히 녹입니다.",play:"동선을 설계해 독 지대를 겹치고 중독된 적의 죽음으로 연쇄 폭발을 일으킨다."},
  {core:"lung",form:2,question:"얼마나 멈추지 않고 이동할 것인가",passive:"계속 이동하면 질풍 모멘텀이 차오르고 이동 방향으로 바람 칼날이 자동 발생합니다.",play:"멈추지 않고 흐르며 바람 칼날을 겹치고, SPACE 관통 대시로 대열을 가르고 돌풍을 터뜨린다."},
  {core:"muscle",form:6,question:"얼마나 많은 적을 모아 한 번에 터뜨릴 것인가",passive:"가까운 적을 느리고 넓게 강타해 밀쳐내고, 밀린 적이 서로 부딪히면 추가 피해를 받습니다.",play:"적을 뭉치게 유도하고 충전을 쌓아 SPACE 지면 강타로 무리를 한 번에 폭발시킨다."},
];
const DIFFICULTY = {
  easy: { name:"가벼움", hp:.72, speed:.88, count:.72, damage:.65 },
  normal: { name:"표준", hp:1, speed:1, count:1, damage:1 },
  hard: { name:"생존", hp:1.45, speed:1.13, count:1.28, damage:1.35 },
};
const CHEMISTRY = [
  {id:"brain_muscle",name:"뇌근 동기화",organs:["뇌","근육"] as OrganKey[],effect:"세 번째 공격이 거대한 동기화 충격탄으로 변화"},
  {id:"brain_lung",name:"기동 마법사",organs:["뇌","폐"] as OrganKey[],effect:"2단 대시 해금 · 대시할 때 사방으로 유도 세포탄 발사"},
  {id:"heart_muscle",name:"심장 버서커",organs:["심장","근육"] as OrganKey[],effect:"피격 반격 · 체력이 낮을수록 공격력 최대 45% 증가"},
  {id:"heart_lung",name:"심폐 러너",organs:["심장","폐"] as OrganKey[],effect:"계속 이동하면 가속 단계와 회복량이 상승"},
  {id:"liver_muscle",name:"독성 파이터",organs:["간","근육"] as OrganKey[],effect:"거대 충격탄이 지속 피해를 주는 독성 웅덩이 생성"},
  {id:"brain_liver",name:"신경 독성",organs:["뇌","간"] as OrganKey[],effect:"세포탄이 중독을 부여하고 처치 시 주변 적에게 전염"},
];
const HERO_GUIDE = [
  {id:"brain_muscle",role:"파괴형 포병",passive:"정밀한 두뇌와 근력을 동기화해 기본 공격의 위력을 높입니다.",skill:"동기화 충격탄",trigger:"세 번째 기본 공격이 거대한 고위력 탄환으로 변합니다.",play:"공격 속도와 투사체 수를 확보하면 충격탄 발동 횟수가 빠르게 늘어납니다."},
  {id:"brain_lung",role:"고기동 마법사",passive:"대시 보유량이 2회로 증가하고 연속 회피가 가능해집니다.",skill:"기동 마법 탄막",trigger:"대시할 때 사방으로 유도 세포탄 8발을 발사합니다.",play:"적 무리를 가로지르며 탄막을 겹치고 위험한 보스 패턴을 연속으로 회피합니다."},
  {id:"heart_muscle",role:"근접 반격 전사",passive:"체력이 낮아질수록 공격력이 최대 45%까지 증가합니다.",skill:"심장 반격",trigger:"피격되는 순간 주변 적에게 반격 충격파를 발생시킵니다.",play:"방어력을 확보하고 낮은 체력을 유지하면 높은 공격력을 안정적으로 활용할 수 있습니다."},
  {id:"heart_lung",role:"지속 기동 생존가",passive:"계속 움직이면 최대 5단계까지 이동 속도와 회복량이 상승합니다.",skill:"심폐 순환",trigger:"이동을 유지하는 동안 체력을 지속 회복하고 멈추면 단계가 빠르게 감소합니다.",play:"좁은 원을 그리며 움직여 가속을 유지하고 탄막 사이를 끊임없이 빠져나갑니다."},
  {id:"liver_muscle",role:"지역 제압 투사",passive:"근섬유 폭발과 독성 피해가 결합해 넓은 공간을 통제합니다.",skill:"독성 웅덩이",trigger:"거대 충격탄 적중 지점에 4초간 지속 피해 영역을 생성합니다.",play:"몬스터가 몰리는 이동 경로에 웅덩이를 만들고 적을 그 위로 유도합니다."},
  {id:"brain_liver",role:"연쇄 중독술사",passive:"세포탄 적중 시 대상에게 지속 독성 피해를 부여합니다.",skill:"신경 독성 전염",trigger:"중독된 적을 처치하면 반경 내 다른 적에게 중독이 전파됩니다.",play:"약한 적부터 처치해 전염을 시작하면 거대한 무리를 연쇄적으로 무너뜨릴 수 있습니다."},
];
const LIFE: Choice[][] = [
  [
    {name:"밤샘 공부",desc:"잠을 포기하고 사고 속도를 끌어올립니다.",effect:"연사 28% 증가 · 뇌 +15",cost:"최대 체력 -10 · 심장 -10",apply:g=>{g.organs.뇌+=15;g.organs.심장-=10;g.fireRate*=.72;g.maxHp-=10;g.hp=Math.min(g.hp,g.maxHp)}},
    {name:"운동부 입단",desc:"움직임 자체를 공격력으로 바꾸는 체질이 됩니다.",effect:"폐·근육 +10 · 이동 중 피해 증가",cost:"정지하면 보너스 즉시 소멸",apply:g=>{g.organs.폐+=10;g.organs.근육+=10;g.organs.뇌-=5;g.speed+=24;g.momentum+=1}},
    {name:"매점 풀코스",desc:"점심시간보다 매점 시간이 더 기다려졌습니다.",effect:"즉시 회복 · 공격 속도 증가 · 간 약화",apply:g=>{g.hp=Math.min(g.maxHp,g.hp+28);g.organs.심장+=5;g.organs.간-=8;g.fireRate*=.9}},
  ],
  [
    {name:"야근 특근",desc:"처리량은 폭증하지만 심장이 계속 대가를 냅니다.",effect:"투사체 +1 · 뇌 +15",cost:"10초마다 심장 -1",apply:g=>{g.organs.뇌+=15;g.organs.심장-=10;g.projectiles++;g.fatigue+=1}},
    {name:"회식의 제왕",desc:"쌓인 독성을 강력한 오라로 방출합니다.",effect:"독성 공격 강화 · 피해 +4",cost:"조준 흔들림 · 회복량 -25%",apply:g=>{g.organs.간-=15;g.poison+=2;g.damage+=4;g.unstableAim+=.16;g.recoveryPenalty=Math.min(.7,g.recoveryPenalty+.25)}},
    {name:"헬스장 회원권",desc:"이번에는 정말 꾸준히 다니기로 했습니다.",effect:"근육·폐 강화 · 공격력 증가",apply:g=>{g.organs.근육+=15;g.organs.폐+=5;g.damage+=7}},
  ],
  [
    {name:"배달 야식",desc:"당장의 위기를 넘기는 대신 회복 효율을 희생합니다.",effect:"즉시 체력 +45 · 피해 +8",cost:"간·폐 감소 · 이후 회복량 -20%",apply:g=>{g.hp=Math.min(g.maxHp,g.hp+45);g.damage+=8;g.organs.간-=10;g.organs.폐-=5;g.recoveryPenalty=Math.min(.7,g.recoveryPenalty+.2)}},
    {name:"건강검진",desc:"가장 위험한 장기를 찾아 집중적으로 치료합니다.",effect:"최약 장기 +22 · 방어 +4",cost:"공격 성장 없음",apply:g=>{const k=ORGAN_KEYS.reduce((a,b)=>g.organs[a]<g.organs[b]?a:b);g.organs[k]+=22;g.armor+=4}},
    {name:"주말 등산",desc:"정상에 오르니 아직은 할 만했습니다.",effect:"폐·심장 강화 · 이동 지속 회복",apply:g=>{g.organs.폐+=12;g.organs.심장+=8;g.speed+=16;g.pulse+=1}},
  ],
  [
    {name:"재활 운동",desc:"예전처럼 강하지 않아도 다시 움직입니다.",effect:"근육·심장 회복 · 대시 즉시 충전",apply:g=>{g.organs.근육+=10;g.organs.심장+=8;g.dash=0;g.dashCharges=g.maxDash;g.speed+=12}},
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
  {name:"응고 방패",desc:"혈소판이 순간적으로 단단한 방어막을 형성합니다.",effect:"방어력 +5",apply:g=>g.armor+=5},
  {name:"뇌근 동기화",desc:"판단과 힘이 같은 박자로 움직입니다.",effect:"연사·공격력 동시 강화",apply:g=>{g.fireRate*=.9;g.damage+=5}},
];
const BASIC: Choice[] = [
  {name:"세포 분열",desc:"하나의 세포탄이 둘로 갈라집니다.",effect:"투사체 +1",apply:g=>g.projectiles=Math.min(6,g.projectiles+1)},
  {name:"고밀도 핵",desc:"세포탄의 핵이 더 무거워집니다.",effect:"공격력 +5",apply:g=>g.damage+=5},
  {name:"신경 가속",desc:"다음 공격을 더 빠르게 준비합니다.",effect:"공격 속도 10% 증가",apply:g=>g.fireRate=Math.max(.18,g.fireRate*.9)},
  {name:"폐포 확장",desc:"한 번의 호흡으로 더 멀리 움직입니다.",effect:"이동 속도 +18",apply:g=>g.speed+=18},
  {name:"심실 강화",desc:"더 큰 충격을 견딜 수 있습니다.",effect:"최대 체력 +15 · 즉시 회복",apply:g=>{g.maxHp+=15;g.hp=Math.min(g.maxHp,g.hp+15)}},
  {name:"재생 인자",desc:"손상된 조직이 빠르게 회복됩니다.",effect:"체력 35 회복",apply:g=>g.hp=Math.min(g.maxHp,g.hp+35)},
  {name:"근육 수축",desc:"탄환에 물리적인 힘을 싣습니다.",effect:"공격력 +3 · 범위 충격 강화",apply:g=>{g.damage+=3;g.pulse+=1}},
  {name:"간 해독 효소",desc:"위험해진 장기의 부담을 덜어냅니다.",effect:"가장 약한 장기 +10",apply:g=>{const k=ORGAN_KEYS.reduce((a,b)=>g.organs[a]<g.organs[b]?a:b);g.organs[k]+=10}},
  {name:"세포막 경화",desc:"외부 충격을 버티는 막이 두꺼워집니다.",effect:"방어력 +3 · 최대 체력 +8",apply:g=>{g.armor+=3;g.maxHp+=8;g.hp+=8}},
];
const ORGAN_GROWTH:Choice[] = [
  {id:"organ_heart",kind:"organ",name:"심장 강화",desc:"심장이 더욱 강하게 뜁니다.",effect:"심장 레벨 +1 · Lv.3에서 격투가 각성 가능",organs:["심장"],organLevel:"heart",apply:g=>{g.organLevels.heart=Math.min(3,g.organLevels.heart+1);g.organs.심장=Math.min(100,g.organs.심장+8)}},
  {id:"organ_brain",kind:"organ",name:"신경 확장",desc:"신경망의 처리 능력이 확장됩니다.",effect:"뇌 레벨 +1 · Lv.3에서 에너지술사 각성 가능",organs:["뇌"],organLevel:"brain",apply:g=>{g.organLevels.brain=Math.min(3,g.organLevels.brain+1);g.organs.뇌=Math.min(100,g.organs.뇌+8)}},
  {id:"organ_liver",kind:"organ",name:"간 활성화",desc:"체내 독성 물질을 전투 에너지로 변환합니다.",effect:"간 레벨 +1 · Lv.3에서 독술사 각성 가능",organs:["간"],organLevel:"liver",apply:g=>{g.organLevels.liver=Math.min(3,g.organLevels.liver+1);g.organs.간=Math.min(100,g.organs.간+8)}},
  {id:"organ_lung",kind:"organ",name:"폐활량 강화",desc:"호흡이 깊어지고 몸이 바람을 다루기 시작합니다.",effect:"폐 레벨 +1 · Lv.3에서 질풍술사 각성 가능",organs:["폐"],organLevel:"lung",apply:g=>{g.organLevels.lung=Math.min(3,g.organLevels.lung+1);g.organs.폐=Math.min(100,g.organs.폐+8)}},
  {id:"organ_muscle",kind:"organ",name:"근섬유 강화",desc:"근섬유가 굵어지고 타격에 무게가 실립니다.",effect:"근육 레벨 +1 · Lv.3에서 파괴자 각성 가능",organs:["근육"],organLevel:"muscle",apply:g=>{g.organLevels.muscle=Math.min(3,g.organLevels.muscle+1);g.organs.근육=Math.min(100,g.organs.근육+8)}},
];
type CardDef={id:string;name:string;kind:CardKind;organs:OrganKey[];main?:CoreOrgan;support?:CoreOrgan;maxLevel:number;desc:string;effect:string;cost?:string;apply?:(g:Game)=>void};
const CLASS_CARDS:CardDef[]=[
  {id:"heart_adrenaline",name:"아드레날린",kind:"class",organs:["심장"],main:"heart",maxLevel:3,desc:"적에게 가까이 붙을수록 공격 속도가 증가합니다.",effect:"근거리 공격 속도 +25% · 레벨마다 범위와 속도 강화"},
  {id:"heart_shock",name:"심박 충격",kind:"class",organs:["심장"],main:"heart",maxLevel:3,desc:"연타의 마지막 공격이 주변을 밀어내는 충격파로 변합니다.",effect:"4번째 공격마다 80% 범위 피해 · Lv.3 심장 표식"},
  {id:"heart_overload",name:"과부하 연타",kind:"class",organs:["심장"],main:"heart",maxLevel:3,desc:"한 적을 계속 공격하면 강력한 일격이 발생합니다.",effect:"동일 대상 5회 타격 뒤 2.2배 피해"},
  {id:"heart_bloodflow",name:"혈류 가속",kind:"class",organs:["심장"],main:"heart",maxLevel:3,desc:"가까운 적을 쓰러뜨리면 잠시 이동 속도가 증가합니다.",effect:"근거리 처치 후 2초간 이동 속도 +20%"},
  {id:"brain_synapse",name:"시냅스 증식",kind:"class",organs:["뇌"],main:"brain",maxLevel:3,desc:"주변을 도는 에너지 코어가 하나 추가됩니다.",effect:"실제 에너지 코어 +1"},
  {id:"brain_chain",name:"연쇄 사고",kind:"class",organs:["뇌"],main:"brain",maxLevel:3,desc:"코어 공격이 근처의 적에게 튕깁니다.",effect:"연쇄 +1 · 연쇄 피해 70%"},
  {id:"brain_focus",name:"집중 사고",kind:"class",organs:["뇌"],main:"brain",maxLevel:3,desc:"코어가 강한 적을 우선적으로 공격합니다.",effect:"최고 체력 우선 · 엘리트/보스 피해 +20%"},
  {id:"brain_frenzy",name:"사고 폭주",kind:"class",organs:["뇌"],main:"brain",maxLevel:3,desc:"적을 연속으로 처치하면 모든 코어가 동시에 폭주합니다.",effect:"5킬마다 모든 코어 추가 사격"},
  {id:"liver_footprints",name:"독성 발자국",kind:"class",organs:["간"],main:"liver",maxLevel:3,desc:"더 촘촘하게 오래 남는 독 흔적을 만듭니다.",effect:"생성 간격 -30% · 지속시간 +20%"},
  {id:"liver_overlap",name:"오염 중첩",kind:"class",organs:["간"],main:"liver",maxLevel:3,desc:"같은 길을 다시 지나가면 독 지대가 강해집니다.",effect:"최대 3중첩 · 중첩마다 범위 +15%"},
  {id:"liver_rupture",name:"독성 파열",kind:"class",organs:["간"],main:"liver",maxLevel:3,desc:"중독된 적이 죽으면 주변에 독을 터뜨립니다.",effect:"중독 중첩 비례 폭발 · 주변 적 중독"},
  {id:"liver_concentrated",name:"농축 독",kind:"class",organs:["간"],main:"liver",maxLevel:3,desc:"독 지대에 오래 머문 적일수록 빠르게 중독됩니다.",effect:"지대 안에서 1초마다 독 중첩 +1"},
  {id:"lung_bladewind",name:"칼바람",kind:"class",organs:["폐"],main:"lung",maxLevel:3,desc:"일정 거리마다 이동 방향으로 바람 칼날을 날립니다.",effect:"이동 거리마다 관통 바람 칼날 발사 · 레벨마다 발사 간격 감소"},
  {id:"lung_afterimage",name:"잔상 호흡",kind:"class",organs:["폐"],main:"lung",maxLevel:3,desc:"모멘텀이 가득 찰수록 남긴 잔상이 적을 벱니다.",effect:"최대 모멘텀에서 이동 잔상이 주변 적에게 지속 피해"},
  {id:"lung_eyestorm",name:"태풍의 눈",kind:"class",organs:["폐"],main:"lung",maxLevel:3,desc:"계속 이동하면 주변에 작은 회오리가 돕니다.",effect:"이동 중 주기적으로 회오리 생성 · 레벨마다 개수 증가"},
  {id:"lung_circulation",name:"순환 가속",kind:"class",organs:["폐"],main:"lung",maxLevel:3,desc:"적을 쓰러뜨리면 숨 돌릴 틈 없이 더 빨라집니다.",effect:"처치 시 2초간 모멘텀 감소 정지 + 이동 속도 증가"},
  {id:"muscle_overcontract",name:"과잉 수축",kind:"class",organs:["근육"],main:"muscle",maxLevel:3,desc:"근수축이 폭발적으로 커집니다.",effect:"기본 강타 범위와 넉백 증가 · 레벨마다 강화"},
  {id:"muscle_chaincollide",name:"연쇄 충돌",kind:"class",organs:["근육"],main:"muscle",maxLevel:3,desc:"밀린 적이 부딪히면 충격이 터집니다.",effect:"적 충돌 시 범위 폭발 피해 · 레벨마다 폭발 확대"},
  {id:"muscle_painfuel",name:"고통 연료",kind:"class",organs:["근육"],main:"muscle",maxLevel:3,desc:"맞을수록 다음 강타가 무거워집니다.",effect:"피해를 받으면 지면 강타 충전 증가"},
  {id:"muscle_gravity",name:"중력 압박",kind:"class",organs:["근육"],main:"muscle",maxLevel:3,desc:"강타 직전 적을 끌어모아 함께 터뜨립니다.",effect:"지면 강타 전 주변 적을 짧게 끌어당김"},
];
const FUSION_CARDS:CardDef[]=[
  {id:"fusion_heart_brain",name:"뇌근 동기화",kind:"fusion",organs:["심장","뇌"],main:"heart",support:"brain",maxLevel:1,desc:"주먹과 신경 코어가 동기화됩니다.",effect:"콤보 피니시마다 추적 에너지탄 발사"},
  {id:"fusion_heart_liver",name:"독성 파이터",kind:"fusion",organs:["심장","간"],main:"heart",support:"liver",maxLevel:1,desc:"주먹에 독을 쌓고 연타의 마지막 공격으로 터뜨립니다.",effect:"근접 공격 중독 · 피니시 독 폭발"},
  {id:"fusion_brain_heart",name:"맥동 코어",kind:"fusion",organs:["뇌","심장"],main:"brain",support:"heart",maxLevel:1,desc:"심장 박동이 에너지 코어를 가속합니다.",effect:"적과 가까울수록 코어 공격 속도 최대 +35%"},
  {id:"fusion_brain_liver",name:"신경 독성",kind:"fusion",organs:["뇌","간"],main:"brain",support:"liver",maxLevel:1,desc:"코어가 중독된 적을 추적하고 독을 전염시킵니다.",effect:"중독 적 우선 타깃 · 처치 시 독 전염"},
  {id:"fusion_liver_heart",name:"독성 폭주",kind:"fusion",organs:["간","심장"],main:"liver",support:"heart",maxLevel:1,desc:"독 지대가 처치를 먹고 폭발을 충전합니다.",effect:"지대 안 3킬마다 독성 폭발"},
  {id:"fusion_liver_brain",name:"추적 독성",kind:"fusion",organs:["간","뇌"],main:"liver",support:"brain",maxLevel:1,desc:"독 지대가 스스로 적을 추적해 번집니다.",effect:"독성 코어가 적 위치에 작은 독 지대 생성"},
];
const LIFE_CARDS:CardDef[]=[
  {id:"life_night_study",name:"밤샘 공부",kind:"life",organs:["뇌"],maxLevel:1,desc:"자동 공격이 더 빠르고 더 멀리 이어집니다.",effect:"연쇄 +1 · 공격 주기 -15%",cost:"최대 체력 -15%",apply:g=>{g.chainBonus++;g.fireRate*=.85;g.maxHp*=.85;g.hp=Math.min(g.hp,g.maxHp)}},
  {id:"life_sports",name:"운동부 입단",kind:"life",organs:["심장"],maxLevel:1,desc:"근접 범위가 넓어지고 처치 후 빠르게 이동합니다.",effect:"근접 범위 +20% · 근거리 처치 이동 +15%",cost:"원거리·코어 피해 -10%",apply:g=>{g.meleeRange*=1.2;g.rangedDamageMul*=.9}},
  {id:"life_dinner",name:"회식의 제왕",kind:"life",organs:["간"],maxLevel:1,desc:"독 지대가 더욱 넓고 오래 유지됩니다.",effect:"독 범위·지속시간 +25%",cost:"회복 효과 -25%",apply:g=>{g.poisonRadiusMul*=1.25;g.poisonDurationMul*=1.25;g.recoveryPenalty=Math.min(.75,g.recoveryPenalty+.25)}},
];
const COMMON_CARDS:CardDef[]=[
  {id:"common_division",name:"세포 분열",kind:"common",organs:[],maxLevel:1,desc:"죽음에 이르면 한 번만 다시 살아납니다.",effect:"사망 시 체력 40%로 1회 부활",apply:g=>{g.reviveAvailable=true}},
  {id:"common_regen",name:"재생 인자",kind:"common",organs:[],maxLevel:1,desc:"적을 계속 처치하면 신체가 스스로 회복됩니다.",effect:"20킬마다 최대 체력의 8% 회복"},
  {id:"common_membrane",name:"세포막 강화",kind:"common",organs:[],maxLevel:1,desc:"잠시 피해를 받지 않으면 보호막이 생성됩니다.",effect:"8초 무피격 시 최대 체력 15% 보호막"},
];
const cardLevel=(g:Game,id:string)=>g.cardLevels[id]||0;
const toChoice=(d:CardDef):Choice=>({id:d.id,kind:d.kind,name:d.name,desc:d.desc,effect:d.effect,cost:d.cost,organs:d.organs,maxLevel:d.maxLevel,apply:g=>{g.cardLevels[d.id]=cardLevel(g,d.id)+1;if(!g.acquiredCards.includes(d.id))g.acquiredCards.push(d.id);d.apply?.(g)}});
const shuffled=<T,>(items:T[])=>[...items].sort(()=>Math.random()-.5);
const available=(g:Game,items:CardDef[])=>items.filter(d=>cardLevel(g,d.id)<d.maxLevel);
const eligibleFusions=(g:Game)=>FUSION_CARDS.filter(d=>d.main===g.mainClass&&d.support&&g.organLevels[d.support]>=2&&!g.acquiredCards.includes(d.id));
// 직업 카드 스킬트리: T1(각성 즉시 등장) → T2(부모 카드 보유 시 해금). 융합은 보조 장기 Lv.2에서 별도 해금.
const CARD_TREE:Record<string,{tier:number;parent?:string}> = {
  heart_adrenaline:{tier:1},heart_bloodflow:{tier:1},heart_shock:{tier:2,parent:"heart_adrenaline"},heart_overload:{tier:2,parent:"heart_bloodflow"},
  brain_synapse:{tier:1},brain_chain:{tier:1},brain_frenzy:{tier:2,parent:"brain_synapse"},brain_focus:{tier:2,parent:"brain_chain"},
  liver_footprints:{tier:1},liver_overlap:{tier:1},liver_rupture:{tier:2,parent:"liver_footprints"},liver_concentrated:{tier:2,parent:"liver_overlap"},
  lung_bladewind:{tier:1},lung_circulation:{tier:1},lung_eyestorm:{tier:2,parent:"lung_bladewind"},lung_afterimage:{tier:2,parent:"lung_circulation"},
  muscle_overcontract:{tier:1},muscle_painfuel:{tier:1},muscle_chaincollide:{tier:2,parent:"muscle_overcontract"},muscle_gravity:{tier:2,parent:"muscle_painfuel"},
};
const classCardUnlocked=(g:Game,id:string)=>{const p=CARD_TREE[id]?.parent;return !p||g.acquiredCards.includes(p)};
const weightedChoices=(g:Game):Choice[]=>{
  const fusion=eligibleFusions(g)[0];
  const pools:{w:number;c:Choice[]}[]=g.awakened
    ? [{w:45,c:available(g,CLASS_CARDS.filter(d=>d.main===g.mainClass&&classCardUnlocked(g,d.id))).map(toChoice)},{w:25,c:ORGAN_GROWTH},{w:15,c:available(g,LIFE_CARDS).map(toChoice)},{w:15,c:available(g,COMMON_CARDS).map(toChoice)}]
    : [{w:60,c:ORGAN_GROWTH},{w:20,c:available(g,LIFE_CARDS).map(toChoice)},{w:20,c:available(g,COMMON_CARDS).map(toChoice)}];
  const picks:Choice[]=fusion?[toChoice(fusion)]:[];
  while(picks.length<3){
    const usable=pools.filter(p=>p.c.length&&p.c.some(x=>!picks.some(y=>y.id===("id" in x?x.id:undefined))));if(!usable.length)break;
    let roll=Math.random()*usable.reduce((s,p)=>s+p.w,0),pool=usable[0];for(const p of usable){roll-=p.w;if(roll<=0){pool=p;break}}
    const candidates=shuffled(pool.c).filter(x=>!picks.some(y=>y.id===x.id));const raw=candidates[0];if(!raw)continue;picks.push(raw);
  }
  return picks;
};
const awakeningChoices=(organ:CoreOrgan):Choice[]=>{
  const meta=CORE_META[organ];
  return [
    {id:`awaken_${organ}`,name:`${meta.className}로 각성`,desc:`${meta.key}의 힘을 이번 생애의 주 전투 방식으로 고정합니다.`,effect:`주 직업 고정 · SPACE 액션 ${meta.action}`,organs:[meta.key],awakening:organ,apply:g=>{g.mainClass=organ;g.awakened=true;if(organ==="heart"||organ==="lung"){g.maxDash=2;g.dashCharges=2}}},
    {id:`hold_${organ}`,name:"각성 보류",desc:"Lv.3 효과만 유지하고 다른 장기의 가능성을 더 탐색합니다.",effect:"공용 에너지탄 유지 · 나중에 다시 각성 가능",organs:[meta.key],awakening:"hold",apply:g=>{if(!g.deferredAwakenings.includes(organ))g.deferredAwakenings.push(organ)}},
  ];
};
const BUILDS:Choice[] = CHEMISTRY.map(c=>({
  name:c.name,desc:`${ORGAN_META[c.organs[0]].icon} ${c.organs[0]}과 ${ORGAN_META[c.organs[1]].icon} ${c.organs[1]}이 하나의 전투 방식으로 각성합니다.`,
  effect:c.effect,organs:c.organs,chemistry:c.id,
  apply:g=>{c.organs.forEach(k=>g.organs[k]=Math.min(100,g.organs[k]+8));if(c.id==="brain_lung"){g.maxDash=2;g.dashCharges=2;g.dash=0}},
}));
const ORGAN_GUIDE = [
  {key:"뇌" as OrganKey,title:"투사체 · 조준",copy:"활성 시 추가 시냅스 탄환을 발사합니다. 위험하면 조준이 흔들립니다."},
  {key:"심장" as OrganKey,title:"생존 · 박동",copy:"활성 시 회복과 피해를 동시에 주는 심장 박동이 발생합니다."},
  {key:"폐" as OrganKey,title:"이동 · 대시",copy:"활성 시 이동 속도가 증가하고 대시에 공격 잔상이 남습니다."},
  {key:"간" as OrganKey,title:"독성 · 부작용",copy:"활성 시 주변 적을 지속 공격하는 독성 오라가 생깁니다."},
  {key:"근육" as OrganKey,title:"물리 · 충격파",copy:"활성 시 공격력이 오르고 주기적으로 거대한 폭발탄을 발사합니다."},
];
const ITEM_GUIDE = [
  ["교과서","뇌 성장"],["운동화","폐·근육 성장"],["매점빵","회복과 간 부담"],
  ["노트북","투사체 강화"],["커피","연사와 피로"],["회식 잔","독성과 간 부담"],
  ["배달 음식","대량 회복"],["검진표","약한 장기 회복"],["등산화","심폐 강화"],
  ["재활 밴드","근육 회복"],["건강식","간·심장 회복"],["명상 염주","뇌·폐 안정"],
];

function fresh(difficulty:Difficulty="normal"):Game {
  return {w:1280,h:720,worldW:2400,worldH:1600,t:0,stage:0,stageT:0,hp:100,maxHp:100,x:1200,y:800,vx:0,vy:0,touchX:0,touchY:0,dash:0,dashCharges:1,maxDash:1,inv:0,fire:0,kills:0,
    organs:{뇌:55,심장:55,폐:55,간:55,근육:55},mobs:[],shots:[],parts:[],drops:[],warnings:[],fields:[],keys:new Set(),choices:[],augments:[],
    level:1,xp:0,nextXp:12,paused:false,damage:14,armor:3,fireRate:.42,speed:210,projectiles:1,poison:0,pulse:0,runner:0,
    bossSpawned:false,choiceDone:false,augmentDone:false,last:0,shake:0,difficulty,lastHeart:-1,effect:"",effectT:0,shotCount:0,hudAt:0,chemistries:[],dashFx:0,castFx:0,castAngle:0,heartFx:0,organLevels:{heart:0,brain:0,liver:0,lung:0,muscle:0},mainClass:null,awakened:false,deferredAwakenings:[],cardLevels:{},acquiredCards:[],meleeCombo:0,moveBuff:0,poisonTrailDistance:0,lastTrailX:1200,lastTrailY:800,toxicCoreCooldown:0,killsSinceRegen:0,noDamage:0,shield:0,reviveAvailable:false,meleeRange:115,rangedDamageMul:1,chainBonus:0,poisonRadiusMul:1,poisonDurationMul:1,brainVolley:0,fatigue:0,unstableAim:0,recoveryPenalty:0,momentum:0,bossWeakTarget:null,lastFatigue:0,skillFx:[],debug:false,invuln:false,galeMomentum:0,windTrailDist:0,galeKillLock:0,impactCharge:0};
}
// 직업 전용 스킬 이펙트를 큐에 넣는다. dur 동안 grow 배율까지 확대되며 알파가 사라진다.
function pushSkill(g:Game,sheet:CoreOrgan,index:number,x:number,y:number,size:number,dur:number,opts:{rot?:number;spin?:number;grow?:number}={}){
  g.skillFx.push({sheet,index,x,y,size,life:dur,max:dur,rot:opts.rot??0,spin:opts.spin??0,grow:opts.grow??1});
  if(g.skillFx.length>48)g.skillFx=g.skillFx.slice(-48);
}
function sendGameLabEvent(eventName:string,metadata:Record<string,unknown>={}){if(typeof window!=="undefined"&&window.opener)window.opener.postMessage({source:"game-lab-game",eventName,metadata},"*")}
// 한글 조사 선택: 마지막 글자 받침 유무로 판단
const hasBatchim=(s:string)=>{if(!s)return false;const c=s.charCodeAt(s.length-1);return c>=0xac00&&c<=0xd7a3&&(c-0xac00)%28!==0};
const josa=(s:string,withBatchim:string,noBatchim:string)=>hasBatchim(s)?withBatchim:noBatchim;

export default function OrganGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const joystick = useRef<HTMLDivElement>(null);
  const touchPointer = useRef<number|null>(null);
  const game = useRef<Game>(fresh());
  const sound = useRef<ReturnType<typeof createSoundEngine>|null>(null);
  const raf = useRef(0);
  const [mode,setMode]=useState<Mode>("start");
  const [hud,setHud]=useState({hp:100,max:100,t:0,stage:0,organs:game.current.organs,organLevels:{heart:0,brain:0,liver:0,lung:0,muscle:0},mainClass:null as MainClass,level:1,xp:0,nextXp:12,loot:"",effect:"",chemistries:[] as string[],dashCharges:1,maxDash:1,armor:3});
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [isMuted,setIsMuted]=useState(false);
  const [menuSection,setMenuSection]=useState<"home"|"heroes"|"organs"|"items"|"archive">("home");
  const [selectedHero,setSelectedHero]=useState<CoreOrgan>("heart");
  const [foundFusions,setFoundFusions]=useState<string[]>([]);
  const [stick,setStick]=useState({x:0,y:0});
  const [cards,setCards]=useState<Choice[]>([]);
  const [selectedCard,setSelectedCard]=useState(0);
  const [choiceType,setChoiceType]=useState<"생활 선택"|"세포 진화"|"빌드 각성"|"전투 증강"|"장기 각성">("생활 선택");
  const [report,setReport]=useState({win:false,kills:0,t:0,organs:game.current.organs,choices:[] as string[],augments:[] as string[],mainClass:null as MainClass,fusions:[] as string[]});
  const [archive,setArchive]=useState<{gene:OrganKey|null;chemistries:string[];bestKills:number;bestTime:number}>({gene:null,chemistries:[],bestKills:0,bestTime:0});
  const orientationPaused=useRef(false);
  const runNumber=useRef(0);
  const runStartedAt=useRef(0);
  const progressMilestones=useRef(new Set<number>());

  useEffect(()=>{
    const gene=localStorage.getItem("organ-gene") as OrganKey|null;
    setArchive({
      gene:gene&&ORGAN_KEYS.includes(gene)?gene:null,
      chemistries:JSON.parse(localStorage.getItem("organ-chemistry")||"[]") as string[],
      bestKills:Number(localStorage.getItem("organ-best-kills")||0),
      bestTime:Number(localStorage.getItem("organ-best-time")||0),
    });
    setFoundFusions(JSON.parse(localStorage.getItem("organ-fusions")||"[]") as string[]);
  },[]);

  useEffect(()=>{
    const query=matchMedia("(pointer: coarse) and (orientation: portrait)");
    const sync=()=>{
      if(query.matches&&mode==="play"){
        game.current.paused=true;
        sound.current?.pauseMusic();
        orientationPaused.current=true;
      }else if(!query.matches&&orientationPaused.current&&mode==="play"){
        orientationPaused.current=false;
        game.current.last=performance.now();
        game.current.paused=false;
        sound.current?.resumeMusic();
      }
    };
    sync();query.addEventListener("change",sync);return()=>query.removeEventListener("change",sync);
  },[mode]);

  const openChoice=useCallback((type:"생활 선택"|"세포 진화"|"빌드 각성"|"전투 증강"|"장기 각성", picks:Choice[])=>{
    const g=game.current;
    sendGameLabEvent("game_choice_shown",{runNumber:runNumber.current,choiceType:type,elapsedSeconds:Math.round(g.t),stage:g.stage+1,level:g.level});
    g.paused=true; setChoiceType(type); setCards(picks); setSelectedCard(0); setMode("choice");
  },[]);

  const endGame=useCallback((win:boolean)=>{
    const g=game.current; g.paused=true;
    sound.current?.play(win?"win":"lose");
    sound.current?.stopMusic();
    const organs={...g.organs}; ORGAN_KEYS.forEach(k=>organs[k]=Math.max(0,Math.min(100,Math.round(organs[k]))));
    const fusions=FUSION_CARDS.filter(f=>g.acquiredCards.includes(f.id)).map(f=>f.name);
    setReport({win,kills:g.kills,t:g.t,organs,choices:[...g.choices],augments:[...g.augments],mainClass:g.mainClass,fusions});
    const strongest=ORGAN_KEYS.reduce((a,b)=>organs[a]>organs[b]?a:b);
    localStorage.setItem("organ-gene",strongest);
    const bestKills=Math.max(g.kills,Number(localStorage.getItem("organ-best-kills")||0));
    const bestTime=Math.max(g.t,Number(localStorage.getItem("organ-best-time")||0));
    localStorage.setItem("organ-best-kills",String(bestKills));
    localStorage.setItem("organ-best-time",String(bestTime));
    setArchive(old=>({...old,gene:strongest,bestKills,bestTime}));
    sendGameLabEvent("game_run_ended",{runNumber:runNumber.current,endReason:win?"clear":"fail",durationMs:Date.now()-runStartedAt.current,progress:Math.min(1,g.t/RUN_TARGET),score:g.kills,kills:g.kills,stage:g.stage+1,level:g.level,quitPoint:`stage_${g.stage+1}_${Math.round(g.stageT)}s`});
    if(win)sendGameLabEvent("game_completed",{runNumber:runNumber.current,score:g.kills});
    setMode("report");
  },[]);

  const start=useCallback((difficulty:Difficulty="normal")=>{
    sound.current??=createSoundEngine();sound.current.setMuted(isMuted);sound.current.play("start");sound.current.startMusic();
    const g=fresh(difficulty); const gene=localStorage.getItem("organ-gene") as OrganKey|null;
    if(gene&&ORGAN_KEYS.includes(gene)) g.organs[gene]+=8;
    // 개발용 빠른 검증 모드: /?debug=heart|brain|liver (&fusion=<보조장기> &common=1 &life=1)
    const dbg=new URLSearchParams(window.location.search).get("debug") as CoreOrgan|null;
    if(dbg&&(["heart","brain","liver","lung","muscle"] as CoreOrgan[]).includes(dbg)){
      const params=new URLSearchParams(window.location.search);
      g.debug=true;g.organLevels[dbg]=3;g.mainClass=dbg;g.awakened=true;if(dbg==="heart"||dbg==="lung"){g.maxDash=2;g.dashCharges=2}
      for(const c of CLASS_CARDS)if(c.main===dbg){g.cardLevels[c.id]=c.maxLevel;g.acquiredCards.push(c.id)}
      const fus=params.get("fusion") as CoreOrgan|null;
      if((fus==="heart"||fus==="brain"||fus==="liver")&&fus!==dbg){g.organLevels[fus]=2;const f=FUSION_CARDS.find(d=>d.main===dbg&&d.support===fus);if(f){g.cardLevels[f.id]=1;g.acquiredCards.push(f.id)}}
      if(params.get("common")==="1")for(const c of COMMON_CARDS){g.cardLevels[c.id]=1;g.acquiredCards.push(c.id);c.apply?.(g)}
      if(params.get("life")==="1")for(const c of LIFE_CARDS){g.cardLevels[c.id]=1;g.acquiredCards.push(c.id);c.apply?.(g)}
      g.effect=`[debug] ${CORE_META[dbg].className} 각성 · B 보스 · N 잡몹 · K 정리 · H 회복 · I 무적 · G 결과`;g.effectT=6;
    }
    runNumber.current+=1;runStartedAt.current=Date.now();progressMilestones.current.clear();if(runNumber.current>1)sendGameLabEvent("game_restarted",{runNumber:runNumber.current});sendGameLabEvent("game_run_started",{runNumber:runNumber.current,difficulty});
    game.current=g; setHud({hp:g.hp,max:g.maxHp,t:0,stage:0,organs:{...g.organs},organLevels:{...g.organLevels},mainClass:g.mainClass,level:1,xp:0,nextXp:g.nextXp,loot:"",effect:"",chemistries:[],dashCharges:g.dashCharges,maxDash:g.maxDash,armor:g.armor}); setMode("play");
  },[isMuted]);

  const toggleFullscreen=useCallback(async()=>{
    try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}
  },[]);
  useEffect(()=>{const sync=()=>setIsFullscreen(Boolean(document.fullscreenElement));document.addEventListener("fullscreenchange",sync);return()=>document.removeEventListener("fullscreenchange",sync)},[]);

  const dashNow=useCallback(()=>{
    if(mode!=="play")return;const g=game.current;if(g.dashCharges<=0)return;
    let dx=(g.keys.has("KeyD")?1:0)-(g.keys.has("KeyA")?1:0)+g.touchX,dy=(g.keys.has("KeyS")?1:0)-(g.keys.has("KeyW")?1:0)+g.touchY;
    if(!dx&&!dy){dx=g.vx;dy=g.vy}const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;if(!dx&&!dy)dy=1;
    const active=g.mainClass;g.dashCharges--;if(g.dash<=0)g.dash=1.55;
    if(active==="heart"){
      g.vx=dx*690;g.vy=dy*690;g.inv=.3;g.dashFx=.34;g.heartFx=.42;g.shake=13;
      for(const m of g.mobs){const tx=m.x-g.x,ty=m.y-g.y,d=Math.hypot(tx,ty),facing=(tx*dx+ty*dy)/Math.max(1,d);if(d<155&&facing>.25){m.hp-=g.damage*2.1;m.hit=.12}}
      pushSkill(g,"heart",5,g.x+dx*40,g.y+dy*40,150,.36,{rot:Math.atan2(dy,dx),grow:1.6});
      g.effect="심장 액션 · 돌진 펀치";g.effectT=1;sound.current?.play("hit");
    }else if(active==="brain"){
      const targets=[...g.mobs].sort((a,b)=>Math.hypot(a.x-g.x,a.y-g.y)-Math.hypot(b.x-g.x,b.y-g.y)).slice(0,7);
      targets.forEach((m,i)=>{const a=Math.atan2(m.y-g.y,m.x-g.x)+(i%2?-.035:.035);g.shots.push({x:g.x,y:g.y,vx:Math.cos(a)*650,vy:Math.sin(a)*650,life:1.4,r:7})});
      pushSkill(g,"brain",5,g.x,g.y,170,.45,{rot:Math.atan2(dy,dx),grow:1.7});
      g.castFx=.3;g.castAngle=Math.atan2(dy,dx);g.shake=6;g.effect="뇌 액션 · 코어 집중 사격";g.effectT=1;sound.current?.play("shot");
    }else if(active==="liver"){
      g.fields.push({x:g.x,y:g.y,r:135*g.poisonRadiusMul,life:5.2*g.poisonDurationMul,stack:1,kills:0,tick:0});g.fields=g.fields.slice(-30);pushSkill(g,"liver",3,g.x,g.y,190,.5,{grow:1.6});g.shake=8;g.effect="간 액션 · 독성 영역 점화";g.effectT=1;sound.current?.play("heart");
    }else if(active==="lung"){
      g.vx=dx*940;g.vy=dy*940;g.inv=.34;g.dashFx=.4;g.galeMomentum=3.5;g.shake=7;
      const gx=g.x+dx*185,gy=g.y+dy*185;
      for(const m of g.mobs){const tx=m.x-g.x,ty=m.y-g.y,d=Math.hypot(tx,ty),facing=(tx*dx+ty*dy)/Math.max(1,d);if(d<210&&facing>.15){m.hp-=g.damage*1.8;m.hit=.12;const gd=Math.hypot(m.x-gx,m.y-gy)||1;m.kbX+=(m.x-gx)/gd*230;m.kbY+=(m.y-gy)/gd*230}}
      pushSkill(g,"lung",3,g.x+dx*60,g.y+dy*60,150,.34,{rot:Math.atan2(dy,dx),grow:1.7});pushSkill(g,"lung",4,gx,gy,155,.5,{grow:1.9});
      g.effect="폐 액션 · 관통 대시 · 돌풍";g.effectT=1;sound.current?.play("dash");
    }else if(active==="muscle"){
      const power=g.impactCharge,radius=145+power*165,dmg=g.damage*(1.6+power*3.2),kb=340+power*380;
      if(cardLevel(g,"muscle_gravity")){for(const m of g.mobs){const d=Math.hypot(m.x-g.x,m.y-g.y);if(d<radius*1.5&&d>1){m.x+=(g.x-m.x)/d*Math.min(d,80);m.y+=(g.y-m.y)/d*Math.min(d,80)}}}
      for(const m of g.mobs){const d=Math.hypot(m.x-g.x,m.y-g.y);if(d<radius+m.r){m.hp-=dmg;m.hit=.14;const nx=(m.x-g.x)/(d||1),ny=(m.y-g.y)/(d||1);m.kbX+=nx*kb;m.kbY+=ny*kb}}
      g.impactCharge=0;g.shake=10+power*12;pushSkill(g,"muscle",5,g.x,g.y,radius*2,.55,{grow:1.5});pushSkill(g,"muscle",7,g.x,g.y,radius*1.3,.4,{grow:1.6});
      g.effect=`근육 액션 · 지면 강타 ${Math.round(power*100)}%`;g.effectT=1;sound.current?.play("boss");
    }else{
      g.vx=dx*760;g.vy=dy*760;g.inv=.28;g.dashFx=.34;g.shake=7;sound.current?.play("dash");
    }
  },[mode]);

  const moveStick=useCallback((e:React.PointerEvent<HTMLDivElement>)=>{
    if(touchPointer.current!==null&&touchPointer.current!==e.pointerId)return;
    touchPointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);
    const r=joystick.current!.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),limit=r.width*.34,n=Math.hypot(dx,dy)||1,scale=Math.min(1,limit/n);
    const px=dx*scale,py=dy*scale,x=px/limit,y=py/limit;game.current.touchX=x;game.current.touchY=y;setStick({x:px,y:py});
  },[]);
  const releaseStick=useCallback(()=>{touchPointer.current=null;game.current.touchX=0;game.current.touchY=0;setStick({x:0,y:0})},[]);

  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      if(["KeyW","KeyA","KeyS","KeyD","Space","Escape"].includes(e.code))e.preventDefault();
      if(e.code==="KeyF"){e.preventDefault();void toggleFullscreen();return}
      if(e.code==="Escape"&&mode==="play"){game.current.paused=true;sound.current?.pauseMusic();setMode("pause");return}
      if(e.code==="Escape"&&mode==="pause"){game.current.paused=false;game.current.last=performance.now();sound.current?.resumeMusic();setMode("play");return}
      game.current.keys.add(e.code);
      if(e.code==="Space"&&!e.repeat)dashNow();
    };
    const up=(e:KeyboardEvent)=>game.current.keys.delete(e.code);
    addEventListener("keydown",down);addEventListener("keyup",up);return()=>{removeEventListener("keydown",down);removeEventListener("keyup",up)};
  },[mode,toggleFullscreen,dashNow]);

  useEffect(()=>{
    const c=canvas.current;if(!c)return;const ctx=c.getContext("2d")!,coarse=matchMedia("(pointer: coarse)").matches;
    const stageArt=["school","company","apartment","hospital"].map(name=>{const img=new Image();img.src=`/art/${name}-walk.png`;return img});
    const stageMaps=["school","company","apartment","hospital"].map(name=>{const img=new Image();img.src=`/art/maps/${name}.png`;return img});
    const itemArt=new Image();itemArt.src="/art/items.png";
    const playerArt=new Image();playerArt.src="/art/player-forms-v2-clean.png";
    const projectileArt=new Image();projectileArt.src="/art/projectiles.png";
    const vfxArt=new Image();vfxArt.src="/art/player-vfx.png";
    const heartSkillArt=new Image();heartSkillArt.src="/art/vfx/heart-skills-v1.png";
    const brainSkillArt=new Image();brainSkillArt.src="/art/vfx/brain-skills-v1.png";
    const liverSkillArt=new Image();liverSkillArt.src="/art/vfx/liver-skills-v1.png";
    const lungSkillArt=new Image();lungSkillArt.src="/art/vfx/lung-skills-v1.png";
    const muscleSkillArt=new Image();muscleSkillArt.src="/art/vfx/muscle-skills-v1.png";
    const skillSheets:Record<CoreOrgan,HTMLImageElement>={heart:heartSkillArt,brain:brainSkillArt,liver:liverSkillArt,lung:lungSkillArt,muscle:muscleSkillArt};
    const drawEnvironment=(g:Game,camX:number,camY:number)=>{
      const map=stageMaps[g.stage];
      ctx.fillStyle=["#243a35","#30383d","#3c3931","#d9e4df"][g.stage];
      ctx.fillRect(camX,camY,g.w,g.h);
      if(map.complete&&map.naturalWidth){
        const srcX=camX/g.worldW*map.naturalWidth,srcY=camY/g.worldH*map.naturalHeight;
        ctx.drawImage(map,srcX,srcY,g.w/g.worldW*map.naturalWidth,g.h/g.worldH*map.naturalHeight,camX,camY,g.w,g.h);
      }
    };
    const spawn=(g:Game,boss=false)=>{
      const angle=Math.random()*Math.PI*2,distance=Math.max(g.w,g.h)*(.62+Math.random()*.2);
      const edge=boss?96:36;
      const x=Math.max(edge,Math.min(g.worldW-edge,g.x+Math.cos(angle)*distance));
      const y=Math.max(edge,Math.min(g.worldH-edge,g.y+Math.sin(angle)*distance));
      const diff=DIFFICULTY[g.difficulty],base=(20+g.stage*12+g.t*.035)*diff.hp;
      g.mobs.push({x,y,r:(boss?(g.stage===3?52:38):10+Math.random()*8)*(coarse ? .8 : 1),hp:boss?base*18:base,max:boss?base*18:base,speed:(boss?58:65+Math.random()*44+g.stage*8)*diff.speed,boss,elite:boss||Math.random()<.08+g.stage*.025,kind:Math.floor(Math.random()*3),hit:0,skill:1.5+Math.random()*3,cast:0,charge:0,aimX:x,aimY:y,toxin:0,poisonStacks:0,poisonTick:0,overloadHits:0,heartMark:0,kbX:0,kbY:0,collideCd:0});
    };
    const burst=(g:Game,x:number,y:number,color:string,n=7)=>{for(let i=0;i<n;i++){const a=Math.random()*6.28,s=40+Math.random()*150;g.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.35,color})}};
    const loop=(now:number)=>{
      const g=game.current;const dt=Math.min(.033,(now-(g.last||now))/1000);g.last=now;
      if(g.debug&&typeof window!=="undefined")(window as unknown as {__og?:Game}).__og=g;
      if(!g.paused&&mode==="play"){
        g.t+=dt;g.stageT+=dt;g.dash-=dt;g.inv-=dt;g.fire-=dt;g.effectT-=dt;g.dashFx-=dt;g.castFx-=dt;g.heartFx-=dt;g.moveBuff-=dt;g.toxicCoreCooldown-=dt;g.noDamage+=dt;g.shake=Math.max(0,g.shake-dt*30);
        for(const milestone of [10,30,60,120,180,300])if(g.t>=milestone&&!progressMilestones.current.has(milestone)){
          progressMilestones.current.add(milestone);
          sendGameLabEvent("game_progress",{runNumber:runNumber.current,checkpoint:`${milestone}s`,elapsedSeconds:milestone,stage:g.stage+1,level:g.level,kills:g.kills,hpPercent:Math.round(g.hp/g.maxHp*100),choices:g.choices.length,chemistries:g.chemistries.length});
        }
        if(g.dashCharges<g.maxDash&&g.dash<=0){g.dashCharges++;g.dash=g.dashCharges<g.maxDash?1.55:0}
        const targetStage=Math.min(3,Math.floor(g.t/STAGE_LENGTH));
        if(targetStage!==g.stage){g.stage=targetStage;g.stageT=0;g.bossSpawned=false;g.choiceDone=false;g.augmentDone=false;ORGAN_KEYS.forEach(k=>g.organs[k]-=3+targetStage);sendGameLabEvent("game_stage_reached",{runNumber:runNumber.current,stage:targetStage+1,elapsedSeconds:Math.round(g.t),kills:g.kills,level:g.level})}
        if(!g.choiceDone&&g.stageT>(g.stage===0?FIRST_CHOICE_AT:LATER_CHOICE_AT)){g.choiceDone=true;const life=available(g,LIFE_CARDS);openChoice("생활 선택",(life.length?shuffled(life).slice(0,3).map(toChoice):weightedChoices(g)));}
        if(!g.bossSpawned&&g.stageT>BOSS_AT){g.bossSpawned=true;if(g.stage===3)g.bossWeakTarget=ORGAN_KEYS.reduce((a,b)=>g.organs[a]<g.organs[b]?a:b);spawn(g,true);sound.current?.play("boss");g.effect=g.bossWeakTarget?`노화가 ${g.bossWeakTarget}을 노립니다`:`${STAGES[g.stage][1]} 등장`;g.effectT=2.8;sendGameLabEvent("game_boss_reached",{runNumber:runNumber.current,stage:g.stage+1,elapsedSeconds:Math.round(g.t),kills:g.kills,level:g.level,weakTarget:g.bossWeakTarget})}
        if(g.t>=480){const boss=g.mobs.find(m=>m.boss);if(!boss)spawn(g,true)}
        const dx=(g.keys.has("KeyD")?1:0)-(g.keys.has("KeyA")?1:0)+g.touchX,dy=(g.keys.has("KeyS")?1:0)-(g.keys.has("KeyW")?1:0)+g.touchY,n=Math.hypot(dx,dy)||1;
        const moving=Boolean(dx||dy);
        const moveSpeed=g.speed*(g.moveBuff>0?1.2:1)*(g.mainClass==="lung"?1+g.galeMomentum*.08:1);
        if(g.inv<=.12){const power=Math.min(1,n);g.vx=dx/n*moveSpeed*power;g.vy=dy/n*moveSpeed*power}
        g.x=Math.max(18,Math.min(g.worldW-18,g.x+g.vx*dt));g.y=Math.max(18,Math.min(g.worldH-18,g.y+g.vy*dt));
        if(g.mainClass==="liver"&&moving){
          const moved=Math.hypot(g.x-g.lastTrailX,g.y-g.lastTrailY);g.poisonTrailDistance+=moved;g.lastTrailX=g.x;g.lastTrailY=g.y;
          const interval=cardLevel(g,"liver_footprints")?58*Math.pow(.82,cardLevel(g,"liver_footprints")-1):82;
          if(g.poisonTrailDistance>=interval){g.poisonTrailDistance=0;const overlap=cardLevel(g,"liver_overlap")?g.fields.find(f=>Math.hypot(f.x-g.x,f.y-g.y)<f.r*.58):undefined;if(overlap){overlap.stack=Math.min(3,overlap.stack+1);overlap.r*=1.15;overlap.life=Math.max(overlap.life,4.8*g.poisonDurationMul);g.effect=`오염 중첩 · ${overlap.stack}단계`;g.effectT=.7}else g.fields.push({x:g.x,y:g.y,r:74*g.poisonRadiusMul,life:(4.8+(cardLevel(g,"liver_footprints")*.9))*g.poisonDurationMul,stack:1,kills:0,tick:0});g.fields=g.fields.slice(-36);pushSkill(g,"liver",0,g.x,g.y,52,.45,{rot:Math.atan2(g.vy,g.vx),grow:1.1})}
        }else{g.lastTrailX=g.x;g.lastTrailY=g.y}
        if(g.mainClass==="lung"){
          g.galeKillLock-=dt;
          if(moving)g.galeMomentum=Math.min(3.5,g.galeMomentum+dt*1.5);
          else if(g.galeKillLock<=0)g.galeMomentum=Math.max(0,g.galeMomentum-dt*3);
          const bw=cardLevel(g,"lung_bladewind");
          if(bw&&moving){g.windTrailDist+=Math.hypot(g.vx,g.vy)*dt;const iv=95*Math.pow(.78,bw-1);if(g.windTrailDist>=iv){g.windTrailDist=0;const a=Math.atan2(g.vy,g.vx);g.shots.push({x:g.x,y:g.y,vx:Math.cos(a)*710,vy:Math.sin(a)*710,life:.6,r:13,damageMul:1.1+g.galeMomentum*.15});pushSkill(g,"lung",0,g.x,g.y,60,.3,{rot:a,grow:1.4})}}
          if(cardLevel(g,"lung_afterimage")&&moving&&g.galeMomentum>=3.2){for(const m of g.mobs)if(Math.hypot(m.x-g.x,m.y-g.y)<72)m.hp-=(6+cardLevel(g,"lung_afterimage")*3)*dt;if(Math.random()<dt*22)pushSkill(g,"lung",2,g.x-g.vx*.03,g.y-g.vy*.03,54,.3,{rot:Math.atan2(g.vy,g.vx),grow:1.1})}
          if(cardLevel(g,"lung_eyestorm")&&moving&&Math.floor(g.t*2)!==Math.floor((g.t-dt)*2)){const cnt=cardLevel(g,"lung_eyestorm");for(let i=0;i<cnt;i++){const a=Math.random()*6.28,r=58+Math.random()*44,wx=g.x+Math.cos(a)*r,wy=g.y+Math.sin(a)*r;for(const m of g.mobs)if(Math.hypot(m.x-wx,m.y-wy)<52)m.hp-=g.damage*.5;pushSkill(g,"lung",5,wx,wy,72,.4,{spin:6,grow:1.3})}}
        }
        if(g.mainClass==="muscle"){const near=g.mobs.filter(m=>Math.hypot(m.x-g.x,m.y-g.y)<240).length;g.impactCharge=Math.min(1,g.impactCharge+near*dt*.075)}
        const diff=DIFFICULTY[g.difficulty],cap=Math.min(coarse?140:190,Math.round((26+g.stage*18+Math.floor(g.stageT/3))*diff.count*(coarse ? .78 : 1)));
        const takeDamage=(raw:number)=>raw*100/(100+g.armor*5);
        const hurtPlayer=(raw:number)=>{if(g.invuln)return false;let amount=takeDamage(raw);g.noDamage=0;if(g.mainClass==="muscle"){const pf=cardLevel(g,"muscle_painfuel");if(pf)g.impactCharge=Math.min(1,g.impactCharge+.05*pf)}if(g.shield>0){const blocked=Math.min(g.shield,amount);g.shield-=blocked;amount-=blocked}g.hp-=amount;if(g.hp<=0&&g.reviveAvailable){g.reviveAvailable=false;g.hp=g.maxHp*.4;g.inv=2;g.shield=g.maxHp*.15;g.heartFx=.8;g.effect="세포 분열 · 40% 체력으로 부활";g.effectT=3;sound.current?.play("level");return false}if(g.hp<=0){endGame(false);return true}return false};
        if(cardLevel(g,"common_membrane")&&g.noDamage>=8&&g.shield<=0){g.shield=g.maxHp*.15;g.noDamage=0;g.effect="세포막 강화 · 보호막 생성";g.effectT=1.2;burst(g,g.x,g.y,"#4ee5e1",18)}
        if(g.mobs.filter(m=>!m.boss).length<cap&&Math.random()<dt*(5+g.stage*3+g.stageT*.05)*diff.count)spawn(g);
        let nearest:Mob|undefined,nd=Infinity;for(const m of g.mobs){const d=(m.x-g.x)**2+(m.y-g.y)**2;if(d<nd){nd=d;nearest=m}}
        if(g.fire<=0&&nearest){
          const shootAt=(target:Mob,opts:{damageMul?:number;chain?:number;poison?:number;core?:boolean;angle?:number}={})=>{const a=opts.angle??Math.atan2(target.y-g.y,target.x-g.x);g.shots.push({x:g.x,y:g.y,vx:Math.cos(a)*580,vy:Math.sin(a)*580,life:1.6,r:opts.core?7:5,damageMul:opts.damageMul??1,chain:opts.chain??0,poison:opts.poison??0,core:opts.core})};
          g.shotCount++;
          if(g.mainClass==="heart"){
            const inRange=g.mobs.filter(m=>Math.hypot(m.x-g.x,m.y-g.y)<=g.meleeRange+m.r).sort((a,b)=>Math.hypot(a.x-g.x,a.y-g.y)-Math.hypot(b.x-g.x,b.y-g.y))[0];
            const adrenaline=cardLevel(g,"heart_adrenaline"),nearby=g.mobs.some(m=>Math.hypot(m.x-g.x,m.y-g.y)<g.meleeRange*1.8);g.fire=g.fireRate*(nearby&&adrenaline?Math.max(.5,.75-adrenaline*.05):1);
            if(inRange){g.meleeCombo=(g.meleeCombo%4)+1;inRange.overloadHits++;let damage=g.damage*1.18*(1+cardLevel(g,"heart_overload")*.08);if(cardLevel(g,"heart_overload")&&inRange.overloadHits>=5){damage*=2.2;inRange.overloadHits=0;pushSkill(g,"heart",4,inRange.x,inRange.y,120,.4,{grow:1.6});g.effect="과부하 연타 · 2.2×";g.effectT=.8}if(inRange.heartMark>0){damage*=1.3;inRange.heartMark=0;pushSkill(g,"heart",6,inRange.x,inRange.y,64,.35,{grow:1.3})}inRange.hp-=damage;inRange.hit=.12;g.heartFx=.2;sound.current?.play("hit");burst(g,inRange.x,inRange.y,"#ff715b",6);if(g.meleeCombo<4)pushSkill(g,"heart",g.meleeCombo-1,inRange.x,inRange.y,72,.2,{rot:Math.atan2(inRange.y-g.y,inRange.x-g.x),grow:1.2});
              if(cardLevel(g,"fusion_heart_liver")){inRange.poisonStacks=Math.min(8,inRange.poisonStacks+1);inRange.toxin=4}
              if(g.meleeCombo===4){const shock=cardLevel(g,"heart_shock");pushSkill(g,"heart",3,inRange.x,inRange.y,shock?185:120,.5,{grow:1.7});if(shock){const radius=g.meleeRange*1.8*(1+(shock-1)*.25);for(const m of g.mobs){const d=Math.hypot(m.x-inRange.x,m.y-inRange.y);if(d<radius){m.hp-=g.damage*.8*(1+(shock-1)*.15);if(d>1){m.x+=(m.x-inRange.x)/d*18;m.y+=(m.y-inRange.y)/d*18}if(shock>=3)m.heartMark=3}}g.heartFx=.58;g.shake=9;burst(g,inRange.x,inRange.y,"#ff715b",24)}if(cardLevel(g,"fusion_heart_liver")&&inRange.poisonStacks){const blast=g.damage*.42*inRange.poisonStacks;for(const m of g.mobs)if(Math.hypot(m.x-inRange.x,m.y-inRange.y)<120)m.hp-=blast;inRange.poisonStacks=0;burst(g,inRange.x,inRange.y,"#a8d43a",20)}if(cardLevel(g,"fusion_heart_brain"))shootAt(inRange,{damageMul:.65,chain:g.chainBonus,core:true})}
            }
          }else if(g.mainClass==="brain"){
            const coreCount=2+cardLevel(g,"brain_synapse"),close=g.mobs.some(m=>Math.hypot(m.x-g.x,m.y-g.y)<180),speedBoost=(cardLevel(g,"fusion_brain_heart")&&close)?0.35:0;
            g.fire=g.fireRate*1.12/(1+speedBoost);const focus=cardLevel(g,"brain_focus"),toxic=cardLevel(g,"fusion_brain_liver");const targets=[...g.mobs].sort((a,b)=>toxic&&a.poisonStacks!==b.poisonStacks?b.poisonStacks-a.poisonStacks:focus?b.hp-a.hp:Math.hypot(a.x-g.x,a.y-g.y)-Math.hypot(b.x-g.x,b.y-g.y));for(let i=0;i<coreCount;i++){const target=targets[i%Math.max(1,targets.length)]||nearest;shootAt(target,{damageMul:focus&&(target.elite||target.boss)?1.0:.82,chain:cardLevel(g,"brain_chain")+g.chainBonus,poison:toxic?1:0,core:true,angle:Math.atan2(target.y-g.y,target.x-g.x)+(i-(coreCount-1)/2)*.035})}g.brainVolley=.24;pushSkill(g,"brain",1,g.x,g.y,74,.16,{rot:Math.atan2(nearest.y-g.y,nearest.x-g.x),grow:1.3});g.castFx=.16;g.castAngle=Math.atan2(nearest.y-g.y,nearest.x-g.x);sound.current?.play("shot");
          }else if(g.mainClass==="liver"){
            g.fire=.55;
          }else if(g.mainClass==="lung"){
            const mo=g.galeMomentum;g.fire=Math.max(.13,g.fireRate*.85-mo*.06);
            const a=moving?Math.atan2(g.vy,g.vx):Math.atan2(nearest.y-g.y,nearest.x-g.x);
            g.shots.push({x:g.x,y:g.y,vx:Math.cos(a)*690,vy:Math.sin(a)*690,life:.7,r:10+mo*2,damageMul:1+mo*.2});
            pushSkill(g,"lung",1,g.x+Math.cos(a)*24,g.y+Math.sin(a)*24,50+mo*10,.16,{rot:a,grow:1.3});
            g.castFx=.12;g.castAngle=a;sound.current?.play("shot");
          }else if(g.mainClass==="muscle"){
            g.fire=g.fireRate*1.45;const oc=cardLevel(g,"muscle_overcontract"),range=g.meleeRange*1.6*(1+oc*.16),kb=270*(1+oc*.28);let hit=false;
            for(const m of g.mobs){const d=Math.hypot(m.x-g.x,m.y-g.y);if(d<range+m.r){m.hp-=g.damage*1.75;m.hit=.12;const nx=(m.x-g.x)/(d||1),ny=(m.y-g.y)/(d||1);m.kbX+=nx*kb;m.kbY+=ny*kb;hit=true}}
            if(hit){pushSkill(g,"muscle",1,g.x,g.y,range*1.7,.3,{grow:1.4});g.shake=Math.max(g.shake,4);sound.current?.play("hit")}
            g.impactCharge=Math.min(1,g.impactCharge+.08);
          }else{
            g.fire=g.fireRate;const a=Math.atan2(nearest.y-g.y,nearest.x-g.x)+(Math.random()-.5)*(g.organs.뇌<30?.34:0);for(let j=0;j<g.projectiles;j++)shootAt(nearest,{chain:g.chainBonus,angle:a+(j-(g.projectiles-1)/2)*.13});g.castFx=.16;g.castAngle=a;sound.current?.play("shot");
          }
        }
        for(const m of g.mobs){
          m.skill-=dt;m.hit-=dt;m.charge-=dt;m.toxin-=dt;m.poisonTick-=dt;m.heartMark-=dt;if(m.toxin>0||m.poisonStacks>0)m.hp-=(4+g.poison*1.5+m.poisonStacks*2.2)*dt;
          const wasCasting=m.cast>0;m.cast-=dt;
          if(wasCasting&&m.cast<=0){
            if(m.boss){
              const count=12+g.stage*2,offset=(g.t%2)*.3;for(let i=0;i<count;i++){const a=i/count*Math.PI*2+offset;g.shots.push({x:m.x,y:m.y,vx:Math.cos(a)*230,vy:Math.sin(a)*230,life:3.2,r:7,enemy:true})}
              const aim=Math.atan2(m.aimY-m.y,m.aimX-m.x);for(let i=-2;i<=2;i++)g.shots.push({x:m.x,y:m.y,vx:Math.cos(aim+i*.12)*340,vy:Math.sin(aim+i*.12)*340,life:2.5,r:8,enemy:true});
            }else if(m.kind===1){m.charge=.42}
            else{const a=Math.atan2(m.aimY-m.y,m.aimX-m.x);g.shots.push({x:m.x,y:m.y,vx:Math.cos(a)*285,vy:Math.sin(a)*285,life:3,r:7,enemy:true})}
          }
          const distanceToPlayer=Math.hypot(g.x-m.x,g.y-m.y);
          if(m.elite&&m.skill<=0&&m.cast<=0&&m.charge<=0&&distanceToPlayer<680){
            m.skill=m.boss?3.8:4.6+Math.random()*2.2;m.cast=m.boss ? 0.9 : 0.65;m.aimX=g.x;m.aimY=g.y;
            g.warnings.push({x:m.x,y:m.y,tx:g.x,ty:g.y,life:m.cast,max:m.cast,kind:m.boss?"circle":"line",r:m.boss?155:34});
          }
          const a=m.charge>0?Math.atan2(m.aimY-m.y,m.aimX-m.x):Math.atan2(g.y-m.y,g.x-m.x);
          const move=m.charge>0?690:m.speed*(m.cast>0 ? 0.18 : 1);m.x+=Math.cos(a)*move*dt;m.y+=Math.sin(a)*move*dt;
          if(m.kbX||m.kbY){m.x+=m.kbX*dt;m.y+=m.kbY*dt;m.kbX*=.85;m.kbY*=.85;if(Math.hypot(m.kbX,m.kbY)<12){m.kbX=0;m.kbY=0}}m.collideCd-=dt;
          const edge=m.boss?76:24;m.x=Math.max(edge,Math.min(g.worldW-edge,m.x));m.y=Math.max(edge,Math.min(g.worldH-edge,m.y));
          const d=Math.hypot(m.x-g.x,m.y-g.y);
          if(d<m.r+(coarse?12:16)&&g.inv<=0){hurtPlayer((m.boss?18:8)*diff.damage);if(m.boss&&g.bossWeakTarget){g.organs[g.bossWeakTarget]=Math.max(0,g.organs[g.bossWeakTarget]-4);g.effect=`노화 침식 · ${g.bossWeakTarget} -4`;g.effectT=1.2}g.inv=.55;g.shake=10;sound.current?.play("hurt");burst(g,g.x,g.y,"#ff715b",12)}
          if(g.poison&&d<95){m.hp-=g.poison*6*dt}
          if((m.kbX||m.kbY)&&m.collideCd<=0){for(const o of g.mobs){if(o!==m&&o.hp>0&&Math.hypot(o.x-m.x,o.y-m.y)<m.r+o.r+4){const ex=g.damage*1.4;m.hp-=ex;o.hp-=ex;m.collideCd=.45;o.collideCd=Math.max(o.collideCd,.25);const mx=(m.x+o.x)/2,my=(m.y+o.y)/2;burst(g,mx,my,"#d8ff3e",8);pushSkill(g,"muscle",3,mx,my,64,.3,{grow:1.4});const ch=cardLevel(g,"muscle_chaincollide");if(ch){const rad=88*(1+(ch-1)*.3);for(const e of g.mobs)if(e!==m&&e!==o&&Math.hypot(e.x-mx,e.y-my)<rad)e.hp-=g.damage*.8;g.shake=Math.max(g.shake,5)}break}}}
        }
        for(const s of g.shots){s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.enemy){if(Math.hypot(s.x-g.x,s.y-g.y)<s.r+(coarse?11:15)&&g.inv<=0){s.life=0;hurtPlayer(7*diff.damage);if(g.bossWeakTarget&&g.mobs.some(m=>m.boss)){g.organs[g.bossWeakTarget]=Math.max(0,g.organs[g.bossWeakTarget]-2);g.effect=`노화 탄막 · ${g.bossWeakTarget} -2`;g.effectT=.9}g.inv=.42;g.shake=7;sound.current?.play("hurt");burst(g,g.x,g.y,"#ff715b",8)}}else{for(const m of g.mobs){if(Math.hypot(s.x-m.x,s.y-m.y)<s.r+m.r){const hit=g.damage*(s.r>9?1.65:1)*(s.damageMul??1)*g.rangedDamageMul;m.hp-=hit;s.life=0;m.hit=.08;if(s.poison){m.poisonStacks=Math.min(8,m.poisonStacks+s.poison);m.toxin=4}sound.current?.play("hit");burst(g,s.x,s.y,s.core?"#a49bd8":s.r>9?"#ff715b":"#d8ff3e",s.r>9?10:4);if((s.chain??0)>0){const next=g.mobs.filter(o=>o!==m&&o.hp>0&&Math.hypot(o.x-m.x,o.y-m.y)<220).sort((a,b)=>Math.hypot(a.x-m.x,a.y-m.y)-Math.hypot(b.x-m.x,b.y-m.y))[0];if(next){const a=Math.atan2(next.y-m.y,next.x-m.x);g.shots.push({x:m.x,y:m.y,vx:Math.cos(a)*610,vy:Math.sin(a)*610,life:.55,r:6,damageMul:(s.damageMul??1)*.7,chain:(s.chain??1)-1,poison:s.poison,core:true})}}break}}}}
        for(const f of g.fields){f.life-=dt;f.tick-=dt;for(const m of g.mobs)if(Math.hypot(m.x-f.x,m.y-f.y)<f.r){m.hp-=(7+f.stack*4)*dt;m.toxin=Math.max(m.toxin,.3);if(cardLevel(g,"liver_concentrated")&&f.tick<=0){m.poisonStacks=Math.min(8,m.poisonStacks+1);m.toxin=4}}if(f.tick<=0)f.tick=1}g.fields=g.fields.filter(f=>f.life>0);
        if(cardLevel(g,"fusion_liver_brain")&&g.mainClass==="liver"&&g.toxicCoreCooldown<=0&&g.fields.length&&g.mobs.length){const source=g.fields[Math.floor(Math.random()*g.fields.length)],target=[...g.mobs].sort((a,b)=>Math.hypot(a.x-source.x,a.y-source.y)-Math.hypot(b.x-source.x,b.y-source.y))[0];if(target){g.fields.push({x:target.x,y:target.y,r:48*g.poisonRadiusMul,life:3.2*g.poisonDurationMul,stack:1,kills:0,tick:0});g.toxicCoreCooldown=4.5;pushSkill(g,"liver",6,target.x,target.y,84,.45,{spin:5,grow:1.3});burst(g,target.x,target.y,"#a8d43a",14);g.effect="추적 독성 · 오염 지역 전파";g.effectT=.8}}
        const dead=g.mobs.filter(m=>m.hp<=0);for(const m of dead){
          g.kills++;burst(g,m.x,m.y,m.boss?"#ff715b":"#4ee5e1",m.boss?30:8);
          const closeKill=Math.hypot(m.x-g.x,m.y-g.y)<g.meleeRange*1.35;if(closeKill&&(cardLevel(g,"heart_bloodflow")||cardLevel(g,"life_sports")))g.moveBuff=2;
          if(g.mainClass==="lung"&&cardLevel(g,"lung_circulation")){g.galeKillLock=2;g.moveBuff=Math.max(g.moveBuff,1.4)}
          if(cardLevel(g,"common_regen")){g.killsSinceRegen++;if(g.killsSinceRegen>=20){g.killsSinceRegen=0;const heal=g.maxHp*.08*(1-g.recoveryPenalty);g.hp=Math.min(g.maxHp,g.hp+heal);g.effect=`재생 인자 · 체력 +${Math.round(heal)}`;g.effectT=1.1}}
          if(cardLevel(g,"liver_rupture")&&m.poisonStacks>0){const blast=(7+g.poison*2)*m.poisonStacks*1.5*(1+(cardLevel(g,"liver_rupture")-1)*.2);for(const other of g.mobs)if(other!==m&&Math.hypot(other.x-m.x,other.y-m.y)<145){other.hp-=blast;other.poisonStacks=Math.min(8,other.poisonStacks+1);other.toxin=4}pushSkill(g,"liver",5,m.x,m.y,150,.5,{grow:1.7});burst(g,m.x,m.y,"#a8d43a",22);g.effect="독성 파열 · 연쇄 오염";g.effectT=.8}
          if(cardLevel(g,"fusion_brain_liver")&&m.poisonStacks>0){const other=g.mobs.filter(o=>o!==m&&o.hp>0).sort((a,b)=>Math.hypot(a.x-m.x,a.y-m.y)-Math.hypot(b.x-m.x,b.y-m.y))[0];if(other){other.poisonStacks=Math.min(8,other.poisonStacks+1);other.toxin=4;pushSkill(g,"brain",6,other.x,other.y,72,.4,{grow:1.4})}}
          const deathField=g.fields.find(f=>Math.hypot(m.x-f.x,m.y-f.y)<f.r);if(deathField&&cardLevel(g,"fusion_liver_heart")){deathField.kills++;if(deathField.kills>=3){deathField.kills=0;for(const other of g.mobs)if(Math.hypot(other.x-deathField.x,other.y-deathField.y)<deathField.r*1.5)other.hp-=g.damage*2.1;burst(g,deathField.x,deathField.y,"#ff715b",28);g.shake=10;g.effect="독성 폭주 · 지대 폭발";g.effectT=1}}
          if(g.mainClass==="brain"&&cardLevel(g,"brain_frenzy")&&g.kills%5===0){const coreCount=2+cardLevel(g,"brain_synapse"),targets=[...g.mobs].filter(o=>o!==m&&o.hp>0).sort((a,b)=>Math.hypot(a.x-g.x,a.y-g.y)-Math.hypot(b.x-g.x,b.y-g.y));for(let i=0;i<coreCount&&targets.length;i++){const target=targets[i%targets.length],a=Math.atan2(target.y-g.y,target.x-g.x);g.shots.push({x:g.x,y:g.y,vx:Math.cos(a)*650,vy:Math.sin(a)*650,life:1.4,r:8,damageMul:1.15,chain:cardLevel(g,"brain_chain")+g.chainBonus,core:true})}g.brainVolley=.5;pushSkill(g,"brain",5,g.x,g.y,175,.5,{grow:1.7});g.effect="사고 폭주 · 코어 일제 사격";g.effectT=1}
          const dropCount=m.boss?7:1;
          for(let i=0;i<dropCount;i++){
            const roll=Math.random(),a=Math.random()*6.28,s=35+Math.random()*90;
            const kind=m.boss?(i<3?"xp":i<5?"heal":"organ"):(roll<.72?"xp":roll<.88?"heal":"organ");
            g.drops.push({x:m.x,y:m.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,kind,organ:kind==="organ"?ORGAN_KEYS[Math.floor(Math.random()*ORGAN_KEYS.length)]:undefined,value:kind==="xp"?(m.boss?4:1):kind==="heal"?(m.boss?18:7):(m.boss?5:2),life:14,phase:Math.random()*6.28});
          }
          if(m.boss){if(g.stage===3&&g.stageT>BOSS_AT){endGame(true)}else if(!g.augmentDone){g.augmentDone=true;openChoice("전투 증강",weightedChoices(g))}}
        }
        g.mobs=g.mobs.filter(m=>m.hp>0);g.shots=g.shots.filter(s=>s.life>0&&s.x>-30&&s.x<g.worldW+30&&s.y>-30&&s.y<g.worldH+30);if(g.shots.filter(s=>s.enemy).length>70){let trim=g.shots.filter(s=>s.enemy).length-70;g.shots=g.shots.filter(s=>!s.enemy||trim--<=0)}
        let picked="";
        for(const d of g.drops){
          d.life-=dt;d.phase+=dt*4;d.x+=d.vx*dt;d.y+=d.vy*dt;d.vx*=.92;d.vy*=.92;
          const dist=Math.hypot(g.x-d.x,g.y-d.y);
          if(dist<150){const pull=Math.max(180,620*(1-dist/150));d.x+=(g.x-d.x)/Math.max(1,dist)*pull*dt;d.y+=(g.y-d.y)/Math.max(1,dist)*pull*dt}
          if(dist<23){
            d.life=0;
            if(d.kind==="xp"){
              g.xp+=d.value;picked=`경험 세포 +${d.value}`;
              if(g.xp>=g.nextXp){
                g.xp-=g.nextXp;g.level++;g.nextXp=Math.round(g.nextXp*1.28);picked=`레벨 ${g.level} · 진화 가능`;sound.current?.play("level");
                openChoice("세포 진화",weightedChoices(g));
              }
            }else if(d.kind==="heal"){const healed=Math.max(1,Math.round(d.value*(1-g.recoveryPenalty)));g.hp=Math.min(g.maxHp,g.hp+healed);picked=`회복 세포 +${healed}`}
            else if(d.organ){g.organs[d.organ]=Math.min(100,g.organs[d.organ]+d.value);if(d.organ==="뇌")g.fireRate=Math.max(.18,g.fireRate*.998);else if(d.organ==="심장"){g.maxHp+=.15;g.hp=Math.min(g.maxHp,g.hp+.15)}else if(d.organ==="폐")g.speed+=.35;else if(d.organ==="간")g.poison+=.025;else{g.damage+=.1;g.armor+=.025}picked=`${d.organ} 특화 영양소 +${d.value}`}
            sound.current?.play("pickup");
            burst(g,d.x,d.y,d.kind==="xp"?"#d8ff3e":d.kind==="heal"?"#ff715b":"#4ee5e1",6);
          }
        }
        g.drops=g.drops.filter(d=>d.life>0);
        for(const w of g.warnings)w.life-=dt;g.warnings=g.warnings.filter(w=>w.life>0).slice(-40);
        for(const p of g.parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt}g.parts=g.parts.filter(p=>p.life>0).slice(coarse?-190:-280);
        for(const fx of g.skillFx){fx.life-=dt;fx.rot+=fx.spin*dt}g.skillFx=g.skillFx.filter(fx=>fx.life>0);
        if(g.t-g.hudAt>.12){g.hudAt=g.t;setHud({hp:g.hp,max:g.maxHp,t:g.t,stage:g.stage,organs:{...g.organs},organLevels:{...g.organLevels},mainClass:g.mainClass,level:g.level,xp:g.xp,nextXp:g.nextXp,loot:picked,effect:g.effectT>0?g.effect:"",chemistries:[...g.chemistries],dashCharges:g.dashCharges,maxDash:g.maxDash,armor:g.armor})}
      }
      const sx=(Math.random()-.5)*g.shake,sy=(Math.random()-.5)*g.shake;
      const camX=Math.max(0,Math.min(g.worldW-g.w,g.x-g.w/2));
      const camY=Math.max(0,Math.min(g.worldH-g.h,g.y-g.h/2));
      const visible=(x:number,y:number,pad=90)=>x>camX-pad&&x<camX+g.w+pad&&y>camY-pad&&y<camY+g.h+pad;
      ctx.save();ctx.translate(sx-camX,sy-camY);
      drawEnvironment(g,camX,camY);
      for(const f of g.fields){if(!visible(f.x,f.y,f.r))continue;ctx.save();ctx.globalAlpha=Math.min(.22+f.stack*.13,f.life*.2);ctx.fillStyle=f.stack>=3?"#62a51f":f.stack===2?"#83bf2c":"#9ed83b";ctx.strokeStyle=f.stack>=3?"#ecff6a":"#d8ff3e";ctx.lineWidth=1+f.stack;ctx.beginPath();ctx.arc(f.x,f.y,f.r+Math.sin(g.t*6+f.x)*4,0,Math.PI*2);ctx.fill();ctx.setLineDash([8,7]);ctx.stroke();if(f.stack>1){ctx.setLineDash([]);ctx.globalAlpha=.8;ctx.fillStyle="#f5ffd8";ctx.font="800 11px Pretendard";ctx.textAlign="center";ctx.fillText(`독 ${f.stack}단계`,f.x,f.y+4)}ctx.restore();const ls=skillSheets.liver;if(ls.complete&&ls.naturalWidth){const idx=Math.min(3,f.stack),lcw=ls.naturalWidth/4,lch=ls.naturalHeight/2,fsz=f.r*1.9;ctx.save();ctx.globalAlpha=Math.min(.5,f.life*.3);ctx.globalCompositeOperation="screen";ctx.drawImage(ls,(idx%4)*lcw,Math.floor(idx/4)*lch,lcw,lch,f.x-fsz/2,f.y-fsz/2,fsz,fsz);ctx.restore()}}
      for(const w of g.warnings){
        if(!visible(w.x,w.y,160)&&!visible(w.tx,w.ty,160))continue;
        const progress=1-w.life/w.max,pulse=.35+Math.sin(g.t*24)*.15;ctx.save();ctx.globalAlpha=.42+progress*.42;ctx.strokeStyle="#ff715b";ctx.fillStyle=`rgba(255,113,91,${pulse})`;ctx.lineWidth=3;
        if(w.kind==="circle"){ctx.beginPath();ctx.arc(w.tx,w.ty,w.r*(.72+progress*.28),0,Math.PI*2);ctx.fill();ctx.stroke()}
        else{const a=Math.atan2(w.ty-w.y,w.tx-w.x);ctx.translate(w.x,w.y);ctx.rotate(a);ctx.fillRect(20,-w.r/2,Math.min(620,Math.hypot(w.tx-w.x,w.ty-w.y)),w.r);ctx.strokeRect(20,-w.r/2,Math.min(620,Math.hypot(w.tx-w.x,w.ty-w.y)),w.r)}
        ctx.restore();
      }
      for(const p of g.parts){if(!visible(p.x,p.y,10))continue;ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4)}ctx.globalAlpha=1;
      const renderScale=coarse ? .8 : 1;
      const drawVfx=(index:number,x:number,y:number,size:number,alpha=1,rotation=0)=>{
        if(!vfxArt.complete||!vfxArt.naturalWidth)return;
        const cellW=vfxArt.naturalWidth/4,cellH=vfxArt.naturalHeight/2,col=index%4,row=Math.floor(index/4);
        ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.globalAlpha=Math.max(0,Math.min(1,alpha));ctx.globalCompositeOperation="screen";
        ctx.drawImage(vfxArt,col*cellW,row*cellH,cellW,cellH,-size/2,-size/2,size,size);ctx.restore();
      };
      const drawSkill=(fx:SkillFx)=>{
        const sheet=skillSheets[fx.sheet];if(!sheet.complete||!sheet.naturalWidth)return;
        const cellW=sheet.naturalWidth/4,cellH=sheet.naturalHeight/2,col=fx.index%4,row=Math.floor(fx.index/4);
        const p=1-fx.life/fx.max,scale=(1+(fx.grow-1)*p)*renderScale,size=fx.size*scale;
        ctx.save();ctx.translate(fx.x,fx.y);ctx.rotate(fx.rot);ctx.globalAlpha=Math.max(0,Math.min(1,Math.sin(fx.life/fx.max*Math.PI*.5)));ctx.globalCompositeOperation="screen";
        ctx.drawImage(sheet,col*cellW,row*cellH,cellW,cellH,-size/2,-size/2,size,size);ctx.restore();
      };
      for(const d of g.drops){
        if(!visible(d.x,d.y,30))continue;
        const bob=Math.sin(d.phase)*3;ctx.save();ctx.translate(d.x,d.y+bob);ctx.rotate(d.phase*.35);
        ctx.shadowBlur=16;ctx.shadowColor=d.kind==="xp"?"#d8ff3e":d.kind==="heal"?"#ff715b":"#4ee5e1";
        if(itemArt.complete&&itemArt.naturalWidth){const row=d.kind==="xp"?0:d.kind==="heal"?1:2,size=36*renderScale;ctx.drawImage(itemArt,g.stage*384,row*(1024/3),384,1024/3,-size/2,-size/2,size,size)}
        else{ctx.fillStyle=d.kind==="xp"?"#d8ff3e":d.kind==="heal"?"#ff715b":"#4ee5e1";ctx.beginPath();ctx.arc(0,0,7,0,6.28);ctx.fill()}
        ctx.restore();
      }
      for(const s of g.shots){
        if(!visible(s.x,s.y,42))continue;
        const sprite=s.enemy?(g.stage===3&&g.mobs.some(m=>m.boss)?6:5):g.chemistries.includes("brain_liver")?4:s.r>11?7:s.r>9?2:s.r===6?1:0;
        const glow=s.enemy?"#ff715b":sprite===4?"#a49bd8":sprite===1?"#a49bd8":sprite===2||sprite===7?"#ff715b":"#d8ff3e";
        ctx.save();ctx.translate(s.x,s.y);ctx.shadowBlur=s.enemy?8:14;ctx.shadowColor=glow;
        if(projectileArt.complete&&projectileArt.naturalWidth){
          const cellW=projectileArt.naturalWidth/4,cellH=projectileArt.naturalHeight/2,col=sprite%4,row=Math.floor(sprite/4),size=(s.enemy?34:s.r>9?48:30)*renderScale;
          ctx.drawImage(projectileArt,col*cellW,row*cellH,cellW,cellH,-size/2,-size/2,size,size);
        }else{ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,s.r*renderScale,0,6.28);ctx.fill()}
        ctx.restore();
      }ctx.shadowBlur=0;
      for(const m of g.mobs){
        if(!visible(m.x,m.y,m.boss?100:50))continue;
        ctx.save();ctx.translate(m.x,m.y);
        const atlas=stageArt[g.stage],idx=m.boss?3:m.kind;
        const cell=(atlas.complete&&atlas.naturalWidth?atlas.naturalWidth:1254)/4,size=(m.boss?(g.stage===3?126:118):68)*renderScale;
        const frame=Math.floor(g.t*(m.boss?4.5:7)+(m.x+m.y)*.008)%4,bob=Math.sin(g.t*(m.boss?9:14)+(m.x+m.y)*.01)*(m.boss?2:3);
        const facingRight=g.x>=m.x;
        ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(0,size*.31,Math.max(11,size*.28)*(1-Math.abs(bob)*.025),Math.max(4,size*.075),0,0,6.28);ctx.fill();
        ctx.translate(0,bob);ctx.rotate(Math.sin(g.t*7+(m.x+m.y)*.01)*.018);
        if(!facingRight)ctx.scale(-1,1);
        if(m.hit>0){ctx.globalAlpha=.55;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(0,0,size*.42,0,6.28);ctx.fill();ctx.globalAlpha=1}
        if(atlas.complete&&atlas.naturalWidth)ctx.drawImage(atlas,frame*cell,idx*cell,cell,cell,-size/2,-size*.58,size,size);
        else{ctx.fillStyle=m.boss?"#ff715b":"#76c8b9";ctx.beginPath();ctx.arc(0,0,m.r,0,6.28);ctx.fill()}
        if(m.toxin>0||m.poisonStacks>0){ctx.strokeStyle="#a8d43a";ctx.lineWidth=2+Math.min(4,m.poisonStacks);ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(0,0,size*.42+Math.sin(g.t*8)*2,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1}
        if(m.elite&&!m.boss){ctx.strokeStyle="#ff715b";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-size*.26,6,0,Math.PI*2);ctx.stroke()}
        if(m.boss){ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillRect(-m.r,-m.r-13,m.r*2,5);ctx.fillStyle="#d8ff3e";ctx.fillRect(-m.r,-m.r-13,m.r*2*(m.hp/m.max),5)}ctx.restore();
        if(m.hit>0)drawVfx(3,m.x,m.y,(m.boss?92:52)*renderScale,Math.min(1,m.hit*12),g.t*2);
      }
      for(const fx of g.skillFx)if(visible(fx.x,fx.y,fx.size*2))drawSkill(fx);
      const playerMoving=Math.hypot(g.vx,g.vy)>20,moveAngle=Math.atan2(g.vy,g.vx);
      if(g.mainClass==="brain"){const coreCount=2+cardLevel(g,"brain_synapse");for(let i=0;i<coreCount;i++){const a=g.t*(1.9+cardLevel(g,"brain_frenzy")*.08)+i/coreCount*Math.PI*2,r=50+Math.sin(g.t*3+i)*4,cx=g.x+Math.cos(a)*r,cy=g.y+Math.sin(a)*r;ctx.save();ctx.shadowBlur=g.brainVolley>0?28:16;ctx.shadowColor="#a49bd8";ctx.fillStyle=g.brainVolley>0?"#f2ebff":"#8f83dc";ctx.beginPath();ctx.arc(cx,cy,g.brainVolley>0?9:7,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#d8ff3e";ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(cx,cy,12+Math.sin(g.t*8+i)*2,0,Math.PI*2);ctx.stroke();ctx.restore()}g.brainVolley=Math.max(0,g.brainVolley-.016)}
      if(g.shield>0){ctx.save();ctx.globalAlpha=.45+.12*Math.sin(g.t*7);ctx.strokeStyle="#4ee5e1";ctx.lineWidth=4;ctx.beginPath();ctx.arc(g.x,g.y,43+Math.sin(g.t*4)*2,0,Math.PI*2);ctx.stroke();ctx.restore()}
      if(playerMoving)drawVfx(0,g.x-Math.cos(moveAngle)*28,g.y-Math.sin(moveAngle)*28,62*renderScale,.28+Math.sin(g.t*15)*.08,moveAngle);
      if(g.dashFx>0)drawVfx(1,g.x-Math.cos(moveAngle)*12,g.y-Math.sin(moveAngle)*12,(92+(0.34-g.dashFx)*120)*renderScale,g.dashFx/.34,moveAngle);
      if(g.mainClass==="liver")drawVfx(6,g.x,g.y+18,(104+Math.sin(g.t*3)*6)*renderScale,.24,g.t*.08);
      if(g.mainClass==="brain")drawVfx(5,g.x,g.y-8,(88+Math.sin(g.t*4)*4)*renderScale,.34,g.t*.35);
      if(g.heartFx>0)drawVfx(4,g.x,g.y,(105+(0.58-g.heartFx)*170)*renderScale,g.heartFx/.58);
      if(g.castFx>0)drawVfx(2,g.x+Math.cos(g.castAngle)*30,g.y+Math.sin(g.castAngle)*30,42*renderScale,g.castFx/.16,g.castAngle);
      ctx.save();ctx.translate(g.x,g.y);
      const formIndex=g.mainClass==="brain"?1:g.mainClass==="heart"?3:g.mainClass==="liver"?5:g.mainClass==="lung"?2:g.mainClass==="muscle"?6:0,playerSize=(formIndex?86:74)*renderScale;
      const playerBob=Math.sin(g.t*(Math.hypot(g.vx,g.vy)>20?13:5))*2;
      ctx.fillStyle="rgba(0,0,0,.32)";ctx.beginPath();ctx.ellipse(0,25,23-Math.abs(playerBob),7,0,0,6.28);ctx.fill();
      ctx.translate(0,playerBob);if(g.vx<0)ctx.scale(-1,1);
      ctx.globalAlpha=g.inv>0&&Math.floor(g.t*20)%2 ? .38 : 1;ctx.shadowBlur=22;ctx.shadowColor="#d8ff3e";
      if(playerArt.complete&&playerArt.naturalWidth)ctx.drawImage(playerArt,(formIndex%4)*384,Math.floor(formIndex/4)*512,384,512,-playerSize/2,-playerSize*.64,playerSize,playerSize);
      else{ctx.fillStyle="#d8ff3e";ctx.beginPath();ctx.arc(0,0,18,0,6.28);ctx.fill()}
      ctx.restore();ctx.globalAlpha=1;ctx.shadowBlur=0;
      ctx.restore();raf.current=requestAnimationFrame(loop);
    };
    const onDebugKey=(e:KeyboardEvent)=>{
      const g=game.current;if(!g.debug||mode!=="play"||g.paused)return;
      if(e.code==="KeyB"){spawn(g,true);sound.current?.play("boss");g.effect="[debug] 보스 소환";g.effectT=1.5}
      else if(e.code==="KeyN"){for(let i=0;i<6;i++)spawn(g);g.effect="[debug] 잡몹 6 소환";g.effectT=1.2}
      else if(e.code==="KeyK"){for(const m of g.mobs)if(!m.boss)m.hp=0;g.effect="[debug] 잡몹 정리";g.effectT=1}
      else if(e.code==="KeyH"){g.hp=g.maxHp;g.shield=g.maxHp*.2;g.effect="[debug] 풀 회복+실드";g.effectT=1}
      else if(e.code==="KeyI"){g.invuln=!g.invuln;g.effect=`[debug] 무적 ${g.invuln?"ON":"OFF"}`;g.effectT=1.4}
      else if(e.code==="KeyG"){endGame(false)}
    };
    addEventListener("keydown",onDebugKey);
    raf.current=requestAnimationFrame(loop);return()=>{cancelAnimationFrame(raf.current);removeEventListener("keydown",onDebugKey)};
  },[mode,endGame,openChoice]);

  const choose=(c:Choice)=>{const g=game.current;c.apply(g);g.effect=`${c.name} · ${c.effect}`;g.effectT=2.4;if(c.kind==="fusion"&&c.id){const set=new Set<string>(JSON.parse(localStorage.getItem("organ-fusions")||"[]"));set.add(c.id);const arr=[...set];localStorage.setItem("organ-fusions",JSON.stringify(arr));setFoundFusions(arr)}if(c.chemistry&&!g.chemistries.includes(c.chemistry)){g.chemistries.push(c.chemistry);g.effect=`케미 발견 · ${c.name}`;g.effectT=2.8;const found=new Set<string>(JSON.parse(localStorage.getItem("organ-chemistry")||"[]"));found.add(c.chemistry);const chemistries=[...found];localStorage.setItem("organ-chemistry",JSON.stringify(chemistries));setArchive(old=>({...old,chemistries}))}ORGAN_KEYS.forEach(k=>g.organs[k]=Math.max(0,Math.min(100,g.organs[k])));if(choiceType==="생활 선택")g.choices.push(c.name);else g.augments.push(c.name);sendGameLabEvent("game_choice_selected",{runNumber:runNumber.current,choiceType,choice:c.name,effect:c.effect,elapsedSeconds:Math.round(g.t),stage:g.stage+1,level:g.level,organLevels:{...g.organLevels},mainClass:g.mainClass});
    if(c.organLevel&&!g.awakened&&g.organLevels[c.organLevel]>=3){sound.current?.play("level");openChoice("장기 각성",awakeningChoices(c.organLevel));return}
    if(c.awakening&&c.awakening!=="hold"){g.effect=`${CORE_META[c.awakening].className} 각성 · 전투 방식이 고정됩니다`;g.effectT=3.2;g.heartFx=.7;pushSkill(g,c.awakening,7,g.x,g.y,240,.85,{grow:1.9});sound.current?.play("boss")}
    g.paused=false;g.last=performance.now();setMode("play")};
  useEffect(()=>{
    if(mode!=="choice")return;
    const onChoiceKey=(e:KeyboardEvent)=>{
      if(["ArrowLeft","ArrowRight","KeyA","KeyD","Space","Enter","Digit1","Digit2","Digit3"].includes(e.code))e.preventDefault();
      if(e.code==="ArrowLeft"||e.code==="KeyA")setSelectedCard(v=>(v-1+cards.length)%cards.length);
      else if(e.code==="ArrowRight"||e.code==="KeyD")setSelectedCard(v=>(v+1)%cards.length);
      else if(e.code==="Space"||e.code==="Enter"){if(!e.repeat&&cards[selectedCard])choose(cards[selectedCard])}
      else if(e.code.startsWith("Digit")){const index=Number(e.code.slice(-1))-1;if(cards[index])choose(cards[index])}
    };
    addEventListener("keydown",onChoiceKey);return()=>removeEventListener("keydown",onChoiceKey);
  },[mode,cards,selectedCard,choose]);
  const gene=archive.gene;
  const strongest=ORGAN_KEYS.reduce((a,b)=>report.organs[a]>report.organs[b]?a:b);
  const mainName=report.mainClass?CORE_META[report.mainClass].className:null;
  const build=mainName?(report.fusions.length?`${mainName} · ${report.fusions[0]}`:mainName):"미각성 생존자";
  const fmt=(t:number)=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,"0")}`;
  const state=(v:number)=>v>=70?"healthy":v>=30?"normal":"danger";
  const leaders=[...ORGAN_KEYS].sort((a,b)=>hud.organs[b]-hud.organs[a]).slice(0,2);
  const activeChem=CHEMISTRY.find(c=>c.id===hud.chemistries[hud.chemistries.length-1]);
  const activeClass=hud.mainClass?CORE_META[hud.mainClass]:null;
  const actionName=activeClass?.action??"DASH";
  const discovered=archive.chemistries;
  const bestKills=archive.bestKills;
  const bestTime=archive.bestTime;
  const cardOrgans=(c:Choice)=>c.organs??ORGAN_KEYS.filter(k=>c.name.includes(k)||({뇌:["시냅스","신경","집중","공부","야근"],심장:["심실","맥박","아드레날린"],폐:["폐포","호흡","대시","등산"],간:["해독","독성","회식","식단"],근육:["근육","근섬유","운동","헬스","재활"]}[k] as string[]).some(v=>c.name.includes(v)));

  return <main className="game-shell"><section className="frame">
    <canvas ref={canvas} width={1280} height={720} aria-label="장기 프로젝트 게임 화면"/>
    {(mode==="start"||mode==="play")&&<><button className="sound-btn" onClick={()=>{const next=!isMuted;setIsMuted(next);sound.current??=createSoundEngine();sound.current.setMuted(next);if(!next)sound.current.play("pickup")}} aria-label={isMuted?"사운드 켜기":"사운드 끄기"}><SoundGlyph muted={isMuted}/> {isMuted?"소리 켜기":"사운드"}</button>
    <button className="fullscreen-btn" onClick={toggleFullscreen} aria-label={isFullscreen?"전체화면 종료":"전체화면 시작"}><FullscreenGlyph on={isFullscreen}/> {isFullscreen?"나가기":"전체화면"} <kbd>F</kbd></button></>}
    {mode==="play"&&<div className="mobile-controls"><div ref={joystick} className="touch-stick" onPointerDown={moveStick} onPointerMove={moveStick} onPointerUp={releaseStick} onPointerCancel={releaseStick}><span style={{transform:`translate(${stick.x}px,${stick.y}px)`}}/></div><button className="touch-dash" onPointerDown={e=>{e.preventDefault();dashNow()}}><b>{actionName}</b><span>{Array.from({length:hud.maxDash},(_,i)=><i className={i<hud.dashCharges?"ready":""} key={i}/>)}</span></button></div>}
    <div className="rotate-device"><b>↻</b><span>가로 화면으로 돌려주세요</span><small>회전하는 동안 게임은 잠시 멈춥니다.</small></div>
    {mode==="start"&&<div className="screen menu-screen">
      <nav className="meta-nav"><div className="nav-brand">ORGAN<br/><b>PROJECT</b></div>{([["home","생애 시작"],["heroes","영웅 도감"],["organs","장기 도감"],["items","생활 보관함"],["archive","유전 기록"]] as const).map(([id,label])=><button className={menuSection===id?"active":""} key={id} onClick={()=>setMenuSection(id)}>{label}<span>↗</span></button>)}<div className="nav-keys"><kbd>WASD</kbd> 이동<br/><kbd>SPACE</kbd> 직업 액션<br/><kbd>ESC</kbd> 메뉴</div></nav>
      <section className="meta-content">
        {menuSection==="home"&&<div className="home-panel"><div className="eyebrow">ORGAN PROJECT / LIFE-01</div><h1 className="title">장기<br/><span>프로젝트</span></h1><p className="lede">생활을 선택하고 장기를 성장시키며, 마지막 적 <b>‘노화’</b>와 맞서세요.</p><div className="difficulty" aria-label="난이도 선택"><button onClick={()=>start("easy")}><small>CASUAL</small><b>가벼움</b><span>적 체력과 수 감소</span></button><button className="recommended" onClick={()=>start("normal")}><small>RECOMMENDED</small><b>표준</b><span>기획 의도 그대로</span></button><button onClick={()=>start("hard")}><small>SURVIVAL</small><b>생존</b><span>더 빠르고 많은 적</span></button></div><div className="gene">{gene?`유전 특성: 타고난 ${gene} +8`:"저장된 유전 특성이 없습니다."}</div></div>}
        {menuSection==="heroes"&&<div className="codex-panel hero-codex"><div className="eyebrow">CLASS CODEX / 05 CLASSES · 06 FUSIONS</div><h2>영웅 도감</h2><p className="section-lede">심장·뇌·간·폐·근육을 Lv.3까지 키우면 하나의 직업으로 각성합니다. 다섯 직업은 이동 판단부터 완전히 다릅니다.</p><div className="hero-layout"><div className="hero-list">{CLASS_CODEX.map(c=>{const m=CORE_META[c.core];return <button className={selectedHero===c.core?"active":""} key={c.core} onClick={()=>setSelectedHero(c.core)}><span><OrganGlyph k={m.key} size={18}/></span><b>{m.className}</b><small>{m.key} Lv.3 각성</small></button>})}</div>{CLASS_CODEX.filter(c=>c.core===selectedHero).map(c=>{const m=CORE_META[c.core],cards=CLASS_CARDS.filter(d=>d.main===c.core);return <article className="hero-detail" key={c.core}><div className="hero-visual"><div className="hero-portrait" style={{backgroundImage:"url('/art/player-forms-v2-clean.png')",backgroundPosition:`${c.form%4/3*100}% ${Math.floor(c.form/4)*100}%`}}/><span>AWAKEN IN GAME</span></div><div className="hero-copy"><small>{c.question}</small><h3>{m.className}</h3><div className="hero-organs"><b><OrganGlyph k={m.key} size={13}/> {m.key}</b><b>SPACE · {m.action}</b></div><dl><div><dt>PASSIVE</dt><dd>{c.passive}</dd></div><div><dt>PLAY STYLE</dt><dd>{c.play}</dd></div></dl><div className="hero-cards">{cards.map(cd=><div key={cd.id}><b>{cd.name}</b><span>{cd.effect}</span></div>)}</div></div></article>})}</div><h3 className="archive-title">융합 6종 <span>주 직업 + 보조 장기 Lv.2에서 해금</span></h3><div className="fusion-grid">{FUSION_CARDS.map(f=><article key={f.id}><div>{f.organs.map((k,i)=><span key={k}>{i>0?" + ":""}<OrganGlyph k={k} size={14}/></span>)}</div><b>{f.name}</b><p>{f.effect}</p></article>)}</div></div>}
        {menuSection==="organs"&&<div className="codex-panel"><div className="eyebrow">BODY CODEX / 05 CORE ORGANS</div><h2>장기 도감</h2><p className="section-lede">장기는 능력치가 아니라 플레이 스타일을 정하는 빌드 언어입니다. 같은 장기를 세 번 키워 Lv.3에 이르면 그 직업으로 각성합니다.</p><div className="organ-guide">{CLASS_CODEX.map(c=>{const m=CORE_META[c.core];return <article key={c.core} style={{"--organ-color":m.color} as React.CSSProperties}><span><OrganGlyph k={m.key} size={26}/></span><div><small>{m.key} · Lv.0 → Lv.3 → {m.className}</small><h3>{m.className}</h3><p>{c.question}. {c.passive}</p></div></article>})}</div><p className="section-lede" style={{marginTop:22}}>각성 전에는 공용 에너지탄으로 싸우고, 각성 후 <b>SPACE</b> 직업 액션이 열립니다. 전투 중 얻는 영양소는 장기 수치를 서서히 끌어올려 드롭 편향과 다음 생애 유전에 영향을 줍니다.</p></div>}
        {menuSection==="items"&&<div className="codex-panel"><div className="eyebrow">LIFE STORAGE / 03 LIFE · 03 SURVIVAL</div><h2>생활 보관함</h2><p className="section-lede">생활 선택은 강력한 강화에 반드시 대가가 따릅니다. 공용 생존 카드는 어떤 직업에서도 버티는 힘을 줍니다.</p><h3 className="archive-title">생활 선택 <span>강화 + 대가</span></h3><div className="item-guide">{LIFE_CARDS.map(c=><article className="life-item" key={c.id}><span>{c.organs.length?c.organs.map(k=><OrganGlyph key={k} k={k} size={22}/>):"🍶"}</span><small>LIFE CHOICE</small><h3>{c.name}</h3><p>{c.effect}{c.cost?` · 대가: ${c.cost}`:""}</p></article>)}</div><h3 className="archive-title" style={{marginTop:26}}>공용 생존 <span>모든 직업 공용</span></h3><div className="item-guide">{COMMON_CARDS.map(c=><article key={c.id}><span>🧬</span><small>SURVIVAL</small><h3>{c.name}</h3><p>{c.effect}</p></article>)}</div></div>}
        {menuSection==="archive"&&<div className="codex-panel"><div className="eyebrow">GENETIC ARCHIVE / LOCAL SAVE</div><h2>유전 기록</h2><div className="archive-stats"><article><small>INHERITED ORGAN</small><b>{gene?<><OrganGlyph k={gene as OrganKey} size={16}/> {gene}</>:"기록 없음"}</b></article><article><small>BEST KILLS</small><b>{bestKills} 처치</b></article><article><small>LONGEST LIFE</small><b>{fmt(bestTime)}</b></article></div><h3 className="archive-title">발견한 융합 <span>{foundFusions.length} / 6</span></h3><div className="chem-archive">{FUSION_CARDS.map(f=><article className={foundFusions.includes(f.id)?"unlocked":"locked"} key={f.id}><div>{f.organs.map((k,i)=><span key={k}>{i>0?" + ":""}<OrganGlyph k={k} size={14}/></span>)}</div><b>{foundFusions.includes(f.id)?f.name:"???"}</b><p>{foundFusions.includes(f.id)?f.effect:"주 직업과 보조 장기를 함께 키워 융합을 발견하세요."}</p></article>)}</div></div>}
      </section>
    </div>}
    {(mode==="play"||mode==="pause")&&<><div className="hud"><div className="hud-top"><div className="stage"><small>LIFE STAGE 0{hud.stage+1}</small>{STAGES[hud.stage][0]}<span className="build-chip">주력 {leaders.map((k,i)=><span key={k}>{i>0?" + ":""}<OrganGlyph k={k} size={11}/> {k}</span>)}</span></div><div><div className="clock">{fmt(hud.t)} <small>/ 6:18</small></div><div className="hp"><i style={{width:`${Math.max(0,hud.hp/hud.max*100)}%`}}/></div></div></div></div>
      <aside className={`chemistry-panel ${activeClass?"awakened":""}`}><small>MAIN CLASS</small>{activeClass?<><div className="chemistry-icons"><span><OrganGlyph k={activeClass.key} size={22}/></span></div><h3>{activeClass.className}</h3><p>{activeClass.key} Lv.3 각성 · SPACE {activeClass.action}</p><em>이번 생애의 주 직업으로 고정</em></>:<><h3>각성 탐색 중</h3><p>심장·뇌·간 중 하나를 Lv.3까지 성장시키세요.</p></>}</aside>
      <div className="next-objective"><small>NEXT LIFE EVENT</small><b>{hud.t<FIRST_CHOICE_AT?`첫 생활 선택까지 ${Math.max(0,Math.ceil(FIRST_CHOICE_AT-hud.t))}초`:game.current.stageT<BOSS_AT?`${STAGES[hud.stage][1]}까지 ${Math.max(0,Math.ceil(BOSS_AT-game.current.stageT))}초`:`${STAGES[hud.stage][1]} 처치`}</b><span>{hud.t<10?"이동하며 자동 공격 · SPACE로 액션 사용":hud.mainClass?`${CORE_META[hud.mainClass].className} 빌드 · 보조 장기 Lv.2에서 융합 해금`:"장기 Lv.3을 만들고 주 전투 방식을 각성하세요"}</span></div>
      {hud.effect&&<div className="organ-effect">{hud.effect}</div>}
      <div className="level-hud"><b>LV.{hud.level}</b><span><i style={{width:`${hud.xp/hud.nextXp*100}%`}}/></span>{hud.loot&&<em>{hud.loot}</em>}</div>
      <div className="defense-hud"><b>🛡 방어 {hud.armor.toFixed(1)}</b><span>피해 감소 {Math.round(100-10000/(100+hud.armor*5))}%</span></div>
      <div className={`body-hud ${activeClass?"awakened":""}`} style={activeClass?{"--core-color":activeClass.color} as React.CSSProperties:undefined}><small>신체 상태</small><div className="body-figure"><svg viewBox="0 0 120 170" aria-hidden="true"><g className="silhouette"><circle cx="60" cy="20" r="15"/><rect x="42" y="38" width="36" height="70" rx="14"/><rect x="22" y="42" width="14" height="52" rx="7"/><rect x="84" y="42" width="14" height="52" rx="7"/><rect x="47" y="104" width="12" height="54" rx="6"/><rect x="61" y="104" width="12" height="54" rx="6"/></g></svg>{(["brain","heart","lung","liver","muscle"] as CoreOrgan[]).map(core=>{const pos=({brain:["7%","50%"],heart:["33%","39%"],lung:["31%","63%"],liver:["50%","59%"],muscle:["47%","20%"]} as Record<CoreOrgan,[string,string]>)[core];const st=state(hud.organs[CORE_META[core].key]);const lv=hud.organLevels[core];return <div className={`bmark core ${st} ${hud.mainClass===core?"awoken":""}`} key={core} style={{top:pos[0],left:pos[1],"--core-color":CORE_META[core].color} as React.CSSProperties}><span><OrganGlyph k={CORE_META[core].key} size={14}/></span><i>{[1,2,3].map(v=><u className={lv>=v?"on":""} key={v}/>)}</i></div>})}</div>{hud.mainClass==="lung"&&<div className="class-gauge" style={{"--core-color":CORE_META.lung.color} as React.CSSProperties}><span>질풍 모멘텀</span><b><i style={{width:`${Math.min(100,game.current.galeMomentum/3.5*100)}%`}}/></b></div>}{hud.mainClass==="muscle"&&<div className="class-gauge" style={{"--core-color":CORE_META.muscle.color} as React.CSSProperties}><span>강타 충전</span><b><i style={{width:`${Math.min(100,game.current.impactCharge*100)}%`}}/></b></div>}</div>
      <div className="dash-hint"><span>SPACE {actionName}</span><i>{Array.from({length:hud.maxDash},(_,i)=><b className={i<hud.dashCharges?"ready":""} key={i}/>)}</i><em>{activeClass?`${activeClass.className} 전용 액션`:hud.dashCharges?"대시 준비":"재충전 중"}</em></div></>}
    {mode==="choice"&&<div className={`choice-wrap choice-${choiceType==="세포 진화"?"evolve":choiceType==="빌드 각성"||choiceType==="장기 각성"?"build":"life"}`}><div className="choice-head"><div><div className="eyebrow">{choiceType==="생활 선택"?"LIFE INTERRUPT":choiceType==="장기 각성"?"ORGAN AWAKENING":choiceType==="빌드 각성"?"BUILD AWAKENING":"CELL EVOLUTION"}</div><h2>{choiceType==="세포 진화"?"장기 성장":choiceType}</h2></div><p><b>1 · 2 · 3</b> 즉시 선택&nbsp;&nbsp; <b>A / D</b> 이동&nbsp;&nbsp; <b>SPACE</b> 확정</p></div><div className={`cards ${cards.length===2?"two":""}`}>{cards.map((c,i)=>{const tags=cardOrgans(c),nextLevel=c.id?cardLevel(game.current,c.id)+1:0;return <button className={`card card-${c.kind||"general"} ${selectedCard===i?"selected":""} ${c.awakening&&c.awakening!=="hold"?"awakening-card":""}`} key={c.name} onMouseEnter={()=>setSelectedCard(i)} onFocus={()=>setSelectedCard(i)} onClick={()=>choose(c)} aria-selected={selectedCard===i}><span className="card-no"><kbd>{i+1}</kbd> 선택 {c.kind==="fusion"&&<em>FUSION</em>}</span><div className="card-art">{tags.length?tags.map(k=><span key={k} style={{"--organ-color":ORGAN_META[k].color,color:ORGAN_META[k].color} as React.CSSProperties}><OrganGlyph k={k} size={30}/></span>):<span>✦</span>}</div><div className="organ-tags">{tags.map(k=><span key={k}><OrganGlyph k={k} size={12}/> {k}{c.organLevel&&` Lv.${game.current.organLevels[c.organLevel]} → Lv.${Math.min(3,game.current.organLevels[c.organLevel]+1)}`}</span>)}{c.maxLevel===3&&<span>Lv.{nextLevel}</span>}</div><h3>{c.name}</h3><p>{c.desc}</p><div className="decision-effects"><strong><small>플레이 변화</small>{c.effect}</strong>{c.cost&&<em><small>대가</small>{c.cost}</em>}</div>{selectedCard===i&&<small className="confirm-hint">SPACE로 확정</small>}</button>})}</div></div>}
    {mode==="pause"&&<div className="pause"><div className="pause-menu"><div className="pause-summary"><div className="eyebrow">LIFE MENU / ESC</div><h2>잠시 숨 고르기</h2><p>{activeClass?<><b>{activeClass.className}</b><br/>{activeClass.key} Lv.3 각성 · {activeClass.action}</>:"아직 주 직업을 각성하지 않았습니다."}</p><div className="pause-organs">{(["heart","brain","liver","lung","muscle"] as CoreOrgan[]).map(k=><span key={k}><OrganGlyph k={CORE_META[k].key} size={12}/> {CORE_META[k].key} · Lv.{hud.organLevels[k]}</span>)}</div></div><div className="pause-actions"><button className="primary" onClick={()=>{game.current.paused=false;game.current.last=performance.now();sound.current?.resumeMusic();setMode("play")}}>계속하기</button><button onClick={()=>start(game.current.difficulty)}>현재 생애 다시 시작</button><button onClick={()=>{game.current.paused=true;sound.current?.stopMusic();setMenuSection("home");setMode("start")}}>메인 화면으로 나가기</button><small>ESC를 다시 누르면 바로 계속합니다.</small></div></div></div>}
    {mode==="report"&&<div className="screen report"><div className="report-grid"><div><div className="eyebrow">LIFE REPORT / COMPLETE</div><h1>{report.win?"노화를 넘어섰습니다.":"생애가 끝났습니다."}</h1><p className="report-copy">{mainName?<><b>{mainName}</b>{josa(mainName,"으로","로")} 살아낸 생애였습니다. {report.fusions.length?<>융합 <b>{report.fusions.join(", ")}</b>{josa(report.fusions[report.fusions.length-1],"을","를")} 손에 넣었습니다. </>:null}다음 생애에는 <b>타고난 {strongest}</b>{josa(strongest,"이","가")} 유전됩니다.</>:<>주 직업을 각성하지 못한 채 스러진 생애였습니다. 다음 생애에는 <b>타고난 {strongest}</b>{josa(strongest,"이","가")} 유전됩니다.</>}</p><div className="stats"><div className="stat"><small>SURVIVAL</small><b>{fmt(report.t)}</b></div><div className="stat"><small>ZOMBIES</small><b>{report.kills} 처치</b></div><div className="stat"><small>BUILD</small><b>{build}</b></div><div className="stat"><small>GENE</small><b>타고난 {strongest}</b></div></div><div className="report-actions"><button className="primary" onClick={()=>start(game.current.difficulty)}>같은 난이도로 다시 ↗</button><button className="report-menu-btn" onClick={()=>{game.current.paused=true;sound.current?.stopMusic();setMenuSection("home");setMode("start")}}>메인 화면으로</button></div></div><div><div className="organ-report">{ORGAN_KEYS.map(k=><div className="organ-line" key={k}><span>{k}</span><div className="bar"><i style={{width:`${report.organs[k]}%`}}/></div><b>{report.organs[k]}</b></div>)}</div><p className="gene">생활: {report.choices.join(" · ")||"기록 없음"}<br/>증강: {report.augments.join(" · ")||"기록 없음"}</p></div></div></div>}
  </section></main>;
}
