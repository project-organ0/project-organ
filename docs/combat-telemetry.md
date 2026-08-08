# 본게임 전투 텔레메트리

## 목적

브라우저에서 실제로 진행된 한 판의 충돌, 명중, 피격, 이동과 선택 결과를 기록해 헤드리스 시뮬레이터의 오차를 보정한다. 텔레메트리는 전투 수치나 확률을 변경하지 않는다.

## 기록 단위

한 판이 끝나면 `RunTelemetry` JSON 하나를 생성한다.

| 필드 | 의미 |
| --- | --- |
| `result`, `survivalSeconds` | 클리어 여부와 실제 생존시간 |
| `class`, `difficulty`, `debug`, `benchmark`, `benchmarkTarget` | 실제 각성 직업, 난이도, 실행 모드와 자동 플레이 목표 장기 |
| `playerLevel`, `kills`, `bossKills` | 성장 및 진행 결과 |
| `damageDealt` | 과잉 피해를 제외한 실제 적 체력 감소량 |
| `damageBySource` | 기본 공격, 액션, 증강, 독, 충돌 등 출처별 피해량 |
| `damageTaken`, `damageBlocked`, `hitsTaken` | 실제 체력 손실, 보호막 방어량, 피격 횟수 |
| `healingReceived` | 최대 체력을 넘긴 양을 제외한 실제 회복량 |
| `distanceTraveled`, `actionsUsed` | 실제 이동거리와 직업 액션 사용 횟수 |
| `choices` | 선택 시각, 스테이지, 플레이어 레벨, 카드와 획득 레벨 |
| `bossResults` | 보스별 처치 시각, 당시 레벨과 남은 체력 비율 |
| `cardLevels` | 종료 시점 카드 레벨 전체 |

## 피해 출처

`dealDamage(...)`가 실제로 감소한 적 체력만 기록한다. 현재 기본 출처는 다음과 같다.

- 심장: `heart_basic`, `heart_overload`, `heart_shock`, `heart_action`
- 뇌: `brain_core`, `brain_chain`, `brain_frenzy`, `brain_action`
- 간: `liver_field`, `liver_rupture`, `poison_dot`, `poison_aura`
- 폐: `lung_basic`, `lung_bladewind`, `lung_afterimage`, `lung_eyestorm`, `lung_action`
- 근육: `muscle_basic`, `muscle_collision`, `muscle_chain_collision`, `muscle_action`
- 융합과 공용 투사체는 해당 융합 ID 또는 `basic_projectile`로 기록한다.

## 저장과 출력

- 종료한 런은 브라우저에 최근 100회까지 누적한다.
- 결과 화면의 `현재 JSON`은 방금 끝난 한 판을 다운로드한다.
- `누적 JSON`은 저장된 최근 런 전체를 다운로드한다.
- `JSON 미리보기`는 현재 런의 원시 데이터를 화면에서 확인한다.
- 디버그 URL로 시작한 런은 `debug: true`로 기록하며 정식 밸런스 표본에서 제외한다.
- `?benchmark=1`로 시작하면 이전 생애의 유전 보너스를 적용하지 않고 유전·최고 기록도 갱신하지 않는다. 실제 전투 규칙은 유지되며 직업 비교 표본에는 이 모드를 사용한다.
- `?benchmark=1&autoplay=heart`처럼 `autoplay`에 장기를 지정하면 본게임 안에서 이동, 액션, 카드 선택을 자동 수행한다. 지원 값은 `heart`, `brain`, `liver`, `lung`, `muscle`이다.
- `&runs=5`를 추가하면 같은 장기 정책으로 지정 횟수만큼 자동 재시작하고, 마지막 결과 화면에 해당 탭에서 수집한 배치 JSON을 표시한다. 허용 범위는 1~20회다.
- `&batch=<식별자>`를 함께 지정하면 각 런 종료 직후 장기별 체크포인트를 저장한다. 탭이 닫혀도 같은 URL로 다시 시작하면 저장된 횟수부터 이어간다.
- `&speed=20`을 추가하면 벤치마크 전용 고정 `1/60초` 전투 틱을 렌더 프레임마다 20회 처리한다. 허용 범위는 1~60배이며 `benchmark=1`이 없으면 항상 1배로 동작한다.
- `&seed=20260809`를 지정하면 전투 난수 시드를 고정한다. 같은 자동 플레이 정책과 시드를 사용한 `speed=1`과 `speed=20`은 렌더링 횟수와 관계없이 같은 전투 결과를 만든다. 반복 런은 기준 시드에 런 순번을 더해 서로 다른 표본을 유지한다.
- `&duration=30`은 동일성 회귀검사용으로 게임 시간 30초에 런을 종료한다. 정식 밸런스 표본에는 사용하지 않는다.
- 자동 플레이는 목표 장기의 세포 진화와 각성을 보장하고 같은 장기의 직업 카드를 우선한다. 전투 판정, 적 생성, 피해 계산, 카드 풀과 확률은 수동 플레이와 같은 코드를 사용한다.

## 검증 절차

1. 표준 난이도에서 직업별 최소 5회, 가능하면 10회를 진행한다.
2. 직업마다 같은 이동 원칙과 액션 사용 주기를 적용한다.
3. 각 직업의 생존시간, 초당 피해, 피격 빈도, 보스 처치 시점을 비교한다.
4. 같은 조건의 헤드리스 결과와 비교해 직업별 DPS와 회피 계수를 보정한다.
5. 보정 이후에도 남는 차이만 실제 직업 밸런스 문제로 판정한다.

직업별 플레이 방식이 다르므로 완전히 동일한 입력 경로를 강제하지 않는다. 대신 각 직업의 핵심 루프를 정상적으로 수행하는 고정 정책을 사용하고, 정책을 결과 해석에 함께 기록한다.

누적 JSON을 직업별 표로 변환할 때는 다음 명령을 사용한다.

```bash
npm run telemetry:analyze -- organ-run-history.json --out=docs/combat-telemetry-result
```

기본 분석은 디버그 런과 미각성 런을 직업 비교에서 제외한다. 디버그 기록까지 확인해야 할 때만 `--include-debug`를 추가한다.
