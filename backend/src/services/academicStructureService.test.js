import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAcademicYearPayload } from './academicStructureService.js'

test('academic-year payload accepts legacy start_year and end_year fields', () => {
  const payload = {
    name: '2026/2027',
    start_year: 2026,
    end_year: 2027,
    is_current: true
  }

  assert.deepEqual(normalizeAcademicYearPayload(payload), {
    name: '2026/2027',
    start_date: '2026-01-01',
    end_date: '2027-12-31'
  })
})

test('semester payload accepts legacy semester_number fields', () => {
  const payload = {
    name: 'Semester 2',
    semester_number: 2,
    academic_year_id: 1
  }

  assert.deepEqual(normalizeSemesterPayload(payload), {
    name: 'Semester 2',
    number: 2,
    academic_year_id: 1
  })
})
