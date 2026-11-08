import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const databaseName = process.env.DB_NAME || process.env.MYSQL_DATABASE

const hasTable = async (connection, table) => {
  const [rows] = await connection.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`,
    [databaseName, table]
  )
  return rows.length > 0
}

const hasColumn = async (connection, table, column) => {
  const [rows] = await connection.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [databaseName, table, column]
  )
  return rows.length > 0
}

const hasForeignKey = async (connection, table, name) => {
  const [rows] = await connection.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1`,
    [databaseName, table, name]
  )
  return rows.length > 0
}

const hasIndex = async (connection, table, name) => {
  const [rows] = await connection.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [databaseName, table, name]
  )
  return rows.length > 0
}

const run = async () => {
  if (!databaseName) throw new Error('DB_NAME or MYSQL_DATABASE is required.')
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()
    await connection.query(`CREATE TABLE IF NOT EXISTS semester_types (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      number INT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`)
    await connection.query(`CREATE TABLE IF NOT EXISTS cohort_types (
      id INT AUTO_INCREMENT PRIMARY KEY,
      programme_id INT NOT NULL,
      name VARCHAR(80) NOT NULL,
      study_year INT NOT NULL,
      semester_number INT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cohort_type_programme_stage (programme_id, study_year, semester_number),
      FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT
    )`)
    if (!(await hasIndex(connection, 'semesters', 'uq_semester_id_academic_year'))) {
      await connection.query(
        'ALTER TABLE semesters ADD UNIQUE KEY uq_semester_id_academic_year (id, academic_year_id)'
      )
    }
    await connection.query(`CREATE TABLE IF NOT EXISTS cohort_progressions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cohort_id INT NOT NULL,
      academic_year_id INT NOT NULL,
      semester_id INT NOT NULL,
      cohort_type_id INT NOT NULL,
      student_count INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cohort_progression_semester (cohort_id, semester_id),
      INDEX idx_cohort_progression_period (academic_year_id, semester_id),
      FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE RESTRICT,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
      FOREIGN KEY (semester_id, academic_year_id)
        REFERENCES semesters(id, academic_year_id) ON DELETE RESTRICT,
      FOREIGN KEY (cohort_type_id) REFERENCES cohort_types(id) ON DELETE RESTRICT
    )`)

    for (const [table, position] of [
      ['semesters', 'number'],
      ['units', 'semester_id']
    ]) {
      if (!(await hasColumn(connection, table, 'semester_type_id'))) {
        await connection.query(
          `ALTER TABLE \`${table}\` ADD COLUMN semester_type_id INT NULL AFTER \`${position}\``
        )
      }
    }

    await connection.query(`INSERT INTO semester_types (name, number)
      SELECT MIN(name), number FROM semesters GROUP BY number
      ON DUPLICATE KEY UPDATE name = semester_types.name`)

    await connection.query(`UPDATE semesters s
      JOIN semester_types st ON st.number = s.number
      SET s.semester_type_id = st.id
      WHERE s.semester_type_id IS NULL`)

    await connection.query(`UPDATE units u
      JOIN semesters s ON s.id = u.semester_id
      SET u.semester_type_id = s.semester_type_id
      WHERE u.semester_type_id IS NULL`)

    const [[unmappedSemesters]] = await connection.query(
      'SELECT COUNT(*) AS total FROM semesters WHERE semester_type_id IS NULL'
    )
    const [[unmappedUnits]] = await connection.query(
      'SELECT COUNT(*) AS total FROM units WHERE semester_type_id IS NULL'
    )
    if (Number(unmappedSemesters.total) || Number(unmappedUnits.total)) {
      throw new Error(
        `Academic periods require reconciliation before migration: ${unmappedSemesters.total} actual semesters and ${unmappedUnits.total} units have no semester type.`
      )
    }

    const semesterTypes = await connection.query(
      'SELECT id, name, number FROM semester_types WHERE is_active = TRUE ORDER BY number'
    )
    const programmes = await connection.query(
      'SELECT id, code, duration_years FROM programmes WHERE is_active = TRUE'
    )
    const [existingCohorts] = await connection.query(
      'SELECT programme_id, TRIM(name) AS name FROM cohorts'
    )
    for (const cohort of existingCohorts) {
      const match = /^(.*?)\s+(\d+)\.(\d+)$/.exec(cohort.name)
      if (!match) continue
      const studyYear = Number(match[2])
      const semesterNumber = Number(match[3])
      const programme = programmes[0].find(
        item => Number(item.id) === Number(cohort.programme_id)
      )
      if (!programme || studyYear < 1 || studyYear > Number(programme.duration_years))
        continue
      if (!semesterTypes[0].some(item => Number(item.number) === semesterNumber))
        continue
      await connection.execute(
        `INSERT IGNORE INTO cohort_types
          (programme_id, name, study_year, semester_number)
         VALUES (?, ?, ?, ?)`,
        [cohort.programme_id, cohort.name, studyYear, semesterNumber]
      )
    }
    for (const programme of programmes[0]) {
      const duration = Number(programme.duration_years)
      if (!Number.isInteger(duration) || duration < 1) continue
      for (let studyYear = 1; studyYear <= duration; studyYear += 1) {
        for (const semester of semesterTypes[0]) {
          const label = `${programme.code} ${studyYear}.${semester.number}`
          await connection.execute(
            `INSERT IGNORE INTO cohort_types
              (programme_id, name, study_year, semester_number)
             VALUES (?, ?, ?, ?)`,
            [programme.id, label, studyYear, semester.number]
          )
        }
      }
    }

    for (const [table, constraint] of [
      ['semesters', 'fk_semesters_semester_type'],
      ['units', 'fk_units_semester_type']
    ]) {
      if (!(await hasForeignKey(connection, table, constraint))) {
        await connection.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\`
           FOREIGN KEY (semester_type_id) REFERENCES semester_types(id) ON DELETE RESTRICT`
        )
      }
    }
    if (!(await hasColumn(connection, 'cohorts', 'intake_year'))) {
      await connection.query(
        'ALTER TABLE cohorts ADD COLUMN intake_year INT NULL AFTER academic_year_id'
      )
    }
    if (!(await hasIndex(connection, 'cohorts', 'uq_cohort_programme_intake'))) {
      await connection.query(
        'ALTER TABLE cohorts ADD UNIQUE KEY uq_cohort_programme_intake (programme_id, intake_year)'
      )
    }
    await connection.query('ALTER TABLE units MODIFY COLUMN semester_id INT NULL')
    await connection.query(
      'ALTER TABLE units MODIFY COLUMN semester_type_id INT NOT NULL'
    )
    await connection.query(
      'ALTER TABLE semesters MODIFY COLUMN semester_type_id INT NOT NULL'
    )

    const [[legacyCohortCount]] = await connection.query(
      `SELECT COUNT(*) AS total FROM cohorts c
       WHERE NOT EXISTS (
         SELECT 1 FROM cohort_progressions cp WHERE cp.cohort_id = c.id
       )`
    )
    await connection.commit()
    console.log(
      JSON.stringify(
        {
          migration: 'academic-progression-v1',
          semesterTypes: semesterTypes[0].length,
          programmeTypesGenerated: programmes[0].length,
          legacyCohortsRequiringProgressionReconciliation: Number(
            legacyCohortCount.total
          ),
          note: 'Existing cohort progression was not inferred from cohort academic_year_id or labels.'
        },
        null,
        2
      )
    )
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await db.end()
  }
}

run().catch(error => {
  console.error('Academic progression migration failed:', error.message)
  process.exitCode = 1
})
