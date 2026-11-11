# 테스트 연결 계약과 전제

이 문서는 **문서에 없는 API와 화면 구조를 확정한 제품 명세가 아니다**. 테스트를 실행하기 위한 연결 지점이며 실제 구현 착수 때 확인한다. 사용자에게 API 재설계를 강요하기 위해 테스트를 사용하지 않는다.

## 라이브러리

`support/project.ts`는 프로젝트 루트의 실제 `src/**/*.ts`만 동적으로 불러온다. 구현이 없으면 개별 테스트 실행에서 `[IMPLEMENTATION_MISSING]`를 보고한다. 모듈 수집 단계가 깨져 테스트가 0개가 되는 상황을 피한다. 함수의 성공 결과나 실패를 흉내 내는 fallback은 없다.

| 경로 | 연결할 named export | 근거 |
| --- | --- | --- |
| `src/core/vdom.ts` | `h`, `text`, `validateRoot` | architecture·renderer·component-runtime |
| `src/core/dom-reader.ts` | `readDOM` | architecture |
| `src/core/diff.ts` | `diff` | architecture·renderer |
| `src/core/patch.ts` | `mountTree`, `applyPlan` | architecture·renderer |
| `src/core/dom-bindings.ts` | `createDOMScope`, `releaseDOMScope` | scope 모듈 위치는 테스트 연결 가정. architecture는 patch/dom-bindings에 책임을 배치하지만 export 파일까지 확정하지 않음 |
| `src/core/component.ts` | `FunctionComponent` | 설계의 클래스와 mount/update/unmount |
| `src/core/hooks.ts` | `useState`, `useEffect`, `useMemo` | hooks |
| `src/playground/history.ts` | `HistoryStore` | architecture·playground-history |

- `new FunctionComponent(renderFn)`와 `new HistoryStore(initialTree)`는 생성자 인자가 문서에 완전한 시그니처로 정의되어 있지 않아 둔 **명시적 연결 가정**이다. 실제 구현의 생성자에 맞게 테스트의 생성 지점만 조정할 수 있다.
- `mount(container, props)`, `update(props?)`, `unmount()`, History의 `current/canBack/canForward/peek/push/commitMove`는 설계의 공개 메서드를 사용한다.
- 오류 타입·메시지가 확정되지 않은 곳은 특정 문구 대신 오류 발생과 상태/자원 불변성을 검사한다. Effect 오류는 계속 처리 후 동기 호출자에게 전달하는 설계 전제다.
- 후보 State·Memo의 외부 부수 효과를 일반적으로 취소할 수 있다고 가정하지 않는다. purity는 사용 계약이다.
- History private entries/cursor를 테스트에서 억지로 공개하지 않는다. 동일 current 참조, peek의 스냅샷 참조, 양쪽 탐색 가능성과 이동 결과로 보존을 확인한다.

## 브라우저 연결

다음 `data-testid`는 레이아웃과 문구 변화에 흔들리지 않는 테스트 연결 지점이다. 현재 앱은 Phase 1·2 탭으로 표시를 전환한다. 사용자 조작은 `support/phase-navigation.ts`에서 실제 탭을 클릭하고 선택 상태·패널 표시를 검사한 뒤 수행한다. DOM을 강제로 노출하거나 숨긴 버튼을 강제 클릭하지 않는다. 접근성 역할/선택자가 바뀌면 동등한 의미의 locator로 변경하되 기능·정체성·오류 기대값은 유지한다.

| testid | 대상/관찰 |
| --- | --- |
| `actual-region` | Phase 1 관리 컨테이너. 접근 가능한 이름 `실제 영역` |
| `preview-region` | `테스트 영역` 이름의 편집 패널 안에 있는 관리 컨테이너. 내부 컨테이너의 접근 가능한 이름은 `미리보기` |
| `html-editor` | HTML 입력 textarea |
| `patch-button`, `back-button`, `forward-button` | Phase 1 버튼 |
| `status` | 오류/현재 상태/`변경 없음` 안내 |
| `component-demo` | Cart 루트가 소유하는 컨테이너. 제거 시 내부 DOM만 비움 |
| `quantity`, `total`, `memo-input`, `memo-output` | Cart 수량·합계·입력·표시 |
| `increase-quantity`, `change-product` | 수량 증가·다른 상품 선택 |
| `memo-count`, `effect-setup-count`, `effect-cleanup-count` | 루트 밖 읽기 전용 테스트 계측. 정수 텍스트. 제거/재시작에도 관찰 가능 |
| `unmount-component`, `restart-component` | 관리 컨테이너 밖 수명 조작 |
| `keyed-list-demo` | 안정적인 data-key를 가진 항목이 3개 이상 있는 목록 |
| `reverse-list`, `prepend-list-item` | 목록 순서 역전·새 항목 앞 삽입 |

Memo 계산 함수가 DOM/State를 변경해 계측하도록 요구하는 것은 아니다. spy·별도 테스트 계측으로 관찰하고 계산의 순수성을 유지한다. 이 계측 UI를 원하지 않으면 브라우저 계측 연결만 변경하고 Memo 호출 횟수 검증은 유지한다.

실제 앱을 모르는 상태에서 임의의 dev 서버, 초기 샘플 또는 테스트 전용 대체 앱을 생성하지 않는다. `MINI_REACT_BASE_URL`로 실제 앱 주소를 지정한다.

## 실패 주입

Phase 1 브라우저 테스트는 실제 영역의 title 변경을 한 번 수행한 **직후** 예외를 던진다. 복구를 막지 않도록 native 메서드를 즉시 원복한다. 이는 DOM 반영이 원자적이라는 잘못된 가정을 잡는 테스트이며 복구 이후 예전 DOM 객체 동일성은 요구하지 않는다.

불변성 테스트의 frozen 입력, 사용자 함수의 의도적 throw, DOM 메서드 spy는 테스트 입력·실패 주입이다. 제품 알고리즘을 mock으로 대신한 것이 아니다.

## 자동 테스트 외 확인

- 실행 코드가 Vanilla TS이고 외부 React/Vue 렌더링·Hook을 사용하지 않는지 의존성·호출 경로를 검토한다.
- Phase 2 상태 갱신이 공통 Diff/Patch를 실제로 재사용하는지 구현의 호출부를 추적한다. 동일한 최종 DOM만으로 코드 재사용 여부를 증명하지 않는다.
- 루트/자식 분리와 예제의 Props 순수성도 호출 경로·정적 검토를 병행한다. 악의적인 임의 사용자 함수의 외부 변경까지 런타임이 막는 것은 명세가 아니다.
- faulted 시 컨테이너 조작 차단은 호스트 UI 책임이다. 런타임 setter/이벤트 무효화만으로 호스트의 차단 UI까지 검증했다고 하지 않는다.
