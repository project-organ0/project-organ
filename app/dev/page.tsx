"use client";

// 개발용 화면 갤러리: 디버그 URL을 하나씩 치지 않고 모든 화면을 한 페이지에서 본다.
const CLASSES: { key: string; label: string; color: string }[] = [
  { key: "heart", label: "심장 · 격투가", color: "#ff715b" },
  { key: "brain", label: "뇌 · 에너지술사", color: "#a49bd8" },
  { key: "liver", label: "간 · 독술사", color: "#a8d43a" },
  { key: "lung", label: "폐 · 질풍술사", color: "#4ee5e1" },
  { key: "muscle", label: "근육 · 파괴자", color: "#d8ff3e" },
];
const MENUS = [
  { href: "/", label: "시작 화면" },
  { href: "/assets", label: "에셋 · 카드 · 스킬트리" },
];

export default function DevGallery() {
  const frame = (src: string) => (
    <iframe src={src} title={src} style={{ width: "100%", aspectRatio: "16/9", border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, background: "#0a0e0e" }} />
  );
  return (
    <main style={{ minHeight: "100vh", background: "#0a0e0e", color: "#e9efe9", padding: "28px clamp(20px,4vw,56px)", fontFamily: "var(--font-sans)" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ color: "#d8ff3e", font: "800 11px/1 var(--font-mono)", letterSpacing: ".14em" }}>DEV GALLERY</div>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-.03em" }}>화면 갤러리</h1>
        <p style={{ margin: 0, color: "#8b968f", fontSize: 12 }}>
          자동 시작·음소거 · 핫키 <b style={{ color: "#e9efe9" }}>B</b>보스 <b style={{ color: "#e9efe9" }}>N</b>잡몹 <b style={{ color: "#e9efe9" }}>H</b>회복 <b style={{ color: "#e9efe9" }}>I</b>무적 <b style={{ color: "#e9efe9" }}>G</b>결과
        </p>
        <nav style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          {MENUS.map((m) => (
            <a key={m.href} href={m.href} target="_blank" rel="noreferrer" style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, color: "#e9efe9", textDecoration: "none", fontSize: 12, fontWeight: 700 }}>{m.label} ↗</a>
          ))}
        </nav>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {CLASSES.map((c) => (
          <article key={c.key} style={{ border: `1px solid ${c.color}55`, borderRadius: 14, padding: 12, background: "rgba(255,255,255,.03)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <b style={{ color: c.color, fontSize: 14 }}>{c.label}</b>
              <a href={`/?debug=${c.key}`} target="_blank" rel="noreferrer" style={{ color: "#95a19c", fontSize: 11, textDecoration: "none" }}>새 탭에서 플레이 ↗</a>
            </div>
            {frame(`/?debug=${c.key}&preview`)}
          </article>
        ))}
        <article style={{ border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,.03)" }}>
          <div style={{ marginBottom: 8 }}><b style={{ fontSize: 14 }}>결과 화면 미리보기</b> <span style={{ color: "#95a19c", fontSize: 11 }}>(로드 후 G)</span></div>
          {frame(`/?debug=liver&fusion=heart&preview`)}
        </article>
      </section>
    </main>
  );
}
