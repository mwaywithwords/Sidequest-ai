-- Seed the skill catalogue: seven math skills across grades 3, 4 and 5.
--
-- This is a migration rather than supabase/seed.sql because these are not
-- sample rows. quests.selected_skill_id and challenges.skill_id are NOT NULL
-- references into this table, so the catalogue has to exist in every
-- environment including production, and supabase/seed.sql only runs on a local
-- `db reset`.
--
-- skill_code matches the SkillId union in lib/types.ts, so application code
-- resolves a row by (grade_level, skill_code) with no mapping table in
-- between. The codes are the stable identifier; name and description are
-- display and prompt material and can be reworded freely.
--
-- Every skill appears in all three grades, which is what the setup screen
-- already offers. What changes per grade is the description, because that is
-- what tells the challenge generator how hard a grade-3 addition problem
-- should be next to a grade-5 one.

insert into public.skills (subject, grade_level, skill_code, name, description)
values
  -- Grade 3 — groups, sharing, and shapes.
  ('math', 3, 'addition', 'Addition',
   'Add within 1,000 using place value and mental strategies.'),
  ('math', 3, 'subtraction', 'Subtraction',
   'Subtract within 1,000, including across zeros.'),
  ('math', 3, 'multiplication', 'Multiplication',
   'Multiply within 100 using equal groups, arrays, and repeated addition.'),
  ('math', 3, 'division', 'Division',
   'Divide within 100 by sharing a total equally into groups.'),
  ('math', 3, 'fractions', 'Fractions',
   'Name unit fractions and fractions of a whole on a number line.'),
  ('math', 3, 'measurement', 'Measurement',
   'Measure and estimate mass, liquid volume, and intervals of time.'),
  ('math', 3, 'geometry', 'Geometry',
   'Identify shapes by their sides and angles, and find perimeter.'),

  -- Grade 4 — bigger numbers and fractions.
  ('math', 4, 'addition', 'Addition',
   'Add multi-digit whole numbers using the standard algorithm.'),
  ('math', 4, 'subtraction', 'Subtraction',
   'Subtract multi-digit whole numbers using the standard algorithm.'),
  ('math', 4, 'multiplication', 'Multiplication',
   'Multiply up to four digits by one digit, and two digits by two digits.'),
  ('math', 4, 'division', 'Division',
   'Divide up to four digits by one digit and interpret the remainder.'),
  ('math', 4, 'fractions', 'Fractions',
   'Recognise equivalent fractions and add or subtract with like denominators.'),
  ('math', 4, 'measurement', 'Measurement',
   'Convert units within one system and solve area and perimeter problems.'),
  ('math', 4, 'geometry', 'Geometry',
   'Classify angles, parallel and perpendicular lines, and line symmetry.'),

  -- Grade 5 — decimals, volume, and area.
  ('math', 5, 'addition', 'Addition',
   'Add decimals to hundredths and fractions with unlike denominators.'),
  ('math', 5, 'subtraction', 'Subtraction',
   'Subtract decimals to hundredths and fractions with unlike denominators.'),
  ('math', 5, 'multiplication', 'Multiplication',
   'Multiply multi-digit whole numbers and decimals to hundredths.'),
  ('math', 5, 'division', 'Division',
   'Divide with two-digit divisors and divide unit fractions by whole numbers.'),
  ('math', 5, 'fractions', 'Fractions',
   'Add, subtract, and multiply fractions, including mixed numbers.'),
  ('math', 5, 'measurement', 'Measurement',
   'Convert among units in one system and find the volume of a prism.'),
  ('math', 5, 'geometry', 'Geometry',
   'Plot points on the coordinate plane and classify figures by property.')

-- Re-runnable: the catalogue is keyed by (grade_level, skill_code), so a
-- replay leaves existing rows and their ids untouched.
on conflict (grade_level, skill_code) do nothing;
