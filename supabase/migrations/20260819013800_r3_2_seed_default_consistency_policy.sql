-- ==============================================================================
-- C4B-4-R3: Seed Default Consistency Policy
-- Migration File: 20260819013800_r3_2_seed_default_consistency_policy.sql
-- ==============================================================================

INSERT INTO public.product_consistency_policies (
  id, 
  name, 
  pass_threshold, 
  review_threshold, 
  dimension_weights, 
  active
) VALUES (
  'default-policy-v1', 
  'Furniture Product Consistency V1', 
  90, 
  80, 
  '{
    "silhouette": 20,
    "module_structure": 10,
    "armrest": 15,
    "backrest_headrest": 15,
    "seat_leg": 10,
    "material_color": 15,
    "decoration_function": 10,
    "accessories": 5
  }'::jsonb, 
  true
) ON CONFLICT (id) DO NOTHING;
