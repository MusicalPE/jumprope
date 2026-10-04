# 줄넘기 기록 관리 v2 — 이어서 작업하기 위한 메모

## 구조
- `Shell.gs` (저장소 루트): 학교 스프레드시트에 붙이는 껍데기. `SHELL_VERSION = 1`.
  - `doGet`: `?api=rope_x_who|rope_x_save` → 줄넘기 판정기 연동(JSON), 그 밖에는 "프로그램 열기" 설치 확인 화면
  - `doPost`: 본문 `{"fn","args"}` → `RPC_ALLOW_` 목록에 있는 함수만 실행 → `{"ok","result"|"error"}`
  - 설정은 1.x 와 같은 Script Properties 이름 그대로(DAILY_GOAL, JUMP_TYPES, ADMIN_HASH, GEMINI_KEY, THEME_*, CAMERA_*) + `APPROVAL_ON` + 자유 저장칸 `EXTRA_SETTINGS`(JSON, setExtraSettings) — 새 기능은 가능하면 이 칸과 getAllDataAdmin 으로 화면에서 처리해서 껍데기를 안 바꾸기
  - 시트: Students(ID, Grade, Class, Number, Name, PasswordHash, SortOrder), Records(RecordID, Timestamp, StudentID, Date, Count, Status, Time, Type, Source)
  - v2 부터 addRecord 는 입력마다 한 줄씩 쌓음(그날 여러 번 → 합산). 승인 절차 켜면 status=pending.
- `index.html`: 화면 전체(한 파일). 주소 `?s=<껍데기 exec 주소>&page=main|student|adminLogin|admin|approval`.
  - `APP` 객체(버전·채널·껍데기 정보·설정), `rpc(fn,args)`, `google.script.run` 흉내(Proxy) → 1.x 화면 코드를 거의 그대로 씀
  - 화면은 `<template id="v-…">` + `VIEWS[…]()` 로 그림. `{{BASE}}`·`{{TOKEN}}` 치환.
  - `APP.requiredShell` 보다 껍데기 판이 낮으면 업데이트 내역 탭에 안내.
- `beta/index.html`: 시험판(먼저 여기 올려 확인 → 정식판으로 복사). `changelog.json` 은 맨 위가 최신.

## 시험 환경
```
cd dev && npm i express && node devserver.js     # SEED=1 이면 예시 학생·기록
# http://localhost:8890/jumprope/?s=http%3A%2F%2Flocalhost%3A8890%2Fexec
python3 test_site.py                              # playwright 전체 흐름 시험
```
`gas-emu.js` 는 Apps Script 흉내(SpreadsheetApp/Properties/Cache/ContentService 등)로 `../Shell.gs` 를 그대로 실행.

## 다음 할 일 (2.1 — 전국 현황판)
- 각 학교 화면이 하루 집계(학교 합계·참여 인원·학교 안 1~3등)를 **선생님 소유 중앙 수집 시트**(별도 Apps Script)로 보냄
- GitHub 현황판 페이지: 학교 순위 + 학교 안 학생 순위, **한 달 단위 집계(매달 1일 새로 시작)**
- **기록실** 페이지: 지난 달들의 학교·학생 1~3등
- 개인정보: 다른 학교에 보이는 학생 이름은 가림(김*늘), 참여·학교 이름 공개는 설정에서 켬(기본 꺼짐)
- 공정함: 합계 순위 + 1인당 평균·참여율 순위, 카메라 인증 횟수 따로 표시
- 학교 고유번호·참여 여부는 EXTRA_SETTINGS 에 (껍데기 1판 그대로)
- 2.1 완성 후 인디스쿨 참여 안내 글 작성

## 관련
- 줄넘기 판정기: MusicalPE/jump-rope-checker (현재 v0.7.4, ?app= 서버 연동 + mode=post 오프라인 연동)
- 오프라인판 v1.6 은 별도 HTML(폴더 data/ 저장), 판정기와 postMessage 로 연동
