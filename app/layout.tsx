import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const base = new URL(`${protocol}://${host}`);
  return {
    metadataBase: base,
    title: "장기 프로젝트",
    description: "매 순간 더 강해질 수 있지만, 그 대가는 몸 어딘가에 남습니다.",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "장기 프로젝트",
      description: "생존은 선택의 결과다. 생활의 대가를 몸에 새기며 노화와 맞서는 8분 로그라이트.",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "장기 프로젝트 게임 키 아트" }],
    },
    twitter: { card: "summary_large_image", images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
