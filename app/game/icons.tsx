import type { OrganKey } from "./types";

const ui = (size: number) => ({
  viewBox: "0 0 24 24", width: size, height: size, fill: "none",
  stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true, style: { display: "inline-block", verticalAlign: "-0.16em" },
});
export function SoundGlyph({ muted, size = 13 }: { muted: boolean; size?: number }) {
  return <svg {...ui(size)}><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z" fill="currentColor" stroke="none"/>{muted
    ? <path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>
    : <><path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4"/><path d="M18 6.5a8 8 0 0 1 0 11"/></>}</svg>;
}
export function FullscreenGlyph({ on, size = 13 }: { on: boolean; size?: number }) {
  return <svg {...ui(size)}>{on
    ? <path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3"/>
    : <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3"/>}</svg>;
}

// 방어력 글리프: 이모지(🛡) 대신 HUD 라인 스타일에 맞춘 방패 + 중앙 코어
export function ShieldGlyph({ size = 14 }: { size?: number }) {
  return <svg {...ui(size)}><path d="M12 3.2l7 2.6v5.4c0 4.1-2.8 7.6-7 9.6-4.2-2-7-5.5-7-9.6V5.8l7-2.6z"/><path d="M12 9v4.4" strokeWidth={2.2}/></svg>;
}

// 공용 생존 카드 글리프: 이모지(🧬) 대신 나선 2줄 + 결합선. 장기 글리프와 같은 선 두께를 쓴다
export function SurvivalGlyph({ size = 20 }: { size?: number }) {
  return <svg {...ui(size)} strokeWidth={1.9}>
    <path d="M7.5 3.2c0 4 9 5.6 9 9.6s-9 5.6-9 9.6" transform="translate(0,-1)"/>
    <path d="M16.5 3.2c0 4-9 5.6-9 9.6s9 5.6 9 9.6" transform="translate(0,-1)"/>
    <path d="M9 6.4h6M7.9 10.2h8.2M7.9 14.4h8.2M9 18.2h6" strokeWidth={1.35} opacity={0.75}/>
  </svg>;
}

// 5장기 커스텀 라인 글리프 (currentColor 상속, viewBox 24). 이모지 대체용.
// 12px~140px 범위에서 모두 읽혀야 하므로 실루엣을 굵고 단순하게 잡고, 내부 디테일은 별도 stroke로 분리했다.
export function OrganGlyph({ k, size = 20 }: { k: OrganKey; size?: number }) {
  const common = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { display: "inline-block", verticalAlign: "-0.15em" },
  };
  // 내부 디테일선: 실루엣보다 얇게 깔아 작은 크기에서 뭉치지 않게 한다
  const detail = { strokeWidth: 1.35, opacity: 0.75 };
  switch (k) {
    case "심장":
      return (
        <svg {...common}>
          <path d="M12 20.4C6.3 16.5 3.2 12.9 3.2 9.4c0-2.7 2-4.8 4.6-4.8 1.8 0 3.4 1 4.2 2.5.8-1.5 2.4-2.5 4.2-2.5 2.6 0 4.6 2.1 4.6 4.8 0 3.5-3.1 7.1-8.8 11z" />
          <path d="M6.6 11.2h2.5l1.3-2.6 1.9 5 1.3-2.4h3.8" {...detail} />
        </svg>
      );
    case "뇌":
      return (
        <svg {...common}>
          <path d="M8.6 4.6c1.5 0 2.7.6 3.4 1.4.7-.8 1.9-1.4 3.4-1.4 2.4 0 4.3 1.8 4.3 4 0 .9-.3 1.8-.9 2.4.6.6.9 1.4.9 2.3 0 2.2-1.9 4-4.3 4-.7 1-1.9 1.7-3.4 1.7s-2.7-.7-3.4-1.7c-2.4 0-4.3-1.8-4.3-4 0-.9.3-1.7.9-2.3-.6-.6-.9-1.5-.9-2.4 0-2.2 1.9-4 4.3-4z" />
          <path d="M12 6v13M9 8.4c1 .3 1.6 1 1.8 2.1M15 8.4c-1 .3-1.6 1-1.8 2.1M9.3 13.6c1 .2 1.6.8 1.8 1.8M14.7 13.6c-1 .2-1.6.8-1.8 1.8" {...detail} />
        </svg>
      );
    case "폐":
      return (
        <svg {...common}>
          <path d="M11 10.6c0-1.1-1-2-2.1-1.7-1.8.4-3 2.1-3.3 4.3-.3 2-.3 4 .1 5.6.3 1.1 1.2 1.8 2.3 1.8 1.7 0 3-1.4 3-3.2v-6.8zM13 10.6c0-1.1 1-2 2.1-1.7 1.8.4 3 2.1 3.3 4.3.3 2 .3 4-.1 5.6-.3 1.1-1.2 1.8-2.3 1.8-1.7 0-3-1.4-3-3.2v-6.8z" />
          <path d="M12 3.4v7.2M9.6 3.4h4.8M12 7.4l-2.2 1.6M12 7.4l2.2 1.6" {...detail} />
        </svg>
      );
    case "간":
      return (
        <svg {...common}>
          <path d="M3.3 8.9c1.6-1.5 4.5-2.4 8-2.4 3.9 0 7.2.9 9.4 2.4.2 3.6-1.6 6.8-4.9 8-1.5.5-2.5 0-3.6 0-1.6 0-2.8 1.1-4.6.2C4.5 15.7 3.2 12.2 3.3 8.9z" />
          <path d="M12.7 6.8l-.5 9.9M6.2 11.1c1.5.8 3.1 1.1 4.7 1" {...detail} />
        </svg>
      );
    case "근육":
      return (
        <svg {...common}>
          <path d="M4.7 19.8v-3.7c0-2.9 1.9-5.1 4.7-5.2-.1-1.5-.6-2.7-1.4-3.8l4.4-1.9c.9 1.6 1.1 3.1 1.5 4.1.3 1 1 1.8 2.1 2.3 2 .9 3 2.8 3 5.1v3.1z" />
          <path d="M8 7.1c.9 1.7 1.3 3 1.4 3.8M9.6 15.8c1.7-.7 3.4-.6 5 .3" {...detail} />
        </svg>
      );
  }
}
