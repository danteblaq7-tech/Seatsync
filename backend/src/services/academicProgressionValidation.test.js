import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAcademicPeriod } from './academicProgressionValidation.js'

const makeConnection = ({
  period = {
    id: 2,
    academic_year_id: 7,
    semester_type_id: 1,
    number: 1,
    start_date: '2026-01-01',
    end_date: '2026-05-31',
    academic_start_date: '2025-09-01',
    academic_end_date: '2026-08-31'
  },
  unit = {
    id: 12,
    code: 'CSC202',
    name: 'Data Structures',
    semester_type_id: 1,
    year_level: 2
  },
  unitProgrammes = [
    { programme_id: 4, programme_code: 'BSc CS', programme_name: 'Computer Science' }
  ],
  programmes = [],
  assignedTypes = [{ cohort_type_id: 5 }],
  progressions = [
    {
      cohort_id: 9,
      student_count: 21,
      programme_id: 4,
      cohort_type_id: 5,
      study_year: 2,
      semester_number: 1,
      type_programme_id: 4,
      duration_years: 4
    }
  ]
} = {}) => ({
  execute: async sql => {
    if (sql.includes('FROM semesters s')) return [[period]]
    if (sql.includes('FROM units')) return [[unit]]
    if (sql.includes('FROM unit_programmes')) return [unitProgrammes]
    if (sql.includes('FROM programmes')) return [programmes]
    if (sql.includes('FROM cohort_progressions')) return [progressions]
    if (sql.includes('FROM lecturer_cohort_types')) return [assignedTypes]
    throw new Error(`Unexpected validation query: ${sql}`)
  }
})

const validSelection = {
  academicYearId: 7,
  semesterId: 2,
  unitId: 12,
  studyYear: 2,
  programmeIds: [4],
  cohortIds: [9]
}

test('validates reusable unit types and progression counts for a period', async () => {
  const result = await validateAcademicPeriod(
    makeConnection(),
    validSelection
  )

  assert.equal(result.expectedStudents, 21)
  assert.equal(result.progressions[0].cohort_id, 9)
})

test('allows different intake cohorts to share the same cohort type', async () => {
  const result = await validateAcademicPeriod(
    makeConnection({
      progressions: [
        {
          cohort_id: 9,
          student_count: 21,
          programme_id: 4,
          cohort_type_id: 5,
          study_year: 2,
          semester_number: 1,
          type_programme_id: 4,
          duration_years: 4
        },
        {
          cohort_id: 10,
          student_count: 18,
          programme_id: 4,
          cohort_type_id: 5,
          study_year: 2,
          semester_number: 1,
          type_programme_id: 4,
          duration_years: 4
        }
      ]
    }),
    { ...validSelection, cohortIds: [9, 10] }
  )

  assert.equal(result.progressions.length, 2)
  assert.equal(result.expectedStudents, 39)
  assert.equal(
    result.progressions[0].cohort_type_id,
    result.progressions[1].cohort_type_id
  )
})

test('rejects a unit assigned to a different semester type', async () => {
  await assert.rejects(
    validateAcademicPeriod(
      makeConnection({
        unit: {
          id: 12,
          code: 'CSC202',
          name: 'Data Structures',
          semester_type_id: 2,
          year_level: 2
        }
      }),
      validSelection
    ),
    /CSC202 — Data Structures \(ID 12\) does not belong to the selected semester type/
  )
})

test('reports the unit and programme details when a selected programme is not mapped', async () => {
  await assert.rejects(
    validateAcademicPeriod(
      makeConnection({
        unitProgrammes: [
          {
            programme_id: 4,
            programme_code: 'BSc CS',
            programme_name: 'Computer Science'
          }
        ],
        programmes: [
          {
            id: 8,
            code: 'BEng',
            name: 'Engineering'
          }
        ]
      }),
      { ...validSelection, programmeIds: [4, 8] }
    ),
    /CSC202 — Data Structures \(ID 12\).*BEng — Engineering \(ID 8\).*BSc CS — Computer Science \(ID 4\)/
  )
})

test('rejects cohorts with no progression for the selected period', async () => {
  await assert.rejects(
    validateAcademicPeriod(makeConnection({ progressions: [] }), validSelection),
    /Every selected cohort needs a progression record/
  )
})

test('rejects a cohort progression outside its programme duration', async () => {
  await assert.rejects(
    validateAcademicPeriod(
      makeConnection({
        progressions: [
          {
            cohort_id: 9,
            student_count: 21,
            programme_id: 4,
            study_year: 2,
            semester_number: 1,
            type_programme_id: 4,
            duration_years: 1
          }
        ]
      }),
      validSelection
    ),
    /must match the study year, semester, and programme/
  )
})

test('requires a lecturer to be assigned every selected cohort type', async () => {
  await assert.rejects(
    validateAcademicPeriod(
      makeConnection({ assignedTypes: [{ cohort_type_id: 99 }] }),
      { ...validSelection, lecturerId: 3 }
    ),
    /lecturer is not assigned to teach every selected cohort type/
  )

  const result = await validateAcademicPeriod(
    makeConnection(),
    { ...validSelection, lecturerId: 3 }
  )
  assert.equal(result.progressions[0].cohort_type_id, 5)
})

test('requires exam dates to fall within the selected actual semester', async () => {
  await assert.rejects(
    validateAcademicPeriod(makeConnection(), {
      ...validSelection,
      examDate: '2026-06-01'
    }),
    /exam date must fall within the selected semester/
  )
})
