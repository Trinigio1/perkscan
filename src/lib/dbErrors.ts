/** Turns PostgREST errors that mean "database not set up" into something actionable. */
export function friendlyDbError(what: string, err: { message: string; code?: string }): string {
  if (err.code === 'PGRST205' || err.code === '42P01' || /does not exist|could not find the (table|function)/i.test(err.message)) {
    return `The database isn't set up yet (missing ${what}). In VS Code run: npx supabase db push --include-seed`;
  }
  if (what === 'profile' && err.code === 'PGRST116') {
    return 'Your profile row is missing — usually because the account was created before the database was set up. Run: npx supabase db push';
  }
  return err.message;
}
