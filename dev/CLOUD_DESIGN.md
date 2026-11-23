# 점퍼스 클라우드판 설계 (cloud/)

지금 점퍼스(학교 시트 + 껍데기)는 그대로 둔다. 클라우드판은 `cloud/` 폴더의 새 앱으로,
껍데기 설치 없이 **선생님은 구글 로그인, 학생은 QR 하나**로 쓴다.
주소: `musicalpe.github.io/jumprope/cloud/`

## 한 줄 원칙

- 운영자(파이어베이스 콘솔을 가진 사람)도 학생 이름을 볼 수 없다. 이름·번호는 브라우저에서 잠가서 올린다.
- 학생 화면은 실시간 연결을 열지 않는다(REST·한 번 읽기). 실시간 연결은 선생님 화면만.
- 무료 한도(Spark) 안에서 돌아가게 읽기 횟수를 줄인다: 명단은 문서 하나, 기록은 달마다 요약 문서 하나.

## 파이어베이스 (콘솔 하나)

- 프로젝트: `jumpus-pe` (설정값은 cloud/firebase-config.js)
- Authentication: Google(선생님), 익명(학생 기기)
- Firestore (asia-northeast3 서울): 기록 저장소
- Realtime Database (asia-southeast1): 새 점프 라이브 — 라이트 방식(학생 3초마다 보내기, 선생님만 실시간 1연결) → 전국 동시 100반쯤
- 선생님 학교 전용 jumpropelive 와 지금 시트판의 라이트는 그대로

## 열쇠 (더그아웃 crypto.js 를 그대로 가져옴)

- 학교 공간마다 무작위 AES-GCM 256 키 K
- K 는 **공간 비밀번호**(PBKDF2-SHA256 31만 번)와 **복구 코드**(20자)로 각각 한 번 더 잠가 저장
- 선생님 기기는 꺼낼 수 없는 사본을 IndexedDB 에 기억
- 학생 QR: `cloud/?s=<공간ID>#k=<K>&w=<쓰기표>` — `#` 뒤는 서버로 가지 않음
- 이름 상자: 길이를 256바이트 단위로 채우고, 자리(공간·학생ID)를 AAD 로 묶음

## Firestore 구조

```
users/{uid}                     내 공간 목록 (나만)
spaces/{sid}                    공간: owner, 학교 이름(현황판용, 평문), crypto{wrap, recovery, check}, 설정
spaces/{sid}/members/{uid}      함께 쓰는 선생님 (초대 코드로)
spaces/{sid}/meta/roster        명단 한 문서: { 학생ID: { g, c, box(이름·번호 잠금), pw(학생 비번 해시) } }
spaces/{sid}/months/{yyyy-mm}   달 요약: { d: { '05': { 학생ID: { 종류: 횟수 } } }, best, streak }
spaces/{sid}/inbox/{id}         학생이 넣은 기록 (만들기만): 학생ID, 날짜, 종류, 횟수, 출처(손·카메라·줄넘기·라이브), 쓰기표
spaces/{sid}/keys/{쓰기표}      쓰기표가 맞는지 규칙에서 exists() 로만 확인 (읽기 불가)
invites/{code}                  선생님 초대 코드
```

- 공간ID 는 24자 무작위 → 주소를 모르면 열 수 없음(목록 보기 금지, get 만 허용)
- 학생 기록은 inbox 에 쌓이고, 메인 화면은 "달 요약 + 아직 안 접힌 inbox" 를 더해 보여 줌
- 선생님 화면이 열릴 때 inbox 를 달 요약으로 접음(승인 절차가 켜져 있으면 승인한 것만)
- 승인 절차: 손으로 넣은 기록만 대기, 카메라·줄넘기·라이브는 바로

## 전국 현황판 (Jump Earth!) — 시트판과 한데 집계

- 현황판은 따로 만들지 않는다. 지금 수집기(Collector.gs)에 클라우드판도 **똑같은 하루 집계**(학생별 합계, 이름은 가린 채)를 보낸다
  → 현황판·기록실·학교 대결이 시트판 학교와 클라우드판 학교를 한 화면에서 함께 센다
- 보내는 쪽은 선생님 화면(구글 로그인된 기기). 학교 키(16자 이상 무작위)는 공간 문서에 선생님만 읽게 둔다
- 시트판에서 옮겨 온 학교는 **원래 학교 키를 그대로 가져와** 같은 학교로 이어진다(지난 달 기록·대결 이력 유지)

