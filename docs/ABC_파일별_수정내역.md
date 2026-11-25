# ABC 통합 파일별 수정 내역과 이유

작성일: 2026-11-25

`Lost_and_Found_ABC`는 A의 서버·계정·공통 기반에 B의 신고 기능과 C의 검색·매칭 기능을 합친 프로젝트입니다. 단순 복사 후에도 실행은 가능했지만, 신고 상태와 매칭 상태가 서로 어긋나는 문제가 있어 업무 규칙과 연동 방식을 수정했습니다. 관리자 검색·페이지 이동·시간 입력도 보완했습니다.

이 문서의 **A·B·C는 파일의 담당 영역**입니다. 아래 변경은 모두 통합본 안에서 수행했으며, 원본 `Lost_and_Found`, `Lost_and_Found_B`, `Lost_and_Found_C`를 수정했다는 뜻이 아닙니다. 문서 작성 시 원본과 통합본의 실제 파일 내용을 비교했습니다.

## 비교 기준과 통합 방식

| 영역 | 원본 기준 | 통합본 위치 | 가져온 이유 |
|---|---|---|---|
| A 계정·공통·루트 설정 | `Lost_and_Found` | `features/account/`, `shared/`, 루트 파일 | 로그인·세션·공통 서버·DB가 구현된 기반이므로 유지 |
| B 신고 | `Lost_and_Found_B/features/reports/` | `features/reports/` | 신고 CRUD·사진·관리자 신고 기능을 가져오기 위해 |
| C 검색·매칭·통계 | `Lost_and_Found_C/features/discovery/` | `features/discovery/` | 실제 검색·매칭 알고리즘·통계 기능을 가져오기 위해 |
| D 인계·보관 | `Lost_and_Found/features/operations/` | `features/operations/` | 기존 골격만 유지. 이번 ABC 통합에서 새로 구현하지 않음 |

B 폴더의 `shared/`와 `package.json`은 가져오지 않았습니다. 이전 버전의 빈 서버·인증 코드와 서버 의존성이 빠진 설정으로 A 기반을 덮어쓰는 일을 막기 위해서입니다. C 폴더의 루트 설정도 통째로 덮어쓰지 않았습니다.

아래 표의 경로는 모두 **`Lost_and_Found_ABC/` 기준**입니다. ‘수정’은 해당 담당자의 원본과 비교한 변경이고, ‘추가’는 통합본에 새로 만든 파일입니다. 의존성·빌드·캐시·실행 DB·사용자 업로드는 소스 수정 목록에서 제외합니다.

## A 계정과 공통 기반에서 수정한 파일

A의 로그인·회원가입·알림 기능 자체를 다시 구현하지는 않았습니다. B와 C가 같은 규칙과 DB 연결을 사용하도록 공통 정책, DB 이전, 테스트 실행을 보강했습니다.

### 서버와 데이터베이스

| 파일 | 구분 | 무엇을 어떻게 바꿨는가 | 수정 이유 |
|---|---|---|---|
| [shared/backend/report-policy.js](../shared/backend/report-policy.js) | 추가 | `assertReportMutable()`와 `assertBasicTransition()` 추가. 확정 매칭, 거절 외 인계 신청, 보관 기록, 기본 단계 외 상태를 검사. B에서 허용하는 전이를 접수·습득물 보관으로 한정 | B 관리자 API가 C의 확정 매칭이나 D의 인계 상태를 임의로 덮어쓰는 문제 방지 |
| [shared/backend/init-db.js](../shared/backend/init-db.js) | 수정 | DB 버전 2에서 3으로 변경. 기존 `reports`에 `storage_place`가 없으면 추가하고, 습득 신고 설명의 보관 장소 접두사를 컬럼으로 이전. 같은 트랜잭션에서 수행 | 보관 장소를 설명 문자열에서 분리하면서 기존 데이터를 보존하기 위해 |
| [shared/backend/database.test.js](../shared/backend/database.test.js) | 수정 | 정상 DB 버전 기대값을 3으로 변경. 미래 버전 거부 검사에는 버전 4 사용 | 새 DB 버전과 보호 동작에 맞게 검사 유지 |
| [shared/backend/server.test.js](../shared/backend/server.test.js) | 수정 | B·C health 기대값을 `reports-ready`, `discovery-ready`로 변경. D는 `routing-only` 유지 | 구현된 기능과 라우터만 연결된 기능을 구분하기 위해 |
| [features/account/account.test.js](../features/account/account.test.js) | 수정 | v1 DB 업그레이드 검사에서 최종 버전을 3으로 변경 | 기존 사용자·세션 관련 업그레이드 검사를 새 스키마와 일치시키기 위해 |

