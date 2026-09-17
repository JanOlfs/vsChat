// Anon key darf im Frontend liegen, der Schutz kommt aus den RLS-Policies (siehe grundidee.md).
// service_role key gehört hier NIEMALS rein.
export const environment = {
  supabaseUrl: 'https://egatvfjimsrybmzhlzts.supabase.co',
  supabaseAnonKey: 'sb_publishable_Mz5ADI9_djB6AyfGhixtdw_-RUHGFMp',
};
