# 3단계: 변경분만 실제 DOM에 반영하는 Patch

상태: 3단계 Patch 구현·기본 타입 점검 및 검증 에이전트 최종 재검토 승인 완료. 승인은 이번 증분 Patch 범위에 한정하며 전체 프로젝트·전체 suite 통과를 뜻하지 않는다.

## 범위

[2단계 기록](stage-02.md)의 후속 증분 `applyPlan`을 구현한다. [PATCH-01](../requirements.md#patch-01), [PATCH-02](../requirements.md#patch-02), [PATCH-03](../requirements.md#patch-03) 및 [렌더러 계약](../design/renderer.md#계획-적용-순서)을 따른다. 검증 계획의 큰 묶음과 달리 이번 범위에는 UI·History·Component·Hook을 포함하지 않는다. OPEN-01·OPEN-09의 지원 범위와 오류 정책은 기존 임시 선택이며 확정 상태로 바꾸지 않는다.

## 변경

- `src/core/patch.ts`: 초기 생성 코드를 새 노드 준비와 공유한다. Diff를 다시 계산해 입력 계획의 전체 대응·인덱스·내용을 검증하되 remove는 순서 없는 중복 없는 집합으로 비교한다. 전체 next 속성 이름을 네이티브 createAttribute로 사전 검증한 뒤 부모별 이전 childNodes를 확보한다. create/replace 노드는 모두 분리된 상태로 준비하고, 재사용 노드를 다음 순서에 배치하며 제자리에 있는 노드는 이동하지 않는다.
- 텍스트·인코딩된 attrs·data-key는 달라진 값만 쓴다. 삭제·교체 하위 트리의 이벤트를 회수하고 이동은 이벤트 해제로 취급하지 않는다.
- 마지막에 keep 하위 트리까지 폼 프로퍼티를 순회해 실제 값과 목표값이 다를 때만 보정한다.
- `src/core/dom-bindings.ts`: 실제 등록된 함수 참조를 기준으로 이벤트 추가·교체·삭제를 수행하고 scope 해제를 위한 등록 기록을 유지한다.

계획 검증은 기존 Diff 규칙과의 중복 구현을 피하려고 Diff 결과와 구조 비교한다. 추가 비교 비용은 있지만 최소 이동·LIS·새 의존성은 도입하지 않는다. 입력 트리와 계획은 적용 중 불변이어야 한다. 예상하지 못한 적용 예외는 전파하며 DOM 작업 전체 원자성은 보장하지 않는다. 준비 노드의 바인딩은 실패 시 회수한다.

## 자체 점검

구현 에이전트가 `tests`에서 실행했다.

| 명령 | 결과 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run typecheck:core` | exit 0 |

테스트 실행·브라우저·회귀·최종 검토는 검증 에이전트 담당이며 구현 에이전트는 실행하지 않았다. 기존 `tests/renderer/patch.test.ts`, `prevalidation.test.ts`, `dom-scope.test.ts`가 이번 변경의 직접 계약이다.

## 검증 에이전트 피드백

검증 에이전트의 최초 검토는 수정 요청이다. 보고서 `mini-react-stage-three-final-review.md`는 저장소 외부 임시 작업 디렉터리에 있으며 이 저장소에는 포함되지 않는다.

| 지적 | 수정 |
| --- | --- |
| F1: 뒤쪽 재사용 요소의 `data-\u0000` 이름 오류가 앞쪽 DOM 쓰기 후 발생 | 전체 next의 속성 이름을 네이티브 createAttribute로 사전 검사한다. 분리 Attr만 만들며 관리 DOM은 쓰지 않는다. |
| F2: remove 순서가 다른 유효 계획을 거부 | remove의 길이·유일성·집합 동등성을 검사하고 순서는 비교하지 않는다. 입력 배열은 변경하지 않는다. |
| F3: type 생략 button의 텍스트 변경 시 type 삭제·복구 | button 기본 type은 속성 삭제에서 제외하고 마지막 폼 보정에서 실제 값이 다를 때만 쓴다. |

최초 검토에서 기존 직접 계약 64/64, 추가 단위 8개 중 5개, 3단계 Chromium 7개 중 4개, 1·2단계 Chromium 회귀 3/3이 통과했다. 추가 단위·3단계 Chromium의 각 3개 실패는 위 F1~F3이다. 기존 전체 suite는 313개 중 238개 통과·75개 실패이며 실패는 후속 History 19개·Component 56개 미구현이다. 전체 통과로 표시하지 않는다.

구현 에이전트는 위 지적만 수정하고 `npm run typecheck`, `npm run typecheck:core`를 다시 실행해 각각 exit 0을 확인했다. 최초 전경 검토 프로세스는 상위 도구의 420초 제한으로 종료되어 같은 검증 에이전트 세션을 백그라운드로 재개했고, 실제 보고서를 수신했다. 테스트 실행은 검증 에이전트 소유이며 구현 에이전트가 중복 실행하지 않았다.

### 최종 재검토 승인

검증 에이전트는 F1~F3 해결 및 직접 영향 경계의 회귀 없음으로 3단계를 승인했다. 구현 에이전트는 아래 보고서를 읽고 실제 runner JSON을 직접 집계했으며, 승인 목록과 현재 src 전체 여섯 파일의 SHA-256이 정확히 일치함을 확인했다. 승인 이후 제품 코드를 수정하지 않았다.

| 검증 에이전트 재검토 | 결과 |
| --- | --- |
| 최초 반례·직접 영향 기존 계획 거부·no-op | 18개 통과, 무관한 39개는 이름 필터로 미선택 |
| 추가 제한 단위 경계 | 22/22 통과 |
| 최초 Chromium 반례 | 3/3 통과 |
| 추가 제한 Chromium 경계 | 10/10 통과 |
| 새 검증 파일 포함 tests 타입 검사 | exit 0 |

Chromium 두 실행 모두 skipped·unexpected·flaky는 0이다. 기존 전체 suite·기존 통과 회귀는 다시 실행하지 않았다. 앞의 최초 전체 suite 결과와 이번 제한 재검토를 구분한다. 앱 UI 흐름을 검증한 것이 아니라 실제 src를 번들한 라이브러리 검증이다.

재검토 보고서: 검증 에이전트의 저장소 외부 임시 작업 디렉터리에 보관된 `mini-react-stage-three-re-review.md`. 이 저장소에는 포함되지 않는다.

실제 runner JSON은 같은 디렉터리의 `mini-react-stage-three-re-review-original-and-rejection.json`, `mini-react-stage-three-re-review-focused-unit.json`, `mini-react-stage-three-re-review-original-browser.json`, `mini-react-stage-three-re-review-focused-browser.json`이며 재현 명령·로그·전체 소스 해시는 보고서에 있다. 승인 대상 `src/core/patch.ts`의 SHA-256은 `e9b37467c721f854c95b3634071cad13d9c8ed34c93e12b8f4e1f0832458357e`다.

검증 에이전트가 추가한 검증 파일은 `tests/renderer/stage-three-review.test.ts`, `tests/renderer/stage-three-re-review.test.ts`, `tests/browser/stage-three.spec.ts`, `tests/browser/stage-three-re-review.spec.ts`, 실제 src export 전용 `tests/support/stage-three-entry.ts`다.

## 남은 범위

UI·History·FunctionComponent·Hook은 후속 단계다. 브라우저 앱 흐름·Firefox/WebKit·악의적인 getter/Proxy·매우 깊은 트리와 성능 한계는 미검증이다. 예상치 못한 DOM 적용 오류의 전체 원자성은 설계상 보장하지 않는다. 커밋·푸시·배포하지 않았다.
