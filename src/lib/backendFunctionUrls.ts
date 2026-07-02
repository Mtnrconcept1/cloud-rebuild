export function buildBackendFunctionUrl(functionName: string) {
  const normalizedFunctionName = functionName.replace(/^\/+|\/+$/g, "");
  return `/functions/v1/${normalizedFunctionName}`;
}
