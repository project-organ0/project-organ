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

// 5장기 커스텀 라인 글리프 (currentColor 상속, viewBox 24). 이모지 대체용.
export function OrganGlyph({ k, size = 20 }: { k: OrganKey; size?: number }) {
  const common = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { display: "inline-block", verticalAlign: "-0.15em" },
  };
  switch (k) {
    case "심장":
      return <svg {...common}><path d="M12 20C7 16.3 4 12.9 4 9.4 4 7 5.8 5.3 7.9 5.3c1.6 0 3.1 1 3.8 2.4l.3.6.3-.6c.7-1.4 2.2-2.4 3.8-2.4C20.2 5.3 22 7 22 9.4c0 3.5-3 6.9-8 10.6z" transform="translate(-1)"/></svg>;
    case "뇌":
      return <svg {...common}><path d="M9 5.5C7.3 5.5 6 6.7 6 8.2c-1.1.3-1.9 1.2-1.9 2.4 0 .7.3 1.4.8 1.8-.4.4-.6 1-.6 1.6 0 1.4 1.2 2.5 2.7 2.5.3 1.1 1.4 1.9 2.7 1.9M9 5.5C10 4.8 11.4 4.9 12 6M9 5.5v13.4M15 5.5c1.7 0 3 1.2 3 2.7 1.1.3 1.9 1.2 1.9 2.4 0 .7-.3 1.4-.8 1.8.4.4.6 1 .6 1.6 0 1.4-1.2 2.5-2.7 2.5-.3 1.1-1.4 1.9-2.7 1.9M15 5.5C14 4.8 12.6 4.9 12 6M15 5.5v13.4M12 6v12.9"/></svg>;
    case "폐":
      return <svg {...common}><path d="M12 4v6M9.5 11c1 .8 1.6 1.8 1.6 3.2M14.5 11c-1 .8-1.6 1.8-1.6 3.2"/><path d="M12 10c-.6-.9-1.5-1.6-2.6-1.6-1.6 0-2.7 1.4-2.9 3.3-.2 1.7-.3 3.6.1 5.2.3 1.3 1.2 2.1 2.4 2.1 1.6 0 2.9-1.3 2.9-3V10zM12 10c.6-.9 1.5-1.6 2.6-1.6 1.6 0 2.7 1.4 2.9 3.3.2 1.7.3 3.6-.1 5.2-.3 1.3-1.2 2.1-2.4 2.1-1.6 0-2.9-1.3-2.9-3V10z"/></svg>;
    case "간":
      return <svg {...common}><path d="M3.5 8.5c5.5-1.6 12-1.6 17 0 .2 3.9-1.7 7.8-6.4 8-1.4 0-2.2-.7-3.1-.7-1.6 0-2.6 1-4.4.2C4 14.8 3.4 11.4 3.5 8.5z"/><path d="M9 10.5c.7.6 1.7.9 2.7.8"/></svg>;
    case "근육":
      return <svg {...common}><path d="M5 19v-3.5C5 12.9 6.7 11 9.2 11c.2-1.4-.3-2.6-.9-3.6l3.8-1.6c.8 1.4 1 2.9 2.9 3.8 2 .9 3 2.6 3 4.7V19z"/><path d="M8.3 7.4C9 8.9 9.2 10 9.2 11"/></svg>;
  }
}
