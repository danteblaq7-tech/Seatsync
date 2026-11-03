import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const databaseName = process.env.DB_NAME || process.env.MYSQL_DATABASE

const run = async () => {
  if (!databaseName) throw new Error('DB_NAME or MYSQL_DATABASE is required.')
  const connection = await db.getConnection()

  try {
    const [columns] = await connection.execute(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'exams'
         AND COLUMN_NAME = 'sitting_group_id' LIMIT 1`,
      [databaseName]
    )
    if (!columns.length) {
      await connection.query(
        'ALTER TABLE exams ADD COLUMN sitting_group_id VARCHAR(80) NULL'
      )
    }
    const [indexes] = await connection.execute(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'exams'
         AND INDEX_NAME = 'idx_exams_sitting_group' LIMIT 1`,
      [databaseName]
    )
    if (!indexes.length) {
      await connection.query(
        'CREATE INDEX idx_exams_sitting_group ON exams (sitting_group_id)'
      )
    }
    console.log('Exam sitting groups migration completed successfully.')
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Exam sitting groups migration failed:', error.message)
  process.exitCode = 1
})
