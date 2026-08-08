"use client";

import { useState } from "react";
import "./assets.css";

type Asset = { name:string; file:string; category:"characters"|"monsters"|"maps"|"effects"; size:string; cols?:number; rows?:number; note:string };
type CardKind = "organ"|"class"|"fusion"|"life"|"common";
type CardSpec = {name:string;kind:CardKind;organs:string[];effect:string;cost?:string;status:"live"|"planned"};

const assets:Asset[] = [
  {name:"플레이어 형태 V2",file:"/art/player-forms-v2-clean.png",category:"characters",size:"1536 × 1024",cols:4,rows:2,note:"흰머리 기본형과 장기 에너지 활성 형태"},
  {name:"학교 캐릭터 V2",file:"/art/school-walk.png",category:"monsters",size:"1254 × 1254",cols:4,rows:4,note:"야자·책더미·운동부·교장"},
  {name:"회사 캐릭터 V2",file:"/art/company-walk.png",category:"monsters",size:"1254 × 1254",cols:4,rows:4,note:"야근·서류·중간관리자·부장"},
  {name:"아파트 캐릭터 V2",file:"/art/apartment-walk.png",category:"monsters",size:"1254 × 1254",cols:4,rows:4,note:"택배·쓰레기·층간소음·관리소장"},
  {name:"병원 캐릭터 V2",file:"/art/hospital-walk.png",category:"monsters",size:"1254 × 1254",cols:4,rows:4,note:"예약·처방·의료비·시간과 노화"},
  {name:"아이템",file:"/art/items.png",category:"effects",size:"1536 × 1024",cols:4,rows:3,note:"경험·회복·장기 드롭"},
  {name:"원형 투사체",file:"/art/projectiles.png",category:"effects",size:"1774 × 887",cols:4,rows:2,note:"플레이어·적·노화 보스 탄환"},
  {name:"플레이어 전투 이펙트",file:"/art/player-vfx.png",category:"effects",size:"1536 × 1024",cols:4,rows:2,note:"범용 이동·대시·발사·피격 효과"},
  {name:"심장 스킬 이펙트",file:"/art/vfx/heart-skills-v1.png",category:"effects",size:"1774 × 887",cols:4,rows:2,note:"콤보·4타 충격파·과부하·돌진·심장 표식·각성 파동"},
  {name:"뇌 스킬 이펙트",file:"/art/vfx/brain-skills-v1.png",category:"effects",size:"1774 × 887",cols:4,rows:2,note:"코어·발사 섬광·연쇄·집중·폭주·전염·각성 파동"},
  {name:"간 스킬 이펙트",file:"/art/vfx/liver-skills-v1.png",category:"effects",size:"1774 × 887",cols:4,rows:2,note:"발자국·독 지대 1~3단계·중독 표식·파열·추적·각성 파동"},
  {name:"폐 스킬 이펙트",file:"/art/vfx/lung-skills-v1.png",category:"effects",size:"1774 × 887",cols:4,rows:2,note:"바람 칼날·교차 칼날·이동 잔상·관통 대시·원형 돌풍·회오리·각성 사이클론"},
  {name:"근육 스킬 이펙트",file:"/art/vfx/muscle-skills-v1.png",category:"effects",size:"1774 × 887",cols:4,rows:2,note:"중량 타격·광역 충격파·넉백 압력파·충돌 폭발·분노 오라·지면 강타·각성 폭발"},
  {name:"학교 맵",file:"/art/maps/school.png",category:"maps",size:"WORLD MAP",note:"0–20세 전투 공간"},
  {name:"회사 맵",file:"/art/maps/company.png",category:"maps",size:"WORLD MAP",note:"20–40세 전투 공간"},
  {name:"아파트 맵",file:"/art/maps/apartment.png",category:"maps",size:"WORLD MAP",note:"40–60세 전투 공간"},
  {name:"병원 맵",file:"/art/maps/hospital.png",category:"maps",size:"WORLD MAP",note:"60–80세 전투 공간"},
];

