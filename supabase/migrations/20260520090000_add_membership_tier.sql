-- Add membership_tier column to profiles (basic / gold for now)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_tier text NOT NULL DEFAULT 'basic'
  CHECK (membership_tier IN ('basic', 'gold'));

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_profiles_membership_tier ON public.profiles (membership_tier);
