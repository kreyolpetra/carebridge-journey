// Folds the Vite SPA build (index.spa.html + app.js + app.css) into ONE
// self-contained HTML file that runs from file://, a static host, or a
// published artifact — nothing external except the Google Fonts link.
//
// Run via `npm run build:spa`, which builds first and then calls this.
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist-spa");

const htmlPath = resolve(dist, "index.spa.html");
const jsPath = resolve(dist, "app.js");
const cssPath = resolve(dist, "app.css");

for (const [label, p] of [
  ["HTML", htmlPath],
  ["JS", jsPath],
]) {
  if (!existsSync(p)) {
    console.error(`inline-spa: expected ${label} at ${p} — did the Vite build run?`);
    process.exit(1);
  }
}

let html = readFileSync(htmlPath, "utf8");
const js = readFileSync(jsPath, "utf8");
const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : null;

if (!css) {
  console.error("inline-spa: no app.css emitted — the app would render unstyled. Aborting.");
  process.exit(1);
}

/**
 * Make a JS bundle safe to sit inside a <script> element.
 *
 * The HTML tokenizer leaves script data on `</script` followed by whitespace,
 * `/`, or `>` — not just on a literal `</script>`. It can also be thrown by a
 * `<!--` sequence. Escaping the slash is invisible to JS: "<\/script>" is
 * identical to "</script>" in a string, and `\/` is a valid escaped slash
 * inside a regex literal.
 */
function makeScriptSafe(code) {
  return code
    .replace(/<\/(script)([\s/>])/gi, "<\\/$1$2")
    .replace(/<!--/g, "<\\!--");
}

/**
 * The root route's head() links the stylesheet by URL (`styles.css?url`), which
 * the router injects at runtime. That URL points at the app.css this script has
 * just folded inline and deleted, so it would 404 in the console. Point it at an
 * empty stylesheet instead — the real CSS is already in the document.
 */
function neutralizeCssUrl(code) {
  // The minifier may quote it with ", ' or a backtick — handle all three.
  let out = code;
  for (const q of ['"', "'", "`"]) {
    out = out.split(`${q}/app.css${q}`).join(`${q}data:text/css,${q}`);
  }
  return out;
}

/** `$` sequences are special in String.replace replacements — pass a function. */
const insert = (haystack, pattern, replacement) => {
  if (!pattern.test(haystack)) return null;
  return haystack.replace(pattern, () => replacement);
};

// --- stylesheet -----------------------------------------------------------
// Vite emits app.css but does not always inject a <link> for it in this
// single-bundle config, so replace the tag if present and otherwise place the
// style at the end of <head> — after the font link, before the script.
const styleTag = `<style>\n${css}\n</style>`;
const linkRe = /<link[^>]+href="[^"]*app\.css"[^>]*>/i;
const headEndRe = /<\/head>/i;

const withCss = insert(html, linkRe, styleTag) ?? insert(html, headEndRe, `${styleTag}\n</head>`);
if (!withCss) {
  console.error("inline-spa: found neither an app.css <link> nor a </head> to inject into. Aborting.");
  process.exit(1);
}
html = withCss;

// --- script ---------------------------------------------------------------
const scriptRe = /<script[^>]+src="[^"]*app\.js"[^>]*><\/script>/i;
// A classic script, deliberately not type="module": module scripts are
// CORS-checked and browsers block them on file://, so a module build would be
// blank for anyone who just double-clicks the file. The bundle is IIFE.
//
// Vite puts the script tag in <head>. Classic scripts are NOT deferred, so left
// there it would run before #root exists. Drop the original tag and re-emit the
// bundle at the end of <body> instead.
const preparedJs = makeScriptSafe(neutralizeCssUrl(js));

const withoutTag = insert(html, scriptRe, "");
if (!withoutTag) {
  console.error("inline-spa: could not find the app.js <script> tag to remove. Aborting.");
  process.exit(1);
}

const bodyEndRe = /<\/body>/i;
const withJs = insert(withoutTag, bodyEndRe, `<script>\n${preparedJs}\n</script>\n</body>`);
if (!withJs) {
  console.error("inline-spa: no </body> to place the bundle before. Aborting.");
  process.exit(1);
}
html = withJs;

// The bundle must come after the mount point, or it throws on load.
if (html.indexOf('id="root"') > html.lastIndexOf("<script>")) {
  console.error("inline-spa: the bundle is positioned before #root. Aborting.");
  process.exit(1);
}

// --- verify ---------------------------------------------------------------
// Exactly one closing </script> should survive: the one that ends our block.
const strayCloses = (html.match(/<\/script\s*>/gi) || []).length;
if (strayCloses !== 1) {
  console.error(
    `inline-spa: expected 1 </script> in the output, found ${strayCloses}. ` +
      `The bundle would break out of its tag. Aborting.`,
  );
  process.exit(1);
}
if (/<link[^>]+href="[^"]*app\.(css|js)"/i.test(html) || /src="[^"]*app\.js"/i.test(html)) {
  console.error("inline-spa: a reference to an emitted asset survived. Aborting.");
  process.exit(1);
}

const outPath = resolve(dist, "caricare-grid.html");
writeFileSync(outPath, html, "utf8");

// --- artifact variant -----------------------------------------------------
// Published artifacts supply their own <!doctype>/<html>/<head>/<body>, so this
// build is the same page with the outer document tags stripped. <title> leads,
// because only the first 8KB is scanned for it and the stylesheet is ~90KB.
const fontLinks = [...html.matchAll(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/gi)]
  .map((m) => m[0])
  .join("\n");
const styleBlock = html.match(/<style>[\s\S]*?<\/style>/i)?.[0] ?? "";
const scriptBlock = html.match(/<script>[\s\S]*<\/script>/i)?.[0] ?? "";

if (!styleBlock || !scriptBlock) {
  console.error("inline-spa: could not extract the style/script blocks for the artifact build.");
  process.exit(1);
}

// Take the real <title> from the source document instead of hardcoding one: the
// tag always beats the publish-time title parameter, so a stale literal here
// would quietly misname the artifact.
const pageTitle = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "CariCare Grid";

const artifact = [
  `<title>${pageTitle}</title>`,
  fontLinks,
  styleBlock,
  '<div id="root"></div>',
  scriptBlock,
].join("\n");

writeFileSync(resolve(dist, "caricare-grid-artifact.html"), artifact, "utf8");

// Clean up the pieces so dist-spa/ holds just the one shareable file.
rmSync(jsPath, { force: true });
rmSync(cssPath, { force: true });
rmSync(htmlPath, { force: true });
for (const leftover of ["robots.txt"]) {
  rmSync(resolve(dist, leftover), { force: true });
}

const mb = (Buffer.byteLength(html, "utf8") / 1024 / 1024).toFixed(2);
console.log(`inline-spa: wrote dist-spa/caricare-grid.html (${mb} MB, fully self-contained)`);
