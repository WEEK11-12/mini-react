# 테스트 작성·실행 결과

이 문서는 2026-11-09 테스트 전용 단계의 과거 기록이다. 구현 착수 후 현재 결과는 [1단계 구현·검증 기록](../docs/implementation/stage-one.md)을 참조한다.

검증일: 2026-11-09 KST. 마비카 검토의 승인된 9개 항목을 반영한 재검증 기록이다. 테스트 전용 단계이며 제품 기능은 구현·검증 완료 상태가 아니다.

## 환경

| 항목 | 실제 확인값 |
| --- | --- |
| Node.js | v24.14.1 |
| npm | 11.11.0 |
| TypeScript | 7.0.2 |
| Vitest | 5.1.0 |
| jsdom | 29.1.1 |
| Playwright | 1.65.0 |
| Chromium | 158.0.8127.18 |

최초 설치에서 jsdom 31의 Node 엔진 경고를 확인해 호환되는 29.1.1로 변경했다. 이번 수정은 의존성 버전을 변경하지 않았다. 최초 설치 시 의존성 감사의 취약점 0건 보고는 제품 코드 보안 검토를 대체하지 않는다.

## 실행

작업 위치: `/Users/hyeonji/Documents/Jungle/mini-react/tests`.

| 검사 | 명령 | 실제 결과 |
| --- | --- | --- |
| 테스트 타입·설정 검사 | `npm run typecheck` | 통과, exit 0 |
| 검증환경·관찰 반례 검사 | `npm run test:harness` | 2개 파일·9개 통과 |
| 전체 단위/계약 테스트 | `npm test -- --reporter=json --outputFile=reports/unit.json` | 11개 파일·238개 수집. 환경 9개 통과, 제품 계약 229개 실패. pending 0, exit 1 |
| 안전한 브라우저 목록 | `npm run test:browser:list` | 28개 목록 수집, exit 0. 목록 실행 전후 browser.json SHA-256 동일 |
| 실제 Chromium 실행 | `npm run test:browser` | 2개 파일·28개 모두 앱 서버 연결 거부로 실패. skipped/flaky 0, exit 1 |
| 카탈로그 생성 | `npm run test:catalog` | 실 runner JSON에서 266개 생성: 제품 257개 + 환경 9개. 중복·집계 불일치 없음, exit 0 |
| 공백·링크·수정 범위 검사 | `git diff --check`와 별도 새 파일/해시 검사 | 공백·깨진 로컬 링크 0건, tests 밖 기존 파일 해시 일치, 삭제 파일 없음 |

## 지적별 수정 위치와 근거

아래 위치는 이번 수정본 기준이며 제품 assertion 통과를 뜻하지 않는다.

| 항목 | 수정 위치 | 해결한 관찰 문제 |
| --- | --- | --- |
| 1. DOM 정체성 | `support/observations.ts:4`, `renderer/patch.test.ts:117,147`, `dom-scope.test.ts:176–177`, `dom-reader.test.ts:97`, `prevalidation.test.ts:53` | 길이와 인덱스별 `toBe`. VDOM 구조·문자열 배열의 `toEqual`은 유지. runtime 목록도 같은 helper 사용 |
| 2. 앞 삽입 | `browser/phase-two.spec.ts:55–81`, `support/prepend-observation.ts:9` | 삽입 직전 key/DOM 확보, 길이 +1·새 첫 key·전체 기존 순서·기존 전원 참조 검사. 역순 자체의 정체성도 먼저 확인 |
| 3. 역변환 거부 | `renderer/dom-scope.test.ts:180–223` | 참조 없는 단독 p[id]의 foreign/unissued를 분리. for·단일/목록 ARIA는 외부 실제 ID가 현재의 유효 논리 대상인 fixture로 pass-through와 대상 누락을 구분 |
| 4. faulted 이벤트 | `runtime/function-component.test.ts:856–938` | setter와 독립적인 VDOM click spy를 정상 호출한 뒤, 이전/복구 노드 모두 호출 증가 없음. Effect 네이티브 change 리스너 정리와 재마운트의 정상 click도 확인 |
| 5. recovering cleanup 실패 | `runtime/function-component.test.ts:944–1012` | 첫 cleanup이 실제 리스너 해제 후 throw. 다음 정리 계속·순서·각 1회·표시 복구·faulted·후속 unmount 중복 없음 |
| 6. 목록 reporter | `package.json:12`, `README.md` | `playwright test --list --reporter=list`. 실행 증거 덮어쓰기 방지 |
| 7. 폼 단독 Diff | `renderer/diff.test.ts:113–130` | disabled/checked 각각 같은 값 false와 양방향 변경 true. 기존 브라우저 checkbox 검증과 별개의 작은 사례 |
| 8. 별도 동등 객체 무쓰기 | `renderer/patch.test.ts:172–210` | 같은 객체와 별도 객체를 모두 검사. attrs 열거 순서는 다르게, 이벤트 함수 참조는 동일하게 보존. 폼/리스너/DOM 쓰기와 참조 유지 확인 |
| 9. keep 과도한 강제 | `renderer/diff.test.ts:21–50` | reuse·oldIndex·정확한 목표 next만 검사하고 NodePlan.op=keep을 필수로 강제하지 않음. create/replace 경계·잘못된 인덱스 검사는 유지 |

