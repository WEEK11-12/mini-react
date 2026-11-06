# 테스트 전략과 검증 근거

상태: 검증 설계 초안. 테스트 코드·실행 결과·도구·버전은 아직 없습니다. 아래는 통과 목록이 아닙니다.

## 1. 무엇을 증명할 것인가?

최종 HTML 문자열이 같다는 것만으로 충분하지 않습니다. 정확한 결과, 무관한 DOM 객체의 유지, 이벤트·Effect 수명, 실패 시 거짓 성공을 막는 동작을 함께 확인합니다.

| 수준 | 대상 | 대역 사용 | 증명하지 못하는 것 |
| --- | --- | --- | --- |
| 순수 단위 | 트리·Diff·deps·History | 브라우저 불필요 | 실제 DOM·브리지 의미 |
| 통합 | 루트·Hook·Patch·adapter 경계 | fake adapter 가능 | 실제 이벤트·포커스·proxy 수명 |
| 브라우저 | DOM identity·이벤트·입력·데모 | 실제 채택 환경 | 미지원 브라우저 호환성 |
| 설명·재현 | 문서·실행·사용자 설명 | 실제 코드·증거 사용 | 문서만으로 개인 이해 입증 |

## 2. 요구사항별 테스트 설계

| ID | 연결 | 입력·상황 | 반드시 확인할 것 |
| --- | --- | --- | --- |
| V-01 | FR-01~02, C-01~02 | 중첩·공백·빈 텍스트·빈 자식·미지원 태그·주석 | 구조 보존, 주석 거절로 인덱스 대응 유지, 입력 오류 경로 |
| V-02 | FR-03, C-03 | 지원 VNode 생성 후 capture | 정규화 동등성, value/checked property 보존 |
| V-03 | FR-04, C-04 | 동일·추가·삭제·종류·텍스트·속성 차이 | 정확한 연산·순서, 입력 불변, 결정성 |
| V-04 | FR-05, INV-01 | old → diff(old,new) → apply | capture 결과가 normalized new와 동등 |
| V-05 | NFR-02 | 텍스트만 변경, 동일 구조 반복, 사용자 입력 뒤 동일 VNode commit | input 객체 유지, 이미 목표와 같으면 쓰기 없음, 제어 property 차이만 복원 |
| V-06 | FR-05, C-04~05 | 연속 삭제·앞 삽입·중첩 교체·attr 제거 | 경로 밀림 없음, 부모 교체 뒤 하위 Patch 없음 |
| V-07 | FR-13, C-06 | A→B→C→back→D, 동일 Patch | 앞으로 이력 삭제, 스냅샷 독립, cursor·양쪽 결과 일치 |
| V-08 | FR-06, FR-08, C-07 | lifecycle 순서·자식 props | 잘못된 순서 오류, 반복 unmount 무변경, props 결과 |
| V-09 | FR-07, C-08 | State 둘·연속 updater·동일 값 | 슬롯 독립·최신값 기반 updater·setter identity·갱신 횟수 |
| V-10 | FR-09, C-09 | deps 생략·빈 tuple·변경·실패·재시도·unmount | 슬롯별 cleanup→setup 순서, 실패 슬롯의 다음 명시적 commit 재시도, commit 실패 시 미실행 |
| V-11 | FR-10, C-10 | 같은 deps·다른 deps·계산 예외 | 계산 횟수·반환값, 실패 결과로 캐시 교체 안 함 |
| V-12 | C-07~11, INV-04~06 | 조건부 Hook·종류 변경·렌더 setter·커서 예외 | 오류와 문맥 해제, deps 모드·길이 오류 |
| V-13 | FR-11, NFR-05 | handler A→B→제거·노드 교체·unmount | 현재 handler 한 번, 이전 참조·listener 정리 |
| V-14 | FR-12 | 최초 로드·편집·Patch | 실제에서 초기 읽기, 테스트 생성, 실제 부분 반영 |
| V-15 | FR-13, C-06 | 미적용 편집 중 이동·한쪽 갱신 실패 | 편집 폐기 표시, cursor 유지·중단·재초기화 |
| V-16 | FR-06~11 | 클릭·입력·Memo·Effect 데모 | 상태→함수→Diff→Patch 연결, 자식 props 갱신 |
| V-17 | NFR-04~08 | 입력 거절·commit/Effect 오류·정리 중 setter·키보드 | 코드 미실행, BROKEN 구분, DISPOSING 재진입 차단, 나머지 정리, 접근성 피드백 |

