# 계약 테스트

## 현재 구현 단계

2026-11-12 채택 범위의 검증을 종결했다. 설계·정책·실행 결과, 중단된 증거 대조의 보완 및 구현 검증 담당의 제한 최종 승인은 [최종 검증 기록](../docs/implementation/stage-10.md)을 따른다.

stage-01~09의 범위별 구현·검증 기록은 [단계 기록](../docs/implementation/stage-09.md)에 연결되어 있다. 과거 실패 기록과 Vitest 518개·Chromium 180개 통과 기록은 당시 결과다. 최종 구현 검증에서는 실제 소스에 독립 오류 주입을 보강해 Vitest 530개, Chromium 192개가 모두 통과했다(실패·skip·flaky 0). Chromium에는 실제 앱 통합 흐름과 라이브러리 native DOM 검사가 함께 포함된다. macOS arm64, Node 24.14.1, Playwright 1.65.0, Chromium 158.0.8127.18을 사용했고 실제 BFCache 사례는 Chrome 157.0.8103.39에서 실행했다. 데스크톱·375px viewport의 두 Phase 스크린샷도 확인했다. 다른 브라우저 엔진·실제 모바일 기기와 모든 시각·접근성 조건을 검증한 것은 아니다.

원본 runner·카탈로그·명령·오류 경계별 상세 결과는 무시되는 `reports/final-verification-20261111-225421/`의 `unit-final.json`, `browser-final.json`, `test-cases.json`, `runner-summary.json`, `report.md`에 보관한다. 현재 카탈로그는 722개 고유 사례(제품 713개·하네스 9개)이며 신규 단위 12개·native Chromium 12개도 이 합계에 포함된다. 최초 전체 Chromium의 26개 실패는 탭 전환·접근성 이름에 대한 구버전 테스트 연결 불일치였으며 `browser-full.json`에 따로 보존했다. 실제 탭 조작과 편집 패널/미리보기 이름의 구분만 보정하고 기능·DOM 정체성·오류·정리 기대값은 유지한 뒤 전체를 다시 실행했다. 제품 소스는 수정하지 않았다.

새 테스트를 작성할 때는 [테스트 작업 지침](AGENTS.md), [테스트 코드 컨벤션](conventions.md)을 먼저 확인한다. 단계별 독립 검증 테스트는 대상별 `review/`에 분리하되 일반 계약·구현 스모크와 함께 실행한다. 과거 runner 스냅샷은 무시되는 `local-history/`에 로컬 보관하며 현재 총계가 아니다.

이 폴더는 `docs/requirements.md`와 `docs/design/`을 기준으로 작성한 **테스트 전용 작업 공간**이며 프로젝트의 실제 `src/`를 검증한다. 테스트를 통과시키기 위한 대체 구현은 두지 않는다. 원본 요구사항과 설계의 확정 상태도 변경하지 않는다.

## 실행

프로젝트 루트에서 다음 명령을 실행한다.

```sh
cd tests
npm ci
npm run check
npm run typecheck:core
npm run test:harness
npm test
npx playwright install chromium
npm run test:browser:list
# 프로젝트 루트에서 npm run dev를 별도 실행한 뒤
MINI_REACT_BASE_URL=http://127.0.0.1:5173 npm run test:browser
```

- `npm test`: renderer·runtime·History 계약과 검증환경 자체 검사. 실제 실패는 runner JSON과 해당 단계 보고서를 기준으로 분류한다. 모든 공개 테스트 실행 스크립트(`test`, `test:unit`, `test:harness`, `test:watch`, `test:browser`, `test:stage-one`, `test:stage-one:browser`)는 실행 전 컨벤션 검사를 자동 실행한다.
- `npm run check`: 테스트 파일 배치·명명 및 `.only`/`.skip`/`.fixme`/`.todo` 금지 검사 후 테스트 TypeScript 타입 검사. `npm run check:conventions`만 단독 실행할 수도 있다.
- `npm run test:harness`: 모듈 로더와 테스트 관찰 로직을 검사한다. 실제 DOM 복제·no-op·삭제 반례로 정체성/앞 삽입 assertion의 검출력을 확인하며, 제품 기능 통과를 뜻하지 않는다.
- `npm run test:browser:list`: `--reporter=list`로 목록만 수집한다. `reports/browser.json` 실행 증거를 덮어쓰지 않는다.
- `npm run typecheck`: 테스트 코드의 타입과 설정을 검사한다. 제품 코드의 동작 검증과 다르다.
- `npm run test:browser`: **실제 앱을 프로젝트 루트에서 `npm run dev`로 별도 실행한 뒤** 수행한다. 서버 미실행의 연결 거부는 브라우저 환경 차단이지 인수조건의 assertion 실패가 아니다.
- 앱 대신 가짜 페이지·가짜 구현을 제공하거나, 미구현 실패를 `skip`/`todo`/성공 처리하지 않는다.

