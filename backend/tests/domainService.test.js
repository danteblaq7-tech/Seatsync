import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createFaculty,
  createProgramme,
  createCohort,
  createCourse,
  createVenue
} from '../src/services/academicStructureService.js'
import { createTimetableEntry } from '../src/services/timetableDomainService.js'

test('creates a faculty and programme domain object', () => {
  const faculty = createFaculty({
    name: 'Faculty of Engineering',
    code: 'ENG',
    description: 'Engineering faculty'
  })
  const programme = createProgramme({
    department_id: 1,
    name: 'Bachelor of Software Engineering',
    code: 'BSE',
    description: 'Software engineering',
    duration_years: 4
  })

  assert.equal(faculty.name, 'Faculty of Engineering')
  assert.equal(programme.code, 'BSE')
})

test('prevents overlapping timetable assignment for same venue', () => {
  const existing = {
    venue_id: 1,
    lecturer_id: 2,
    cohort_id: 1,
    start_time: '08:00',
    end_time: '10:00',
    day_of_week: 'MONDAY',
    academic_year_id: 1,
    semester_id: 1,
    course_id: 1,
    venue_capacity: 100,
    expected_students: 60
  }

  const result = createTimetableEntry({
    academic_year_id: 1,
    semester_id: 1,
    course_id: 1,
    venue_id: 1,
    lecturer_id: 2,
    cohort_id: 1,
    start_time: '09:00',
    end_time: '11:00',
    day_of_week: 'MONDAY',
    expected_students: 60,
    venue_capacity: 100,
    existing_events: [
      {
        id: 99,
        venueId: 1,
        lecturerId: 2,
        cohortId: 1,
        startTime: '08:00',
        endTime: '10:00'
      }
    ]
  })

  assert.equal(result.valid, false)
  assert.ok(result.conflicts.some(item => item.type === 'VENUE_CONFLICT'))
})

test('allows a valid timetable entry', () => {
  const result = createTimetableEntry({
    academic_year_id: 1,
    semester_id: 1,
    course_id: 1,
    cohort_id: 1,
    lecturer_id: 2,
    venue_id: 1,
    day_of_week: 'TUESDAY',
    start_time: '08:00',
    end_time: '10:00',
    expected_students: 60,
    venue_capacity: 100
  })

  assert.equal(result.valid, true)
})
