# 듣는 노트 · Listening App

YouTube의 어려운 구간을 반복해서 듣고, 들린 소리를 한글로 기록하며 발음 피드백 전후를 비교하는 Windows용 로컬 앱입니다.

## 실행

Python 3.11 이상과 Node.js 20.19 이상을 설치한 뒤 `listening-app/Start-App.cmd`를 실행합니다. 앱 주소는 http://127.0.0.1:8765 입니다.

‘설정과 백업’에서 Gemini API 키를 등록하고 연결을 확인합니다. YouTube 링크를 추가하면 자막을 수집하고 AI가 문장·청크·문단으로 분석합니다. 기존 영상은 ‘자막·AI 분석 준비’를 눌러 준비합니다.

API 키는 Windows 사용자 계정으로 암호화해 로컬 DB에 저장합니다. DB, 학습 기록, 키, 캐시와 빌드 결과는 Git에 포함하지 않습니다. 새 컴퓨터에서는 키를 다시 등록해야 합니다.

## 현재 버전

- 영상과 자막을 나란히 표시하고 문장·청크·문단·단어 범위를 선택해 재생합니다.
- Gemini 전체 자막 분석 후 단어 누락·순서·범위를 검사합니다.
- 선택 구간과 한글 청취 기록을 저장하고 백업합니다.
- Gemini는 자막 준비에 사용합니다. 앱 안의 발음 피드백은 로컬 Ollama 연결을 사용하며, ChatGPT 질문 복사도 제공합니다.
- 재생 시간은 자막 기반 추정입니다. 음성 기반 정렬과 자막 없는 영상의 전사는 아직 지원하지 않습니다.

## 검증

`listening-app` 폴더에서 실행합니다.

```powershell
python -m pip install -r requirements.txt
python -m pip install httpx
npm ci
python -m unittest discover -s tests
npm run build
```

`npm test`의 TypeScript 직접 실행에는 Node.js 22.18 이상을 사용하세요. 제공된 XLSX 자막은 기존 문장 처리의 회귀 테스트 자료입니다. 개인 학습 DB는 포함하지 않습니다.

## 문서

- [앱의 의도와 사용 목적](20260919_english/app_purpose_and_intent.md)
- [자동 자막 준비와 실제 검증 기록](20260919_english/automatic_subtitle_preparation.md)
- [작업 규칙](AGENTS.md)

기존 앱 README와 설계 문서에는 이전 개발 단계의 기록이 포함됩니다. 현재 동작과 제한은 위 목적 문서 및 자동 자막 준비 문서를 기준으로 확인하세요.
