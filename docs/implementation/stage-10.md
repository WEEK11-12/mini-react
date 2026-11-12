# 10단계: 최종 검증과 문서 종결

상태: **프로젝트의 채택 범위 검증 완료**. 설계 검토·정책 채택·전체 실행·증거 대조·구현 검증 담당의 제한 최종 승인을 확인했다. 종결일: 2026-11-12.

실행일: 2026-11-11 · 중단 작업 확인 및 증거 보완일: 2026-11-12 · 기준 제품: `hyeonji-main`, `91e8b8a`

## 범위와 완료 기준

[요구사항](../requirements.md)의 채택된 필수 인수 조건, 이번 범위에 채택한 권장 EFF-04·재현 기록, [최종 설계 검토](../design/final-review.md)를 기준으로 판단한다. 새로운 기능을 구현한 단계가 아니라 기존 구현·검증의 남은 증거와 문서 상태를 종결하는 기록이다.

- 설계 검증 담당은 과제 제약·설계 불변조건을 검토하고, 운영 담당의 OPEN-01~15 정책 채택·인수 조건 동기화도 제한 재검토해 승인했다.
- 구현 검증 담당은 누락된 native 실패 경로를 독립 사례로 보강하고 전체 실행을 완료했다. 마지막 증거 대조가 승인 차단으로 남았고 최종 회신은 사용량 제한으로 중단됐다. 실행 실패와 회신 중단을 구분한다.
- 운영 담당은 2026-11-12 기존 산출물을 직접 확인해 원본 runner·카탈로그·현재 제품 해시를 대조했다. 전체 테스트나 설계 검토를 다시 수행한 것으로 기록하지 않는다.
- 제품 `src/`, `index.html`, 앱 의존성·설정은 이번 작업에서 변경하지 않았다. 테스트 연결 보정·독립 검증 사례·문서를 변경했으며 커밋·푸시·배포하지 않았다.

## 실제 실행 결과

| 검사 | 결과 | 증거 |
| --- | --- | --- |
| 앱 production build | exit 0 | `build.log` |
| 테스트 컨벤션·테스트 타입 | exit 0 | `check-final-tests.log`, `check-ui-bindings.log` |
| 제품 TypeScript | exit 0 | `typecheck-core.log` |
| 전체 Vitest | 530개 통과, 실패·pending·todo 0 | `unit-final.json` |
| 전체 Playwright Chromium | 192개 통과, 실패·skip·flaky 0, 시도 192회 | `browser-final.json` |
| 독립 native 실패 경로 | 단위 12개·Chromium 12개 통과, 전체 결과에 포함 | `runtime-failures-unit.json`, `runtime-failures-browser.json` |
| 카탈로그 대조 | 722개 고유 항목의 계층·파일·제목·상태가 원본 runner와 1:1 일치, 중복 0 | `test-cases.json`, `verification.json` |
| 제품 동일성 | 제품·설정 18개 현재 SHA-256이 검증 시작 manifest와 일치 | `product-before.json`, `product-after.json` |
| 기술 제약 | TECH-01~06 구조·호출 경로 검토 완료 | `tech-structure.json`, 구현 검증 보고서 |

Vitest 530개는 제품 단위 521개와 하네스 9개다. 브라우저 192개에는 실제 앱 사용자 흐름과 실제 소스를 번들한 라이브러리 native DOM 검사가 함께 포함되므로 모두 앱 UI 사례라고 표현하지 않는다. 신규 24개는 위 합계에 이미 포함되며 선택 실행·전체 실행을 중복 합산하지 않는다. QA-01은 모듈 실행 결과, QA-05는 환경·명령·이 기록으로 확인한다. 개별 제목에 요구사항 ID가 있다는 사실만으로 충족을 판정하지 않고 구조 검토·실행 결과·화면 관찰을 함께 사용했다.

## 첫 브라우저 실행 실패와 보정

최초 전체 Chromium은 192개 중 166개 통과·26개 실패였다. Phase 2가 기본 숨김 탭이 된 뒤 테스트가 실제 탭을 열지 않은 연결 불일치 25개와 편집 패널/내부 미리보기의 접근 가능한 이름을 혼동한 1개였다.

`tests/support/phase-navigation.ts`에서 실제 탭을 클릭하고 선택·표시 상태를 검사하도록 연결했다. 접근성 이름도 `테스트 영역` 패널과 내부 `미리보기`로 구분했다. DOM 강제 노출·강제 클릭·skip·timeout 확장·기능 기대값 삭제는 사용하지 않았다. 기존 기능·DOM 정체성·오류·정리 기대값은 유지했으며 최종 전체 실행은 192개 모두 통과했다. 최초 실패는 `browser-full.json`에 보존한다.

## 미검증 항목의 종결