`shared/backend/server.js`, `database.js`, 인증·관리자 미들웨어, `audit.service.js`는 A 원본을 그대로 사용했습니다. 서버에는 B·C 라우터와 정적 페이지 경로가 이미 등록되어 있어 다시 수정할 필요가 없었습니다. 계정 서비스와 화면도 원본을 유지했습니다.

### 실행 설정과 통합 테스트

| 파일 | 구분 | 무엇을 어떻게 바꿨는가 | 수정 이유 |
|---|---|---|---|
| [package.json](../package.json) | 수정 | 프로젝트 이름을 `lost-and-found-abc`로 변경. 기본 `test`에 A·B·C·공통·통합 테스트를 포함. B·C·통합 개별 검사 명령 추가. 테스트 실행을 `scripts/test.mjs`로 통일 | 기존 기본 테스트는 A·공통만 실행했으므로 B·C 오류를 놓치지 않게 하기 위해 |
| [scripts/test.mjs](../scripts/test.mjs) | 추가 | Node 테스트 실행기 호출. 하위 프로세스의 `TEMP`, `TMP`, `TMPDIR`을 프로젝트 `.tmp/`로 지정 | 테스트 임시 DB·업로드까지 ABC 폴더 안에 생성하도록 하기 위해 |
| [tests/integration.test.js](../tests/integration.test.js) | 추가 | 실제 HTTP 흐름과 충돌 상황을 검사하는 8개 테스트 추가 | 개별 A·B·C 테스트에서 잡지 못한 기능 간 문제를 다시 발생시키지 않기 위해 |
| [.gitignore](../.gitignore) | 수정 | `.tmp/`, `.qa/` 제외 규칙 추가 | 임시 DB·브라우저 프로필·검사 산출물이 소스 관리에 섞이지 않도록 하기 위해 |

`pnpm-lock.yaml`과 `vite.config.ts`는 A 원본을 유지했습니다. 의존성은 기존 잠금 파일 기준으로 설치했고, 최종 빌드는 Vite 8.0.5로 확인했습니다. 브라우저 검사용 Playwright는 `.qa/`에 따로 설치했으며 앱의 `package.json`에 추가하지 않았습니다.

### 문서와 작업 규칙

| 파일 | 구분 | 변경 내용과 이유 |
|---|---|---|
| [shared/contracts/api-contract.md](../shared/contracts/api-contract.md) | 수정 | B·C 실제 엔드포인트, 요청·응답, 권한, 충돌 오류, DB 전달 방식 추가. 기존 A 단계 설명과 현재 ABC 계약을 구분 |
| [shared/contracts/database-schema.md](../shared/contracts/database-schema.md) | 수정 | DB v3, `reports.storage_place`, 이전 방식, D 보관 기록과의 역할 차이 추가 |
| [shared/contracts/status-definitions.md](../shared/contracts/status-definitions.md) | 수정 | B 기본 상태 전이, C 확정·해제, 신고 잠금, 후보 무효화 규칙 추가 |
| [README.md](../README.md) | 수정 | ABC 실행·검사 방법과 현재 문서 링크로 교체. D 미구현 명시 |
| [AGENTS.md](../AGENTS.md) | 수정 | ABC 폴더 안에서만 수정한다는 제약, 공통 정책 사용, `req.db` 재사용, 테스트 위치 명시 |
| [CLAUDE.md](../CLAUDE.md) | 수정 | 현재 ABC 기준을 우선하고 기존 미구현 설명은 과거 기록임을 알리는 안내 추가 |
| [팀원_작업가이드.md](../팀원_작업가이드.md) | 수정 | 현재 ABC 통합 상태와 최신 문서 우선순위 안내 추가 |
| [Lost_and_Found_역할분담.md](../Lost_and_Found_역할분담.md) | 복사 후 수정 | 상위 프로젝트의 역할분담 문서를 ABC 안에 복사하고 현재 통합 상태 안내 추가. 원본 역할분담 파일은 유지 |
| [docs/README.md](README.md) | 수정 | 현재 ABC 통합 안내로 연결. 이번 문서 작성 시 파일별 수정 내역 링크도 추가 |
| [docs/ABC_통합결과.md](ABC_통합결과.md) | 추가 | 실행 방법, 정책, DB 이전, 검증 결과, D 연동 시 남은 작업 정리 |

