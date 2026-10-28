-- MANUAL MIGRATION ONLY: back up the database before running.
-- Backend database queries now use unit_id. The frontend/API may continue to
-- send course_id as a compatibility field; it is mapped to unit_id server-side.

DELIMITER //
CREATE PROCEDURE rename_unit_fk_column(
  IN target_table VARCHAR(64),
  IN target_fk VARCHAR(64)
)
BEGIN
  DECLARE fk_name VARCHAR(64) DEFAULT NULL;
  DECLARE column_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = target_table
    AND COLUMN_NAME = 'course_id';

  IF column_exists > 0 THEN
    SELECT CONSTRAINT_NAME INTO fk_name
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = target_table
      AND COLUMN_NAME = 'course_id'
      AND REFERENCED_TABLE_NAME = 'units'
      AND REFERENCED_COLUMN_NAME = 'id'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
      SET @drop_fk_sql = CONCAT(
        'ALTER TABLE `', REPLACE(target_table, '`', '``'),
        '` DROP FOREIGN KEY `', REPLACE(fk_name, '`', '``'), '`'
      );
      PREPARE drop_fk_stmt FROM @drop_fk_sql;
      EXECUTE drop_fk_stmt;
      DEALLOCATE PREPARE drop_fk_stmt;
    END IF;

    SET @rename_column_sql = CONCAT(
      'ALTER TABLE `', REPLACE(target_table, '`', '``'),
      '` CHANGE COLUMN `course_id` `unit_id` INT NOT NULL'
    );
    PREPARE rename_column_stmt FROM @rename_column_sql;
    EXECUTE rename_column_stmt;
    DEALLOCATE PREPARE rename_column_stmt;

    SET @add_fk_sql = CONCAT(
      'ALTER TABLE `', REPLACE(target_table, '`', '``'),
      '` ADD CONSTRAINT `', REPLACE(target_fk, '`', '``'),
      '` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE RESTRICT'
    );
    PREPARE add_fk_stmt FROM @add_fk_sql;
    EXECUTE add_fk_stmt;
    DEALLOCATE PREPARE add_fk_stmt;
  END IF;
END//

CALL rename_unit_fk_column('cohort_courses', 'fk_cohort_courses_unit_id')//
CALL rename_unit_fk_column('timetable_entries', 'fk_timetable_entries_unit_id')//
CALL rename_unit_fk_column('academic_events', 'fk_academic_events_unit_id')//
CALL rename_unit_fk_column('exams', 'fk_exams_unit_id')//
DROP PROCEDURE rename_unit_fk_column//
DELIMITER ;
