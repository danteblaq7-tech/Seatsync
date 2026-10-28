import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const targets = [
  'cohort_courses',
  'timetable_entries',
  'academic_events',
  'exams'
]

const quoteIdentifier = value => '`' + String(value).replaceAll('`', '``') + '`'

const migrateTable = async (connection, table) => {
  const [columns] = await connection.execute(
    `SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable, COLUMN_TYPE AS type
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       AND COLUMN_NAME IN ('course_id', 'unit_id')`,
    [table]
  )
  const hasOldColumn = columns.some(column => column.name === 'course_id')
  const hasNewColumn = columns.some(column => column.name === 'unit_id')
  if (!hasOldColumn && hasNewColumn) {
    console.log(`${table}: already uses unit_id; skipping.`)
    return
  }
  if (!hasOldColumn) {
    console.log(`${table}: no course_id column; skipping.`)
    return
  }
  if (hasNewColumn) {
    throw new Error(
      `${table} contains both course_id and unit_id; inspect it manually.`
    )
  }

  const [foreignKeys] = await connection.execute(
    `SELECT CONSTRAINT_NAME AS name
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       AND COLUMN_NAME = 'course_id' AND REFERENCED_TABLE_NAME = 'units'
       AND REFERENCED_COLUMN_NAME = 'id'
     LIMIT 1`,
    [table]
  )
  const oldForeignKey = foreignKeys[0]?.name
  if (oldForeignKey) {
    await connection.execute(
      `ALTER TABLE ${quoteIdentifier(table)} DROP FOREIGN KEY ${quoteIdentifier(
        oldForeignKey
      )}`
    )
  }

  await connection.execute(
    `ALTER TABLE ${quoteIdentifier(table)}
     CHANGE COLUMN course_id unit_id INT NOT NULL`
  )
  await connection.execute(
    `ALTER TABLE ${quoteIdentifier(table)}
     ADD CONSTRAINT ${quoteIdentifier(`fk_${table}_unit_id`)}
     FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT`
  )
  console.log(`${table}: renamed course_id to unit_id.`)
}

const run = async () => {
  const connection = await db.getConnection()
  try {
    for (const table of targets) await migrateTable(connection, table)
    console.log(
      'Unit ID column migration completed. Update/verify backups before production use.'
    )
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Unit ID column migration failed:', error.message)
  process.exitCode = 1
})
