
# C파트 — 검색·매칭·통계

## 1. 구현 개요

분실·습득물 검색, 신고 상세 조회, 유사 물품 매칭,
관리자 매칭 관리 및 통계 기능을 구현한다.

### 개발 환경

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: SQLite
- 인증: A파트 세션 및 권한 미들웨어 활용

## 2. 구현 페이지

| 파일 | 주요 기능 |
|---|---|
| index.html | 메인 화면, 최근 습득물, 스마트 매칭 |
| search.html | 검색, 복합 필터, 페이지네이션 |
| report-detail.html | 신고 상세 정보 및 사진 조회 |
| matches.html | 유사 물품 찾기, 매칭 결과 및 비교 근거 |
| admin-matches.html | 관리자 매칭 확정, 거절, 해제 |
| admin-stats.html | 관리자 신고 및 인계 통계 |

## 3. API 명세

Base URL: /api/discovery

### 3.1 API 목록

| Method | Endpoint | 권한 | 기능 |
|---|---|---|---|
| GET | /health | 전체 | 서버 연결 확인 |
| GET | /reports | 전체 | 신고 검색 |
| GET | /reports/:id | 전체 | 신고 상세 조회 |
| GET | /matchable-reports | 로그인 | 본인의 매칭 가능 신고 조회 |
| POST | /reports/:id/matches | 신고 작성자 | 매칭 후보 생성 |
| GET | /matches | 로그인 | 본인의 매칭 결과 조회 |
| GET | /admin/matches | 관리자 | 전체 매칭 결과 조회 |
| POST | /admin/matches/:id/review | 관리자 | 매칭 상태 변경 |
| GET | /admin/stats | 관리자 | 통계 조회 |

### 3.2 신고 검색

GET /api/discovery/reports

Query Parameters:

- q: 물품 이름
- reportType: LOST / FOUND
- category: 카테고리
- place: 발생 장소
- startDate: 시작일 (YYYY-MM-DD)
- endDate: 종료일 (YYYY-MM-DD)
- status: 신고 상태
- page: 페이지 번호 (기본값 1)
- limit: 페이지당 개수 (기본값 20, 최대 100)

검색 기간은 물품 발생일 기준이다.
삭제된 신고는 검색 결과에서 제외한다.

### 3.3 신고 상세 조회

GET /api/discovery/reports/:id

Path Parameters:

- id: 신고 ID

신고 기본 정보, 상세 설명, 사진 정보를 반환한다.

존재하지 않거나 삭제된 신고는 404 오류를 반환한다.

### 3.4 매칭 가능 신고 조회

GET /api/discovery/matchable-reports

Query Parameters:

- page
- limit

로그인한 사용자가 작성한 신고 중 다음 상태의 신고를 조회한다.

- REPORTED
- RECEIVED
- STORED

### 3.5 매칭 후보 생성

POST /api/discovery/reports/:id/matches

Request Body: {}

Response Data:

- reportId: 신고 ID
- compared: 비교한 신고 수
- eligible: 매칭 기준 충족 개수
- created: 신규 매칭 개수
- existing: 기존 매칭 개수

본인이 작성한 신고에 대해서만 실행할 수 있다.

### 3.6 사용자 매칭 조회

GET /api/discovery/matches

Query Parameters:

- reportId: 특정 신고의 매칭 결과 조회
- page
- limit

분실 신고 또는 습득 신고의 작성자가 본인인
매칭 결과만 조회할 수 있다.

거절된 매칭은 사용자 조회 결과에서 제외한다.

### 3.7 관리자 매칭 조회

GET /api/discovery/admin/matches

Query Parameters:

- status: CANDIDATE / CONFIRMED / REJECTED
- page
- limit

매칭 정보, 분실·습득 신고 정보,
유사도, 비교 근거, 검토 기록을 반환한다.

### 3.8 관리자 매칭 처리

POST /api/discovery/admin/matches/:id/review

Request Body:

{
  "action": "CONFIRM"
}

action 종류:

- CONFIRM: 매칭 확정
- REJECT: 매칭 거절
- RELEASE: 매칭 해제

### 3.9 관리자 통계

GET /api/discovery/admin/stats

Query Parameters:

- startDate: 시작일
- endDate: 종료일
- reportType: LOST / FOUND
- category: 카테고리

Response Data:

- filters: 적용된 조회 조건
- summary: 전체 신고 및 처리 현황
- byType: 신고 유형별 집계
- byCategory: 카테고리별 집계
- byStatus: 신고 상태별 집계
- byDate: 일별 신고 집계
- handover: 인계 신청 현황
- categories: 전체 카테고리 목록

