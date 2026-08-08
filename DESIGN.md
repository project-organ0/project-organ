# DESIGN.md — 장기 프로젝트 (Organ Project)

탑다운 생존 로그라이크의 UI 디자인 시스템. AI 코더가 새 화면/컴포넌트를 만들 때 이 문서를 기준으로 삼아 **일관된 다크 네온 게임 UI**를 유지한다. (형식은 getdesign.md 스타일)

핵심 정체성: **다크 네온 + 에디토리얼 게임 UI.** 어두운 그린-블랙 배경에 애시드 그린/코랄 네온 액센트, 강한 흑색 오프셋 그림자(게임 UI 특유의 "덩어리감"), 커스텀 SVG 글리프. SaaS/템플릿 느낌·이모지·의미 없는 장식(그라데이션 데코, 동심원)을 배제한다.

---

## 1. 색상 (Color)

### 브랜드 토큰 (`:root`)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--acid` | `#d8ff3e` | **주 액센트**: 활성/선택/추천 상태, primary 버튼, 네온 글로우, 강조 라벨 |
| `--coral` | `#ff715b` | 보조 액센트: 위험/피해, 타이틀 강조, 체력 바 |
| `--cyan` | `#4ee5e1` | 3차 액센트: 방어/보호막, 발견 상태 |
| `--ink` | `#101515` | 오프셋 그림자 기준색(딥 블랙) |
| `--paper` | `#e9eadf` | (레거시 라이트 배경 — 현재 UI에서는 사용 안 함) |
| `--line` | `rgba(16,21,21,.18)` | 라이트 컨텍스트 구분선(레거시) |

### 다크 서피스 (배경)
- 화면 배경 그라데이션: `linear-gradient(150deg,#141d1c 0%,#0b100f 60%,#080b0b 100%)`
- 메뉴 배경(네온 글로우 포함): `radial-gradient(...rgba(216,255,62,.10)...) , radial-gradient(...rgba(255,113,91,.09)...) , linear-gradient(150deg,#16201e,#0d1312,#080b0b)`
- **글래스 카드 표면**: `background: rgba(255,255,255,.045~.06)` + `border: 1px solid rgba(255,255,255,.14~.2)`
- HUD 패널: `rgba(7,12,12,.7)` + `backdrop-filter: blur(8~9px)`
- 스캔라인 텍스처(배경 위): `repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.16) 3px 4px)` `mix-blend-mode:multiply`

### 다크 위 텍스트
- 제목/강조: `#f2f6f1 ~ #f4f8f3`
- 본문: `#98a49f ~ #aab6b1`
- 라벨/캡션(모노): `#8b968f`
- 라벨 강조: `--acid`

### 도메인 색 (장기 = 직업 아이덴티티)
| 장기/직업 | 색 |
|---|---|
| 심장 · 격투가 | `#ff715b` |
| 뇌 · 에너지술사 | `#a49bd8` |
| 간 · 독술사 | `#a8d43a` |
| 폐 · 질풍술사 | `#4ee5e1` |
| 근육 · 파괴자 | `#d8ff3e` |

### 상태 색 (게이지/마커)
- 활성(healthy) `#5fe08a` · 주의(normal) `#e0c24e` · 위험(danger) `#ff715b`

**사용 규칙:** 색은 의미로만 쓴다. 애시드=긍정/주력, 코랄=위험/피해, 시안=방어. 장기색은 해당 직업 컨텍스트에서만. 장식용 무지개/보라↔파랑 그라데이션 금지.

---

## 2. 타이포그래피 (Type)

**2종 페어링만 사용** (폰트 수프 금지).

- **본문/한글/UI → Pretendard** (`--font-sans`, jsDelivr CDN). 웨이트: 본문 Medium/600, 강조 Bold/800, 큰 타이틀 900~950.
- **HUD·숫자·영문 라벨 → Space Mono** (`--font-mono`, next/font). 계기판/테크 라벨 전용.

### 스케일
| 역할 | 스타일 |
|---|---|
| 대형 타이틀 | `clamp(56px,7.4vw,112px)` / weight 950 / letter-spacing -.08em / line-height .82~.9 |
| 섹션 h2 | `clamp(30px,3.6vw,48px)` / -.05em |
| 상세 h3 | `clamp(20px,2.6vw,32px)` |
| 리드 본문 | 18px / line-height 1.8 |
| 섹션 설명 | 12.5~13px / 1.5~1.65 |
| 카드 본문 | 11~14px / 1.5~1.6 |
| eyebrow(모노 라벨) | `800 12px/1` mono, letter-spacing .14~.17em, UPPERCASE, 색 `--acid` |
| 마이크로 라벨(모노) | 8~10px |

**한글 규칙:** `word-break: keep-all` + `overflow-wrap: break-word` (어절 단위 줄바꿈). 한글 본문 line-height는 1.5 이상.

---

## 3. 간격·레이아웃 (Space & Layout)

