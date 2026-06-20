## 🚀 [앱 실행하기](https://lgw7126.github.io/antigravity-landing-page-08/)

# 💊 시니어 건강알리미 — 독거 노인 혈압·투약 기록 키오스크

> **🔗 실행 링크**: [https://lgw7126.github.io/antigravity-landing-page-08](https://lgw7126.github.io/antigravity-landing-page-08)  
> *(배포 후 활성화됩니다 — Vercel 배포 권장)*

---

## 📋 기획 개요

70대 이상 디지털 소외 어르신을 위한 초단순 혈압 측정 및 복약 기록 전송 키오스크 웹 서비스. 보호자가 설정을 완료하면 어르신은 PIN만 입력하고 혈압 측정값을 카메라로 찍으면 보호자에게 자동으로 전달됩니다.

---

## ✨ 주요 기능

- "PIN 잠금 화멸" - 어르신痄 아잜 간단한 PIN으로 접근
- "복약 체크" - 안엒 복오 니다 쳤리 복약
- "혈압 측정값 기낤엋" -  브뚴 스톬로 안뺷
- "OCR 촬쎿" - OCR 쳬곾 강값 중으로 언예하는 표시되고
- "인팬 및 전송" - Realtime 확인 후 Supabase의 촬켁 폴백
- "TTS 읍의 안내" - 현재 단계별 강값 개인확의 소외 계층 찰개

---

## 🛠️ 기술 스택

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Database**: Supabase
- **Styling**: Tailwind CSS

---

## 🚙️ 설정 방법 (보호자용)

1. `/setup` 페이지에서 환자명, 보호자 연락처, 복약 목록, 알람 시간, PIN 코드 입력
2. 저장 후 메인 페이지(`/`)를 키오스크 화면으로 고정

## 🚀 로컬 실행

```bash
npm install
npm run dev
```
