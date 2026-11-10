# mini-react
미니 리액트 제작 프로젝트입니다.

## 문서

- [프로젝트 요구사항](docs/requirements.md)
- [설계 문서](docs/design/README.md)
- [코드·문서 작성 규칙](docs/conventions.md)
- [1단계 구현·검증 기록](docs/implementation/stage-one.md)
- [2단계 Diff 구현·검증 기록](docs/implementation/stage-two.md)
- [3단계 Patch 구현·검증 기록](docs/implementation/stage-three.md)

## 단계별 개발

각 단계는 구현 → 대상 테스트 통과 → 검증 에이전트 검토 후 완료한다. 1단계·2단계 Diff·3단계 증분 Patch는 검증 에이전트 승인을 받았다. UI·History·컴포넌트·Hook은 아직 구현하지 않았으며, 전체 테스트에는 후속 미구현 실패가 남아 있다.

```sh
cd tests
npm ci
npm run typecheck
npm run typecheck:core
npm run test:stage-one
npm run test:stage-one:browser
```