기존 계약 문서와 B·C README의 과거 설명을 모두 삭제한 것은 아닙니다. 현재 기준을 알리는 안내와 ABC 계약을 추가했으므로, 통합판에서는 ABC 추가 내용을 우선합니다.

## B 신고 기능에서 수정한 파일

B 원본 대비 **17개 파일 수정, 1개 파일 추가**입니다. 핵심은 신고 변경의 안전성, 검색·목록 사용성, 시간·보관 장소 데이터 보존입니다.

### 백엔드와 스키마

| 파일 | 구분 | 무엇을 어떻게 바꿨는가 | 수정 이유 |
|---|---|---|---|
| [features/reports/backend/report.service.js](../features/reports/backend/report.service.js) | 수정 | 수정·삭제·관리자 상태 변경 전에 공통 정책 검사. 수정·삭제 시 C의 `invalidateReportCandidates()` 호출. 관리자 검색어 검증 추가. 보관 장소를 `description` 접두사 대신 별도 값으로 반환 | 확정 매칭 훼손과 오래된 후보 방지, 검색 지원, 보관 장소 구조화 |
| [features/reports/backend/report.repository.js](../features/reports/backend/report.repository.js) | 수정 | 등록·단건·목록·수정 SQL에 `storage_place` 반영. 관리자 목록에 물품 이름·설명 부분 검색 추가 | 서비스가 받은 보관 장소를 실제 DB에 저장하고 관리자 검색 수행 |
| [features/reports/backend/index.js](../features/reports/backend/index.js) | 수정 | health의 `stage`를 `routing-only`에서 `reports-ready`로 변경 | 신고 업무가 구현되었음을 정확히 표시 |
| [features/reports/reports.schema.sql](../features/reports/reports.schema.sql) | 수정 | `reports.storage_place TEXT NOT NULL DEFAULT ''` 추가 | 보관 장소를 독립된 데이터로 관리하기 위해 |
| [features/reports/reports.test.js](../features/reports/reports.test.js) | 수정 | 새 health 응답과 설명·보관 장소 분리 방식 반영. 기존 ‘분실 신고를 바로 STORED로 변경’ 검사를 허용되는 RECEIVED 전이로 변경 | 바뀐 정책에 맞춰 기존 신고·권한·사진 검사를 유지. 잘못된 전이 차단은 통합 테스트에서 별도 검사 |

### 화면과 JavaScript

