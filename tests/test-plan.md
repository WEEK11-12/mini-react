# 요구사항·오류 검증 대응표

기준: [요구사항](../docs/requirements.md), [검증 설계](../docs/design/verification.md), [임시 결정](../docs/design/temporary-decisions.md).

이 표의 ‘자동’은 테스트 코드가 있다는 뜻이며 통과를 뜻하지 않는다. 실제 실행 결과와 종결 상태는 [최종 검증 기록](../docs/implementation/stage-10.md)을 따른다. `[임시 OPEN-…]`는 작성 당시 출처이며 현재 OPEN-01~15는 요구사항의 인수 기준으로 채택했다. 테스트 존재·정책 채택·실행 통과는 구별한다.

## 인수조건

| 요구사항 | 관찰할 결과 | 자동 테스트 위치 / 추가 검토 |
| --- | --- | --- |
| VDOM-01 | 중첩·자식 순서·빈 요소 | `renderer/` DOM reader |
| VDOM-02 | 지원 속성·공백·빈 텍스트·data-key·현재 폼값·논리 ID 보존 | `renderer/`, `browser/phase-one.spec.ts` |
| DIFF-01 | 추가/삭제/종류·태그 교체·key 대응/이동·중복 거부·unkeyed 위치 | `renderer/` |
| DIFF-02 | 속성 추가/삭제/값·텍스트 변경 | `renderer/` |
| DIFF-03 | 의미상 무변경·key/순서/공백/폼/이벤트 변화 구분 | `renderer/`, `history/`, `browser/` |
| PATCH-01 | 초기 구조/속성/텍스트/폼값과 다중·빈 루트 | `renderer/`, `browser/phase-one.spec.ts` |
| PATCH-02 | 변경 조합·폼 보정·이벤트 교체·목표 순서 | `renderer/`, `browser/` |
| PATCH-03 | 문단/형제/같은 key+tag DOM 동일성·무변경 쓰기 없음 | `renderer/`, `runtime/`, `browser/` |
| COMP-01 | mount 시 함수 결과 표시 | `runtime/` |
| COMP-02 | 자식 Props와 부모 변경 반영 | `runtime/` |
| COMP-03 | 상태 변경의 부분 갱신 | `runtime/`, `browser/phase-two.spec.ts`; 공통 렌더러 재사용은 호출 경로 검토 병행 |
| STA-01 | 초기값과 호출 가능한 setter | `runtime/` |
| STA-02 | 재실행 보존·다중 슬롯 독립·루트 간 독립 | `runtime/` |
| STA-03 | setter 후 별도 버튼 없이 UI 갱신 | `runtime/`, `browser/phase-two.spec.ts` |
| EFF-01 | 최초 DOM 반영 뒤 setup | `runtime/` |
| EFF-02 | deps 유지/변경에 따른 실행 | `runtime/`, `browser/phase-two.spec.ts`; OPEN-11 임시 |
| EFF-03 | 이전 cleanup→새 setup, cleanup 없음 허용, 동일 deps 정리 없음 | `runtime/` |
| EFF-04 | 제거 cleanup 정확히 한 번·정리 없는 Effect도 제거 | `runtime/`, `browser/phase-two.spec.ts`; OPEN-08 임시 권장 채택 |
| MEMO-01 | 최초 계산 결과와 deps 보존 | `runtime/` |
| MEMO-02 | 동일 deps 계산 생략·결과 참조 재사용 | `runtime/`, `browser/phase-two.spec.ts`; OPEN-11·13 임시 |
| MEMO-03 | deps 변경 시 새 결과를 계산·다음 렌더 재사용 | `runtime/`; OPEN-11 임시 |
| EDIT-01 | 텍스트/속성/구조 편집·폼값·입력 거부 | `browser/phase-one.spec.ts`; OPEN-01·02 임시 |
| EDIT-02 | 적용 전 실제 영역·이력 보존 | `browser/phase-one.spec.ts` |
| VIEW-01 | 두 영역 구분·세 버튼 | `browser/phase-one.spec.ts`; locator 연결은 `contracts.md` |
| VIEW-02 | 초기 동등 표시·테스트 영역 초기 생성 | `browser/phase-one.spec.ts`; 실제 readDOM/mountTree 사용은 호출부 검토 |
| VIEW-03 | 초기/성공/이력 이동 후 현재 기준으로 Patch | `browser/phase-one.spec.ts` |
| VIEW-04 | 클릭/입력·State·Effect·Memo 관찰 | `browser/phase-two.spec.ts` |
| HIST-01 | 복사·스냅샷 불변·현재와 무변경 시 forward/참조 유지·실변경 후 저장 | `history/`, `browser/phase-one.spec.ts` |
| HIST-02 | 양방향 한 단계 이동·처음/끝 경계 | `history/`, `browser/`; OPEN-14 임시 |
| HIST-03 | 실제/미리보기/입력 동기화·미적용 편집 정책·key 정체성 유지 | `browser/phase-one.spec.ts`; OPEN-12 임시 |
| TECH-01 | Vanilla TS와 실제 브라우저 앱 | 브라우저 실행 + 구현 후 구조 검토 |
| TECH-02 | 외부 UI 프레임워크에 핵심 기능을 위임하지 않음 | 구현 후 실행 의존성·import·호출 경로 검토; 테스트 도구는 실행 UI 의존성과 구분 |
| TECH-03 | 함수 UI를 FunctionComponent가 관리 | `runtime/` + 클래스/호출부 검토 |
| TECH-04 | hooks 배열·mount/update의 실제 기록 사용 | `runtime/` + 내부 기록/호출부 검토 |
| TECH-05 | 루트 전용 State/Hook | `runtime/` 문맥 오류 + 예제 작성 규칙 검토 |
| TECH-06 | 자식 Props 계산·순수성 | `runtime/` Props 사례 + 자식 함수 구현 검토; arbitrary 외부 부수 효과 차단 요구 아님 |
| QA-01 | renderer/State/Effect/Memo 단위 테스트 | `npm test`; 현재 RED |
| QA-02 | Phase 1/2 사용자 흐름 | `npm run test:browser`; 앱 준비 필요 |
| QA-03 | 빈 요소·빈 텍스트·조합·deps·탐색 경계 | 각 영역 테스트 |
| QA-04 | 노드 참조와 불필요한 쓰기 관찰 | `renderer/`, `runtime/`, `browser/` |
| QA-05 | 명령·환경·실행결과·요구사항 연결 | README·contracts·본 표·단계별 구현 기록 |

