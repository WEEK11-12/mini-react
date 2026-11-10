# 계약 테스트

## 현재 구현 단계

1단계의 reader·validator·초기 렌더링 대상 81개와 실제 Chromium 초기 생성 테스트 1개가 통과했다. 자세한 결과와 후속 미구현 구분은 [1단계 기록](../docs/implementation/stage-01.md)에 있다. 전체 테스트를 모두 통과한 상태는 아니다.

```sh
npm run typecheck:core
npm run test:stage-one
npm run test:stage-one:browser
```

이 폴더는 `docs/requirements.md`와 `docs/design/`을 기준으로 작성한 **테스트 전용 작업 공간**이며 프로젝트의 실제 `src/`를 검증한다. 테스트를 통과시키기 위한 대체 구현은 두지 않는다. 원본 요구사항과 설계의 확정 상태도 변경하지 않는다.

## 실행

프로젝트 루트에서 다음 명령을 실행한다.

```sh
cd tests
npm ci
npm run typecheck
npm run test:harness
npm test
npx playwright install chromium
npm run test:browser:list
MINI_REACT_BASE_URL=http://127.0.0.1:5173 npm run test:browser
```

- `npm test`: renderer·runtime·History 계약과 검증환경 자체 검사. 아직 구현하지 않은 단계는 `[IMPLEMENTATION_MISSING]`로 실패하며 완료/통과로 취급하지 않는다.
- `npm run test:harness`: 모듈 로더와 테스트 관찰 로직을 검사한다. 실제 DOM 복제·no-op·삭제 반례로 정체성/앞 삽입 assertion의 검출력을 확인하며, 제품 기능 통과를 뜻하지 않는다.
- `npm run test:browser:list`: `--reporter=list`로 목록만 수집한다. `reports/browser.json` 실행 증거를 덮어쓰지 않는다.
- `npm run typecheck`: 테스트 코드의 타입과 설정을 검사한다. 제품 코드의 동작 검증과 다르다.
- `npm run test:browser`: **실제 앱을 별도로 실행한 뒤** 수행한다. 앱 실행 명령은 아직 존재하지 않으므로 임의로 만들지 않았다. 서버 미실행의 연결 거부는 브라우저 환경/제품 준비 차단이지 인수조건의 assertion 실패가 아니다.
- 앱 대신 가짜 페이지·가짜 구현을 제공하거나, 미구현 실패를 `skip`/`todo`/성공 처리하지 않는다.

JSON 기록 예시:

```sh
npm test -- --reporter=json --outputFile=reports/unit.json
npm run test:browser
npm run test:catalog
```

마지막 명령은 두 runner의 실제 JSON 결과에서 [test-cases.json](test-cases.json)을 재생성한다. 테스트 제목·파일·요구사항 ID·현재 실패 원인을 기록하고 중복 및 집계 불일치를 검사한다. 카탈로그를 만들기 전에 위 단위 JSON 결과와 브라우저 JSON 결과가 모두 있어야 한다.

`reports/`, `test-results/`, 의존성은 버전 관리에서 제외한다. 의존성의 정확한 버전은 `package-lock.json`에 고정한다.

## 범위와 상태

- 요구사항별 연결: [검증 대응표](test-plan.md).
- 설계의 불명확한 접점·UI 연결 규칙: [테스트 연결 계약](contracts.md).
- 실행 기록: [검증 결과](verification-results.md).
- 각 테스트 이름의 `[VDOM-01]` 등은 요구사항 ID다. `[임시 OPEN-…]`는 아직 확정되지 않은 설계 전제다. 파일 상단·각 영역 README에 적은 전제도 함께 적용한다.
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

## 판단 기준

1. 테스트 발견·타입 검사 성공과 제품 인수조건 통과를 구분한다.
2. 누락 모듈 오류가 해소된 후 각 assertion의 통과를 확인한다.
3. 브라우저 테스트는 앱 실행과 UI 선택자 연결 후 다시 수행한다.
4. TECH 제약처럼 블랙박스 동작만으로 증명할 수 없는 내용은 구조 검토를 병행한다.
5. 임시 정책이 바뀌면 기대값을 검토한다. 그 변경은 현재 확정 요구사항을 몰래 변경하는 절차가 아니다.
