# mini-react

React 없이 렌더러와 Hook을 구현하며, 상태 변경이 DOM 갱신으로 이어지는 과정을 다룬 프로젝트다.

- TypeScript · Vanilla HTML/CSS · Vite
- Vitest/jsdom · Playwright

## 중점적으로 다룬 것

### 화면이 같아도, DOM을 새로 만들었다면 다른 결과다

- HTML 결과만 비교하면 전체 교체와 부분 갱신을 구분할 수 없다.
- key를 기준으로 기존 노드를 연결하고, 재정렬할 때 새로 만드는 대신 이동한다.
- 테스트에서 **갱신 전후 DOM 객체가 같은지**, 변경이 없을 때 불필요한 쓰기가 없는지 확인했다.
- Virtual DOM 자체의 속도보다, 어떤 DOM을 유지하고 바꿀지에 집중했다.

### 상태와 화면은 같은 기준으로 확정해야 한다

- 컴포넌트가 다시 실행돼도 상태가 남도록, 함수 밖의 `hooks` 배열에서 기록을 관리한다.
- 렌더 계산과 DOM 반영을 분리하고, 반영에 성공한 뒤 새 VDOM·Hook 기록을 확정한다.
- 렌더 실패와 DOM 반영 후 Effect 실패를 구분해 처리했다. 이미 적용된 화면과 내부 상태가 어긋나지 않도록 하기 위해서다.

### 정상 동작만큼 실패 이후의 동작도 중요하다

- 잘못된 입력은 기존 화면과 이력을 바꾸기 전에 거부한다.
- DOM 반영 중 오류가 나면 복구를 시도하고, 컴포넌트는 추가 갱신을 차단한 뒤 명시적으로 다시 시작하도록 했다.
- 구독 정리에서 오류가 나도 나머지 정리를 시도하고, 원인을 모아서 전달한다.
- 오류 발생 여부뿐 아니라 **무엇이 남고, 무엇을 다시 실행할 수 있는지**를 테스트했다.

## AI 활용과 검증

### 사람과 AI의 역할

- 개발자는 관련 개념과 구현 원리를 학습하며, 전체 진행 과정의 관리와 의사결정에 참여했다.
- AI는 요구사항 정리, 설계안 제안, 코드·테스트 작성과 검토를 지원했다.

### 구현과 검증 역할 분리

- 구현 에이전트와 별도의 검증 에이전트가 호출 경로·경계 조건을 검토했다.
- 완료 보고만으로 승인하지 않고, 실제 테스트 결과와 검토 대상 소스를 대조했다.
- 수정 후에는 원래 실패 사례와 인접 조건을 다시 확인했다. 부분 검토 승인을 전체 통과로 취급하지 않았다.

### 검증으로 바뀐 구현

- **Effect 오류 후 갱신 유실**: 이미 수락한 요청이 사라지는 문제를 발견해, DOM 반영 이후 오류와 요청 대기열 처리를 분리했다.
- **갱신 횟수 제한 누락**: 직접 `update()`로 시작하면 제한을 한 번 넘기는 문제를 수정하고, 제한 직전·초과·무한 반복을 재검증했다.
- **빈 슬롯이 있는 의존성 배열**: 배열 순회에서 빠지는 항목을 발견해 모든 인덱스를 비교하도록 수정했다.

관련 기록: [State](docs/implementation/stage-06.md) · [Effect](docs/implementation/stage-07.md)

## 이 프로젝트에서 얻은 것

<!-- 학습 성과는 작성자가 직접 추가한다. -->
(작성 예정)

## React와 동작이 다른 지점

일반적인 React DOM 클라이언트 렌더링을 기준으로 비교한다. 같은 이름의 API가 같은 동작을 보장하지는 않는다.

### 화면을 만드는 출발점

