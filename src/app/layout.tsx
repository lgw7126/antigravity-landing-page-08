import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "시니어 건강알리미 - 독거 노인 혈압 및 투약 기록 시스템",
  description: "70대 이상 디지털 소외 어르신을 위한 초단순 혈압 측정 및 복약 기록 전송 키오스크 웹 서비스입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full w-full overflow-hidden bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}