## 우선 추적할 실패·회귀 시나리오

각 행은 테스트 작성과 구현 검토를 위한 체크리스트다. 단일 관찰로 모든 단계의 원자성·자원 회수를 증명했다고 하지 않는다.

| 경계 | 입력/오류 | 기대 보존·해제·복구 |
| --- | --- | --- |
| 입력 | 미지원 태그·style·URL·on*·주석/SVG | 조용히 제거하지 않고 오류. 마지막 유효 미리보기/실제/이력 유지 |
| key | null/숫자/객체/빈 문자열/NUL/단독 surrogate·형제 중복 | DOM 반영 전 거부. 다른 부모의 같은 key는 허용 |
| key 왕복 | 공백·따옴표·개행·특수문자 | trim/숫자 변환 없이 파싱 후 정확한 값. data-key 중복 저장 없음 |
| 대응 | 역순/앞·중간 삽입·삭제·혼합 텍스트 | 같은 부모+key+tag 재사용. unkeyed는 전체 인덱스. 이전 노드 한 번 소비 |
| 교체 경계 | key 변경·tag 변경·부모 변경·삭제 후 복귀 | 정체성 경계에 맞는 새 DOM. 전역 key 검색·삭제 노드 부활 없음 |
| 계획 | oldIndex 중복/범위 밖/누락·remove 겹침·길이 오류 | 실제 DOM 변경 전 오류 |
| 폼 | attrs 초기값과 프로퍼티 현재값 불일치 | 현재값 읽기. 무변경 plan도 실제값만 보정, History 새 항목 없음 |
| 이벤트 | 콜백 교체/삭제·key 이동·노드 제거 | 이전/삭제 이벤트 호출 없음. 이동만으로 중복 리스너 없음 |
| ID | 중복/빈/공백 ID·누락/외부 참조·지원 밖 ARIA | 연결 전 오류. scoped 실제 ID가 VDOM/HTML/History로 유출되지 않음 |
| scope | 다른 컨테이너·중첩/중복 소유·해제 후 사용 | 오류. 정상 해제 전 바인딩과 관리 DOM 회수 |
| History | A,B,C 중 B에서 무변경·속성 순서 차이·수정 후 B 복귀 | B·forward C·스냅샷 참조 유지. push 직접 호출도 무효 |
| History | A→B→A | 현재와만 비교해 세 번째 저장. 전역 중복 제거하지 않음 |
| 이동 | 미적용 편집과 경계·유효 이동 | 경계 무효 이동은 편집 보존. 유효 이동은 양쪽/입력 동기화 |
| 상태 | lazy init·함수 값·두 슬롯·오래된 setter | 초기화 횟수·독립 값·setter 참조·generation 무효화 |
| deps | 생략/[]/고정 길이·NaN·+0/-0·새 객체 | 임시 Object.is·얕은 복사·mode/길이 변경 거부 |
| Hook | 외부/자식 호출·개수/종류 변경·렌더 setter | candidate 폐기·마지막 성공 상태 유지·active 문맥 해제 |
| Effect | setup/cleanup 예외·잘못된 반환·Promise | 다른 슬롯 계속. 성공 DOM/State는 되돌리지 않음. 소비한 cleanup 중복 없음 |
| 재진입 | setup/갱신 cleanup/제거 cleanup에서 unmount | 실행 중 제거는 먼저 거부. 실제 수락된 제거와 구분. 사용자 함수가 넘기지 않은 자원을 런타임이 해제했다고 판정하지 않음 |
| 갱신 큐 | Effect setter·연속 updater·무한 루프 | 현재 Effect 순회 뒤 FIFO. 임시 한도 초과를 멈추고 재귀 스택 폭주 방지 |
| 렌더 실패 | 렌더/Memo/검증에서 throw | 마지막 성공 DOM/State/Memo/Props·기존 Effect 유지, 새 setup 없음, 정상 입력으로 재시도 |
| DOM 반영 실패 | 일부 변경 후 throw | candidate/새 setup/대기열 미확정. 이전 노드 캡처 cleanup 한 번. 표시 복구 여부와 무관하게 Phase 2 faulted |
| faulted | 오래된 setter/이벤트·update/mount | 갱신 불가. unmount 완료 후 명시적 mount만 새 상태·새 setup |
| Phase 1 복구 | 부분 적용/이동/무변경 동기화 실패 | 기존 scope로 복구. History/appliedTree/forward 유지, busy 해제. 복구 성공이면 편집 재개 |
| 복구 자체 실패 | DOM 재생성·제거·cleanup 추가 오류 | 종류별 오류 보고. 실행 재개하지 않음. 남은 DOM/scope를 제거 재시도에서 회수 |

