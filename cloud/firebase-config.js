// 점퍼스 클라우드판 파이어베이스 설정 (공개해도 되는 값 — 보안은 규칙이 지킴)
export const firebaseConfig = {
  apiKey: "AIzaSyBa-NQBsqbt80zXoNQmTj7aqk6zgj9s67k",
  authDomain: "jumpus-pe.firebaseapp.com",
  databaseURL: "https://jumpus-pe-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jumpus-pe",
  storageBucket: "jumpus-pe.firebasestorage.app",
  messagingSenderId: "721370697852",
  appId: "1:721370697852:web:b5bb14274c211ab1e5b9f9"
};

// 학교 찾기 웹앱 (SchoolSearch.gs — 나이스 학교기본정보를 대신 물어봐 줌). 학교 이름·주소처럼 공개된 정보만 다룸
export const SCHOOL_SEARCH_URL = 'https://script.google.com/macros/s/AKfycbyiKhTxLUlJqyXQ9r1sgYII-9vrUCIt1AMYiZvT-E7nsDaUkomuLxh8P03pabcnqRdS9g/exec';
