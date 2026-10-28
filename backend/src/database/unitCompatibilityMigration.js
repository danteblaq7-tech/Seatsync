import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const databaseName = process.env.DB_NAME
const tableName = 'units'

const hasColumn = async columnName => {
  const [rows] = await db.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [databaseName, tableName, columnName]
  )
  return rows.length > 0
}

const hasForeignKey = async constraintName => {
  const [rows] = await db.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     LIMIT 1`,
    [databaseName, tableName, constraintName]
  )
  return rows.length > 0
}

const run = async () => {
  if (!databaseName) throw new Error('DB_NAME is required.')
  const connection = await db.getConnection()

  try {
    if (!(await hasColumn('programme_id'))) {
      await connection.query(
        'ALTER TABLE units ADD COLUMN programme_id INT NULL AFTER department_id'
      )
    }
    if (!(await hasColumn('semester_id'))) {
      await connection.query(
        'ALTER TABLE units ADD COLUMN semester_id INT NULL AFTER programme_id'
      )
    }
    if (!(await hasColumn('year_level'))) {
      await connection.query(
        'ALTER TABLE units ADD COLUMN year_level INT NULL AFTER description'
      )
    }

    if (await hasColumn('course_level')) {
      await connection.query(`UPDATE units SET year_level = CASE
        WHEN course_level BETWEEN 1 AND 10 THEN course_level
        WHEN course_level >= 100 THEN FLOOR(course_level / 100)
        ELSE 1 END WHERE year_level IS NULL`)
      await connection.query('ALTER TABLE units DROP COLUMN course_level')
    }
    if (await hasColumn('credit_hours')) {
      await connection.query('ALTER TABLE units DROP COLUMN credit_hours')
    }

    await connection.query(
      'ALTER TABLE units MODIFY COLUMN year_level INT NOT NULL'
    )
    if (!(await hasForeignKey('fk_courses_programme'))) {
      await connection.query(`ALTER TABLE units ADD CONSTRAINT fk_courses_programme
        FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT`)
    }
    if (!(await hasForeignKey('fk_courses_semester'))) {
      await connection.query(`ALTER TABLE units ADD CONSTRAINT fk_courses_semester
        FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE RESTRICT`)
    }

    console.log('Unit compatibility migration completed successfully.')
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Unit compatibility migration failed:', error.message)
  process.exitCode = 1
})
