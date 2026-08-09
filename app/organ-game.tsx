"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AUGMENT_BALANCE from "./game/augment-balance.json";
import AUGMENT_CATALOG_DATA from "./game/augment-catalog.json";
import {
	createAugmentCatalog,
	getAvailableAugments,
	pickTieredAugment,
	recordAugmentPick,
} from "./game/augment-selection";
import { lungBenchmarkDirection } from "./game/benchmark-autoplay";
import { createSoundEngine } from "./game/audio";
import { OrganGlyph, SoundGlyph, FullscreenGlyph, ShieldGlyph, SurvivalGlyph } from "./game/icons";
import type {
	AugmentTier,
	CardKind,
	Choice,
	CoreOrgan,
	DamageCause,
	Difficulty,
	Game,
	MainClass,
	Mob,
	Mode,
	OrganKey,
	RunTelemetry,
	SkillFx,
} from "./game/types";

const STAGES = [
	["0—20세 · 학교", "학생들의 식욕"],
	["20—40세 · 회사", "끝나지 않는 업무"],
	["40—60세 · 아파트", "생활의 무게"],
	["60—80세 · 병원", "마지막 진료"],
];
const STAGE_LENGTH = 100;
const FIRST_CHOICE_AT = 18;
const LATER_CHOICE_AT = 22;
const BOSS_AT = 60;
const RUN_TARGET = STAGE_LENGTH * 3 + BOSS_AT;
const SIMULATION_DT = 1 / 60;
const BOSS_HP_MULTIPLIER = 18;
const FINAL_BOSS_HP_MULTIPLIER = 22;
const DAMAGE_CAUSE_META: Record<DamageCause, { label: string; hint: string }> = {
	enemy_contact: { label: "적에게 포위됨", hint: "한 방향으로 빠져나갈 공간을 먼저 확보하세요." },
	enemy_charge: { label: "돌진 공격", hint: "바닥의 직선 예고가 끝나기 전에 옆으로 피하세요." },
	elite_contact: { label: "엘리트 적의 접촉", hint: "붉은 오라와 체력바가 있는 적을 먼저 처리하세요." },
	boss_contact: { label: "보스의 직접 충돌", hint: "보스와 거리를 벌리고 공격 예고 밖으로 이동하세요." },
	enemy_projectile: { label: "적의 투사체", hint: "탄환 사이의 빈 공간을 따라 이동하세요." },
	elite_projectile: { label: "엘리트 적의 투사체", hint: "붉은 표식이 있는 적의 조준선에서 먼저 벗어나세요." },
	boss_projectile: { label: "보스의 탄막", hint: "탄막이 퍼지기 전에 보스 측면으로 이동하세요." },
};
const levelValue = (values: number[], level: number) => values[Math.max(0, Math.min(values.length - 1, level - 1))];
const percentLevels = (values: number[]) => values.map((value) => Math.round(value * 100)).join("/");
const ORGAN_KEYS: OrganKey[] = ["뇌", "심장", "폐", "간", "근육"];
const ORGAN_META: Record<OrganKey, { icon: string; color: string }> = {
	뇌: { icon: "🧠", color: "#a49bd8" },
	심장: { icon: "♥", color: "#ff715b" },
	폐: { icon: "🫁", color: "#4ee5e1" },
	간: { icon: "◆", color: "#d1bc7a" },
	근육: { icon: "💪", color: "#d8ff3e" },
};
type ChoiceType = "생활 선택" | "세포 진화" | "빌드 각성" | "전투 증강" | "장기 각성";
// 선택 화면 5종: 레이아웃 골격은 공유하되 스킨(색/형태/배경)과 머리말은 각각 다르게 간다
const CHOICE_SKIN: Record<ChoiceType, { skin: string; eyebrow: string }> = {
	"생활 선택": { skin: "life", eyebrow: "LIFE INTERRUPT" },
	"세포 진화": { skin: "evolve", eyebrow: "CELL EVOLUTION" },
	"전투 증강": { skin: "augment", eyebrow: "COMBAT AUGMENT" },
	"장기 각성": { skin: "awaken", eyebrow: "ORGAN AWAKENING" },
	"빌드 각성": { skin: "build", eyebrow: "BUILD AWAKENING" },
};
const CORE_META: Record<CoreOrgan, { key: OrganKey; icon: string; color: string; className: string; action: string }> =
	{
		heart: { key: "심장", icon: "♥", color: "#ff715b", className: "격투가", action: "PUNCH" },
		brain: { key: "뇌", icon: "🧠", color: "#a49bd8", className: "에너지술사", action: "CORE" },
		liver: { key: "간", icon: "◆", color: "#a8d43a", className: "독술사", action: "TOXIN" },
		lung: { key: "폐", icon: "🫁", color: "#4ee5e1", className: "질풍술사", action: "DASH" },
		muscle: { key: "근육", icon: "💪", color: "#d8ff3e", className: "파괴자", action: "SLAM" },
	};
