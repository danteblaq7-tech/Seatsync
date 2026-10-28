export const store = {
  roles: [],
  userRoles: [],
  users: [],
  faculties: [],
  departments: [],
  programmes: [],
  academicYears: [],
  semesters: [],
  cohorts: [],
  students: [],
  lecturers: [],
  courses: [],
  venueTypes: [],
  venues: [],
  venueBlocks: [],
  timetableEntries: [],
  academicEvents: [],
  exams: [],
  examCohorts: [],
  examVenueAllocations: [],
  notifications: [],
  auditLogs: [],
  scheduleOverrides: []
}

export const seedSystemData = () => {
  if (store.roles.length > 0) return store

  store.roles.push(
    { id: 1, name: 'ADMIN', description: 'University administrator' },
    { id: 2, name: 'LECTURER', description: 'Academic staff' },
    { id: 3, name: 'STUDENT', description: 'Student account' },
    { id: 4, name: 'CLASS_REP', description: 'Student class representative' }
  )

  store.users.push({
    id: 1,
    first_name: 'System',
    last_name: 'Admin',
    email: 'admin@seatsync.local',
    password_hash:
      '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92tEtyq0sA5C8P2gF7D2K',
    phone_number: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  store.faculties.push({
    id: 1,
    name: 'Faculty of Science',
    code: 'FSC',
    description: 'Scientific disciplines',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  store.departments.push({
    id: 1,
    faculty_id: 1,
    name: 'Department of Computer Science',
    code: 'CS',
    description: 'Computer Science',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  store.programmes.push({
    id: 1,
    department_id: 1,
    name: 'Bachelor of Computer Science',
    code: 'BCS',
    description: 'Undergraduate computer science programme',
    duration_years: 4,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  store.academicYears.push({
    id: 1,
    name: '2026/2027',
    start_date: '2026-09-01',
    end_date: '2027-07-31',
    is_current: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  store.semesters.push({
    id: 1,
    academic_year_id: 1,
    name: 'Semester 1',
    number: 1,
    start_date: '2026-09-01',
    end_date: '2026-12-31',
    is_current: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  store.cohorts.push({
    id: 1,
    programme_id: 1,
    name: '3.1',
    year_number: 3,
    semester_stream: 1,
    student_count: 70,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  store.venueTypes.push({
    id: 1,
    name: 'LECTURE_HALL',
    description: 'Lecture hall',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  store.venues.push({
    id: 1,
    name: 'LH-01',
    code: 'LH-01',
    building: 'Science Block',
    floor: 'Ground Floor',
    room_number: '01',
    capacity: 120,
    venue_type_id: 1,
    status: 'ACTIVE',
    description: 'Main lecture hall',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  store.courses.push({
    id: 1,
    department_id: 1,
    code: 'COMP 321',
    name: 'Distributed Systems',
    description: 'Distributed systems principles and design',
    credit_hours: 3,
    course_level: 3,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })

  return store
}
