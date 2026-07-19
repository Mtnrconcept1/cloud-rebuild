-- Commercial accounts use virtual demo dashboards instead of production role grants.
-- Administrators that also carry the commercial role keep their real operational roles.
WITH commercial_only_users AS (
  SELECT DISTINCT commercial.user_id
  FROM public.user_roles AS commercial
  WHERE commercial.role = 'commercial'
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles AS administrator
      WHERE administrator.user_id = commercial.user_id
        AND administrator.role = 'admin'
    )
)
DELETE FROM public.user_roles AS assigned
USING commercial_only_users AS target
WHERE assigned.user_id = target.user_id
  AND assigned.role <> 'commercial';

