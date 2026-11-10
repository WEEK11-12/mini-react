# mini-react
미니 리액트 제작 프로젝트입니다.

## 문서

- [프로젝트 요구사항](docs/requirements.md)
- [설계 문서](docs/design/README.md)
- [코드·문서 작성 규칙](docs/conventions.md)
- [1단계 구현·검증 기록](docs/implementation/stage-01.md)
- [2단계 Diff 구현·검증 기록](docs/implementation/stage-02.md)
- [3단계 Patch 구현·검증 기록](docs/implementation/stage-03.md)
- [4단계 편집·Patch·History UI 구현·검증 기록](docs/implementation/stage-04.md)
- [5단계 함수형 컴포넌트·FunctionComponent 생명주기 구현 기록](docs/implementation/stage-05.md)
- [6단계 루트 전용 useState·업데이트 예약 구현 기록](docs/implementation/stage-06.md)
- [7단계 useEffect 의존성·정리 함수 구현 기록](docs/implementation/stage-07.md)
- [8단계 useMemo 의존성 기반 메모이제이션 구현 기록](docs/implementation/stage-08.md)

## 단계별 개발

각 단계는 구현 → 대상 테스트 통과 → 검증 에이전트 검토 후 완료한다. 1~4단계, 5단계 함수형 컴포넌트·생명주기, 6단계 루트 State·업데이트 예약, 7단계 useEffect 및 8단계 useMemo 범위는 검증 에이전트 승인을 받았다. Phase 2 시연은 아직 구현하지 않았으며 전체 suite에는 기존 오류 포장 기대값 실패가 남아 있다.

## 앱 실행

프로젝트 루트에서 `npm ci` 후 `npm run dev`를 실행하고 표시된 로컬 주소를 연다. `npm run build`로 정적 배포 파일을 생성한다. HTML 입력은 지원 범위만 허용하며, 유효한 편집도 Patch 전까지 실제 영역과 이력을 변경하지 않는다.

```sh
cd tests
npm ci
npm run typecheck
npm run typecheck:core
npm run test:stage-one
npm run test:stage-one:browser
```
