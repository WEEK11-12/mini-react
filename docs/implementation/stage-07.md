# 7단계: useEffect 의존성·정리 함수

상태: stage-07 구현·기본 점검 및 검증 에이전트 제한 재검토 승인 완료. 전체 suite 승인은 별개다.

## 범위

[EFF-01~03](../requirements.md#eff) 및 임시 채택한 [EFF-04](../requirements.md#eff-04)에 따라 루트 Effect의 DOM 반영 후 실행, 의존성 비교, 재실행 전·제거 시 정리를 구현한다. [Hook 설계](../design/hooks.md#useeffect)와 [런타임 실패 처리](../design/component-runtime.md#실패-처리)를 따른다. OPEN-08·11·15는 임시 결정이며 확정 정책으로 바꾸지 않는다. useMemo와 Phase 2 시연은 후속 범위다.

## 변경

- `src/core/hooks.ts`: Effect 슬롯과 얕은 deps 스냅샷, 형태 검증, pending 설정 등록.
- `src/core/component.ts`: 성공한 DOM 커밋 뒤 Effect 처리, 정리·설정 오류 수집, 제거·복구 시 저장된 정리 소비.
- `tests/runtime/stage-seven-implementation.test.ts`: DOM 반영 후 실행, 동일 deps 유지, 변경·제거 정리 스모크.
- `README.md`: 단계 링크와 구현 상태 갱신.

## 자체 점검

`tests`의 `npm run typecheck:core`, `npm run typecheck`, `npm run test -- runtime/stage-seven-implementation.test.ts`(1개 통과), 루트의 `npm run build`, `git diff --check`를 실행해 exit 0을 확인했다. 전체 단위·브라우저·회귀 검증 및 최종 판정은 검증 에이전트 담당으로 미실시다.

## 남은 범위

검증 에이전트의 제한 재검토 승인을 받았다. useMemo·Phase 2 시연 및 전체 suite 통과는 별개로 남았다. 커밋·푸시·배포하지 않았다.

## 검증 에이전트 검토와 수정

최초 검토는 수정 요청이었다. 독립 단위 25개 중 22개 통과·3개 실패, Chromium 11개 중 8개 통과·3개 실패였으며 원인은 Effect 오류 후 setter 경로의 수락된 요청 유실과 희소 deps 비교 누락이었다. 구현 에이전트가 성공 커밋 후 Effect 오류를 구분해 같은 연속 갱신 예산 안에서 FIFO 처리를 지속하고, deps의 모든 인덱스를 비교하도록 수정했다. 영향받는 `npm run typecheck:core`, `npm run typecheck`, 스모크 1개 및 `git diff --check`는 exit 0을 확인했다.

제한 재검토에서 원래 반례 6개는 통과했으나, 직접 update의 Effect 오류 경로에서 51번째 갱신까지 커밋하는 예산 문제가 추가로 확인되었다. 직접 update의 최초 성공 갱신 1회를 Effect 오류 후 대기열 예산에 전달하도록 수정했다. 최종 제한 재검토에서 50/51 경계 단위 12개와 실제 Chromium 4개가 모두 통과했다. 이미 통과한 이전 20개, 전체 회귀 및 타입 검사·build는 최종 재검토에서 재실행하지 않았다. 최초 회귀의 useMemo 미구현 관련 단위 9개와 기존 오류 포장 기대값 관련 단위·브라우저 각 5개 실패는 전체 suite 통과로 간주하지 않는다.

검증 에이전트의 원본 보고서·runner JSON·SHA-256 manifest는 저장소 외부 검증 작업 디렉터리의 `report.md`, `rereview-report.md`, `final-rereview-report.md`, `final-rereview-runner-summary.json`, `final-rereview-unit.json`, `final-rereview-browser/rereview-adjacent-browser.json`, `final-rereview-product-source-sha256.json`에 보관했다. runner JSON의 최종 실제 실행은 16개 통과·실패 0개(단위 필터 제외 7개, 브라우저 필터 제외 7개)이고 제품 소스 13개의 현재 SHA-256이 승인 manifest와 일치함을 구현 에이전트가 대조했다. 승인 후 변경은 이 구현 기록과 README의 상태 설명뿐이며 제품 소스는 수정하지 않았다. 검증 에이전트는 `tests` 아래 stage-07 review/rereview 단위·브라우저·지원·설정 파일을 추가했다.
