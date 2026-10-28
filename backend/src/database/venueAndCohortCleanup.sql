START TRANSACTION;

-- The current cohort form/API uses programme_id, academic_year_id,
-- name, and student_count. These legacy columns are no longer used.
ALTER TABLE cohorts
  DROP COLUMN year_number,
  DROP COLUMN semester_stream;

-- Seed venue types used by the venue creation dropdown.
INSERT INTO venue_types (name, description)
SELECT 'Lecture Hall', 'Large teaching space for lectures'
WHERE NOT EXISTS (
  SELECT 1 FROM venue_types WHERE name = 'Lecture Hall'
);

INSERT INTO venue_types (name, description)
SELECT 'Classroom', 'Standard classroom for teaching sessions'
WHERE NOT EXISTS (
  SELECT 1 FROM venue_types WHERE name = 'Classroom'
);

INSERT INTO venue_types (name, description)
SELECT 'Laboratory', 'Specialized laboratory teaching space'
WHERE NOT EXISTS (
  SELECT 1 FROM venue_types WHERE name = 'Laboratory'
);

INSERT INTO venue_types (name, description)
SELECT 'Computer Lab', 'Computer-equipped laboratory'
WHERE NOT EXISTS (
  SELECT 1 FROM venue_types WHERE name = 'Computer Lab'
);

INSERT INTO venue_types (name, description)
SELECT 'Seminar Room', 'Small room for seminars and discussions'
WHERE NOT EXISTS (
  SELECT 1 FROM venue_types WHERE name = 'Seminar Room'
);

COMMIT;
