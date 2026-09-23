-- Great Lent is keyed as calendar.season_ranges.range_key = 'lent', with
-- inclusive start_date and end_date. The old "Great Fast" lookup found no
-- matching range, causing Lent's weekday fasts to become normal fasting days.
-- Resolve the actual Lent season and its final Friday, then suppress Annual
-- and NormalFastingDays throughout Great Lent and the holy-week range.
-- All unrelated seasonal and weekday flags remain unchanged.

CREATE OR REPLACE FUNCTION calendar.get_active_flags_for_date(p_gregorian_date date)
 RETURNS TABLE(flag_key text, flag_type text, title_english text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  c_rec          RECORD;
  greg_year      integer; coptic_year integer;
  lent_start     date; lent_end date;
  pascha_start   date;
  h50_start      date; h50_end date;
  apostles_start date; apostles_end date;
  stmary_start   date; stmary_end date;
  natfast_start  date; natfast_end date;
  jonah_start    date; jonah_end date;
  lazarus_sat    date; palm_sun date; covenant_thu date; good_fri date; bright_sat date;
  resurrection   date; thomas_sun date; ascension date; pentecost date;
  last_fri_lent  date; first_mon_lent date;
  jonah_feast    date; apostles_feast date; stmary_feast date;
  nativity_date  date; theophany_date date;
  kiahk_bounds   RECORD;
  kiahk_sundays  date[]; lent_sundays date[];
  lent_sun_idx   integer; k_idx integer; k_sun date; tmp_date date;
  v_paramoun_nat  boolean := false; v_paramoun_theo boolean := false; v_cnt integer;
  v_in_natfast   boolean := false;
  v_in_stmary    boolean := false;
  v_in_apostles  boolean := false;
  v_feast_day            boolean := false;
  v_theo_paramoun_start  date;
  v_nativity_period_end  date;
  v_theophany_period_end date;
  v_in_nativity_period   boolean := false;
  v_in_theophany_period  boolean := false;
  v_in_nayrouz_period    boolean := false;
  v_in_h50_period        boolean := false;
  v_md                   integer;
  -- The Kiahk season start that closes the ApostlesFastToLastDayOfHathor and
  -- Joyful29 windows. For dates already past the current coptic year's Kiahk
  -- (e.g. Abib/Misra when Kiahk fell in the previous Gregorian calendar year),
  -- this points to the next coptic year's Kiahk rather than the stale past one.
  v_next_kiahk_start date;
BEGIN
  SELECT * INTO c_rec FROM calendar.coptic_date_conversions WHERE gregorian_date = p_gregorian_date;
  IF NOT FOUND THEN RETURN; END IF;
  greg_year := c_rec.gregorian_year; coptic_year := c_rec.coptic_year;

  SELECT start_date,end_date INTO lent_start,lent_end FROM calendar.season_ranges
    WHERE range_key='lent' AND extract(year FROM start_date)=greg_year LIMIT 1;
  SELECT start_date INTO pascha_start FROM calendar.season_ranges
    WHERE active_season='Holy Pascha' AND extract(year FROM start_date)=greg_year LIMIT 1;
  SELECT start_date,end_date INTO h50_start,h50_end FROM calendar.season_ranges
    WHERE active_season='Holy 50 Days' AND extract(year FROM start_date)=greg_year LIMIT 1;
  SELECT start_date,end_date INTO apostles_start,apostles_end FROM calendar.season_ranges
    WHERE active_season='Apostles'' Fast' AND extract(year FROM start_date)=greg_year LIMIT 1;
  SELECT start_date,end_date INTO stmary_start,stmary_end FROM calendar.season_ranges
    WHERE active_season='St. Mary''s Fast' AND extract(year FROM start_date)=greg_year LIMIT 1;
  SELECT start_date,end_date INTO jonah_start,jonah_end FROM calendar.season_ranges
    WHERE active_season='Jonah''s Fast' AND extract(year FROM start_date)=greg_year LIMIT 1;
  SELECT start_date,end_date INTO natfast_start,natfast_end FROM calendar.season_ranges
    WHERE active_season='Nativity Fast'
      AND p_gregorian_date>=start_date AND p_gregorian_date<end_date
    ORDER BY start_date DESC LIMIT 1;

  lazarus_sat  := pascha_start;
  palm_sun     := CASE WHEN pascha_start IS NOT NULL THEN pascha_start+1 END;
  covenant_thu := CASE WHEN h50_start IS NOT NULL THEN h50_start-3 END;
  good_fri     := CASE WHEN h50_start IS NOT NULL THEN h50_start-2 END;
  bright_sat   := CASE WHEN h50_start IS NOT NULL THEN h50_start-1 END;
  resurrection := h50_start;
  thomas_sun   := CASE WHEN h50_start IS NOT NULL THEN h50_start+7 END;
  ascension    := CASE WHEN h50_start IS NOT NULL THEN h50_start+39 END;
  pentecost    := h50_end;
  last_fri_lent := CASE WHEN lent_end IS NOT NULL THEN lent_end END;
  jonah_feast    := jonah_end;
  apostles_feast := apostles_end;
  stmary_feast   := stmary_end;

  SELECT gregorian_date INTO nativity_date FROM calendar.calendar_event_instances
    WHERE event_key='TheHolyNativityFeast'
      AND extract(year FROM gregorian_date) IN (greg_year,greg_year-1,greg_year+1)
    ORDER BY abs(gregorian_date - p_gregorian_date) LIMIT 1;
  SELECT gregorian_date INTO theophany_date FROM calendar.calendar_event_instances
    WHERE event_key='TheHolyEpiphany'
      AND extract(year FROM gregorian_date) IN (greg_year,greg_year-1,greg_year+1)
    ORDER BY abs(gregorian_date - p_gregorian_date) LIMIT 1;

  SELECT COUNT(*) INTO v_cnt FROM (
    SELECT pd.gregorian_date FROM calendar.get_paramoun_dates(greg_year) pd
      WHERE pd.flag_key='ParamounNativity' AND pd.gregorian_date=p_gregorian_date
    UNION ALL
    SELECT pd.gregorian_date FROM calendar.get_paramoun_dates(greg_year-1) pd
      WHERE pd.flag_key='ParamounNativity' AND pd.gregorian_date=p_gregorian_date) t;
  v_paramoun_nat := v_cnt>0;
  SELECT COUNT(*) INTO v_cnt FROM (
    SELECT pd.gregorian_date FROM calendar.get_paramoun_dates(greg_year) pd
      WHERE pd.flag_key='ParamounTheophany' AND pd.gregorian_date=p_gregorian_date
    UNION ALL
    SELECT pd.gregorian_date FROM calendar.get_paramoun_dates(greg_year-1) pd
      WHERE pd.flag_key='ParamounTheophany' AND pd.gregorian_date=p_gregorian_date) t;
  v_paramoun_theo := v_cnt>0;

  v_in_natfast  := natfast_start  IS NOT NULL AND p_gregorian_date>=natfast_start  AND p_gregorian_date<natfast_end;
  v_in_stmary   := stmary_start   IS NOT NULL AND p_gregorian_date>=stmary_start   AND p_gregorian_date<stmary_end;
  v_in_apostles := apostles_start IS NOT NULL AND p_gregorian_date>=apostles_start AND p_gregorian_date<apostles_end;

  IF theophany_date IS NOT NULL THEN
    SELECT MIN(pd.gregorian_date) INTO v_theo_paramoun_start
    FROM calendar.get_paramoun_dates(extract(year FROM theophany_date)::integer) pd
    WHERE pd.flag_key='ParamounTheophany';
  END IF;
  SELECT gregorian_date INTO v_nativity_period_end FROM calendar.coptic_date_conversions WHERE coptic_month = 5 AND coptic_day = 5 AND gregorian_date >= nativity_date ORDER BY gregorian_date LIMIT 1;

  IF theophany_date IS NOT NULL THEN
    SELECT gregorian_date INTO v_theophany_period_end
    FROM calendar.coptic_date_conversions
    WHERE coptic_month=5 AND coptic_day=13
      AND gregorian_date >= theophany_date
    ORDER BY gregorian_date LIMIT 1;
  END IF;

  v_in_nativity_period  := nativity_date IS NOT NULL AND v_nativity_period_end IS NOT NULL
                           AND p_gregorian_date>=nativity_date AND p_gregorian_date<=v_nativity_period_end;
  v_in_theophany_period := theophany_date IS NOT NULL AND v_theophany_period_end IS NOT NULL
                           AND p_gregorian_date>=theophany_date AND p_gregorian_date<=v_theophany_period_end;
  v_in_nayrouz_period   := c_rec.coptic_month = 1 AND c_rec.coptic_day <= 16;
  v_in_h50_period       := pascha_start IS NOT NULL AND h50_end IS NOT NULL
                           AND p_gregorian_date>=pascha_start AND p_gregorian_date<=h50_end;

  SELECT EXISTS (
    SELECT 1 FROM calendar.calendar_event_instances
    WHERE gregorian_date = p_gregorian_date
      AND event_key IN (
        'TheHolyNativityFeast','TheHolyEpiphany','AnnunciationFeast',
        'EntryIntoEgypt','TransfigurationFeast','TheCircumcisionFeast',
        'FeastOfTheWeddingOfCanaOfGalilee','EntryIntoTheTemple',
        'TheNayrouzFeastCopticNewYear',
        'JonahsNinevehFeast','TheApostlesFeastMartyrdomOfStPeterAndStPaul',
        'AssumptionOfStMarysBody')
  ) INTO v_feast_day;
  v_feast_day := v_feast_day
    OR (c_rec.coptic_month=1 AND c_rec.coptic_day BETWEEN 17 AND 19)
    OR (c_rec.coptic_month=7 AND c_rec.coptic_day=10)
    OR (resurrection   IS NOT NULL AND p_gregorian_date=resurrection)
    OR (pentecost      IS NOT NULL AND p_gregorian_date=pentecost)
    OR (ascension      IS NOT NULL AND p_gregorian_date=ascension)
    OR (palm_sun       IS NOT NULL AND p_gregorian_date=palm_sun)
    OR (lazarus_sat    IS NOT NULL AND p_gregorian_date=lazarus_sat)
    OR (jonah_feast    IS NOT NULL AND p_gregorian_date=jonah_feast)
    OR (apostles_feast IS NOT NULL AND p_gregorian_date=apostles_feast)
    OR (stmary_feast   IS NOT NULL AND p_gregorian_date=stmary_feast);

  SELECT * INTO kiahk_bounds FROM calendar.get_kiahk_season_bounds(coptic_year);
  IF kiahk_bounds IS NOT NULL THEN
    SELECT ARRAY_AGG(gregorian_date ORDER BY gregorian_date) INTO kiahk_sundays
      FROM calendar.coptic_date_conversions
      WHERE gregorian_date BETWEEN kiahk_bounds.season_start AND kiahk_bounds.season_end
        AND weekday='Sunday';
  END IF;
  IF lent_start IS NOT NULL THEN
    SELECT ARRAY_AGG(gregorian_date ORDER BY gregorian_date) INTO lent_sundays
      FROM calendar.coptic_date_conversions
      WHERE gregorian_date>=lent_start AND gregorian_date<=lent_end AND weekday='Sunday';
    SELECT MIN(gregorian_date) INTO first_mon_lent
      FROM calendar.coptic_date_conversions
      WHERE gregorian_date>=lent_start AND gregorian_date<lent_start+7 AND weekday='Monday';
  END IF;

  -- Determine the Kiahk start that closes the ApostlesFastToLastDayOfHathor /
  -- Joyful29 windows. kiahk_bounds is for the current coptic_year, but in
  -- Coptic months 10-12 (Paoni/Abib/Misra) the Gregorian year has already
  -- rolled past that Kiahk (e.g. checking Aug 2026 against Kiahk 1742 which
  -- started Dec 2025). When that happens, advance to coptic_year+1's Kiahk.
  IF kiahk_bounds IS NULL THEN
    v_next_kiahk_start := NULL;
  ELSIF p_gregorian_date > kiahk_bounds.season_end THEN
    SELECT season_start INTO v_next_kiahk_start FROM calendar.get_kiahk_season_bounds(coptic_year + 1);
  ELSE
    v_next_kiahk_start := kiahk_bounds.season_start;
  END IF;

  -- ══ A. GREAT FEASTS ══════════════════════════════════════════════════════
  IF resurrection IS NOT NULL AND p_gregorian_date=resurrection THEN
    RETURN QUERY VALUES ('Resurrection','season_feast','Resurrection'),
      ('GreatFeasts','season_feast','Great Feasts'),('Feasts','season_feast','Feasts'),
      ('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'),
      ('PentecostPeriod','season_feast','Holy Fifty Days'),
      ('PreAscensionPentecostPeriod','season_feast','Pre-Ascension Pentecost Period');
  END IF;
  IF nativity_date IS NOT NULL AND p_gregorian_date=nativity_date AND NOT v_paramoun_nat THEN
    RETURN QUERY VALUES ('Nativity','season_feast','Nativity'),
      ('NativityFeast','season_feast','Nativity Feast'),
      ('GreatFeasts','season_feast','Great Feasts'),('Feasts','season_feast','Feasts'),
      ('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods');
  END IF;
  IF theophany_date IS NOT NULL AND p_gregorian_date=theophany_date AND NOT v_paramoun_theo THEN
    RETURN QUERY VALUES ('Theophany','season_feast','Theophany'),
      ('TheophanyLiturgyOfTheWaters','season_feast','Theophany Liturgy of the Waters'),
      ('GreatFeasts','season_feast','Great Feasts'),('Feasts','season_feast','Feasts'),
      ('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods');
  END IF;
  IF pentecost IS NOT NULL AND p_gregorian_date=pentecost THEN
    RETURN QUERY VALUES ('Pentecost','season_feast','Pentecost'),
      ('GreatFeasts','season_feast','Great Feasts'),('Feasts','season_feast','Feasts'),
      ('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'),
      ('PentecostPeriod','season_feast','Holy Fifty Days'),
      ('PostAscensionPentecostPeriod','season_feast','Post-Ascension Pentecost Period');
  END IF;
  IF ascension IS NOT NULL AND p_gregorian_date=ascension THEN
    RETURN QUERY VALUES ('Ascension','season_feast','Ascension'),
      ('GreatFeasts','season_feast','Great Feasts'),('Feasts','season_feast','Feasts'),
      ('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'),
      ('PentecostPeriod','season_feast','Holy Fifty Days'),
      ('PostAscensionPentecostPeriod','season_feast','Post-Ascension Pentecost Period');
  END IF;

  -- ══ A2. NATIVITY / THEOPHANY PERIODS ═════════════════════════════════════
  IF v_in_nativity_period THEN
    RETURN QUERY VALUES ('NativityPeriod','season_feast','Nativity Period');
  END IF;
  IF v_in_theophany_period THEN
    RETURN QUERY VALUES ('TheophanyPeriod','season_feast','Theophany Period');
  END IF;

  -- ══ B. HOLY WEEK ═════════════════════════════════════════════════════════
  IF pascha_start IS NOT NULL AND bright_sat IS NOT NULL
     AND p_gregorian_date>=pascha_start AND p_gregorian_date<=bright_sat THEN
    RETURN QUERY VALUES ('Pascha','season_feast','Holy Pascha'),('PaschaWeek','season_feast','Holy Week');
    IF p_gregorian_date=lazarus_sat THEN RETURN QUERY VALUES ('LazarusSaturday','season_feast','Lazarus Saturday'),('Feasts','season_feast','Feasts'); END IF;
    IF p_gregorian_date=palm_sun THEN RETURN QUERY VALUES ('PalmSunday','season_feast','Palm Sunday'),('HosannaSunday','season_feast','Palm Sunday'),('Feasts','season_feast','Feasts'); END IF;
    IF p_gregorian_date=covenant_thu THEN RETURN QUERY VALUES ('CovenantThursday','season_feast','Covenant Thursday'); END IF;
    IF p_gregorian_date=good_fri THEN RETURN QUERY VALUES ('GoodFriday','season_feast','Good Friday'); END IF;
    IF p_gregorian_date=bright_sat THEN RETURN QUERY VALUES ('BrightSaturday','season_feast','Bright Saturday'),('JoyousSaturday','season_feast','Bright Saturday'),('BrightSaturdayAttribute','season_feast','Bright Saturday'); END IF;
  END IF;

  -- ══ C. HOLY 50 DAYS ══════════════════════════════════════════════════════
  IF h50_start IS NOT NULL AND resurrection IS NOT NULL AND pentecost IS NOT NULL
     AND p_gregorian_date>resurrection AND p_gregorian_date<pentecost
     AND (ascension IS NULL OR p_gregorian_date!=ascension) THEN
    RETURN QUERY VALUES ('PentecostPeriod','season_feast','Holy Fifty Days');
    IF p_gregorian_date=resurrection+1 THEN RETURN QUERY VALUES ('DayAfterResurrection','season_feast','Day After Resurrection'); END IF;
    IF p_gregorian_date=thomas_sun THEN RETURN QUERY VALUES ('ThomasSunday','season_feast','Thomas Sunday'); END IF;
    IF p_gregorian_date<ascension THEN RETURN QUERY VALUES ('PreAscensionPentecostPeriod','season_feast','Pre-Ascension Pentecost Period');
    ELSIF ascension IS NOT NULL AND p_gregorian_date>ascension THEN RETURN QUERY VALUES ('PostAscensionPentecostPeriod','season_feast','Post-Ascension Pentecost Period'); END IF;
  END IF;

  -- Aggregate Feasts flag for all festive periods, while avoiding
  -- duplicate Feasts rows on individual feast days that already emit it.
  IF (v_in_nativity_period OR v_in_theophany_period OR v_in_nayrouz_period OR v_in_h50_period)
     AND NOT v_feast_day THEN
    RETURN QUERY VALUES ('Feasts','season_feast','Feasts');
  END IF;

  -- ══ D. FEASTS OF THE LORD ════════════════════════════════════════════════
  IF EXISTS (SELECT 1 FROM calendar.calendar_event_instances WHERE event_key='AnnunciationFeast' AND gregorian_date=p_gregorian_date) THEN RETURN QUERY VALUES ('Annunciation','season_feast','Annunciation'),('Feasts','season_feast','Feasts'),('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'); END IF;
  IF EXISTS (SELECT 1 FROM calendar.calendar_event_instances WHERE event_key='EntryIntoEgypt' AND gregorian_date=p_gregorian_date) THEN RETURN QUERY VALUES ('EntryIntoEgypt','season_feast','Entry into Egypt'),('Feasts','season_feast','Feasts'),('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'); END IF;
  IF EXISTS (SELECT 1 FROM calendar.calendar_event_instances WHERE event_key='TransfigurationFeast' AND gregorian_date=p_gregorian_date) THEN RETURN QUERY VALUES ('Transfiguration','season_feast','Transfiguration'),('Feasts','season_feast','Feasts'),('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'); END IF;
  IF EXISTS (SELECT 1 FROM calendar.calendar_event_instances WHERE event_key='TheCircumcisionFeast' AND gregorian_date=p_gregorian_date) THEN RETURN QUERY VALUES ('Circumcision','season_feast','Circumcision'),('Feasts','season_feast','Feasts'),('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'); END IF;
  IF EXISTS (SELECT 1 FROM calendar.calendar_event_instances WHERE event_key='FeastOfTheWeddingOfCanaOfGalilee' AND gregorian_date=p_gregorian_date) THEN RETURN QUERY VALUES ('WeddingCana','season_feast','Wedding at Cana'),('Feasts','season_feast','Feasts'),('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'); END IF;
  IF EXISTS (SELECT 1 FROM calendar.calendar_event_instances WHERE event_key='EntryIntoTheTemple' AND gregorian_date=p_gregorian_date) THEN RETURN QUERY VALUES ('EntryIntoTheTemple','season_feast','Presentation in the Temple'),('Feasts','season_feast','Feasts'),('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'); END IF;

  -- ══ E. NAYROUZ & CROSS ═══════════════════════════════════════════════════
  IF EXISTS (SELECT 1 FROM calendar.calendar_event_instances WHERE event_key='TheNayrouzFeastCopticNewYear' AND gregorian_date=p_gregorian_date) THEN RETURN QUERY VALUES ('CopticNewYear','season_feast','Coptic New Year'),('Nayrouz','season_feast','Nayrouz'),('Feasts','season_feast','Feasts'); END IF;
  IF v_in_nayrouz_period THEN RETURN QUERY VALUES ('Nayrouz','season_feast','Coptic New Year Period'); END IF;
  IF c_rec.coptic_month=1 AND c_rec.coptic_day BETWEEN 17 AND 19 THEN RETURN QUERY VALUES ('FeastOfTheCross','season_feast','Feast of the Cross'),('HolyCross','season_feast','Holy Cross'),('ThooutFeastOfTheCross1','season_feast','Thoout Feast of the Cross'),('Feasts','season_feast','Feasts'),('FeastsOfTheLordPeriods','season_feast','Feasts of the Lord Periods'); END IF;
  IF c_rec.coptic_month=7 AND c_rec.coptic_day=10 THEN RETURN QUERY VALUES ('FeastOfTheCross','season_feast','Feast of the Cross'),('HolyCross','season_feast','Holy Cross'),('ParemhotepFeastOfTheCross','season_feast','Paremhotep Feast of the Cross'),('Feasts','season_feast','Feasts'); END IF;

  -- ══ F. LENT ══════════════════════════════════════════════════════════════
  IF lent_start IS NOT NULL AND p_gregorian_date>=lent_start AND p_gregorian_date<=lent_end THEN
    RETURN QUERY VALUES ('Lent','season_feast','Lent'),('GreatLent','season_feast','Lent'),('GreatFast','season_feast','Lent'),('Fasts','season_feast','Fasts');
    IF c_rec.weekday IN ('Monday','Tuesday','Wednesday','Thursday','Friday') THEN RETURN QUERY VALUES ('LentWeekdays','season_feast','Lent Weekdays'); END IF;
    IF c_rec.weekday IN ('Saturday','Sunday') THEN RETURN QUERY VALUES ('LentWeekends','season_feast','Lent Weekends'); END IF;
    IF first_mon_lent IS NOT NULL AND p_gregorian_date=first_mon_lent THEN RETURN QUERY VALUES ('FirstMondayOfLent','season_feast','First Monday of Lent'),('FirstMondayOfGreatFast','season_feast','First Monday of Lent'); END IF;
    IF last_fri_lent IS NOT NULL AND p_gregorian_date=last_fri_lent THEN RETURN QUERY VALUES ('LastFridayOfLent','season_feast','Last Friday of Lent'),('LastFridayOfGreatFast','season_feast','Last Friday of Lent'); END IF;
    IF lent_sundays IS NOT NULL AND array_length(lent_sundays,1)>0 THEN
      IF p_gregorian_date>=lent_start AND p_gregorian_date<lent_sundays[1] THEN RETURN QUERY VALUES ('LentWeek1','season_feast','Lent Week 1'); END IF;
      FOR lent_sun_idx IN 1..array_length(lent_sundays,1) LOOP
        k_sun := lent_sundays[lent_sun_idx];
        IF p_gregorian_date=k_sun THEN
          CASE lent_sun_idx
            WHEN 1 THEN RETURN QUERY VALUES ('LentSunday1','season_feast','First Sunday of Lent'),('GreatFastSunday0','season_feast','First Sunday of Lent');
            WHEN 2 THEN RETURN QUERY VALUES ('LentSunday2','season_feast','Second Sunday of Lent');
            WHEN 3 THEN RETURN QUERY VALUES ('LentSunday3','season_feast','Third Sunday of Lent');
            WHEN 4 THEN RETURN QUERY VALUES ('LentSunday4','season_feast','Fourth Sunday of Lent');
            WHEN 5 THEN RETURN QUERY VALUES ('LentSunday5','season_feast','Fifth Sunday of Lent');
            WHEN 6 THEN RETURN QUERY VALUES ('LentSunday6','season_feast','Sixth Sunday of Lent');
            ELSE NULL;
          END CASE;
        END IF;
        tmp_date := CASE WHEN lent_sun_idx<array_length(lent_sundays,1) THEN lent_sundays[lent_sun_idx+1] ELSE lent_end + 1 END;
        IF p_gregorian_date>k_sun AND p_gregorian_date<tmp_date THEN
          CASE lent_sun_idx
            WHEN 1 THEN RETURN QUERY VALUES ('LentWeek2','season_feast','Lent Week 2');
            WHEN 2 THEN RETURN QUERY VALUES ('LentWeek3','season_feast','Lent Week 3');
            WHEN 3 THEN RETURN QUERY VALUES ('LentWeek4','season_feast','Lent Week 4');
            WHEN 4 THEN RETURN QUERY VALUES ('LentWeek5','season_feast','Lent Week 5');
            WHEN 5 THEN RETURN QUERY VALUES ('LentWeek6','season_feast','Lent Week 6');
            WHEN 6 THEN RETURN QUERY VALUES ('LentWeek7','season_feast','Lent Week 7');
            ELSE NULL;
          END CASE;
        END IF;
      END LOOP;
    END IF;
  END IF;
  IF lent_start IS NOT NULL AND c_rec.weekday='Sunday' AND p_gregorian_date=lent_start-7 THEN
    RETURN QUERY VALUES ('LentSunday0','season_feast','Preparation Sunday'),('GreatFastSunday0','season_feast','Preparation Sunday');
  END IF;

  -- ══ G. JONAH ═════════════════════════════════════════════════════════════
  IF jonah_start IS NOT NULL AND p_gregorian_date>=jonah_start AND p_gregorian_date<jonah_end THEN RETURN QUERY VALUES ('JonahFast','season_feast','Jonah''s Fast'),('JonahsFast','season_feast','Jonah''s Fast'),('Fasts','season_feast','Fasts'); END IF;
  IF jonah_feast IS NOT NULL AND p_gregorian_date=jonah_feast THEN RETURN QUERY VALUES ('JonahPassover','season_feast','Jonah''s Passover'),('JonahsPassover','season_feast','Jonah''s Passover'),('JonahTheProphet','season_feast','Jonah the Prophet'),('Feasts','season_feast','Feasts'); END IF;

  -- ══ H. APOSTLES ══════════════════════════════════════════════════════════
  IF v_in_apostles THEN
    RETURN QUERY VALUES ('ApostlesFast','season_feast','Apostles'' Fast'),('Apostles','season_feast','Apostles'),('Fasts','season_feast','Fasts');
  END IF;
  IF apostles_feast IS NOT NULL AND p_gregorian_date=apostles_feast THEN RETURN QUERY VALUES ('ApostlesFeast','season_feast','Apostles'' Feast'),('Apostles','season_feast','Apostles'),('Feasts','season_feast','Feasts'); END IF;
  -- Fires from the first day of the Apostles' Fast through the last day of Hathor
  -- (the day before Kiahk season starts). v_next_kiahk_start handles the year
  -- rollover: in Coptic months 10-12 the Gregorian year has already passed the
  -- current coptic_year's Kiahk, so we advance to coptic_year+1's Kiahk.
  IF apostles_start IS NOT NULL AND p_gregorian_date >= apostles_start
     AND (v_next_kiahk_start IS NULL OR p_gregorian_date < v_next_kiahk_start) THEN
    RETURN QUERY VALUES ('ApostlesFastToLastDayOfHathor','season_feast','Apostles Fast to Last Day of Hathor');
  END IF;

  -- ══ I. ST. MARY ══════════════════════════════════════════════════════════
  IF v_in_stmary THEN RETURN QUERY VALUES ('StMarysFast','season_feast','St. Mary''s Fast'),('StMaryFast','season_feast','St. Mary''s Fast'),('Fasts','season_feast','Fasts'); END IF;
  IF stmary_feast IS NOT NULL AND p_gregorian_date=stmary_feast THEN RETURN QUERY VALUES ('StMarysFeast','season_feast','St. Mary''s Feast'),('AssumptionStMary','season_feast','Assumption of St. Mary'),('StMaryCommemoration','season_feast','St. Mary Commemoration'),('Feasts','season_feast','Feasts'); END IF;
  IF c_rec.coptic_day=21 THEN RETURN QUERY VALUES ('StMaryCommemoration','season_feast','St. Mary Commemoration'); END IF;

  -- ══ J. NATIVITY FAST ═════════════════════════════════════════════════════
  IF v_in_natfast THEN RETURN QUERY VALUES ('NativityFast','season_feast','Nativity Fast'),('Fasts','season_feast','Fasts'); END IF;

  -- ══ K. PARAMOUN ══════════════════════════════════════════════════════════
  IF v_paramoun_nat THEN RETURN QUERY VALUES ('NativityParamoun','season_feast','Nativity Paramoun'),('ParamounNativity','season_feast','Nativity Paramoun'); END IF;
  IF v_paramoun_theo THEN RETURN QUERY VALUES ('TheophanyParamoun','season_feast','Theophany Paramoun'),('ParamounTheophany','season_feast','Theophany Paramoun'); END IF;

  -- ══ L. KIAHK ═════════════════════════════════════════════════════════════
  IF kiahk_bounds IS NOT NULL AND p_gregorian_date>=kiahk_bounds.season_start AND p_gregorian_date<=kiahk_bounds.season_end THEN
    RETURN QUERY VALUES ('KiahkSeason','season_feast','Kiahk Season');
    IF c_rec.weekday IN ('Monday','Tuesday','Wednesday','Thursday','Friday') THEN RETURN QUERY VALUES ('KiahkWeekdays','season_feast','Kiahk Weekdays'); END IF;
    IF c_rec.weekday IN ('Saturday','Sunday') THEN RETURN QUERY VALUES ('KiahkWeekends','season_feast','Kiahk Weekends'); END IF;
    IF kiahk_sundays IS NOT NULL AND array_length(kiahk_sundays,1)>0 THEN
      FOR k_idx IN 1..array_length(kiahk_sundays,1) LOOP
        k_sun := kiahk_sundays[k_idx];
        IF p_gregorian_date=k_sun THEN
          CASE k_idx
            WHEN 1 THEN RETURN QUERY VALUES ('FirstSundayOfKiahk','season_feast','First Sunday of Kiahk');
            WHEN 2 THEN RETURN QUERY VALUES ('SecondSundayOfKiahk','season_feast','Second Sunday of Kiahk');
            WHEN 3 THEN RETURN QUERY VALUES ('ThirdSundayOfKiahk','season_feast','Third Sunday of Kiahk');
            WHEN 4 THEN RETURN QUERY VALUES ('FourthSundayOfKiahk','season_feast','Fourth Sunday of Kiahk');
            ELSE NULL;
          END CASE;
        END IF;
        tmp_date := CASE WHEN k_idx<array_length(kiahk_sundays,1) THEN kiahk_sundays[k_idx+1] ELSE kiahk_bounds.season_end+1 END;
        IF p_gregorian_date>k_sun AND p_gregorian_date<tmp_date THEN
          CASE k_idx
            WHEN 1 THEN RETURN QUERY VALUES ('FirstWeekOfKiahk','season_feast','First Week of Kiahk');
            WHEN 2 THEN RETURN QUERY VALUES ('SecondWeekOfKiahk','season_feast','Second Week of Kiahk');
            WHEN 3 THEN RETURN QUERY VALUES ('ThirdWeekOfKiahk','season_feast','Third Week of Kiahk');
            WHEN 4 THEN RETURN QUERY VALUES ('FourthWeekOfKiahk','season_feast','Fourth Week of Kiahk');
            ELSE NULL;
          END CASE;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- ══ M. NORMAL FASTING DAYS ═══════════════════════════════════════════════
  IF ( c_rec.weekday IN ('Wednesday','Friday')
       OR v_in_natfast OR v_in_stmary OR v_in_apostles )
     AND NOT v_paramoun_nat AND NOT v_paramoun_theo
     AND NOT v_feast_day
     AND NOT v_in_h50_period
     AND NOT v_in_nativity_period
     AND NOT v_in_theophany_period
     AND NOT v_in_nayrouz_period
     AND NOT EXISTS (
       SELECT 1 FROM calendar.season_ranges sf
       WHERE sf.range_key IN ('lent', 'holy-week')
         AND p_gregorian_date BETWEEN sf.start_date AND sf.end_date
     )
     AND (jonah_start IS NULL OR p_gregorian_date<jonah_start OR p_gregorian_date>=jonah_end)
  THEN
    RETURN QUERY VALUES ('NormalFastingDays','season_feast','Normal Fasting Days');
    IF NOT (v_in_natfast OR v_in_stmary OR v_in_apostles) THEN
      RETURN QUERY VALUES ('Fasts','season_feast','Fasts');
    END IF;
  END IF;

  -- ══ N. JOYFUL 29TH ═══════════════════════════════════════════════════════
  IF c_rec.coptic_day=29 THEN
    RETURN QUERY VALUES ('TwentyNinthCopticMonth','season_feast','29th Coptic Month'),('Joyful29thOfTheMonthRaw','season_feast','Joyful 29th (Raw)');
    IF apostles_start IS NOT NULL AND p_gregorian_date>=apostles_start
       AND (v_next_kiahk_start IS NULL OR p_gregorian_date<v_next_kiahk_start) THEN
      RETURN QUERY VALUES ('Joyful29','season_feast','Joyful 29th'),('Joyful29thOfTheMonth','season_feast','Joyful 29th of the Month');
    END IF;
  END IF;

  -- ══ N2. AGRICULTURAL / WEATHER SEASONS ═══════════════════════════════════
  v_md := c_rec.coptic_month * 100 + c_rec.coptic_day;
  IF v_md >= 1012 OR v_md <= 209 THEN
    RETURN QUERY VALUES ('SeasonOfWater','season_feast','Season of Water');
  ELSIF v_md >= 210 AND v_md <= 510 THEN
    RETURN QUERY VALUES ('SeasonOfPlants','season_feast','Season of Plants');
  ELSE
    RETURN QUERY VALUES ('SeasonOfAir','season_feast','Season of Air');
  END IF;

  -- ══ O. EXACT COPTIC DATE ═════════════════════════════════════════════════
  RETURN QUERY SELECT (c_rec.coptic_month_name||'.'||c_rec.coptic_day::text)::text,'coptic_date'::text,(c_rec.coptic_month_name||' '||c_rec.coptic_day::text)::text;

  -- ══ P. DAY OF WEEK ═══════════════════════════════════════════════════════
  RETURN QUERY VALUES (c_rec.weekday||'s','weekday',c_rec.weekday||'s');
  RETURN QUERY VALUES (c_rec.weekday,'weekday',c_rec.weekday);
  IF c_rec.weekday IN ('Monday','Tuesday','Wednesday','Thursday','Friday') THEN RETURN QUERY VALUES ('Weekdays','weekday','Weekdays'),('Weekday','weekday','Weekday'); END IF;
  IF c_rec.weekday IN ('Saturday','Sunday') THEN RETURN QUERY VALUES ('Weekends','weekday','Weekends'),('Weekend','weekday','Weekend'); END IF;
  IF c_rec.weekday IN ('Sunday','Monday','Tuesday') THEN RETURN QUERY VALUES ('AdamDays','weekday','Adam Days'); END IF;
  IF c_rec.weekday IN ('Wednesday','Thursday','Friday','Saturday') THEN RETURN QUERY VALUES ('VatosDays','weekday','Vatos Days'); END IF;

  -- ══ Q. SAINTS ════════════════════════════════════════════════════════════
  FOR flag_key, flag_type, title_english IN
    SELECT f.condition_key,'saint'::text,f.title_english FROM calendar.fixed_coptic_day_flags f
    WHERE f.coptic_month=c_rec.coptic_month AND f.coptic_day=c_rec.coptic_day
  LOOP RETURN NEXT; END LOOP;

  -- ══ R. ANNUAL ════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM calendar.season_ranges sf
    WHERE sf.range_key IN ('lent', 'holy-week')
      AND p_gregorian_date BETWEEN sf.start_date AND sf.end_date
  ) THEN
    RETURN QUERY VALUES ('Annual','annual','Annual');
  END IF;
END;
$function$
;
