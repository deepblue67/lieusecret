// ⚙️ Configuration Supabase
// Supabase → ton projet → Project Settings → API (ou "Connect") :
//   - SUPABASE_URL      : "Project URL", ex. https://abcdefgh.supabase.co
//   - SUPABASE_ANON_KEY : clé publique "anon" ou "publishable" (sb_publishable_...)
// Ces deux valeurs sont faites pour être publiques (elles finissent de toute façon
// dans le navigateur). Ne mets JAMAIS ici la clé "service_role" / "secret".
//
// Même projet Supabase que « Undercover famille » et « Buzzer » (les canaux « lieu:XXXX »
// ne se mélangent pas avec ceux des autres jeux).
//
// Tant que ces valeurs ne sont pas renseignées, l'appli tourne en mode "local" :
// les onglets d'un même navigateur jouent ensemble (pratique pour tester).

export const SUPABASE_URL = 'https://svgczsupkpilwzxyidzm.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_0iWkc1kErLseDBA8fTPGZQ_m5-JXhJU';
