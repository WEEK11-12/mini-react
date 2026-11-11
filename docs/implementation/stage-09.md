# 9단계: Phase 2 업데이트 경로의 VNode Diff·Patch 연결

상태: stage-09 구현·기본 점검 및 검증 에이전트의 F1–F3 제한 재검토 승인 완료. 전체 suite 승인은 별개다.

## 범위

[VIEW-04](../requirements.md#view-04), [COMP-03](../requirements.md#comp-03), [STA](../requirements.md#sta), [EFF](../requirements.md#eff), [MEMO](../requirements.md#memo)에 따라 기존 FunctionComponent·Hook과 공통 렌더러를 실제 페이지의 Phase 2 시연에 연결한다. [웹페이지 설계](../design/playground-history.md#phase-2-검증-사례) 및 [검증 흐름](../design/verification.md#phase-2)을 따른다. OPEN 정책은 기존 임시 선택으로 유지한다.

## 변경

- `src/demo/cart.ts`: 루트 Cart의 수량·상품·메모·재고, Props 전용 ProductCard, 로컬 재고 구독과 정리, Memo 계산 횟수 계측, 별도 keyed 자식 목록의 역순·앞 삽입·삭제, 제거·재시작과 오류 표시.
- `index.html`, `src/style.css`, `src/main.ts`: Phase 1과 분리된 Phase 2 컨테이너·조작부를 만들고 시작·pagehide 정리를 연결한다.
- `README.md`: 단계 상태와 기록 링크를 갱신한다.

## 자체 점검

`tests`에서 `npm run typecheck:core`, `npm run typecheck`, 프로젝트 루트에서 `npm run build`, `git diff --check`가 exit 0이었다. 최초 검토의 F1–F3 수정 후 같은 정적 점검을 다시 실행해 모두 exit 0을 확인했다. 브라우저 검증·독립 판정은 검증 에이전트가 수행했으며 구현 에이전트가 직접 실행하지 않았다.

## 최초 독립 검토와 수정

검증 에이전트는 기존 Phase 2 브라우저 4개와 신규 사례 9개 중 6개가 통과했으나 신규 3개에서 수정 요청했다. 최초 전체 고유 실행 678개 중 665개 통과·13개 실패이며, 실패 10개는 기존 오류 포장 기대값, 3개는 이번 호스트 결함이었다. 목록 faulted 후 재시작 불가(F1), 다른 루트의 조작으로 미해결 오류가 사라짐(F2), Cart 종료 예외가 목록·Phase 1 종료를 막음(F3)을 지적했다. `src/demo/cart.ts`의 재시작·루트별 오류 유지·독립 종료를, `src/main.ts`의 독립 페이지 종료를 각각 수정했다.

## 제한 재검토 승인

검증 에이전트는 최초 실패 재현 3개와 직접 영향받는 신규 호스트 경로 9개를 현재 소스의 Chromium에서 실행해 12개 모두 통과(실패·skip 0)했다고 보고했다. 새 테스트 `tests/browser/review/stage-nine-review.spec.ts`와 `tests/browser/review/stage-nine-recheck.spec.ts`를 추가했다. 구현 에이전트가 실제 runner JSON의 고유 상태 12건과 실행 목록 12건을 대조하고, 승인 manifest의 제품 19개 파일·검증 테스트 2개의 현재 SHA-256 일치를 확인했다. 변경된 제품 파일은 `src/demo/cart.ts`, `src/main.ts`이고, 이후 수정된 것은 이 구현 기록과 README뿐이다. 최초 검토 때 통과한 브라우저 시나리오와 전체 suite는 반복하지 않았다. 원본 보고서·runner·manifest는 저장소 밖 검증 작업 디렉터리의 `report.md`, `recheck-runner-summary.json`, `product-source-sha256.json`에 보관했다.

## 남은 범위

stage-09 범위는 독립 승인되었다. 당시 기존 오류 포장 기대값 관련 단위 5개·브라우저 5개 실패는 이번 범위 밖으로 남아 전체 suite Green은 아니었다. Firefox·WebKit·실제 모바일·수동 시각 검사는 미실시다. 커밋·푸시·배포하지 않았다.

이후 현행 UI 계약에 맞게 9단계 브라우저 검토 테스트 두 파일을 조정했다. 원인 표기·실패 주입·복구 후 상태 검증은 유지하고, 목록 전용 복구·빈 목록 버튼 비활성화·BFCache 테스트 기본 주소를 반영했다. 검증 담당의 제한 검토 승인 및 대상 18개·전체 Chromium 180개 통과(실패·skip 0)를 확인했다. 제품 코드는 수정하지 않았고, 이 문서 변경은 검토된 소스 스냅샷 이후의 상태 기록이다.
