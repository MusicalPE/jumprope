#!/usr/bin/env python3
"""클럽판 사용설명서 만들기 — share/manual.html 에서 club/share/manual.html 을 새로 만듦.
그림은 club/share/img (클럽판 화면). PDF 는 따로 브라우저 인쇄로 만듦.
쓰는 법:  python3 dev/make_club_manual.py   (저장소 맨 위에서)"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLUB_COPY = 'https://docs.google.com/spreadsheets/d/1__vTZLMSWahHYGn47NL134NwAxSESJNJA5wZb6x2q2Y/copy'


def words(s):
    for a, b in [('서울 햇살초등학교', '서울 햇살태권도'), ('서울햇살초등학교', '서울햇살태권도'), ('햇살초등학교', '햇살태권도'), ('담당 교사', '담당 지도자')]:
        s = s.replace(a, b)
    s = re.sub(r'(?<![등중])학교', '클럽', s)
    for a, b in [('클럽(반)로', '클럽(반)으로'), ('클럽가', '클럽이'), ('클럽를', '클럽을'), ('클럽는', '클럽은'), ('클럽와', '클럽과'), ('클럽로', '클럽으로')]:
        s = s.replace(a, b)
    return s


def must(s, a, b):
    if s.count(a) != 1:
        sys.exit(f'바꿀 글자가 {s.count(a)}개: {a[:70]}')
    return s.replace(a, b)


s = open(os.path.join(ROOT, 'share/manual.html'), encoding='utf-8').read()
# 1.x 옮기기 장은 학교만 해당 — 통째로 빼고 뒤 장 번호를 당김
a = s.index('<h2>8. 1.x 를 쓰던 학교에서 옮기기</h2>'); b = s.index('<h2>9. 업데이트</h2>')
s = s[:a] + s[b:]
s = must(s, '<li>1.x 를 쓰던 학교에서 옮기기</li>', '')
s = must(s, '<h2>9. 업데이트</h2>', '<h2>8. 업데이트</h2>')
s = must(s, '<h2>10. 자주 묻는 질문 · 문제 해결</h2>', '<h2>9. 자주 묻는 질문 · 문제 해결</h2>')
s = must(s, '<li>새 기능을 미리 써 보려면 설치 확인 화면의 <b>베타 열기</b>를 이용하세요.</li>', '')
# 표지
s = must(s, '<title>줄넘기 기록 관리 v2.6.0 사용설명서</title>', '<title>줄넘기 기록 관리 클럽판 v2.6.0 사용설명서</title>')
s = must(s, '<h1>🏆 줄넘기 기록 관리 v2.6.0</h1>', '<h1>🏆 줄넘기 기록 관리 · 클럽판 v2.6.0</h1>')
s = must(s, '  <p>학생은 휴대폰으로 그날 뛴 줄넘기 횟수를 넣고, 반 전체 그래프·학생별 누적·전국 현황판까지 한눈에.</p>',
         '  <p><b>스포츠클럽 · 태권도장 · 줄넘기 교실</b>을 위한 판이에요. 학생은 휴대폰으로 그날 뛴 줄넘기 횟수를 넣고, 반 전체 그래프·학생별 누적·전국 클럽 현황판까지 한눈에.</p>\n'
         '  <p>전국 현황판은 학교 현황판과 따로, <b>Jump Earth! 클럽 리그</b>에서 전국의 클럽·도장과 겨뤄요.</p>')
s = must(s, 'https://musicalpe.github.io/jumprope/</div>', 'https://musicalpe.github.io/jumprope/club/</div>')
s = must(s, '<li>전국 현황판 · Jumpers! 기록실</li>', '<li>Jump Earth! 클럽 리그 · Jumpers! 기록실</li>')
# 설치
s = s.replace('<code>Shell(껍데기).txt</code>', '<code>Shell(클럽용 껍데기).txt</code>').replace('Shell(껍데기).txt', 'Shell(클럽용 껍데기).txt')
s = must(s, 'https://docs.google.com/spreadsheets/d/1ItPU6WU1-buXQ_Cb9yRYjUz81IYXISoq3ul3_ht-4h0/copy', CLUB_COPY)
s = must(s, '<code>6학년 1반 줄넘기</code>처럼 <b>우리 반 이름으로 바꿔</b> 주세요.', '<code>햇살태권도 줄넘기</code>처럼 <b>우리 클럽 이름으로 바꿔</b> 주세요.')
# 첫 설정: 부르는 이름
s = must(s, '<h3>③ 기본 설정 — QR · 하루 목표 · 줄넘기 종류 · 승인 절차</h3>', '<h3>③ 기본 설정 — 부르는 이름 · QR · 하루 목표 · 줄넘기 종류 · 승인 절차</h3>')
s = must(s, '<ul>\n  <li><b>학생 접속 QR</b>:', '<ul>\n  <li><b>우리를 부르는 이름</b>: 클럽 / 도장 / 직접 입력(예: 팀, 체육관). 메인 화면 제목이 "우리 도장 줄넘기 기록"처럼 바뀌어요.</li>\n  <li><b>학생 접속 QR</b>:')
# 현황판
s = must(s, '<h2 class="pb">5. 전국 현황판 · Jumpers! 기록실</h2>', '<h2 class="pb">5. Jump Earth! 클럽 리그 · Jumpers! 기록실</h2>')
s = must(s, '<h3>무엇이 보내지나요?</h3>', '<div class="tip">클럽·도장은 보호자께 "전국 클럽 현황판에 가린 이름(예: 김*늘)·학년·횟수가 올라간다"는 것을 미리 안내해 주세요. 참여는 기본으로 꺼져 있어요.</div>\n<h3>무엇이 보내지나요?</h3>')
# 상장 직함
s = must(s, '직함은 <b>담임 / 체육 교사 / 직접 입력</b> 중에서', '직함은 <b>관장 / 사범 / 직접 입력</b> 중에서')
s = words(s)
s = must(s, '<img src="img/install.png" style="max-width:40%">', '<img src="img/install.png" style="max-width:30%">')
s = must(s, '<p class="tip" style="margin-top:0;">▶ <b>설치 영상(1분)</b>으로 따라 해도 돼요:',
         '<div class="warn" style="margin-top:0;">학교용 견본·껍데기가 아니라 <b>클럽용</b>을 써야 해요. 학교용을 쓰면 기록이 학교 현황판으로 가요. (클럽 앱이 알아채고 경고를 띄워요)</div>\n'
         '<p class="tip" style="margin-top:0;">▶ <b>설치 영상(1분, 학교판으로 찍었지만 순서는 같아요)</b>으로 따라 해도 돼요:')
# 자주 묻는 질문: 껍데기를 바꿔 붙인 경우
s = must(s, '<tr><td>관리자 메뉴에 <b>점프 Live</b> 탭이 없어요</td>',
         '<tr><td>"이 시트에는 <b>학교용 껍데기</b>가 들어 있어요" 경고가 떠요</td><td>학교용 껍데기를 붙였어요. <b>클럽용 껍데기</b>를 Code.gs 에 다시 붙여 넣고 <b>새 버전</b>으로 배포하세요. 그대로 두면 기록이 학교 현황판으로 가요.</td></tr>\n'
         '<tr><td>관리자 메뉴에 <b>점프 Live</b> 탭이 없어요</td>')
s = s.replace('줄넘기 기록 관리 v2.6.0 · Made by', '줄넘기 기록 관리 클럽판 v2.6.0 · Made by')
os.makedirs(os.path.join(ROOT, 'club/share'), exist_ok=True)
open(os.path.join(ROOT, 'club/share/manual.html'), 'w', encoding='utf-8').write(s)
print('club/share/manual.html', s.count('학교'), '학교 남음')
