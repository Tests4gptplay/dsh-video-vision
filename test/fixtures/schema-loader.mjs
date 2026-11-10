// Test-only stand-in for the unavailable schema package. It does not validate
// DSH installation or schema behavior; runtime/attachment tests use actual code.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/schemastery') return {url:new URL('./schemastery-test-double.mjs',import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
