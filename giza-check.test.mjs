// Regression tests for giza-check.mjs. Run: node --test
// GitHub is faked, so these run offline and never touch the network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {main} from './giza-check.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

// A fake GitHub. `files` is the repo's file list; `auth` decides how a request with a token is answered.
function fakeGitHub({files = ['README.md'], auth = 'ok', meta = {}, metaStatus = 200, metaBody} = {}) {
  const calls = [];
  const f = async (url, opts = {}) => {
    const authed = !!opts.headers?.authorization;
    calls.push({url, authed});
    if (authed && auth === 'reject') return json({message: 'Bad credentials'}, 401);
    const path = url.replace('https://api.github.com', '');
    if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) return metaStatus === 200
      ? json({full_name: 'me/app', html_url: 'https://github.com/me/app', default_branch: 'main', pushed_at: new Date().toISOString(),
        size: 10, permissions: authed && auth !== 'workflow' ? {push: true} : {}, ...meta})   // a workflow token reports no permissions
      : json(metaBody ?? {message: 'nope'}, metaStatus);
    if (path.includes('/git/trees/')) return json({tree: files.map(p => ({path: p, type: 'blob'})), truncated: false});
    if (path.includes('/actions/runs')) return json({workflow_runs: []});
    if (path.includes('/deployments')) return json([]);
    return json({message: 'Not Found'}, 404);
  };
  return {f, calls};
}

async function run(argv, gh, env = {}) {
  const saved = {GITHUB_TOKEN: process.env.GITHUB_TOKEN, GH_TOKEN: process.env.GH_TOKEN};
  Object.assign(process.env, env);
  for (const k of Object.keys(saved)) if (!(k in env)) delete process.env[k];
  const lines = [];
  try { return {code: await main(argv, l => lines.push(l), gh.f, {probe: async () => true}), out: lines.join('\n')}; }
  finally { for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : process.env[k] = v; }
}

test('a token GitHub rejects falls back to a visitor check instead of failing', async () => {
  const gh = fakeGitHub({auth: 'reject'});
  const {code, out} = await run(['me/app'], gh, {GITHUB_TOKEN: 'stale-or-placeholder'});
  assert.equal(code, 0);
  assert.match(out, /GIZA CHECK · me\/app/);
  assert.ok(gh.calls.some(c => !c.authed), 'retried without the token');
});

test('a token that works can verify the code copy', async () => {
  const {out} = await run(['me/app', '--json'], fakeGitHub(), {GITHUB_TOKEN: 'good'});
  const r = JSON.parse(out);
  assert.equal(r.blocks.find(b => b.key === 'master').state, 'verified');
});

test('--strict passes on a clean repo (all nine proven is impossible from GitHub evidence, so it is not the bar)', async () => {
  const {code} = await run(['me/app', '--strict'], fakeGitHub(), {GITHUB_TOKEN: 'good'});
  assert.equal(code, 0);
});

test('--strict fails when Giza finds a problem, e.g. a committed .env', async () => {
  const {code, out} = await run(['me/app', '--strict'], fakeGitHub({files: ['README.md', '.env']}), {GITHUB_TOKEN: 'good'});
  assert.equal(code, 3);
  assert.match(out, /✗ PROBLEM\s+No passwords left lying around/);
});

test('.env.example is not a problem', async () => {
  const {code} = await run(['me/app', '--strict'], fakeGitHub({files: ['.env.example']}), {GITHUB_TOKEN: 'good'});
  assert.equal(code, 0);
});

test('a real rate limit says so', async () => {
  const {code, out} = await run(['me/app'], fakeGitHub({metaStatus: 403, metaBody: {message: 'API rate limit exceeded for 1.2.3.4.'}}));
  assert.equal(code, 2);
  assert.match(out, /limiting checks/);
});

test('any other refusal passes on the real reason instead of blaming a rate limit', async () => {
  const {code, out} = await run(['me/app'], fakeGitHub({metaStatus: 403, metaBody: {message: 'Repository access blocked'}}));
  assert.equal(code, 2);
  assert.match(out, /refused access to me\/app: "Repository access blocked"/);
  assert.doesNotMatch(out, /limiting/);
});

test('hidden characters in a refusal message are cleaned out', async () => {
  const {out} = await run(['me/app'], fakeGitHub({metaStatus: 403, metaBody: {message: 'blocked‮\u0007 now'}}));
  assert.doesNotMatch(out, /[‮\u0007]/);
});

test('bad input prints usage', async () => {
  const {code, out} = await run(['not a repo'], fakeGitHub());
  assert.equal(code, 1);
  assert.match(out, /Usage/);
});

test('inside its own GitHub Actions run, a live run proves control of the repo', async () => {
  const gh = fakeGitHub({auth: 'workflow'});
  const f = async (url, opts) => /\/actions\/runs\/42$/.test(url) ? json({status: 'in_progress'}) : gh.f(url, opts);
  const env = {GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'me/app', GITHUB_RUN_ID: '42'};
  Object.assign(process.env, env);
  try {
    const {out} = await run(['me/app', '--json'], {f}, {GITHUB_TOKEN: 'workflow-token'});
    const master = JSON.parse(out).blocks.find(b => b.key === 'master');
    assert.equal(master.state, 'verified');
    assert.match(master.found, /own GitHub Actions run/);
  } finally { for (const k of Object.keys(env)) delete process.env[k]; }
});

test('claiming to be in Actions does not help when the run is not real', async () => {
  const env = {GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'me/app', GITHUB_RUN_ID: '42'};
  Object.assign(process.env, env);
  try {
    const {out} = await run(['me/app', '--json'], fakeGitHub({auth: 'workflow'}), {GITHUB_TOKEN: 'workflow-token'});   // /actions/runs/42 is 404
    assert.notEqual(JSON.parse(out).blocks.find(b => b.key === 'master').state, 'verified');
  } finally { for (const k of Object.keys(env)) delete process.env[k]; }
});

test('a different repo than the one running the workflow gets no Actions credit', async () => {
  const gh = fakeGitHub({auth: 'workflow'});
  const f = async (url, opts) => /\/actions\/runs\/42$/.test(url) ? json({status: 'in_progress'}) : gh.f(url, opts);
  const env = {GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'someone/else', GITHUB_RUN_ID: '42'};
  Object.assign(process.env, env);
  try {
    const {out} = await run(['me/app', '--json'], {f}, {GITHUB_TOKEN: 'workflow-token'});
    assert.notEqual(JSON.parse(out).blocks.find(b => b.key === 'master').state, 'verified');
  } finally { for (const k of Object.keys(env)) delete process.env[k]; }
});

test('the copy shipped inside the agent skill is the same file as giza-check.mjs', async () => {
  const {readFileSync} = await import('node:fs');
  const root = readFileSync(new URL('./giza-check.mjs', import.meta.url), 'utf8');
  const skill = readFileSync(new URL('./skills/giza-check/scripts/giza-check.mjs', import.meta.url), 'utf8');
  assert.equal(skill, root, 'run: cp giza-check.mjs skills/giza-check/scripts/giza-check.mjs');
});