## 4. 매칭 알고리즘

규칙 기반 가중치 유사도 계산 방식을 사용한다.

| 비교 항목 | 조건 | 점수 |
|---|---|---:|
| 물품 이름 | 완전 일치 | 40 |
| 물품 이름 | 부분 일치 | 30 |
| 카테고리 | 일치 | 30 |
| 발생 장소 | 완전 일치 | 20 |
| 발생 장소 | 부분 일치 | 10 |
| 발생 시간 | 24시간 이내 | 10 |
| 발생 시간 | 72시간 이내 | 5 |

각 비교 항목의 점수를 합산하여 최대 100점으로 계산한다.

### 매칭 후보 선정 조건

- 분실 신고와 습득 신고 간 비교
- 카테고리 일치
- 습득 시간이 분실 시간보다 빠르지 않을 것
- 유사도 60% 이상
- 삭제되지 않은 신고
- 매칭 가능한 신고 상태

동일한 분실·습득 신고 쌍은 중복 저장하지 않는다.

신규 매칭 생성 시 분실 신고 작성자에게 알림을 생성한다.

유사도는 규칙 기반 비교 점수이며,
동일 물품임을 확률적으로 보장하는 수치는 아니다.

## 5. 관리자 매칭 처리 정책

| 처리 | 기존 상태 | 변경 상태 |
|---|---|---|
| 확정 | CANDIDATE | CONFIRMED |
| 거절 | CANDIDATE | REJECTED |
| 해제 | CONFIRMED | CANDIDATE |

- 매칭 확정 시 두 신고의 상태를 MATCHED로 변경
- 매칭 해제 시 확정 이전 신고 상태 복구
- 관리자 처리 이력을 audit_logs에 저장
- 신고 작성자에게 처리 결과 알림 생성
- 중복 매칭 확정 방지
- 인계 진행 및 종료된 물품과의 충돌 방지
- 트랜잭션으로 상태 변경, 알림 및 활동 기록을 처리

## 6. 통계 집계 기준

- 삭제된 신고 제외
- 신고 등록일 기준 기간 집계 (UTC)
- 현재 매칭 상태는 MATCHED 상태의 신고 건수
- 미처리 신고는 최종 처리되지 않은 신고 건수
- 인계 신청은 조회 조건에 해당하는 습득 신고 기준
- 인계 완료율은 인계 완료 습득 신고 / 전체 습득 신고 × 100
- 습득 신고가 없으면 인계 완료율은 null

## 7. 공통 기능 연동

### A파트

- 로그인 사용자 인증
- 관리자 권한 검사
- 알림 생성
- 관리자 활동 기록
- DB 트랜잭션
- 공통 API 응답 및 오류 처리

### B파트

- 분실·습득 신고 데이터 조회
- 신고 사진 조회
- 분실 신고 페이지 연결
- 내 신고 내역 페이지 연결

### D파트

- 인계 신청 페이지 연결
- 인계 요청 및 보관 상태 조회
- 인계 완료율 및 처리 현황 집계
- 관리자 매칭 변경 시 인계 상태 충돌 검사

## 8. 테스트 결과

### C파트 전용 테스트

node --test features/discovery/discovery.test.js

- 전체: 24개
- 성공: 24개
- 실패: 0개

### 공통 및 C파트 통합 자동화 테스트

node --test shared/backend/*.test.js features/account/account.test.js features/discovery/discovery.test.js

- 전체: 46개
- 성공: 46개
- 실패: 0개

테스트는 실제 서비스 DB와 분리된 임시 DB를 활용한다.

## 9. 추가 협의 및 연동 사항

- B파트 신고 등록 직후 자동 매칭 실행 연동
- 신고 수정 및 삭제 시 기존 매칭 갱신 정책
- 매칭 확정 및 해제 시 신고 상태 변경 정책 확정
- 동일 물품의 경쟁 매칭 후보 처리 정책
- D파트 인계 신청 URL 및 상태 변경 정책 통일
- 통계 날짜 기준 UTC / KST 확정
- 공통 API 명세에 C파트 API 추가
- 기본 테스트 명령어에 C파트 테스트 포함
- health API의 stage 반환값 변경 협의
- 전체 서비스 통합 후 브라우저 및 권한 재검증

현재 C파트 개별 기능과 자동화 테스트는 구현 완료 상태이며,
다른 파트와의 전체 기능 통합 검증은 별도로 진행한다.
