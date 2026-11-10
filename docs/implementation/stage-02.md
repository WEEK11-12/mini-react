# 2단계: VNode Diff 알고리즘

상태: 2단계 Diff 구현·기본 타입 점검 완료, 검증 에이전트 테스트·브라우저·회귀·최종 검토 승인. 승인은 Diff 계획 생성 범위에 한정하며 후속 Patch나 전체 프로젝트 완료를 뜻하지 않는다.

## 범위

[DIFF-01](../requirements.md#diff-01), [DIFF-02](../requirements.md#diff-02), [DIFF-03](../requirements.md#diff-03)의 비교·계획 생성을 `src/core/diff.ts`에 구현했다. 단계 구분은 [1단계 기록](stage-01.md)을 따르며, 증분 `applyPlan`은 3단계에 남긴다. [검증 계획](../design/verification.md#구현-순서)의 큰 구현 묶음과 달리 이번 2단계는 Diff만 포함한다.

[렌더러 계약](../design/renderer.md#diff-전략)의 `NodePlan`, `ChildPlacement`, `ChildrenPlan`, `PatchPlan`을 named export한다. `diff(previous, next)`는 기존 `validateRoot`의 component 모드로 양쪽 전체 트리를 검증하고, 논리 VDOM만 비교한다. [OPEN-01](../requirements.md#open-01)·[OPEN-09](../requirements.md#open-09)의 지원 범위·오류 정책은 기존 임시 선택을 전제로 하며 결정 상태를 바꾸지 않았다.

## 알고리즘

- 부모별 이전 key → 인덱스 Map을 만들고 다음 자식 순서로 계획을 구성한다. key를 정규화하거나 전역 검색하지 않는다.
- unkeyed 요소·텍스트는 keyed 요소와 공백 텍스트를 포함한 전체 배열의 같은 이전 인덱스가 unkeyed일 때만 대응한다.
- 대응이 없으면 create, kind/tag가 다르면 replace, 재사용 가능하면 keep/text/element 계획을 만든다. 소비하지 않은 이전 인덱스는 remove에 남긴다.
- attrs·domProps·events는 비열거 own 이름까지 순서와 무관하게 비교한다. 속성·프로퍼티 값과 이벤트 함수 참조를 비교하며 핸들러를 실행하지 않는다.
- 자식 변경과 위치 변경을 함께 집계한다. keep은 내용이 같다는 뜻이며 이동 여부와 별개다. 의미상 동일한 트리도 ordered에는 대응 항목이 남는다.
- previous/next 참조는 계획에 보존하며 입력 트리를 수정하지 않는다. DOM·DOMScope·History에는 접근하지 않는다. 계획의 수명 동안 입력을 불변으로 유지해야 한다.

최소 이동 횟수·LIS 최적화·새 의존성은 추가하지 않는다. 실제 DOM 보존·폼 보정·이벤트 반영·계획 적용 검증은 후속 Patch 범위다.

## 검증

구현 에이전트는 `tests` 디렉터리에서 아래 기본 타입 검사만 실행했다.

| 명령 | 결과 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run typecheck:core` | exit 0 |

테스트 실행·브라우저·회귀·최종 검토는 검증 에이전트가 담당했다. 구현 에이전트는 중복 실행하지 않고 최종 보고서·실제 runner JSON의 집계와 승인 대상 소스 해시 일치를 확인했다.

| 검증 에이전트 검사 | 결과 |
| --- | --- |
| 기존 Diff 계약 | exit 0, 21/21 통과 |
| 추가 Diff 경계조건 | exit 0, 37/37 통과 |
| 1단계 단위 회귀 | exit 0, 107/107 통과 |
| 추가 테스트 포함 `npm run typecheck` | exit 0 |
| 실제 Chromium: 1단계 회귀 1개 + Diff 2개 | exit 0, 3/3 통과, skip/flaky 없음 |
| 전체 Vitest | exit 1, 313개 중 177개 통과·136개 실패 |

전체 실패는 `applyPlan` 미구현 61개, History 미구현 19개, Component 미구현 56개다. 이번 Diff 및 1단계 회귀 실패는 없으며 전체 테스트 통과로 표시하지 않는다. 앱 UI 브라우저 28개는 이번에 실행하지 않았다.

추가 테스트는 `tests/renderer/diff-boundaries.test.ts`, `tests/browser/stage-two.spec.ts`, 실제 src export만 노출하는 `tests/support/stage-two-entry.ts`다. 중첩 oldIndex 완전분할, 부모 경계, 비열거 own 맵, 이벤트 추가·삭제, 입력 검증·불변성과 DOM 미접근을 확인한다. 브라우저는 실제 폼 입력 → readDOM → diff 및 DOM 없는 Worker 실행을 검사하며 가짜 Patch·앱을 사용하지 않는다.

재현 명령은 `tests`에서 실행한다.

```sh
npm test -- renderer/diff.test.ts renderer/diff-boundaries.test.ts
npm run test:stage-one
npm run test:browser -- browser/stage-one.spec.ts browser/stage-two.spec.ts
npm test
```

최초 브라우저 실행은 상속된 브라우저 경로의 실행 파일 부재로 실패했다. 최종 성공 실행은 설치된 동일 revision을 사용하도록 macOS 사용자 홈의 Playwright 캐시를 해당 명령에만 지정했다. 사용자 계정명에 의존하지 않는 표기는 `PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright"`다. 저장소 설정을 변경하거나 브라우저를 새로 설치하지 않았다.

검증 에이전트의 최종 승인 보고서 `mini-react-stage-two-final-review.md`와 실제 runner JSON·로그 `mini-react-stage-two-*` 산출물은 저장소 외부 임시 작업 디렉터리에 있으며 이 저장소에는 포함되지 않는다. 승인 대상 `src/core/diff.ts`의 SHA-256은 `eb08dae659469a7e94b7d4eb637b1b697f040173b72c4324839fcd8493f0013b`이며 승인 이후 제품 코드를 수정하지 않았다.

## 남은 범위

`applyPlan`, 앱 UI, History, FunctionComponent와 Hook은 구현하지 않았다. 실제 DOM 이동·부분 쓰기·폼 보정·이벤트 적용은 3단계에서 검증해야 한다. Firefox/WebKit·매우 깊은 트리의 스택/성능 한계·악의적인 getter/Proxy 입력 및 ESLint/Prettier는 검증하지 않았다. 커밋·푸시·배포하지 않았다.
