# 참고 자료·용어·근거 범위

조회 기준일: 2026-11-06. 공식 문서·원저자의 자료를 사용했습니다. 웹 문서가 표시하는 최신 버전은 프로젝트 설치 버전을 뜻하지 않습니다. React 소스·Fiber 내부 구조나 특정 커밋은 이번에 검증하지 않았습니다.

## 1. 근거 분류

- 공식 동작: 연결한 자료가 직접 설명하는 API·브라우저 동작.
- 설계 추론: 공개 동작을 만족하려면 필요하다고 우리가 추론한 책임.
- 우리 선택: Python용 자료구조·비교·스케줄링 등 별도 설계.
- 실행 증거: 실제 저장소에서 실행한 테스트·브라우저 관찰. 현재 없음.

## 2. 확인한 자료와 사용 범위

| ID | 자료 | 확인한 내용·사용 범위 |
| --- | --- | --- |
| S-01 | [MDN DOM](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model) | 문서의 객체·노드 트리와 프로그래밍 인터페이스, HTML 텍스트와 DOM 구분 |
| S-02 | [React Render and Commit](https://react.dev/learn/render-and-commit) | 컴포넌트 계산·DOM 반영·브라우저 표시의 구분. 재실행이 전체 교체를 뜻하지 않음 |
| S-03 | [React Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state) | 상태가 트리 정체성과 연결되고 위치·타입·key가 관여. key는 전역 ID가 아님 |
| S-04 | [State: A Component’s Memory](https://react.dev/learn/state-a-components-memory), [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks) | 세 Hook의 안정적 호출 순서. 배열 예제는 학습용 단순화이며 실제 전체 구현의 증거가 아님 |
| S-05 | [React useEffect](https://react.dev/reference/react/useEffect) | 외부 동기화, deps 비교, 이전 cleanup→새 setup, unmount 정리. 항상 paint 뒤는 아님 |
| S-06 | [React useMemo](https://react.dev/reference/react/useMemo) | 순수 계산의 재사용, 캐시는 의미적 보장 아님. 영구 상태·외부 작업 저장소가 아님 |
| S-07 | [React useState](https://react.dev/reference/react/useState) | 초기값·안정적 setter·다음 렌더 요청·updater·batching. 우리 동기 모델과 구분 |
| S-08 | [MDN innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML) | 대입 시 자손 교체, 입력 주입 위험. 부분 Patch와 편집 입력 경계에 사용 |
| S-09 | [MDN MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) | DOM 변경 관찰 API. 전체 상태·성능·property 변화의 보편 검증 수단은 아님 |
| S-10 | [Python WebAssembly 안내](https://docs.python.org/3/library/intro.html#webassembly-platforms) | 브라우저 Python의 추가 실행 환경·제한, DOM 접근 경로 |
| S-11 | [Python value comparison](https://docs.python.org/3/reference/expressions.html#value-comparisons), [identity comparison](https://docs.python.org/3/reference/expressions.html#identity-comparisons), [MDN Object.is](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) | Python ==·is와 React 비교 의미가 같지 않음. C-11은 우리 정책 초안 |
| S-12 | [AGENTS.md 형식 안내](https://agents.md/) | 사람용 README와 작업 지침의 책임 분리. 제품 설계 명세의 대체는 아님 |
| S-13 | [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) | 맥락·상태·결정·결과를 남기는 짧은 결정 기록, 대체 이력 보존 |

추가 후보 도구를 채택하면 공식 설치·브리지·수명 문서를 확인하고 ADR-0002에 실제 실험 결과와 버전을 기록합니다.

## 3. 오해 방지

- DOM은 화면 픽셀 자체가 아닙니다. DOM 변경·layout·paint를 모두 같은 작업으로 취급하지 않습니다.
- Virtual DOM을 쓴다는 사실만으로 직접 DOM 조작보다 빠르다고 결론 내리지 않습니다.
- render 함수가 다시 실행되어도 DOM 변경이 없을 수 있습니다.
- 루트만 Hook을 사용한다는 것은 과제 제약입니다. 실제 React의 모든 자식이 stateless인 것은 아닙니다.
- 빈 deps는 해당 mount 수명의 계약입니다. 재mount·개발용 점검을 무시하고 앱 전체에서 딱 한 번이라고 쓰지 않습니다.
- Memo는 정확성·수명을 보장하는 상태 저장소가 아닙니다.
- 이 프로젝트의 Patch 목록·경로·Hook 배열·동기 flush는 선택 가능한 모델이며 React 내부 구현을 확인한 사실이 아닙니다.

## 4. 용어

| 용어 | 이 프로젝트에서의 의미 |
| --- | --- |
| State | UI 계산에 사용되고 변경 요청이 갱신을 일으키는 데이터 |
| props | 부모가 자식 UI 함수에 전달하는 입력 |
| VNode | 원하는 UI를 나타내는 요소·텍스트 데이터 |
| reconciliation | 이전·다음 UI의 대응과 변경을 정하는 과정 |
| Diff | 변경 계산. 우리 초안에서는 순수 함수 |
| Patch | 계산된 변경의 실제 DOM 적용 |
| identity | 값이 같은지와 별개로 같은 인스턴스인지 판단하는 기준 |
| mount / unmount | 루트 수명 시작 / 종료·자원 정리 |
| adapter | Python 핵심 로직과 실제 DOM 환경의 연결 경계 |
| 계약 | 정상 입력·출력뿐 아니라 순서·오류·수명에 대한 약속 |
| ADR | 중요한 선택 하나의 맥락·대안·결과 기록 |
| AIDD | 여기서는 AI와 문서·코드·테스트를 통해 협업하는 방식을 가리키는 작업 용어 |

## 5. 추가 역설계 기록 양식

~~~text
관찰할 동작:
공식 출처 또는 소스 버전·커밋·위치:
직접 확인한 사실:
필요한 내부 책임에 대한 추론:
우리 설계의 선택·단순화:
다른 가능한 구현:
연결할 FR·C·ADR·V:
실험과 실제 결과:
~~~
