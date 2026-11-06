# 아키텍처 — 책임·소유권·실행 단계

상태: 설계 초안. Python 선택 외 구조·API는 아직 팀 채택 전입니다. 소스 파일 개수를 정하는 문서가 아니라 변경 이유와 경계를 정의합니다.

## 1. 핵심 구분

| 개념 | 의미 | 잘못 섞으면 생기는 문제 |
| --- | --- | --- |
| UI 함수 실행 | State·props로 다음 UI 계산 | 실행할 때마다 DOM 교체·외부 작업 발생 |
| 트리 비교 | 이전·다음 표현의 차이 계산 | 브라우저가 있어야 알고리즘 테스트 가능 |
| commit | 차이를 실제 DOM에 적용 | 실패한 화면을 성공한 상태로 기록 |
| Effect | 성공한 commit 후 외부 동기화 | 실패한 렌더의 구독·타이머가 남음 |
| paint | 브라우저의 픽셀 표시 | commit 완료를 화면 표시 완료로 오해 |

React 공개 동작에 대한 요약은 S-02·S-05, 우리의 단순화는 아래와 [API 계약](api-contracts.md)에 있습니다.

## 2. 경계와 의존 방향

~~~text
데모 UI / 앱
    ├─ 편집 controller → DOM reader → 구조 트리 → Diff → Patch
    │                       └──────── History ─────────┘
    └─ FunctionComponent → State·Hook slots → UI 함수 → 트리
                              ↓                    ↓
                         Effect 대기열       Diff → Patch
                                                   ↓
                                            DOM adapter
                                                   ↓
                                             브라우저 API
~~~

- Core는 브라우저 객체를 직접 소유하지 않습니다. 트리·Diff·의존성 비교는 순수 Python 로직을 목표로 합니다.
- Adapter만 실제 DOM 노드·이벤트·브리지 객체를 다룹니다.
- Controller는 Phase 1의 편집·이력 흐름을 담당합니다. Hook 저장소와 History는 별개입니다.
- 실행 구조가 분리 프로세스라면 adapter 호출이 통신이 됩니다. 직렬화·순서·성공 응답 계약을 ADR-0002에 추가해야 합니다.
- 별도 범용 DI 프레임워크나 플러그인 시스템은 만들지 않습니다. 테스트 대역을 교체할 정도의 얇은 경계를 목표로 합니다.

## 3. 데이터의 소유권과 수명

| 데이터 | 소유자 | 수명·규칙 |
| --- | --- | --- |
| 이전 committed_tree | controller 또는 루트 인스턴스 | 다음 성공 commit까지 유지. 후보 트리로 미리 덮지 않음 |
| 후보 트리·Patch 목록 | 현재 갱신 작업 | 준비·commit 중 사용. 실패하면 성공 기준으로 승격하지 않음 |
| History snapshots·cursor | Phase 1 controller | 편집 세션. DOM·함수·브리지 참조를 저장하지 않음 |
| hooks·hook_cursor | 루트 FunctionComponent | hooks는 mount~unmount, cursor는 렌더마다 0부터 |
| Effect setup·cleanup·deps | 해당 Hook 슬롯 | 성공 commit에 따라 교체·정리 |
| Memo 결과·deps | 해당 Hook 슬롯 | 루트 수명 내 최적화. 정확성의 근거로 사용하지 않음 |
| DOM node·이벤트 proxy | adapter | 노드 생성~제거 또는 unmount. 명시적으로 해제 |
| 데모 조작 버튼·편집기 | 데모 shell | 라이브러리 관리 root 밖에 배치 |

Phase 1 DOM reader는 현재 DOM 구조를 읽을 뿐 원래 Python 이벤트 함수를 복원할 수 없습니다. Phase 2는 UI 함수의 결과를 원본으로 사용하며 갱신 때마다 DOM을 다시 읽지 않습니다.

## 4. 라이프사이클

~~~text
NEW → mount → MOUNTED → update → MOUNTED
                    └→ unmount → DISPOSING → UNMOUNTED

렌더 실패: 이전 committed_tree·DOM 유지, 오류 반환
commit 실패: BROKEN → unmount / 명시적인 초기화로 새 루트 생성
Effect 실패: DOM commit은 유지, 오류 노출·수명 정리, 자동 rollback 없음
~~~

NEW에서 update, 중복 mount, UNMOUNTED에서 update는 오류로 처리하는 초안입니다. BROKEN에서 추가 Patch는 금지하고 화면·이력의 성공 표시를 하지 않습니다.

## 5. 한 번의 갱신

1. State 요청을 저장하고 루트가 이미 렌더·commit·Effect 처리 중인지 확인합니다.
2. hook_cursor를 초기화하고 루트 함수를 실행합니다. 자식은 props로 호출합니다.
3. Hook 종류·개수와 트리 입력을 검증하고 이전 트리와 Diff합니다.
4. Patch 대상·지원 연산을 검사합니다. 실제 DOM 변경 전 가능한 검사를 끝냅니다.
5. adapter를 통해 구조 Patch와 제어 input의 현재 property 동기화를 수행하고 성공을 확인합니다. 분리 프로세스라면 응답 전 성공으로 취급하지 않습니다.
6. 성공한 트리를 committed_tree로 승격하고 Memo 등 성공한 렌더 메타데이터를 확정합니다. Effect는 실행 예정 deps와 성공한 setup의 deps를 구분해 이후 실패·재시도를 관리합니다.
7. 변경된 Effect의 이전 cleanup 후 새 setup을 실행합니다.
8. Effect 중 요청된 State 갱신은 현재 Effect 묶음 종료 후 처리합니다.

