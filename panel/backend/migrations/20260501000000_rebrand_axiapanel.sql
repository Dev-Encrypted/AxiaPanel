-- Rebrand: replace any lingering "DockPanel" values with "AxiaPanel"
-- in user-visible settings stored before the rebrand.

UPDATE settings
   SET value = 'AxiaPanel', updated_at = NOW()
 WHERE key = 'panel_name'
   AND value = 'DockPanel';

UPDATE settings
   SET value = 'AxiaPanel', updated_at = NOW()
 WHERE key = 'smtp_from_name'
   AND value = 'DockPanel';

-- Reseller profiles that whitelabel a custom name kept their override;
-- only flip rows that were defaulting to "DockPanel".
UPDATE reseller_profiles
   SET panel_name = 'AxiaPanel'
 WHERE panel_name = 'DockPanel';
