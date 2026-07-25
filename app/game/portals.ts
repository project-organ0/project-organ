import type { OrganKey } from "./types";

export type PortalZone = {
  key:OrganKey;icon:string;color:string;label:string;focus:string;
  portalX:number;portalY:number;zoneX:number;zoneY:number;
};

export const HUB = {x:1200,y:800};

export const PORTAL_ZONES:PortalZone[] = [
  {key:"뇌",icon:"🧠",color:"#a49bd8",label:"시냅스 연구실",focus:"경험치 · 연사",portalX:1200,portalY:600,zoneX:380,zoneY:310},
  {key:"심장",icon:"♥",color:"#ff715b",label:"맥박 기관실",focus:"회복 · 최대 체력",portalX:1390,portalY:735,zoneX:1200,zoneY:270},
  {key:"폐",icon:"🫁",color:"#4ee5e1",label:"폐포 풍동",focus:"속도 · 대시",portalX:1320,portalY:970,zoneX:2020,zoneY:350},
  {key:"간",icon:"◆",color:"#d1bc7a",label:"해독 처리장",focus:"독성 · 지속 피해",portalX:1080,portalY:970,zoneX:470,zoneY:1300},
  {key:"근육",icon:"💪",color:"#d8ff3e",label:"근섬유 훈련장",focus:"공격력 · 방어",portalX:1010,portalY:735,zoneX:1970,zoneY:1280},
];