| 기존 잔여 표기 | 확인 및 현재 처리 |
| --- | --- |
| stage-01~09의 후속 모듈 미구현·제한 승인·전체 suite 미실시 | 후속 구현과 현재 전체 실행으로 해소했다. 과거 단계 기록은 당시 이력임을 상단에 표시하고 원래 실패·미실행 결과를 보존했다. |
| 최초 mount native DOM 실패 | 분리 노드 속성 쓰기 후 실패, 연결 후 실패, 복구 clear 실패를 주입했다. candidate·Effect·대기열 폐기, 원본 오류, faulted·scope, 오래된 setter/이벤트 차단, 제거 후 새 수명을 확인했다. |
| DOM 제거 자체 실패 | 제거 전/후 실패와 cleanup 오류 조합에서 다른 cleanup 지속·리스너 해제·오류 보존·제거 재시도·중복 cleanup 방지를 확인했다. |
| committing/recovering의 직접 unmount 재진입 | 최초/업데이트 커밋 및 복구 cleanup/native 콜백에서 재진입 거부와 원래 작업의 계속 처리·faulted·명시적 제거 경계를 확인했다. |
| OPEN 정책 채택 대기 | 설계 검토를 근거로 운영 담당이 사용자의 위임 범위에서 기존 선택을 채택했다. 요구사항 본문·결정 표·설계·AGENTS에 동기화했다. 테스트의 `[임시 OPEN-…]` 제목은 작성 당시 식별자로 보존한다. |
| 화면 확인 미실시 | 실제 화면 캡처·판독과 조작으로 안내·역할 구분·오류·도움말·종료/복구·좁은 화면을 확인했다. 자동 테스트와 분리해 기록한다. |
| 최종 증거 대조 중단 | 운영 담당이 원본 runner와 카탈로그를 항목별 대조하고 제품 해시를 확인해 `verification.json` 등을 생성했다. 현재 테스트 manifest는 종결 시점 스냅샷이며 과거 실행 시점의 해시를 소급 증명하지 않는다. 변경 테스트 파일에서 최종 브라우저 runner 시작 이후 수정 흔적은 발견하지 않았다. |

## 환경과 화면 관찰

- macOS arm64, Node 24.14.1, npm 관찰값 11.11.0. 앱 Vite 7.3.8, 테스트 Vite 8.3.7, TypeScript 7.0.2, Vitest 5.1.0, jsdom 29.1.1, Playwright 1.65.0.
- 자동 검증 Chromium 158.0.8127.18, 실제 BFCache 검사는 Chrome 157.0.8103.39. 버전은 실행 산출물 `browser-versions.json` 기준이다.
- 구현 검증은 현재 소스를 별도 production build한 preview 서버에서 수행했고 제공 파일과 build를 대조했다. 서버 종료 결과는 `server-cleanup.json`에 기록했다.
- 운영 담당 화면 확인은 별도 browser harness의 HeadlessChrome 145.0.0.0, 1440×1100 및 390×844 viewport다. 이 버전을 Playwright 실행 버전으로 대체하지 않는다.
- 최초 편집 → 미리보기 → 적용 안내, 실제 영역/이력 경계, Phase 2 조작별 관찰 대상, 누적 계측 도움말, 입력 오류·종료·빈 목록 복구 안내를 확인했다. 설계 검증 담당도 일부 스크린샷을 직접 대조했다.
- 키보드 Enter 조작은 최종 Chromium의 좁은 화면 회귀에 포함된다. 운영 담당의 부분 키보드 관찰만으로 전체 동작을 입증하지 않는다.
- 시각 확인은 관찰한 안내·정보 위계·가독성의 검토이며 초회 사용자 이해도 연구·모든 접근성 기준 준수 인증·실기기 검증이 아니다.

## 재현 명령과 증거 보관

[테스트 안내](../../tests/README.md)의 앱 실행·테스트 명령을 따른다. 이미 통과한 아래 명령을 이번 증거 대조에서 반복 실행하지 않았다.

프로젝트 루트에서 `npm run build`, `tests/`에서 다음을 실행한다. 브라우저 검사 전 실제 앱 서버를 별도로 시작한다.

```sh
npm run check
npm run typecheck:core
npm test -- --reporter=json --outputFile=reports/unit.json
MINI_REACT_BASE_URL=http://127.0.0.1:5173 MINI_REACT_NAVIGATION_BASE_URL=http://127.0.0.1:5173 npm run test:browser
npm run test:catalog
```

정확한 기존 preview 실행 명령·출력 옵션·최초 실패·추가 관찰·실행 로그는 무시되는 `tests/reports/final-verification-20261111-225421/`의 `report.md`와 runner에 로컬 보관하며 버전 관리에 포함하지 않는다. 운영 화면 관찰은 `tests/reports/final-ui/`의 `report.md`, PNG 및 `final-preservation-observation.json`에 보관한다. 초기 `browser-observations.json`은 중간 빈 입력을 경유한 관찰이므로 최종 보존 재검사의 증거로 인용하지 않는다.

## 범위 밖과 잔여 판정

Firefox/WebKit·실기기 지원 확대, 임의 getter/Proxy·깊이·성능 상한·무한 용량 보장, 모든 native 실패 조합의 완전 원자성, 외부 cleanup의 실제 해제 보장, SSR/Fiber/동시 렌더링/Strict Mode·keyed Fragment·최소 이동 횟수·영속 History·선택 Batching은 [채택한 완료 경계](../requirements.md#52-채택한-오류환경-경계) 밖이다. 이를 미실행 통과로 바꾸지 않는다.

2026-11-12 구현 검증 담당은 기존 보고서의 마지막 보류 절과 소형 JSON 3개만 확인하고 제품 manifest 18개 일치를 직접 계산해 제한 최종 승인했다. 기존 실행·검토에 운영 담당의 증거 보완을 연결하면 종결 가능하며 남은 필수 검증 항목은 없다는 판정이다. 전체 소스 재탐색·테스트 재실행·파일 수정은 수행하지 않았다. 운영 담당은 저장소 Markdown 34개의 로컬 링크·앵커 474건에서 오류 0, 추가 문서 내용의 개인 경로·에이전트 별명·인증정보 패턴 검사에서 검출 0, git diff --check 통과를 확인했다. 위 범위 밖 항목과 과거 실패 이력은 그대로 보존한다.
