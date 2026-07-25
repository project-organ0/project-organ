import type { Metadata } from "next";
import OrganGame from "./organ-game";

export const metadata: Metadata = {
  title: "장기 프로젝트 — 생존은 선택의 결과다",
  description: "생활의 대가를 몸에 새기며 노화와 맞서는 8분 로그라이트.",
};

export default function Home() {
  return <OrganGame />;
}
