# 8단계: useMemo 의존성 기반 메모이제이션

상태: stage-08 구현·기본 점검 및 검증 에이전트 독립 검토 승인 완료. 전체 suite 승인은 별개다.

## 범위

[MEMO-01~03](../requirements.md#memo)에 따라 루트 렌더의 최초 계산, 동일 의존성의 결과 재사용, 의존성 변경 시 재계산을 구현한다. [Hook 설계](../design/hooks.md#usememo)의 직전 성공 슬롯·candidate 계약을 따르며 OPEN-11·13·15는 임시 결정으로 유지한다. Phase 2 시연은 후속 범위다.

## 변경

- `src/core/hooks.ts`: Memo 슬롯, 배열 인수·Hook 순서·길이 검사, Object.is 기반 인덱스 비교, deps 얕은 복사 및 candidate 결과 보관.
- `tests/runtime/stage-eight-implementation.test.ts`: 동일 deps 재사용, 실패한 렌더의 candidate 폐기와 변경 시 재계산 스모크.
- `README.md`: 단계 링크와 검토 대기 상태 갱신.

## 자체 점검

`tests`에서 `npm run typecheck:core`, `npm run typecheck`, `npm run test -- runtime/stage-eight-implementation.test.ts`(1개 통과), 프로젝트 루트에서 `npm run build`, `git diff --check`를 실행해 exit 0을 확인했다. 전체 단위·브라우저·회귀 검증 및 최종 판정은 검증 에이전트 담당으로 미실시다.

## 남은 범위

검증 에이전트가 stage-08 범위를 독립 승인했다. Phase 2 시연과 전체 suite 통과는 별개로 남았다. 커밋·푸시·배포하지 않았다.

## 검증 에이전트 검토

독립 Memo 단위 31개와 실제 Chromium 라이브러리 검증 31개가 통과했다. 최신 회귀의 고유 실행 664개 중 654개가 통과했고, 기존 오류 포장 기대값 관련 단위 5개·브라우저 5개는 실패했다. 구현 스모크 1개는 이미 자체 점검에서 통과해 검증 에이전트가 중복 실행하지 않았고, 후속 Phase 2 시연 브라우저 4개는 제외했다. 브라우저 Memo 31개는 브라우저 회귀 147개에 포함되어 중복 합산하지 않았다. 검증 에이전트는 `tests/support/stage-eight-review-cases.ts`, `tests/runtime/stage-eight-review.test.ts`, `tests/browser/stage-eight-review.spec.ts`를 추가했다.

원본 보고서·runner JSON·제품 SHA-256 manifest는 저장소 외부 검증 작업 디렉터리의 `report.md`, `runner-summary.json`, `memo-unit-final.json`, `unit-regression.json`, `browser-final.json`, `product-source-sha256.json`에 보관했다. 구현 에이전트가 runner의 실제 상태를 집계하고 제품 소스 13개의 현재 해시가 승인 manifest와 일치함을 확인했다. 승인 후에는 이 구현 기록과 README의 상태 설명만 변경했으며 제품 소스는 수정하지 않았다. 검증 에이전트는 제품 빌드·core 타입 검사·구현 스모크를 반복하지 않았고, Phase 2 앱 시연 및 이전 커밋 실행 baseline은 확인하지 않았다.
