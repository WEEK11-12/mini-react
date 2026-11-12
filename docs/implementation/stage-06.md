# 6단계: 루트 전용 useState와 업데이트 예약

> 이 문서는 해당 단계 당시의 구현·검토 기록이다. 아래의 미구현·미검증·제한 승인은 당시 범위이며 현재 잔여 작업 목록이 아니다. 최신 종결 판정과 범위 밖 항목은 [최종 검증 기록](stage-10.md)을 따른다.

상태: 루트 전용 State·업데이트 예약 범위의 구현·기본 점검 및 검증 에이전트 제한 재검토 승인 완료. useEffect·useMemo·Phase 2 시연이나 전체 suite 승인은 별개다.

## 범위

[5단계](stage-05.md)의 컴포넌트 실행에 [STA-01~03](../requirements.md#sta), [COMP-03](../requirements.md#comp-03), [TECH-05~06](../requirements.md#tech-05)을 연결한다. [Hook 설계](../design/hooks.md#usestate)와 [컴포넌트 업데이트 규칙](../design/component-runtime.md#업데이트-실행-규칙)의 임시 결정을 전제로 한다. 루트 Hook 호출 순서·개수 검사, 자식 Hook 거부, 성공한 DOM 반영 후 State 확정, 동기 setter와 커밋 중 요청의 순차 처리, 무효화된 setter와 연속 갱신 상한을 포함한다. useEffect·useMemo 및 Phase 2 시연은 후속 단계다.

## 변경

- `src/core/hooks.ts`: 루트/자식 렌더 문맥과 State 슬롯·setter 제공.
- `src/core/component.ts`: candidate State, 세대 무효화, 요청 대기열과 성공 후 커밋.
- `src/core/vdom.ts`: 자식 함수 실행 중 Hook 사용 제한.
- `tests/runtime/stage-six-implementation.test.ts`: 렌더 실패 후 State·DOM 보존과 성공 갱신의 DOM 재사용 확인.
- `README.md`: 6단계 기록 링크와 구현·검증 상태 갱신.

## 자체 점검

`tests`에서 `npm run typecheck:core`, `npm run typecheck` 및 `npm run test -- runtime/stage-six-implementation.test.ts`를 실행해 각각 exit 0(스모크 1개 통과)을 확인했다. 루트에서 `npm run build`와 `git diff --check`도 exit 0이다. 전체 단위·브라우저·회귀 검증과 최종 승인은 검증 에이전트 담당으로 미실시다.

## 남은 범위

useEffect·useMemo·Phase 2 시연이 남았다. stage-06의 State·업데이트 예약 범위는 검증 에이전트가 제한 재검토로 승인했다. OPEN 정책은 확정하지 않았으며 커밋·푸시·배포하지 않았다.

## 검증 에이전트 최초 검토와 수정

최초 검토는 수정 요청이었다. 독립 단위 23개 중 21개 통과·2개 실패, Chromium 24개 중 23개 통과·1개 실패였다. 3개 실패는 직접 `update()`로 시작한 연쇄에서 최초 갱신을 50회 제한에 포함하지 않아 51번째까지 커밋하는 동일 원인이었다. 기존 생명주기·렌더러·History·하네스 회귀 357개, 기존 State 계약 선택 실행 10개는 통과했고 후자의 필터 제외 46개는 미실행이다.

`src/core/component.ts`에서 idle 직접 `update()`의 최초 성공 갱신을 대기열 처리의 카운터에 포함하도록 수정했다. 최초 mount와 setter의 기존 진입 규칙은 유지했다. 수정 후 영향받는 `npm run typecheck:core`와 `git diff --check`를 각각 exit 0으로 확인했다.

### 제한 재검토 승인

검증 에이전트가 F1과 직접 인접 경계를 승인했다. 단위 선택 실행 12개 통과(수집 27개 중 필터 제외 15개), 실제 Chromium 11개 통과, 신규 검증 코드 `npm run typecheck` exit 0이다. State/Props 갱신 50회는 성공하고 51번째 및 무한 연쇄는 50회에서 중단된다. 초기 mount 제외, 혼합 요청 FIFO, 오류 후 다음 독립 갱신도 확인했다. 최초 검토에서 통과한 회귀 357개·선택 State 계약 10개·다른 브라우저 검사는 재실행하지 않았으므로 이번 통과 수에 합산하지 않는다. 전체 suite와 Phase 2 앱 흐름도 미실행이다.

보고서·원본 runner JSON·SHA-256 manifest는 검증 에이전트의 저장소 외부 임시 작업 디렉터리에 보관했다. 파일명은 `report.txt`, `review-summary.json`, `rereview-report.txt`, `rereview-summary.json`, `rereview-unit.json`, `rereview-chromium.json`, `rereview-product-source-sha256-after.json`이다. 구현 에이전트가 원본 결과 상태를 집계하고 manifest의 13개 제품 소스 해시를 현재 트리와 대조해 일치를 확인했다. 승인된 `src/core/component.ts` 해시는 `748e6adcf51cce16916da9968d296ad0163ce675b7e425a5bcb77cdee0635e53`이다. 승인 이후 제품 소스는 수정하지 않았다. 이 승인 기록과 README만 이후 갱신했으므로 두 문서는 검토 시점 문서 스냅샷과 다르다.

검증 에이전트가 추가한 파일은 `tests/runtime/review/stage-six-review.test.ts`, `tests/runtime/review/stage-six-rereview.test.ts`, `tests/browser/review/stage-six-review.spec.ts`, `tests/browser/review/stage-six-rereview.spec.ts`, `tests/support/stage-six-review-cases.ts`, `tests/support/stage-six-rereview-cases.ts`, `tests/support/stage-six-review-entry.ts`다.