JSON 기록 예시:

```sh
npm test -- --reporter=json --outputFile=reports/unit.json
npm run test:browser
npm run test:catalog
```

마지막 명령은 두 runner의 실제 JSON 결과에서 무시되는 `reports/test-cases.json`을 재생성한다. 제목·파일·요구사항 ID·현재 실패 원인을 기록하고 중복 및 집계 불일치를 검사한다. 카탈로그를 만들기 전에 `reports/unit.json`과 `reports/browser.json`이 모두 있어야 한다.

`reports/`, `test-results/`, `local-history/`, 의존성은 버전 관리에서 제외한다. 의존성의 정확한 버전은 `package-lock.json`에 고정한다.

## 범위와 상태

- 요구사항별 연결: [검증 대응표](test-plan.md).
- 설계의 불명확한 접점·UI 연결 규칙: [테스트 연결 계약](contracts.md).
- 현재 단계 결과는 [최종 검증 기록](../docs/implementation/stage-10.md)과 해당 runner를 확인한다. 초기 테스트 작성 단계의 과거 스냅샷은 제출물에서 제외한다.
- 각 테스트 이름의 `[VDOM-01]` 등은 요구사항 ID다. `[임시 OPEN-…]`는 작성 당시 임시 설계 출처를 남긴 추적 표기다. 현재 정책 채택 상태는 [요구사항](../docs/requirements.md)과 [결정 기록](../docs/design/temporary-decisions.md)을 따르며 과거 이름만으로 미결정 상태라고 판단하지 않는다. 파일 상단·각 영역 README의 당시 전제와 최신 계약을 구분한다.
- 스냅샷 문자열만 비교하지 않고 DOM 객체 동일성, 실제 프로퍼티, 이벤트 호출, MutationObserver/쓰기 계측, cleanup 소유권, 실패 후 재시도 가능 여부를 관찰한다.
- 원본 설계의 인터페이스가 바뀌면 모듈 로더 바인딩·생성자·UI 선택자부터 맞춘다. 테스트를 통과시키려고 인수조건을 약화하지 않는다.
- 구현 전에는 모든 assertion의 타당성을 실제 제품으로 대조할 수 없다. 구현 후 정상 사례 통과뿐 아니라 결함 주입 사례가 실제로 실패를 잡는지 다시 검증해야 한다.

## 디렉터리

| 경로 | 역할 |
| --- | --- |
| `support/` | 실구현 모듈 로더와 테스트 DOM 정리 |
| `harness/` | 테스트 환경 자체의 동작 검사 |
| `renderer/` | DOM 읽기·검증·Diff·Patch·key·ID 격리 |
| `runtime/` | 컴포넌트·State·Effect·Memo·수명·실패 처리 |
| `history/` | 저장·탐색·스냅샷 독립·무변경 보존 |
| `browser/` | 실제 Chromium 사용자 흐름과 실패 주입 |
| 각 대상의 `review/` | 단계별 독립 검증·재검토 회귀 테스트 (실행 대상) |

## 판단 기준

1. 테스트 발견·타입 검사 성공과 제품 인수조건 통과를 구분한다.
2. 누락 모듈 오류가 해소된 후 각 assertion의 통과를 확인한다.
3. 브라우저 테스트는 앱 실행과 UI 선택자 연결 후 다시 수행한다.
4. TECH 제약처럼 블랙박스 동작만으로 증명할 수 없는 내용은 구조 검토를 병행한다.
5. 임시 정책이 바뀌면 기대값을 검토한다. 그 변경은 현재 확정 요구사항을 몰래 변경하는 절차가 아니다.
