# 줄넘기 기록 관리 v2 — 이어서 작업하기 위한 메모

## 구조
- `Shell.gs` (저장소 루트): 학교 스프레드시트에 붙이는 껍데기. `SHELL_VERSION = 3` (2·3판은 선택 업데이트, requiredShell 은 1 그대로. 3판 = 급수 Levels 시트 + 학생 삭제 고침). beta/Shell.gs 와 같음
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
  - 2.1.1: Schools 에 SchoolName·Teacher·Contact 칸(운영자만, 현황판 응답에 안 나감). 참여하려면 학교 이름·담당 교사 필수, 연락처 선택.
    교사·연락처는 EXTRA_SETTINGS(공개)에 두지 않고 관리자 기기 localStorage(`jr_nat_contact|<껍데기주소>`)에만, 관리자 화면 동기화(syncAll) 때만 보냄.
    수집기는 teacher 가 있을 때만 교사·연락처를 덮어씀 → 학생 화면 자동 보고가 지우지 않음. 예전 7칸 시트는 머리줄 자동 확장. COLLECTOR_VERSION = 2
  - 2.1.2: 기록실 `?api=hall&month=` → { list: 최근 HALL_MONTHS(12)개 지난 달, month: 고른 달 상세 }. 달마다 캐시 'hall|YYYY-MM'(지난 달 1시간, 그 전 6시간),
    목록 캐시 'hall|list|<이번 달>'. Hidden 바꾼 뒤 바로 반영은 편집기에서 refreshCache 실행. hall.html 은 예전 응답(months 배열)도 읽음. COLLECTOR_VERSION = 3
  - 2.1.3: 전국 현황판 참여 = 승인 절차 필수. 참여 켜면 setAppSettings(approvalOn:true), 참여 중 승인 끄면 confirm → nat.on=false + leave.
    NAT.approvalOk() 가 거짓이면 reportToday·syncAll 안 보냄. 승인 화면에서 승인하면 2.5초 뒤 syncAll(force).
    카메라 기록은 CAMERA_AUTO_APPROVE 로 승인 없이 반영(껍데기 2판부터 기본 켜짐, '0' 일 때만 끔).
    껍데기 2판: APPROVAL_ON 미설정이면 기록 없는 새 학교 '1', 기록 있는 학교 '0' 으로 정해 저장. devserver SEED 는 APPROVAL_ON='0'(기존 학교 흉내)
  - 통합 프로그램 연동 설명서(dev/통합프로그램_현황판_연동.md)는 사용자가 통합판 채팅에서 따로 진행 중 → 여기서 고치지 말 것
  - 수집기 주소는 2026-10-04 에 한 번 바뀜(실수로 새 배포). 수정은 꼭 '배포 관리 → 수정 → 새 버전'
  - 1인당 평균·참여율 순위는 등록 학생 5명 이상 학교만 (MIN_REGISTERED_FOR_RATIO)
- `national.json`·`beta/national.json` 의 `collector` 에 수집기 주소 (2026-10-04 운영자 배포 주소 넣음)
- `beta/index.html`: `NAT` 모듈
  - 메인: 저장 직후 + 20분마다 오늘 집계 보고(공개 함수 getTodaySummaryPublic·getAllStudentsPublic·getRecentRecordsPublic 사용, 카메라는 최근 30건 한계 → camPartial)
  - 관리자: "전국 현황판" 탭(참여·학교 이름 공개·학교 이름, 지금 보내기, 미리보기), 관리자 메뉴 열면 1시간에 한 번 getAllDataAdmin 으로 이번 달+지난 달 전체 동기화. 참여 끄면 `leave` 로 수집기 자료 삭제
