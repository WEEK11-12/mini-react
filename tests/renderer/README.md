# Renderer 계약 테스트

[요구사항](../../docs/requirements.md), [렌더러 설계](../../docs/design/renderer.md), [전체 구조](../../docs/design/architecture.md), [임시 결정](../../docs/design/temporary-decisions.md), [검증 계획](../../docs/design/verification.md)을 대상으로 한다. 생산 코드는 생성하지 않는다.

## 실행과 RED

Vitest + jsdom 설정과 `tests/support/project.ts`는 상위 테스트 작업에서 제공한다. 각 테스트 또는 `beforeEach`에서 다음 공통 로더를 호출한다.

```ts
import { projectModule } from '../support/project';
// projectModule<T>(path: string): Promise<T>
```

로더의 경로는 `src/` 기준이다. 모듈이 없으면 로더의 명시적 Error로 각 테스트가 RED가 되어야 한다. 정적 SUT import, mock 구현, skip, todo, source-reading 검증은 사용하지 않는다. 이 폴더의 `fixtures.ts`는 리터럴 트리·타입·DOM fixture만 제공하며 정규화·Diff·Patch·scope 알고리즘을 대신 구현하지 않는다.

최초 작성 당시 이 하위 작업은 실행을 담당하지 않았다. 현재 전체 Vitest·Chromium 실행 결과는 [테스트 안내](../README.md)와 [최종 검증 기록](../../docs/implementation/stage-10.md)을 따른다. 작성 당시 상태와 현재 통과 범위를 구별한다.

## API 바인딩 전제

모든 함수는 named export이며 설계의 인자 순서를 사용한다.

| 로더 경로 | exports |
| --- | --- |
| `core/vdom.ts` | `validateRoot(root, mode: 'html' \| 'component'): void` |
| `core/dom-reader.ts` | `readDOM(container: Element \| DocumentFragment, scope?): VRoot` |
| `core/diff.ts` | `diff(previous, next): PatchPlan` |
| `core/patch.ts` | `mountTree(container, tree, scope): void`, `applyPlan(container, plan, scope): void` |
| `core/dom-bindings.ts` | `createDOMScope(container): DOMScope`, `releaseDOMScope(scope): void` |

**scope API를 `core/dom-bindings.ts`에 배치한다는 것은 이 테스트의 명시적 바인딩 가정**이다. DOMScope는 불투명 객체로 취급하며 이름공간 문자열이나 내부 저장 구조를 검사하지 않는다. 향후 실제 export 위치가 달라지면 바인딩만 조정하고 의미 계약은 유지한다.

- 로컬 타입은 문서에 나온 구조적 계약이며 SUT의 타입 구현을 대체하지 않는다. `validateRoot`의 로컬 입력은 잘못된 런타임 값을 검사하기 위해 `unknown`으로 넓혀 두었다. 검증을 타입 단언으로 우회하지 않는다.
- `readDOM`은 검증·정규화된 `VRoot`를 반환한다. HTML 모드 스냅샷의 events는 비어 있으며 이벤트 함수를 복원하지 않는다.
- mount/apply는 동기 API이며 유효하지 않은 전체 트리·계획은 예외로 거부한다. 오류 문구·오류 클래스는 고정하지 않는다.
- `PatchPlan`은 문서의 계층형 `ordered/remove`, `reuse/create/replace`, `keep/text/element` 구조를 따른다. 계획 검사는 이 공개 계약만 확인하며 key 탐색 알고리즘·최소 이동 수를 강제하지 않는다.
- `mountTree`는 빈 컨테이너에 사용한다. scope 해제 전에는 정상 Patch로 빈 트리를 적용하여 바인딩과 관리 DOM을 먼저 정리한다. `releaseDOMScope`가 살아 있는 DOM을 대신 비운다는 해석을 하지 않는다.

## 파일별 범위

