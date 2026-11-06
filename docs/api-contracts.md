# API·데이터 계약 초안

**전체 상태: 제안. 제품 코드는 없으며 아래 이름은 설치된 API가 아닙니다.** Python 선택 외 API·지원 범위·비교·오류 정책은 팀이 채택하기 전까지 구현 계약으로 확정하지 않습니다. 런타임별 동기·비동기 표면은 ADR-0002에서 확정합니다.

## C-01. 화면 데이터 모델

표기상 타입은 의미 설명용이며 Python 버전·dataclass 채택을 결정하지 않습니다.

~~~text
VNode = VText | VElement
VText(text: str)
VElement(tag: str, attrs: dict[str, str | bool],
         properties: dict[str, str | bool],
         events: dict[str, callback], children: tuple[VNode, ...])
~~~

- 루트 함수는 VNode 하나를 반환합니다. 여러 형제는 div 등 요소로 감쌉니다. None·숫자·중첩 배열 자동 변환은 기본안에서 지원하지 않습니다.
- tag는 소문자 HTML 이름, children은 순서 있는 불변 시퀀스입니다.
- attrs는 class·id·title·type·aria-*·data-* 등을, properties는 현재 input value·checked를 표현합니다. 불리언 disabled는 속성 존재 여부로 처리합니다.
- 기본안의 input은 제어 입력입니다. text는 properties.value 문자열, checkbox는 properties.checked 불리언을 반드시 명시합니다. 해당 타입에 필요하지 않은 폼 property는 넣지 않습니다. 비제어 입력은 현재 미지원입니다.
- events는 click·input·change의 Python callback을 표현합니다. HTML on* 속성과 별개이며 DOM 읽기·History에는 포함하지 않습니다.
- 지원 제안: div·span·p·section·h1·h2·ul·ol·li·button·label·input(text/checkbox)·strong·em·br. input·br은 자식을 갖지 않습니다.
- 공백을 포함한 텍스트 노드는 보존합니다. 주석 등 요소·텍스트 외 노드는 UnsupportedInput으로 거절합니다. 주석을 조용히 생략하면 VNode 인덱스와 실제 childNodes 인덱스가 달라지므로 지원 범위에 포함하지 않습니다.
- style 문자열·URL 속성·script·iframe·SVG·사용자 정의 요소는 기본안에서 거절합니다. 허용 목록 밖 입력은 UnsupportedInput 오류입니다.
- attrs 허용 목록은 id·class·title·type·for·disabled·aria-*·data-*입니다. type은 input에서 text/checkbox만 허용합니다. on*와 임의 객체 값은 거절합니다.
- 입력 dict는 생성 시 복사하고, committed_tree·History는 외부에서 수정할 수 없게 취급합니다. callback은 복사할 값이 아니라 런타임 참조입니다.

채택 시 허용 태그·속성은 단일 정책에서 검증하고 중복 목록을 만들지 않습니다. key는 현재 미지원이며 일반 attr로 흘려보내지 않습니다.

## C-02. DOM 읽기

~~~text
read_dom(node) → VNode
capture(container) → container의 유일한 관리 자식에 대한 VNode
~~~

- 읽을 때 DOM을 변경하지 않습니다. container 자체는 화면 트리에 포함하지 않습니다.
- 초기 실제 영역과 테스트 영역 모두 관리 자식 하나를 가져야 합니다. 루트 삭제·여러 루트는 명시적 오류입니다. 관리 루트 바깥의 들여쓰기 텍스트도 추가 자식이므로 샘플 DOM은 container의 childNodes가 정확히 하나가 되도록 생성합니다.
- input은 HTML 초기 value 속성이 아닌 현재 property를 읽습니다. text는 value, checkbox는 checked를 properties에 넣습니다. value·checked를 attrs와 중복 저장하지 않습니다.
- listener와 Python callback은 DOM에서 복원하지 않습니다. Phase 1은 events 없는 구조만 취급합니다.
- 미지원 태그·속성은 경로와 이유를 포함한 오류를 냅니다. 공백을 임의 trim하지 않습니다.
- 소스 편집을 선택한다면 실행 가능한 DOM에 원문을 먼저 삽입하지 않습니다. 입력의 비실행 파싱·허용 목록 검증·안전한 노드 생성 경로를 먼저 정의해야 합니다.

## C-03. 최초 생성과 이벤트

~~~text
create_dom(vnode, adapter) → node
~~~

텍스트는 텍스트 노드로 생성합니다. HTML 문자열로 실행하지 않습니다. attrs·properties·events는 각각의 경로로 적용합니다.

이벤트 callback은 adapter가 전달하는 EventData(type, value, checked)를 받습니다. value·checked가 해당하지 않으면 None입니다. 기본안은 raw DOM event의 전체 API를 노출하지 않습니다. preventDefault·event propagation 확장은 별도 계약이 필요합니다.

