# FunctionComponent · Hook 계약 테스트

이 디렉터리는 구현 전 Vitest 테스트만 포함한다. 구현 코드·대체 런타임·Hook 모형은 만들지 않는다. 공통 실행 환경과 `tests/support/project.ts`는 부모 작업에서 제공한다.

## 실행 및 로딩 전제

- Vitest import API와 jsdom의 `document`, `Element`, 네이티브 `Event`를 사용한다.
- `beforeEach`에서 `projectModule<T>(path: string): Promise<T>`로 `core/component.ts`, `core/vdom.ts`, `core/hooks.ts`를 매 테스트마다 로드한다. 경로는 부모 로더의 논리 경로다.
- 미구현 모듈은 부모 로더에서 명시적인 실패를 발생시켜 각 테스트를 RED로 만든다. 존재하지 않는 production 파일의 정적 import, skip, todo, 실패를 성공으로 바꾸는 catch를 사용하지 않는다.
- named export `FunctionComponent`, `h`, `text`, `useState`, `useEffect`, `useMemo`를 전제로 한다. 테스트 파일 안에 structural API 타입을 선언하며 production 타입이나 `any`에 의존하지 않는다.
- [전체 구조](../../docs/design/architecture.md#주요-인터페이스)에 생성자 시그니처가 없으므로 **`new FunctionComponent(renderFn)`만으로 루트 함수를 바인딩**한다고 가정한다. 초기 Props와 컨테이너는 `mount(container, props)`, Props 갱신은 `update(nextProps)`, 기존 성공 Props 재사용은 `update()`로 전달한다. 생성자 API가 결정되면 바인딩 부분만 변경한다.
- `host()`는 실제 SUT `h/text`로 테스트 UI를 작성하고, `element()`는 DOM 존재를 확인한다. 두 지원 함수는 어떤 production 동작도 대신 구현하지 않는다.
- 실행·타입 검증 명령과 실제 결과는 부모 작업의 최종 검증 기록을 따른다. 이 하위 작업에서는 사용자 지시에 따라 테스트를 실행하지 않았다. 작성 완료를 테스트 통과로 표시하지 않는다.

## 검증 범위

| 범위 | 관찰하는 계약 |
| --- | --- |
| [COMP-01](../../docs/requirements.md#comp-01)~[COMP-03](../../docs/requirements.md#comp-03), [TECH-03](../../docs/requirements.md#tech-03)~[TECH-06](../../docs/requirements.md#tech-06) | 초기 mount, 빈/다중 루트, 자식 Props, 부분 DOM 객체 보존, 중복 mount·제거 후 update 거부 |
| [STA-01](../../docs/requirements.md#sta-01)~[STA-03](../../docs/requirements.md#sta-03) | 두 슬롯 독립, 동기 갱신, lazy init, 안정적인 setter, 함수형 갱신, NaN·+0/-0, 제거·재마운트 이전 setter 무효 |
| Hook 문맥 | render 밖·자식의 세 Hook 거부, h 인수의 루트 Hook 허용, 개수 감소·증가·종류 변경 롤백, 렌더 중 setter 거부 |
| [EFF-01](../../docs/requirements.md#eff-01)~[EFF-04](../../docs/requirements.md#eff-04) | DOM 반영 후 실행, deps 생략/[]/값 비교, deps mode·길이 변경 거부, 배열 얕은 복사·객체 참조 비교, cleanup 없는 반환, 슬롯별 cleanup→setup 순서 |
| Effect 오류·재진입 | cleanup/setup 예외 후 다른 Effect 계속, 성공 DOM 유지, deps 변경 전 실패 setup 재시도 없음, setup·변경 cleanup·제거 cleanup의 unmount 재진입 거부, 제거 중 setter 무효·다른 cleanup 지속 |
| Effect 갱신 대기열 | 현재 Effect 순회 종료 후 순서대로 갱신, 최신 성공 State의 함수형 updater, 무한 갱신 상한 |
| [MEMO-01](../../docs/requirements.md#memo-01)~[MEMO-03](../../docs/requirements.md#memo-03) | 같은 참조 재사용, A→B→A 재계산, Object.is, deps 배열 복사·길이 계약, 실패 candidate의 State·Memo·Effect 폐기 |
| key 경계 | 예약 key Props 제거, 반환 원본 불변, 동일 내부 key 허용·충돌 거부, keyed 빈/텍스트/다중 반환 거부, unkeyed 다중 반환 허용 |
| [DIFF-01](../../docs/requirements.md#diff-01), [PATCH-03](../../docs/requirements.md#patch-03) | keyed 자식 재정렬의 실제 DOM 객체 보존, key 변경 시 교체, 루트 State·setter 및 동일 deps Effect 수명 유지 |
| [PATCH-02](../../docs/requirements.md#patch-02), 런타임 복구 | 실제 부분 DOM 쓰기 후 faulted, 이전 노드 cleanup, candidate State·Memo·setup·대기열 폐기, 오래된 setter 무효, 명시적 unmount→mount로만 새 수명 시작 |
| 렌더·검증 실패 | 마지막 성공 Props·DOM·State·Memo·Effect 유지, active 문맥 해제, 다음 유효 요청 재시도 |

## 임시 정책과 설계 경계

[임시 결정](../../docs/design/temporary-decisions.md), [런타임](../../docs/design/component-runtime.md), [Hook](../../docs/design/hooks.md), [렌더러](../../docs/design/renderer.md), [검증 계획](../../docs/design/verification.md)을 기준으로 작성했다.

- 임시 선택 의존 사례는 제목에 `[임시 OPEN-...]`를 붙인다. 함수형 초기화·updater 및 같은 State 생략은 OPEN-07, 제거는 OPEN-08, 실패·동기 대기열·무한 갱신 차단은 OPEN-09, deps 비교는 OPEN-11, Memo 참조 보장은 OPEN-13, 문맥·슬롯 검사는 OPEN-15에 연결한다. 임시 도구 선택 OPEN-10과 일반 h/text API 전제는 본 문서에서 별도로 명시한다.
- 연속 갱신 50회는 제품 요구사항이 아닌 임시 안전장치다. 경계 검사는 초기 render와 차단 시도 render의 집계 차이를 허용하되 51번째 갱신의 DOM 커밋은 허용하지 않는다.
- key는 자식 DOM 대응 기준이다. 특정 key 탐색 구조·배치 순회·이동 횟수·LIS나 내부 generation 수치를 강제하지 않는다. 유지된 setter가 계속 동작하는지로 generation 수명도 관찰한다.
- 오류 전달은 설계가 명시한 동기 호출자 예외만 `toThrow()`로 확인한다. 메시지·오류 클래스·AggregateError 형태·집계 개수는 미결정이므로 강제하지 않는다. 실제 resource 해제 성공을 runtime이 보장한다고 단정하지 않는다.
- 부분 DOM 실패는 문서의 문자열 속성 반영 계약에 맞춰 `Element.prototype.setAttribute`에 일회성 spy를 설치한다. 기존 요소의 `title`을 실제로 변경한 **뒤에** 예외를 던지므로 준비 단계 실패와 구별된다. native 쓰기 진입 중 setter를 요청해 실패 시 대기열 폐기도 검증한다. spy는 finally에서 복원한다. 복구 DOM의 객체 정체성은 보장하지 않지만 cleanup이 이전에 캡처한 노드를 사용해야 한다.
- faulted 후 State·Memo는 공개 `hooks`의 문서화된 `kind/value`로 진단하며 재실행 가능한 캐시로 취급하지 않는다. VDOM click 핸들러는 setter와 독립적인 spy로 정상 실행을 먼저 확인하고, 이전 노드·복구 노드에서 호출 증가가 없는지 검사한다. Effect 네이티브 리스너의 정리도 별도로 유지한다. 호스트 사용자 조작 차단은 웹페이지 계층 책임이므로 이 단위 테스트는 호스트 UI 차단 구현까지 요구하지 않는다.
- recovering 중 첫 cleanup이 실제 리스너 자원을 해제한 뒤 오류를 던지는 사례에서 다음 cleanup 계속 실행, 슬롯 순서/각 1회, 마지막 성공 표시 재구성, faulted 유지와 후속 unmount의 중복 정리 없음을 검사한다.
- setup이 cleanup을 반환하기 전에 직접 예외를 던지면 자원은 setup 자신이 정리해야 한다. 이 테스트는 반환되지 않은 cleanup의 실행을 기대하지 않는다.
- 같은 종류 Hook끼리의 순서 교환 검출, 직접 자식 함수 호출, 브라우저 페인트 시점, 포커스·선택 범위, 비동기 배칭, Strict Mode는 검증 계약이 아니다.

## 남은 검증 범위

`function-component.test.ts`에 더해 `edge-contracts.test.ts`는 잘못된 Effect 반환값/Promise, Memo deps 생략, 함수 State 저장, 루트 간 슬롯 독립, rendering 중 unmount 거부, 복구 DOM 생성 자체 실패와 명시적 제거를 검사한다.

최초 mount 중 native DOM 실패, DOM 제거 자체 실패, committing/recovering 단계의 직접 unmount 재진입은 별도 주입하지 않는다. 후속 오류 주입 테스트 대상으로 남긴다. 상기 미검증 항목을 통과했다고 보고하지 않는다.
