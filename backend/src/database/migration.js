import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import db from '../config/db.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const runMigrations = async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  const statements = sql
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)

  try {
    console.log('Attempting MySQL connection before migration...')
    await db.getConnection()
    console.log('MySQL connected successfully. Running schema migration...')

    for (const statement of statements) {
      await db.query(statement)
    }

    console.log('Migrations executed successfully.')
    return { ok: true, message: 'Migrations executed successfully.' }
  } catch (error) {
    console.error('Migration failed:', error.message)
    return { ok: false, error: error.message }
  }
}

const isCliEntry = process.argv[1] && process.argv[1].includes('migration.js')

if (isCliEntry) {
  const runCli = async () => {
    const result = await runMigrations()

    if (!result.ok) {
      process.exitCode = 1
      return
    }
  }

  runCli()
}
