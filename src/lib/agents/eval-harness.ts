/**
 * The bit every agent suite shares: run cases, count them, exit non-zero.
 *
 * Pulled out when the second and third agents got suites of their own. One
 * runner means one report — three separate scripts reporting three separate
 * totals is how a failing case in the least-loved agent goes unnoticed.
 */
export type EvalCase = {
  /** safety | permission | injection | grounding | correctness | honesty */
  family: string;
  name: string;
  /** Returns null when the case passes, or a sentence describing the failure. */
  run: () => Promise<string | null>;
};

export type SuiteResult = { suite: string; passed: number; failed: number };

export async function runSuite(suite: string, cases: EvalCase[]): Promise<SuiteResult> {
  const width = Math.max(...cases.map((c) => c.name.length)) + 2;
  const byFamily = new Map<string, { pass: number; fail: number }>();
  let failed = 0;

  console.log(`\n${suite}\n${"─".repeat(suite.length)}\n`);

  for (const c of cases) {
    let problem: string | null;
    try {
      problem = await c.run();
    } catch (err) {
      problem = `threw: ${(err as Error).message}`;
    }
    const tally = byFamily.get(c.family) ?? { pass: 0, fail: 0 };
    if (problem) {
      failed += 1;
      tally.fail += 1;
      console.log(`  FAIL  ${c.family.padEnd(11)} ${c.name.padEnd(width)} ${problem}`);
    } else {
      tally.pass += 1;
      console.log(`  pass  ${c.family.padEnd(11)} ${c.name}`);
    }
    byFamily.set(c.family, tally);
  }

  console.log("");
  for (const [family, t] of byFamily) {
    console.log(`  ${family.padEnd(11)} ${t.pass}/${t.pass + t.fail}`);
  }
  console.log(`\n  ${cases.length - failed}/${cases.length} passed`);
  return { suite, passed: cases.length - failed, failed };
}

export function report(results: SuiteResult[]) {
  const passed = results.reduce((n, r) => n + r.passed, 0);
  const failed = results.reduce((n, r) => n + r.failed, 0);
  console.log("\n" + "═".repeat(52));
  for (const r of results) {
    console.log(`  ${r.suite.padEnd(34)} ${r.passed}/${r.passed + r.failed}`);
  }
  console.log("═".repeat(52));
  console.log(`  TOTAL${" ".repeat(31)} ${passed}/${passed + failed}\n`);
  if (failed) process.exit(1);
}