const cardSpecs:CardSpec[] = ([
  {name:"심장 강화",kind:"organ",organs:["심장"],effect:"심장 레벨 +1 · Lv.3에서 격투가 각성"},
  {name:"신경 확장",kind:"organ",organs:["뇌"],effect:"뇌 레벨 +1 · Lv.3에서 에너지술사 각성"},
  {name:"간 활성화",kind:"organ",organs:["간"],effect:"간 레벨 +1 · Lv.3에서 독술사 각성"},
  {name:"아드레날린",kind:"class",organs:["심장"],effect:"근거리에서 공격 속도 +25%"},
  {name:"심박 충격",kind:"class",organs:["심장"],effect:"4번째 근접 공격이 충격파로 변화"},
  {name:"과부하 연타",kind:"class",organs:["심장"],effect:"동일 대상을 5회 공격하면 강력한 일격"},
  {name:"혈류 가속",kind:"class",organs:["심장"],effect:"근거리 처치 후 2초간 이동 가속"},
  {name:"시냅스 증식",kind:"class",organs:["뇌"],effect:"실제 에너지 코어 +1"},
  {name:"연쇄 사고",kind:"class",organs:["뇌"],effect:"코어 공격이 가까운 적에게 연쇄"},
  {name:"집중 사고",kind:"class",organs:["뇌"],effect:"강한 적 우선 조준 · 엘리트 피해 증가"},
  {name:"사고 폭주",kind:"class",organs:["뇌"],effect:"5킬마다 모든 코어가 일제 사격"},
  {name:"독성 발자국",kind:"class",organs:["간"],effect:"이동 경로에 독 흔적을 더 촘촘히 생성"},
  {name:"오염 중첩",kind:"class",organs:["간"],effect:"같은 길을 지나면 독 지대 강화"},
  {name:"독성 파열",kind:"class",organs:["간"],effect:"중독된 적 처치 시 주변에 독 폭발"},
  {name:"농축 독",kind:"class",organs:["간"],effect:"독 지대 체류 시간에 따라 중독 증가"},
  {name:"뇌근 동기화",kind:"fusion",organs:["심장","뇌"],effect:"격투 피니시마다 추적 에너지탄 발사"},
  {name:"독성 파이터",kind:"fusion",organs:["심장","간"],effect:"주먹으로 독을 쌓고 피니시에서 폭발"},
  {name:"맥동 코어",kind:"fusion",organs:["뇌","심장"],effect:"적과 가까울수록 코어 공격 속도 증가"},
  {name:"신경 독성",kind:"fusion",organs:["뇌","간"],effect:"중독 대상을 우선 조준하고 독 전염"},
  {name:"독성 폭주",kind:"fusion",organs:["간","심장"],effect:"독 지대 3킬마다 영역 폭발"},
  {name:"추적 독성",kind:"fusion",organs:["간","뇌"],effect:"독성 코어가 적을 추적해 새 지대 생성"},
  {name:"밤샘 공부",kind:"life",organs:["뇌"],effect:"자동 공격 연쇄 +1 · 공격 주기 감소",cost:"최대 체력 -15%"},
  {name:"운동부 입단",kind:"life",organs:["심장"],effect:"근접 범위 증가 · 근거리 처치 후 가속",cost:"원거리 피해 -10%"},
  {name:"회식의 제왕",kind:"life",organs:["간"],effect:"독 지대 범위와 지속시간 증가",cost:"회복 효과 -25%"},
  {name:"세포 분열",kind:"common",organs:["공용"],effect:"사망 시 체력 40%로 1회 부활"},
  {name:"재생 인자",kind:"common",organs:["공용"],effect:"20킬마다 최대 체력의 8% 회복"},
  {name:"세포막 강화",kind:"common",organs:["공용"],effect:"8초간 무피해 시 보호막 생성"},
  {name:"폐활량 강화",kind:"organ",organs:["폐"],effect:"폐 레벨 +1 · Lv.3에서 질풍술사 각성"},
  {name:"근섬유 강화",kind:"organ",organs:["근육"],effect:"근육 레벨 +1 · Lv.3에서 파괴자 각성"},
  {name:"칼바람",kind:"class",organs:["폐"],effect:"이동 거리마다 이동 방향으로 관통 바람 칼날"},
  {name:"잔상 호흡",kind:"class",organs:["폐"],effect:"최대 모멘텀에서 이동 잔상이 주변 적에게 피해"},
  {name:"태풍의 눈",kind:"class",organs:["폐"],effect:"이동 중 주변에 회오리 생성 · 레벨마다 증가"},
  {name:"순환 가속",kind:"class",organs:["폐"],effect:"처치 시 모멘텀 유지 + 이동 속도 증가"},
  {name:"과잉 수축",kind:"class",organs:["근육"],effect:"기본 강타 범위와 넉백 증가"},
  {name:"연쇄 충돌",kind:"class",organs:["근육"],effect:"밀린 적이 다른 적과 충돌하면 범위 폭발"},
  {name:"고통 연료",kind:"class",organs:["근육"],effect:"피해를 받으면 지면 강타 충전 증가"},
  {name:"중력 압박",kind:"class",organs:["근육"],effect:"지면 강타 전 주변 적을 끌어당김"},
] as Omit<CardSpec,"status">[]).map(card=>({...card,status:"live" as const}));

