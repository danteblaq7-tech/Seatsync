START TRANSACTION;

ALTER TABLE courses
  ADD COLUMN programme_id INT NULL AFTER department_id,
  ADD COLUMN semester_id INT NULL AFTER programme_id,
  ADD COLUMN year_level INT NULL AFTER description;

UPDATE courses
SET year_level = CASE
  WHEN course_level BETWEEN 1 AND 10 THEN course_level
  WHEN course_level >= 100 THEN FLOOR(course_level / 100)
  ELSE 1
END
WHERE year_level IS NULL;

ALTER TABLE courses
  DROP COLUMN credit_hours,
  DROP COLUMN course_level;

ALTER TABLE courses
  MODIFY COLUMN programme_id INT NOT NULL,
  MODIFY COLUMN semester_id INT NOT NULL,
  MODIFY COLUMN year_level INT NOT NULL;

ALTER TABLE courses
  ADD CONSTRAINT fk_courses_programme
    FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_courses_semester
    FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE RESTRICT;

COMMIT;