| 파일 | 핵심 검증 |
| --- | --- |
| `dom-reader.test.ts` | 중첩·빈 root·빈 텍스트·공백 순서, DocumentFragment, data-key 정확한 문자열, 현재 폼 값, 기본값, 미지원 DOM 거부·원본 보존 |
| `validation.test.ts` | key 값/유일성/형제 범위/예약 속성, ID·label·ARIA 검증, 미지원 host 필드·폼 중복 값, HTML/component 이벤트 경계 |
| `diff.test.ts` | 의미상 동일성, key 정렬, 생성·제거·교체, 전체 인덱스 unkeyed fallback, attrs·텍스트·폼·이벤트 참조 비교, frozen 입력 보존 |
| `patch.test.ts` | 생성 및 목표 결과, Text·부모·형제 정체성, key 삽입/삭제/정렬/부모변경/재등장, 동시 변경, 무변경 DOM 쓰기 없음, 폼 보정, 이벤트 교체·해제·이동 |
| `prevalidation.test.ts` | oldIndex 중복/범위/정수/누락, remove 중복/겹침/범위, ordered 길이, 하위 계획 오류의 전체 사전검증, 잘못된 key·ID·속성의 원본 DOM 및 이벤트 보존 |
| `dom-scope.test.ts` | 두 영역 ID 격리·논리 왕복, label.control, 모든 지원 ARIA 참조, 일반 문자열 비변환, 목록 공백 정규화, ID 변경 왕복/인코딩 일대일성, 컨테이너 소유권·중첩 금지·해제 후 금지 |

## 정책과 검증 경계

- `[임시 OPEN-01]`: 지원 HTML/속성/폼/이벤트, ID 및 ARIA 범위에 의존한다. `[임시 OPEN-09]`: 검증 실패의 적용 중단·기존 상태 보존을 전제로 한다. 이 표기는 작성 당시 출처이며 현재 OPEN-01·09도 요구사항에 채택했다. key 기반 대응과 무변경 의미 비교는 기존 채택을 유지한다.
- 무변경 검사는 MutationObserver에 더해 DOM 이동/속성 쓰기, 폼 setter 및 이벤트 바인딩 계측을 사용한다. 폼 현재값이 다르면 `hasChanges=false`여도 보정해야 하므로 이 사례를 별도로 검사한다.
- DOM 결과 문자열만 비교하지 않는다. 기존 노드 참조는 `support/observations.ts`의 길이+인덱스별 `toBe`로 검사한다. DOM 배열의 `toEqual`은 구조가 같은 복제를 구별하지 못하므로 정체성 판정에 사용하지 않는다. VDOM 구조·ID 문자열·이벤트 호출 기록의 구조 비교는 유지한다.
- 서로 다른 객체/속성 열거 순서의 동등 트리에도 폼·같은 이벤트 함수 참조를 포함해 무쓰기 검사를 수행한다. 동일 내용 reuse의 내부 NodePlan을 반드시 `keep`으로 표현할 것을 강제하지 않고 공개 대응·목표 트리·최종 결과 계약을 검사한다.
- 역변환 실패는 label/ARIA가 없는 단독 `p[id]`로 검사한다. 참조 역변환은 외부 실제 ID를 현재 트리의 유효한 논리 대상 ID로 사용하는 별도 fixture로, 단순 대상 누락 오류가 잘못된 pass-through를 가리지 않도록 한다.
- 분리된 노드의 이벤트 호출 여부와 frozen VDOM도 함께 검사한다. 입력 불변 검사를 위한 JSON은 이벤트 함수를 비교하는 기준으로 사용하지 않는다.
- jsdom의 label.control 검사와 실제 브라우저의 label 클릭 기본 동작은 별개다. Playwright의 클릭/포커스/선택 영역 검증은 상위 브라우저 테스트 범위다.
- HTML serializer·History·Hook·컨트롤러 API는 이 폴더 범위 밖이다. 여기서의 왕복은 DOMScope 생성 → readDOM → Diff/Patch 왕복이며 HTML 직렬화 또는 실제 History 저장까지 검증했다고 주장하지 않는다.
- 예기치 않은 DOM 적용 중간 예외의 완전 원자성은 요구하지 않는다. 여기서 원본 불변을 요구하는 오류는 문서에 명시된 사전 검증 오류다.
