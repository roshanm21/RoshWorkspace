import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://owswpfqgyoozvlnwmpqb.supabase.co";
const supabaseAnonJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93c3dwZnFneW9venZsbndtcHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMjU1NzAsImV4cCI6MjEwNjgwMTU3MH0.sjyiiDMex-PWggu46z-PTlORUJ10rMi-iWA7Xpx9Kuk";

export const STORAGE_BUCKET = "RWS-DBMS";
export const supabase = createClient(supabaseUrl, supabaseAnonJwt);

export async function getSupabase() {
  return supabase;
}
