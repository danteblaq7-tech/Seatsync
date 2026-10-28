import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const databaseName = process.env.DB_NAME || process.env.MYSQL_DATABASE

const columnExists = async columnName => {
  const [rows] = await db.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'cohorts'
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [databaseName, columnName]
  )

  return rows.length > 0
}

const foreignKeyExists = async constraintName => {
  const [rows] = await db.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ?
       AND TABLE_NAME = 'cohorts'
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     LIMIT 1`,
    [databaseName, constraintName]
  )

  return rows.length > 0
}

const run = async () => {
  if (!databaseName) {
    throw new Error('DB_NAME or MYSQL_DATABASE is required.')
  }

  const connection = await db.getConnection()

  try {
    if (!(await columnExists('academic_year_id'))) {
      await connection.query(
        'ALTER TABLE cohorts ADD COLUMN academic_year_id INT NULL AFTER programme_id'
      )
    }

    await connection.query(
      'ALTER TABLE cohorts MODIFY COLUMN year_number INT NULL'
    )
    await connection.query(
      'ALTER TABLE cohorts MODIFY COLUMN semester_stream INT NULL'
    )

    if (!(await foreignKeyExists('fk_cohorts_academic_year'))) {
      await connection.query(
        `ALTER TABLE cohorts
         ADD CONSTRAINT fk_cohorts_academic_year
         FOREIGN KEY (academic_year_id)
         REFERENCES academic_years(id)
         ON DELETE RESTRICT`
      )
    }

    console.log('Cohort compatibility migration completed successfully.')
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Cohort compatibility migration failed:', error.message)
  process.exitCode = 1
})