### 실제로 실행된 최소 반례

`harness/observations.test.ts`는 실 jsdom과 설치된 Vitest matcher, 실제 브라우저 테스트와 공유하는 관찰 assertion만 사용한다. 제품 대체 구현은 없다.

- 구조가 같은 복제 노드와 동일 구조 노드의 순서 교환은 배열 `toEqual`을 통과하지만 `expectSameNodes`는 거부했다.
- 기존 브라우저의 filter→every predicate는 앞 삽입 no-op·기존 항목 전부 삭제 반례를 모두 허용했다. 수정된 공유 `assertPrepend`는 두 반례를 거부했다.
- 복제 교체·기존 순서 변경·기존 key 재사용 반례도 거부하고, 새 첫 항목+기존 전원 참조/순서 보존의 정상 fixture는 허용했다.

이는 **테스트 관찰 로직의 검출력 검증**이다. 실제 core/앱의 동작 통과로 해석하지 않는다.

## 실패 원인과 보고서

### 단위/계약

제품 테스트 229개는 모두 `[IMPLEMENTATION_MISSING]` 오류다. 다른 실패 원인은 보고되지 않았다. `src/core/*`, `src/playground/history.ts`가 없어 로더에서 중단되므로 제품 assertion 본문은 실제 구현에 대해 실행되지 않았다.

- 실행 JSON: `reports/unit.json`
- 실행 로그: `reports/unit-run.log`
- 카탈로그: [test-cases.json](test-cases.json)

### 브라우저

28개 모두 `http://127.0.0.1:5173/`의 `net::ERR_CONNECTION_REFUSED`다. 실제 Chromium 프로세스는 실행됐지만 앱이 없어 사용자 흐름 assertion에 도달하지 못했다. 가짜 UI를 만들거나 skip으로 숨기지 않았다.

검토 중 목록 수집으로 덮어써졌던 `reports/browser.json`은 이번 **실제 Chromium 실행** 결과로 새로 생성했다. 카탈로그는 이 새 JSON과 새 unit JSON에서 재생성했다.

- 실행 JSON: `reports/browser.json`
- 실행 로그: `reports/browser-run.log`
- 목록 로그: `reports/browser-list.log`
- 목록 실행 직전 보고서 해시: `reports/browser-before-list.sha256` (전후 동일함을 실제 assert로 확인)
- 실패 artifacts: `test-results/`

runner 실패 원인·중복 이름·카탈로그 수는 프로그램으로 다시 검증했다. JSON/로그/artifacts는 `.gitignore` 대상이다.

## 파일별 실제 수집

| 파일 | 케이스 수 |
| --- | ---: |
| `renderer/dom-reader.test.ts` | 24 |
| `renderer/validation.test.ts` | 45 |
| `renderer/diff.test.ts` | 21 |
| `renderer/patch.test.ts` | 29 |
| `renderer/prevalidation.test.ts` | 20 |
| `renderer/dom-scope.test.ts` | 15 |
| `runtime/function-component.test.ts` | 49 |
| `runtime/edge-contracts.test.ts` | 7 |
| `history/history.test.ts` | 19 |
| `browser/phase-one.spec.ts` | 24 |
| `browser/phase-two.spec.ts` | 4 |
| `harness/project-loader.test.ts` | 1 |
| `harness/observations.test.ts` | 8 |

수치는 실제 runner JSON에서 집계했다. TC 번호는 현재 카탈로그 식별자이며 요구사항 ID를 재번호화하지 않는다.

## 변경 범위와 미검증 항목

- 변경은 `tests/`의 테스트·검증 지원 함수·package script·README/검증 기록·카탈로그로 제한했다. production src/·가짜 core/앱·기존 요구사항/설계 문서를 생성/수정하지 않았다. 커밋·푸시·배포하지 않았다.
- 작업 시작 시점의 파일 해시와 대조해 `tests/` 밖 기존 파일 보존을 확인했다. 전체 tests가 기존부터 untracked 상태여서 `git diff`만으로 신규 파일의 공백/범위를 판정하지 않는다.
- 제품 assertion과 실패 주입의 실제 core 검출력은 구현 연결 후 재검증해야 한다. API 생성자/export/UI locator는 기존의 명시적 연결 가정이다.
- 최초 mount 중 native DOM 실패, DOM 제거 자체 실패, 일부 committing/recovering 직접 unmount 재진입·호스트 faulted 조작 차단 등 기존에 기록한 미검증 경계는 유지한다. 이번 테스트 관찰 수정으로 이 범위까지 통과했다고 하지 않는다.
- 오류 클래스·AggregateError 형태·모든 오류의 보고 UI는 미확정 계약이므로 임의로 강제하지 않는다. recovering cleanup 자원은 사용자 cleanup이 실제로 해제한 것만 관찰한다.
