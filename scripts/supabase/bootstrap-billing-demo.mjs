#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY){console.error('Missing envs');process.exit(1)}
const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY);
const {data:tenant}=await sb.from('tenants').select('id').eq('slug','demo-clinic').maybeSingle();
if(!tenant) throw new Error('Missing demo-clinic tenant');
await sb.from('platform_plans').upsert({code:'starter',name:'Starter',billing_cycle:'monthly',amount_cents:19900,currency:'BRL'});
const plan=(await sb.from('platform_plans').select('id').eq('code','starter').single()).data;
await sb.from('tenant_subscriptions').upsert({tenant_id:tenant.id,platform_plan_id:plan.id,status:'active'});
console.log('Billing demo bootstrap complete');