등록된 브리지 참조는 adapter가 소유하며 제거·교체·unmount 때 해제합니다. Phase 2의 VNode에서만 이벤트를 생성하고, Phase 1 History는 이를 저장하지 않습니다.

## C-04. Diff와 경로

~~~text
diff(old: VNode, new: VNode) → tuple[Patch, ...]
path: 관리 자식 루트를 ()로 하는 자식 인덱스 튜플
~~~

Diff는 순수 함수입니다. 입력을 바꾸지 않고 새 DOM·시간·전역 상태에 의존하지 않습니다.

| 변경 | 조건 | 연산 초안 |
| --- | --- | --- |
| 추가 | 새 자식이 존재 | InsertChild(parent_path, index, subtree) |
| 삭제 | 이전 자식만 존재 | RemoveNode(path) |
| 종류 교체 | 텍스트/요소 또는 tag 다름 | ReplaceNode(path, subtree) |
| 텍스트 | 텍스트 값 다름 | SetText(path, text) |
| 속성 등 | 같은 tag의 attrs·properties·events 차이 | SetAttr/RemoveAttr/SetProperty/SetEvent/RemoveEvent |

이 다섯 분류는 원본 문서의 미지정 목록에 대한 제안이며, 원본의 정확한 의도라고 확인된 것은 아닙니다.

자식은 공통 인덱스를 먼저 재귀 비교합니다. 같은 부모의 남은 삭제는 뒤에서 앞으로, 추가는 낮은 인덱스부터 적용합니다. 종류 교체가 발생한 하위 경로는 따로 순회하지 않습니다. Diff가 생성한 순서대로 Patch를 적용하며 정렬·그룹화로 순서를 바꾸지 않습니다.

동일한 구조·속성·property·event 참조라면 빈 목록입니다. 매 렌더 새 callback은 이벤트 교체를 만들 수 있지만 텍스트·요소 교체의 이유는 아닙니다.

## C-05. Patch·오류·신뢰 경계

~~~text
apply_patches(container, patches, target_tree, adapter) → 성공 확인
~~~

- 경로는 요소만이 아니라 텍스트도 포함하는 childNodes 기준입니다.
- container 바깥의 부모나 형제를 수정할 수 없습니다.
- 목록 전체의 연산·입력 정책과 확인 가능한 경로를 변경 전에 검증합니다.
- 이전 attrs에만 있는 값은 실제로 제거합니다. property 제거 시 value는 빈 문자열, checked는 false로 초기화합니다.
- 이벤트 교체는 이전 listener 해제 후 새 listener 등록입니다. 중복 누적하지 않습니다.
- 구조 Patch 뒤에는 target_tree의 제어 input을 순회하고 실제 DOM property가 목표와 다를 때만 동기화합니다. 사용자가 입력한 뒤 VNode 값이 그대로라면 Diff가 비어 있어도 현재 value·checked를 목표 값으로 복원합니다. 사용자 입력은 이벤트 handler가 State에 반영해야 유지됩니다.
- 이 property 동기화는 순수 Diff와 별개인 commit 책임입니다. 정상 동작에서도 전체 제어 입력 순회 비용이 추가되며, 실제 DOM이 이미 목표와 같으면 쓰지 않습니다.
- 루트 전체 innerHTML 재대입으로 부분 갱신을 대체하지 않습니다. 최초 생성·종류 교체는 해당 범위의 새 노드를 만들 수 있습니다.
- 외부 코드의 관리 DOM 변조를 자동 지원하지 않습니다. 감지한 경로·종류 불일치는 DomMismatch 오류로 처리합니다.

오류 분류 초안: InvalidVNode, UnsupportedInput, LifecycleError, HookOrderError, RenderError, DomMismatch, CommitError, EffectError. 실제 Python 예외 계층은 구현 시 최소한으로 결정합니다.

commit 중 실패하면 일부 DOM이 이미 바뀔 수 있습니다. 루트를 BROKEN으로 표시하고 추가 update·History 기록·Effect 실행을 중단합니다. 오류를 표시하고 unmount 후 초기 상태로 새 루트를 만드는 복구를 제공합니다. 완전 rollback은 보장하지 않습니다. 브라우저 연결의 비동기 성공 응답 전에는 성공 트리를 승격하지 않습니다.

## C-06. Phase 1 History

~~~text
initialize(snapshot), push(snapshot), back(), forward()
snapshots: 구조 VNode 시퀀스 / cursor: 현재 적용 위치
~~~