## 첫 판에 넣는 것 (순서)

1. 선생님 구글 로그인, 공간 만들기(비밀번호·복구 코드), 다른 선생님 초대
2. 학생 등록(학년·반·번호·이름 → 잠가서 명단 한 문서), 학생 QR
3. 학생 기록 입력(익명 로그인 + 쓰기표), 메인 그래프·표, 학생 기록 조회(학생 비번)
4. 기록 승인
5. 카메라 판정기 연결(판정기가 클라우드판으로 저장)
6. 기록 내보내기(엑셀) — 운영이 멈춰도 학교가 기록을 가져갈 수 있게
7. 시트판 기록 옮겨 오기
8. 전국 현황판 참여, 새 점프 라이브(라이트 방식), 급수·여행·인증서, 학교 대결 — 차례로

## 함께 챙길 것

- 학습지원 소프트웨어 필수기준: 개인정보 처리방침 페이지(수집 항목·목적·기간·보호책임자), 최소 수집
- 시험: dev/ 에 파이어베이스 흉내(메모리 DB) + 규칙 시험을 두고, 기능을 넣을 때마다 기존 흐름도 다시 밟기

## 0.2.0 — 화면을 지금 점퍼스 그대로 (2026-11-23 방향 바꿈)

0.1.0 은 화면을 따로 짰는데 "옛날 판 느낌"이라, **학교판 index.html 을 그대로 쓰고 저장하는 곳만 바꾸는** 구조로 다시 짰다.
위의 "Firestore 구조" 중 meta/roster · months 는 더 이상 쓰지 않는다 (아래가 지금 구조).

- `cloud/index.html` = `dev/make_cloud.py` 가 index.html 에서 만든 파일. `<base href="../">` 로 그림·글꼴·Shell.gs 는 맨 위 것을 씀.
  **index.html · demo.js · Shell.gs 를 고치면 `python3 dev/make_cloud.py` 를 다시 돌릴 것** (make_club.py 처럼. 바꿀 글자가 안 맞으면 멈춤)
- `cloud/js/cloud.js` — 미리보기(demo.js)처럼 **Shell.gs 를 브라우저 안에서 돌림**. 구글 시트 대신 가짜 표(gasfake.js = demo.js 에서 떼어 옴)를 쓰고,
  그 표를 공간 키로 잠가 Firestore 에 저장. 화면이 부르는 rpc 는 모두 `window.JRCLOUD.call` 로 감
- 저장 구조
  ```
  spaces/{sid}/meta/pub              { name, approval }  — 평문 (규칙이 승인 절차를 확인하려고)
  spaces/{sid}/book/Students         { box }  표 한 장 = 문서 하나 (암호문)
  spaces/{sid}/book/Levels           { box }
  spaces/{sid}/book/props            { box }  껍데기 속성 중 공개 가능한 것 (EXTRA_SETTINGS 는 전국 현황판 비밀 키를 뺀 사본)
  spaces/{sid}/book/Records_YYYY-MM_NN { box } 기록 표를 달마다, 1200줄씩
  spaces/{sid}/priv/secret           { box }  선생님만 읽음: GEMINI_KEY · EXTRA_SETTINGS(비밀 키 포함)
  spaces/{sid}/inbox/{id}            { box(기록 한 줄), n, src, st, w, t }  학생이 넣은 기록 — n·src·st 만 평문(규칙 확인용)
  ```
- 선생님 화면: 요청마다 (8초가 지났으면) 표를 새로 읽고, 껍데기 함수를 돌린 뒤, **바뀐 문서만** 다시 잠가 올림. inbox 는 표에 합치고 지움
- 학생 화면: 표를 읽기만 함(20초마다 새로). addRecord 로 붙은 새 줄만 inbox 에 올림. 다른 표를 고쳐도 올라가지 않음(규칙이 막음)
- 관리자 메뉴: 구글 로그인한 선생님이면 비밀번호 없이 통과(껍데기 기본 비밀번호로 통행증을 받아 이 기기에만 둠 — `AT_` 속성은 localStorage)
- [공간 관리](`&page=space`): 학생 QR·새 QR, 학교 이름, 선생님 초대, 공간 비밀번호·복구 코드
- 복구 코드 화면의 [내 메일로 보내 두기]: 지메일 쓰기 창을 열 뿐, 보내는 것은 본인 — 서버를 거치지 않음
- 아직 막아 둔 것: 카메라 판정기(issueCameraToken), 점프 Live·라이트, 학생 화면의 전국 현황판 보내기(선생님 화면에서만 보냄)
- 알아 둘 점: 학생 기기도 공간 키를 가지므로 표(학생 비밀번호 해시·모든 기록)를 풀 수 있다. 고치는 것은 규칙이 막는다.
  두 선생님이 같은 순간에 고치면 나중 것이 이김(문서 단위) — 요청 직전에 새로 읽어 틈을 줄였음