- 화면 컨테이너 패딩: `clamp(16px,2.2vw,26px)` 세로 / `clamp(28px,5vw,64px)` 가로
- 카드 패딩: 11~18px, 카드 간 gap 6~13px
- 라운드: pill `999px`, 카드 `12~14px`, 소형 `9~10px`, 마커 원 `50%`
- 메뉴: `grid-template-columns: 210px 1fr` (좌측 다크 내비 + 콘텐츠)

**철칙 — 한 화면 원칙:** 메뉴/도감/결과 등 오버레이 화면은 **스크롤 없이 1280×720 안에 담는다.** 콘텐츠가 넘치면 폰트·패딩·행수를 컴팩트화하고, 검증은 `.meta-content` scrollHeight ≤ clientHeight로 한다. 짧은 모바일 가로(≤500px 높이)에서도 핵심 버튼이 화면 안에 보여야 한다.

---

## 4. 컴포넌트 (Components)

- **Primary 버튼**: `background:var(--acid)` / `color:#0c1211` / `border-radius:999px` / **하드 오프셋 그림자** `box-shadow:4px 4px 0 var(--ink)` / hover 시 `translate(2px,2px)` + 그림자 축소.
- **Outline 버튼**: 투명 배경 + `border:1px solid rgba(255,255,255,.3)` + 라이트 텍스트, hover `rgba(255,255,255,.08)`.
- **글래스 카드**: `rgba(255,255,255,.05)` + `border rgba(255,255,255,.14)`; 장기 컨텍스트 카드는 좌측 `inset 4px 0 0 var(--organ-color)` 액센트 바.
- **선택 카드(choice)**: 다크 글래스, 선택 시 애시드 보더 + 글로우. 효과/대가 블록은 애시드/코랄 톤 분리.
- **HUD 패널**: 다크 반투명 + blur, 우선순위 낮은 채도. 네온은 중요 순간에만.
- **신체 실루엣 HUD(body-hud)**: SVG 인체에 5장기 마커(원형, 상태색 링, 각성 시 코어색 발광 + Lv 도트). 이모지 금지.
- **아이콘 = 커스텀 SVG 글리프** (`app/game/icons.tsx`): 5장기 + 사운드/전체화면. `currentColor` 상속, `stroke-width:1.7~1.8`, line 스타일. **이모지·기본 심볼 금지.**
- **게이지**: 트랙 `rgba(255,255,255,.14)` + 채움 `var(--core-color)` + 소프트 글로우.

---

## 5. 모션·효과 (Motion & FX)

- **하드 오프셋 그림자**(`Npx Npx 0 var(--ink)`): 게임 UI의 "덩어리감". 부드러운 blur 그림자보다 우선.
- **네온 글로우**: `0 0 Npx rgba(216,255,62,.2~.3)` 등 — **중요 요소/순간에만** (상시 남발 금지).
- hover: 미세 `translateY(-4px)` 부상 또는 offset 그림자 축소.
- 스킬 VFX(캔버스): 단일 프레임 스프라이트를 `screen` 합성으로 0.15~0.7초간 확대·회전·페이드. 4타/폭주/파열/각성 등 핵심 순간에 집중, 화면 흔들림 남용 금지.

---

## 6. 원칙 (왜 이렇게 하는가 = AI 티 제거 기준)

1. **다크 게임 세계관을 모든 화면에 일관 적용** — 시작·도감·인게임·카드·결과·일시정지 전부 같은 다크+네온 톤.
2. **의미 없는 장식 금지** — 동심원/무지개 그라데이션/과한 라운드/형광 글로우 남발 = 즉시 AI 템플릿 티. 대신 스캔라인·실제 게임 아트(캐릭터 스프라이트)·의미 있는 네온.
3. **실제 게임 에셋을 UI에 노출** — 시작화면 주인공 키비주얼처럼, 아트가 있으면 "게임"으로 즉시 인식된다.
4. **이모지 → 커스텀 SVG 글리프**, **시스템 폰트 → Pretendard/Space Mono 2종**.
5. **한 화면 원칙 + 넉넉한 줄간격/글자 크기** — 좁은 줄간격·초소형 라벨·스크롤 강제는 완성도 낮아 보인다.
6. **색은 의미로만, 폰트는 2종만, 그림자는 하드 오프셋** — 규율이 곧 완성도.

---

## 7. 구현 위치 (Reference)
- 토큰/컴포넌트 CSS: `app/globals.css` (`:root` 변수, `.menu-screen`/`.codex-panel`/`.choice-wrap`/`.report`/`.body-hud` 등)
- 아이콘: `app/game/icons.tsx`
- 직업/장기 메타(색·이름): `app/organ-game.tsx` `CORE_META` / `ORGAN_META`
- 폰트 로드: `app/layout.tsx` (Space Mono next/font + Pretendard CDN)
- 화면 미리보기(전 화면 한눈에): `/dev`, 에셋/카드/스킬트리: `/assets`