const labels={all:"전체",characters:"캐릭터",monsters:"몬스터",maps:"배경",effects:"아이템·효과"} as const;
const cardLabels={all:"전체 카드",organ:"장기 성장",class:"직업 전용",fusion:"융합",life:"생활 선택",common:"공용 생존"} as const;

export default function AssetsPage(){
  const [filter,setFilter]=useState<keyof typeof labels>("all");
  const [copied,setCopied]=useState("");
  const [cardFilter,setCardFilter]=useState<"all"|CardKind>("all");
  const visible=assets.filter(a=>filter==="all"||a.category===filter);
  const copy=async(file:string)=>{await navigator.clipboard.writeText(file);setCopied(file);window.setTimeout(()=>setCopied(""),1200)};
  return <main className="asset-page">
    <header className="asset-header"><div><span>DEVELOPMENT TOOL / ASSET LIBRARY</span><h1>게임 에셋 보드</h1><p>현재 게임에 연결된 이미지와 오디오를 한곳에서 검토합니다.</p></div><a href="/">게임으로 돌아가기 ↗</a></header>
    <nav className="asset-filters">{Object.entries(labels).map(([key,label])=><button className={filter===key?"active":""} onClick={()=>setFilter(key as keyof typeof labels)} key={key}>{label}<b>{key==="all"?assets.length:assets.filter(a=>a.category===key).length}</b></button>)}</nav>
    <section className="asset-grid">{visible.map(asset=><article className={`asset-card ${asset.category}`} key={asset.file}>
      <div className="asset-preview"><img src={asset.file} alt={asset.name}/></div>
      <div className="asset-info"><div><small>{labels[asset.category]}</small><h2>{asset.name}</h2><p>{asset.note}</p></div><dl><div><dt>FILE</dt><dd>{asset.file}</dd></div><div><dt>SIZE</dt><dd>{asset.size}</dd></div>{asset.cols&&<div><dt>GRID</dt><dd>{asset.cols} × {asset.rows} · {asset.cols*asset.rows!} CELLS</dd></div>}</dl><button onClick={()=>copy(asset.file)}>{copied===asset.file?"복사 완료 ✓":"경로 복사"}</button></div>
    </article>)}</section>
    <section className="card-board"><header><div><span>CHOICE SYSTEM / MVP 37</span><h2>카드 시스템 명세</h2><p><b className="status-live">LIVE</b> 카드 37장이 현재 전투 시스템에 연결되어 있습니다.</p></div><b>{cardSpecs.length} CARDS</b></header><nav>{Object.entries(cardLabels).map(([key,label])=><button className={cardFilter===key?"active":""} onClick={()=>setCardFilter(key as "all"|CardKind)} key={key}>{label}<small>{key==="all"?cardSpecs.length:cardSpecs.filter(c=>c.kind===key).length}</small></button>)}</nav><div className="card-catalog">{cardSpecs.filter(c=>cardFilter==="all"||c.kind===cardFilter).map((card,index)=><article className={`dev-choice-card ${card.kind} ${card.status}`} key={`${card.kind}-${card.name}-${index}`}><div className="dev-card-top"><small>{cardLabels[card.kind]}</small><span>{card.status.toUpperCase()}</span></div><div className="dev-card-organs">{card.organs.length?card.organs.map(o=><b key={o}>{o}</b>):<b>공용</b>}</div><h3>{card.name}</h3><strong><small>플레이 변화</small>{card.effect}</strong>{card.cost&&<em><small>대가</small>{card.cost}</em>}</article>)}</div></section>
    <section className="audio-board"><div><span>AUDIO / BGM 01</span><h2>Circuit Bloom</h2><p>Neon Pulse 원본 · 127.9 BPM · 게임 플레이 루프</p></div><audio controls loop preload="metadata" src="/audio/circuit-bloom.ogg"/><button onClick={()=>copy("/audio/circuit-bloom.ogg")}>{copied==="/audio/circuit-bloom.ogg"?"복사 완료 ✓":"오디오 경로 복사"}</button></section>
  </main>
}
