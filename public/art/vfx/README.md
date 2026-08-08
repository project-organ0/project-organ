# 직업별 VFX 시트

각 파일은 `1774 × 887`, `4열 × 2행`, 투명 PNG다.

Canvas에서 자를 때:

```ts
const cellW = image.naturalWidth / 4;
const cellH = image.naturalHeight / 2;
const col = index % 4;
const row = Math.floor(index / 4);
ctx.drawImage(image, col * cellW, row * cellH, cellW, cellH, x, y, width, height);
```

## heart-skills-v1.png

0. 기본 주먹 타격
1. 연속 공격 초승달 타격
2. 강한 교차 타격
3. 4타 심박 충격파
4. 과부하 강타
5. 돌진 펀치 궤적
6. 심장 표식
7. 심장 각성 파동

## brain-skills-v1.png

0. 기본 에너지 코어
1. 코어 발사 섬광
2. 에너지탄 폭발
3. 연쇄 사고
4. 집중 사고 조준 표식
5. 사고 폭주 일제 사격
6. 신경 독성 전염
7. 뇌 각성 코어 전개

## liver-skills-v1.png

0. 독성 발자국
1. 독 지대 1단계
2. 독 지대 2단계
3. 독 지대 3단계
4. 적 중독 표식
5. 독성 파열
6. 추적 독성 코어
7. 간 각성 파동

## lung-skills-v1.png

0. 기본 바람 칼날
1. 교차 바람 칼날
2. 이동 잔상
3. 관통 대시
4. 원형 넉백 돌풍
5. 회오리 폭발
6. 지속 이동 바람 오라
7. 폐 각성 사이클론

## muscle-skills-v1.png

0. 기본 중량 타격
1. 광역 물리 충격파
2. 전방 넉백 압력파
3. 적 충돌 폭발
4. 분노 충전 오라
5. 지면 강타
6. 에너지 건틀릿
7. 근육 각성 폭발

## 사용 원칙

- 이펙트는 `screen` 또는 `lighter` 합성 모드가 잘 맞는다.
- 한 프레임 이미지를 크기·회전·알파 변화로 0.15~0.7초 동안 애니메이션한다.
- 강한 스킬은 `작은 사전 섬광 → 본 이펙트 확장 → 잔광 소멸` 3단계로 연출한다.
- 과도하게 크게 상시 표시하지 말고 4타, 폭주, 파열, 각성처럼 중요한 순간에 집중한다.
- 기존 `public/art/player-vfx.png`는 범용 이동·대시·피격용으로 유지한다.
