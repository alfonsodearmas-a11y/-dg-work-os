// Vitest stub for the 'server-only' package: the real module throws outside a
// React Server Components bundler condition, which is exactly what we want in
// prod builds and exactly wrong under vitest's node environment.
export {};