단계 2~3에서 실패하면 candidate Hook 메타데이터도 버립니다. 이미 setter로 요청된 State 값은 유지하고 자동 재시도하지 않습니다. 이전 DOM과 최신 State가 잠시 다를 수 있으며 오류를 표시하고 다음 명시적 갱신·재초기화로 복구합니다.

DOM commit 중간 실패는 원자적이지 않습니다. 완전 rollback을 구현했다고 주장하지 않고 BROKEN으로 전환합니다. Effect 실패를 DOM commit 실패와 같은 것으로 취급하지 않습니다.

지원 input은 제어 입력입니다. 사용자가 직접 바꾼 값이 State에 반영되지 않았다면 다음 정상 commit에서 목표 property로 복원합니다. 같은 VNode만 비교하면 이 차이를 놓치므로 property 동기화는 adapter의 현재 DOM 읽기를 사용합니다. 이것은 순수 Diff의 예외가 아니라 commit의 별도 책임입니다.

## 6. 디자인 패턴·설계 원칙의 적용

| 구조 | 해결하려는 문제 | 적용 범위·비용 |
| --- | --- | --- |
| Composite와 닮은 트리 모델 | 요소가 자식 요소·텍스트를 재귀 포함 | VElement·VText를 같은 순회 경로로 처리. 패턴용 클래스 계층은 불필요 |
| 순수 핵심 로직과 부수 효과 경계 | Diff 검증이 DOM에 묶임 | Diff는 순수, Patch는 효과 발생. 표현 변환 비용 추가 |
| Adapter | Python과 DOM 환경 차이 | 노드·이벤트 작업을 격리. 실제 브리지 테스트 필수 |
| 단방향 데이터 흐름 | 여러 위치에서 UI·상태를 임의 변경 | State → UI → DOM. Phase 1 편집은 별도 controller로 구분 |
| 스냅샷 이력 | 과거 상태의 독립 복원 | 구조 트리를 저장. 메모리 비용 존재, 전체 앱 상태 복원 아님 |
| Memoization | 같은 입력의 반복 계산 | 결과·deps 저장. 잘못된 deps·가변 객체는 오래된 결과 위험 |

호출 가능한 setter나 이벤트가 있다고 해서 별도 Observer·Event Bus를 도입하지 않습니다. Patch 목록이 명령과 비슷해도 범용 Command 프레임워크나 되돌리기 연산을 추가하지 않습니다. 패턴 이름은 구조를 설명하는 말이며 필수 파일 목록이 아닙니다.

## 7. Diff와 DOM 정체성

[ADR-0003](decisions/0003-reconciliation.md)은 같은 부모 안에서 자식 순서·노드 종류·태그로 대응하는 단순안을 제안합니다. 같은 위치·같은 종류는 재사용하고, 종류가 달라지면 해당 부분을 교체합니다.

앞에 항목을 삽입했을 때 기존 논리 항목의 DOM이 유지되는 keyed 재정렬은 보장하지 않습니다. 최종 문자열만 같다는 테스트로 이 한계를 숨기지 않습니다.

## 8. Python 브리지의 필수 확인

- DOM 읽기에서 childNodes의 텍스트·공백을 어떻게 Python으로 옮기는가?
- Python callback의 identity와 브라우저 listener/proxy는 누가 보관·해제하는가?
- 콜백 예외가 어디에서 관찰되고 UI 상태는 무엇인가?
- 동기·비동기 호출에서 commit 성공을 누가 확인하는가?
- 브라우저 값과 Python 값의 변환이 타입·동일성에 미치는 영향은?
- 세션·요청 순서가 필요하다면 오래된 응답이 새 UI를 덮지 않게 하는가?

답이 필요한 것은 ADR-0002의 실행 구조를 채택할 때입니다. 단순 Python 함수 호출만으로 브라우저 commit 성공을 입증하지 않습니다.

## 9. 실제 React와의 차이

| 주제 | 공식 문서로 확인한 React | 이번 구현 초안 |
| --- | --- | --- |
| 상태 위치 | 컴포넌트의 렌더 트리 정체성과 연결 | 단일 루트의 Hook 배열 |
| 자식 상태 | 컴포넌트별 State·Hook 사용 가능 | 과제 제약으로 금지 |
| 갱신 요청 | batching·업데이트 큐 등 포함 | 이벤트 setter 후 동기 갱신, 자동 batching 없음 |
| 자식 대응 | 타입·위치·key가 정체성에 참여 | 위치 기반, key 미지원 |
| Effect | commit 이후, paint 뒤라고 항상 보장하지 않음 | 성공 commit 후 명시적 순서로 처리 |
| 비교 | State·deps에 Object.is 사용 | C-11의 Python용 비교안. 완전 동등하지 않음 |
| 내부 자료구조 | 이 프로젝트에서 소스 확인 안 함 | 별도 Diff·Patch 목록과 hooks 배열 |

근거와 세부 범위는 [S-02~S-07](references.md)에 있습니다.
