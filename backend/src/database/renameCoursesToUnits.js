import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const databaseName = process.env.DB_NAME

const tableExists = async tableName => {
  const [rows] = await db.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [databaseName, tableName]
  )
  return rows.length > 0
}

const run = async () => {
  if (!databaseName) throw new Error('DB_NAME is required.')
  const connection = await db.getConnection()

  try {
    const hasCourses = await tableExists('courses')
    const hasUnits = await tableExists('units')

    if (hasCourses && !hasUnits) {
      await connection.query('RENAME TABLE courses TO units')
      console.log('Renamed courses table to units.')
    } else if (hasUnits) {
      console.log('Units table already exists; no rename needed.')
    } else {
      throw new Error('Neither courses nor units table exists.')
    }
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Courses-to-units migration failed:', error.message)
  process.exitCode = 1
})
