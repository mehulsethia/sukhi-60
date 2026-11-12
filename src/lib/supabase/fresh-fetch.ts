/**
 * Next.js memoizes identical GET fetches during one server render. For database reads that
 * is wrong: a page that writes (e.g. creates today's occurrences) and then reads again would
 * get the earlier, stale response. Passing an AbortController signal opts out (Next docs:
 * fetch → memoization). Supabase clients on the server use this fetch.
 */
export const freshFetch: typeof fetch = (input, init) =>
  fetch(input, init?.signal ? init : { ...init, signal: new AbortController().signal });