## 구현 후 경계의 종결 상태

아래는 초기 테스트 작성 때의 추가 확인 항목을 현재 증거와 대조한 결과다. 상세 실행·범위는 [최종 기록](../docs/implementation/stage-10.md)을 따른다.

1. native 실패 주입: 최초 mount·제거·committing/recovering 재진입의 독립 단위 12개·Chromium 12개를 보강해 통과했다. 모든 native 작업의 모든 실패 조합을 전수 검증한 것은 아니며 완전 원자성은 채택한 완료 조건 밖이다.
2. controller: 기존 History 단위·브라우저 실패 주입으로 이력·편집·복구 결과와 재시도 경계를 확인했다. private 필드 전수 관찰용 API를 새로 요구하지 않는다.
3. 호스트·콜백: 실제 앱 회귀에서 faulted/inert·오류 유지·정리·명시적 재시작을 확인했다. 기존 수명·오래된 setter/이벤트 검사를 함께 실행했다.
4. TECH-01~06과 공통 렌더러 재사용은 구현 검증 담당이 실제 코드 경로·import 구조로 확인했다.
5. 포커스 복구·좁은 화면 키보드 조작은 현재 회귀에 포함한다. 모든 재정렬의 포커스/선택 범위 보존, 최소 DOM 이동 횟수, SSR/Fiber/동시 렌더링/Strict Mode/선택 Batching은 완료 조건 밖이다.
