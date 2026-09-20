# 싱크 비교 기준 자료

2026-09-20 사용자 확인: **“현재 이 영상은 싱크가 잘 맞아.”**

- 영상: https://www.youtube.com/watch?v=UVnck7nWaB4
- 기준 코드: `272a647e8b63495550024d2c47cbf2e76aded97d`
- 자료 폴더: [2026-09-20_UVnck7nWaB4](2026-09-20_UVnck7nWaB4)
- 원본 자막 448개, 단어 3,218개, 문장·발화 456개, 청크 955개, 문단 20개.

`transcript.json`: 수집 당시 자막 및 시작·길이.
`analysis.json`: 실제 재생에 사용하는 AI 결과, 단어·문장·청크 시간, 문단 소속.
`manifest.json`: 영상 정보, 사용자 확인 범위, 코드 버전, 파일별 SHA-256.

사용자의 실제 청취 경험에 근거한 확인이며 모든 경계의 오차를 음향 분석으로 측정했다는 뜻은 아니다. 시간은 자막 기반 추정이다. 영상·음성 파일, API 키, 개인 노트, 브라우저에서 저장하지 않은 구간 조정은 포함하지 않는다.

## 이후 비교 순서

1. 이 기준 폴더를 덮어쓰지 않는다. 문제 상태의 자막·분석을 별도 폴더에 보관한다.
2. 영상 ID와 원본 자막의 텍스트·시작·길이를 비교한다. 차이가 있으면 자막 변경이나 수집 경로를 점검한다.
3. 원본이 같다면 분석 결과의 문장 경계·청크 범위·단어 시간·문단 소속을 비교한다. 모델과 revision도 확인한다.
4. 데이터가 같다면 기준 커밋과 현재의 재생 코드, YouTube 탐색·속도·종료 감지를 비교한다.
5. 문제 구간의 예상 시작·끝, 실제 들린 시작·끝, 재생 속도, 브라우저, 발생 빈도를 기록한다.

```powershell
git diff 272a647 -- listening-app/src/SoundLab.tsx listening-app/src/transcript.ts listening-app/backend/preparation.py
git diff --no-index sync-baselines/2026-09-20_UVnck7nWaB4/analysis.json <문제상태의-analysis.json>
```

이 폴더는 비교 자료이며 앱이 자동으로 읽어 덮어쓰는 복원 파일은 아니다. DB를 복구하려면 기존 기록부터 별도 백업한다.