- **mini-react**: Phase 1은 기존 DOM을 읽어 VDOM을 만든다. Phase 2는 컴포넌트 실행 결과로 VDOM을 만들며, 두 경로가 Diff·Patch를 공유한다.
- **React**: 기존 HTML을 VDOM으로 역변환하는 대신 컴포넌트를 실행해 화면을 계산한다. JSX는 필수가 아닌 표현 방식이다. ([렌더링 과정](https://react.dev/learn/render-and-commit), [JSX 없이 element 생성](https://react.dev/reference/react/createElement))

### 컴포넌트를 구분하는 기준

- **mini-react**: `h(Child, props)`가 자식 함수를 즉시 실행하고, Diff에는 함수 타입 없이 반환된 DOM 요소·텍스트 트리만 남는다. 자식 함수가 달라져도 같은 위치의 태그·key가 같으면 DOM을 재사용할 수 있다.
- **React**: element에 컴포넌트 타입을 보존하고 React가 실행한다. 같은 위치라도 컴포넌트 타입이 달라지면 기존 하위 트리를 제거하고 새로 만든다. key도 컴포넌트의 정체성을 구분한다. ([element의 의미](https://react.dev/reference/react/createElement), [상태 유지·초기화 기준](https://react.dev/learn/preserving-and-resetting-state))

### 연속 상태 변경의 반영 시점

- **mini-react**: 대기 중인 작업이 없는 idle 상태에서는 setter마다 DOM 반영까지 동기로 처리한다. 한 이벤트에서 여러 상태를 바꾸면 중간 화면도 DOM에 반영될 수 있다. 커밋·Effect 중 요청만 대기열에서 순서대로 처리한다.
- **React**: 일반적인 이벤트 핸들러에서는 상태 갱신을 모아 처리하므로, 각 setter 호출 직후에 DOM이 바뀌지는 않는다. ([상태 갱신과 batching](https://react.dev/learn/queueing-a-series-of-state-updates))

### Effect와 브라우저 그리기의 관계

- **mini-react**: DOM 반영 직후 같은 동기 호출 흐름에서 Effect를 실행한다. 긴 Effect는 브라우저가 화면을 그리는 것도 지연시킨다.
- **React**: 비상호작용 Effect는 대체로 브라우저가 화면을 그린 뒤 실행하지만, 클릭 등 상호작용에 따른 Effect는 그 전에 실행될 수도 있다. 따라서 단순히 “DOM 반영 직후 동기 실행”으로 볼 수 없다. ([Effect 실행 시점](https://react.dev/reference/react/useEffect))

구현 근거: [DOM 읽기](src/playground/controller.ts) · [자식 함수 실행](src/core/vdom.ts) · [Diff 기준](src/core/diff.ts) · [갱신·Effect 처리](src/core/component.ts)

## 시연

- **렌더러 실험실**: HTML 편집 → Patch 적용 → 이전·다음 이력 이동
- **컴포넌트 데모**: 장바구니 상태 변경, 구독 설정·정리 횟수, Memo 계산 횟수, key 기반 목록 재정렬

## 실행

프로젝트 루트에서 실행한다.

```sh
npm ci
npm run dev
```

- 빌드: `npm run build`
- 테스트: `cd tests && npm ci && npm test`
- 브라우저 검사와 세부 명령: [테스트 안내](tests/README.md)

### 확인한 검증 범위

- 2026-11-11 실행 기준: 빌드·타입·테스트 컨벤션 검사, Vitest 518개 테스트 통과
- 브라우저 전체 통과는 미확인: Chromium 실행 파일 누락과 일부 테스트 설정 문제로 검증이 막혔다.

## 상세 문서

- [과제 원문](docs/assignment.md) · [요구사항](docs/requirements.md)
- [설계](docs/design/README.md) · [임시 결정](docs/design/temporary-decisions.md) · [작성 규칙](docs/conventions.md)
- [테스트 안내](tests/README.md) · [검증 대응표](tests/test-plan.md)

### 단계별 구현·검증 기록

- 렌더러: [DOM 변환](docs/implementation/stage-01.md) · [Diff](docs/implementation/stage-02.md) · [Patch](docs/implementation/stage-03.md)
- 실행 환경: [편집·이력 UI](docs/implementation/stage-04.md) · [컴포넌트](docs/implementation/stage-05.md)
- Hook: [State](docs/implementation/stage-06.md) · [Effect](docs/implementation/stage-07.md) · [Memo](docs/implementation/stage-08.md)
- 통합: [데모 연결과 오류 처리](docs/implementation/stage-09.md)
