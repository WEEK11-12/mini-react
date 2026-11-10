# mini-react
미니 리액트 제작 프로젝트입니다.

## 문서

- [프로젝트 요구사항](docs/requirements.md)
- [설계 문서](docs/design/README.md)
- [코드·문서 작성 규칙](docs/conventions.md)
- [1단계 구현·검증 기록](docs/implementation/stage-one.md)

## 단계별 개발

각 단계는 구현 → 대상 테스트 통과 → 마비카 검토 후 완료한다. 현재 1단계는 구현·테스트를 마쳤으며 검토 대기 중이다. Diff·증분 Patch·UI·컴포넌트·Hook은 아직 구현하지 않았다.

```sh
cd tests
npm ci
npm run typecheck
npm run typecheck:core
npm run test:stage-one
npm run test:stage-one:browser
```