- `beta/board.html` 현황판(달 선택·합계/1인당 평균/참여율 정렬·학교 누르면 학교 안 학생 순위·전국 학생 TOP30·`?me=` 우리 학교 강조), `beta/hall.html` 기록실(지난 달별 학교·학생 1~3등, 학교별 1~3등)
- 시험: `node devserver.js` 가 `/collector` 로 Collector.gs 도 흉내 내고 national.json 을 로컬 주소로 바꿔 줌. `python3 test_national.py` (playwright 1.56 이 설치된 chromium 과 맞음)
- 알려진 한계: 학교 키가 getExtraSettings(공개)로 보임 → 껍데기 주소를 아는 사람은 그 학교 이름으로 보고 가능. 껍데기 2판에서 숨길 수 있음

## 2.2.0 (2026-10-05 정식판 반영, beta/ 와 같음)
- `beta/Shell.gs` = 껍데기 3판: Levels 시트(StudentID, Level, Item, PassedAt, By) + getLevelsPublic / saveLevelPasses. 루트 Shell.gs 는 2판 그대로
- 급수: LEVELS 모듈(협회 기준표 DEFAULT, EXTRA_SETTINGS.levels 로 덮어씀), 관리자 "급수 인증" 탭(반·급수 고르고 체크), 학생 화면 나의 급수, 메인 우리 반 급수
- 인증서: 관리자 "인증서 · 상장" 탭. 급수 인증서 / 전국 현황판 상장(기록실 달: 우리 학교 전국 순위, 학생 전국 1~3등, 우리 학교 안 1~3등). 실명은 학생 키(k)를 학교 안에서 계산해 매칭. A4 가로 인쇄(body.printing-cert)
- 우리 반 여행: JOURNEY 모듈, EXTRA_SETTINGS.journey = { on, course, base }, 관리자 "우리 반 여행" 탭, 메인 진행 막대 (1회=1m, 승인 누적 - base)
- 수집기 4판(정식판과 공유, 예전 응답 유지): ?api=board&grade=, 응답에 grade·grades·allTime, 학교별 noReg, report 의 registeredByGrade → Schools RegByGrade 칸, 기록실 학생에 k·pid
- 시험: 정식판 `SEED=1 node devserver.js` 후 `CH= python3 test_v22.py` / 베타 `SEED=1 SHELL_PATH=../beta/Shell.gs node devserver.js` 후 `python3 test_v22.py`
- 관리자 새 탭 NEW 표시: localStorage `jr_seen_tabs_2.2`, 한 번 열면 사라짐
- 학생 삭제 버그 고침(루트 Shell.gs 2판·beta 3판 모두): 예전엔 Records 의 Timestamp 칸과 비교해 기록이 안 지워졌음 → StudentID(3번째 칸)로, deleteRowsWhere_ 로 묶어서 삭제. 승인 목록은 없는 학생 기록 숨김.
  루트 Shell.gs 는 SHELL_VERSION 2 그대로 고친 것이라 share/ zip 은 아직 예전 껍데기 → 베타를 정식판으로 옮길 때 zip 도 다시 묶을 것
- 껍데기 단위 시험: `node test_shell.js` (서버 필요 없음)

## 다음 할 일
- 수집기 주소 넣음 → 실제 학교 화면에서 참여 켜고 보고·현황판 확인, main 반영
- 인디스쿨 공유: `share/` (줄넘기기록관리_v2.1.3.zip = Shell(껍데기).txt + 사용설명서.pdf, 인디스쿨_안내글.md)
  - (2026-10-04 v2.1.3 기준으로 갱신: 줄넘기기록관리_v2.1.3.zip)
  - 설명서 원본 `share/manual.html` (그림 `share/img/`), PDF 는 playwright page.pdf 로 만듦

## 관련
- 통합 프로그램(pe-assistant)도 같은 현황판에 보고하기로 함 → 작업 설명서 `dev/통합프로그램_현황판_연동.md` (작업은 사용자 채팅에서). 수집기 보고 형식을 바꾸면 통합판도 깨지니 주의
- 줄넘기 판정기: MusicalPE/jump-rope-checker (현재 v0.7.4, ?app= 서버 연동 + mode=post 오프라인 연동)
- 오프라인판 v1.6 은 별도 HTML(폴더 data/ 저장), 판정기와 postMessage 로 연동
