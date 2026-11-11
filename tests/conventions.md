# 테스트 코드 컨벤션

이 문서는 새 테스트·재검토 테스트의 작성 규칙이다. 요구사항의 의미와 합격 기준은 [요구사항](../docs/requirements.md) 및 [검증 설계](../docs/design/verification.md)가 우선한다. 기존 테스트는 실행 증거·단계 기록과 연결되므로 이름만 맞추려고 일괄 이동하지 않는다.

## 위치와 이름

| 경로 | 검증 대상 | 파일명 |
| --- | --- | --- |
| `renderer/` | VDOM·Diff·Patch·DOMScope | `주제.test.ts` |
| `runtime/` | 컴포넌트·Hook·수명 | `주제.test.ts` |
| `history/` | 이력 저장·이동 | `주제.test.ts` |
| `harness/` | 검증 도구 자체의 반례 | `주제.test.ts` |
| `browser/` | 실제 앱 사용자 흐름·브라우저 동작 | `주제.spec.ts` |
| `support/` | 실제 코드 로더·fixture·공유 관찰 도구·실행 보조 | 테스트 파일을 두지 않음 |

새 단계 테스트는 `stage-NN-review.spec.ts`, `stage-NN-recheck.test.ts`처럼 **두 자리 숫자**와 `implementation`/`review`/`recheck`를 쓴다. 대상별 하위 디렉터리와 확장자를 유지한다. 일반 기능 계약은 단계명이 아닌 `diff.test.ts`, `phase-two.spec.ts`처럼 기능명으로 둔다. 검토 차수별 추가 증거는 기존 파일을 덮어쓰지 말고 해당 단계의 별도 파일로 둔다. 과거의 영문 숫자·`rereview`·`re-review` 등은 `support/legacy-stage-tests.json`에 고정한 예외다. 목록은 기존 파일을 정리하면서 *삭제만* 하고 새 파일을 면제하려고 추가하지 않는다.

## 케이스 작성

- 제목은 요구사항 ID(`[VIEW-04]` 등)와 발생 조건→기대 결과를 명시한다. 임시 설계에 기대면 `[임시 OPEN-…]`를 적고 확정 요구사항으로 바꾸지 않는다. 설계만 검증하면 출처를 밝히되 억지로 요구사항 ID를 붙이지 않는다. 새 단계 재검토의 재현 ID(`S09-05`, `S09-R01` 등)는 보고서·runner와 일치시킨다.
- 하나의 케이스가 실패하면 어떤 계약이 깨졌는지 알 수 있도록 주제·계층으로 묶는다. 같은 검증을 이름만 달리 복사하지 않는다. 재검토는 최초 실패와 변경된 직접 경로만 추가한다.
- 실제 `src/` 모듈과 앱을 대상으로 한다. mock으로 제품을 대신하거나 실패를 성공·`skip`·`todo`·`fixme`로 감추지 않는다. `.only`도 커밋하지 않는다. 임시 결손은 실행 원인을 명시하고 미통과로 센다.
- DOM 객체 재사용은 참조 동일성, 앞 삽입은 길이·순서·기존 전원 참조를 검사한다. 실패 주입은 실제 쓰기 뒤 오류를 내고 복구 호출 전에 원복한다. 자원 정리는 오류가 있어도 이후 항목까지 시도하는지 확인한다.
- 브라우저 앱 흐름과 라이브러리 번들 주입 검사를 구분한다. BFCache 참조는 페이지 window에 보존하고 복원 후 다시 평가한다. 검증용 로그·해시·trace는 `reports/`나 저장소 밖 검토 작업 디렉터리에 둔다.

## 실행과 기록

`tests/`에서 `npm run check`로 배치·명명·숨긴 테스트 금지 및 타입 검사를 수행한다. 모든 공개 테스트 실행 스크립트(`test`, `test:unit`, `test:harness`, `test:watch`, `test:browser`, `test:stage-one`, `test:stage-one:browser`)는 실행 전 컨벤션 검사를 자동 실행한다. 새 단계 파일은 추가 직후 `npm run check:conventions` 및 해당 파일의 선택 실행으로 확인한다. 전체 회귀와 브라우저 흐름은 검증 담당에게 맡기고, 이전 단계에서 통과한 항목은 수정 범위 밖이면 반복하지 않는다.

Vitest의 고유 사례는 JSON `testResults[].assertionResults`, Playwright는 `suites[].specs[].tests[]`를 기준으로 세며 재실행 시도 수·최신 고유 수·skipped를 분리한다. 정적 `--list`를 실제 통과로 세지 않는다. 새 실행의 JSON·로그는 과거 증거를 덮어쓰지 않는다. `npm run test:catalog`는 실행 JSON 두 개가 갖춰졌을 때만 무시되는 `reports/test-cases.json`을 만든다. 버전 관리된 `test-cases.json`과 `verification-results.md`는 초기 테스트 작성 단계의 **과거 스냅샷**이므로 현행 총계나 판정으로 인용하지 않는다. 단계별 최신 상태는 `docs/implementation/stage-NN.md`와 원본 runner에 기록한다.
