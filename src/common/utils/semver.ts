/**
 * Minimal semantic-version comparison for the app-update check. Parses `MAJOR.MINOR.PATCH`
 * (extra/missing parts tolerated, any pre-release/build suffix after `-` or `+` ignored)
 * and compares numerically. Not a full semver implementation — just enough to decide
 * whether an installed mobile build is older than the latest/minimum-supported one.
 */

/** Parses a version string into `[major, minor, patch]`, defaulting missing parts to 0. */
function parse(version: string): [number, number, number] {
  const core = version.trim().split(/[-+]/)[0] ?? '';
  const parts = core.split('.').map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** Returns true when the string is a parseable `MAJOR[.MINOR[.PATCH]]` version. */
export function isValidVersion(version: string): boolean {
  return /^\d+(\.\d+){0,2}([-+].*)?$/.test(version.trim());
}

/** Returns -1 if `a < b`, 0 if equal, 1 if `a > b` (by major, then minor, then patch). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (av[i] < bv[i]) return -1;
    if (av[i] > bv[i]) return 1;
  }
  return 0;
}

/** True when `version` is strictly older than `other`. */
export function isOlderThan(version: string, other: string): boolean {
  return compareVersions(version, other) < 0;
}
