import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()
const run = async () => {
  const connection = await db.getConnection()
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS timetable_entry_programmes (
      timetable_entry_id INT NOT NULL, programme_id INT NOT NULL,
      PRIMARY KEY (timetable_entry_id, programme_id),
      FOREIGN KEY (timetable_entry_id) REFERENCES timetable_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT
    )`)
    await connection.query(`CREATE TABLE IF NOT EXISTS timetable_entry_cohorts (
      timetable_entry_id INT NOT NULL, cohort_id INT NOT NULL,
      PRIMARY KEY (timetable_entry_id, cohort_id),
      FOREIGN KEY (timetable_entry_id) REFERENCES timetable_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE RESTRICT
    )`)
    await connection.query(`INSERT IGNORE INTO timetable_entry_cohorts (timetable_entry_id, cohort_id)
      SELECT id, cohort_id FROM timetable_entries WHERE cohort_id IS NOT NULL`)
    console.log('Timetable assignment migration completed successfully.')
  } finally {
    connection.release()
    await db.end()
  }
}
run().catch(error => {
  console.error('Timetable assignment migration failed:', error.message)
  process.exitCode = 1
})
