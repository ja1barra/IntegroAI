import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, applyBaseline, applyMigrations, seedUser, asUser, asService } from './helpers.js'

let db, ua, ub, uc, orgA, orgB
const legacy = {}

before(async () => {
  db = await newDb()
  await applyBaseline(db)
  // pre-existing (legacy) data BEFORE the migrations run
  ua = await seedUser(db, 'alice@a.com', 'Alpha Inc')
  ub = await seedUser(db, 'bob@b.com', 'Beta Inc')
  await db.query(`insert into public.integrations (user_id, provider, connected) values ($1,'hubspot',true)`, [ua])
  await db.query(`insert into public.ai_provider_settings (user_id, provider, api_key) values ($1,'openai','sk-test')`, [ub])
  legacy.before = (await db.query(`select (select count(*) from public.user_profiles)::int p, (select count(*) from public.integrations)::int i, (select count(*) from public.ai_provider_settings)::int a`)).rows[0]
  legacy.ids = (await db.query(`select id from auth.users order by id`)).rows.map(r => r.id)
  await applyMigrations(db)
  legacy.after = (await db.query(`select (select count(*) from public.user_profiles)::int p, (select count(*) from public.integrations)::int i, (select count(*) from public.ai_provider_settings)::int a`)).rows[0]
  orgA = (await db.query(`select organization_id from public.organization_members where user_id=$1`, [ua])).rows[0].organization_id
  orgB = (await db.query(`select organization_id from public.organization_members where user_id=$1`, [ub])).rows[0].organization_id
  uc = await seedUser(db, 'carol@a.com', 'Alpha Inc')
  // carol joins org A as a plain member (server-side action in production)
  await db.query(`insert into public.organization_members (organization_id, user_id, role) values ($1,$2,'member')`, [orgA, uc])
})

// raw statements on private.* need a privileged role (service_role deliberately has no schema access)
const su = async (sql, params) => { await db.exec('reset role'); try { return await db.query(sql, params) } finally { await db.exec('set role service_role') } }
const one = async (sql, params) => (await db.query(sql, params)).rows[0]

test('backfill: one org per legacy user, IDs and legacy data untouched, never grouped by name', async () => {
  assert.notEqual(orgA, orgB)
  assert.deepEqual(legacy.after, legacy.before)
  const ids = (await db.query(`select id from auth.users where id = any($1::uuid[]) order by id`, [legacy.ids])).rows.map(r => r.id)
  assert.deepEqual(ids, legacy.ids)
  const m = await one(`select role from public.organization_members where user_id=$1`, [ua])
  assert.equal(m.role, 'admin')
})

test('backfill is idempotent / restartable', async () => {
  const sql = (await import('./helpers.js')).migrationFiles()
  const before = await one(`select count(*)::int c from public.organizations`)
  await db.exec(sql[1].sql)
  await db.exec(sql[2].sql)
  const after = await one(`select count(*)::int c from public.organizations`)
  assert.equal(before.c, after.c + 0)
})

async function seedOrgData(org, tag) {
  const conn = (await one(`insert into public.crm_connections (organization_id, provider, portal_id, status) values ($1,'hubspot',$2,'active') returning id`, [org, 'portal-' + tag])).id
  const pipe = (await one(`insert into public.crm_pipelines (organization_id, connection_id, external_id, label) values ($1,$2,'p1','Sales') returning id`, [org, conn])).id
  const stage = (await one(`insert into public.crm_stages (organization_id, connection_id, pipeline_id, external_id, label) values ($1,$2,$3,'s1','Late') returning id`, [org, conn, pipe])).id
  const deal = (await one(`insert into public.crm_deals (organization_id, connection_id, external_id, name, pipeline_id, stage_id) values ($1,$2,'d1',$3,$4,$5) returning id`, [org, conn, 'Deal ' + tag, pipe, stage])).id
  return { conn, pipe, stage, deal }
}
let dA, dB
test('seed tenant data', async () => { dA = await seedOrgData(orgA, 'A'); dB = await seedOrgData(orgB, 'B') })

test('RLS: users only read their own organization rows', async () => {
  await asUser(db, ua, async () => {
    const r = await db.query(`select name from public.crm_deals`)
    assert.deepEqual(r.rows.map(x => x.name), ['Deal A'])
    assert.equal((await db.query(`select id from public.organizations`)).rows.length, 1)
  })
  await asUser(db, ub, async () => {
    assert.deepEqual((await db.query(`select name from public.crm_deals`)).rows.map(x => x.name), ['Deal B'])
  })
})

