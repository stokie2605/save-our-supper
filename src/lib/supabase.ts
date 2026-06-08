import { createClient } from '@supabase/supabase-js';

// Pull our keys safely out of our clean .env.local framework file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Throw an intentional safety error if our setup keys are completely blank
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase Environment Keys inside .env.local configuration file.');
}

// Export our unified client engine for all our components to share cleanly
export const supabase = createClient(supabaseUrl, supabaseAnonKey);