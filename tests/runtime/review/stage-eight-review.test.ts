import { expect, it } from 'vitest';
import { cases, runCase } from '../../support/stage-eight-review-cases';
for (const [index, item] of cases.entries()) {
  it(item.name, () => { expect(runCase(index)).toEqual({ ok: true }); });
}