test('RLS: browser role has no write path on Revenue tables (incl. self role elevation)', async () => {
  await asUser(db, uc, async () => {
    await assert.rejects(db.query(`update public.organization_members set role='admin' where user_id=$1`, [uc]), /permission denied/)
    await assert.rejects(db.query(`insert into public.organization_members (organization_id,user_id,role) values ($1,$2,'admin')`, [orgB, uc]), /permission denied/)
    await assert.rejects(db.query(`update public.crm_deals set amount = 1`), /permission denied/)
    await assert.rejects(db.query(`delete from public.crm_deals`), /permission denied/)
    await assert.rejects(db.query(`update public.revenue_org_flags set legacy_outreach_enabled = true`), /permission denied/)
  })
  const still = await one(`select role from public.organization_members where user_id=$1`, [uc])
  assert.equal(still.role, 'member')
})

test('anon has no access at all', async () => {
  await db.exec(`set role anon`)
  try {
    await assert.rejects(db.query(`select * from public.crm_deals`), /permission denied/)
    await assert.rejects(db.query(`select * from public.organizations`), /permission denied/)
  } finally { await db.exec(`reset role`) }
})

test('private schema and rv_* RPCs are unreachable for browser roles', async () => {
  await asUser(db, ua, async () => {
    await assert.rejects(db.query(`select * from private.crm_credentials`), /permission denied/)
    await assert.rejects(db.query(`select * from private.revenue_jobs`), /permission denied/)
    await assert.rejects(db.query(`select public.rv_enqueue_job($1,'sync','{}',null,null,5,null)`, [orgA]), /permission denied/)
    await assert.rejects(db.query(`select public.rv_approve_proposal($1,$1,1,'x',$2,null)`, [orgA, ua]), /permission denied/)
    await assert.rejects(db.query(`select public.rv_get_credentials($1)`, [dA.conn]), /permission denied/)
  })
})

test('composite FKs reject cross-organization relations', async () => {
  // deal in org A pointing at org B's pipeline / stage / owner
  await assert.rejects(db.query(`insert into public.crm_deals (organization_id, connection_id, external_id, pipeline_id) values ($1,$2,'x1',$3)`, [orgA, dA.conn, dB.pipe]), /foreign key/)
  await assert.rejects(db.query(`insert into public.crm_deals (organization_id, connection_id, external_id, stage_id) values ($1,$2,'x2',$3)`, [orgA, dA.conn, dB.stage]), /foreign key/)
  await assert.rejects(db.query(`insert into public.crm_deals (organization_id, connection_id, external_id) values ($1,$2,'x3')`, [orgA, dB.conn]), /foreign key/)
  const ob = (await one(`insert into public.crm_owners (organization_id, connection_id, external_id) values ($1,$2,'o1') returning id`, [orgB, dB.conn])).id
  await assert.rejects(db.query(`insert into public.crm_deals (organization_id, connection_id, external_id, owner_id) values ($1,$2,'x4',$3)`, [orgA, dA.conn, ob]), /foreign key/)
  // evaluations / findings / proposals cannot reference another org's deal
  await assert.rejects(db.query(`insert into public.revenue_findings (organization_id, deal_id, rule_key, dedupe_key, category, severity, rules_version) values ($1,$2,'inactivity','k','a','high',1)`, [orgA, dB.deal]), /foreign key/)
  await assert.rejects(db.query(`insert into public.revenue_action_proposals (organization_id, deal_id, kind, payload, payload_hash, portal_id, expires_at) values ($1,$2,'create_task','{}','h','p', now()+interval '1 day')`, [orgA, dB.deal]), /foreign key/)
})

test('external IDs are unique per (org, connection); one org per live portal', async () => {
  await assert.rejects(db.query(`insert into public.crm_deals (organization_id, connection_id, external_id) values ($1,$2,'d1')`, [orgA, dA.conn]), /unique|duplicate/)
  await assert.rejects(db.query(`insert into public.crm_connections (organization_id, provider, portal_id, status) values ($1,'hubspot','portal-A','active')`, [orgB]), /unique|duplicate/)
})

