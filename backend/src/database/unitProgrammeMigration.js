import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const databaseName = process.env.DB_NAME

const hasColumn = async (tableName, columnName) => {
  const [rows] = await db.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [databaseName, tableName, columnName]
  )
  return rows.length > 0
}

const hasTable = async tableName => {
  const [rows] = await db.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [databaseName, tableName]
  )
  return rows.length > 0
}

const hasForeignKey = async constraintName => {
  const [rows] = await db.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'units'
       AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     LIMIT 1`,
    [databaseName, constraintName]
  )
  return rows.length > 0
}

const run = async () => {
  if (!databaseName) throw new Error('DB_NAME is required.')
  const connection = await db.getConnection()

  try {
    if (!(await hasTable('unit_programmes'))) {
      await connection.query(`CREATE TABLE unit_programmes (
        unit_id INT NOT NULL,
        programme_id INT NOT NULL,
        PRIMARY KEY (unit_id, programme_id),
        FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
        FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT
      )`)
    }

    if (await hasColumn('units', 'programme_id')) {
      await connection.query(`INSERT IGNORE INTO unit_programmes (unit_id, programme_id)
        SELECT id, programme_id FROM units WHERE programme_id IS NOT NULL`)
      if (await hasForeignKey('fk_courses_programme')) {
        await connection.query(
          'ALTER TABLE units DROP FOREIGN KEY fk_courses_programme'
        )
      }
      await connection.query('ALTER TABLE units DROP COLUMN programme_id')
    }

    console.log('Unit programme relationship migration completed successfully.')
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Unit programme migration failed:', error.message)
  process.exitCode = 1
})
