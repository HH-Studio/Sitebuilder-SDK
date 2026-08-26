// ---------------------------------------------------------------------------
// The one boundary that keeps the local overlay out of a production build.
//
// Both halves ask this: the panel refuses to mount, and the route handler
// refuses to answer. Two independent refusals rather than one, because they
// fail differently. A panel that leaked would show a visitor an edit button,
// and a handler that leaked would let a visitor WRITE.
//
// Read from `process.env.NODE_ENV`, which every bundler that matters replaces
// at build time with a literal. So in a production bundle the check below folds
// to `false`, the branch is dead, and a minifier drops the overlay's code
// entirely rather than shipping it behind a runtime flag.
// ---------------------------------------------------------------------------

/**
 * True only in a development build.
 *
 * Fails CLOSED. A runtime with no `process` at all (a worker, an edge runtime,
 * a browser bundle where the variable was never substituted) is treated as
 * production, because the failure it prevents is the expensive one.
 */
export function isDevelopmentBuild(): boolean {
  try {
    return (
      typeof process !== "undefined" && process.env?.NODE_ENV === "development"
    );
  } catch {
    return false;
  }
}
