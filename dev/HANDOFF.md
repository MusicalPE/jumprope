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

## 2.1 — 전국 현황판 (정식판·beta 모두 반영)
- 껍데기(Shell.gs)는 **그대로 1판**. 참여 설정은 `EXTRA_SETTINGS.nat = { on, key, name, showName }`
- `Collector.gs` (루트): 운영자 소유 **중앙 수집 시트**용 별도 Apps Script. 시트 Schools / Daily
  - POST `{fn:'report'|'leave', args:[payload]}`, GET `?api=board&month=YYYY-MM` · `?api=hall`
  - 학교 공개 번호 = sha256('jr-school|'+key) 앞 10자리, 학생 키 = sha256('jr-student|'+key+'|'+학생ID) 앞 10자리
  - 이번 달·지난 달 날짜만 받음(늦은 입력 반영), 같은 학교·같은 날은 덮어씀. 이름은 서버에서도 다시 가림
  - Schools 시트 Hidden 칸에 1 → 그 학교 숨김(장난 보고 대응)
  - 1인당 평균·참여율 순위는 등록 학생 5명 이상 학교만 (MIN_REGISTERED_FOR_RATIO)
- `national.json`·`beta/national.json` 의 `collector` 에 수집기 주소 (2026-10-04 운영자 배포 주소 넣음)
- `beta/index.html`: `NAT` 모듈
  - 메인: 저장 직후 + 20분마다 오늘 집계 보고(공개 함수 getTodaySummaryPublic·getAllStudentsPublic·getRecentRecordsPublic 사용, 카메라는 최근 30건 한계 → camPartial)
  - 관리자: "전국 현황판" 탭(참여·학교 이름 공개·학교 이름, 지금 보내기, 미리보기), 관리자 메뉴 열면 1시간에 한 번 getAllDataAdmin 으로 이번 달+지난 달 전체 동기화. 참여 끄면 `leave` 로 수집기 자료 삭제
- `beta/board.html` 현황판(달 선택·합계/1인당 평균/참여율 정렬·학교 누르면 학교 안 학생 순위·전국 학생 TOP30·`?me=` 우리 학교 강조), `beta/hall.html` 기록실(지난 달별 학교·학생 1~3등, 학교별 1~3등)
- 시험: `node devserver.js` 가 `/collector` 로 Collector.gs 도 흉내 내고 national.json 을 로컬 주소로 바꿔 줌. `python3 test_national.py` (playwright 1.56 이 설치된 chromium 과 맞음)
- 알려진 한계: 학교 키가 getExtraSettings(공개)로 보임 → 껍데기 주소를 아는 사람은 그 학교 이름으로 보고 가능. 껍데기 2판에서 숨길 수 있음

## 다음 할 일
- 수집기 주소 넣음 → 실제 학교 화면에서 참여 켜고 보고·현황판 확인, main 반영
- 인디스쿨 공유: `share/` (줄넘기기록관리_v2.1.zip = Shell(껍데기).txt + 사용설명서.pdf, 인디스쿨_안내글.md)
  - 설명서 원본 `share/manual.html` (그림 `share/img/`), PDF 는 playwright page.pdf 로 만듦

## 관련
- 줄넘기 판정기: MusicalPE/jump-rope-checker (현재 v0.7.4, ?app= 서버 연동 + mode=post 오프라인 연동)
- 오프라인판 v1.6 은 별도 HTML(폴더 data/ 저장), 판정기와 postMessage 로 연동
