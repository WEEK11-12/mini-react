import { expect, it } from 'vitest';
import { projectModule } from '../support/project';

it('[검증환경] 미구현 모듈은 통과나 skip 대신 원인이 명시된 오류로 보고한다', async () => {
  await expect(projectModule('__nonexistent_contract_probe__.ts')).rejects.toThrow('[IMPLEMENTATION_MISSING]');
});