## 3. 핵심 테스트 예시

아래는 기대 동작 설명용 의사코드이며 실행 가능한 테스트 파일이 아닙니다.

~~~text
given: div 안의 p("0")와 input
remember: input 객체 참조
when: p("1")와 동일한 input을 포함하는 다음 트리와 diff하여 patch
then:
  p의 텍스트는 "1"
  input은 기억한 바로 그 객체
  committed_tree는 다음 트리
~~~

~~~text
given: Effect setup A가 cleanup A를 반환
when: 의존성 변경 commit 후 unmount
then: 기록 순서는 setup A → cleanup A → setup B → cleanup B
and: 실패한 렌더·commit에서 setup B는 실행하지 않음
~~~

C-11 비교는 True/1, NaN, +0/-0, 새 list, 동일 list, 사용자 __eq__ 부작용 여부를 검증합니다. deps tuple 자체와 원소 비교도 구분합니다.

## 4. 비교 기준과 계측

- 문자열 HTML의 속성 순서와 구조적 의미를 구분합니다. capture 정규화의 단위 테스트와 독립적인 DOM assert를 함께 사용해 동일한 버그를 왕복 테스트가 숨기지 않게 합니다.
- adapter 대역으로 create/remove/replace/text/attr/property/event 호출을 기록합니다.
- MutationObserver는 DOM 변경 관찰의 보조 도구입니다. input property 변경·callback 정리·레이아웃 비용 전체를 증명하지 않습니다.
- DOM identity는 직접 참조 비교로, 이벤트 수명은 실제 callback 횟수로 확인합니다.
- key 미지원의 위치 기반 재정렬 한계를 기대값에 명시합니다. 결과 문자열만으로 항목 identity 보존을 주장하지 않습니다.
- 성능을 말하려면 트리 생성·Diff·브리지·DOM commit·브라우저 표시 비용을 구분합니다. 현재 성능 수치는 없습니다.

## 5. 실패 주입

렌더 예외, 잘못된 VNode, DOM 경로 불일치, 여러 Patch 중간의 adapter 예외, cleanup·setup 예외를 주입합니다.

- 렌더 실패: 이전 DOM·committed_tree 유지, State 요청 보존·오류 노출.
- 같은 값 setter가 갱신을 생략한 경우에도 명시적 update로 실패한 렌더를 재시도할 수 있는지 확인합니다.
- commit 실패: BROKEN, 새 History·Effect 없음, 복구 전 추가 update 차단.
- Effect 실패: 이미 성공한 DOM 유지, 실패 시도의 State 요청 폐기, 다른 슬롯 계속 실행, 다음 명시적 commit에서 실패 슬롯 재시도.
- unmount 정리 실패: 하나의 실패로 다른 자원 정리를 생략하지 않음.

## 6. 실행 기록

현재 실행 명령은 없습니다. 런타임 결정 후 실제로 확인한 명령을 추가합니다.

~~~text
날짜·담당자:
관련 커밋·요구사항·계약·검증 ID:
환경: OS, Python, 브리지, 브라우저, 테스트 도구 버전
명령 또는 조작 절차:
기대 결과 / 실제 결과:
판정: 통과 / 실패 / 미실행
출력·테스트 이름·필요 시 캡처:
미지원·미검증 범위:
~~~

## 7. 완료 조건

- [ ] 관련 런타임·계약이 채택되어 있다.
- [ ] 요구사항에 연결된 단위·통합 테스트를 새로 실행했다.
- [ ] 실제 브라우저에서 identity·이벤트·폼·수명·데모 흐름을 확인했다.
- [ ] 실패 동작·지원 범위·재현 명령을 기록했다.
- [ ] 핵심 실행 흐름과 실제 React와의 차이를 설명할 수 있다.
- [ ] 미검증 영역을 완료·성능 향상으로 표현하지 않았다.
