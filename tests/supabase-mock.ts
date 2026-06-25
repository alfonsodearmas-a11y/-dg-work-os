// Shared Supabase fluent-chain mock for route-handler tests.
// Any chained method (.select().eq().order().single() …) returns the proxy;
// awaiting the result resolves to `result` (e.g. { data, error }).
export function supabaseChain(result: unknown) {
  return new Proxy(
    { then: (resolve: (v: unknown) => void) => resolve(result) },
    { get: (t, p) => (p === 'then' ? (t as { then: unknown }).then : () => supabaseChain(result)) },
  );
}