## 0.3.0 — 판정기 연결 · 안내 글 · 내려받기와 옮겨 오기

- **카메라 판정기**: 껍데기의 issueCameraToken 이 만든 주소의 app 이 `cloud:<공간>`. 판정기(jump-rope-checker 1.3.8)는 그 경우
  `/jumprope/cloud/js/bridge.js` 를 불러 `api(공간, {api:'rope_x_who'|'rope_x_save', t, count…})` 를 부름 → cloud.js 의 `cameraApi` 가 껍데기의 handleCameraApi_ 를 그대로 돌림
  - 판정기와 점퍼스가 같은 musicalpe.github.io 라 로그인(구글·익명)·학생 QR 열쇠(localStorage)·선생님 열쇠(IndexedDB)를 함께 씀
  - 판정기 통행증(캐시 `CAM_…`)은 다른 탭에서 읽어야 해서 localStorage `jumpus:cache:<공간>` 에 둠
  - 껍데기는 같은 날·같은 종류 줄에 횟수를 더하는데, 학생 기기는 있던 줄을 고칠 수 없음 → persistStudent 가 **늘어난 만큼을 새 줄**로 inbox 에 올림 (합계는 같음)
  - 다리로 불릴 때(`APP.bridge`)는 화면을 그리지 않고 오류를 던짐. 학생 방(각자 기기로 대결)은 아직 없어서 `방: 0`, 메인의 [각자 기기로 대결] 단추는 숨김
- **안내 글**: make_cloud.py 가 사용 안내 9가지를 클라우드판 내용으로 바꾸고(껍데기·ADMIN_HASH 대신 공간 관리·복구 코드), 관리자 비밀번호 칸은 구글 로그인 안내로 바꿈.
  현황판·기록실 주소는 `document.baseURI` 기준(저장소 맨 위 board.html)
- **공간 관리 → 기록 내려받기**: 엑셀(.xlsx, SheetJS 를 그때 불러옴 — 학생별 누적·기록·학생 명단·급수 인증 4장), 백업(.json, `app:'jumpus-backup'`)
- **공간 관리 → 기록 옮겨 오기**
  - 시트판에서: 시트판 주소와 관리자 비밀번호로 시트판 껍데기에 직접 물음(verifyAdminPassword → getAllDataAdmin · getLevelsPublic · 설정들).
    학생 ID 를 그대로 가져와 기록·급수가 이어짐. 학생 비밀번호는 못 가져와 1234 로. 빈 공간일 때만 설정(종류·목표·색·승인·카메라·전국 현황판 키)도 가져오고, 키의 shell 은 `cloud:<공간>` 으로 바꿈
  - 백업 파일에서: 같은 ID·같은 학년반번호이름 학생, 같은 번호 기록, 같은 급수는 건너뜀 (여러 번 넣어도 늘지 않음)

## 시험

- 파이어베이스 에뮬레이터는 이 작업 환경에서 내려받을 수 없어(storage.googleapis.com 막힘) **가짜 서버**로 시험한다
- `cd dev/cloud && node mockserver.js` (8891) → `python3 test_cloud.py`
  - mockserver.js 는 Firestore 와 로그인을 흉내 내고, **firestore-rules.txt 와 같은 뜻의 규칙을 JS 로 한 번 더 적어** 권한까지 확인한다
  - `cloud/js/fb.js` 요청을 `dev/cloud/fb-mock.js` 로 바꿔 내준다 (앱 코드는 그대로)
- **규칙을 고치면 firestore-rules.txt 와 mockserver.js 의 rules() 를 같이 고칠 것.** 실제 규칙 문법은 여기서 확인되지 않으니, 콘솔에 붙인 뒤 실제 주소에서 한 번 밟아 봐야 한다