| 파일 | 구분 | 무엇을 어떻게 바꿨는가 | 수정 이유 |
|---|---|---|---|
| [features/reports/frontend/admin-reports.html](../features/reports/frontend/admin-reports.html) | 수정 | 관리자 검색 폼, 습득물 직접 등록 링크, C 매칭 관리 링크·안내 추가 | 상태 필터만으로 찾기 어려웠던 신고를 검색하고 직접 등록 경로를 제공 |
| [features/reports/frontend/lost-report.html](../features/reports/frontend/lost-report.html) | 수정 | 날짜 입력을 초 단위 `datetime-local`로 변경. 현지 시간 안내 표시 | 분실 발생 시각까지 입력받기 위해 |
| [features/reports/frontend/found-report.html](../features/reports/frontend/found-report.html) | 수정 | 날짜 입력을 초 단위 `datetime-local`로 변경. 현지 시간 안내 표시 | 습득 발생 시각을 매칭 비교에 사용할 수 있도록 하기 위해 |
| [features/reports/frontend/report-edit.html](../features/reports/frontend/report-edit.html) | 수정 | 수정 화면도 동일한 날짜·시간 입력으로 변경 | 수정 과정에서 기존 시간이 날짜만 남고 사라지는 문제 방지 |
| [features/reports/frontend/js/lost-report.js](../features/reports/frontend/js/lost-report.js) | 수정 | 입력한 현지 날짜·시간을 `toUtcDateTime()`으로 변환해 API로 전송 | 브라우저 시간대에 따른 날짜 해석 차이 방지 |
| [features/reports/frontend/js/found-report.js](../features/reports/frontend/js/found-report.js) | 수정 | 습득 신고 발생 시각을 UTC ISO로 변환해 전송 | 분실·습득 시각을 같은 기준으로 비교하기 위해 |
| [features/reports/frontend/js/report-edit.js](../features/reports/frontend/js/report-edit.js) | 수정 | DB의 UTC 시간을 `toLocalDateTime()`으로 입력칸에 복원하고 저장 시 UTC 변환. `storage_place`를 우선 사용하고 과거 접두사 형식도 읽도록 유지 | 시간 왕복 변환과 기존 데이터 호환, 별도 보관 장소 편집 지원 |
| [features/reports/frontend/js/reports-common.js](../features/reports/frontend/js/reports-common.js) | 수정 | `toUtcDateTime()`, `toLocalDateTime()` 추가 | 등록·수정 화면에서 같은 시간 변환 규칙을 사용하기 위해 |
| [features/reports/frontend/js/admin-reports.js](../features/reports/frontend/js/admin-reports.js) | 수정 | 검색어 `q` 전달, 검색·필터 변경 시 첫 페이지로 이동, 페이지당 20건 요청. 상태 선택지를 현재 상태와 허용되는 다음 상태로 제한. 늦게 도착한 이전 조회 응답 무시 | 검색·페이지 이동 지원, 금지된 상태 변경 유도 방지, 화면의 오래된 응답 덮어쓰기 방지 |
| [features/reports/frontend/js/my-reports.js](../features/reports/frontend/js/my-reports.js) | 수정 | 고정 첫 50건 조회를 페이지당 20건 조회와 이전·다음 이동으로 변경. 늦은 응답 무시 | 51번째 이후의 본인 신고도 확인할 수 있도록 하기 위해 |
| [features/reports/frontend/js/pagination.js](../features/reports/frontend/js/pagination.js) | 추가 | 공통 페이지 번호·전체 건수·이전/다음 버튼 생성. 로딩·오류·마지막 페이지 버튼 상태 관리 | 본인 목록과 관리자 목록의 페이지 이동을 동일하게 처리하기 위해 |
| [features/reports/frontend/css/reports.css](../features/reports/frontend/css/reports.css) | 수정 | 검색 폼·페이지 이동 영역에 간격과 줄바꿈 스타일 추가 | 작은 화면에서 입력칸과 버튼이 겹치거나 가로로 넘치지 않도록 하기 위해 |
| [features/reports/README.md](../features/reports/README.md) | 수정 | 기존 설명이 통합 전 기록임을 표시하고 현재 정책·계약으로 연결 | 이전 보관 장소 저장 방식과 미연동 설명을 현재 동작으로 오해하지 않도록 하기 위해 |

다음 3개 파일은 B에서 그대로 가져왔습니다. `backend/report.controller.js`, `backend/photo-upload.js`, `frontend/my-reports.html`. 사진 업로드 알고리즘을 새로 만든 것은 아니며 기존 B 구현을 재사용했습니다. `my-reports.html`을 바꾸지 않고도 JS에서 페이지 이동 UI를 추가합니다.

## C 검색과 매칭 기능에서 수정한 파일

C 원본 대비 **10개 파일 수정, 1개 파일 추가**입니다. 기존 검색·매칭·통계 알고리즘을 유지하면서 DB 연결과 신고 변경 연동을 보강했습니다.