test('audit log is append-only; rule sets are immutable', async () => {
  await db.query(`select public.rv_audit($1,'system',null,'test.event','x','1',null,null,'req-1')`, [orgA])
  await assert.rejects(db.query(`update public.revenue_audit_events set event='tampered'`), /append-only|not allowed/)
  await assert.rejects(db.query(`delete from public.revenue_audit_events`), /append-only|not allowed/)
  await assert.rejects(db.query(`truncate public.revenue_audit_events`), /append-only|not allowed/)
  await db.query(`insert into public.revenue_rule_sets (organization_id, version, engine_version, config) values ($1,1,'1','{}')`, [orgA])
  await assert.rejects(db.query(`update public.revenue_rule_sets set config='{"x":1}'`), /immutable|not allowed/)
  // audit visible to admin, hidden from plain member
  await asUser(db, ua, async () => assert.equal((await db.query(`select 1 from public.revenue_audit_events`)).rows.length >= 1, true))
  await asUser(db, uc, async () => assert.equal((await db.query(`select 1 from public.revenue_audit_events`)).rows.length, 0))
})

test('chat sessions are private to their creator even inside the same org', async () => {
  const s = (await one(`insert into public.revenue_chat_sessions (organization_id, created_by, title) values ($1,$2,'private') returning id`, [orgA, ua])).id
  await db.query(`insert into public.revenue_chat_messages (organization_id, session_id, role, content) values ($1,$2,'user','hi')`, [orgA, s])
  await asUser(db, ua, async () => assert.equal((await db.query(`select 1 from public.revenue_chat_messages`)).rows.length, 1))
  await asUser(db, uc, async () => {
    assert.equal((await db.query(`select 1 from public.revenue_chat_sessions`)).rows.length, 0)
    assert.equal((await db.query(`select 1 from public.revenue_chat_messages`)).rows.length, 0)
  })
})

test('OAuth attempt: single-use, expiry, admin-only creation', async () => {
  const h = 'hash-1'
  await asService(db, async () => {
    await db.query(`select public.rv_create_oauth_attempt($1,$2,$3,null,'/settings',array['crm.objects.deals.read'],600)`, [h, ua, orgA])
    const first = await db.query(`select * from public.rv_consume_oauth_attempt($1)`, [h])
    assert.equal(first.rows.length, 1)
    assert.equal(first.rows[0].organization_id, orgA)
    const replay = await db.query(`select * from public.rv_consume_oauth_attempt($1)`, [h])
    assert.equal(replay.rows.length, 0)
    await db.query(`select public.rv_create_oauth_attempt('hash-2',$1,$2,null,'/x',array[]::text[],-5)`, [ua, orgA])
    assert.equal((await db.query(`select * from public.rv_consume_oauth_attempt('hash-2')`)).rows.length, 0)
    await assert.rejects(db.query(`select public.rv_create_oauth_attempt('hash-3',$1,$2,null,'/x',array[]::text[],60)`, [uc, orgA]), /forbidden/) // member, not admin
    await assert.rejects(db.query(`select public.rv_create_oauth_attempt('hash-4',$1,$2,null,'/x',array[]::text[],60)`, [ua, orgB]), /forbidden/) // tenant swap
  })
})

test('connection activation: portal cannot be attached to two orgs; disconnect drops credentials', async () => {
  await asService(db, async () => {
    // portal-A is already live in org A (seeded above) -> org B cannot claim it
    await assert.rejects(db.query(`select public.rv_activate_hubspot_connection($1,$2,'portal-A',array[]::text[],'{}','a','r', now()+interval '30 min','1',null)`, [orgB, ub]), /portal_in_use/)
    // org A reconnecting a different portal is refused (no silent replacement)
    await assert.rejects(db.query(`select public.rv_activate_hubspot_connection($1,$2,'other',array[]::text[],'{}','a','r', now()+interval '30 min','1',null)`, [orgA, ua]), /portal_mismatch/)
    await db.query(`select public.rv_activate_hubspot_connection($1,$2,'portal-A',array['crm.objects.deals.read'],'{}','a1','r1', now()+interval '30 min','1',null)`, [orgA, ua])
    assert.equal((await db.query(`select * from public.rv_get_credentials($1)`, [dA.conn])).rows.length, 1)
    const ok = await db.query(`select public.rv_disconnect_connection($1,$2,$3,'r')`, [orgA, dA.conn, ua])
    assert.equal(ok.rows[0].rv_disconnect_connection, true)
    assert.equal((await db.query(`select * from public.rv_get_credentials($1)`, [dA.conn])).rows.length, 0)
    // wrong tenant cannot disconnect
    const no = await db.query(`select public.rv_disconnect_connection($1,$2,$3,'r')`, [orgB, dA.conn, ub])
    assert.equal(no.rows[0].rv_disconnect_connection, false)
  })
})

