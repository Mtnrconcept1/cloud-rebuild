-- Operator-only SELECT on the verified TOK project. Do not publish the returned JSON.
-- Include only the exact current approved revision and the current approved profile.
SELECT jsonb_build_object(
  'profileVersion', s.profile_version,
  'article', jsonb_build_object('id',a.id,'slug',a.slug,'version',a.version,
    'current_revision',a.current_revision,'approved_revision',a.approved_revision),
  'revision', jsonb_build_object('article_id',r.article_id,'revision',r.revision,
    'profile_version',r.profile_version,'document',r.document)
) AS snapshot
FROM public.marketing_growth_sites s
JOIN public.marketing_growth_articles a USING (site_key)
JOIN public.marketing_growth_revisions r ON r.article_id=a.id AND r.revision=a.current_revision
WHERE s.site_key='tok' AND NOT s.paused AND public.marketing_runtime_enabled() AND s.profile_approved_at IS NOT NULL
  AND a.approved_at IS NOT NULL AND a.approved_revision=r.revision
  AND r.profile_version=s.profile_version
  AND EXISTS (SELECT 1 FROM public.user_roles u WHERE u.user_id=a.approved_by AND u.role='admin')
ORDER BY a.approved_at DESC, a.id
LIMIT 20;
