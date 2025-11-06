-- Drop the security definer function that's causing the warning
DROP FUNCTION IF EXISTS public.search_public_profiles(text);