test('refresh lease: only one holder, only holder may store rotated tokens', async () => {
  await asService(db, async () => {
    const c = dB.conn
    await db.query(`select public.rv_activate_hubspot_connection($1,$2,'portal-B',array[]::text[],'{}','a','r', now()+interval '1 min','1',null)`, [orgB, ub])
    const l1 = (await db.query(`select public.rv_acquire_refresh_lease($1,'w1',30) v`, [c])).rows[0].v
    const l2 = (await db.query(`select public.rv_acquire_refresh_lease($1,'w2',30) v`, [c])).rows[0].v
    assert.equal(l1, true); assert.equal(l2, false)
    const bad = (await db.query(`select public.rv_store_refreshed_credentials($1,'w2','A2','R2', now()+interval '1 hour','2') v`, [c])).rows[0].v
    assert.equal(bad, false)
    const good = (await db.query(`select public.rv_store_refreshed_credentials($1,'w1','A2','R2', now()+interval '1 hour','2') v`, [c])).rows[0].v
    assert.equal(good, true)
    const cred = (await db.query(`select * from public.rv_get_credentials($1)`, [c])).rows[0]
    assert.equal(cred.refresh_token_enc, 'R2'); assert.equal(cred.key_version, '2')
  })
})

test('job queue: dedupe, lease reclaim, dead-letter after max attempts', async () => {
  await asService(db, async () => {
    const a = (await db.query(`select public.rv_enqueue_job($1,'sync','{}','sync:1',null,2,null) id`, [orgA])).rows[0].id
    const b = (await db.query(`select public.rv_enqueue_job($1,'sync','{}','sync:1',null,2,null) id`, [orgA])).rows[0].id
    assert.equal(a, b)
    const c1 = (await db.query(`select * from public.rv_claim_job('w1', 60, null)`)).rows
    assert.equal(c1.length, 1); assert.equal(c1[0].attempts, 1)
    assert.equal((await db.query(`select * from public.rv_claim_job('w2', 60, null)`)).rows.length, 0) // leased
    await su(`update private.revenue_jobs set lease_until = now() - interval '1 second' where id=$1`, [a])
    const c2 = (await db.query(`select * from public.rv_claim_job('w2', 60, null)`)).rows
    assert.equal(c2.length, 1); assert.equal(c2[0].reclaimed, true); assert.equal(c2[0].attempts, 2)
    await su(`update private.revenue_jobs set lease_until = now() - interval '1 second' where id=$1`, [a])
    assert.equal((await db.query(`select * from public.rv_claim_job('w3', 60, null)`)).rows.length, 0)
    assert.equal((await su(`select status from private.revenue_jobs where id=$1`, [a])).rows[0].status, 'dead')
    // stale worker cannot finish a job it lost
    assert.equal((await db.query(`select public.rv_finish_job($1,'w1','succeeded',null,null) r`, [a])).rows[0].r, 'lost_lease')
    // retry outcome re-queues with backoff, then dead at the limit
    const j = (await db.query(`select public.rv_enqueue_job($1,'evaluate','{}','ev:1',null,2,null) id`, [orgA])).rows[0].id
    await db.query(`select * from public.rv_claim_job('w1', 60, array['evaluate'])`)
    assert.equal((await db.query(`select public.rv_finish_job($1,'w1','retry','boom', now()) r`, [j])).rows[0].r, 'queued')
    await db.query(`select * from public.rv_claim_job('w1', 60, array['evaluate'])`)
    assert.equal((await db.query(`select public.rv_finish_job($1,'w1','retry','boom', now()) r`, [j])).rows[0].r, 'dead')
    // job progress is tenant-scoped
    assert.equal((await db.query(`select * from public.rv_get_job($1,$2)`, [orgB, j])).rows.length, 0)
    assert.equal((await db.query(`select * from public.rv_get_job($1,$2)`, [orgA, j])).rows.length, 1)
  })
})

