-- Readings in a document carry French alongside English, Coptic and Arabic,
-- from bible.verses.french. A part-labeled verse ("35a", from
-- bible.verse_parts) has no French split, so it carries none.

CREATE OR REPLACE FUNCTION public.get_reading_text(p_reading_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_segments text[];
  v_seg text;
  v_book_num int;
  v_book_key text;
  v_rest text;
  v_start_chapter int;
  v_verse_part text;
  v_end_chapter int;
  v_start_verse int;
  v_end_verse int;
  v_result jsonb := '[]'::jsonb;
  v_verses jsonb;
BEGIN
  IF p_reading_reference IS NULL OR btrim(p_reading_reference) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT array_agg(btrim(s)) INTO v_segments
  FROM regexp_split_to_table(p_reading_reference, '\*@\+|@') AS s
  WHERE btrim(s) <> '';

  FOREACH v_seg IN ARRAY v_segments LOOP
    v_book_num     := substring(v_seg FROM '^(\d+)\.')::int;
    v_rest         := substring(v_seg FROM '^\d+\.(.*)$');
    v_start_chapter := substring(v_rest FROM '^(\d+):')::int;
    v_verse_part   := substring(v_rest FROM '^\d+:(.*)$');
    v_book_key     := bible.get_book_key_by_calendar_number(v_book_num);

    v_end_chapter := NULL; v_start_verse := NULL; v_end_verse := NULL;

    IF v_verse_part ~ ',' THEN
      -- Comma-separated tokens: each is a plain verse number ("34") or a
      -- part-labeled verse ("35a"). Route each to the right table and
      -- preserve the original comma-list order via WITH ORDINALITY.
      SELECT COALESCE(
        jsonb_agg(sub.result ORDER BY sub.ordinality),
        '[]'::jsonb
      )
      INTO v_verses
      FROM (
        -- Plain verse tokens: hit bible.verses
        SELECT
          jsonb_build_object(
            'chapter_number', v.chapter_number,
            'verse_number',   v.verse_number,
            'english', v.english, 'coptic', v.coptic, 'arabic', v.arabic, 'french', v.french
          ) AS result,
          tok.ordinality
        FROM unnest(regexp_split_to_array(v_verse_part, ','))
             WITH ORDINALITY AS tok(token, ordinality)
        JOIN bible.verses v
          ON v.book_key       = v_book_key
         AND v.chapter_number = v_start_chapter
         AND v.verse_number   = tok.token::int
        WHERE tok.token ~ '^\d+$'

        UNION ALL

        -- Part-labeled tokens ("35a"): hit bible.verse_parts via the existing RPC
        SELECT
          jsonb_build_object(
            'chapter_number', vp.chapter_number,
            'verse_number',   vp.verse_number,
            'part_label',     vp.part_label,
            'english', vp.english, 'coptic', vp.coptic, 'arabic', vp.arabic, 'french', null
          ) AS result,
          tok.ordinality
        FROM (
          SELECT token, ordinality
          FROM unnest(regexp_split_to_array(v_verse_part, ','))
               WITH ORDINALITY AS t(token, ordinality)
          WHERE t.token ~ '^\d+[a-z]$'
        ) tok
        JOIN LATERAL bible.get_verse_part_by_calendar(
          v_book_num,
          v_start_chapter,
          substring(tok.token FROM '^(\d+)[a-z]$')::int,
          substring(tok.token FROM '^\d+([a-z])$')
        ) vp ON true
      ) sub;

    ELSIF v_verse_part ~ '^\d+-\d+:\d+$' THEN
      v_start_verse := substring(v_verse_part FROM '^(\d+)-')::int;
      v_end_chapter := substring(v_verse_part FROM '-(\d+):')::int;
      v_end_verse   := substring(v_verse_part FROM ':(\d+)$')::int;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'chapter_number', r.chapter_number, 'verse_number', r.verse_number,
        'english', r.english, 'coptic', r.coptic, 'arabic', r.arabic, 'french', bv.french
      ) ORDER BY r.chapter_number, r.verse_number), '[]'::jsonb)
      INTO v_verses
      FROM bible.get_verses_by_range(v_book_key, v_start_chapter, v_start_verse, v_end_chapter, v_end_verse) r
      LEFT JOIN bible.verses bv ON bv.verse_id = r.verse_id;

    ELSIF v_verse_part ~ '^\d+-\d+$' THEN
      v_start_verse := substring(v_verse_part FROM '^(\d+)-')::int;
      v_end_verse   := substring(v_verse_part FROM '-(\d+)$')::int;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'chapter_number', r.chapter_number, 'verse_number', r.verse_number,
        'english', r.english, 'coptic', r.coptic, 'arabic', r.arabic, 'french', bv.french
      ) ORDER BY r.chapter_number, r.verse_number), '[]'::jsonb)
      INTO v_verses
      FROM bible.get_verses_by_range(v_book_key, v_start_chapter, v_start_verse, v_start_chapter, v_end_verse) r
      LEFT JOIN bible.verses bv ON bv.verse_id = r.verse_id;

    ELSIF v_verse_part ~ '^\d+[a-z]$' THEN
      v_start_verse := substring(v_verse_part FROM '^(\d+)')::int;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'chapter_number', vp.chapter_number, 'verse_number', vp.verse_number,
        'part_label', vp.part_label,
        'english', vp.english, 'coptic', vp.coptic, 'arabic', vp.arabic, 'french', null
      )), '[]'::jsonb)
      INTO v_verses
      FROM bible.get_verse_part_by_calendar(
             v_book_num, v_start_chapter, v_start_verse,
             substring(v_verse_part FROM '([a-z])$')
           ) vp;

    ELSE
      v_start_verse := v_verse_part::int;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'chapter_number', chapter_number, 'verse_number', verse_number,
        'english', english, 'coptic', coptic, 'arabic', arabic, 'french', french
      ) ORDER BY verse_number), '[]'::jsonb)
      INTO v_verses
      FROM bible.verses
      WHERE book_key = v_book_key
        AND chapter_number = v_start_chapter
        AND verse_number = v_start_verse;
    END IF;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'segment',        v_seg,
      'book_key',       v_book_key,
      'start_chapter',  v_start_chapter,
      'verses',         v_verses
    ));
  END LOOP;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'get_reading_text failed for reference=% : %', p_reading_reference, SQLERRM;
  RETURN jsonb_build_array(jsonb_build_object('segment', p_reading_reference, 'error', SQLERRM));
END;
$function$;

-- Offline calendars carry packaged get_readings_for_date results.
update offline_content.resources set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key = 'calendar';
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
