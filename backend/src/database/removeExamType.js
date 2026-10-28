import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const databaseName = process.env.DB_NAME

const run = async () => {
  if (!databaseName) throw new Error('DB_NAME is required.')
  const connection = await db.getConnection()

  try {
    const [columns] = await connection.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'exam_type'
       LIMIT 1`,
      [databaseName]
    )

    if (columns.length) {
      await connection.query('ALTER TABLE exams DROP COLUMN exam_type')
      console.log('Removed exams.exam_type.')
    } else {
      console.log('exams.exam_type is already removed.')
    }
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Exam type migration failed:', error.message)
  process.exitCode = 1
})