test('approval: CAS, double-click, stale payload, expiry, role check; executor never re-runs a crashed execution', async () => {
  const mk = async (hash = 'h1', exp = '1 day') => (await one(
    `insert into public.revenue_action_proposals (organization_id, deal_id, kind, payload, payload_hash, portal_id, created_by, expires_at)
     values ($1,$2,'create_task','{"subject":"x"}',$3,'portal-A',$4, now() + $5::interval) returning id`, [orgA, dA.deal, hash, uc, exp])).id
  const p = await mk()
  await asService(db, async () => {
    const q = (id, ver, hash, who) => db.query(`select * from public.rv_approve_proposal($1,$2,$3,$4,$5,'req')`, [orgA, id, ver, hash, who]).then(r => r.rows[0])
    assert.equal((await q(p, 1, 'h1', uc)).result, 'forbidden')            // plain member cannot approve
    assert.equal((await q(p, 1, 'WRONG', ua)).result, 'stale_version')     // edited payload => hash mismatch
    assert.equal((await q(p, 2, 'h1', ua)).result, 'stale_version')
    const ok = await q(p, 1, 'h1', ua)
    assert.equal(ok.result, 'approved'); assert.ok(ok.execution_id); assert.ok(ok.job_id)
    const again = await q(p, 1, 'h1', ua)                                   // double click
    assert.equal(again.result, 'already_approved'); assert.equal(again.job_id, null)
    assert.equal((await db.query(`select count(*)::int c from public.revenue_action_executions where proposal_id=$1`, [p])).rows[0].c, 1)
    assert.equal((await su(`select count(*)::int c from private.revenue_jobs where kind='execute_action' and dedupe_key like $1`, ['action:%' + p + '%'])).rows[0].c, 1)
    // execution CAS
    const s1 = (await db.query(`select * from public.rv_begin_execution($1,$2)`, [orgA, ok.execution_id])).rows[0]
    assert.equal(s1.result, 'started')
    const s2 = (await db.query(`select * from public.rv_begin_execution($1,$2)`, [orgA, ok.execution_id])).rows[0] // worker restart
    assert.equal(s2.result, 'needs_review')
    const st = (await db.query(`select status from public.revenue_action_proposals where id=$1`, [p])).rows[0].status
    assert.equal(st, 'needs_review')
    // expiry
    const p2 = await mk('h2', '-1 second')
    assert.equal((await q(p2, 1, 'h2', ua)).result, 'expired')
  })
  // cross-tenant: org B admin cannot approve org A's proposal
  const p3 = await mk('h3')
  await asService(db, async () => {
    const r = (await db.query(`select * from public.rv_approve_proposal($1,$2,1,'h3',$3,'req')`, [orgB, p3, ub])).rows[0]
    assert.equal(r.result, 'not_found')
  })
})

test('AI quota: atomic reservation honours the budget and hourly rate limit', async () => {
  await asService(db, async () => {
    await db.query(`update public.revenue_settings set ai_monthly_token_budget = 10000, ai_requests_per_hour = 3 where organization_id=$1`, [orgB])
    const r1 = (await db.query(`select * from public.rv_reserve_ai_usage($1,$2,'ask',6000,'r1',null)`, [orgB, ub])).rows[0]
    assert.ok(r1.usage_id)
    const r2 = (await db.query(`select * from public.rv_reserve_ai_usage($1,$2,'ask',6000,'r2',null)`, [orgB, ub])).rows[0]
    assert.equal(r2.denied_reason, 'budget_exhausted')
    // settle with real usage frees the unused reservation
    await db.query(`select public.rv_settle_ai_usage($1,$2,'ok','gpt-x',1000,500,0)`, [orgB, r1.usage_id])
    const r3 = (await db.query(`select * from public.rv_reserve_ai_usage($1,$2,'ask',6000,'r3',null)`, [orgB, ub])).rows[0]
    assert.ok(r3.usage_id)
    // no rate row -> cost stays NULL, never invented
    const u = (await db.query(`select estimated_cost_usd from public.revenue_ai_usage where id=$1`, [r1.usage_id])).rows[0]
    assert.equal(u.estimated_cost_usd, null)
    await db.query(`select * from public.rv_reserve_ai_usage($1,$2,'ask',10,'r4',null)`, [orgB, ub])
    const r5 = (await db.query(`select * from public.rv_reserve_ai_usage($1,$2,'ask',10,'r5',null)`, [orgB, ub])).rows[0]
    assert.equal(r5.denied_reason, 'rate_limited')
    // priced usage
    await db.query(`insert into public.revenue_pricing_rates (model, version, input_usd_per_mtok, output_usd_per_mtok) values ('m1','t-1', 1, 2)`)
    await db.query(`update public.revenue_settings set ai_requests_per_hour = 100 where organization_id=$1`, [orgB])
    const r6 = (await db.query(`select * from public.rv_reserve_ai_usage($1,$2,'ask',10,'r6',null)`, [orgB, ub])).rows[0]
    const cost = (await db.query(`select public.rv_settle_ai_usage($1,$2,'ok','m1',1000000,1000000,0) c`, [orgB, r6.usage_id])).rows[0].c
    assert.equal(Number(cost), 3)
  })
})

