// Nonexistent-target control for Giza. Runs the UNMODIFIED giza-check.mjs from this commit against
// targets that do not exist, with real network access, and prints every block's state.
// PASS = no block is green (verified) or own-test (selftested) for any nonexistent target.
// The visitor/demo functions are not exported by giza-check.mjs, so this reads the file as-is and
// appends one export line to a temporary copy. No checker logic is changed.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const SRC = new URL('../giza-check.mjs', import.meta.url);
const copy = new URL('./checker-copy.mjs', import.meta.url);
fs.writeFileSync(copy, fs.readFileSync(SRC, 'utf8') + '\nexport {gather, evaluate, evaluateConnected, probeSite, parseRepo, parseSite};\n');
const G = await import(copy.href);

const tag = process.env.GITHUB_RUN_ID ?? String(Date.now());
const FAKE_REPO = `giza-buildwatch/giza-nonexistent-control-${tag}`;
const FAKE_SITES = [`giza-nonexistent-control-${tag}.com`, 'giza-nonexistent-control.invalid'];
const GREEN = new Set(['verified', 'selftested']);
let fail = false;
const show = (label, blocks) => {
  console.log(`\n--- ${label}`);
  for (const b of blocks) console.log(`  ${b.state.padEnd(10)} ${b.name}  |  ${b.purpose}`);
  const green = blocks.filter(b => GREEN.has(b.state));
  console.log(green.length ? `  RESULT: FAIL - green: ${green.map(b => b.name).join(', ')}` : '  RESULT: PASS - no green blocks');
  if (green.length) fail = true;
};

console.log('checker commit:', execFileSync('git', ['rev-parse', 'HEAD']).toString().trim());
console.log('checker version: CHECK_VERSION', fs.readFileSync(SRC, 'utf8').match(/CHECK_VERSION = '(\d+)'/)[1]);
console.log('node:', process.version, '| fake repo:', FAKE_REPO, '| fake sites:', FAKE_SITES.join(', '));
for (const s of FAKE_SITES) { try { execFileSync('getent', ['hosts', s]); console.log(`DNS ${s}: RESOLVES (control invalid!)`); fail = true; } catch { console.log(`DNS ${s}: does not resolve (good)`); } }

// 1. The CLI an AI runs, on a repo that does not exist
for (const flags of [['--json'], ['--strict']]) {
  console.log(`\n--- CLI: node giza-check.mjs ${FAKE_REPO} ${flags.join(' ')}`);
  let out, code = 0;
  try { out = execFileSync(process.execPath, [new URL('../giza-check.mjs', import.meta.url).pathname, FAKE_REPO, ...flags], {encoding: 'utf8'}); }
  catch (e) { out = e.stdout; code = e.status; }
  console.log(out.trim()); console.log(`  exit code: ${code}`);
  if (/"proven": true|CHECKED/.test(out)) { console.log('  RESULT: FAIL - something shows as checked'); fail = true; } else console.log('  RESULT: PASS - nothing shown as checked');
}

// 2. The web demo ("make my pyramid"): fake repo + fake site, fake site alone, fake repo alone
for (const [label, repo, site] of [
  ['DEMO fake repo + fake .com site', FAKE_REPO, FAKE_SITES[0]],
  ['DEMO fake .com site only', null, FAKE_SITES[0]],
  ['DEMO fake .invalid site only', null, FAKE_SITES[1]],
  ['DEMO fake repo only', FAKE_REPO, null]]) {
  const r = repo ? G.parseRepo(repo) : null, s = site ? G.parseSite(site) : null;
  const facts = await G.gather({repo: r, site: s});
  console.log(`\n(${label}) facts: repo=${JSON.stringify(facts.repo)} site=${facts.site}`);
  show(label, G.evaluate(facts, {name: 'control', id: 'ctl', repoText: repo, siteText: site}).blocks);
}

// 3. The demo with a made-up AI report claiming everything is done (the AI may only make blocks amber)
{
  const facts = await G.gather({repo: G.parseRepo(FAKE_REPO), site: G.parseSite(FAKE_SITES[0])});
  const claims = Object.fromEntries(['master', 'checkself', 'nokeys', 'signup', 'payments', 'backup', 'running'].map(k => [k, {answer: 'yes', evidence: 'trust me'}]));
  show('DEMO fake repo + fake site + AI report saying YES to everything', G.evaluate(facts, {name: 'control', id: 'ctl', repoText: FAKE_REPO, siteText: FAKE_SITES[0], claims}).blocks);
}

// 4. Connected path: a repo whose host claims a successful production deploy to a dead address
{
  const dead = `https://${FAKE_SITES[0]}`;
  const answers = await G.probeSite(dead);
  console.log(`\nprobeSite(${dead}) -> ${answers}`);
  const ev = {full_name: 'someone/app', url: 'https://github.com/someone/app', access: 'write', pushedAt: new Date().toISOString(), branch: 'main', seen: true,
    secretFiles: [], has: {health: false, backup: false, monitor: false}, packages: [], runs: [],
    deployments: [{environment: 'production', state: 'success', at: new Date().toISOString(), url: dead}]};
  const p = G.evaluateConnected(ev, {id: 'ctl', user: null, siteAnswers: answers});
  const live = p.blocks.filter(b => b.id === 'ctl-live' || b.id === 'ctl-looks');
  show('CONNECTED: host says "deployed successfully" to a dead address (live/looks blocks)', live);
}

fs.unlinkSync(copy);
console.log(`\n==== OVERALL: ${fail ? 'FAIL' : 'PASS'} ====`);
process.exitCode = fail ? 1 : 0;