| 파일 | 구분 | 무엇을 어떻게 바꿨는가 | 수정 이유 |
|---|---|---|---|
| [features/discovery/backend/search.service.js](../features/discovery/backend/search.service.js) | 수정 | `searchReports(query)`를 `searchReports(db, query)`로 변경. 내부 `openDatabase()`·`close()` 제거 | B가 사용하는 DB와 같은 연결에서 검색하고 메모리 DB 주입 테스트가 가능하도록 하기 위해 |
| [features/discovery/backend/detail.service.js](../features/discovery/backend/detail.service.js) | 수정 | `getReportDetail(db, reportId)` 형태로 변경. 자체 DB 연결 제거. 상세 응답에 `storage_place` 추가 | 같은 DB 연결 사용과 구조화된 보관 장소 표시 |
| [features/discovery/backend/search.controller.js](../features/discovery/backend/search.controller.js) | 수정 | 검색·상세 서비스에 `req.db` 전달 | 서비스의 변경된 DB 주입 방식에 맞춰 실제 HTTP 요청을 연결 |
| [features/discovery/backend/matching.service.js](../features/discovery/backend/matching.service.js) | 수정 | `generateMatchesForReport(db, reportId, userId)`로 변경. 자체 연결 열기·닫기 제거. 기존 후보 생성 트랜잭션 유지 | 같은 DB 연결에서 후보 생성·알림 생성을 처리하고 호출자의 DB를 임의로 닫지 않도록 하기 위해 |
| [features/discovery/backend/matching.controller.js](../features/discovery/backend/matching.controller.js) | 수정 | 후보 생성 서비스 첫 인자로 `req.db` 전달 | 변경된 서비스 인터페이스를 HTTP 경로에 반영 |
| [features/discovery/backend/admin-matching.service.js](../features/discovery/backend/admin-matching.service.js) | 수정 | CONFIRM 직전에 최신 신고로 `calculateSimilarity()` 재실행. 후보 자격 미충족 시 409 `STALE_MATCH`. 유효하면 최신 점수 저장 후 확정 | 후보 생성 이후 신고 내용이 달라졌는데도 오래된 후보를 확정하는 문제 방지 |
| [features/discovery/backend/match-lifecycle.service.js](../features/discovery/backend/match-lifecycle.service.js) | 추가 | `invalidateReportCandidates()` 구현. 해당 신고의 CANDIDATE를 삭제하고 이전 후보 전체를 `MATCH_INVALIDATE` 감사 로그에 저장. REJECTED는 유지 | B가 C 테이블을 직접 조작하지 않고 C의 서비스로 후보 무효화를 요청하도록 하기 위해 |
| [features/discovery/backend/index.js](../features/discovery/backend/index.js) | 수정 | health의 `stage`를 `discovery-ready`로 변경 | 검색·매칭 업무 구현 상태를 표시 |
| [features/discovery/frontend/js/report-detail.js](../features/discovery/frontend/js/report-detail.js) | 수정 | `storage_place`를 설명과 함께 화면에 표시. 아직 작동하지 않는 인계 신청 링크는 숨기고 준비 중 안내 표시 | 보관 장소 분리 후에도 정보를 보여주고 D 미구현을 실제 신청 가능으로 오해하지 않게 하기 위해 |
| [features/discovery/discovery.test.js](../features/discovery/discovery.test.js) | 수정 | 검색·상세·후보 생성 서비스 호출에 테스트 DB를 직접 전달하도록 변경 | DB 주입 방식에 맞춰 기존 24개 C 검사를 유지 |
| [features/discovery/README.md](../features/discovery/README.md) | 수정 | 통합 전 설명과 현재 ABC 계약의 우선순위 안내 추가 | 원본 C 문서의 미연동 항목과 현재 구현을 구분 |

C의 `matching.schema.sql`, `matching.repository.js`, 통계 서비스·컨트롤러, 관리자 매칭 컨트롤러는 그대로 가져왔습니다. 6개 HTML, CSS, 이미지 및 상세보기 이외의 화면 JS도 C 원본을 유지했습니다. 이름·카테고리·장소·시간의 가중치와 60% 후보 기준을 새 알고리즘으로 바꾼 것은 아닙니다.

## 수정 전후의 실제 처리 흐름

### 확정 매칭 보호

**수정 전:** C에서 확정하면 `matches=CONFIRMED`, `reports=MATCHED`가 됩니다. 이후 B 관리자가 신고만 `REPORTED`로 바꿀 수 있었고, C 해제는 신고 상태가 달라져 409 오류로 실패했습니다.

**수정 후:** B의 서비스가 `assertReportMutable()`로 연결된 확정 매칭을 검사합니다. 본인 수정·삭제, 관리자 삭제·상태 변경 모두 409 `REPORT_LOCKED`로 거부합니다. 먼저 C에서 정식 해제를 완료해야 신고를 변경할 수 있습니다.

### 신고 내용 변경과 후보 무효화

**수정 전:** B에서 물품 이름·카테고리를 바꾸거나 신고를 삭제해도 기존 후보가 그대로 남았습니다.

**수정 후:** B의 수정·삭제 트랜잭션 안에서 C의 `invalidateReportCandidates()`를 호출합니다. 일반 후보를 지우고 감사 이력을 저장한 뒤 신고를 변경합니다. 신고 저장이 실패하면 후보 삭제와 이력도 함께 롤백됩니다. 수정 후 새 후보 생성은 사용자가 다시 실행합니다. 자동 매칭을 추가한 것은 아닙니다.

### 상태 변경 권한

| 처리 | 현재 담당과 허용 동작 |
|---|---|
| 신고 접수 | B: `REPORTED → RECEIVED` |
| 습득물 보관 표시 | B: FOUND 신고만 `RECEIVED → STORED` |
| 매칭 확정·해제 | C: 매칭과 양쪽 신고 상태를 함께 처리 |
| 인계·폐기·이관 | D 구현 필요. B의 상태 선택으로 대신 처리할 수 없음 |

