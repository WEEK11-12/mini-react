/** Load the future real implementation; never substitute mock production logic. */
const modules = import.meta.glob('../../src/**/*.ts');

export async function projectModule<T>(relativePath: string): Promise<T> {
  const key = `../../src/${relativePath}`;
  const load = modules[key];
  if (!load) {
    throw new Error(`[IMPLEMENTATION_MISSING] src/${relativePath}: 구현 전 계약 테스트의 예상 RED. 테스트를 skip하지 말고 실제 모듈을 구현하세요.`);
  }
  return await load() as T;
}
