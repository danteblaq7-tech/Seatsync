import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const run = async () => {
  const connection = await db.getConnection()
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schedule_drafts (
      id VARCHAR(80) PRIMARY KEY,
      kind VARCHAR(40) NOT NULL,
      payload JSON NOT NULL,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_schedule_drafts_kind_created (kind, created_at),
      INDEX idx_schedule_drafts_owner (created_by),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
    )`)
    console.log('Shared schedule drafts migration completed successfully.')
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Shared schedule drafts migration failed:', error.message)
  process.exitCode = 1
})
