-- Canonicalize legacy public image paths that duplicated identical assets with
-- accented names, spaces or historical typos. This keeps existing production
-- rows compatible after the legacy files are removed from public/images.
DO $$
DECLARE
  target_column record;
  image_alias record;
BEGIN
  FOR target_column IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('image_url', 'media_url')
      AND data_type IN ('text', 'character varying')
  LOOP
    FOR image_alias IN
      SELECT *
      FROM (VALUES
        ('/images/fondue moitié moitié.jpg', '/images/fondue-moitie-moitie.jpg'),
        ('/images/meringue double.webp', '/images/meringue-double.webp'),
        ('/images/milshake oreo.jpg', '/images/milkshake-oreo.jpg'),
        ('/images/milshake vanille.jpeg', '/images/milkshake-vanille.jpeg'),
        ('/images/moshi glacés.jpg', '/images/mochi-glaces.jpg'),
        ('/images/rösti bernois.jpg', '/images/rosti-bernois.jpg'),
        ('/images/salade du marché.jpg', '/images/salade-du-marche.jpg'),
        ('/images/taboulé.webp', '/images/taboule.webp')
      ) AS aliases(legacy_url, canonical_url)
    LOOP
      EXECUTE format(
        'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
        target_column.table_schema,
        target_column.table_name,
        target_column.column_name,
        target_column.column_name
      )
      USING image_alias.canonical_url, image_alias.legacy_url;
    END LOOP;
  END LOOP;
END $$;
