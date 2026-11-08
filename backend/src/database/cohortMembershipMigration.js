import dotenv from 'dotenv'
import db from '../config/db.js'

dotenv.config()

const databaseName = process.env.DB_NAME || process.env.MYSQL_DATABASE

const run = async () => {
  if (!databaseName) throw new Error('DB_NAME or MYSQL_DATABASE is required.')
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()
    await connection.query(
      'ALTER TABLE students MODIFY COLUMN cohort_id INT NULL'
    )
    await connection.query(`CREATE TABLE IF NOT EXISTS cohort_profile_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      programme_id INT NOT NULL,
      academic_year_id INT NOT NULL,
      semester_id INT NOT NULL,
      cohort_type_id INT NOT NULL,
      intake_year INT NOT NULL,
      student_count INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      reviewed_by INT NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cohort_profile_request_user (user_id),
      INDEX idx_cohort_profile_requests_status (status, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (programme_id) REFERENCES programmes(id) ON DELETE RESTRICT,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
      FOREIGN KEY (semester_id, academic_year_id)
        REFERENCES semesters(id, academic_year_id) ON DELETE RESTRICT,
      FOREIGN KEY (cohort_type_id) REFERENCES cohort_types(id) ON DELETE RESTRICT,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    )`)
    await connection.query(`CREATE TABLE IF NOT EXISTS cohort_membership_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      cohort_id INT NOT NULL,
      academic_year_id INT NOT NULL,
      semester_id INT NOT NULL,
      cohort_type_id INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      reviewed_by INT NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_membership_request_user (user_id),
      INDEX idx_membership_request_cohort_status (cohort_id, status),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE RESTRICT,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
      FOREIGN KEY (semester_id, academic_year_id)
        REFERENCES semesters(id, academic_year_id) ON DELETE RESTRICT,
      FOREIGN KEY (cohort_type_id) REFERENCES cohort_types(id) ON DELETE RESTRICT,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    )`)
    await connection.query(`CREATE TABLE IF NOT EXISTS lecturer_cohort_types (
      lecturer_id INT NOT NULL,
      cohort_type_id INT NOT NULL,
      PRIMARY KEY (lecturer_id, cohort_type_id),
      FOREIGN KEY (lecturer_id) REFERENCES lecturers(id) ON DELETE CASCADE,
      FOREIGN KEY (cohort_type_id) REFERENCES cohort_types(id) ON DELETE RESTRICT
    )`)
    await connection.commit()
    console.log(
      JSON.stringify(
        {
          migration: 'cohort-membership-v1',
          createdOrVerified: [
            'cohort_profile_requests',
            'cohort_membership_requests',
            'lecturer_cohort_types'
          ]
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
  console.error('Cohort membership migration failed:', error.message)
  process.exitCode = 1
})
