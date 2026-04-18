import pg from "pg";

const { Client } = pg;

const connectionString = process.env.PROD_DB_URL;

if (!connectionString) {
  console.error("Missing PROD_DB_URL");
  process.exit(1);
}

const queries = {
  extensions: `
    select extname
    from pg_extension
    order by extname;
  `,
  tables: `
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename;
  `,
  functions: `
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as args,
           pg_get_userbyid(p.proowner) as owner_name,
           p.prosecdef as security_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname, args;
  `,
  triggers: `
    select event_object_table as table_name,
           trigger_name,
           action_timing,
           event_manipulation,
           action_statement
    from information_schema.triggers
    where trigger_schema = 'public'
    order by event_object_table, trigger_name, event_manipulation;
  `,
  realtime: `
    select schemaname, tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime'
    order by schemaname, tablename;
  `,
  policies: `
    select schemaname, tablename, policyname, permissive, roles, cmd
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname;
  `,
  reservationColumns: `
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reservations'
    order by ordinal_position;
  `,
  invoiceColumns: `
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('restaurant_invoices', 'orders')
    order by table_name, ordinal_position;
  `,
  functionDefs: `
    select p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as args,
           pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'generate_restaurant_payout_invoice',
        'redeem_loyalty_points',
        'get_restaurant_performance',
        'get_restaurant_comparison',
        'get_restaurant_recommendations',
        'rls_auto_enable'
      )
    order by p.proname, args;
  `,
  recentEdgeAudit: `
    select function_name,
           status,
           count(*) as count,
           max(created_at) as last_seen
    from public.edge_function_audit_logs
    where created_at >= now() - interval '14 days'
    group by function_name, status
    order by function_name, status;
  `,
  queueHealth: `
    select 'notification_deliveries_queued' as metric, count(*)::bigint as value
    from public.notification_deliveries
    where status = 'queued'
    union all
    select 'email_queue_queued' as metric, count(*)::bigint as value
    from public.email_queue
    where status = 'queued'
    union all
    select 'dispatch_jobs_searching' as metric, count(*)::bigint as value
    from public.dispatch_jobs
    where status = 'searching'
    union all
    select 'dispatch_attempts_pending' as metric, count(*)::bigint as value
    from public.dispatch_attempts
    where status = 'pending';
  `,
};

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const out = {};
    for (const [key, sql] of Object.entries(queries)) {
      const result = await client.query(sql);
      out[key] = result.rows;
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
