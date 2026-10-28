import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const run = async () => {
  const connection = await db.getConnection()
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS lecturer_units (
      lecturer_id INT NOT NULL,
      unit_id INT NOT NULL,
      PRIMARY KEY (lecturer_id, unit_id),
      FOREIGN KEY (lecturer_id) REFERENCES lecturers(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
    )`)
    console.log('Lecturer units migration completed successfully.')
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Lecturer units migration failed:', error.message)
  process.exitCode = 1
})