기본 신고 상태가 아닌 경우, 확정 매칭이 있는 경우, 거절 이외 상태의 인계 신청이 있는 경우, D 보관 기록이 있는 경우에는 B 변경을 차단합니다. 브라우저 선택지 제한뿐 아니라 서버에서도 검사합니다.

### 보관 장소와 시간

| 항목 | 이전 | 현재 |
|---|---|---|
| 보관 장소 | `description` 앞에 `[보관 장소: 학생회관]`을 붙여 저장 | `storage_place`에 `학생회관` 저장. 설명에는 특징만 저장 |
| 기존 데이터 | 설명에서 문자열을 분리해야 함 | `db:init`의 v3 이전으로 기존 접두사를 컬럼으로 이동 |
| 발생 시각 | 날짜만 입력 | 현지 날짜·시간을 입력하고 UTC로 저장 |
| 수정 화면 | 날짜만 복원 | UTC를 현지 날짜·시간으로 복원하고 초 단위까지 보존 |

`reports.storage_place`는 신고자가 입력한 장소입니다. D의 실제 보관 접수·기한 관리인 `storage_records`를 자동 생성하지는 않습니다. 날짜 전용 API 입력은 호환을 위해 UTC 자정으로 유지했고, C 날짜 필터·통계 기준도 기존 UTC 기준을 유지했습니다.

## 검사와 산출물

이번 통합 구현 후 자동 테스트 **59개**가 통과했습니다. 구성은 공통 DB 8개, 서버 5개, A 9개, B 5개, C 24개, ABC 통합 회귀 8개입니다. 이 문서 작성에서는 테스트를 다시 실행하지 않고 저장된 통합 검사 결과를 확인했습니다.

새 통합 테스트는 다음 내용을 확인합니다.

1. 회원가입·로그인 → B 신고 → C 검색·상세·매칭 → A 알림·관리자 통계의 HTTP 흐름.
2. 확정 매칭에 연결된 신고의 상태 변경·수정·삭제 차단과 정상 해제.
3. 신고 수정·삭제에 따른 후보 무효화와 오래된 후보 확정 거부.
4. 신고 저장 실패 시 후보·감사 이력까지 롤백.
5. B 상태 전이 순서·유형 제한과 매칭·종료 상태 직접 지정 차단.
6. 인계 신청·보관 기록과의 충돌 차단.
7. 50건 초과 목록 조회와 관리자 검색.
8. v2 DB 이전 시 보관 장소·신고 보존 및 재실행 안전성.

Edge 브라우저에서도 로그인, 신고 등록, 3페이지 이동, 수정 시 시간 보존, 관리자 검색, 상태 선택지, 습득물 직접 등록, 보관 장소 표시를 확인했습니다. 390px 모바일 관리자 화면의 가로 넘침과 JavaScript 오류는 없었고, 최종 빌드도 통과했습니다.

| 산출물 | 목적 |
|---|---|
| `.qa/browser-check.mjs` | 브라우저 통합 검사 스크립트. 검사 데이터는 메모리 DB 사용 |
| `.qa/admin-desktop.png`, `.qa/admin-mobile.png` | 관리자 화면 검증 스크린샷 |
| `.tmp/test-results.txt`, `.tmp/build-results.txt` | 테스트·빌드 실행 결과 |
| `database/lostfound.db` | ABC 실행용으로 새로 초기화한 DB. 원본 개인 DB를 복사한 것이 아님 |

## 남겨 둔 범위와 관련 문서

D의 인계 신청·승인·실물 인계 완료·보관 기한·폐기·이관은 구현하지 않았습니다. 통합판에 있는 D 테이블과 화면 골격을 실제 동작으로 설명하면 안 됩니다. C의 통계가 인계 데이터를 집계할 수 있다는 것과 D의 업무 API가 구현됐다는 것은 별개입니다.

- [ABC 통합 결과와 실행 방법](ABC_통합결과.md)
- [현재 API 계약](../shared/contracts/api-contract.md)
- [상태 변경 규칙](../shared/contracts/status-definitions.md)
- [DB 스키마와 v3 이전](../shared/contracts/database-schema.md)

이번 문서화 작업에서는 이 파일을 추가하고 `docs/README.md`에 링크를 추가했습니다. 앱 소스의 동작은 변경하지 않았습니다.