test('legacy outreach gate follows the org flag', async () => {
  await asService(db, async () => {
    assert.equal((await db.query(`select public.rv_legacy_outreach_allowed($1) v`, [ua])).rows[0].v, true)
    await db.query(`update public.revenue_org_flags set legacy_outreach_enabled=false where organization_id=$1`, [orgA])
    assert.equal((await db.query(`select public.rv_legacy_outreach_allowed($1) v`, [ua])).rows[0].v, false)
    assert.equal((await db.query(`select public.rv_legacy_outreach_allowed($1) v`, [ub])).rows[0].v, true)
  })
})

test('rv_ensure_user_org is idempotent for brand-new users', async () => {
  const nu = await seedUser(db, 'new@n.com', 'New')
  await asService(db, async () => {
    const a = (await db.query(`select public.rv_ensure_user_org($1,'New Co') v`, [nu])).rows[0].v
    const b = (await db.query(`select public.rv_ensure_user_org($1,'Other') v`, [nu])).rows[0].v
    assert.equal(a, b)
  })
})

test('rv_my_legacy_outreach_allowed: callable by the user themself, reveals only their own flag; anon cannot call it', async () => {
  await asService(db, async () => { await db.query(`update public.revenue_org_flags set legacy_outreach_enabled = true where organization_id = $1`, [orgA]) })
  await asUser(db, ua, async () => assert.equal((await db.query(`select public.rv_my_legacy_outreach_allowed() v`)).rows[0].v, true))
  await db.query(`update public.revenue_org_flags set legacy_outreach_enabled = false where organization_id = $1`, [orgA])
  await asUser(db, ua, async () => assert.equal((await db.query(`select public.rv_my_legacy_outreach_allowed() v`)).rows[0].v, false))
  await asUser(db, ub, async () => assert.equal((await db.query(`select public.rv_my_legacy_outreach_allowed() v`)).rows[0].v, true))   // other tenant unaffected
  await db.exec(`set role anon`)
  try { await assert.rejects(db.query(`select public.rv_my_legacy_outreach_allowed()`), /permission denied/) } finally { await db.exec(`reset role`) }
})

test('AI reservations that were never settled (killed function) expire instead of counting forever', async () => {
  await db.query(`update public.revenue_settings set ai_monthly_token_budget = 10000, ai_requests_per_hour = 100 where organization_id = $1`, [orgB])
  await db.query(`delete from public.revenue_ai_usage where organization_id = $1`, [orgB])
  await asService(db, async () => {
    const r1 = (await db.query(`select * from public.rv_reserve_ai_usage($1,$2,'ask',9000,'r1',null)`, [orgB, ub])).rows[0]
    assert.ok(r1.usage_id)
    assert.equal((await db.query(`select * from public.rv_reserve_ai_usage($1,$2,'ask',9000,'r2',null)`, [orgB, ub])).rows[0].denied_reason, 'budget_exhausted')
  })
  await db.query(`update public.revenue_ai_usage set created_at = now() - interval '11 minutes' where organization_id = $1`, [orgB])
  await asService(db, async () => {
    assert.ok((await db.query(`select * from public.rv_reserve_ai_usage($1,$2,'ask',9000,'r3',null)`, [orgB, ub])).rows[0].usage_id)
  })
})
