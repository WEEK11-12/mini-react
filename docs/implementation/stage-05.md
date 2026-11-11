# 5단계: 함수형 컴포넌트와 FunctionComponent 생명주기 구현

상태: 함수형 컴포넌트·FunctionComponent 생명주기 범위의 구현·기본 점검 및 검증 에이전트 제한 재검토 승인 완료. Hook·Phase 2나 전체 suite 승인과는 구분한다.

## 범위

[4단계](stage-04.md)의 공통 렌더러를 이용해 [COMP-01~02](../requirements.md#comp), [TECH-03~04](../requirements.md#tech-03) 및 Props 갱신의 부분 DOM 재사용을 구현한다. [컴포넌트 실행 설계](../design/component-runtime.md)의 반환값·key 전달·mount/update/unmount와 오류 시 관리 DOM 정리 계약을 따른다. `hooks` 배열은 명세된 클래스 필드로 제공하지만 이번 단계에서 Hook 슬롯은 생성하지 않는다. State·useState·useEffect·useMemo 및 Phase 2 시연은 후속 단계다.

## 변경

- `src/core/vdom.ts`: `h`의 host/자식 함수 실행, 결과 정규화 및 key 전달·충돌 검증.
- `src/core/component.ts`: 전용 DOMScope에 초기 mount, Props 재실행·Diff/Patch update, unmount·재마운트, 실패 후 표시 복구와 faulted 처리.
- `src/core/dom-bindings.ts`: 적용 실패 시 분리된 노드까지 포함한 이벤트 해제 지원.
- `README.md`: 단계 기록 링크 추가.

## 자체 점검

`tests`에서 `npm run typecheck:core`, `npm run typecheck`를 실행해 각각 exit 0, 루트 `npm run build`를 실행해 exit 0을 확인했다. 저장소 외부 jsdom 스모크에서 mount → Props update(노드 동일성) → unmount → 재마운트를 실행해 성공했다. 테스트 suite·브라우저·회귀 및 최종 검토는 검증 에이전트 담당으로 미실시다.

## 남은 범위

루트 State/Hook 및 Phase 2 시연이 남았다. OPEN 정책은 확정하지 않았다. 커밋·푸시·배포하지 않았다.

## 검증 에이전트 최초 검토와 수정

최초 검토는 수정 요청이다. 5단계 전용 단위 38개 중 36개 통과·2개 실패, Chromium 8개 중 6개 통과·2개 실패다. 기존 renderer·History·하네스 단위 회귀 313개 통과, 브라우저 회귀는 환경 설정 보정 후 고유 59개 통과다. Hook 모듈 부재로 차단된 후속 runtime 56개는 이번 단계 실패로 집계하지 않는다. 보고서와 원본 runner JSON은 검증 에이전트의 저장소 외부 임시 작업 디렉터리에 보관했다.

| 지적 | 수정 |
| --- | --- |
| 제거 중 DOM 삭제 실패 시 기존 이벤트가 faulted에서도 실행됨 | `unmount()`에서 DOM 제거 전에 소유 이벤트를 해제하고 scope를 유지해 제거 재시도를 허용한다. |
| DOM 적용 및 복구 모두 실패하면 최초 오류가 유실됨 | 두 오류를 `AggregateError`에 각각 보존한다. |

수정 후 영향받는 `npm run typecheck:core`와 저장소 외부 jsdom의 정상 mount/update/unmount/재마운트 스모크를 재실행해 각각 exit 0을 확인했다. 두 실패 경로와 인접 회귀는 아래 제한 재검토에서 검증 에이전트가 확인했다.

### 제한 재검토 승인

검증 에이전트는 F1·F2와 직접 인접 경계를 재검토하고 5단계 범위를 승인했다. 최초 실패 사례 2개와 신규 인접 사례 6개가 단위에서 8/8, 실제 Chromium에서 8/8 통과했다. 단위 이름 필터로 제외된 기존 36개 및 최초 통과한 브라우저 6개, 기존 전체 회귀는 다시 실행하지 않았다. 새 검증 파일 타입 검사와 `git diff --check`는 exit 0이다. 이 결과를 최초 검토의 기존 통과 결과와 구분한다.

구현 에이전트는 `rereview-report.txt`와 원본 runner JSON을 읽고 각 실행 결과를 직접 집계했다. 승인 시점의 manifest에 포함된 14개 파일의 SHA-256이 일치하며, `src/core/component.ts`는 `2a3435282bc4c57197d4414145ae258acebc06aa9bdb3f4afd0356596977ec0b`였다. 승인 후 제품 소스는 수정하지 않았다. 승인 기록을 반영하기 위해 이 문서와 README만 갱신했으므로 두 문서의 해시는 승인 manifest와 달라진다.

보고서·원본 JSON·manifest는 검증 에이전트의 저장소 외부 임시 작업 디렉터리에 보관했다. 파일명은 `rereview-report.txt`, `rereview-unit.json`, `rereview-browser.json`, `rereview-product-sha256-after.json`이다. 검증 에이전트가 추가한 파일은 `tests/runtime/review/stage-five-review.test.ts`, `tests/runtime/review/stage-five-rereview.test.ts`, `tests/browser/review/stage-five-review.spec.ts`, `tests/browser/review/stage-five-rereview.spec.ts`, `tests/support/stage-five-entry.ts`, `tests/support/stage-five-rereview-cases.ts`다.
