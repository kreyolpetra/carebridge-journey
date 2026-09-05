/**
 * Every agent suite, one report.
 *
 * Run it: `npm run eval:agents`
 *
 * Three separate scripts reporting three separate totals is how a failing case
 * in the least-loved agent goes unnoticed for a week. One command, one number,
 * non-zero exit if any of them fails.
 */
import { runSuite, report, type SuiteResult } from "./eval-harness";
import { intakeCases } from "./intake.eval";
import { clinicianCases } from "./clinician.eval";
import { askCases } from "./ask.eval";

const results: SuiteResult[] = [];
results.push(await runSuite("Intake agent", intakeCases));
results.push(await runSuite("Pre-consult brief agent", clinicianCases));
results.push(await runSuite("Ask agent", askCases));
report(results);
