-- Ensure the Grade 3–5 skill catalogue is complete.
--
-- The original seed in 20260912190100_seed_skills.sql already lists all 21
-- combinations. This migration is a second, idempotent write of the same
-- natural keys so a hosted database that received the schema but missed the
-- seed — or that lost a row — can be repaired without creating duplicates.
--
-- Application code resolves a mission by (grade_level, skill_code). The
-- codes stay aligned with lib/types.ts and lib/skill-catalogue.ts.

insert into public.skills (subject, grade_level, skill_code, name, description)
values
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

on conflict (grade_level, skill_code) do nothing;
