import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()
const databaseName = process.env.DB_NAME

const run = async () => {
  if (!databaseName) throw new Error('DB_NAME is required.')
  const connection = await db.getConnection()
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS unit_departments (
      unit_id INT NOT NULL,
      department_id INT NOT NULL,
      PRIMARY KEY (unit_id, department_id),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
    )`)
    await connection.query(`INSERT IGNORE INTO unit_departments (unit_id, department_id)
      SELECT id, department_id FROM units WHERE department_id IS NOT NULL`)
    console.log(
      'Unit department relationship migration completed successfully.'
    )
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Unit department migration failed:', error.message)
  process.exitCode = 1
})
