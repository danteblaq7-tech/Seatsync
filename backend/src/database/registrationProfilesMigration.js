import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const databaseName = process.env.DB_NAME

const run = async () => {
  if (!databaseName) throw new Error('DB_NAME is required.')
  const connection = await db.getConnection()
  try {
    await connection.query(
      'ALTER TABLE students MODIFY COLUMN cohort_id INT NULL'
    )
    const [currentYearColumn] = await connection.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME = 'current_year'
       LIMIT 1`,
      [databaseName]
    )
    if (!currentYearColumn.length) {
      await connection.query(
        'ALTER TABLE students ADD COLUMN current_year INT NOT NULL DEFAULT 1'
      )
    }
    await connection.query(`CREATE TABLE IF NOT EXISTS lecturer_faculties (
      lecturer_id INT NOT NULL, faculty_id INT NOT NULL,
      PRIMARY KEY (lecturer_id, faculty_id),
      FOREIGN KEY (lecturer_id) REFERENCES lecturers(id) ON DELETE CASCADE,
      FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE RESTRICT
    )`)
    await connection.query(`CREATE TABLE IF NOT EXISTS lecturer_departments (
      lecturer_id INT NOT NULL, department_id INT NOT NULL,
      PRIMARY KEY (lecturer_id, department_id),
      FOREIGN KEY (lecturer_id) REFERENCES lecturers(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
    )`)
    await connection.query(`CREATE TABLE IF NOT EXISTS lecturer_programmes (
      lecturer_id INT NOT NULL, programme_id INT NOT NULL,
      PRIMARY KEY (lecturer_id, programme_id),
      FOREIGN KEY (lecturer_id) REFERENCES lecturers(id) ON DELETE CASCADE,
      FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT
    )`)
    console.log('Registration profile migration completed successfully.')
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Registration profile migration failed:', error.message)
  process.exitCode = 1
})
