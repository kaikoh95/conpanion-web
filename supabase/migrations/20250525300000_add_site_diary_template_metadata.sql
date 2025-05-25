-- Add metadata column to site_diary_templates table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'site_diary_templates' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.site_diary_templates ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
    END IF;
END
$$;

-- Now update templates with default metadata configuration
UPDATE public.site_diary_templates
SET metadata = jsonb_build_object(
  'enableWeather', false,
  'enableTemperature', false,
  'enableManpower', false,
  'enableEquipment', false,
  'enableMaterials', false,
  'enableSafety', false,
  'enableConditions', false,
  'weatherOptions', jsonb_build_array('Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Stormy', 'Snowy', 'Foggy', 'Windy'),
  'equipmentOptions', jsonb_build_array('Excavator', 'Bulldozer', 'Crane', 'Loader', 'Dump Truck', 'Forklift', 'Concrete Mixer', 'Generator', 'Compressor', 'Scaffolding'),
  'requireWeather', false,
  'requireTemperature', false,
  'requireManpower', false,
  'requireEquipment', false,
  'requireMaterials', false,
  'requireSafety', false,
  'requireConditions', false
)
WHERE metadata IS NULL OR metadata::text = '{}'; 