const CORE_ORDER: CoreOrgan[] = ["brain", "heart", "lung", "liver", "muscle"];
const AWAKEN_LEVEL = 3;
// 인체도 마커 좌표 [top, left]. 실루엣 viewBox(120x170) 기준 해부 위치에 맞추고,
// 26px 마커끼리 겹치지 않도록 흉곽 안에서 폐-심장을 좌우/상하로 어긋나게 둔다
const BODY_MARK_POS: Record<CoreOrgan, [string, string]> = {
	brain: ["10%", "50%"], // 두개골 중앙
	lung: ["27%", "44%"], // 흉곽 상부
	heart: ["37%", "57%"], // 흉곽 중하부, 해부학적 좌심 = 화면 오른쪽
	liver: ["50%", "44%"], // 우상복부 = 화면 왼쪽
	muscle: ["72%", "56%"], // 대퇴부
};
// 3직업 도감 데이터 (form: player-forms 시트 인덱스, question: 핵심 플레이 판단)
const CLASS_CODEX: { core: CoreOrgan; form: number; question: string; passive: string; play: string }[] = [
	{
		core: "heart",
		form: 3,
		question: "적에게 얼마나 가까이 붙을 것인가",
		passive: "가까운 적을 자동으로 근접 공격하며 4타 콤보를 쌓습니다.",
		play: "거리를 좁혀 콤보를 유지하고 4타 충격파와 과부하 강타로 밀집한 적을 부순다.",
	},
	{
		core: "brain",
		form: 1,
		question: "적과 어떤 거리를 유지할 것인가",
		passive: "주위를 도는 에너지 코어가 스스로 적을 사격합니다.",
		play: "안전 거리를 유지하며 코어 수와 연쇄를 늘리고 5킬 폭주로 화력을 터뜨린다.",
	},
	{
		core: "liver",
		form: 5,
		question: "적을 어디로 유도할 것인가",
		passive: "이동 경로에 독 지대를 남겨 밟고 지난 적을 서서히 녹입니다.",
		play: "동선을 설계해 독 지대를 겹치고 중독된 적의 죽음으로 연쇄 폭발을 일으킨다.",
	},
	{
		core: "lung",
		form: 2,
		question: "얼마나 멈추지 않고 이동할 것인가",
		passive: "계속 이동하면 질풍 모멘텀이 차오르고 이동 방향으로 바람 칼날이 자동 발생합니다.",
		play: "멈추지 않고 흐르며 바람 칼날을 겹치고, SPACE 관통 대시로 대열을 가르고 돌풍을 터뜨린다.",
	},
	{
		core: "muscle",
		form: 6,
		question: "얼마나 많은 적을 모아 한 번에 터뜨릴 것인가",
		passive: "가까운 적을 느리고 넓게 강타해 밀쳐내고, 밀린 적이 서로 부딪히면 추가 피해를 받습니다.",
		play: "적을 뭉치게 유도하고 충전을 쌓아 SPACE 지면 강타로 무리를 한 번에 폭발시킨다.",
	},
];
const DIFFICULTY = {
	easy: { name: "가벼움", hp: 0.72, speed: 0.88, count: 0.72, damage: 0.65 },
	normal: { name: "표준", hp: 1, speed: 1, count: 1, damage: 1 },
	hard: { name: "생존", hp: 1.45, speed: 1.13, count: 1.28, damage: 1.35 },
};
const CHEMISTRY = [
	{
		id: "brain_muscle",
		name: "뇌근 동기화",
		organs: ["뇌", "근육"] as OrganKey[],
		effect: "세 번째 공격이 거대한 동기화 충격탄으로 변화",
	},
	{
		id: "brain_lung",
		name: "기동 마법사",
		organs: ["뇌", "폐"] as OrganKey[],
		effect: "2단 대시 해금 · 대시할 때 사방으로 유도 세포탄 발사",
	},
	{
		id: "heart_muscle",
		name: "심장 버서커",
		organs: ["심장", "근육"] as OrganKey[],
		effect: "피격 반격 · 체력이 낮을수록 공격력 최대 45% 증가",
	},
	{
		id: "heart_lung",
		name: "심폐 러너",
		organs: ["심장", "폐"] as OrganKey[],
		effect: "계속 이동하면 가속 단계와 회복량이 상승",
	},
	{
		id: "liver_muscle",
		name: "독성 파이터",
		organs: ["간", "근육"] as OrganKey[],
		effect: "거대 충격탄이 지속 피해를 주는 독성 웅덩이 생성",
	},
	{
		id: "brain_liver",
		name: "신경 독성",
		organs: ["뇌", "간"] as OrganKey[],
		effect: "세포탄이 중독을 부여하고 처치 시 주변 적에게 전염",
	},
];
const HERO_GUIDE = [
	{
		id: "brain_muscle",
		role: "파괴형 포병",
		passive: "정밀한 두뇌와 근력을 동기화해 기본 공격의 위력을 높입니다.",
		skill: "동기화 충격탄",
		trigger: "세 번째 기본 공격이 거대한 고위력 탄환으로 변합니다.",
		play: "공격 속도와 투사체 수를 확보하면 충격탄 발동 횟수가 빠르게 늘어납니다.",
	},
	{
		id: "brain_lung",
		role: "고기동 마법사",
		passive: "대시 보유량이 2회로 증가하고 연속 회피가 가능해집니다.",
		skill: "기동 마법 탄막",
		trigger: "대시할 때 사방으로 유도 세포탄 8발을 발사합니다.",
		play: "적 무리를 가로지르며 탄막을 겹치고 위험한 보스 패턴을 연속으로 회피합니다.",
	},
	{
		id: "heart_muscle",
		role: "근접 반격 전사",
		passive: "체력이 낮아질수록 공격력이 최대 45%까지 증가합니다.",
		skill: "심장 반격",
		trigger: "피격되는 순간 주변 적에게 반격 충격파를 발생시킵니다.",
		play: "방어력을 확보하고 낮은 체력을 유지하면 높은 공격력을 안정적으로 활용할 수 있습니다.",
	},
	{
		id: "heart_lung",
		role: "지속 기동 생존가",
		passive: "계속 움직이면 최대 5단계까지 이동 속도와 회복량이 상승합니다.",
		skill: "심폐 순환",
		trigger: "이동을 유지하는 동안 체력을 지속 회복하고 멈추면 단계가 빠르게 감소합니다.",
		play: "좁은 원을 그리며 움직여 가속을 유지하고 탄막 사이를 끊임없이 빠져나갑니다.",
	},
	{
		id: "liver_muscle",
		role: "지역 제압 투사",
		passive: "근섬유 폭발과 독성 피해가 결합해 넓은 공간을 통제합니다.",
		skill: "독성 웅덩이",
		trigger: "거대 충격탄 적중 지점에 4초간 지속 피해 영역을 생성합니다.",
		play: "몬스터가 몰리는 이동 경로에 웅덩이를 만들고 적을 그 위로 유도합니다.",
	},
	{
		id: "brain_liver",
		role: "연쇄 중독술사",
		passive: "세포탄 적중 시 대상에게 지속 독성 피해를 부여합니다.",
		skill: "신경 독성 전염",
		trigger: "중독된 적을 처치하면 반경 내 다른 적에게 중독이 전파됩니다.",
		play: "약한 적부터 처치해 전염을 시작하면 거대한 무리를 연쇄적으로 무너뜨릴 수 있습니다.",
	},
];
const LIFE: Choice[][] = [
	[
		{
			name: "밤샘 공부",
			desc: "잠을 포기하고 사고 속도를 끌어올립니다.",
			effect: "연사 28% 증가 · 뇌 +15",
			cost: "최대 체력 -10 · 심장 -10",
			apply: (g) => {
				g.organs.뇌 += 15;
				g.organs.심장 -= 10;
				g.fireRate *= 0.72;
				g.maxHp -= 10;
				g.hp = Math.min(g.hp, g.maxHp);
			},
		},
		{
			name: "운동부 입단",
			desc: "움직임 자체를 공격력으로 바꾸는 체질이 됩니다.",
			effect: "폐·근육 +10 · 이동 중 피해 증가",
			cost: "정지하면 보너스 즉시 소멸",
			apply: (g) => {
				g.organs.폐 += 10;
				g.organs.근육 += 10;
				g.organs.뇌 -= 5;
				g.speed += 24;
				g.momentum += 1;
			},
		},
		{
			name: "매점 풀코스",
			desc: "점심시간보다 매점 시간이 더 기다려졌습니다.",
			effect: "즉시 회복 · 공격 속도 증가 · 간 약화",
			apply: (g) => {
				healPlayer(g, 28);
				g.organs.심장 += 5;
				g.organs.간 -= 8;
				g.fireRate *= 0.9;
			},
		},
	],
	[
		{
			name: "야근 특근",
			desc: "처리량은 폭증하지만 심장이 계속 대가를 냅니다.",
			effect: "투사체 +1 · 뇌 +15",
			cost: "10초마다 심장 -1",
			apply: (g) => {
				g.organs.뇌 += 15;
				g.organs.심장 -= 10;
				g.projectiles++;
				g.fatigue += 1;
			},
		},
		{
			name: "신입 환영회",
			desc: "쌓인 독성을 강력한 오라로 방출합니다.",
			effect: "독성 공격 강화 · 피해 +4",
			cost: "조준 흔들림 · 회복량 -25%",
			apply: (g) => {
				g.organs.간 -= 15;
				g.poison += 2;
				g.damage += 4;
				g.unstableAim += 0.16;
				g.recoveryPenalty = Math.min(0.7, g.recoveryPenalty + 0.25);
			},
		},
		{
			name: "헬스장 회원권",
			desc: "이번에는 정말 꾸준히 다니기로 했습니다.",
			effect: "근육·폐 강화 · 공격력 증가",
			apply: (g) => {
				g.organs.근육 += 15;
				g.organs.폐 += 5;
				g.damage += 7;
			},
		},
	],
	[
		{
			name: "배달 야식",
			desc: "당장의 위기를 넘기는 대신 회복 효율을 희생합니다.",
			effect: "즉시 체력 +45 · 피해 +8",
			cost: "간·폐 감소 · 이후 회복량 -20%",
			apply: (g) => {
				healPlayer(g, 45);
				g.damage += 8;
				g.organs.간 -= 10;
				g.organs.폐 -= 5;
				g.recoveryPenalty = Math.min(0.7, g.recoveryPenalty + 0.2);
			},
		},
		{
			name: "건강검진",
			desc: "가장 위험한 장기를 찾아 집중적으로 치료합니다.",
			effect: "최약 장기 +22 · 방어 +4",
			cost: "공격 성장 없음",
			apply: (g) => {
				const k = ORGAN_KEYS.reduce((a, b) => (g.organs[a] < g.organs[b] ? a : b));
				g.organs[k] += 22;
				g.armor += 4;
			},
		},
		{
			name: "주말 등산",
			desc: "정상에 오르니 아직은 할 만했습니다.",
			effect: "폐·심장 강화 · 이동 지속 회복",
			apply: (g) => {
				g.organs.폐 += 12;
				g.organs.심장 += 8;
				g.speed += 16;
				g.pulse += 1;
			},
		},
	],
	[
		{
			name: "재활 운동",
			desc: "예전처럼 강하지 않아도 다시 움직입니다.",
			effect: "근육·심장 회복 · 대시 즉시 충전",
			apply: (g) => {
				g.organs.근육 += 10;
				g.organs.심장 += 8;
				g.dash = 0;
				g.dashCharges = g.maxDash;
				g.speed += 12;
			},
		},
		{
			name: "식단 관리",
			desc: "먹고 싶은 것보다 필요한 것을 먹습니다.",
			effect: "간·심장 회복 · 부작용 완화",
			apply: (g) => {
				g.organs.간 += 15;
				g.organs.심장 += 5;
				ORGAN_KEYS.forEach((k) => (g.organs[k] += g.organs[k] < 35 ? 3 : 0));
			},
		},
		{
			name: "명상과 산책",
			desc: "빠르게 가는 대신 오래 가는 법을 배웠습니다.",
			effect: "뇌·폐 회복 · 피해 감소",
			apply: (g) => {
				g.organs.뇌 += 10;
				g.organs.폐 += 10;
				g.maxHp += 18;
				healPlayer(g, 18);
			},
		},
	],
];
const AUG: Choice[] = [
	{
		name: "시냅스 연쇄",
		desc: "생각은 하나에서 끝나지 않습니다.",
		effect: "추가 투사체 +1",
		apply: (g) => g.projectiles++,
	},
	{
		name: "아드레날린",
		desc: "벼랑 끝에서 몸이 먼저 반응합니다.",
		effect: "공격 속도 18% 증가",
		apply: (g) => (g.fireRate *= 0.82),
	},
	{ name: "맥박 충격", desc: "심장 박동이 적을 밀어냅니다.", effect: "주기적 범위 충격", apply: (g) => (g.pulse += 2) },
	{
		name: "잔상 호흡",
		desc: "지나간 자리에도 호흡이 남습니다.",
		effect: "대시 피해 강화",
		apply: (g) => (g.damage += 5),
	},
	{
		name: "자동 해독",
		desc: "몸이 대가를 견디는 법을 익힙니다.",
		effect: "모든 위험 장기 소폭 회복",
		apply: (g) => ORGAN_KEYS.forEach((k) => (g.organs[k] += g.organs[k] < 50 ? 8 : 2)),
	},
	{
		name: "독성 전환",
		desc: "쌓인 부작용을 공격으로 바꿉니다.",
		effect: "독성 오라 활성화",
		apply: (g) => (g.poison += 2),
	},
	{
		name: "근섬유 폭발",
		desc: "모든 힘을 한 점에서 터뜨립니다.",
		effect: "기본 공격력 +8",
		apply: (g) => (g.damage += 8),
	},
	{
		name: "심폐 순환",
		desc: "계속 움직일수록 다시 살아납니다.",
		effect: "최대 체력 +22 · 속도 증가",
		apply: (g) => {
			g.maxHp += 22;
			healPlayer(g, 22);
			g.speed += 12;
		},
	},
	{
		name: "응고 방패",
		desc: "혈소판이 순간적으로 단단한 방어막을 형성합니다.",
		effect: "방어력 +5",
		apply: (g) => (g.armor += 5),
	},
	{
		name: "뇌근 동기화",
		desc: "판단과 힘이 같은 박자로 움직입니다.",
		effect: "연사·공격력 동시 강화",
		apply: (g) => {
			g.fireRate *= 0.9;
			g.damage += 5;
		},
	},
];
const BASIC: Choice[] = [
	{
		name: "세포 분열",
		desc: "하나의 세포탄이 둘로 갈라집니다.",
		effect: "투사체 +1",
		apply: (g) => (g.projectiles = Math.min(6, g.projectiles + 1)),
	},
	{ name: "고밀도 핵", desc: "세포탄의 핵이 더 무거워집니다.", effect: "공격력 +5", apply: (g) => (g.damage += 5) },
	{
		name: "신경 가속",
		desc: "다음 공격을 더 빠르게 준비합니다.",
		effect: "공격 속도 10% 증가",
		apply: (g) => (g.fireRate = Math.max(0.18, g.fireRate * 0.9)),
	},
	{
		name: "폐포 확장",
		desc: "한 번의 호흡으로 더 멀리 움직입니다.",
		effect: "이동 속도 +18",
		apply: (g) => (g.speed += 18),
	},
	{
		name: "심실 강화",
		desc: "더 큰 충격을 견딜 수 있습니다.",
		effect: "최대 체력 +15 · 즉시 회복",
		apply: (g) => {
			g.maxHp += 15;
			healPlayer(g, 15);
		},
	},
	{
		name: "재생 인자",
		desc: "손상된 조직이 빠르게 회복됩니다.",
		effect: "체력 35 회복",
		apply: (g) => {
			healPlayer(g, 35);
		},
	},
	{
		name: "근육 수축",
		desc: "탄환에 물리적인 힘을 싣습니다.",
		effect: "공격력 +3 · 범위 충격 강화",
		apply: (g) => {
			g.damage += 3;
			g.pulse += 1;
		},
	},
	{
		name: "간 해독 효소",
		desc: "위험해진 장기의 부담을 덜어냅니다.",
		effect: "가장 약한 장기 +10",
		apply: (g) => {
			const k = ORGAN_KEYS.reduce((a, b) => (g.organs[a] < g.organs[b] ? a : b));
			g.organs[k] += 10;
		},
	},
	{
		name: "세포막 경화",
		desc: "외부 충격을 버티는 막이 두꺼워집니다.",
		effect: "방어력 +3 · 최대 체력 +8",
		apply: (g) => {
			g.armor += 3;
			g.maxHp += 8;
			healPlayer(g, 8);
		},
	},
];
const ORGAN_GROWTH: Choice[] = [
	{
		id: "organ_heart",
		kind: "organ",
		name: "심장 강화",
		desc: "심장이 더욱 강하게 뜁니다.",
		effect: "심장 레벨 +1 · Lv.3에서 격투가 각성 가능",
		organs: ["심장"],
		organLevel: "heart",
		apply: (g) => {
			g.organLevels.heart = Math.min(3, g.organLevels.heart + 1);
			g.organs.심장 = Math.min(100, g.organs.심장 + 8);
		},
	},
	{
		id: "organ_brain",
		kind: "organ",
		name: "신경 확장",
		desc: "신경망의 처리 능력이 확장됩니다.",
		effect: "뇌 레벨 +1 · Lv.3에서 에너지술사 각성 가능",
		organs: ["뇌"],
		organLevel: "brain",
		apply: (g) => {
			g.organLevels.brain = Math.min(3, g.organLevels.brain + 1);
			g.organs.뇌 = Math.min(100, g.organs.뇌 + 8);
		},
	},
	{
		id: "organ_liver",
		kind: "organ",
		name: "간 활성화",
		desc: "체내 독성 물질을 전투 에너지로 변환합니다.",
		effect: "간 레벨 +1 · Lv.3에서 독술사 각성 가능",
		organs: ["간"],
		organLevel: "liver",
		apply: (g) => {
			g.organLevels.liver = Math.min(3, g.organLevels.liver + 1);
			g.organs.간 = Math.min(100, g.organs.간 + 8);
		},
	},
	{
		id: "organ_lung",
		kind: "organ",
		name: "폐활량 강화",
		desc: "호흡이 깊어지고 몸이 바람을 다루기 시작합니다.",
		effect: "폐 레벨 +1 · Lv.3에서 질풍술사 각성 가능",
		organs: ["폐"],
		organLevel: "lung",
		apply: (g) => {
			g.organLevels.lung = Math.min(3, g.organLevels.lung + 1);
			g.organs.폐 = Math.min(100, g.organs.폐 + 8);
		},
	},
	{
		id: "organ_muscle",
		kind: "organ",
		name: "근섬유 강화",
		desc: "근섬유가 굵어지고 타격에 무게가 실립니다.",
		effect: "근육 레벨 +1 · Lv.3에서 파괴자 각성 가능",
		organs: ["근육"],
		organLevel: "muscle",
		apply: (g) => {
			g.organLevels.muscle = Math.min(3, g.organLevels.muscle + 1);
			g.organs.근육 = Math.min(100, g.organs.근육 + 8);
		},
	},
];
type CardDef = {
	id: string;
	name: string;
	kind: CardKind;
	organs: OrganKey[];
	main?: CoreOrgan;
	support?: CoreOrgan;
	maxLevel: number;
	desc: string;
	effect: string;
	cost?: string;
	tier?: AugmentTier;
	/** 생활 카드가 등장하는 스테이지(연령대) 인덱스. 없으면 전 구간 */
	stages?: number[];
	apply?: (g: Game) => void;
};
const CLASS_CARD_CONTENT: CardDef[] = [
	{
		id: "heart_adrenaline",
		name: "아드레날린",
		kind: "class",
		tier: 2,
		organs: ["심장"],
		main: "heart",
		maxLevel: 3,
		desc: "근처에 적이 있으면 공격 간격이 감소합니다.",
		effect: "근처 적 존재 시 공격 간격 -30/-35/-40%",
	},
	{
		id: "heart_shock",
		name: "심박 충격",
		kind: "class",
		tier: 2,
		organs: ["심장"],
		main: "heart",
		maxLevel: 3,
		desc: "연타의 마지막 공격이 주변을 밀어내는 충격파로 변합니다.",
		effect: "4번째 공격마다 80% 범위 피해 · Lv.3 심장 표식",
	},
	{
		id: "heart_overload",
		name: "과부하 연타",
		kind: "class",
		tier: 2,
		organs: ["심장"],
		main: "heart",
		maxLevel: 3,
		desc: "한 적을 계속 공격하면 강력한 일격이 발생합니다.",
		effect: "동일 대상 5회 타격 뒤 2.2배 피해",
	},
	{
		id: "heart_bloodflow",
		name: "혈류 가속",
		kind: "class",
		tier: 4,
		organs: ["심장"],
		main: "heart",
		maxLevel: 3,
		desc: "가까운 적을 쓰러뜨리면 잠시 이동 속도가 증가합니다.",
		effect: `근거리 처치 후 ${AUGMENT_BALANCE.heartBloodflow.durationSeconds.join("/")}초간 이동 속도 +${percentLevels(AUGMENT_BALANCE.heartBloodflow.speedBonus)}%`,
	},
	{
		id: "brain_synapse",
		name: "시냅스 증식",
		kind: "class",
		tier: 2,
		organs: ["뇌"],
		main: "brain",
		maxLevel: 3,
		desc: "주변을 도는 에너지 코어가 하나 추가됩니다.",
		effect: "실제 에너지 코어 +1",
	},
	{
		id: "brain_chain",
		name: "연쇄 사고",
		kind: "class",
		tier: 1,
		organs: ["뇌"],
		main: "brain",
		maxLevel: 3,
		desc: "코어 공격이 근처의 적에게 튕깁니다.",
		effect: "연쇄 +1 · 연쇄 피해 70%",
	},
	{
		id: "brain_focus",
		name: "집중 사고",
		kind: "class",
		tier: 4,
		organs: ["뇌"],
		main: "brain",
		maxLevel: 3,
		desc: "코어가 강한 적을 우선적으로 공격합니다.",
		effect: `최고 체력 우선 · 엘리트/보스 피해 +${percentLevels(AUGMENT_BALANCE.brainFocus.eliteBossDamageBonus)}%`,
	},
	{
		id: "brain_frenzy",
		name: "사고 폭주",
		kind: "class",
		tier: 3,
		organs: ["뇌"],
		main: "brain",
		maxLevel: 3,
		desc: "적을 연속으로 처치하면 모든 코어가 동시에 폭주합니다.",
		effect: `${AUGMENT_BALANCE.brainFrenzy.killsPerProc.join("/")}킬마다 모든 코어 추가 사격`,
	},
	{
		id: "liver_footprints",
		name: "독성 발자국",
		kind: "class",
		tier: 3,
		organs: ["간"],
		main: "liver",
		maxLevel: 3,
		desc: "더 촘촘하게 오래 남는 독 흔적을 만듭니다.",
		effect: "생성 간격 -30% · 지속시간 +20%",
	},
	{
		id: "liver_overlap",
		name: "오염 중첩",
		kind: "class",
		tier: 1,
		organs: ["간"],
		main: "liver",
		maxLevel: 3,
		desc: "같은 길을 다시 지나가면 독 지대가 강해집니다.",
		effect: `최대 ${AUGMENT_BALANCE.liverOverlap.maxStacks.join("/")}중첩 · 중첩마다 범위 +${Math.round((AUGMENT_BALANCE.liverOverlap.radiusGrowth - 1) * 100)}%`,
	},
	{
		id: "liver_rupture",
		name: "독성 파열",
		kind: "class",
		tier: 2,
		organs: ["간"],
		main: "liver",
		maxLevel: 3,
		desc: "중독된 적이 죽으면 주변에 독을 터뜨립니다.",
		effect: "중독 중첩 비례 폭발 · 주변 적 중독",
	},
	{
		id: "liver_concentrated",
		name: "농축 독",
		kind: "class",
		tier: 2,
		organs: ["간"],
		main: "liver",
		maxLevel: 3,
		desc: "독 지대에 오래 머문 적일수록 빠르게 중독됩니다.",
		effect: `지대 안에서 ${AUGMENT_BALANCE.liverConcentrated.tickSeconds.join("/")}초마다 독 중첩 +1`,
	},
	{
		id: "lung_bladewind",
		name: "칼바람",
		kind: "class",
		tier: 2,
		organs: ["폐"],
		main: "lung",
		maxLevel: 3,
		desc: "일정 거리마다 이동 방향으로 바람 칼날을 날립니다.",
		effect: "이동 거리마다 관통 바람 칼날 발사 · 레벨마다 발사 간격 감소",
	},
	{
		id: "lung_afterimage",
		name: "잔상 호흡",
		kind: "class",
		tier: 3,
		organs: ["폐"],
		main: "lung",
		maxLevel: 3,
		desc: "모멘텀이 가득 찰수록 남긴 잔상이 적을 벱니다.",
		effect: "최대 모멘텀에서 이동 잔상이 주변 적에게 지속 피해",
	},
	{
		id: "lung_eyestorm",
		name: "태풍의 눈",
		kind: "class",
		tier: 1,
		organs: ["폐"],
		main: "lung",
		maxLevel: 3,
		desc: "계속 이동하면 주변에 작은 회오리가 돕니다.",
		effect: "이동 중 주기적으로 회오리 생성 · 레벨마다 개수 증가",
	},
	{
		id: "lung_circulation",
		name: "순환 가속",
		kind: "class",
		tier: 4,
		organs: ["폐"],
		main: "lung",
		maxLevel: 3,
		desc: "적을 쓰러뜨리면 숨 돌릴 틈 없이 더 빨라집니다.",
		effect: `처치 시 ${AUGMENT_BALANCE.lungCirculation.durationSeconds.join("/")}초간 모멘텀 유지 · 이동 속도 +${percentLevels(AUGMENT_BALANCE.lungCirculation.speedBonus)}%`,
	},
	{
		id: "muscle_overcontract",
		name: "과잉 수축",
		kind: "class",
		tier: 3,
		organs: ["근육"],
		main: "muscle",
		maxLevel: 3,
		desc: "근수축이 폭발적으로 커집니다.",
		effect: "기본 강타 범위와 넉백 증가 · 레벨마다 강화",
	},
	{
		id: "muscle_chaincollide",
		name: "연쇄 충돌",
		kind: "class",
		tier: 2,
		organs: ["근육"],
		main: "muscle",
		maxLevel: 3,
		desc: "밀린 적이 다른 적과 충돌하면 주변에 추가 폭발이 발생합니다.",
		effect: "주변 적에게 공격력 80% 피해 · 폭발 반경 88/114/141",
	},
	{
		id: "muscle_painfuel",
		name: "고통 연료",
		kind: "class",
		tier: 4,
		organs: ["근육"],
		main: "muscle",
		maxLevel: 3,
		desc: "맞을수록 다음 강타가 무거워집니다.",
		effect: "피해를 받으면 지면 강타 충전 증가",
	},
	{
		id: "muscle_gravity",
		name: "중력 압박",
		kind: "class",
		tier: 1,
		organs: ["근육"],
		main: "muscle",
		maxLevel: 3,
		desc: "강타 직전 적을 끌어모아 함께 터뜨립니다.",
		effect: `강타 탐색 범위 ${AUGMENT_BALANCE.muscleGravity.rangeMultiplier.join("/")}배 · 당김 거리 ${AUGMENT_BALANCE.muscleGravity.pullDistance.join("/")}`,
	},
];
const AUGMENT_CATALOG = createAugmentCatalog(AUGMENT_CATALOG_DATA);
const CLASS_CARDS: CardDef[] = CLASS_CARD_CONTENT.map((card) => ({ ...card, ...AUGMENT_CATALOG.get(card.id) }));
const FUSION_CARDS: CardDef[] = [
	{
		id: "fusion_heart_brain",
		name: "뇌근 동기화",
		kind: "fusion",
		organs: ["심장", "뇌"],
		main: "heart",
		support: "brain",
		maxLevel: 1,
		desc: "주먹과 신경 코어가 동기화됩니다.",
		effect: "콤보 피니시마다 추적 에너지탄 발사",
	},
	{
		id: "fusion_heart_liver",
		name: "독성 파이터",
		kind: "fusion",
		organs: ["심장", "간"],
		main: "heart",
		support: "liver",
		maxLevel: 1,
		desc: "주먹에 독을 쌓고 연타의 마지막 공격으로 터뜨립니다.",
		effect: "근접 공격 중독 · 피니시 독 폭발",
	},
	{
		id: "fusion_brain_heart",
		name: "맥동 코어",
		kind: "fusion",
		organs: ["뇌", "심장"],
		main: "brain",
		support: "heart",
		maxLevel: 1,
		desc: "심장 박동이 에너지 코어를 가속합니다.",
		effect: "적과 가까울수록 코어 공격 속도 최대 +35%",
	},
	{
		id: "fusion_brain_liver",
		name: "신경 독성",
		kind: "fusion",
		organs: ["뇌", "간"],
		main: "brain",
		support: "liver",
		maxLevel: 1,
		desc: "코어가 중독된 적을 추적하고 독을 전염시킵니다.",
		effect: "중독 적 우선 타깃 · 처치 시 독 전염",
	},
	{
		id: "fusion_liver_heart",
		name: "독성 폭주",
		kind: "fusion",
		organs: ["간", "심장"],
		main: "liver",
		support: "heart",
		maxLevel: 1,
		desc: "독 지대가 처치를 먹고 폭발을 충전합니다.",
		effect: "지대 안 3킬마다 독성 폭발",
	},
	{
		id: "fusion_liver_brain",
		name: "추적 독성",
		kind: "fusion",
		organs: ["간", "뇌"],
		main: "liver",
		support: "brain",
		maxLevel: 1,
		desc: "독 지대가 스스로 적을 추적해 번집니다.",
		effect: "독성 코어가 적 위치에 작은 독 지대 생성",
	},
];
// 생활 카드는 스테이지(연령대)별로 나뉜다: 0 학교(0—20세) / 1 회사(20—40세) / 2 아파트(40—60세) / 3 병원(60—80세)
const LIFE_CARD_CONTENT: CardDef[] = [
	// ── 0—20세 · 학교 ──────────────────────────────
	{
		id: "life_night_study",
		name: "밤샘 공부",
		kind: "life",
		organs: ["뇌"],
		stages: [0],
		maxLevel: 1,
		desc: "자동 공격이 더 빠르고 더 멀리 이어집니다.",
		effect: "연쇄 +1 · 공격 주기 -15%",
		cost: "최대 체력 -15%",
		apply: (g) => {
			g.chainBonus++;
			g.fireRate *= 0.85;
			g.maxHp *= 0.85;
			g.hp = Math.min(g.hp, g.maxHp);
		},
	},
	{
		id: "life_sports",
		name: "운동부 입단",
		kind: "life",
		organs: ["심장"],
		stages: [0],
		maxLevel: 1,
		desc: "근접 범위가 넓어지고 처치 후 빠르게 이동합니다.",
		effect: "근접 범위 +20% · 근거리 처치 이동 +15%",
		cost: "원거리·코어 피해 -10%",
		apply: (g) => {
			g.meleeRange *= 1.2;
			g.rangedDamageMul *= 0.9;
		},
	},
	{
		id: "life_snack",
		name: "매점 단골",
		kind: "life",
		organs: ["간"],
		stages: [0],
		maxLevel: 1,
		desc: "먹는 걸로 버팁니다. 회복 세포가 더 크게 듣습니다.",
		effect: "회복 효과 +30%",
		cost: "방어 -1.5",
		apply: (g) => {
			g.recoveryPenalty = Math.max(-0.5, g.recoveryPenalty - 0.3);
			g.armor = Math.max(0, g.armor - 1.5);
		},
	},
	{
		id: "life_bike",
		name: "자전거 통학",
		kind: "life",
		organs: ["폐"],
		stages: [0],
		maxLevel: 1,
		desc: "매일 페달을 밟은 다리가 발을 가볍게 만듭니다.",
		effect: "이동 속도 +12%",
		cost: "최대 체력 -10",
		apply: (g) => {
			g.speed *= 1.12;
			g.maxHp -= 10;
			g.hp = Math.min(g.hp, g.maxHp);
		},
	},
	{
		id: "life_parttime",
		name: "짐 나르기 알바",
		kind: "life",
		organs: ["근육"],
		stages: [0],
		maxLevel: 1,
		desc: "무거운 것을 들다 보니 한 대가 묵직해졌습니다.",
		effect: "공격력 +3",
		cost: "이동 속도 -8%",
		apply: (g) => {
			g.damage += 3;
			g.speed *= 0.92;
		},
	},
	// ── 20—40세 · 회사 ─────────────────────────────
	{
		id: "life_dinner",
		name: "동아리 뒤풀이",
		kind: "life",
		organs: ["간"],
		stages: [1],
		maxLevel: 1,
		desc: "독 지대가 더욱 넓고 오래 유지됩니다.",
		effect: "독 범위·지속시간 +25%",
		cost: "회복 효과 -25%",
		apply: (g) => {
			g.poisonRadiusMul *= 1.25;
			g.poisonDurationMul *= 1.25;
			g.recoveryPenalty = Math.min(0.75, g.recoveryPenalty + 0.25);
		},
	},
	{
		id: "life_overtime",
		name: "신입 야근",
		kind: "life",
		organs: ["뇌"],
		stages: [1],
		maxLevel: 1,
		desc: "밤을 태워 사고량을 늘렸지만 손끝이 떨립니다.",
		effect: "투사체 +1",
		cost: "조준 흔들림 증가",
		apply: (g) => {
			g.projectiles++;
			g.unstableAim += 0.14;
		},
	},
	{
		id: "life_gym",
		name: "헬스장 등록",
		kind: "life",
		organs: ["근육"],
		stages: [1],
		maxLevel: 1,
		desc: "한 방은 무거워졌지만 손은 느려졌습니다.",
		effect: "공격력 +4",
		cost: "공격 주기 +10%",
		apply: (g) => {
			g.damage += 4;
			g.fireRate *= 1.1;
		},
	},
	{
		id: "life_commute_run",
		name: "출퇴근 러닝",
		kind: "life",
		organs: ["폐"],
		stages: [1],
		maxLevel: 1,
		desc: "출퇴근을 뛰어서 해결합니다. 몸이 가벼워집니다.",
		effect: "이동 속도 +15%",
		cost: "방어 -1.5",
		apply: (g) => {
			g.speed *= 1.15;
			g.armor = Math.max(0, g.armor - 1.5);
		},
	},
	// ── 40—60세 · 아파트 ───────────────────────────
	{
		id: "life_company_dinner",
		name: "회식의 제왕",
		kind: "life",
		organs: ["간"],
		stages: [2],
		maxLevel: 1,
		desc: "잔을 받아내는 동안 몸에 독이 쌓였습니다.",
		effect: "독 지속시간 +30% · 공격력 +2",
		cost: "최대 체력 -12%",
		apply: (g) => {
			g.poisonDurationMul *= 1.3;
			g.damage += 2;
			g.maxHp *= 0.88;
			g.hp = Math.min(g.hp, g.maxHp);
		},
	},
	{
		id: "life_insomnia",
		name: "만성 불면",
		kind: "life",
		organs: ["뇌"],
		stages: [2],
		maxLevel: 1,
		desc: "잠들지 못한 밤이 반응 속도만 남겼습니다.",
		effect: "공격 주기 -18%",
		cost: "방어 -2",
		apply: (g) => {
			g.fireRate *= 0.82;
			g.armor = Math.max(0, g.armor - 2);
		},
	},
	{
		id: "life_hiking",
		name: "주말 등산",
		kind: "life",
		organs: ["폐"],
		stages: [2],
		maxLevel: 1,
		desc: "주말마다 오른 산이 버티는 힘이 됩니다.",
		effect: "최대 체력 +18%",
		cost: "이동 속도 -10%",
		apply: (g) => {
			const add = g.maxHp * 0.18;
			g.maxHp += add;
			g.hp += add;
			g.speed *= 0.9;
		},
	},
	{
		id: "life_bp_med",
		name: "혈압약 복용",
		kind: "life",
		organs: ["심장"],
		stages: [2],
		maxLevel: 1,
		desc: "약으로 심장을 눌러 두었습니다. 안정적이지만 무뎌집니다.",
		effect: "방어 +2",
		cost: "공격력 -2",
		apply: (g) => {
			g.armor += 2;
			g.damage = Math.max(4, g.damage - 2);
		},
	},
	// ── 60—80세 · 병원 ─────────────────────────────
	{
		id: "life_morning_walk",
		name: "새벽 산책",
		kind: "life",
		organs: ["심장"],
		stages: [3],
		maxLevel: 1,
		desc: "매일 같은 시각에 걷습니다. 회복이 잘 듣는 몸이 됩니다.",
		effect: "회복 효과 +35%",
		cost: "이동 속도 -10%",
		apply: (g) => {
			g.recoveryPenalty = Math.max(-0.5, g.recoveryPenalty - 0.35);
			g.speed *= 0.9;
		},
	},
	{
		id: "life_rehab",
		name: "재활 운동",
		kind: "life",
		organs: ["근육"],
		stages: [3],
		maxLevel: 1,
		desc: "무너진 근육을 다시 세웁니다. 느리지만 단단해집니다.",
		effect: "최대 체력 +20%",
		cost: "공격 주기 +10%",
		apply: (g) => {
			const add = g.maxHp * 0.2;
			g.maxHp += add;
			g.hp += add;
			g.fireRate *= 1.1;
		},
	},
	{
		id: "life_meds",
		name: "처방약 의존",
		kind: "life",
		organs: ["뇌"],
		stages: [3],
		maxLevel: 1,
		desc: "약으로 정신을 붙잡습니다. 대신 몸이 급격히 상합니다.",
		effect: "공격 주기 -20%",
		cost: "최대 체력 -18%",
		apply: (g) => {
			g.fireRate *= 0.8;
			g.maxHp *= 0.82;
			g.hp = Math.min(g.hp, g.maxHp);
		},
	},
	{
		id: "life_oxygen",
		name: "산소 치료",
		kind: "life",
		organs: ["폐"],
		stages: [3],
		maxLevel: 1,
		desc: "호흡을 되찾아 한 번 더 몸을 던질 수 있습니다.",
		effect: "대시 충전 +1",
		cost: "공격력 -3",
		apply: (g) => {
			g.maxDash++;
			g.dashCharges++;
			g.damage = Math.max(4, g.damage - 3);
		},
	},
];
// 생활은 해당 장기 수치를 함께 끌어올린다: 이번 생애의 성향이자 다음 생애 유전으로 이어진다
const LIFE_CARDS: CardDef[] = LIFE_CARD_CONTENT.map((d) => ({
	...d,
	apply: (g) => {
		d.apply?.(g);
		for (const k of d.organs) g.organs[k] = Math.min(100, g.organs[k] + 6);
	},
}));
const COMMON_CARDS: CardDef[] = [
	{
		id: "common_division",
		name: "세포 분열",
		kind: "common",
		organs: [],
		maxLevel: 1,
		desc: "죽음에 이르면 한 번만 다시 살아납니다.",
		effect: "사망 시 체력 40%로 1회 부활",
		apply: (g) => {
			g.reviveAvailable = true;
		},
	},
	{
		id: "common_regen",
		name: "재생 인자",
		kind: "common",
		organs: [],
		maxLevel: 1,
		desc: "적을 계속 처치하면 신체가 스스로 회복됩니다.",
		effect: "20킬마다 최대 체력의 8% 회복",
	},
	{
		id: "common_membrane",
		name: "세포막 강화",
		kind: "common",
		organs: [],
		maxLevel: 1,
		desc: "잠시 피해를 받지 않으면 보호막이 생성됩니다.",
		effect: "8초 무피격 시 최대 체력 15% 보호막",
	},
];
const cardLevel = (g: Game, id: string) => g.cardLevels[id] || 0;
const toChoice = (d: CardDef): Choice => ({
	id: d.id,
	kind: d.kind,
	name: d.name,
	desc: d.desc,
	effect: d.effect,
	cost: d.cost,
	organs: d.organs,
	maxLevel: d.maxLevel,
	tier: d.tier,
	apply: (g) => {
		g.cardLevels[d.id] = cardLevel(g, d.id) + 1;
		if (!g.acquiredCards.includes(d.id)) g.acquiredCards.push(d.id);
		if (d.kind === "class") recordAugmentPick(g, AUGMENT_CATALOG, d.id);
		d.apply?.(g);
	},
});
const gameRandom = (g: Game) => {
	let t = (g.randomState = (g.randomState + 0x6d2b79f5) >>> 0);
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffled = <T,>(g: Game, items: T[]) => {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(gameRandom(g) * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
};
const available = (g: Game, items: CardDef[]) => items.filter((d) => cardLevel(g, d.id) < d.maxLevel);
// 생활 카드는 현재 스테이지(연령대)에 해당하는 것만 후보가 된다
const lifePool = (g: Game) => available(g, LIFE_CARDS).filter((d) => !d.stages || d.stages.includes(g.stage));
const eligibleFusions = (g: Game) =>
	FUSION_CARDS.filter(
		(d) => d.main === g.mainClass && d.support && g.organLevels[d.support] >= 2 && !g.acquiredCards.includes(d.id),
	);
type ChoiceSource = "level" | "boss";
const classCardCandidates = (g: Game, excluded: Set<string>, weakestTier: AugmentTier = 4) =>
	getAvailableAugments({
		state: g,
		cards: CLASS_CARDS.filter(
			(card): card is CardDef & { main: CoreOrgan; tier: AugmentTier } =>
				card.main !== undefined && card.tier !== undefined,
		),
		catalog: AUGMENT_CATALOG,
		excluded,
		weakestTier,
	});
const pickTieredClassCard = (g: Game, excluded: Set<string>, weakestTier: AugmentTier = 4): Choice | undefined => {
	const card = pickTieredAugment({
		state: g,
		cards: CLASS_CARDS.filter(
			(candidate): candidate is CardDef & { main: CoreOrgan; tier: AugmentTier } =>
				candidate.main !== undefined && candidate.tier !== undefined,
		),
		catalog: AUGMENT_CATALOG,
		config: AUGMENT_BALANCE,
		excluded,
		weakestTier,
		random: () => gameRandom(g),
	});
	return card ? toChoice(card) : undefined;
};
const weightedChoices = (g: Game, source: ChoiceSource = "level"): Choice[] => {
	const fusion = eligibleFusions(g)[0];
	const pools: { w: number; kind: "class" | "fixed"; c?: Choice[] }[] = g.awakened
		? [
				{ w: 45, kind: "class" },
				{ w: 25, kind: "fixed", c: ORGAN_GROWTH },
				{ w: 15, kind: "fixed", c: lifePool(g).map(toChoice) },
				{ w: 15, kind: "fixed", c: available(g, COMMON_CARDS).map(toChoice) },
			]
		: [
				{ w: 60, kind: "fixed", c: ORGAN_GROWTH },
				{ w: 20, kind: "fixed", c: lifePool(g).map(toChoice) },
				{ w: 20, kind: "fixed", c: available(g, COMMON_CARDS).map(toChoice) },
			];
	const picks: Choice[] = fusion ? [toChoice(fusion)] : [];
	const choiceKey = (choice: Choice) =>
		choice.id ?? (choice.organLevel ? `organ:${choice.organLevel}` : `name:${choice.name}`);
	const excluded = () => new Set(picks.map(choiceKey));
	if (g.awakened && picks.length < 3) {
		const pityDue = g.tierPity >= AUGMENT_BALANCE.tierSystem.pityAfterOffers - 1;
		const weakestTier = (
			pityDue
				? AUGMENT_BALANCE.tierSystem.pityWeakestGuaranteedTier
				: source === "boss"
					? AUGMENT_BALANCE.tierSystem.bossWeakestGuaranteedTier
					: 0
		) as AugmentTier | 0;
		if (weakestTier) {
			const guaranteed = pickTieredClassCard(g, excluded(), weakestTier);
			if (guaranteed) picks.push(guaranteed);
		}
	}
	while (picks.length < 3) {
		const used = excluded(),
			usable = pools.filter((p) =>
				p.kind === "class"
					? classCardCandidates(g, used).length
					: Boolean(p.c?.some((choice) => !used.has(choiceKey(choice)))),
			);
		if (!usable.length) break;
		let roll = gameRandom(g) * usable.reduce((s, p) => s + p.w, 0),
			pool = usable[0];
		for (const p of usable) {
			roll -= p.w;
			if (roll <= 0) {
				pool = p;
				break;
			}
		}
		const raw =
			pool.kind === "class"
				? pickTieredClassCard(g, used)
				: shuffled(g, pool.c ?? []).find((choice) => !used.has(choiceKey(choice)));
		if (!raw) continue;
		picks.push(raw);
	}
	if (!g.awakened && g.benchmarkTarget) {
		const target = ORGAN_GROWTH.find((choice) => choice.organLevel === g.benchmarkTarget);
		if (target && !picks.some((choice) => choice.id === target.id)) {
			if (picks.length >= 3) picks[picks.length - 1] = target;
			else picks.push(target);
		}
	}
	if (g.awakened && classCardCandidates(g, new Set()).length) {
		g.tierPity = picks.some(
			(choice) =>
				choice.kind === "class" && choice.tier && choice.tier <= AUGMENT_BALANCE.tierSystem.pityWeakestGuaranteedTier,
		)
			? 0
			: g.tierPity + 1;
	}
	return picks;
};
// 후보가 3장에 못 미치면 일반 추첨으로 메운다: 생활 풀이 말라도 선택지가 1~2장으로 쪼그라들지 않게
const fillChoices = (g: Game, picks: Choice[]): Choice[] => {
	const key = (c: Choice) => c.id ?? (c.organLevel ? `organ:${c.organLevel}` : `name:${c.name}`);
	const seen = new Set(picks.map(key));
	for (const extra of weightedChoices(g)) {
		if (picks.length >= 3) break;
		if (seen.has(key(extra))) continue;
		seen.add(key(extra));
		picks.push(extra);
	}
	return picks.slice(0, 3);
};
const awakeningChoices = (organ: CoreOrgan): Choice[] => {
	const meta = CORE_META[organ];
	return [
		{
			id: `awaken_${organ}`,
			name: `${meta.className}로 각성`,
			desc: `${meta.key}의 힘을 이번 생애의 주 전투 방식으로 고정합니다.`,
			effect: `주 직업 고정 · SPACE 액션 ${meta.action}`,
			organs: [meta.key],
			awakening: organ,
			apply: (g) => {
				g.mainClass = organ;
				g.awakened = true;
				if (organ === "heart" || organ === "lung") {
					g.maxDash = 2;
					g.dashCharges = 2;
				}
			},
		},
		{
			id: `hold_${organ}`,
			name: "각성 보류",
			desc: "Lv.3 효과만 유지하고 다른 장기의 가능성을 더 탐색합니다.",
			effect: "공용 에너지탄 유지 · 나중에 다시 각성 가능",
			organs: [meta.key],
			awakening: "hold",
			apply: (g) => {
				if (!g.deferredAwakenings.includes(organ)) g.deferredAwakenings.push(organ);
			},
		},
	];
};
const BUILDS: Choice[] = CHEMISTRY.map((c) => ({
	name: c.name,
	desc: `${ORGAN_META[c.organs[0]].icon} ${c.organs[0]}과 ${ORGAN_META[c.organs[1]].icon} ${c.organs[1]}이 하나의 전투 방식으로 각성합니다.`,
	effect: c.effect,
	organs: c.organs,
	chemistry: c.id,
	apply: (g) => {
		c.organs.forEach((k) => (g.organs[k] = Math.min(100, g.organs[k] + 8)));
		if (c.id === "brain_lung") {
			g.maxDash = 2;
			g.dashCharges = 2;
			g.dash = 0;
		}
	},
}));
const ORGAN_GUIDE = [
	{
		key: "뇌" as OrganKey,
		title: "투사체 · 조준",
		copy: "활성 시 추가 시냅스 탄환을 발사합니다. 위험하면 조준이 흔들립니다.",
	},
	{ key: "심장" as OrganKey, title: "생존 · 박동", copy: "활성 시 회복과 피해를 동시에 주는 심장 박동이 발생합니다." },
	{ key: "폐" as OrganKey, title: "이동 · 대시", copy: "활성 시 이동 속도가 증가하고 대시에 공격 잔상이 남습니다." },
	{ key: "간" as OrganKey, title: "독성 · 부작용", copy: "활성 시 주변 적을 지속 공격하는 독성 오라가 생깁니다." },
	{
		key: "근육" as OrganKey,
		title: "물리 · 충격파",
		copy: "활성 시 공격력이 오르고 주기적으로 거대한 폭발탄을 발사합니다.",
	},
];
const ITEM_GUIDE = [
	["교과서", "뇌 성장"],
	["운동화", "폐·근육 성장"],
	["매점빵", "회복과 간 부담"],
	["노트북", "투사체 강화"],
	["커피", "연사와 피로"],
	["회식 잔", "독성과 간 부담"],
	["배달 음식", "대량 회복"],
	["검진표", "약한 장기 회복"],
	["등산화", "심폐 강화"],
	["재활 밴드", "근육 회복"],
	["건강식", "간·심장 회복"],
	["명상 염주", "뇌·폐 안정"],
];

function fresh(difficulty: Difficulty = "normal"): Game {
	return {
		w: 1280,
		h: 720,
		worldW: 2400,
		worldH: 1600,
		t: 0,
		stage: 0,
		stageT: 0,
		hp: 100,
		maxHp: 100,
		x: 1200,
		y: 800,
		vx: 0,
		vy: 0,
		touchX: 0,
		touchY: 0,
		dash: 0,
		dashCharges: 1,
		maxDash: 1,
		inv: 0,
		fire: 0,
		kills: 0,
		organs: { 뇌: 55, 심장: 55, 폐: 55, 간: 55, 근육: 55 },
		mobs: [],
		shots: [],
		parts: [],
		drops: [],
		warnings: [],
		fields: [],
		keys: new Set(),
		choices: [],
		augments: [],
		level: 1,
		xp: 0,
		nextXp: 12,
		paused: false,
		damage: 14,
		armor: 3,
		fireRate: 0.42,
		speed: 210,
		projectiles: 1,
		poison: 0,
		pulse: 0,
		runner: 0,
		bossSpawned: false,
		choiceDone: false,
		augmentDone: false,
		last: 0,
		simulationAccumulator: 0,
		randomSeed: 1,
		randomState: 1,
		shake: 0,
		difficulty,
		lastHeart: -1,
		effect: "",
		effectT: 0,
		shotCount: 0,
		hudAt: 0,
		chemistries: [],
		dashFx: 0,
		castFx: 0,
		castAngle: 0,
		heartFx: 0,
		organLevels: { heart: 0, brain: 0, liver: 0, lung: 0, muscle: 0 },
		mainClass: null,
		awakened: false,
		deferredAwakenings: [],
		cardLevels: {},
		acquiredCards: [],
		tierPity: 0,
		lastAugmentBranch: null,
		augmentBranchStreak: 0,
		meleeCombo: 0,
		moveBuff: 0,
		poisonTrailDistance: 0,
		lastTrailX: 1200,
		lastTrailY: 800,
		toxicCoreCooldown: 0,
		killsSinceRegen: 0,
		noDamage: 0,
		shield: 0,
		reviveAvailable: false,
		meleeRange: 115,
		rangedDamageMul: 1,
		chainBonus: 0,
		poisonRadiusMul: 1,
		poisonDurationMul: 1,
		brainVolley: 0,
		fatigue: 0,
		unstableAim: 0,
		recoveryPenalty: 0,
		momentum: 0,
		bossWeakTarget: null,
		lastFatigue: 0,
		skillFx: [],
		debug: false,
		benchmark: false,
		benchmarkTarget: null,
		benchmarkSpeed: 1,
		benchmarkStopAt: 0,
		benchmarkActionCooldown: 0,
		invuln: false,
		galeMomentum: 0,
		windTrailDist: 0,
		galeKillLock: 0,
		impactCharge: 0,
		telemetry: {
			runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			startedAt: new Date().toISOString(),
			damageDealt: 0,
			damageBySource: {},
			damageTaken: 0,
			damageBlocked: 0,
			hitsTaken: 0,
			healingReceived: 0,
			distanceTraveled: 0,
			actionsUsed: 0,
			choices: [],
			bossResults: [],
		},
		hurtT: 0,
		hurtDir: 0,
		lowHpWarned: false,
		lastDamageCause: null,
	};
}
function dealDamage(g: Game, mob: Mob, amount: number, source: string) {
	const dealt = Math.max(0, Math.min(mob.hp, amount));
	mob.hp -= dealt;
	g.telemetry.damageDealt += dealt;
	g.telemetry.damageBySource[source] = (g.telemetry.damageBySource[source] || 0) + dealt;
	return dealt;
}
function healPlayer(g: Game, amount: number) {
	const before = g.hp;
	g.hp = Math.min(g.maxHp, g.hp + amount);
	g.telemetry.healingReceived += Math.max(0, g.hp - before);
	return g.hp - before;
}
function finalizeTelemetry(g: Game, win: boolean): RunTelemetry {
	return {
		schemaVersion: 1,
		runId: g.telemetry.runId,
		startedAt: g.telemetry.startedAt,
		endedAt: new Date().toISOString(),
		difficulty: g.difficulty,
		debug: g.debug,
		benchmark: g.benchmark,
		benchmarkTarget: g.benchmarkTarget,
		benchmarkSpeed: g.benchmarkSpeed,
		benchmarkSeed: g.randomSeed,
		result: win ? "clear" : "defeat",
		class: g.mainClass,
		survivalSeconds: Number(g.t.toFixed(2)),
		stage: g.stage + 1,
		playerLevel: g.level,
		kills: g.kills,
		bossKills: g.telemetry.bossResults.length,
		damageDealt: Number(g.telemetry.damageDealt.toFixed(2)),
		damageBySource: Object.fromEntries(
			Object.entries(g.telemetry.damageBySource)
				.sort((a, b) => b[1] - a[1])
				.map(([key, value]) => [key, Number(value.toFixed(2))]),
		),
		damageTaken: Number(g.telemetry.damageTaken.toFixed(2)),
		damageBlocked: Number(g.telemetry.damageBlocked.toFixed(2)),
		hitsTaken: g.telemetry.hitsTaken,
		healingReceived: Number(g.telemetry.healingReceived.toFixed(2)),
		distanceTraveled: Number(g.telemetry.distanceTraveled.toFixed(1)),
		actionsUsed: g.telemetry.actionsUsed,
		deathCause: win ? null : g.lastDamageCause,
		choices: [...g.telemetry.choices],
		bossResults: [...g.telemetry.bossResults],
		cardLevels: { ...g.cardLevels },
	};
}
function downloadTelemetry(filename: string, data: unknown) {
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
		url = URL.createObjectURL(blob),
		anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
const TELEMETRY_STORAGE_KEY = "organ-run-telemetry";
function readTelemetryHistory() {
	try {
		return JSON.parse(localStorage.getItem(TELEMETRY_STORAGE_KEY) || "[]") as RunTelemetry[];
	} catch {
		return [];
	}
}
// 직업 전용 스킬 이펙트를 큐에 넣는다. dur 동안 grow 배율까지 확대되며 알파가 사라진다.
function pushSkill(
	g: Game,
	sheet: CoreOrgan,
	index: number,
	x: number,
	y: number,
	size: number,
	dur: number,
	opts: { rot?: number; spin?: number; grow?: number } = {},
) {
	g.skillFx.push({
		sheet,
		index,
		x,
		y,
		size,
		life: dur,
		max: dur,
		rot: opts.rot ?? 0,
		spin: opts.spin ?? 0,
		grow: opts.grow ?? 1,
	});
	if (g.skillFx.length > 48) g.skillFx = g.skillFx.slice(-48);
}
function sendGameLabEvent(eventName: string, metadata: Record<string, unknown> = {}) {
	if (typeof window !== "undefined" && window.opener)
		window.opener.postMessage({ source: "game-lab-game", eventName, metadata }, "*");
}
// 한글 조사 선택: 마지막 글자 받침 유무로 판단
const hasBatchim = (s: string) => {
	if (!s) return false;
	const c = s.charCodeAt(s.length - 1);
	return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
};
const josa = (s: string, withBatchim: string, noBatchim: string) => (hasBatchim(s) ? withBatchim : noBatchim);

export default function OrganGame() {
	const canvas = useRef<HTMLCanvasElement>(null);
	const hurtRef = useRef<HTMLDivElement>(null);
	const lowRef = useRef<HTMLDivElement>(null);
	const joystick = useRef<HTMLDivElement>(null);
	const touchPointer = useRef<number | null>(null);
	const game = useRef<Game>(fresh());
	const sound = useRef<ReturnType<typeof createSoundEngine> | null>(null);
	const raf = useRef(0);
	const [mode, setMode] = useState<Mode>("start");
	const [hud, setHud] = useState({
		hp: 100,
		max: 100,
		t: 0,
		stage: 0,
		organs: game.current.organs,
		organLevels: { heart: 0, brain: 0, liver: 0, lung: 0, muscle: 0 },
		mainClass: null as MainClass,
		level: 1,
		xp: 0,
		nextXp: 12,
		loot: "",
		effect: "",
		chemistries: [] as string[],
		dashCharges: 1,
		maxDash: 1,
		armor: 3,
	});
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [menuSection, setMenuSection] = useState<"home" | "heroes" | "items" | "archive">("home");
	const [selectedHero, setSelectedHero] = useState<CoreOrgan>("heart");
	const [foundFusions, setFoundFusions] = useState<string[]>([]);
	const [stick, setStick] = useState({ x: 0, y: 0 });
	const [cards, setCards] = useState<Choice[]>([]);
	const [selectedCard, setSelectedCard] = useState(0);
	const [choiceType, setChoiceType] = useState<ChoiceType>("생활 선택");
	const [report, setReport] = useState({
		win: false,
		kills: 0,
		t: 0,
		organs: game.current.organs,
		choices: [] as string[],
		augments: [] as string[],
		mainClass: null as MainClass,
		fusions: [] as string[],
		telemetry: null as RunTelemetry | null,
	});
	const [telemetryRuns, setTelemetryRuns] = useState<RunTelemetry[]>([]);
	const [benchmarkBatch, setBenchmarkBatch] = useState<RunTelemetry[]>([]);
	const [benchmarkRunTarget, setBenchmarkRunTarget] = useState(1);
	const [archive, setArchive] = useState<{
		gene: OrganKey | null;
		chemistries: string[];
		bestKills: number;
		bestTime: number;
	}>({ gene: null, chemistries: [], bestKills: 0, bestTime: 0 });
	const orientationPaused = useRef(false);
	const runNumber = useRef(0);
	const runStartedAt = useRef(0);
	const progressMilestones = useRef(new Set<number>());
	const benchmarkBatchKey = useRef<string | null>(null);
	const benchmarkRunOffset = useRef(0);

	useEffect(() => {
		const gene = localStorage.getItem("organ-gene") as OrganKey | null;
		setArchive({
			gene: gene && ORGAN_KEYS.includes(gene) ? gene : null,
			chemistries: JSON.parse(localStorage.getItem("organ-chemistry") || "[]") as string[],
			bestKills: Number(localStorage.getItem("organ-best-kills") || 0),
			bestTime: Number(localStorage.getItem("organ-best-time") || 0),
		});
		setFoundFusions(JSON.parse(localStorage.getItem("organ-fusions") || "[]") as string[]);
		setTelemetryRuns(readTelemetryHistory());
	}, []);

	useEffect(() => {
		const query = matchMedia("(pointer: coarse) and (orientation: portrait)");
		const sync = () => {
			if (query.matches && mode === "play") {
				game.current.paused = true;
				sound.current?.pauseMusic();
				orientationPaused.current = true;
			} else if (!query.matches && orientationPaused.current && mode === "play") {
				orientationPaused.current = false;
				game.current.last = performance.now();
				game.current.paused = false;
				sound.current?.resumeMusic();
			}
		};
		sync();
		query.addEventListener("change", sync);
		return () => query.removeEventListener("change", sync);
	}, [mode]);

	const openChoice = useCallback((type: ChoiceType, picks: Choice[]) => {
		const g = game.current;
		sendGameLabEvent("game_choice_shown", {
			runNumber: runNumber.current,
			choiceType: type,
			elapsedSeconds: Math.round(g.t),
			stage: g.stage + 1,
			level: g.level,
		});
		g.paused = true;
		setChoiceType(type);
		setCards(picks);
		setSelectedCard(0);
		setMode("choice");
	}, []);

	const endGame = useCallback((win: boolean) => {
		const g = game.current;
		g.paused = true;
		sound.current?.play(win ? "win" : "lose");
		sound.current?.stopMusic();
		const organs = { ...g.organs };
		ORGAN_KEYS.forEach((k) => (organs[k] = Math.max(0, Math.min(100, Math.round(organs[k])))));
		const fusions = FUSION_CARDS.filter((f) => g.acquiredCards.includes(f.id)).map((f) => f.name);
		const telemetry = finalizeTelemetry(g, win),
			history = [...readTelemetryHistory(), telemetry].slice(-100);
		localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(history));
		setTelemetryRuns(history);
		if (g.benchmark && g.benchmarkTarget)
			setBenchmarkBatch((old) => {
				const next = [...old, telemetry];
				if (benchmarkBatchKey.current) localStorage.setItem(benchmarkBatchKey.current, JSON.stringify(next));
				return next;
			});
		setReport({
			win,
			kills: g.kills,
			t: g.t,
			organs,
			choices: [...g.choices],
			augments: [...g.augments],
			mainClass: g.mainClass,
			fusions,
			telemetry,
		});
		const strongest = ORGAN_KEYS.reduce((a, b) => (organs[a] > organs[b] ? a : b));
		if (!g.debug && !g.benchmark) {
			localStorage.setItem("organ-gene", strongest);
			const bestKills = Math.max(g.kills, Number(localStorage.getItem("organ-best-kills") || 0)),
				bestTime = Math.max(g.t, Number(localStorage.getItem("organ-best-time") || 0));
			localStorage.setItem("organ-best-kills", String(bestKills));
			localStorage.setItem("organ-best-time", String(bestTime));
			setArchive((old) => ({ ...old, gene: strongest, bestKills, bestTime }));
		}
		sendGameLabEvent("game_run_ended", {
			runNumber: runNumber.current,
			endReason: win ? "clear" : "fail",
			durationMs: Date.now() - runStartedAt.current,
			progress: Math.min(1, g.t / RUN_TARGET),
			score: g.kills,
			kills: g.kills,
			stage: g.stage + 1,
			level: g.level,
			quitPoint: `stage_${g.stage + 1}_${Math.round(g.stageT)}s`,
		});
		if (win) sendGameLabEvent("game_completed", { runNumber: runNumber.current, score: g.kills });
		setMode("report");
	}, []);

	const start = useCallback(
		(difficulty: Difficulty = "normal") => {
			const params = new URLSearchParams(window.location.search),
				preview = typeof window !== "undefined" && params.get("preview") !== null;
			setBenchmarkRunTarget(Math.max(1, Math.min(20, Number(params.get("runs")) || 1)));
			sound.current ??= createSoundEngine();
			sound.current.setMuted(isMuted || preview);
			if (!preview) {
				sound.current.play("start");
				sound.current.startMusic();
			}
			const g = fresh(difficulty),
				benchmarkTarget = params.get("autoplay") as CoreOrgan | null;
			g.benchmark = params.get("benchmark") === "1";
			g.benchmarkTarget =
				g.benchmark && (["heart", "brain", "liver", "lung", "muscle"] as CoreOrgan[]).includes(benchmarkTarget)
					? benchmarkTarget
					: null;
			g.benchmarkSpeed = g.benchmark ? Math.max(1, Math.min(60, Math.floor(Number(params.get("speed")) || 1))) : 1;
			g.benchmarkStopAt = g.benchmark ? Math.max(0, Math.min(RUN_TARGET, Number(params.get("duration")) || 0)) : 0;
			const gene = localStorage.getItem("organ-gene") as OrganKey | null;
			if (g.benchmarkTarget && runNumber.current === 0) {
				benchmarkBatchKey.current = `organ-benchmark-${params.get("batch") || "default"}-${g.benchmarkTarget}`;
				const saved = JSON.parse(localStorage.getItem(benchmarkBatchKey.current) || "[]") as RunTelemetry[];
				benchmarkRunOffset.current = saved.length;
				setBenchmarkBatch(saved);
			}
			const requestedSeed = Number(params.get("seed")),
				baseSeed =
					Number.isFinite(requestedSeed) && params.has("seed")
						? Math.trunc(requestedSeed) >>> 0
						: (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
			g.randomSeed = (baseSeed + benchmarkRunOffset.current + runNumber.current) >>> 0 || 1;
			g.randomState = g.randomSeed;
			if (!g.benchmark && gene && ORGAN_KEYS.includes(gene)) g.organs[gene] += 8;
			// 개발용 빠른 검증 모드: /?debug=heart|brain|liver (&cards=0 &fusion=<보조장기> &common=1 &life=1)
			const dbg = new URLSearchParams(window.location.search).get("debug") as CoreOrgan | null;
			if (dbg && (["heart", "brain", "liver", "lung", "muscle"] as CoreOrgan[]).includes(dbg)) {
				g.debug = true;
				g.organLevels[dbg] = 3;
				g.mainClass = dbg;
				g.awakened = true;
				if (dbg === "heart" || dbg === "lung") {
					g.maxDash = 2;
					g.dashCharges = 2;
				}
				if (params.get("cards") !== "0")
					for (const c of CLASS_CARDS)
						if (c.main === dbg) {
							g.cardLevels[c.id] = c.maxLevel;
							g.acquiredCards.push(c.id);
						}
				const fus = params.get("fusion") as CoreOrgan | null;
				if ((fus === "heart" || fus === "brain" || fus === "liver") && fus !== dbg) {
					g.organLevels[fus] = 2;
					const f = FUSION_CARDS.find((d) => d.main === dbg && d.support === fus);
					if (f) {
						g.cardLevels[f.id] = 1;
						g.acquiredCards.push(f.id);
					}
				}
				if (params.get("common") === "1")
					for (const c of COMMON_CARDS) {
						g.cardLevels[c.id] = 1;
						g.acquiredCards.push(c.id);
						c.apply?.(g);
					}
				if (params.get("life") === "1")
					for (const c of LIFE_CARDS) {
						g.cardLevels[c.id] = 1;
						g.acquiredCards.push(c.id);
						c.apply?.(g);
					}
				g.effect = `[debug] ${CORE_META[dbg].className} 각성 · B 보스 · N 잡몹 · K 정리 · H 회복 · I 무적 · G 결과`;
				g.effectT = 6;
			}
			runNumber.current += 1;
			runStartedAt.current = Date.now();
			progressMilestones.current.clear();
			if (runNumber.current > 1) sendGameLabEvent("game_restarted", { runNumber: runNumber.current });
			sendGameLabEvent("game_run_started", { runNumber: runNumber.current, difficulty });
			game.current = g;
			setHud({
				hp: g.hp,
				max: g.maxHp,
				t: 0,
				stage: 0,
				organs: { ...g.organs },
				organLevels: { ...g.organLevels },
				mainClass: g.mainClass,
				level: 1,
				xp: 0,
				nextXp: g.nextXp,
				loot: "",
				effect: "",
				chemistries: [],
				dashCharges: g.dashCharges,
				maxDash: g.maxDash,
				armor: g.armor,
			});
			setMode("play");
		},
		[isMuted],
	);

	useEffect(() => {
		if (
			mode !== "report" ||
			!report.telemetry?.benchmark ||
			!report.telemetry.benchmarkTarget ||
			benchmarkBatch.length >= benchmarkRunTarget
		)
			return;
		const timer = window.setTimeout(() => start(report.telemetry?.difficulty ?? "normal"), 500);
		return () => window.clearTimeout(timer);
	}, [mode, report.telemetry, benchmarkBatch.length, benchmarkRunTarget, start]);

	// /dev 갤러리용: ?debug=X&preview → 메뉴 건너뛰고 자동 시작(음소거)
	const autoStarted = useRef(false);
	useEffect(() => {
		if (autoStarted.current || typeof window === "undefined") return;
		const q = new URLSearchParams(window.location.search);
		if (q.get("debug") && q.get("preview") !== null) {
			autoStarted.current = true;
			start((q.get("difficulty") as Difficulty) || "normal");
		}
	}, [start]);

	// 시작화면 키비주얼: 커서 위치에 따라 살짝 따라오는 시차 효과
	const keyVisual = useRef<HTMLDivElement | null>(null);
	const keyVisualRaf = useRef(0);
	const moveKeyVisual = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const el = keyVisual.current;
		if (!el || keyVisualRaf.current) return;
		const { clientX, clientY, currentTarget } = e;
		const box = currentTarget.getBoundingClientRect();
		keyVisualRaf.current = requestAnimationFrame(() => {
			keyVisualRaf.current = 0;
			if (!keyVisual.current) return;
			const nx = (clientX - box.left) / box.width - 0.5;
			const ny = (clientY - box.top) / box.height - 0.5;
			keyVisual.current.style.setProperty("--kv-px", `${(-nx * 26).toFixed(1)}px`);
			keyVisual.current.style.setProperty("--kv-py", `${(-ny * 16).toFixed(1)}px`);
		});
	}, []);
	useEffect(() => () => cancelAnimationFrame(keyVisualRaf.current), []);

	const toggleFullscreen = useCallback(async () => {
		try {
			if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
			else await document.exitFullscreen();
		} catch {}
	}, []);
	useEffect(() => {
		const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
		document.addEventListener("fullscreenchange", sync);
		return () => document.removeEventListener("fullscreenchange", sync);
	}, []);

	const dashNow = useCallback(() => {
		if (mode !== "play") return;
		const g = game.current;
		if (g.dashCharges <= 0) return;
		let dx = (g.keys.has("KeyD") ? 1 : 0) - (g.keys.has("KeyA") ? 1 : 0) + g.touchX,
			dy = (g.keys.has("KeyS") ? 1 : 0) - (g.keys.has("KeyW") ? 1 : 0) + g.touchY;
		if (!dx && !dy) {
			dx = g.vx;
			dy = g.vy;
		}
		const n = Math.hypot(dx, dy) || 1;
		dx /= n;
		dy /= n;
		if (!dx && !dy) dy = 1;
		const active = g.mainClass;
		g.dashCharges--;
		g.telemetry.actionsUsed++;
		if (g.dash <= 0) g.dash = 1.55;
		if (active === "heart") {
			g.vx = dx * 690;
			g.vy = dy * 690;
			g.inv = 0.3;
			g.dashFx = 0.34;
			g.heartFx = 0.42;
			g.shake = 13;
			for (const m of g.mobs) {
				const tx = m.x - g.x,
					ty = m.y - g.y,
					d = Math.hypot(tx, ty),
					facing = (tx * dx + ty * dy) / Math.max(1, d);
				if (d < 155 && facing > 0.25) {
					dealDamage(g, m, g.damage * 2.1, "heart_action");
					m.hit = 0.12;
				}
			}
			pushSkill(g, "heart", 5, g.x + dx * 40, g.y + dy * 40, 150, 0.36, { rot: Math.atan2(dy, dx), grow: 1.6 });
			const shock = cardLevel(g, "heart_shock");
			if (shock >= 2) pushSkill(g, "heart", 3, g.x + dx * 72, g.y + dy * 72, 150 + shock * 28, 0.46, { grow: 1.8 });
			if (shock >= 3)
				pushSkill(g, "heart", 6, g.x + dx * 105, g.y + dy * 105, 110, 0.52, {
					rot: Math.atan2(dy, dx),
					spin: 2.4,
					grow: 1.45,
				});
			g.effect = "심장 액션 · 돌진 펀치";
			g.effectT = 1;
			sound.current?.play("hit");
		} else if (active === "brain") {
			const targets = [...g.mobs]
				.sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))
				.slice(0, 7);
			targets.forEach((m, i) => {
				const a = Math.atan2(m.y - g.y, m.x - g.x) + (i % 2 ? -0.035 : 0.035);
				g.shots.push({
					x: g.x,
					y: g.y,
					vx: Math.cos(a) * 650,
					vy: Math.sin(a) * 650,
					life: 1.4,
					r: 7,
					source: "brain_action",
				});
			});
			pushSkill(g, "brain", 5, g.x, g.y, 170, 0.45, { rot: Math.atan2(dy, dx), grow: 1.7 });
			const synapse = cardLevel(g, "brain_synapse"),
				chain = cardLevel(g, "brain_chain");
			for (let i = 0; i < synapse; i++)
				pushSkill(g, "brain", i % 2 ? 2 : 4, g.x, g.y, 115 + i * 34, 0.42 + i * 0.05, {
					rot: (i * Math.PI) / 3,
					spin: (i % 2 ? 1 : -1) * 2.2,
					grow: 1.55,
				});
			if (chain >= 3) pushSkill(g, "brain", 6, g.x, g.y, 235, 0.58, { spin: 1.8, grow: 1.75 });
			g.castFx = 0.3;
			g.castAngle = Math.atan2(dy, dx);
			g.shake = 6;
			g.effect = "뇌 액션 · 코어 집중 사격";
			g.effectT = 1;
			sound.current?.play("shot");
		} else if (active === "liver") {
			g.fields.push({
				x: g.x,
				y: g.y,
				r: 135 * g.poisonRadiusMul,
				life: 5.2 * g.poisonDurationMul,
				stack: 1,
				kills: 0,
				tick: 0,
			});
			g.fields = g.fields.slice(-30);
			pushSkill(g, "liver", 3, g.x, g.y, 190, 0.5, { grow: 1.6 });
			const overlap = cardLevel(g, "liver_overlap"),
				concentrated = cardLevel(g, "liver_concentrated");
			if (overlap >= 2) pushSkill(g, "liver", 4, g.x, g.y, 220 + overlap * 24, 0.62, { spin: 1.1, grow: 1.65 });
			if (concentrated >= 3) pushSkill(g, "liver", 6, g.x, g.y, 145, 0.7, { spin: -2, grow: 1.35 });
			g.shake = 8;
			g.effect = "간 액션 · 독성 영역 점화";
			g.effectT = 1;
			sound.current?.play("heart");
		} else if (active === "lung") {
			g.vx = dx * 940;
			g.vy = dy * 940;
			g.inv = 0.34;
			g.dashFx = 0.4;
			g.galeMomentum = 3.5;
			g.shake = 7;
			const gx = g.x + dx * 185,
				gy = g.y + dy * 185;
			for (const m of g.mobs) {
				const tx = m.x - g.x,
					ty = m.y - g.y,
					d = Math.hypot(tx, ty),
					facing = (tx * dx + ty * dy) / Math.max(1, d);
				if (d < 210 && facing > 0.15) {
					dealDamage(g, m, g.damage * 1.8, "lung_action");
					m.hit = 0.12;
					const gd = Math.hypot(m.x - gx, m.y - gy) || 1;
					m.kbX += ((m.x - gx) / gd) * 230;
					m.kbY += ((m.y - gy) / gd) * 230;
				}
			}
			pushSkill(g, "lung", 3, g.x + dx * 60, g.y + dy * 60, 150, 0.34, { rot: Math.atan2(dy, dx), grow: 1.7 });
			pushSkill(g, "lung", 4, gx, gy, 155, 0.5, { grow: 1.9 });
			const storm = cardLevel(g, "lung_eyestorm"),
				blade = cardLevel(g, "lung_bladewind");
			for (let i = 1; i < storm; i++)
				pushSkill(g, "lung", 4, gx + dx * i * 34, gy + dy * i * 34, 155 + i * 42, 0.5 + i * 0.06, {
					rot: i * 0.7,
					spin: (i % 2 ? 1 : -1) * 2,
					grow: 1.9,
				});
			if (blade >= 3)
				pushSkill(g, "lung", 6, g.x + dx * 115, g.y + dy * 115, 185, 0.44, { rot: Math.atan2(dy, dx), grow: 1.65 });
			g.effect = "폐 액션 · 관통 대시 · 돌풍";
			g.effectT = 1;
			sound.current?.play("dash");
		} else if (active === "muscle") {
			const power = g.impactCharge,
				radius = 145 + power * 165,
				dmg = g.damage * (1.6 + power * 3.2),
				kb = 340 + power * 380;
			const gravity = cardLevel(g, "muscle_gravity");
			if (gravity) {
				const pullRange = levelValue(AUGMENT_BALANCE.muscleGravity.rangeMultiplier, gravity),
					pullDistance = levelValue(AUGMENT_BALANCE.muscleGravity.pullDistance, gravity);
				for (const m of g.mobs) {
					const d = Math.hypot(m.x - g.x, m.y - g.y);
					if (d < radius * pullRange && d > 1) {
						m.x += ((g.x - m.x) / d) * Math.min(d, pullDistance);
						m.y += ((g.y - m.y) / d) * Math.min(d, pullDistance);
					}
				}
			}
			for (const m of g.mobs) {
				const d = Math.hypot(m.x - g.x, m.y - g.y);
				if (d < radius + m.r) {
					dealDamage(g, m, dmg, "muscle_action");
					m.hit = 0.14;
					const nx = (m.x - g.x) / (d || 1),
						ny = (m.y - g.y) / (d || 1);
					m.kbX += nx * kb;
					m.kbY += ny * kb;
				}
			}
			g.impactCharge = 0;
			g.shake = 10 + power * 12;
			pushSkill(g, "muscle", 5, g.x, g.y, radius * 2, 0.55, { grow: 1.5 });
			pushSkill(g, "muscle", 7, g.x, g.y, radius * 1.3, 0.4, { grow: 1.6 });
			if (gravity >= 2)
				pushSkill(g, "muscle", 4, g.x, g.y, radius * (1.5 + gravity * 0.35), 0.66, {
					spin: gravity % 2 ? 1.5 : -1.5,
					grow: 0.72,
				});
			if (gravity >= 3) pushSkill(g, "muscle", 6, g.x, g.y, radius * 2.35, 0.72, { spin: 2.2, grow: 0.58 });
			g.effect = `근육 액션 · 지면 강타 ${Math.round(power * 100)}%`;
			g.effectT = 1;
			sound.current?.play("boss");
		} else {
			g.vx = dx * 760;
			g.vy = dy * 760;
			g.inv = 0.28;
			g.dashFx = 0.34;
			g.shake = 7;
			sound.current?.play("dash");
		}
	}, [mode]);

	const moveStick = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		if (touchPointer.current !== null && touchPointer.current !== e.pointerId) return;
		touchPointer.current = e.pointerId;
		e.currentTarget.setPointerCapture(e.pointerId);
		const r = joystick.current!.getBoundingClientRect(),
			dx = e.clientX - (r.left + r.width / 2),
			dy = e.clientY - (r.top + r.height / 2),
			limit = r.width * 0.34,
			n = Math.hypot(dx, dy) || 1,
			scale = Math.min(1, limit / n);
		const px = dx * scale,
			py = dy * scale,
			x = px / limit,
			y = py / limit;
		game.current.touchX = x;
		game.current.touchY = y;
		setStick({ x: px, y: py });
	}, []);
	const releaseStick = useCallback(() => {
		touchPointer.current = null;
		game.current.touchX = 0;
		game.current.touchY = 0;
		setStick({ x: 0, y: 0 });
	}, []);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "Escape"].includes(e.code)) e.preventDefault();
			if (e.code === "KeyF") {
				e.preventDefault();
				void toggleFullscreen();
				return;
			}
			if (e.code === "Escape" && mode === "play") {
				game.current.paused = true;
				sound.current?.pauseMusic();
				setMode("pause");
				return;
			}
			if (e.code === "Escape" && mode === "pause") {
				game.current.paused = false;
				game.current.last = performance.now();
				sound.current?.resumeMusic();
				setMode("play");
				return;
			}
			game.current.keys.add(e.code);
			if (e.code === "Space" && !e.repeat) dashNow();
		};
		const up = (e: KeyboardEvent) => game.current.keys.delete(e.code);
		addEventListener("keydown", down);
		addEventListener("keyup", up);
		return () => {
			removeEventListener("keydown", down);
			removeEventListener("keyup", up);
		};
	}, [mode, toggleFullscreen, dashNow]);

	useEffect(() => {
		const c = canvas.current;
		if (!c) return;
		const ctx = c.getContext("2d")!,
			coarse = matchMedia("(pointer: coarse)").matches;
		const stageArt = ["school", "company", "apartment", "hospital"].map((name) => {
			const img = new Image();
			img.src = `/art/${name}-walk.png`;
			return img;
		});
		const stageMaps = ["school", "company", "apartment", "hospital"].map((name) => {
			const img = new Image();
			img.src = `/art/maps/${name}.png`;
			return img;
		});
		const itemArt = new Image();
		itemArt.src = "/art/items.png";
		const playerArt = new Image();
		playerArt.src = "/art/player-forms-v2-clean.png";
		// 플레이어 스프라이트 원본은 왼쪽을 향함 ) 1 = 원본(좌향), -1 = 뒤집기(우향).
		// 멈춰도 마지막 방향을 유지해야 정지 순간에 좌향으로 튀지 않는다.
		let playerFace = 1;
		const projectileArt = new Image();
		projectileArt.src = "/art/projectiles.png";
		const vfxArt = new Image();
		vfxArt.src = "/art/player-vfx.png";
		const heartSkillArt = new Image();
		heartSkillArt.src = "/art/vfx/heart-skills-v1.png";
		const brainSkillArt = new Image();
		brainSkillArt.src = "/art/vfx/brain-skills-v1.png";
		const liverSkillArt = new Image();
		liverSkillArt.src = "/art/vfx/liver-skills-v1.png";
		const lungSkillArt = new Image();
		lungSkillArt.src = "/art/vfx/lung-skills-v1.png";
		const muscleSkillArt = new Image();
		muscleSkillArt.src = "/art/vfx/muscle-skills-v1.png";
		const skillSheets: Record<CoreOrgan, HTMLImageElement> = {
			heart: heartSkillArt,
			brain: brainSkillArt,
			liver: liverSkillArt,
			lung: lungSkillArt,
			muscle: muscleSkillArt,
		};
		const drawEnvironment = (g: Game, camX: number, camY: number) => {
			const map = stageMaps[g.stage];
			ctx.fillStyle = ["#243a35", "#30383d", "#3c3931", "#d9e4df"][g.stage];
			ctx.fillRect(camX, camY, g.w, g.h);
			if (map.complete && map.naturalWidth) {
				const srcX = (camX / g.worldW) * map.naturalWidth,
					srcY = (camY / g.worldH) * map.naturalHeight;
				ctx.drawImage(
					map,
					srcX,
					srcY,
					(g.w / g.worldW) * map.naturalWidth,
					(g.h / g.worldH) * map.naturalHeight,
					camX,
					camY,
					g.w,
					g.h,
				);
			}
		};
		const spawn = (g: Game, boss = false) => {
			const angle = gameRandom(g) * Math.PI * 2,
				distance = Math.max(g.w, g.h) * (0.62 + gameRandom(g) * 0.2);
			const edge = boss ? 96 : 36;
			const x = Math.max(edge, Math.min(g.worldW - edge, g.x + Math.cos(angle) * distance));
			const y = Math.max(edge, Math.min(g.worldH - edge, g.y + Math.sin(angle) * distance));
			const diff = DIFFICULTY[g.difficulty],
				base = (20 + g.stage * 12 + g.t * 0.035) * diff.hp;
			const kind = Math.floor(gameRandom(g) * 3);
			// 종류별 차별화: 0 표준 / 1 돌진형(크고 느리고 튼튼) / 2 스워머(작고 빠르고 약함)
			const km =
				kind === 1
					? { r: 1.28, hp: 1.4, spd: 0.82 }
					: kind === 2
						? { r: 0.78, hp: 0.64, spd: 1.34 }
						: { r: 1, hp: 1, spd: 1 };
			const mr = (boss ? (g.stage === 3 ? 52 : 38) : (10 + gameRandom(g) * 8) * km.r) * (coarse ? 0.8 : 1);
			const bossHpMultiplier = g.stage === 3 ? FINAL_BOSS_HP_MULTIPLIER : BOSS_HP_MULTIPLIER;
			const mhp = boss ? base * bossHpMultiplier : base * km.hp;
			const mspd = (boss ? 58 : (65 + gameRandom(g) * 44 + g.stage * 8) * km.spd) * diff.speed;
			g.mobs.push({
				x,
				y,
				r: mr,
				hp: mhp,
				max: mhp,
				speed: mspd,
				boss,
				bossStage: boss ? g.stage : undefined,
				elite: boss || gameRandom(g) < 0.08 + g.stage * 0.025,
				kind,
				hit: 0,
				skill: 1.5 + gameRandom(g) * 3,
				cast: 0,
				charge: 0,
				aimX: x,
				aimY: y,
				toxin: 0,
				poisonStacks: 0,
				poisonTick: 0,
				overloadHits: 0,
				heartMark: 0,
				kbX: 0,
				kbY: 0,
				collideCd: 0,
			});
		};
		const burst = (g: Game, x: number, y: number, color: string, n = 7) => {
			for (let i = 0; i < n; i++) {
				const a = Math.random() * 6.28,
					s = 40 + Math.random() * 150;
				g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.35, color });
			}
		};
		const simulateStep = (g: Game, dt: number) => {
			g.t += dt;
			g.stageT += dt;
			g.dash -= dt;
			g.inv -= dt;
			g.fire -= dt;
			g.effectT -= dt;
			g.dashFx -= dt;
			g.castFx -= dt;
			g.heartFx -= dt;
			g.moveBuff -= dt;
			g.toxicCoreCooldown -= dt;
			g.noDamage += dt;
			g.shake = Math.max(0, g.shake - dt * 30);
			g.hurtT = Math.max(0, g.hurtT - dt * 2);
			g.benchmarkActionCooldown -= dt;
			if (g.benchmarkTarget && g.mainClass && g.dashCharges > 0 && g.benchmarkActionCooldown <= 0) {
				g.benchmarkActionCooldown = 0.7;
				dashNow();
			}
			for (const milestone of [10, 30, 60, 120, 180, 300])
				if (g.t >= milestone && !progressMilestones.current.has(milestone)) {
					progressMilestones.current.add(milestone);
					sendGameLabEvent("game_progress", {
						runNumber: runNumber.current,
						checkpoint: `${milestone}s`,
						elapsedSeconds: milestone,
						stage: g.stage + 1,
						level: g.level,
						kills: g.kills,
						hpPercent: Math.round((g.hp / g.maxHp) * 100),
						choices: g.choices.length,
						chemistries: g.chemistries.length,
					});
				}
			if (g.dashCharges < g.maxDash && g.dash <= 0) {
				g.dashCharges++;
				g.dash = g.dashCharges < g.maxDash ? 1.55 : 0;
			}
			const targetStage = Math.min(3, Math.floor(g.t / STAGE_LENGTH));
			if (targetStage !== g.stage) {
				g.stage = targetStage;
				g.stageT = 0;
				g.bossSpawned = false;
				g.choiceDone = false;
				g.augmentDone = false;
				ORGAN_KEYS.forEach((k) => (g.organs[k] -= 3 + targetStage));
				sendGameLabEvent("game_stage_reached", {
					runNumber: runNumber.current,
					stage: targetStage + 1,
					elapsedSeconds: Math.round(g.t),
					kills: g.kills,
					level: g.level,
				});
			}
			if (!g.choiceDone && g.stageT > (g.stage === 0 ? FIRST_CHOICE_AT : LATER_CHOICE_AT)) {
				g.choiceDone = true;
				const life = lifePool(g);
				let picks: Choice[];
				if (!g.awakened) {
					// 미각성 상태의 생활 선택에는 장기 성장 카드 1장을 보장한다: "무엇을 키워야 각성하는지" 방향을 준다
					const organCard = shuffled(
						g,
						ORGAN_GROWTH.filter((d) => d.organLevel && g.organLevels[d.organLevel] < 3),
					)[0];
					const others = shuffled(g, life)
						.slice(0, organCard ? 2 : 3)
						.map(toChoice);
					picks = shuffled(g, organCard ? [organCard, ...others] : others);
				} else {
					picks = shuffled(g, life).slice(0, 3).map(toChoice);
				}
				openChoice("생활 선택", fillChoices(g, picks));
			}
			if (!g.bossSpawned && g.stageT > BOSS_AT) {
				g.bossSpawned = true;
				if (g.stage === 3) g.bossWeakTarget = ORGAN_KEYS.reduce((a, b) => (g.organs[a] < g.organs[b] ? a : b));
				spawn(g, true);
				sound.current?.play("boss");
				g.effect = g.bossWeakTarget ? `노화가 ${g.bossWeakTarget}을 노립니다` : `${STAGES[g.stage][1]} 등장`;
				g.effectT = 2.8;
				sendGameLabEvent("game_boss_reached", {
					runNumber: runNumber.current,
					stage: g.stage + 1,
					elapsedSeconds: Math.round(g.t),
					kills: g.kills,
					level: g.level,
					weakTarget: g.bossWeakTarget,
				});
			}
			if (g.t >= 480) {
				const boss = g.mobs.find((m) => m.boss);
				if (!boss) spawn(g, true);
			}
			let dx = (g.keys.has("KeyD") ? 1 : 0) - (g.keys.has("KeyA") ? 1 : 0) + g.touchX,
				dy = (g.keys.has("KeyS") ? 1 : 0) - (g.keys.has("KeyW") ? 1 : 0) + g.touchY;
			if (g.benchmarkTarget) {
				const target = g.mobs.reduce<Mob | undefined>(
					(best, mob) =>
						!best || Math.hypot(mob.x - g.x, mob.y - g.y) < Math.hypot(best.x - g.x, best.y - g.y) ? mob : best,
					undefined,
				);
				if (target) {
					const tx = target.x - g.x,
						ty = target.y - g.y,
						d = Math.hypot(tx, ty) || 1,
						nx = tx / d,
						ny = ty / d,
						role = g.mainClass;
					if (role === "lung") {
						const lungDirection = lungBenchmarkDirection({
							playerX: g.x,
							playerY: g.y,
							velocityX: g.vx,
							velocityY: g.vy,
							targetX: target.x,
							targetY: target.y,
						});
						dx = lungDirection.dx;
						dy = lungDirection.dy;
					} else if (role === "heart" || role === "muscle") {
						const desired = role === "heart" ? 105 : 150,
							radial = d > desired ? 1 : d < desired * 0.72 ? -1 : 0.15;
						dx = nx * radial - ny * 0.72;
						dy = ny * radial + nx * 0.72;
					} else {
						const desired = role === "brain" ? 300 : role === "liver" ? 220 : 250,
							radial = d < desired ? -1 : 0.18;
						dx = nx * radial - ny;
						dy = ny * radial + nx;
					}
				} else {
					const a = g.t * 0.55;
					dx = Math.cos(a);
					dy = Math.sin(a);
				}
			}
			const n = Math.hypot(dx, dy) || 1;
			const moving = Boolean(dx || dy);
			const bloodflow = cardLevel(g, "heart_bloodflow"),
				circulation = cardLevel(g, "lung_circulation");
			const moveBuffMul =
				g.moveBuff > 0
					? g.mainClass === "heart" && bloodflow
						? 1 + levelValue(AUGMENT_BALANCE.heartBloodflow.speedBonus, bloodflow)
						: g.mainClass === "lung" && circulation
							? 1 + levelValue(AUGMENT_BALANCE.lungCirculation.speedBonus, circulation)
							: 1.15
					: 1;
			const moveSpeed = g.speed * moveBuffMul * (g.mainClass === "lung" ? 1 + g.galeMomentum * 0.08 : 1);
			if (g.inv <= 0.12) {
				const power = Math.min(1, n);
				g.vx = (dx / n) * moveSpeed * power;
				g.vy = (dy / n) * moveSpeed * power;
			}
			const previousX = g.x,
				previousY = g.y;
			g.x = Math.max(18, Math.min(g.worldW - 18, g.x + g.vx * dt));
			g.y = Math.max(18, Math.min(g.worldH - 18, g.y + g.vy * dt));
			g.telemetry.distanceTraveled += Math.hypot(g.x - previousX, g.y - previousY);
			if (g.mainClass === "liver" && moving) {
				const moved = Math.hypot(g.x - g.lastTrailX, g.y - g.lastTrailY);
				g.poisonTrailDistance += moved;
				g.lastTrailX = g.x;
				g.lastTrailY = g.y;
				const interval = cardLevel(g, "liver_footprints")
					? 58 * Math.pow(0.82, cardLevel(g, "liver_footprints") - 1)
					: 82;
				if (g.poisonTrailDistance >= interval) {
					g.poisonTrailDistance = 0;
					const overlapLevel = cardLevel(g, "liver_overlap"),
						overlap = overlapLevel ? g.fields.find((f) => Math.hypot(f.x - g.x, f.y - g.y) < f.r * 0.58) : undefined;
					if (overlap) {
						const maxStack = levelValue(AUGMENT_BALANCE.liverOverlap.maxStacks, overlapLevel);
						if (overlap.stack < maxStack) {
							overlap.stack++;
							overlap.r *= AUGMENT_BALANCE.liverOverlap.radiusGrowth;
						}
						overlap.life = Math.max(overlap.life, 4.8 * g.poisonDurationMul);
						g.effect = `오염 중첩 · ${overlap.stack}/${maxStack}단계`;
						g.effectT = 0.7;
					} else
						g.fields.push({
							x: g.x,
							y: g.y,
							r: AUGMENT_BALANCE.liverOverlap.baseRadius * g.poisonRadiusMul,
							life: (4.8 + cardLevel(g, "liver_footprints") * 0.9) * g.poisonDurationMul,
							stack: 1,
							kills: 0,
							tick: 0,
						});
					g.fields = g.fields.slice(-36);
					pushSkill(g, "liver", 0, g.x, g.y, 52, 0.45, { rot: Math.atan2(g.vy, g.vx), grow: 1.1 });
				}
			} else {
				g.lastTrailX = g.x;
				g.lastTrailY = g.y;
			}
			if (g.mainClass === "lung") {
				g.galeKillLock -= dt;
				if (moving) g.galeMomentum = Math.min(3.5, g.galeMomentum + dt * 1.5);
				else if (g.galeKillLock <= 0) g.galeMomentum = Math.max(0, g.galeMomentum - dt * 3);
				const bw = cardLevel(g, "lung_bladewind");
				if (bw && moving) {
					g.windTrailDist += Math.hypot(g.vx, g.vy) * dt;
					const iv = 95 * Math.pow(0.78, bw - 1);
					if (g.windTrailDist >= iv) {
						g.windTrailDist = 0;
						const a = Math.atan2(g.vy, g.vx);
						g.shots.push({
							x: g.x,
							y: g.y,
							vx: Math.cos(a) * 710,
							vy: Math.sin(a) * 710,
							life: 0.6,
							r: 13,
							damageMul: 1.1 + g.galeMomentum * 0.15,
							source: "lung_bladewind",
						});
						pushSkill(g, "lung", 0, g.x, g.y, 60, 0.3, { rot: a, grow: 1.4 });
					}
				}
				if (cardLevel(g, "lung_afterimage") && moving && g.galeMomentum >= 3.2) {
					for (const m of g.mobs)
						if (Math.hypot(m.x - g.x, m.y - g.y) < 72)
							dealDamage(g, m, (6 + cardLevel(g, "lung_afterimage") * 3) * dt, "lung_afterimage");
					if (Math.random() < dt * 22)
						pushSkill(g, "lung", 2, g.x - g.vx * 0.03, g.y - g.vy * 0.03, 54, 0.3, {
							rot: Math.atan2(g.vy, g.vx),
							grow: 1.1,
						});
				}
				if (cardLevel(g, "lung_eyestorm") && moving && Math.floor(g.t * 2) !== Math.floor((g.t - dt) * 2)) {
					const cnt = cardLevel(g, "lung_eyestorm");
					for (let i = 0; i < cnt; i++) {
						const a = gameRandom(g) * 6.28,
							r = 58 + gameRandom(g) * 44,
							wx = g.x + Math.cos(a) * r,
							wy = g.y + Math.sin(a) * r;
						for (const m of g.mobs)
							if (Math.hypot(m.x - wx, m.y - wy) < 52) dealDamage(g, m, g.damage * 0.5, "lung_eyestorm");
						pushSkill(g, "lung", 5, wx, wy, 72, 0.4, { spin: 6, grow: 1.3 });
					}
				}
			}
			if (g.mainClass === "muscle") {
				const near = g.mobs.filter((m) => Math.hypot(m.x - g.x, m.y - g.y) < 240).length;
				g.impactCharge = Math.min(1, g.impactCharge + near * dt * 0.075);
			}
			const diff = DIFFICULTY[g.difficulty],
				cap = Math.min(
					coarse ? 140 : 190,
					Math.round((26 + g.stage * 18 + Math.floor(g.stageT / 3)) * diff.count * (coarse ? 0.78 : 1)),
				);
			const takeDamage = (raw: number) => (raw * 100) / (100 + g.armor * 5);
			const hurtPlayer = (raw: number, srcX?: number, srcY?: number, cause: DamageCause = "enemy_contact") => {
				if (g.invuln) return false;
				let amount = takeDamage(raw);
				g.noDamage = 0;
				g.hurtT = 0.55;
				g.lastDamageCause = cause;
				if (srcX !== undefined && srcY !== undefined) g.hurtDir = Math.atan2(srcY - g.y, srcX - g.x);
				g.telemetry.hitsTaken++;
				if (g.mainClass === "muscle") {
					const pf = cardLevel(g, "muscle_painfuel");
					if (pf) g.impactCharge = Math.min(1, g.impactCharge + 0.05 * pf);
				}
				if (g.shield > 0) {
					const blocked = Math.min(g.shield, amount);
					g.shield -= blocked;
					amount -= blocked;
					g.telemetry.damageBlocked += blocked;
				}
				const hpLoss = Math.min(g.hp, amount);
				g.hp -= amount;
				g.telemetry.damageTaken += Math.max(0, hpLoss);
				if (g.hp <= 0 && g.reviveAvailable) {
					g.reviveAvailable = false;
					const revived = g.maxHp * 0.4;
					g.hp = 0;
					healPlayer(g, revived);
					g.inv = 2;
					g.shield = g.maxHp * 0.15;
					g.heartFx = 0.8;
					g.effect = "세포 분열 · 40% 체력으로 부활";
					g.effectT = 3;
					sound.current?.play("level");
					return false;
				}
				if (g.hp <= 0) {
					endGame(false);
					return true;
				}
				// 저체력 진입 시 1회 경고음+문구, 42% 이상 회복하면 재무장
				if (g.hp / g.maxHp < 0.3 && !g.lowHpWarned) {
					g.lowHpWarned = true;
					g.effect = "위험 · 체력이 낮습니다";
					g.effectT = 1.6;
					sound.current?.play("hurt");
				} else if (g.hp / g.maxHp >= 0.42) g.lowHpWarned = false;
				return false;
			};
			if (cardLevel(g, "common_membrane") && g.noDamage >= 8 && g.shield <= 0) {
				g.shield = g.maxHp * 0.15;
				g.noDamage = 0;
				g.effect = "세포막 강화 · 보호막 생성";
				g.effectT = 1.2;
				burst(g, g.x, g.y, "#4ee5e1", 18);
			}
			if (
				g.mobs.filter((m) => !m.boss).length < cap &&
				gameRandom(g) < dt * (5 + g.stage * 3 + g.stageT * 0.05) * diff.count
			)
				spawn(g);
			let nearest: Mob | undefined,
				nd = Infinity;
			for (const m of g.mobs) {
				const d = (m.x - g.x) ** 2 + (m.y - g.y) ** 2;
				if (d < nd) {
					nd = d;
					nearest = m;
				}
			}
			if (g.fire <= 0 && nearest) {
				const shootAt = (
					target: Mob,
					opts: {
						damageMul?: number;
						chain?: number;
						poison?: number;
						core?: boolean;
						angle?: number;
						source?: string;
					} = {},
				) => {
					const a = opts.angle ?? Math.atan2(target.y - g.y, target.x - g.x);
					g.shots.push({
						x: g.x,
						y: g.y,
						vx: Math.cos(a) * 580,
						vy: Math.sin(a) * 580,
						life: 1.6,
						r: opts.core ? 7 : 5,
						damageMul: opts.damageMul ?? 1,
						chain: opts.chain ?? 0,
						poison: opts.poison ?? 0,
						core: opts.core,
						source: opts.source ?? "basic_projectile",
					});
				};
				g.shotCount++;
				if (g.mainClass === "heart") {
					const inRange = g.mobs
						.filter((m) => Math.hypot(m.x - g.x, m.y - g.y) <= g.meleeRange + m.r)
						.sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y))[0];
					const adrenaline = cardLevel(g, "heart_adrenaline"),
						nearby = g.mobs.some((m) => Math.hypot(m.x - g.x, m.y - g.y) < g.meleeRange * 1.8);
					g.fire = g.fireRate * (nearby && adrenaline ? Math.max(0.5, 0.75 - adrenaline * 0.05) : 1);
					if (inRange) {
						g.meleeCombo = (g.meleeCombo % 4) + 1;
						inRange.overloadHits++;
						let damage = g.damage * 1.18 * (1 + cardLevel(g, "heart_overload") * 0.08),
							source = "heart_basic";
						if (cardLevel(g, "heart_overload") && inRange.overloadHits >= 5) {
							damage *= 2.2;
							source = "heart_overload";
							inRange.overloadHits = 0;
							pushSkill(g, "heart", 4, inRange.x, inRange.y, 120, 0.4, { grow: 1.6 });
							g.effect = "과부하 연타 · 2.2×";
							g.effectT = 0.8;
						}
						if (inRange.heartMark > 0) {
							damage *= 1.3;
							inRange.heartMark = 0;
							pushSkill(g, "heart", 6, inRange.x, inRange.y, 64, 0.35, { grow: 1.3 });
						}
						dealDamage(g, inRange, damage, source);
						inRange.hit = 0.12;
						g.heartFx = 0.2;
						sound.current?.play("hit");
						burst(g, inRange.x, inRange.y, "#ff715b", 6);
						if (g.meleeCombo < 4)
							pushSkill(g, "heart", g.meleeCombo - 1, inRange.x, inRange.y, 72, 0.2, {
								rot: Math.atan2(inRange.y - g.y, inRange.x - g.x),
								grow: 1.2,
							});
						if (cardLevel(g, "fusion_heart_liver")) {
							inRange.poisonStacks = Math.min(8, inRange.poisonStacks + 1);
							inRange.toxin = 4;
						}
						if (g.meleeCombo === 4) {
							const shock = cardLevel(g, "heart_shock");
							pushSkill(g, "heart", 3, inRange.x, inRange.y, shock ? 185 : 120, 0.5, { grow: 1.7 });
							if (shock) {
								const radius = g.meleeRange * 1.8 * (1 + (shock - 1) * 0.25);
								for (const m of g.mobs) {
									const d = Math.hypot(m.x - inRange.x, m.y - inRange.y);
									if (d < radius) {
										dealDamage(g, m, g.damage * 0.8 * (1 + (shock - 1) * 0.15), "heart_shock");
										if (d > 1) {
											m.x += ((m.x - inRange.x) / d) * 18;
											m.y += ((m.y - inRange.y) / d) * 18;
										}
										if (shock >= 3) m.heartMark = 3;
									}
								}
								g.heartFx = 0.58;
								g.shake = 9;
								burst(g, inRange.x, inRange.y, "#ff715b", 24);
							}
							if (cardLevel(g, "fusion_heart_liver") && inRange.poisonStacks) {
								const blast = g.damage * 0.42 * inRange.poisonStacks;
								for (const m of g.mobs)
									if (Math.hypot(m.x - inRange.x, m.y - inRange.y) < 120) dealDamage(g, m, blast, "fusion_heart_liver");
								inRange.poisonStacks = 0;
								burst(g, inRange.x, inRange.y, "#a8d43a", 20);
							}
							if (cardLevel(g, "fusion_heart_brain"))
								shootAt(inRange, { damageMul: 0.65, chain: g.chainBonus, core: true, source: "fusion_heart_brain" });
						}
					}
				} else if (g.mainClass === "brain") {
					const coreCount = 2 + cardLevel(g, "brain_synapse"),
						close = g.mobs.some((m) => Math.hypot(m.x - g.x, m.y - g.y) < 180),
						speedBoost = cardLevel(g, "fusion_brain_heart") && close ? 0.35 : 0;
					g.fire = (g.fireRate * 1.12) / (1 + speedBoost);
					const focus = cardLevel(g, "brain_focus"),
						toxic = cardLevel(g, "fusion_brain_liver");
					const targets = [...g.mobs].sort((a, b) =>
						toxic && a.poisonStacks !== b.poisonStacks
							? b.poisonStacks - a.poisonStacks
							: focus
								? b.hp - a.hp
								: Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y),
					);
					for (let i = 0; i < coreCount; i++) {
						const target = targets[i % Math.max(1, targets.length)] || nearest;
						shootAt(target, {
							damageMul:
								focus && (target.elite || target.boss)
									? 0.82 * (1 + levelValue(AUGMENT_BALANCE.brainFocus.eliteBossDamageBonus, focus))
									: 0.82,
							chain: cardLevel(g, "brain_chain") + g.chainBonus,
							poison: toxic ? 1 : 0,
							core: true,
							source: "brain_core",
							angle: Math.atan2(target.y - g.y, target.x - g.x) + (i - (coreCount - 1) / 2) * 0.035,
						});
					}
					g.brainVolley = 0.24;
					pushSkill(g, "brain", 1, g.x, g.y, 74, 0.16, {
						rot: Math.atan2(nearest.y - g.y, nearest.x - g.x),
						grow: 1.3,
					});
					g.castFx = 0.16;
					g.castAngle = Math.atan2(nearest.y - g.y, nearest.x - g.x);
					sound.current?.play("shot");
				} else if (g.mainClass === "liver") {
					g.fire = 0.55;
				} else if (g.mainClass === "lung") {
					const mo = g.galeMomentum;
					g.fire = Math.max(0.13, g.fireRate * 0.85 - mo * 0.06);
					const a = moving ? Math.atan2(g.vy, g.vx) : Math.atan2(nearest.y - g.y, nearest.x - g.x);
					g.shots.push({
						x: g.x,
						y: g.y,
						vx: Math.cos(a) * 690,
						vy: Math.sin(a) * 690,
						life: 0.7,
						r: 10 + mo * 2,
						damageMul: 1 + mo * 0.2,
						source: "lung_basic",
					});
					pushSkill(g, "lung", 1, g.x + Math.cos(a) * 24, g.y + Math.sin(a) * 24, 50 + mo * 10, 0.16, {
						rot: a,
						grow: 1.3,
					});
					g.castFx = 0.12;
					g.castAngle = a;
					sound.current?.play("shot");
				} else if (g.mainClass === "muscle") {
					g.fire = g.fireRate * 1.45;
					const oc = cardLevel(g, "muscle_overcontract"),
						range = g.meleeRange * 1.6 * (1 + oc * 0.16),
						kb = 270 * (1 + oc * 0.28);
					let hit = false;
					for (const m of g.mobs) {
						const d = Math.hypot(m.x - g.x, m.y - g.y);
						if (d < range + m.r) {
							dealDamage(g, m, g.damage * 1.75, "muscle_basic");
							m.hit = 0.12;
							const nx = (m.x - g.x) / (d || 1),
								ny = (m.y - g.y) / (d || 1);
							m.kbX += nx * kb;
							m.kbY += ny * kb;
							hit = true;
						}
					}
					if (hit) {
						pushSkill(g, "muscle", 1, g.x, g.y, range * 1.7, 0.3, { grow: 1.4 });
						g.shake = Math.max(g.shake, 4);
						sound.current?.play("hit");
					}
					g.impactCharge = Math.min(1, g.impactCharge + 0.08);
				} else {
					g.fire = g.fireRate;
					const a =
						Math.atan2(nearest.y - g.y, nearest.x - g.x) + (gameRandom(g) - 0.5) * (g.organs.뇌 < 30 ? 0.34 : 0);
					for (let j = 0; j < g.projectiles; j++)
						shootAt(nearest, { chain: g.chainBonus, angle: a + (j - (g.projectiles - 1) / 2) * 0.13 });
					g.castFx = 0.16;
					g.castAngle = a;
					sound.current?.play("shot");
				}
			}
			for (const m of g.mobs) {
				m.skill -= dt;
				m.hit -= dt;
				m.charge -= dt;
				m.toxin -= dt;
				m.poisonTick -= dt;
				m.heartMark -= dt;
				if (m.toxin > 0 || m.poisonStacks > 0)
					dealDamage(g, m, (4 + g.poison * 1.5 + m.poisonStacks * 2.2) * dt, "poison_dot");
				const wasCasting = m.cast > 0;
				m.cast -= dt;
				if (wasCasting && m.cast <= 0) {
					if (m.boss) {
						const count = 12 + g.stage * 2,
							offset = (g.t % 2) * 0.3;
						for (let i = 0; i < count; i++) {
							const a = (i / count) * Math.PI * 2 + offset;
							g.shots.push({
								x: m.x,
								y: m.y,
								vx: Math.cos(a) * 230,
								vy: Math.sin(a) * 230,
								life: 3.2,
								r: 7,
								enemy: true,
								damageCause: "boss_projectile",
							});
						}
						const aim = Math.atan2(m.aimY - m.y, m.aimX - m.x);
						for (let i = -2; i <= 2; i++)
							g.shots.push({
								x: m.x,
								y: m.y,
								vx: Math.cos(aim + i * 0.12) * 340,
								vy: Math.sin(aim + i * 0.12) * 340,
								life: 2.5,
								r: 8,
								enemy: true,
								damageCause: "boss_projectile",
							});
					} else if (m.kind === 1) {
						m.charge = 0.42;
					} else {
						const a = Math.atan2(m.aimY - m.y, m.aimX - m.x);
						g.shots.push({
							x: m.x,
							y: m.y,
							vx: Math.cos(a) * 285,
							vy: Math.sin(a) * 285,
							life: 3,
							r: 7,
							enemy: true,
							damageCause: m.elite ? "elite_projectile" : "enemy_projectile",
						});
					}
				}
				const distanceToPlayer = Math.hypot(g.x - m.x, g.y - m.y);
				if (m.elite && m.skill <= 0 && m.cast <= 0 && m.charge <= 0 && distanceToPlayer < 680) {
					m.skill = m.boss ? 3.8 : 4.6 + gameRandom(g) * 2.2;
					m.cast = m.boss ? 0.9 : 0.65;
					m.aimX = g.x;
					m.aimY = g.y;
					g.warnings.push({
						x: m.x,
						y: m.y,
						tx: g.x,
						ty: g.y,
						life: m.cast,
						max: m.cast,
						kind: m.boss ? "circle" : "line",
						// 보스 전방위 탄막은 보스에서 바깥으로 퍼진다. 예고 원의 기준도 보스여야 한다
						r: m.boss ? 155 : 34,
						owner: m,
					});
				}
				// 비-엘리트 종류 행동: kind1 예고 후 짧은 돌진 / kind2 지그재그 위빙 (기존 cast→charge 기구 재사용)
				if (
					!m.boss &&
					!m.elite &&
					m.kind === 1 &&
					m.skill <= 0 &&
					m.cast <= 0 &&
					m.charge <= 0 &&
					distanceToPlayer < 400
				) {
					m.skill = 3.2 + gameRandom(g) * 2;
					m.cast = 0.45;
					m.aimX = g.x;
					m.aimY = g.y;
					g.warnings.push({ x: m.x, y: m.y, tx: g.x, ty: g.y, life: 0.45, max: 0.45, kind: "line", r: 24, owner: m });
				}
				const weave = !m.boss && !m.elite && m.kind === 2 ? Math.sin(g.t * 5.5 + (m.x + m.y) * 0.05) * 0.55 : 0;
				const a = m.charge > 0 ? Math.atan2(m.aimY - m.y, m.aimX - m.x) : Math.atan2(g.y - m.y, g.x - m.x) + weave;
				const move = m.charge > 0 ? (m.elite ? 690 : 520) : m.speed * (m.cast > 0 ? 0.18 : 1);
				m.x += Math.cos(a) * move * dt;
				m.y += Math.sin(a) * move * dt;
				if (m.kbX || m.kbY) {
					m.x += m.kbX * dt;
					m.y += m.kbY * dt;
					m.kbX *= 0.85;
					m.kbY *= 0.85;
					if (Math.hypot(m.kbX, m.kbY) < 12) {
						m.kbX = 0;
						m.kbY = 0;
					}
				}
				m.collideCd -= dt;
				const edge = m.boss ? 76 : 24;
				m.x = Math.max(edge, Math.min(g.worldW - edge, m.x));
				m.y = Math.max(edge, Math.min(g.worldH - edge, m.y));
				const d = Math.hypot(m.x - g.x, m.y - g.y);
				if (d < m.r + (coarse ? 12 : 16) && g.inv <= 0) {
					const cause: DamageCause = m.boss
						? "boss_contact"
						: m.charge > 0
							? "enemy_charge"
							: m.elite
								? "elite_contact"
								: "enemy_contact";
					hurtPlayer((m.boss ? 18 : 8) * diff.damage, m.x, m.y, cause);
					if (m.boss && g.bossWeakTarget) {
						g.organs[g.bossWeakTarget] = Math.max(0, g.organs[g.bossWeakTarget] - 4);
						g.effect = `노화 침식 · ${g.bossWeakTarget} -4`;
						g.effectT = 1.2;
					}
					g.inv = 0.55;
					g.shake = 10;
					sound.current?.play("hurt");
					burst(g, g.x, g.y, "#ff715b", 12);
				}
				if (g.poison && d < 95) dealDamage(g, m, g.poison * 6 * dt, "poison_aura");
				if ((m.kbX || m.kbY) && m.collideCd <= 0) {
					for (const o of g.mobs) {
						if (o !== m && o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) < m.r + o.r + 4) {
							const ex = g.damage * 1.4;
							dealDamage(g, m, ex, "muscle_collision");
							dealDamage(g, o, ex, "muscle_collision");
							m.collideCd = 0.45;
							o.collideCd = Math.max(o.collideCd, 0.25);
							const mx = (m.x + o.x) / 2,
								my = (m.y + o.y) / 2;
							burst(g, mx, my, "#d8ff3e", 8);
							pushSkill(g, "muscle", 3, mx, my, 64, 0.3, { grow: 1.4 });
							const ch = cardLevel(g, "muscle_chaincollide");
							if (ch) {
								const rad = 88 * (1 + (ch - 1) * 0.3);
								for (const e of g.mobs)
									if (e !== m && e !== o && Math.hypot(e.x - mx, e.y - my) < rad)
										dealDamage(g, e, g.damage * 0.8, "muscle_chain_collision");
								g.shake = Math.max(g.shake, 5);
							}
							break;
						}
					}
				}
			}
			for (const s of g.shots) {
				s.x += s.vx * dt;
				s.y += s.vy * dt;
				s.life -= dt;
				if (s.enemy) {
					if (Math.hypot(s.x - g.x, s.y - g.y) < s.r + (coarse ? 11 : 15) && g.inv <= 0) {
						s.life = 0;
						hurtPlayer(7 * diff.damage, s.x, s.y, s.damageCause ?? "enemy_projectile");
						if (g.bossWeakTarget && g.mobs.some((m) => m.boss)) {
							g.organs[g.bossWeakTarget] = Math.max(0, g.organs[g.bossWeakTarget] - 2);
							g.effect = `노화 탄막 · ${g.bossWeakTarget} -2`;
							g.effectT = 0.9;
						}
						g.inv = 0.42;
						g.shake = 7;
						sound.current?.play("hurt");
						burst(g, g.x, g.y, "#ff715b", 8);
					}
				} else {
					for (const m of g.mobs) {
						if (Math.hypot(s.x - m.x, s.y - m.y) < s.r + m.r) {
							const hit = g.damage * (s.r > 9 ? 1.65 : 1) * (s.damageMul ?? 1) * g.rangedDamageMul;
							dealDamage(g, m, hit, s.source ?? "basic_projectile");
							s.life = 0;
							m.hit = 0.08;
							if (s.poison) {
								m.poisonStacks = Math.min(8, m.poisonStacks + s.poison);
								m.toxin = 4;
							}
							sound.current?.play("hit");
							burst(g, s.x, s.y, s.core ? "#a49bd8" : s.r > 9 ? "#ff715b" : "#d8ff3e", s.r > 9 ? 10 : 4);
							if ((s.chain ?? 0) > 0) {
								const next = g.mobs
									.filter((o) => o !== m && o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) < 220)
									.sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
								if (next) {
									const a = Math.atan2(next.y - m.y, next.x - m.x);
									g.shots.push({
										x: m.x,
										y: m.y,
										vx: Math.cos(a) * 610,
										vy: Math.sin(a) * 610,
										life: 0.55,
										r: 6,
										damageMul: (s.damageMul ?? 1) * 0.7,
										chain: (s.chain ?? 1) - 1,
										poison: s.poison,
										core: true,
										source: "brain_chain",
									});
								}
							}
							break;
						}
					}
				}
			}
			const concentrated = cardLevel(g, "liver_concentrated"),
				concentratedTick = concentrated ? levelValue(AUGMENT_BALANCE.liverConcentrated.tickSeconds, concentrated) : 1;
			for (const f of g.fields) {
				f.life -= dt;
				f.tick -= dt;
				for (const m of g.mobs)
					if (Math.hypot(m.x - f.x, m.y - f.y) < f.r) {
						dealDamage(g, m, (7 + f.stack * 4) * dt, "liver_field");
						m.toxin = Math.max(m.toxin, 0.3);
						if (concentrated && f.tick <= 0) {
							m.poisonStacks = Math.min(8, m.poisonStacks + 1);
							m.toxin = 4;
						}
					}
				if (f.tick <= 0) f.tick = concentrated ? concentratedTick : 1;
			}
			g.fields = g.fields.filter((f) => f.life > 0);
			if (
				cardLevel(g, "fusion_liver_brain") &&
				g.mainClass === "liver" &&
				g.toxicCoreCooldown <= 0 &&
				g.fields.length &&
				g.mobs.length
			) {
				const source = g.fields[Math.floor(gameRandom(g) * g.fields.length)],
					target = [...g.mobs].sort(
						(a, b) => Math.hypot(a.x - source.x, a.y - source.y) - Math.hypot(b.x - source.x, b.y - source.y),
					)[0];
				if (target) {
					g.fields.push({
						x: target.x,
						y: target.y,
						r: 48 * g.poisonRadiusMul,
						life: 3.2 * g.poisonDurationMul,
						stack: 1,
						kills: 0,
						tick: 0,
					});
					g.toxicCoreCooldown = 4.5;
					pushSkill(g, "liver", 6, target.x, target.y, 84, 0.45, { spin: 5, grow: 1.3 });
					burst(g, target.x, target.y, "#a8d43a", 14);
					g.effect = "추적 독성 · 오염 지역 전파";
					g.effectT = 0.8;
				}
			}
			const dead = g.mobs.filter((m) => m.hp <= 0);
			for (const m of dead) {
				g.kills++;
				burst(g, m.x, m.y, m.boss ? "#ff715b" : "#4ee5e1", m.boss ? 30 : 8);
				const closeKill = Math.hypot(m.x - g.x, m.y - g.y) < g.meleeRange * 1.35,
					bloodflowLevel = cardLevel(g, "heart_bloodflow");
				if (closeKill && (bloodflowLevel || cardLevel(g, "life_sports")))
					g.moveBuff = Math.max(
						g.moveBuff,
						bloodflowLevel ? levelValue(AUGMENT_BALANCE.heartBloodflow.durationSeconds, bloodflowLevel) : 2,
					);
				const circulationLevel = cardLevel(g, "lung_circulation");
				if (g.mainClass === "lung" && circulationLevel) {
					const duration = levelValue(AUGMENT_BALANCE.lungCirculation.durationSeconds, circulationLevel);
					g.galeKillLock = duration;
					g.moveBuff = Math.max(g.moveBuff, duration);
				}
				if (cardLevel(g, "common_regen")) {
					g.killsSinceRegen++;
					if (g.killsSinceRegen >= 20) {
						g.killsSinceRegen = 0;
						const heal = g.maxHp * 0.08 * (1 - g.recoveryPenalty);
						healPlayer(g, heal);
						g.effect = `재생 인자 · 체력 +${Math.round(heal)}`;
						g.effectT = 1.1;
					}
				}
				if (cardLevel(g, "liver_rupture") && m.poisonStacks > 0) {
					const blast = (7 + g.poison * 2) * m.poisonStacks * 1.5 * (1 + (cardLevel(g, "liver_rupture") - 1) * 0.2);
					for (const other of g.mobs)
						if (other !== m && Math.hypot(other.x - m.x, other.y - m.y) < 145) {
							dealDamage(g, other, blast, "liver_rupture");
							other.poisonStacks = Math.min(8, other.poisonStacks + 1);
							other.toxin = 4;
						}
					pushSkill(g, "liver", 5, m.x, m.y, 150, 0.5, { grow: 1.7 });
					burst(g, m.x, m.y, "#a8d43a", 22);
					g.effect = "독성 파열 · 연쇄 오염";
					g.effectT = 0.8;
				}
				if (cardLevel(g, "fusion_brain_liver") && m.poisonStacks > 0) {
					const other = g.mobs
						.filter((o) => o !== m && o.hp > 0)
						.sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
					if (other) {
						other.poisonStacks = Math.min(8, other.poisonStacks + 1);
						other.toxin = 4;
						pushSkill(g, "brain", 6, other.x, other.y, 72, 0.4, { grow: 1.4 });
					}
				}
				const deathField = g.fields.find((f) => Math.hypot(m.x - f.x, m.y - f.y) < f.r);
				if (deathField && cardLevel(g, "fusion_liver_heart")) {
					deathField.kills++;
					if (deathField.kills >= 3) {
						deathField.kills = 0;
						for (const other of g.mobs)
							if (Math.hypot(other.x - deathField.x, other.y - deathField.y) < deathField.r * 1.5)
								dealDamage(g, other, g.damage * 2.1, "fusion_liver_heart");
						burst(g, deathField.x, deathField.y, "#ff715b", 28);
						g.shake = 10;
						g.effect = "독성 폭주 · 지대 폭발";
						g.effectT = 1;
					}
				}
				const frenzy = cardLevel(g, "brain_frenzy");
				if (
					g.mainClass === "brain" &&
					frenzy &&
					g.kills % levelValue(AUGMENT_BALANCE.brainFrenzy.killsPerProc, frenzy) === 0
				) {
					const coreCount = 2 + cardLevel(g, "brain_synapse"),
						targets = [...g.mobs]
							.filter((o) => o !== m && o.hp > 0)
							.sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y));
					for (let i = 0; i < coreCount && targets.length; i++) {
						const target = targets[i % targets.length],
							a = Math.atan2(target.y - g.y, target.x - g.x);
						g.shots.push({
							x: g.x,
							y: g.y,
							vx: Math.cos(a) * 650,
							vy: Math.sin(a) * 650,
							life: 1.4,
							r: 8,
							damageMul: 1.15,
							chain: cardLevel(g, "brain_chain") + g.chainBonus,
							core: true,
							source: "brain_frenzy",
						});
					}
					g.brainVolley = 0.5;
					pushSkill(g, "brain", 5, g.x, g.y, 175, 0.5, { grow: 1.7 });
					g.effect = "사고 폭주 · 코어 일제 사격";
					g.effectT = 1;
				}
				const dropCount = m.boss ? 7 : 1;
				for (let i = 0; i < dropCount; i++) {
					const roll = gameRandom(g),
						a = gameRandom(g) * 6.28,
						s = 35 + gameRandom(g) * 90;
					const kind = m.boss
						? i < 3
							? "xp"
							: i < 5
								? "heal"
								: "organ"
						: roll < 0.72
							? "xp"
							: roll < 0.88
								? "heal"
								: "organ";
					g.drops.push({
						x: m.x,
						y: m.y,
						vx: Math.cos(a) * s,
						vy: Math.sin(a) * s,
						kind,
						organ: kind === "organ" ? ORGAN_KEYS[Math.floor(gameRandom(g) * ORGAN_KEYS.length)] : undefined,
						value: kind === "xp" ? (m.boss ? 4 : 1) : kind === "heal" ? (m.boss ? 18 : 7) : m.boss ? 5 : 2,
						life: 14,
						phase: Math.random() * 6.28,
					});
				}
				if (m.boss) {
					const defeatedBossStage = m.bossStage ?? g.stage;
					g.telemetry.bossResults.push({
						stage: defeatedBossStage + 1,
						killTime: Number(g.t.toFixed(2)),
						playerLevel: g.level,
						hpPercent: Math.max(0, Math.round((g.hp / g.maxHp) * 100)),
					});
					if (defeatedBossStage === 3) {
						endGame(true);
					} else if (!g.augmentDone) {
						g.augmentDone = true;
						openChoice("전투 증강", weightedChoices(g, "boss"));
					}
				}
			}
			g.mobs = g.mobs.filter((m) => m.hp > 0);
			g.shots = g.shots.filter(
				(s) => s.life > 0 && s.x > -30 && s.x < g.worldW + 30 && s.y > -30 && s.y < g.worldH + 30,
			);
			if (g.shots.filter((s) => s.enemy).length > 70) {
				let trim = g.shots.filter((s) => s.enemy).length - 70;
				g.shots = g.shots.filter((s) => !s.enemy || trim-- <= 0);
			}
			let picked = "";
			for (const d of g.drops) {
				d.life -= dt;
				d.phase += dt * 4;
				d.x += d.vx * dt;
				d.y += d.vy * dt;
				d.vx *= 0.92;
				d.vy *= 0.92;
				const dist = Math.hypot(g.x - d.x, g.y - d.y);
				if (dist < 150) {
					const pull = Math.max(180, 620 * (1 - dist / 150));
					d.x += ((g.x - d.x) / Math.max(1, dist)) * pull * dt;
					d.y += ((g.y - d.y) / Math.max(1, dist)) * pull * dt;
				}
				if (dist < 23) {
					d.life = 0;
					if (d.kind === "xp") {
						g.xp += d.value;
						picked = `경험 세포 +${d.value}`;
						if (g.xp >= g.nextXp) {
							g.xp -= g.nextXp;
							g.level++;
							g.nextXp = Math.round(g.nextXp * 1.28);
							picked = `레벨 ${g.level} · 진화 가능`;
							sound.current?.play("level");
							openChoice("세포 진화", weightedChoices(g));
						}
					} else if (d.kind === "heal") {
						const healed = Math.max(1, Math.round(d.value * (1 - g.recoveryPenalty)));
						healPlayer(g, healed);
						picked = `회복 세포 +${healed}`;
					} else if (d.organ) {
						g.organs[d.organ] = Math.min(100, g.organs[d.organ] + d.value);
						if (d.organ === "뇌") g.fireRate = Math.max(0.18, g.fireRate * 0.998);
						else if (d.organ === "심장") {
							g.maxHp += 0.15;
							healPlayer(g, 0.15);
						} else if (d.organ === "폐") g.speed += 0.35;
						else if (d.organ === "간") g.poison += 0.025;
						else {
							g.damage += 0.1;
							g.armor += 0.025;
						}
						picked = `${d.organ} 특화 영양소 +${d.value}`;
					}
					sound.current?.play("pickup");
					burst(g, d.x, d.y, d.kind === "xp" ? "#d8ff3e" : d.kind === "heal" ? "#ff715b" : "#4ee5e1", 6);
				}
			}
			g.drops = g.drops.filter((d) => d.life > 0);
			for (const w of g.warnings) w.life -= dt;
			g.warnings = g.warnings.filter((w) => w.life > 0).slice(-40);
			for (const p of g.parts) {
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.vx *= 0.96;
				p.vy *= 0.96;
				p.life -= dt;
			}
			g.parts = g.parts.filter((p) => p.life > 0).slice(coarse ? -190 : -280);
			for (const fx of g.skillFx) {
				fx.life -= dt;
				fx.rot += fx.spin * dt;
			}
			g.skillFx = g.skillFx.filter((fx) => fx.life > 0);
			if (g.t - g.hudAt > 0.12) {
				g.hudAt = g.t;
				setHud({
					hp: g.hp,
					max: g.maxHp,
					t: g.t,
					stage: g.stage,
					organs: { ...g.organs },
					organLevels: { ...g.organLevels },
					mainClass: g.mainClass,
					level: g.level,
					xp: g.xp,
					nextXp: g.nextXp,
					loot: picked,
					effect: g.effectT > 0 ? g.effect : "",
					chemistries: [...g.chemistries],
					dashCharges: g.dashCharges,
					maxDash: g.maxDash,
					armor: g.armor,
				});
			}
			if (g.benchmarkStopAt && g.t >= g.benchmarkStopAt) endGame(false);
		};
		const loop = (now: number) => {
			const g = game.current,
				frameDt = Math.min(0.033, (now - (g.last || now)) / 1000);
			g.last = now;
			if (g.debug && typeof window !== "undefined") (window as unknown as { __og?: Game }).__og = g;
			if (!g.paused && mode === "play") {
				let stepCount: number;
				if (g.benchmark) stepCount = g.benchmarkSpeed;
				else {
					g.simulationAccumulator += frameDt;
					stepCount = Math.floor(g.simulationAccumulator / SIMULATION_DT);
					g.simulationAccumulator -= stepCount * SIMULATION_DT;
				}
				for (let i = 0; i < stepCount && !g.paused; i++) simulateStep(g, SIMULATION_DT);
			}
			const sx = (Math.random() - 0.5) * g.shake,
				sy = (Math.random() - 0.5) * g.shake;
			const camX = Math.max(0, Math.min(g.worldW - g.w, g.x - g.w / 2));
			const camY = Math.max(0, Math.min(g.worldH - g.h, g.y - g.h / 2));
			const visible = (x: number, y: number, pad = 90) =>
				x > camX - pad && x < camX + g.w + pad && y > camY - pad && y < camY + g.h + pad;
			ctx.save();
			ctx.translate(sx - camX, sy - camY);
			drawEnvironment(g, camX, camY);
			for (const f of g.fields) {
				if (!visible(f.x, f.y, f.r)) continue;
				ctx.save();
				ctx.globalAlpha = Math.min(0.22 + f.stack * 0.13, f.life * 0.2);
				ctx.fillStyle = f.stack >= 3 ? "#62a51f" : f.stack === 2 ? "#83bf2c" : "#9ed83b";
				ctx.strokeStyle = f.stack >= 3 ? "#ecff6a" : "#d8ff3e";
				ctx.lineWidth = 1 + f.stack;
				ctx.beginPath();
				ctx.arc(f.x, f.y, f.r + Math.sin(g.t * 6 + f.x) * 4, 0, Math.PI * 2);
				ctx.fill();
				ctx.setLineDash([8, 7]);
				ctx.stroke();
				if (f.stack > 1) {
					ctx.setLineDash([]);
					ctx.globalAlpha = 0.8;
					ctx.fillStyle = "#f5ffd8";
					ctx.font = "800 11px Pretendard";
					ctx.textAlign = "center";
					ctx.fillText(`독 ${f.stack}단계`, f.x, f.y + 4);
				}
				ctx.restore();
				const ls = skillSheets.liver;
				if (ls.complete && ls.naturalWidth) {
					const idx = Math.min(3, f.stack),
						lcw = ls.naturalWidth / 4,
						lch = ls.naturalHeight / 2,
						fsz = f.r * 1.9;
					ctx.save();
					ctx.globalAlpha = Math.min(0.5, f.life * 0.3);
					ctx.globalCompositeOperation = "screen";
					ctx.drawImage(
						ls,
						(idx % 4) * lcw,
						Math.floor(idx / 4) * lch,
						lcw,
						lch,
						f.x - fsz / 2,
						f.y - fsz / 2,
						fsz,
						fsz,
					);
					ctx.restore();
				}
			}
			for (const w of g.warnings) {
				// 시전자가 살아있으면 예고 도형의 원점을 시전자 현재 위치로 갱신한다
				const alive = w.owner && w.owner.hp > 0,
					ox = alive ? w.owner!.x : w.x,
					oy = alive ? w.owner!.y : w.y;
				if (!visible(ox, oy, 200) && !visible(w.tx, w.ty, 200)) continue;
				const progress = 1 - w.life / w.max,
					pulse = 0.35 + Math.sin(g.t * 24) * 0.15;
				ctx.save();
				ctx.globalAlpha = 0.42 + progress * 0.42;
				ctx.strokeStyle = "#ff715b";
				ctx.fillStyle = `rgba(255,113,91,${pulse})`;
				ctx.lineWidth = 3;
				if (w.kind === "circle") {
					// 보스 탄막은 보스 몸에서 사방으로 퍼진다 → 플레이어 발밑 원판이 아니라
					// 보스 중심에서 바깥으로 확장하는 링 + 조준 방향(5연발) 부채꼴로 예고한다
					ctx.beginPath();
					ctx.arc(ox, oy, w.r * (0.24 + progress * 0.76), 0, Math.PI * 2);
					ctx.stroke();
					const aim = Math.atan2(w.ty - oy, w.tx - ox);
					ctx.beginPath();
					ctx.moveTo(ox, oy);
					ctx.arc(ox, oy, w.r * 1.15, aim - 0.3, aim + 0.3);
					ctx.closePath();
					ctx.fill();
					ctx.globalAlpha *= 0.7;
					ctx.beginPath();
					ctx.arc(ox, oy, w.r * 0.24, 0, Math.PI * 2);
					ctx.fill();
				} else {
					const a = Math.atan2(w.ty - oy, w.tx - ox),
						len = Math.min(620, Math.hypot(w.tx - ox, w.ty - oy));
					ctx.translate(ox, oy);
					ctx.rotate(a);
					ctx.fillRect(20, -w.r / 2, len, w.r);
					ctx.strokeRect(20, -w.r / 2, len, w.r);
				}
				ctx.restore();
			}
			for (const p of g.parts) {
				if (!visible(p.x, p.y, 10)) continue;
				ctx.globalAlpha = Math.max(0, p.life * 2);
				ctx.fillStyle = p.color;
				ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
			}
			ctx.globalAlpha = 1;
			const renderScale = coarse ? 0.8 : 1;
			const drawVfx = (index: number, x: number, y: number, size: number, alpha = 1, rotation = 0) => {
				if (!vfxArt.complete || !vfxArt.naturalWidth) return;
				const cellW = vfxArt.naturalWidth / 4,
					cellH = vfxArt.naturalHeight / 2,
					col = index % 4,
					row = Math.floor(index / 4);
				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(rotation);
				ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
				ctx.globalCompositeOperation = "screen";
				ctx.drawImage(vfxArt, col * cellW, row * cellH, cellW, cellH, -size / 2, -size / 2, size, size);
				ctx.restore();
			};
			const drawSkill = (fx: SkillFx) => {
				const sheet = skillSheets[fx.sheet];
				if (!sheet.complete || !sheet.naturalWidth) return;
				const cellW = sheet.naturalWidth / 4,
					cellH = sheet.naturalHeight / 2,
					col = fx.index % 4,
					row = Math.floor(fx.index / 4);
				const p = 1 - fx.life / fx.max,
					scale = (1 + (fx.grow - 1) * p) * renderScale,
					size = fx.size * scale;
				ctx.save();
				ctx.translate(fx.x, fx.y);
				ctx.rotate(fx.rot);
				ctx.globalAlpha = Math.max(0, Math.min(1, Math.sin((fx.life / fx.max) * Math.PI * 0.5)));
				ctx.globalCompositeOperation = "screen";
				ctx.drawImage(sheet, col * cellW, row * cellH, cellW, cellH, -size / 2, -size / 2, size, size);
				ctx.restore();
			};
			for (const d of g.drops) {
				if (!visible(d.x, d.y, 30)) continue;
				const bob = Math.sin(d.phase) * 3;
				ctx.save();
				ctx.translate(d.x, d.y + bob);
				const dropGlow = d.kind === "xp" ? "#d8ff3e" : d.kind === "heal" ? "#ff715b" : "#4ee5e1";
				// 배경 대비용 어두운 받침 + 광도 강화
				ctx.fillStyle = "rgba(0,0,0,.34)";
				ctx.beginPath();
				ctx.ellipse(0, 3, 15 * renderScale, 6 * renderScale, 0, 0, 6.28);
				ctx.fill();
				ctx.rotate(d.phase * 0.35);
				ctx.shadowBlur = 22;
				ctx.shadowColor = dropGlow;
				if (itemArt.complete && itemArt.naturalWidth) {
					const row = d.kind === "xp" ? 0 : d.kind === "heal" ? 1 : 2,
						size = 46 * renderScale;
					ctx.drawImage(itemArt, g.stage * 384, row * (1024 / 3), 384, 1024 / 3, -size / 2, -size / 2, size, size);
				} else {
					ctx.fillStyle = dropGlow;
					ctx.beginPath();
					ctx.arc(0, 0, 10, 0, 6.28);
					ctx.fill();
				}
				ctx.restore();
			}
			for (const s of g.shots) {
				if (!visible(s.x, s.y, 42)) continue;
				const sprite = s.enemy
					? g.stage === 3 && g.mobs.some((m) => m.boss)
						? 6
						: 5
					: g.chemistries.includes("brain_liver")
						? 4
						: s.r > 11
							? 7
							: s.r > 9
								? 2
								: s.r === 6
									? 1
									: 0;
				const glow = s.enemy
					? "#ff715b"
					: sprite === 4
						? "#a49bd8"
						: sprite === 1
							? "#a49bd8"
							: sprite === 2 || sprite === 7
								? "#ff715b"
								: "#d8ff3e";
				ctx.save();
				ctx.translate(s.x, s.y);
				ctx.shadowBlur = s.enemy ? 16 : 18;
				ctx.shadowColor = glow;
				// 적 탄환은 어두운 외곽으로 배경과 분리해 "날아오는 게 보이도록"
				if (s.enemy) {
					ctx.fillStyle = "rgba(10,4,4,.5)";
					ctx.beginPath();
					ctx.arc(0, 0, s.r + 4, 0, 6.28);
					ctx.fill();
				}
				if (projectileArt.complete && projectileArt.naturalWidth) {
					const cellW = projectileArt.naturalWidth / 4,
						cellH = projectileArt.naturalHeight / 2,
						col = sprite % 4,
						row = Math.floor(sprite / 4),
						size = (s.enemy ? 44 : s.r > 9 ? 56 : 38) * renderScale;
					ctx.drawImage(projectileArt, col * cellW, row * cellH, cellW, cellH, -size / 2, -size / 2, size, size);
				} else {
					ctx.fillStyle = glow;
					ctx.beginPath();
					ctx.arc(0, 0, (s.r + 2) * renderScale, 0, 6.28);
					ctx.fill();
				}
				ctx.restore();
			}
			ctx.shadowBlur = 0;
			for (const m of g.mobs) {
				if (!visible(m.x, m.y, m.boss ? 100 : 50)) continue;
				ctx.save();
				ctx.translate(m.x, m.y);
				const atlas = stageArt[g.stage],
					idx = m.boss ? 3 : m.kind;
				const cell = (atlas.complete && atlas.naturalWidth ? atlas.naturalWidth : 1254) / 4,
					size = (m.boss ? (g.stage === 3 ? 126 : 118) : 68 * (m.elite ? 1.14 : 1)) * renderScale;
				const frame = Math.floor(g.t * (m.boss ? 4.5 : 7) + (m.x + m.y) * 0.008) % 4,
					bob = Math.sin(g.t * (m.boss ? 9 : 14) + (m.x + m.y) * 0.01) * (m.boss ? 2 : 3);
				const facingRight = g.x >= m.x;
				ctx.fillStyle = "rgba(0,0,0,.28)";
				ctx.beginPath();
				ctx.ellipse(
					0,
					size * 0.31,
					Math.max(11, size * 0.28) * (1 - Math.abs(bob) * 0.025),
					Math.max(4, size * 0.075),
					0,
					0,
					6.28,
				);
				ctx.fill();
				if (m.elite && !m.boss) {
					const pulse = 0.65 + Math.sin(g.t * 7 + m.x * 0.01) * 0.18;
					ctx.globalAlpha = pulse;
					ctx.strokeStyle = "#ff5f46";
					ctx.lineWidth = 3 * renderScale;
					ctx.shadowColor = "#ff5f46";
					ctx.shadowBlur = 18 * renderScale;
					ctx.beginPath();
					ctx.ellipse(0, size * 0.26, size * 0.4, size * 0.14, 0, 0, Math.PI * 2);
					ctx.stroke();
					ctx.shadowBlur = 0;
					ctx.globalAlpha = 1;
				}
				ctx.translate(0, bob);
				ctx.rotate(Math.sin(g.t * 7 + (m.x + m.y) * 0.01) * 0.018);
				// 몬스터 아틀라스 원본이 왼쪽을 보고 있으므로, 플레이어가 오른쪽에 있을 때 뒤집어야 마주 본다
				if (facingRight) ctx.scale(-1, 1);
				if (m.hit > 0) {
					ctx.globalAlpha = 0.55;
					ctx.fillStyle = "#fff";
					ctx.beginPath();
					ctx.arc(0, 0, size * 0.42, 0, 6.28);
					ctx.fill();
					ctx.globalAlpha = 1;
				}
				if (atlas.complete && atlas.naturalWidth) {
					ctx.shadowColor = "rgba(0,0,0,.6)";
					ctx.shadowBlur = (m.boss ? 12 : 8) * renderScale;
					ctx.drawImage(atlas, frame * cell, idx * cell, cell, cell, -size / 2, -size * 0.58, size, size);
					ctx.shadowBlur = 0;
				} else {
					ctx.fillStyle = m.boss ? "#ff715b" : "#76c8b9";
					ctx.beginPath();
					ctx.arc(0, 0, m.r, 0, 6.28);
					ctx.fill();
				}
				if (m.toxin > 0 || m.poisonStacks > 0) {
					ctx.strokeStyle = "#a8d43a";
					ctx.lineWidth = 2 + Math.min(4, m.poisonStacks);
					ctx.globalAlpha = 0.8;
					ctx.beginPath();
					ctx.arc(0, 0, size * 0.42 + Math.sin(g.t * 8) * 2, 0, Math.PI * 2);
					ctx.stroke();
					ctx.globalAlpha = 1;
				}
				if (m.boss) {
					ctx.fillStyle = "rgba(0,0,0,.55)";
					ctx.fillRect(-m.r, -m.r - 13, m.r * 2, 5);
					ctx.fillStyle = "#d8ff3e";
					ctx.fillRect(-m.r, -m.r - 13, m.r * 2 * (m.hp / m.max), 5);
				}
				ctx.restore();
				if (m.elite && !m.boss) {
					ctx.save();
					ctx.translate(m.x, m.y - size * 0.62);
					const barWidth = 48 * renderScale;
					ctx.fillStyle = "rgba(7,12,12,.88)";
					ctx.fillRect(-barWidth / 2, -7 * renderScale, barWidth, 6 * renderScale);
					ctx.fillStyle = "#ff5f46";
					ctx.fillRect(-barWidth / 2, -7 * renderScale, barWidth * (m.hp / m.max), 6 * renderScale);
					ctx.beginPath();
					ctx.arc(0, -15 * renderScale, 8 * renderScale, 0, Math.PI * 2);
					ctx.fillStyle = "#ff5f46";
					ctx.fill();
					ctx.fillStyle = "#101515";
					ctx.font = `900 ${10 * renderScale}px monospace`;
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText("!", 0, -15 * renderScale);
					ctx.restore();
				}
				if (m.hit > 0) drawVfx(3, m.x, m.y, (m.boss ? 92 : 52) * renderScale, Math.min(1, m.hit * 12), g.t * 2);
			}
			for (const fx of g.skillFx) if (visible(fx.x, fx.y, fx.size * 2)) drawSkill(fx);
			const playerMoving = Math.hypot(g.vx, g.vy) > 20,
				moveAngle = Math.atan2(g.vy, g.vx);
			if (g.mainClass === "brain") {
				const synapse = cardLevel(g, "brain_synapse"),
					chain = cardLevel(g, "brain_chain"),
					coreCount = 2 + synapse;
				const cores = Array.from({ length: coreCount }, (_, i) => {
					const a = g.t * (1.9 + cardLevel(g, "brain_frenzy") * 0.08) + (i / coreCount) * Math.PI * 2,
						r = 50 + Math.sin(g.t * 3 + i) * 4;
					return { x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r };
				});
				if (synapse || chain) {
					ctx.save();
					ctx.strokeStyle = chain >= 3 ? "#d8ff3e" : "#a49bd8";
					ctx.lineWidth = 1.5 + Math.min(2, chain * 0.55);
					ctx.globalAlpha = 0.2 + Math.min(0.35, synapse * 0.08) + (g.brainVolley > 0 ? 0.22 : 0);
					ctx.setLineDash(chain >= 2 ? [7, 5] : []);
					ctx.beginPath();
					for (let i = 0; i < cores.length; i++) {
						const next = cores[(i + 1) % cores.length];
						ctx.moveTo(cores[i].x, cores[i].y);
						ctx.lineTo(next.x, next.y);
					}
					ctx.stroke();
					ctx.restore();
				}
				for (let i = 0; i < cores.length; i++) {
					const core = cores[i];
					ctx.save();
					ctx.shadowBlur = g.brainVolley > 0 ? 28 : 16;
					ctx.shadowColor = "#a49bd8";
					ctx.fillStyle = g.brainVolley > 0 ? "#f2ebff" : "#8f83dc";
					ctx.beginPath();
					ctx.arc(core.x, core.y, g.brainVolley > 0 ? 9 : 7, 0, Math.PI * 2);
					ctx.fill();
					ctx.strokeStyle = "#d8ff3e";
					ctx.globalAlpha = 0.7;
					ctx.beginPath();
					ctx.arc(core.x, core.y, 12 + Math.sin(g.t * 8 + i) * 2, 0, Math.PI * 2);
					ctx.stroke();
					ctx.restore();
				}
				g.brainVolley = Math.max(0, g.brainVolley - 0.016);
			}
			if (g.shield > 0) {
				ctx.save();
				ctx.globalAlpha = 0.45 + 0.12 * Math.sin(g.t * 7);
				ctx.strokeStyle = "#4ee5e1";
				ctx.lineWidth = 4;
				ctx.beginPath();
				ctx.arc(g.x, g.y, 43 + Math.sin(g.t * 4) * 2, 0, Math.PI * 2);
				ctx.stroke();
				ctx.restore();
			}
			if (playerMoving)
				drawVfx(
					0,
					g.x - Math.cos(moveAngle) * 28,
					g.y - Math.sin(moveAngle) * 28,
					62 * renderScale,
					0.28 + Math.sin(g.t * 15) * 0.08,
					moveAngle,
				);
			if (g.mainClass === "lung" && playerMoving && g.galeMomentum > 0.35) {
				const blade = cardLevel(g, "lung_bladewind"),
					trails = 1 + Math.min(2, blade);
				ctx.save();
				ctx.strokeStyle = cardLevel(g, "lung_eyestorm") >= 3 ? "#d8ff3e" : "#4ee5e1";
				ctx.lineWidth = 2 + g.galeMomentum * 0.45;
				ctx.globalAlpha = 0.18 + g.galeMomentum * 0.09;
				ctx.lineCap = "round";
				for (let i = 0; i < trails; i++) {
					const side = (i - (trails - 1) / 2) * 13,
						nx = -Math.sin(moveAngle) * side,
						ny = Math.cos(moveAngle) * side;
					ctx.beginPath();
					ctx.moveTo(g.x + nx - Math.cos(moveAngle) * 20, g.y + ny - Math.sin(moveAngle) * 20);
					ctx.lineTo(
						g.x + nx - Math.cos(moveAngle) * (70 + g.galeMomentum * 18),
						g.y + ny - Math.sin(moveAngle) * (70 + g.galeMomentum * 18),
					);
					ctx.stroke();
				}
				ctx.restore();
			}
			if (g.mainClass === "muscle" && g.impactCharge > 0.02) {
				const gravity = cardLevel(g, "muscle_gravity"),
					radius = 45 + g.impactCharge * 42;
				ctx.save();
				ctx.strokeStyle = g.impactCharge > 0.75 ? "#f4ffaf" : "#d8ff3e";
				ctx.lineWidth = 2 + g.impactCharge * 4;
				ctx.globalAlpha = 0.28 + g.impactCharge * 0.42;
				ctx.setLineDash(gravity ? [7, 5] : []);
				ctx.beginPath();
				ctx.arc(g.x, g.y, radius, 0, Math.PI * 2);
				ctx.stroke();
				if (gravity) {
					ctx.globalAlpha *= 0.7;
					ctx.beginPath();
					ctx.arc(g.x, g.y, radius * (1.35 + gravity * 0.18), -g.t * 1.8, Math.PI * 0.8 - g.t * 1.8);
					ctx.stroke();
				}
				ctx.restore();
			}
			if (g.dashFx > 0)
				drawVfx(
					1,
					g.x - Math.cos(moveAngle) * 12,
					g.y - Math.sin(moveAngle) * 12,
					(92 + (0.34 - g.dashFx) * 120) * renderScale,
					g.dashFx / 0.34,
					moveAngle,
				);
			if (g.mainClass === "liver")
				drawVfx(6, g.x, g.y + 18, (104 + Math.sin(g.t * 3) * 6) * renderScale, 0.24, g.t * 0.08);
			if (g.mainClass === "brain")
				drawVfx(5, g.x, g.y - 8, (88 + Math.sin(g.t * 4) * 4) * renderScale, 0.34, g.t * 0.35);
			if (g.heartFx > 0) drawVfx(4, g.x, g.y, (105 + (0.58 - g.heartFx) * 170) * renderScale, g.heartFx / 0.58);
			if (g.castFx > 0)
				drawVfx(
					2,
					g.x + Math.cos(g.castAngle) * 30,
					g.y + Math.sin(g.castAngle) * 30,
					42 * renderScale,
					g.castFx / 0.16,
					g.castAngle,
				);
			ctx.save();
			ctx.translate(g.x, g.y);
			const formIndex =
					g.mainClass === "brain"
						? 1
						: g.mainClass === "heart"
							? 3
							: g.mainClass === "liver"
								? 5
								: g.mainClass === "lung"
									? 2
									: g.mainClass === "muscle"
										? 6
										: 0,
				playerSize = (formIndex ? 86 : 74) * renderScale;
			const playerBob = Math.sin(g.t * (Math.hypot(g.vx, g.vy) > 20 ? 13 : 5)) * 2;
			ctx.fillStyle = "rgba(0,0,0,.32)";
			ctx.beginPath();
			ctx.ellipse(0, 25, 23 - Math.abs(playerBob), 7, 0, 0, 6.28);
			ctx.fill();
			ctx.translate(0, playerBob);
			if (g.vx > 12) playerFace = -1;
			else if (g.vx < -12) playerFace = 1;
			if (playerFace === -1) ctx.scale(-1, 1);
			ctx.globalAlpha = g.inv > 0 && Math.floor(g.t * 20) % 2 ? 0.38 : 1;
			if (playerArt.complete && playerArt.naturalWidth) {
				const sx = (formIndex % 4) * 384,
					sy = Math.floor(formIndex / 4) * 512,
					dx = -playerSize / 2,
					dy = -playerSize * 0.64;
				// 1패스: 어두운 외곽 대비 → 2패스: 애시드 글로우
				ctx.shadowColor = "rgba(0,0,0,.55)";
				ctx.shadowBlur = 10 * renderScale;
				ctx.drawImage(playerArt, sx, sy, 384, 512, dx, dy, playerSize, playerSize);
				ctx.shadowColor = "#d8ff3e";
				ctx.shadowBlur = 20;
				ctx.drawImage(playerArt, sx, sy, 384, 512, dx, dy, playerSize, playerSize);
			} else {
				ctx.shadowBlur = 22;
				ctx.shadowColor = "#d8ff3e";
				ctx.fillStyle = "#d8ff3e";
				ctx.beginPath();
				ctx.arc(0, 0, 18, 0, 6.28);
				ctx.fill();
			}
			ctx.restore();
			ctx.globalAlpha = 1;
			ctx.shadowBlur = 0;
			ctx.restore();
			// 피격 방향 비네트: 맞은 쪽으로 붉은 빛이 쏠린다 (rAF로 부드럽게)
			if (hurtRef.current) {
				hurtRef.current.style.opacity = String(Math.min(0.92, g.hurtT * 1.8));
				hurtRef.current.style.setProperty("--hx", 50 + Math.cos(g.hurtDir) * 48 + "%");
				hurtRef.current.style.setProperty("--hy", 50 + Math.sin(g.hurtDir) * 48 + "%");
			}
			if (lowRef.current)
				lowRef.current.style.opacity = !g.invuln && g.hp > 0 && g.hp / g.maxHp < 0.3 && mode === "play" ? "1" : "0";
			raf.current = requestAnimationFrame(loop);
		};
		const onDebugKey = (e: KeyboardEvent) => {
			const g = game.current;
			if (!g.debug || mode !== "play" || g.paused) return;
			if (e.code === "KeyB") {
				spawn(g, true);
				sound.current?.play("boss");
				g.effect = "[debug] 보스 소환";
				g.effectT = 1.5;
			} else if (e.code === "KeyN") {
				for (let i = 0; i < 6; i++) spawn(g);
				g.effect = "[debug] 잡몹 6 소환";
				g.effectT = 1.2;
			} else if (e.code === "KeyK") {
				for (const m of g.mobs) if (!m.boss) m.hp = 0;
				g.effect = "[debug] 잡몹 정리";
				g.effectT = 1;
			} else if (e.code === "KeyH") {
				g.hp = g.maxHp;
				g.shield = g.maxHp * 0.2;
				g.effect = "[debug] 풀 회복+실드";
				g.effectT = 1;
			} else if (e.code === "KeyI") {
				g.invuln = !g.invuln;
				g.effect = `[debug] 무적 ${g.invuln ? "ON" : "OFF"}`;
				g.effectT = 1.4;
			} else if (e.code === "KeyG") {
				endGame(false);
			}
		};
		addEventListener("keydown", onDebugKey);
		raf.current = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(raf.current);
			removeEventListener("keydown", onDebugKey);
		};
	}, [mode, dashNow, endGame, openChoice]);

	const choose = (c: Choice) => {
		const g = game.current;
		c.apply(g);
		g.telemetry.choices.push({
			id: c.id ?? null,
			name: c.name,
			kind: c.kind ?? null,
			tier: c.tier ?? null,
			choiceType,
			time: Number(g.t.toFixed(2)),
			stage: g.stage + 1,
			playerLevel: g.level,
			cardLevel: c.id && c.maxLevel ? cardLevel(g, c.id) : null,
		});
		g.effect = `${c.name} · ${c.effect}`;
		g.effectT = 2.4;
		if (c.kind === "fusion" && c.id) {
			const set = new Set<string>(JSON.parse(localStorage.getItem("organ-fusions") || "[]"));
			set.add(c.id);
			const arr = [...set];
			localStorage.setItem("organ-fusions", JSON.stringify(arr));
			setFoundFusions(arr);
		}
		if (c.chemistry && !g.chemistries.includes(c.chemistry)) {
			g.chemistries.push(c.chemistry);
			g.effect = `케미 발견 · ${c.name}`;
			g.effectT = 2.8;
			const found = new Set<string>(JSON.parse(localStorage.getItem("organ-chemistry") || "[]"));
			found.add(c.chemistry);
			const chemistries = [...found];
			localStorage.setItem("organ-chemistry", JSON.stringify(chemistries));
			setArchive((old) => ({ ...old, chemistries }));
		}
		ORGAN_KEYS.forEach((k) => (g.organs[k] = Math.max(0, Math.min(100, g.organs[k]))));
		if (choiceType === "생활 선택") g.choices.push(c.name);
		else g.augments.push(c.name);
		sendGameLabEvent("game_choice_selected", {
			runNumber: runNumber.current,
			choiceType,
			choice: c.name,
			effect: c.effect,
			elapsedSeconds: Math.round(g.t),
			stage: g.stage + 1,
			level: g.level,
			organLevels: { ...g.organLevels },
			mainClass: g.mainClass,
		});
		if (c.organLevel && !g.awakened && g.organLevels[c.organLevel] >= 3) {
			sound.current?.play("level");
			openChoice("장기 각성", awakeningChoices(c.organLevel));
			return;
		}
		if (c.awakening && c.awakening !== "hold") {
			g.effect = `${CORE_META[c.awakening].className} 각성 · 전투 방식이 고정됩니다`;
			g.effectT = 3.2;
			g.heartFx = 0.7;
			pushSkill(g, c.awakening, 7, g.x, g.y, 240, 0.85, { grow: 1.9 });
			sound.current?.play("boss");
		}
		g.paused = false;
		g.last = performance.now();
		setMode("play");
	};
	useEffect(() => {
		if (mode !== "choice" || !game.current.benchmarkTarget || !cards.length) return;
		const target = game.current.benchmarkTarget;
		const score = (c: Choice) => {
			if (c.awakening === target) return 1000;
			if (c.organLevel === target) return game.current.awakened ? 400 : 900;
			if (c.kind === "class" && c.id?.startsWith(`${target}_`))
				return 800 + (5 - (c.tier ?? 4)) * 10 + (cardLevel(game.current, c.id) > 0 ? 20 : 0);
			if (c.kind === "fusion" && c.id?.startsWith(`fusion_${target}_`)) return 700;
			if (c.kind === "common") return c.id === "common_division" ? 650 : c.id === "common_regen" ? 620 : 600;
			if (c.kind === "life") return 500 + (c.cost ? 0 : 20);
			return 100;
		};
		const selected = [...cards].sort((a, b) => score(b) - score(a))[0];
		const timer = window.setTimeout(() => choose(selected), 80);
		return () => window.clearTimeout(timer);
	}, [mode, cards, choiceType]);
	useEffect(() => {
		if (mode !== "choice") return;
		const onChoiceKey = (e: KeyboardEvent) => {
			if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space", "Enter", "Digit1", "Digit2", "Digit3"].includes(e.code))
				e.preventDefault();
			if (e.code === "ArrowLeft" || e.code === "KeyA") setSelectedCard((v) => (v - 1 + cards.length) % cards.length);
			else if (e.code === "ArrowRight" || e.code === "KeyD") setSelectedCard((v) => (v + 1) % cards.length);
			// Space는 대시 키라 증강 선택에서는 확정 입력으로 쓰지 않는다(위쪽 preventDefault로 버튼 기본 동작도 차단)
			else if (e.code === "Enter") {
				if (!e.repeat && cards[selectedCard]) choose(cards[selectedCard]);
			} else if (e.code.startsWith("Digit")) {
				const index = Number(e.code.slice(-1)) - 1;
				if (cards[index]) choose(cards[index]);
			}
		};
		addEventListener("keydown", onChoiceKey);
		return () => removeEventListener("keydown", onChoiceKey);
	}, [mode, cards, selectedCard, choose]);
	// 스테이지 타이틀은 상시 HUD에서 빼는 대신 전환 순간에만 중앙에 크게 띄운다(생애가 바뀌었다는 사건성 확보)
	const [stageIntro, setStageIntro] = useState(false);
	const stageIntroSeen = useRef(-1);
	useEffect(() => {
		// 런이 끝났을 때만 초기화한다. 생활 선택(choice)·일시정지에서 초기화하면
		// 같은 스테이지 안에서 카드를 고를 때마다 타이틀이 다시 떠서 중복된다
		if (mode === "start" || mode === "report") {
			stageIntroSeen.current = -1;
			setStageIntro(false);
			return;
		}
		// 선택·일시정지 중에는 오버레이만 내리고 "이미 봤다"는 기록은 유지
		if (mode !== "play") {
			setStageIntro(false);
			return;
		}
		if (stageIntroSeen.current === hud.stage) return;
		stageIntroSeen.current = hud.stage;
		setStageIntro(true);
		const timer = window.setTimeout(() => setStageIntro(false), 2600);
		return () => window.clearTimeout(timer);
	}, [mode, hud.stage]);
	// 각성 카드는 알림이지 상시 패널이 아니다. 직업명은 인체도 헤더가, SPACE 액션은 좌하단 HUD가
	// 이미 상시 표시하므로 6초 뒤 사라지게 해 좌측 시야를 영구적으로 비운다
	const [awakenCard, setAwakenCard] = useState(false);
	useEffect(() => {
		if (!hud.mainClass) {
			setAwakenCard(false);
			return;
		}
		setAwakenCard(true);
		const timer = window.setTimeout(() => setAwakenCard(false), 6000);
		return () => window.clearTimeout(timer);
	}, [hud.mainClass]);
	const gene = archive.gene;
	const strongest = ORGAN_KEYS.reduce((a, b) => (report.organs[a] > report.organs[b] ? a : b));
	const mainName = report.mainClass ? CORE_META[report.mainClass].className : null;
	const build = mainName ? (report.fusions.length ? `${mainName} · ${report.fusions[0]}` : mainName) : "미각성 생존자";
	const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
	const state = (v: number) => (v >= 70 ? "healthy" : v >= 30 ? "normal" : "danger");
	const activeChem = CHEMISTRY.find((c) => c.id === hud.chemistries[hud.chemistries.length - 1]);
	const activeClass = hud.mainClass ? CORE_META[hud.mainClass] : null;
	// 상단 HUD에는 장소만 칩으로 남기고 "0—20세" 연령대는 스테이지 전환 오버레이에서만 크게 보여준다
	const stagePlace = STAGES[hud.stage][0].split(" · ")[1] ?? STAGES[hud.stage][0];
	// 인체도 헤더를 "각성까지 근육 2/3"처럼 진행형으로 만들기 위한 선두 장기
	const leadCore = CORE_ORDER.reduce((a, b) => (hud.organLevels[b] > hud.organLevels[a] ? b : a));
	const actionName = activeClass?.action ?? "DASH";
	// 캔버스의 formIndex(720행)와 같은 매핑: 각성 직업별 스프라이트 시트 칸
	const playerForm = CLASS_CODEX.find((c) => c.core === hud.mainClass)?.form ?? 0;
	const discovered = archive.chemistries;
	const bestKills = archive.bestKills;
	const bestTime = archive.bestTime;
	const cardOrgans = (c: Choice) =>
		c.organs ??
		ORGAN_KEYS.filter(
			(k) =>
				c.name.includes(k) ||
				(
					{
						뇌: ["시냅스", "신경", "집중", "공부", "야근"],
						심장: ["심실", "맥박", "아드레날린"],
						폐: ["폐포", "호흡", "대시", "등산"],
						간: ["해독", "독성", "회식", "식단"],
						근육: ["근육", "근섬유", "운동", "헬스", "재활"],
					}[k] as string[]
				).some((v) => c.name.includes(v)),
		);

	return (
		<main className="game-shell">
			<section className="frame">
				<canvas ref={canvas} width={1280} height={720} tabIndex={0} aria-label="장기 프로젝트 게임 화면" />
				{(mode === "start" || mode === "play") && (
					<>
						<button
							className="sound-btn"
							onClick={() => {
								const next = !isMuted;
								setIsMuted(next);
								sound.current ??= createSoundEngine();
								sound.current.setMuted(next);
								if (!next) sound.current.play("pickup");
							}}
							aria-label={isMuted ? "사운드 켜기" : "사운드 끄기"}
						>
							<SoundGlyph muted={isMuted} /> {isMuted ? "소리 켜기" : "사운드"}
						</button>
						<button
							className="fullscreen-btn"
							onClick={toggleFullscreen}
							aria-label={isFullscreen ? "전체화면 종료" : "전체화면 시작"}
						>
							<FullscreenGlyph on={isFullscreen} /> {isFullscreen ? "나가기" : "전체화면"} <kbd>F</kbd>
						</button>
					</>
				)}
				{mode === "play" && (
					<div className="mobile-controls">
						<div
							ref={joystick}
							className="touch-stick"
							onPointerDown={moveStick}
							onPointerMove={moveStick}
							onPointerUp={releaseStick}
							onPointerCancel={releaseStick}
						>
							<span style={{ transform: `translate(${stick.x}px,${stick.y}px)` }} />
						</div>
						<button
							className="touch-dash"
							onPointerDown={(e) => {
								e.preventDefault();
								dashNow();
							}}
						>
							<b>{actionName}</b>
							<span>
								{Array.from({ length: hud.maxDash }, (_, i) => (
									<i className={i < hud.dashCharges ? "ready" : ""} key={i} />
								))}
							</span>
						</button>
					</div>
				)}
				<div className="rotate-device">
					<b>↻</b>
					<span>가로 화면으로 돌려주세요</span>
					<small>회전하는 동안 게임은 잠시 멈춥니다.</small>
				</div>
				{mode === "start" && (
					<div className="screen menu-screen" onPointerMove={moveKeyVisual}>
						<nav className="meta-nav">
							<div className="nav-brand">
								ORGAN
								<br />
								<b>PROJECT</b>
							</div>
							{(
								[
									["home", "생애 시작"],
									["heroes", "영웅 도감"],
									["items", "생활 보관함"],
									["archive", "유전 기록"],
								] as const
							).map(([id, label]) => (
								<button className={menuSection === id ? "active" : ""} key={id} onClick={() => setMenuSection(id)}>
									{label}
									<span>↗</span>
								</button>
							))}
							<div className="nav-keys">
								<kbd>WASD</kbd> 이동
								<br />
								<kbd>SPACE</kbd> 직업 액션
								<br />
								<kbd>ESC</kbd> 메뉴
							</div>
						</nav>
						<section className="meta-content">
							{menuSection === "home" && (
								<div className="home-panel">
									<div className="eyebrow">ORGAN PROJECT / LIFE-01</div>
									<h1 className="title">
										장기
										<br />
										<span>프로젝트</span>
									</h1>
									<p className="lede">
										생활을 선택하고 장기를 성장시키며, 마지막 적 <b>‘노화’</b>와 맞서세요.
									</p>
									<div className="difficulty" aria-label="난이도 선택">
										<button onClick={() => start("easy")}>
											<small>CASUAL</small>
											<b>EASY</b>
										</button>
										<button className="recommended" onClick={() => start("normal")}>
											<small>RECOMMENDED</small>
											<b>NORMAL</b>
										</button>
										<button onClick={() => start("hard")}>
											<small>SURVIVAL</small>
											<b>HARD</b>
										</button>
									</div>
									<div className="key-visual" aria-hidden="true" ref={keyVisual}>
									<span className="kv-glow" />
									<span className="kv-shadow" />
									<span className="kv-sprite" />
								</div>
								</div>
							)}
							{menuSection === "heroes" && (
								<div className="codex-panel hero-codex">
									<div className="eyebrow">CLASSES</div>
									<h2>영웅 도감</h2>
									<p className="section-lede">심장·뇌·간·폐·근육을 Lv.3까지 키우면 하나의 직업으로 각성합니다.</p>
									<div className="hero-layout">
										<div className="hero-list">
											{CLASS_CODEX.map((c) => {
												const m = CORE_META[c.core];
												return (
													<button
														className={selectedHero === c.core ? "active" : ""}
														key={c.core}
														onClick={() => setSelectedHero(c.core)}
													>
														<span>
															<OrganGlyph k={m.key} size={18} />
														</span>
														<b>{m.className}</b>
														<small>{m.key} Lv.3 각성</small>
													</button>
												);
											})}
										</div>
										{CLASS_CODEX.filter((c) => c.core === selectedHero).map((c) => {
											const m = CORE_META[c.core],
												cards = CLASS_CARDS.filter((d) => d.main === c.core);
											return (
												<article className="hero-detail" key={c.core}>
													<div className="hero-visual">
														<div
															className="hero-portrait"
															style={{
																backgroundImage: "url('/art/player-forms-v2-clean.png')",
																backgroundPosition: `${((c.form % 4) / 3) * 100}% ${Math.floor(c.form / 4) * 100}%`,
															}}
														/>
														<span>AWAKEN IN GAME</span>
													</div>
													<div className="hero-copy">
														<small>{c.question}</small>
														<h3>{m.className}</h3>
														<div className="hero-organs">
															<b>
																<OrganGlyph k={m.key} size={13} /> {m.key}
															</b>
															<b>SPACE · {m.action}</b>
														</div>
														<dl>
															<div>
																<dt>PASSIVE</dt>
																<dd>{c.passive}</dd>
															</div>
															<div>
																<dt>PLAY STYLE</dt>
																<dd>{c.play}</dd>
															</div>
														</dl>
														<div className="hero-cards">
															{cards.map((cd) => (
																<div key={cd.id}>
																	<b>{cd.name}</b>
																	<span>{cd.effect}</span>
																</div>
															))}
														</div>
													</div>
												</article>
											);
										})}
									</div>
								</div>
							)}
							{menuSection === "items" && (
								<div className="codex-panel">
									<div className="eyebrow">
											LIFE STORAGE / {LIFE_CARDS.length} LIFE · {COMMON_CARDS.length} SURVIVAL
										</div>
									<h2>생활 보관함</h2>
									<p className="section-lede">
										생활 선택은 강력한 강화에 반드시 대가가 따릅니다. 공용 생존 카드는 어떤 직업에서도 버티는 힘을
										줍니다.
									</p>
									<h3 className="archive-title">
										생활 선택 <span>강화 + 대가</span>
									</h3>
									<div className="item-guide">
										{LIFE_CARDS.map((c) => {
											const organ = c.organs[0];
											return (
												<article
													className="life-item"
													key={c.id}
													style={
														organ ? ({ "--organ-color": ORGAN_META[organ].color } as React.CSSProperties) : undefined
													}
												>
													<header>
														<span className="item-glyph">
															{organ ? <OrganGlyph k={organ} size={19} /> : <SurvivalGlyph size={19} />}
														</span>
														<small>{organ ? `${organ} 계열` : "생활"}</small>
													</header>
													<h3>{c.name}</h3>
													<p>{c.desc}</p>
													<dl className="item-effects">
														<div>
															<dt>강화</dt>
															<dd>{c.effect}</dd>
														</div>
														{c.cost && (
															<div className="cost">
																<dt>대가</dt>
																<dd>{c.cost}</dd>
															</div>
														)}
													</dl>
												</article>
											);
										})}
									</div>
									<h3 className="archive-title" style={{ marginTop: 26 }}>
										공용 생존 <span>모든 직업 공용</span>
									</h3>
									<div className="item-guide common-guide">
										{COMMON_CARDS.map((c) => (
											<article key={c.id}>
												<header>
													<span className="item-glyph">
														<SurvivalGlyph size={19} />
													</span>
													<small>생존</small>
												</header>
												<h3>{c.name}</h3>
												<p>{c.desc}</p>
												<dl className="item-effects">
													<div>
														<dt>효과</dt>
														<dd>{c.effect}</dd>
													</div>
												</dl>
											</article>
										))}
									</div>
								</div>
							)}
							{menuSection === "archive" && (
								<div className="codex-panel">
									<div className="eyebrow">GENETIC ARCHIVE / LOCAL SAVE</div>
									<h2>유전 기록</h2>
									<p className="section-lede">
										전투 중 얻는 영양소는 장기 수치를 서서히 끌어올려 다음 생애 유전에 영향을 줍니다.
									</p>
									<div className="archive-stats">
										<article>
											<small>INHERITED ORGAN</small>
											<b>
												{gene ? (
													<>
														<OrganGlyph k={gene as OrganKey} size={16} /> {gene}
													</>
												) : (
													"기록 없음"
												)}
											</b>
										</article>
										<article>
											<small>BEST KILLS</small>
											<b>{bestKills} 처치</b>
										</article>
										<article>
											<small>LONGEST LIFE</small>
											<b>{fmt(bestTime)}</b>
										</article>
									</div>
								</div>
							)}
						</section>
					</div>
				)}
				{(mode === "play" || mode === "pause") && (
					<>
						<div ref={hurtRef} className="hurt-vignette" aria-hidden="true" />
						<div ref={lowRef} className="low-hp-vignette" aria-hidden="true">
							<b>체력 위험</b>
						</div>
						{stageIntro && (
							<div className="stage-intro" aria-hidden="true">
								<small>LIFE STAGE 0{hud.stage + 1}</small>
								<b>{STAGES[hud.stage][0]}</b>
							</div>
						)}
						<div className="hud">
							<div className="hud-top">
								{/* 상시 HUD는 "지금 몇 번째 생애 / 어디인가"만. 연령대 타이틀은 전환 오버레이가 담당하고
								    주력 장기는 좌측 인체도가 이미 보여주므로 여기서 중복 표기하지 않는다 */}
								<div className="stage">
									<small>0{hud.stage + 1}</small>
									{stagePlace}
								</div>
								<div>
									<div className="clock">
										{fmt(hud.t)} <small>/ 6:00</small>
									</div>
								</div>
							</div>
						</div>
						{/* 상단 알림은 한 번에 하나만: 토스트(effect)가 뜨면 목표 표시는 감춘다. 카운트다운 멘트 대신 얇은 진행 바로 대체 */}
						{hud.effect ? (
							<div className="organ-effect">{hud.effect}</div>
						) : (
							(() => {
								const preFirst = hud.t < FIRST_CHOICE_AT;
								const bossUp = game.current.stageT >= BOSS_AT;
								const label = preFirst
									? "첫 생활 선택 준비 중"
									: bossUp
										? `${STAGES[hud.stage][1]} 처치`
										: `다음 · ${STAGES[hud.stage][1]}`;
								const prog = bossUp
									? 1
									: preFirst
										? hud.t / FIRST_CHOICE_AT
										: Math.min(1, game.current.stageT / BOSS_AT);
								return (
									<div className="next-objective">
										<b>{label}</b>
										{!bossUp && (
											<i>
												<u style={{ width: `${Math.round(prog * 100)}%` }} />
											</i>
										)}
									</div>
								);
							})()
						)}
						{/* 좌상단 HUD 열: 인체도 + (각성 시) 직업 카드를 한 덩어리로 쌓는다 */}
						<div className="left-hud">
						<div
							className={`body-hud ${activeClass ? "awakened" : ""}`}
							style={activeClass ? ({ "--core-color": activeClass.color } as React.CSSProperties) : undefined}
						>
							{/* 헤더를 고정 라벨이 아니라 "각성까지 얼마 남았나"로. 각성 후에는 직업명으로 전환 */}
							<small>
								{activeClass ? (
									`${activeClass.className} 각성`
								) : (
									<>
										{/* 아직 아무 장기도 안 컸으면 특정 장기를 지목하지 않는다(오해 방지) */}
										각성까지{hud.organLevels[leadCore] > 0 ? ` · ${CORE_META[leadCore].key}` : ""}{" "}
										<b>
											{hud.organLevels[leadCore]}/{AWAKEN_LEVEL}
										</b>
									</>
								)}
							</small>
							<div className="body-figure">
								<svg viewBox="0 0 120 170" aria-hidden="true">
									<g className="silhouette">
										{/* 머리부터 발끝까지 하나의 외곽선으로 이어 그린 인체 실루엣 */}
										<path d="M60 4.5C52 4.5 50.2 10 50.2 16C50.2 21.5 53 25.5 56.5 26.5L56 33.5C55.6 36.2 52.5 38 49 39C45 40.3 41.6 42 40 44.5C37 49 34 56 32.5 64C31 73 29 84 28 96C27.6 101 27 104 27 106A4.6 4.6 0 0 0 36 106C36 102 35.6 98 35.2 94C34.4 84 36.6 72 39 64C41 58 43.2 54 45.5 51.5C45.6 60 46.6 70 47 79C47.3 86 45.6 92 44.5 99C43.5 112 44.5 124 46 134C47 142 47.5 150 47.8 158A3.8 3.8 0 0 0 55.2 158C55.4 150 55.6 142 55.8 134C56 130 56.5 126 57 118C57.5 110 58.5 104 60 100C61.5 104 62.5 110 63 118C63.5 126 64 130 64.2 134C64.4 142 64.6 150 64.8 158A3.8 3.8 0 0 0 72.2 158C72.5 150 73 142 74 134C75.5 124 76.5 112 75.5 99C74.4 92 72.7 86 73 79C73.4 70 74.4 60 74.5 51.5C76.8 54 79 58 81 64C83.4 72 85.6 84 84.8 94C84.4 98 84 102 84 106A4.6 4.6 0 0 0 93 106C93 104 92.4 101 92 96C91 84 89 73 87.5 64C86 56 83 49 80 44.5C78.4 42 75 40.3 71 39C67.5 38 64.4 36.2 64 33.5L63.5 26.5C67 25.5 69.8 21.5 69.8 16C69.8 10 68 4.5 60 4.5Z" />
									</g>
								</svg>
								{CORE_ORDER.map((core) => {
									const [top, left] = BODY_MARK_POS[core];
									const st = state(hud.organs[CORE_META[core].key]);
									const lv = hud.organLevels[core];
									return (
										<div
											className={`bmark core ${st} ${hud.mainClass === core ? "awoken" : ""}`}
											key={core}
											style={
												{
													top,
													left,
													"--core-color": CORE_META[core].color,
													"--lv": lv,
												} as React.CSSProperties
											}
										>
											{/* 레벨은 아이콘 바깥 대시가 아니라 아이콘을 감싸는 링(conic-gradient, --lv)으로 표시 */}
											<span>
												<OrganGlyph k={CORE_META[core].key} size={15} />
											</span>
										</div>
									);
								})}
							</div>
							{hud.mainClass === "lung" && (
								<div className="class-gauge" style={{ "--core-color": CORE_META.lung.color } as React.CSSProperties}>
									<span>질풍 모멘텀</span>
									<b>
										<i style={{ width: `${Math.min(100, (game.current.galeMomentum / 3.5) * 100)}%` }} />
									</b>
								</div>
							)}
							{hud.mainClass === "muscle" && (
								<div className="class-gauge" style={{ "--core-color": CORE_META.muscle.color } as React.CSSProperties}>
									<span>강타 충전</span>
									<b>
										<i style={{ width: `${Math.min(100, game.current.impactCharge * 100)}%` }} />
									</b>
								</div>
							)}
						</div>
						{/* 각성 전에는 아예 렌더하지 않는다. 미각성 안내는 좌측 인체도 헤더가 진행도(2/3)로 대신하고,
						    이 카드는 "각성했다"는 사건이 일어난 순간에만 등장해 좌측 시야를 비운다 */}
						{activeClass && awakenCard && (
							<aside
								className="chemistry-panel awakened"
								style={{ "--core-color": activeClass.color } as React.CSSProperties}
							>
								<small>MAIN CLASS</small>
								<div className="chemistry-icons">
									<span>
										<OrganGlyph k={activeClass.key} size={22} />
									</span>
								</div>
								<h3>{activeClass.className}</h3>
								<p>
									{activeClass.key} Lv.3 각성 · SPACE {activeClass.action}
								</p>
								<em>이번 생애의 주 직업으로 고정</em>
							</aside>
						)}
						</div>
						{/* 플레이어 상태 통합 패널: 체력·레벨·방어·스킬을 좌하단 한 덩어리로 모아 시선 이동을 없앤다 */}
						<div
							className={`player-hud ${hud.hp / hud.max < 0.3 ? "critical" : ""} ${activeClass ? "awakened" : ""}`}
							style={activeClass ? ({ "--core-color": activeClass.color } as React.CSSProperties) : undefined}
						>
							{/* 현재 캐릭터 초상: 각성한 주 직업의 폼, 미각성이면 기본 폼(0번) */}
							<div className="ph-avatar" aria-label={activeClass ? activeClass.className : "미각성"}>
								<i
									style={{
										backgroundPosition: `${((playerForm % 4) / 3) * 100}% ${Math.floor(playerForm / 4) * 100}%`,
									}}
								/>
								{activeClass && (
									<span>
										<OrganGlyph k={activeClass.key} size={13} />
									</span>
								)}
							</div>
							<div className="ph-level">
								<b>LV.{hud.level}</b>
								<span>
									<i style={{ width: `${Math.min(100, (hud.xp / hud.nextXp) * 100)}%` }} />
								</span>
								{hud.loot && <em>{hud.loot}</em>}
							</div>
							<div className={`ph-hp ${hud.hp / hud.max < 0.3 ? "low" : ""}`}>
								<i style={{ width: `${Math.max(0, (hud.hp / hud.max) * 100)}%` }} />
								<b>
									{Math.max(0, Math.ceil(hud.hp))} / {Math.ceil(hud.max)}
								</b>
							</div>
							<div className="ph-stats">
								<div className="ph-armor">
									<small>방어</small>
									<b>
										<ShieldGlyph size={16} /> {hud.armor.toFixed(1)}
									</b>
									<u>피해 −{Math.round(100 - 10000 / (100 + hud.armor * 5))}%</u>
								</div>
								<div className={`ph-skill ${hud.dashCharges ? "ready" : "cooling"}`}>
									<small>SPACE</small>
									<b>{actionName}</b>
									<i>
										{Array.from({ length: hud.maxDash }, (_, i) => (
											<u className={i < hud.dashCharges ? "on" : ""} key={i} />
										))}
									</i>
									<em>{hud.dashCharges ? "사용 가능" : "재충전 중"}</em>
								</div>
							</div>
						</div>
					</>
				)}
				{mode === "choice" && (
					<div className={`choice-wrap choice-${CHOICE_SKIN[choiceType].skin}`}>
						<div className="choice-head">
							<div>
								<div className="eyebrow">{CHOICE_SKIN[choiceType].eyebrow}</div>
								<h2>{choiceType === "세포 진화" ? "장기 성장" : choiceType}</h2>
								{choiceType === "생활 선택" && !hud.mainClass && (
									<small className="choice-sub">
										선택한 생활이 장기 성향을 정합니다 · 장기를 Lv.3까지 키우면 그 직업으로 각성합니다
									</small>
								)}
							</div>
							<p>
								<b>1 · 2 · 3</b> 즉시 선택&nbsp;&nbsp; <b>A / D</b> 이동&nbsp;&nbsp; <b>ENTER</b> 확정
							</p>
						</div>
						<div className={`cards ${cards.length === 2 ? "two" : ""}`}>
							{cards.map((c, i) => {
								const tags = cardOrgans(c),
									nextLevel = c.id ? cardLevel(game.current, c.id) + 1 : 0;
								const accent =
									c.kind === "fusion"
										? "#d8ff3e"
										: c.kind === "common"
											? "#4ee5e1"
											: tags.length
												? ORGAN_META[tags[0]].color
												: c.kind === "life"
													? "#e0c24e"
													: "#d8ff3e";
								return (
									<button
										style={{ "--card-accent": accent } as React.CSSProperties}
										className={`card card-${c.kind || "general"} ${c.tier ? `augment-tier-${c.tier}` : ""} ${selectedCard === i ? "selected" : ""} ${c.awakening && c.awakening !== "hold" ? "awakening-card" : ""}`}
										key={c.name}
										onMouseEnter={() => setSelectedCard(i)}
										onFocus={() => setSelectedCard(i)}
										onClick={() => choose(c)}
										aria-selected={selectedCard === i}
									>
										<span className="card-no">
											<kbd>{i + 1}</kbd> 선택 {c.kind === "fusion" && <em>FUSION</em>}
										</span>
										{/* 장기 정체성은 배지 대신 카드 안쪽에 크게 깔리는 워터마크 글리프로 표현한다 */}
										<div
											className="card-mark"
											aria-hidden
											style={{ color: tags.length ? ORGAN_META[tags[0]].color : accent }}
										>
											{tags.length ? tags.slice(0, 2).map((k) => <OrganGlyph k={k} key={k} size={148} />) : <b>✦</b>}
										</div>
										<div className="organ-tags">
											{c.tier && <span className="card-tier">T{c.tier}</span>}
											{tags.map((k) => (
												<span key={k}>
													<OrganGlyph k={k} size={12} /> {k}
													{c.organLevel &&
														` Lv.${game.current.organLevels[c.organLevel]} → Lv.${Math.min(3, game.current.organLevels[c.organLevel] + 1)}`}
												</span>
											))}
											{c.maxLevel === 3 && <span>Lv.{nextLevel}</span>}
										</div>
										<h3>
											{tags.length ? (
												<i className="h3-glyph" style={{ color: ORGAN_META[tags[0]].color }}>
													<OrganGlyph k={tags[0]} size={21} />
												</i>
											) : null}
											{c.name}
										</h3>
										<p>{c.desc}</p>
										<div className="decision-effects">
											<strong>
												<small>플레이 변화</small>
												{c.effect}
											</strong>
											{c.cost && (
												<em>
													<small>대가</small>
													{c.cost}
												</em>
											)}
										</div>
										{selectedCard === i && <small className="confirm-hint">ENTER로 확정</small>}
									</button>
								);
							})}
						</div>
					</div>
				)}
				{mode === "pause" && (
					<div className="pause">
						<div className="pause-menu">
							<div className="pause-summary">
								<div className="eyebrow">LIFE MENU / ESC</div>
								<h2>잠시 숨 고르기</h2>
								<p>
									{activeClass ? (
										<>
											<b>{activeClass.className}</b>
											<br />
											{activeClass.key} Lv.3 각성 · {activeClass.action}
										</>
									) : (
										"아직 주 직업을 각성하지 않았습니다."
									)}
								</p>
								<div className="pause-organs">
									{(["heart", "brain", "liver", "lung", "muscle"] as CoreOrgan[]).map((k) => (
										<span key={k}>
											<OrganGlyph k={CORE_META[k].key} size={17} /> {CORE_META[k].key} · Lv.{hud.organLevels[k]}
										</span>
									))}
								</div>
							</div>
							<div className="pause-actions">
								<button
									className="primary"
									onClick={() => {
										game.current.paused = false;
										game.current.last = performance.now();
										sound.current?.resumeMusic();
										setMode("play");
									}}
								>
									계속하기
								</button>
								<button onClick={() => start(game.current.difficulty)}>현재 생애 다시 시작</button>
								<button
									onClick={() => {
										game.current.paused = true;
										sound.current?.stopMusic();
										setMenuSection("home");
										setMode("start");
									}}
								>
									메인 화면으로 나가기
								</button>
								<small>ESC를 다시 누르면 바로 계속합니다.</small>
							</div>
						</div>
					</div>
				)}
				{mode === "report" && (
					<div className="screen report">
						<div className="report-grid">
							<div>
								<div className="eyebrow">LIFE REPORT / COMPLETE</div>
								<h1>{report.win ? "노화를 넘어섰습니다." : "생애가 끝났습니다."}</h1>
								{!report.win && report.telemetry?.deathCause && (
									<div className="death-cause-report">
										<small>사망 원인</small>
										<b>{DAMAGE_CAUSE_META[report.telemetry.deathCause].label}</b>
										<span>{DAMAGE_CAUSE_META[report.telemetry.deathCause].hint}</span>
									</div>
								)}
								<p className="report-copy">
									{mainName ? (
										<>
											<b>{mainName}</b>
											{josa(mainName, "으로", "로")} 살아낸 생애였습니다.{" "}
											{report.fusions.length ? (
												<>
													융합 <b>{report.fusions.join(", ")}</b>
													{josa(report.fusions[report.fusions.length - 1], "을", "를")} 손에 넣었습니다.{" "}
												</>
											) : null}
											다음 생애에는 <b>타고난 {strongest}</b>
											{josa(strongest, "이", "가")} 유전됩니다.
										</>
									) : (
										<>
											주 직업을 각성하지 못한 채 쓰러진 생애였습니다. 다음 생애에는 <b>타고난 {strongest}</b>
											{josa(strongest, "이", "가")} 유전됩니다.
										</>
									)}
								</p>
								<div className="stats">
									<div className="stat">
										<small>SURVIVAL</small>
										<b>{fmt(report.t)}</b>
									</div>
									<div className="stat">
										<small>ZOMBIES</small>
										<b>{report.kills} 처치</b>
									</div>
									<div className="stat">
										<small>BUILD</small>
										<b>{build}</b>
									</div>
									<div className="stat">
										<small>GENE</small>
										<b>타고난 {strongest}</b>
									</div>
								</div>
								{report.telemetry && (
									<div className="telemetry-summary">
										<div>
											<small>DAMAGE</small>
											<b>{Math.round(report.telemetry.damageDealt).toLocaleString()}</b>
										</div>
										<div>
											<small>TAKEN / HITS</small>
											<b>
												{Math.round(report.telemetry.damageTaken)} / {report.telemetry.hitsTaken}
											</b>
										</div>
										<div>
											<small>MOVE / ACTION</small>
											<b>
												{Math.round(report.telemetry.distanceTraveled)} / {report.telemetry.actionsUsed}
											</b>
										</div>
										<div>
											<small>BOSSES</small>
											<b>{report.telemetry.bossKills}</b>
										</div>
									</div>
								)}
								<div className="report-actions">
									<button className="primary" onClick={() => start(game.current.difficulty)}>
										같은 난이도로 다시 ↗
									</button>
									<button
										className="report-menu-btn"
										onClick={() => {
											game.current.paused = true;
											sound.current?.stopMusic();
											setMenuSection("home");
											setMode("start");
										}}
									>
										메인 화면으로
									</button>
								</div>
							</div>
							<div>
								<div className="organ-report">
									{ORGAN_KEYS.map((k) => (
										<div className="organ-line" key={k}>
											<span>{k}</span>
											<div className="bar">
												<i style={{ width: `${report.organs[k]}%` }} />
											</div>
											<b>{report.organs[k]}</b>
										</div>
									))}
								</div>
								<p className="gene">
									생활: {report.choices.join(" · ") || "기록 없음"}
									<br />
									증강: {report.augments.join(" · ") || "기록 없음"}
								</p>
								{report.telemetry && (report.telemetry.debug || report.telemetry.benchmark) && (
									<div className="telemetry-export">
										<div>
											<small>RUN TELEMETRY</small>
											<b>
												{report.telemetry.debug
													? "DEBUG RUN"
													: report.telemetry.benchmark
														? `BENCHMARK ${benchmarkBatch.length}/${benchmarkRunTarget}`
														: "VALID RUN"}{" "}
												· 최근 {telemetryRuns.length}회 저장
											</b>
										</div>
										<button
											onClick={() => downloadTelemetry(`organ-run-${report.telemetry?.runId}.json`, report.telemetry)}
										>
											현재 JSON
										</button>
										<button
											onClick={() =>
												downloadTelemetry("organ-run-history.json", {
													schemaVersion: 1,
													exportedAt: new Date().toISOString(),
													runs: telemetryRuns,
												})
											}
										>
											누적 JSON
										</button>
										{report.telemetry.benchmark && benchmarkBatch.length >= benchmarkRunTarget && (
											<button
												onClick={() =>
													downloadTelemetry(`organ-benchmark-${report.telemetry?.benchmarkTarget}.json`, {
														schemaVersion: 1,
														exportedAt: new Date().toISOString(),
														runs: benchmarkBatch,
													})
												}
											>
												배치 JSON
											</button>
										)}
										<details>
											<summary>JSON 미리보기</summary>
											<pre>{JSON.stringify(report.telemetry, null, 2)}</pre>
										</details>
										{report.telemetry.benchmark && benchmarkBatch.length >= benchmarkRunTarget && (
											<details>
												<summary>배치 JSON 미리보기</summary>
												<pre data-testid="benchmark-batch-json">
													{JSON.stringify(
														{ schemaVersion: 1, exportedAt: new Date().toISOString(), runs: benchmarkBatch },
														null,
														2,
													)}
												</pre>
											</details>
										)}
									</div>
								)}
							</div>
						</div>
					</div>
				)}
			</section>
		</main>
	);
}
