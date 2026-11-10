# 4단계: 편집·Patch·History 탐색 UI

상태: 구현·기본 타입 점검 및 검증 에이전트 최종 재검토 승인 완료. 승인은 4단계 Phase 1 범위에 한정하며 전체 프로젝트·전체 suite 통과를 뜻하지 않는다.

## 범위

[3단계](stage-three.md)의 공통 렌더러를 재사용하여 Phase 1의 [EDIT](../requirements.md#edit), [VIEW-01~03](../requirements.md#view), [HIST](../requirements.md#hist)를 구현한다. [실습·이력 설계](../design/playground-history.md)를 따른다. HTML 지원 범위·초기 이력·선형 분기·메모리 저장·이동 시 편집 폐기·오류 복구는 기존 OPEN 임시 선택을 전제로 하며 확정하지 않는다. Component·Hook·Phase 2 시연은 이번 범위가 아니다.

## 변경

- `src/playground/history.ts`: HTML 모드 검증, 재귀 복사·동결한 논리 스냅샷, peek/commitMove, 실변경 분기 및 무변경 forward 보존.
- `src/playground/html-editor.ts`: 분리 template 파싱과 검증, 논리 ID·key·현재 폼 값을 보존하는 이스케이프 직렬화.
- `src/playground/controller.ts`: 영역별 scope, 편집 미리보기, 폼 관찰·실제 값 복원, 증분 Patch, 성공 후 이력 확정, 오류 복구 및 종료 시 자원 해제.
- `index.html`, `src/main.ts`, `src/style.css`: 실제 앱 진입점과 반응형 Vanilla UI. 영역·입력·버튼은 기존 브라우저 계약의 test ID를 제공한다.
- `package.json`, `package-lock.json`, `.gitignore`: 실행에 필요한 Vite만 추가한다. 기존 core와 tests 설정은 변경하지 않는다.

## 자체 점검

구현 에이전트가 `tests`에서 실행했다.

| 명령 | 결과 |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run typecheck:core` | exit 0 |

루트 `npm install --ignore-scripts`는 성공했다. 테스트 실행·앱 실행·브라우저·회귀·최종 검토는 검증 에이전트 담당이며 구현 에이전트는 실행하지 않았다.

## 검증 에이전트 피드백

최초 검토는 수정 요청이다. 저장소 외부 임시 작업 디렉터리의 `final-review.txt`를 확인했다.

| 지적 | 수정 |
| --- | --- |
| F1: BFCache 복원 시 종료 상태로 남음 | `pagehide.persisted`가 true이면 컨트롤러와 scope를 유지하고 실제 문서 종료에서만 해제한다. |
| F2: 비열거 own 데이터가 스냅샷·직렬화에서 유실 | attrs/domProps는 core와 같은 own 이름 범위로 복사하고 VNode 필드는 명시적으로 복사한다. |

최초 검토에서 기존 단위 343개 중 287개 통과·56개 후속 Component 미구현 실패, 추가 단위 18개 중 16개 통과·F2 반례 2개 실패였다. 실제 앱 Phase 1 Chromium 24/24, 1~3단계 라이브러리 Chromium 회귀 20/20이 통과했다. 추가 브라우저 12개 중 11개 통과·F1 반례 1개 실패, 후속 Phase 2 브라우저 4개는 미구현 실패였다. production build 및 새 검증 파일 포함 타입 검사는 exit 0이었다. 전체 통과 또는 승인으로 표시하지 않는다.

구현 에이전트는 F1·F2만 수정하고 `tests`에서 `npm run typecheck:core`를 재실행해 exit 0을 확인했다. 테스트는 중복 실행하지 않았다.

### 최종 재검토 승인

검증 에이전트는 F1·F2 해결 및 직접 영향 경계의 회귀 없음으로 4단계 Phase 1 범위를 승인했다. 구현 에이전트는 `stage-four-re-review.txt`를 읽고 원본 runner JSON을 직접 집계했으며, 승인 manifest와 현재 제품 파일 13개(src 전체·index.html·package.json)의 SHA-256이 모두 일치함을 확인했다. 승인 이후 제품 코드를 수정하지 않았다.

| 제한 재검토 | 결과 |
| --- | --- |
| 최초 F2 단위 반례 | 2/2 통과, 무관한 16개는 이름 필터로 미선택 |
| 추가 직접 영향 단위 | 8/8 통과 |
| 최초 F1 실제 BFCache 반례 | 1/1 통과 |
| 추가 BFCache·정상 종료 브라우저 | 3/3 통과 |
| 새 검증 지원 포함 tests 타입 검사·production build | 각각 exit 0 |

브라우저 두 runner 모두 skipped·unexpected·flaky는 0이다. 실제 BFCache 반복 복귀 후 기존 DOM 객체·scope·미적용 편집·이력 유지와 후속 편집을 확인했다. 실제 non-persisted 문서 이동 시 정리도 확인했으며, BFCache 복원 후 종료 분기의 별도 합성 이벤트 검사와 구분한다. 비열거 root·element·text 필드, attrs/domProps, 독립 복사·동결·왕복·무변경 forward 보존·잘못된 입력 거부를 확인했다.

기존 전체 suite·기존 통과 브라우저·회귀는 재실행하지 않았다. 최초 검토 결과와 이번 제한 재검토를 구분하며 후속 미구현 실패가 해결됐다는 뜻이 아니다.

보고서와 원본 JSON은 검증 에이전트의 저장소 외부 임시 작업 디렉터리에 보관되며 저장소에는 포함되지 않는다. 파일명은 `stage-four-re-review.txt`, `re-review-original-unit.json`, `re-review-focused-unit.json`, `re-review-original-browser.json`, `re-review-focused-browser.json`, `re-review-sha256-manifest.json`이다. 재현 명령·환경·전체 소스 해시는 보고서에 있다.

검증 에이전트가 추가한 파일은 `tests/history/stage-four-review.test.ts`, `tests/history/stage-four-re-review.test.ts`, `tests/browser/stage-four-review.spec.ts`, `tests/browser/stage-four-re-review.spec.ts`다.

## 남은 범위

FunctionComponent·Hook·Phase 2 시연은 미구현이다. 예상하지 못한 DOM 오류는 기존 scope로 전체 재생성하여 복구하므로 실패 경로의 노드 정체성은 보장하지 않는다. 복구도 실패하면 새로고침 안내와 함께 편집·적용·이동을 중단한다. 커밋·푸시·배포하지 않는다.
