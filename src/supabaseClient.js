// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Dapatkan URL dan Anon Key dari Dashboard Supabase -> Project Settings -> API
const supabaseUrl = 'https://fspskuwlsirkwoyzpawz.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcHNrdXdsc2lya3dveXpwYXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODY4OTEsImV4cCI6MjA5NDQ2Mjg5MX0.mIJ8pUWPTG181mae1YRLM7PTTdq7ECLiPqOGUjgK5pA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)