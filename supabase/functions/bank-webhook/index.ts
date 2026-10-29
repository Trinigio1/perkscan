import { createClient } from '@supabase/supabase-js';
import { bankConfig } from '../_shared/bank/config.ts';
import { bankWebhookHandler } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const { provider, key } = await bankConfig();

Deno.serve(bankWebhookHandler({ db, provider, key }));