- 최초 실제 영역에서 읽은 트리를 index 0에 저장합니다.
- 정상 Patch 완료 후 새 구조가 다르면 독립 스냅샷을 추가합니다. 동일 상태 Patch는 새 이력을 만들지 않습니다.
- 과거 위치에서 새 Patch가 성공하면 앞으로 이력을 버리고 새 분기를 추가합니다.
- 경계에서 이동은 무변경이며 해당 버튼을 비활성화합니다.
- 이동 자체는 새 이력을 만들지 않습니다. 실제 영역과 테스트 영역 모두 성공한 후 cursor를 옮깁니다.
- 수정 중인 테스트 영역에서 뒤로·앞으로를 누르면 미적용 편집을 버리고 대상 이력으로 교체합니다. UI에 이를 표시합니다.
- 한쪽 갱신 실패 시 cursor를 유지하고 편집을 중단합니다. 양쪽을 현재 스냅샷으로 재초기화한 뒤 재개합니다.
- 함수·DOM 참조·Hook 상태·포커스·커서·스크롤은 저장·복원 대상이 아닙니다.

## C-07. FunctionComponent·Hook 문맥

~~~text
FunctionComponent(render_fn, props, container, adapter)
mount() / update() / unmount()
render_fn(props) → VNode
~~~

단일 루트만 지원합니다. hooks 배열과 현재 hook_cursor, committed_tree, lifecycle 상태를 보관합니다.

- mount는 NEW에서만, update는 MOUNTED에서만 가능합니다. unmount는 자원 정리를 위해 BROKEN에서도 허용하고 반복 호출은 무변경입니다.
- render_fn은 루트에서만 Hook을 사용합니다. 자식은 props로 호출하는 순수 함수입니다.
- 컴포넌트 렌더 중 child-call 문맥을 구분할 helper 또는 명시적 호출 규칙이 필요합니다. 루트 밖 호출은 오류로 하고, 자식 Hook 금지는 테스트·검토로도 확인합니다. 일반 Python 함수의 호출자만으로 완전 강제한다고 주장하지 않습니다.
- 각 렌더에서 cursor를 0으로 설정하고 State·Effect·Memo가 같은 배열의 한 슬롯씩 소비합니다.
- 첫 성공 렌더 뒤 슬롯 수·종류가 달라지면 HookOrderError입니다. 최초 렌더에서는 배열을 구성합니다.
- 렌더 중 setter·DOM 변경·외부 작업을 금지합니다. 예외 시 현재 Hook 문맥을 finally로 해제합니다.
- unmount는 저장된 cleanup과 listener·브리지 참조를 정리하고 관리 자식을 제거합니다. 하나의 cleanup 오류 때문에 나머지 정리를 생략하지 않습니다.
- unmount는 정리 전에 DISPOSING 상태로 바꿉니다. 정리 중 update·setter·mount는 LifecycleError이며 렌더하지 않습니다. 정리 오류를 모아 보고하더라도 수명은 UNMOUNTED로 종료합니다.

## C-08. useState

~~~text
use_state(initial_value) → (current_value, set_value)
set_value(next_value_or_updater) → None
~~~

외부 요구 명칭 useState와 Python 표기 use_state의 최종 export 이름은 구현 시 명시합니다. 이 문서의 snake_case는 Python용 제안이며 두 이름의 중복 API를 약속하지 않습니다.

- 초기값은 슬롯 최초 생성에만 사용합니다. 지연 initializer는 기본안에서 미지원입니다.
- setter는 해당 루트·슬롯에 묶이고 identity가 안정적입니다.
- updater 함수를 받으면 저장된 최신 값을 입력으로 한 번 계산합니다. 상태 자체에 함수를 저장하는 기능은 기본안에서 제외합니다.
- 상태는 외부에서 제자리 변경하지 않고 새 값으로 전달합니다. 변경 알림 없이 dict·list를 수정해도 자동 감지하지 않습니다.
- C-11에서 같은 값이면 갱신하지 않습니다. 다르면 저장하고 update를 요청합니다.
- 일반 이벤트의 setter는 동기 갱신을 요청합니다. 두 setter는 각각 갱신할 수 있으며 자동 batching은 없습니다.
- 현재 이벤트 handler가 받은 기존 값 자체가 재할당되지는 않습니다. updater는 슬롯 최신 값을 보므로 연속 증가를 표현할 수 있습니다.
- 렌더 중 setter는 오류, unmount 뒤 setter는 LifecycleError입니다.
- Effect 처리 중 setter는 State를 즉시 덮지 않고 현재 cleanup/setup 시도별 큐에 요청을 기록합니다. 성공한 시도의 요청만 현재 Effect 묶음 종료 후 순서대로 적용하고, 실패한 시도의 요청은 버립니다. updater는 실제 적용 시 최신 값을 봅니다. 재귀 render로 진입하지 않습니다. 반복 update 제한·진단은 구현 전 결정 항목이며 무한 루프를 지원 동작으로 취급하지 않습니다.

## C-09. useEffect

