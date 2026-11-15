# 상태값과 권한 기준

2026-11-15. A의 계정 동작은 구현 완료입니다. B/C/D의 아래 상태는 기존 SQL 제약에 따른 인터페이스 초안이며, 업무 상태 전이 구현·전원 합의 완료를 뜻하지 않습니다.

| 대상 | 코드 | 구현 상태 |
|---|---|---|
| 사용자 권한 | USER, ADMIN | A 완료. 가입은 USER, ADMIN은 로컬 CLI 지정 |
| 신고 제한 | report_blocked=0/1, blocked_until=NULL 또는 UTC 시각 | A 완료. 기한 경과 시 유효 제한=false |
| 알림 종류 | MATCH, HANDOVER, EXPIRY | A 생성 함수·목록·읽음 완료. C/D 업무 트리거 연결 필요 |
| 알림 읽음 | read_at=NULL / UTC 시각 | A 완료. 본인 알림만 처리 |
| 신고 유형 | LOST, FOUND | B 구현 필요 |
| 신고 상태 | REPORTED, RECEIVED, STORED, MATCHED, HANDOVER_IN_PROGRESS, HANDED_OVER, DISPOSED, TRANSFERRED | B/C/D 상태 전이 구현 필요 |
| 매칭 출처 | AUTO, ADMIN | C 구현 필요 |
| 매칭 상태 | CANDIDATE, CONFIRMED, REJECTED | C 구현 필요 |
| 인계 신청 상태 | REQUESTED, UNDER_REVIEW, APPROVED, REJECTED, COMPLETED | D 구현 필요 |
| 보관 상태 | STORED, HANDED_OVER, DISPOSED, TRANSFERRED | D 구현 필요 |

## A에서 적용하는 규칙

- 매 요청의 세션에서 user_id를 찾고, users의 현재 권한·제한을 다시 조회합니다. 클라이언트가 보낸 역할·사용자 ID를 인증 근거로 쓰지 않습니다.
- 관리자 사용자 API는 `requireAuth → requireAdmin` 순으로 검사합니다.
- 신고 제한은 로그인을 차단하지 않습니다. 알림 조회와 기존 내역 확인은 계속 가능합니다.
- 신고 등록 제한은 B의 생성 API에 `requireAuth → requireCanReport`를 적용해야 실제 신고를 막습니다. B API는 아직 미구현입니다.
- 제한 변경·해제에는 사유를 기록합니다. 종료일은 미래 시각만 허용하고, 빈 종료일은 무기한입니다. 관리자 계정은 제한할 수 없습니다.
- 만료된 제한은 DB 플래그가 1이어도 서버 사용자 응답과 가드에서 false로 판단합니다. 해제 시에는 플래그=0, 종료일=NULL로 저장합니다.
- 회원가입·로그인·로그아웃·관리자 지정·제한 변경은 audit_logs에 기록합니다. 비밀번호·세션 원본은 이력에 넣지 않습니다.

## B/C/D 통합 시 지켜야 할 규칙

- 인계 승인 APPROVED와 실물 인계 완료 COMPLETED는 별개입니다.
- COMPLETED는 수령인·완료 일시가 필요합니다. 실제 물품 상태 HANDED_OVER와 함께 일관되게 처리해야 합니다.
- 매칭·인계·폐기와 알림 생성은 같은 DB 연결의 트랜잭션에서 처리하세요.
- 업무의 allowed transition, 중복 매칭·신청 방지, 보관 기한 계산은 각 담당자가 정하고 구현한 후 문서를 갱신합니다.
