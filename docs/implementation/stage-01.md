# 1단계: VNode · DOM 변환 · 초기 렌더링

> 이 문서는 해당 단계 당시의 구현·검토 기록이다. 아래의 미구현·미검증·제한 승인은 당시 범위이며 현재 잔여 작업 목록이 아니다. 최신 종결 판정과 범위 밖 항목은 [최종 검증 기록](stage-10.md)을 따른다.

상태: 1단계 구현·수정 완료, 검증 에이전트 최종 검토 승인. 기존 4건과 비열거 domProps 검증 우회의 재현 조건 해소를 확인했다. 승인은 이번 단계 범위에 한정하며 후속 단계 완료를 뜻하지 않는다.

## 범위

[VDOM-01](../requirements.md#vdom-01), [VDOM-02](../requirements.md#vdom-02), [PATCH-01](../requirements.md#patch-01)의 초기 생성 경로를 구현했다. [OPEN-01](../requirements.md#open-01)·[OPEN-09](../requirements.md#open-09)의 HTML/폼/ARIA 지원 범위와 실패 정책은 기존 임시 설계를 전제로 하며 확정 상태를 바꾸지 않았다.

| 파일 | 역할 |
| --- | --- |
| `src/core/vdom.ts` | VRoot/VElement/VText, text, 전체 트리 검증. key·ID 참조·속성/폼/이벤트·자료형 검사, 입력 불변 |
| `src/core/dom-policy.ts` | reader·검증·바인딩이 공유하는 지원 범위와 ID 목록 정규화 |
| `src/core/dom-reader.ts` | Element/DocumentFragment 읽기. 공백·빈 텍스트·data-key·현재 폼 값 보존, 논리 ID 역변환 |
| `src/core/dom-bindings.ts` | 컨테이너별 불투명 DOMScope, ID 정방향/역방향 Map, 소유권·수명, 초기 이벤트 바인딩 회수 |
| `src/core/patch.ts` | mountTree 초기 생성만 구현. 전체 검증·분리 DOM 준비 후 연결, 준비 실패 시 이벤트 회수 |
| `tsconfig.json` | 의존성 없는 core TypeScript 검사 |

`diff`와 `applyPlan`은 각각 2·3단계에서 구현한다. 빈 stub이나 대체 구현을 만들지 않았다. `h()`의 컴포넌트 작성·자식 호출 문맥과 FunctionComponent/Hook은 후속 단계이며, 이번 단계는 문서의 VNode 자료구조와 DOM 읽기/초기 생성에 집중한다.

## 사용과 수명

```ts
import { readDOM } from '../../src/core/dom-reader';
import { mountTree } from '../../src/core/patch';
import { createDOMScope, releaseDOMScope } from '../../src/core/dom-bindings';

const template = document.createElement('template');
template.innerHTML = '<p data-key="greeting">Hello</p>';
const tree = readDOM(template.content);
const container = document.createElement('div');
const scope = createDOMScope(container);
mountTree(container, tree, scope);
const restored = readDOM(container, scope);
container.replaceChildren();
releaseDOMScope(scope);
```

이 코드는 API 사용 예시이며 앱 구현이 아니다. `mountTree`는 빈 전용 컨테이너에만 사용한다. 관리 DOM은 해당 scope로 읽으며 해제 후 scope를 재사용할 수 없다. 정규화된 VRoot의 textarea는 value 프로퍼티를 사용하고, html 모드는 이벤트 함수를 허용하지 않는다. readDOM은 네이티브 이벤트를 복원하지 않는다.

## 검증

### 검토 지적 수정본

- 정규화된 VRoot의 ASCII 대문자 속성명은 거부한다. HTML 파서가 소문자로 읽은 정상 속성은 기존대로 허용하며 입력 VRoot를 변경하지 않는다.
- text input의 CR/LF와 textarea의 CR은 네이티브 value setter가 값을 바꾸므로 검증 단계에서 거부한다. textarea의 LF와 checkbox의 문자열 value는 이 제한 대상이 아니다.
- 이벤트 검증은 비열거·심볼을 포함한 own 키 전체를 검사한다. html 모드는 모두 거부하고 component 모드는 지원 이름의 함수만 허용한다. 초기 바인딩도 own 이벤트만 소비한다.
- 재검토에서 발견한 비열거 domProps 검증 우회도 수정했다. attrs·domProps 모두 own 키 전체를 검사하며 심볼·미지원 이름·잘못된 값은 거부한다. 초기 생성도 비열거 own attrs를 적용하고 폼 값·type은 own 프로퍼티만 소비한다.
- HTML input/button의 원본 type은 ASCII 대문자만 소문자로 정규화한 뒤 기존 지원 목록을 검사한다. 네이티브 `.type` fallback으로 미지원 type을 허용하지 않는다.

수정본의 `npm run typecheck`, `npm run typecheck:core`는 각각 exit 0이다. 테스트 실행·통과 확인·브라우저·회귀 검증은 검증 에이전트가 담당했으며 구현 에이전트는 중복 실행하지 않았다. 회귀 테스트는 `tests/renderer/initial-rendering.test.ts`에 있다. 수정 전 검증 에이전트는 유효한 RED를 확인했고, 수정 후 아래 결과를 근거로 1단계를 승인했다.

검증 에이전트 최종 재실행 결과:

| 검사 | 결과 |
| --- | --- |
| 1단계 단위 테스트 | 107/107 통과 |
| 전체 Vitest | 276개 중 116개 통과, 160개는 후속 모듈 미구현으로 실패 |
| 전체 Chromium | 초기 라이브러리 1개 통과, 앱 UI 28개는 서버 미구현으로 연결 거부 |
| 별도 실제 소스 Chromium 검사 | 기존 반례 해소 확인 및 추가 assertion 11개 통과 |
| ESLint·Prettier | 로컬 미설치로 미실행 |

최종 검토 보고서 `mini-react-stage-one-final-review.md`와 실행 JSON `mini-react-stage-one-final-review-*.json`은 검증 에이전트의 저장소 외부 임시 작업 디렉터리에 보존돼 있으며 이 저장소에는 포함되지 않는다. 저장소의 아래 최초 실행 기록·카탈로그는 과거 결과이며 최신 결과와 구분한다. 2단계는 시작하지 않았다.

### 최초 구현 당시 기록

프로젝트 루트에서 `cd tests && npm ci` 후 실행한다.

| 명령 | 실제 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm run typecheck:core` | 통과 |
| `npm run test:stage-one -- --reporter=json --outputFile=reports/stage-one.json` | 기존 reader 24 + validator 45 + 독립 초기 생성 12 = 81개 통과 |
| `npm run test:stage-one:browser` | 실제 src를 번들한 Chromium 테스트 1개 통과. 두 scope의 ID·label 연결과 클릭 격리, 현재 checked 읽기 확인 |
| 전체 Vitest JSON 실행 | 250개 중 90개 통과(제품 81·환경 9), 160개 후속 모듈 미구현으로 실패. 다른 실패 원인 없음 |
| 전체 Chromium 실행 | 초기 렌더링 1개 통과, 앱 UI 28개는 앱 서버 미구현으로 연결 거부. skip/flaky 없음 |
| `npm run test:catalog` | 실제 runner JSON에서 279개 재생성. 제품 270·환경 9 |

구현 전 대상 80개가 `[IMPLEMENTATION_MISSING]`로 실패하는 RED를 확인했다. 이후 ID 참조 전체 범위를 추가해 최종 대상은 81개다. 단위·브라우저 테스트의 초기 fixture/빌드 연결 오류는 수정 후 재실행했다.

`tests/browser/stage-one.spec.ts`는 실제 src를 Vite로 번들해 native host fixture에 주입한다. 가짜 renderer/앱을 만들어 통과시킨 것이 아니다. 데모·편집 UI는 구현하지 않으며 기존 앱 테스트 실패를 정상 동작으로 표시하지 않는다.

## 보고서

- 단계 단위: `tests/reports/stage-one.json`, `stage-one.log`
- 구현 전 RED: `tests/reports/stage-one-red.json`, `stage-one-red.log`
- 단계 Chromium 로그: `tests/reports/stage-one-browser.log`
- 전체 결과: `tests/reports/unit.json`, `browser.json`
- 초기 테스트 작성 단계의 카탈로그와 실행 기록은 제출물에서 제외하고 무시되는 `tests/local-history/`에 로컬 보관한다. 현재 실행 결과로 인용하지 않는다.

## 남은 범위

key의 실제 재정렬 정체성·무변경 쓰기 방지·부분 갱신은 Diff/Patch 단계에서 검증한다. 준비 완료 뒤 예상치 못한 DOM 연결 오류의 전체 원자성을 보장하지 않으며 후속 호출자의 복구 정책과 연결한다. 브라우저 앱 인수조건·History·컴포넌트·Hook은 후속 단계다. 커밋·푸시·배포하지 않았다.