~~~text
use_effect(setup, deps=None) → None
setup() → cleanup 함수 또는 None
~~~

| deps | 실행 계약 초안 |
| --- | --- |
| None 또는 생략 | 매 성공 commit 뒤 |
| 빈 tuple | mount 성공 뒤. 재mount는 새 수명 |
| 고정 길이 tuple | 최초와 C-11 기준으로 하나라도 달라진 commit 뒤 |

렌더 중 Effect를 실행하지 않고 후보를 기록합니다. 한 슬롯의 이전 cleanup → 새 setup을 마친 뒤 다음 Hook 슬롯으로 이동합니다. 모든 cleanup을 먼저 모아서 실행하는 방식은 아닙니다. unmount 때에는 남은 cleanup만 Hook 순서로 실행합니다.

Effect 오류가 나도 이미 성공한 DOM commit을 되돌리지 않습니다. 다른 슬롯은 계속 처리하고 오류를 모아 보고합니다. 성공한 setup의 deps·cleanup과 이번 시도의 deps·실패 상태를 구분합니다.

- cleanup 실패: 해당 슬롯의 새 setup은 생략하고 cleanup 참조를 보존합니다. 다음 명시적 갱신의 성공 commit에서 cleanup을 재시도한 뒤 최신 setup을 실행합니다.
- setup 실패: 성공 deps로 승격하지 않고 실패 슬롯으로 표시합니다. 다음 명시적 갱신의 성공 commit에서 deps가 같아도 setup을 다시 시도합니다.
- 실패만으로 자동 update를 요청하지 않습니다. 실패한 시도에서 들어온 setter 요청은 폐기하고 오류 기록에 표시합니다. 성공한 슬롯에서 들어온 요청만 Effect 묶음 이후 처리합니다.
- 실패한 setup이 예외 전에 만든 부분 자원은 setup 작성자가 안전하게 정리해야 합니다. 반환되지 않은 cleanup을 라이브러리가 추측할 수는 없습니다.
- unmount는 남아 있는 cleanup을 한 번씩 시도하고 오류를 보고한 뒤 참조를 해제합니다. 자원 해제 실패가 없었던 것처럼 기록하지 않습니다.

이 구현은 성공 commit 직후 동기 flush를 제안합니다. 항상 paint 뒤라는 뜻은 아니며 실제 React 스케줄링 전체와 동일하지 않습니다.

## C-10. useMemo

~~~text
use_memo(factory, deps: tuple) → value
~~~

factory는 순수 함수이며 렌더 중 계산합니다. 최초 또는 의존성이 바뀌면 재계산하고, 같으면 저장 결과를 반환합니다. deps 생략·None은 InvalidVNode가 아니라 API 인자 오류로 거절합니다. 빈 tuple은 해당 mount 수명에서 재사용합니다.

계산 실패 시 실패한 결과·의존성으로 캐시를 갱신하지 않습니다. 캐시가 없어도 정확한 UI를 계산해야 합니다. 외부 구독·상태 보존을 Memo에 맡기지 않습니다.

## C-11. Python 값·의존성 비교

React의 Object.is를 Python의 == 또는 is 하나와 동일하다고 설명하지 않습니다. 다음은 Python용 단순화 초안입니다.

- type이 다르면 다릅니다. True와 1을 같다고 취급하지 않습니다.
- None·bool·int·str은 같은 타입의 값으로 비교합니다.
- float은 NaN끼리 같게, +0.0과 -0.0은 다르게 처리하고 나머지는 값 비교합니다.
- list·dict·tuple·함수·사용자 객체는 동일 객체인지로 비교합니다. 임의 사용자 __eq__는 호출하지 않습니다.
- 의존성 tuple은 각 원소를 위 규칙으로 비교합니다. 전체 tuple의 identity로 비교하지 않습니다.
- 한 Hook의 deps 모드(None/tuple)·tuple 길이는 최초 이후 바꾸지 않습니다. 변경하면 인자 오류입니다.
- 가변 객체를 제자리 변경하면 같은 객체로 인식합니다. 의존성에는 변경을 표현하는 새 객체나 원시 값을 사용해야 합니다.

Python int 범위·객체 모델은 JavaScript와 다르므로 이 규칙도 완전한 Object.is 호환을 의미하지 않습니다. 채택 시 NaN·부호 있는 0·True/1·새 list·동일 list·부작용 있는 __eq__ 테스트가 필요합니다.

## 구현 전 남은 계약

런타임의 실제 동기·비동기 함수 표면, callback proxy 해제 API, 최종 exports, 자식 Hook 위반 감지 수준, Effect 갱신 루프 제한은 실행 구조 실험 후 결정합니다. 이 항목을 결정하지 않은 채 전체 API가 구현 준비 완료라고 표시하지 않습니다.
