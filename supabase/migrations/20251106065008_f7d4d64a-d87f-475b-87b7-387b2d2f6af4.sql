-- Explicitly set security_invoker to true for the view
ALTER VIEW public.public_profile_search SET (security_invoker = true);