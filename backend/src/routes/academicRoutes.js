import express from 'express'
import {
  getFaculties,
  addFaculty,
  getDepartments,
  addDepartment,
  getProgrammes,
  addProgramme,
  getAcademicYears,
  addAcademicYear,
  getSemesters,
  addSemester,
  getCohorts,
  addCohort,
  editCohort,
  removeCohort,
  getStudents,
  addStudent,
  removeStudent,
  getLecturers,
  getLecturerAcademicDetails,
  editLecturerAcademicDetails,
  removeLecturer,
  getCourses,
  addCourse,
  editCourse,
  removeCourse,
  getVenueTypes,
  addVenueType,
  getVenues,
  addVenue,
  removeVenue,
  editAcademicRecord,
  removeAcademicRecord
} from '../controllers/academicController.js'
import { requireRole } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get(
  '/faculties',
  requireRole('ADMIN', 'LECTURER', 'STUDENT'),
  getFaculties
)
router.post('/faculties', requireRole('ADMIN'), addFaculty)
router.put(
  '/faculties/:id',
  requireRole('ADMIN'),
  editAcademicRecord('faculty')
)
router.delete(
  '/faculties/:id',
  requireRole('ADMIN'),
  removeAcademicRecord('faculty')
)
router.get(
  '/departments',
  requireRole('ADMIN', 'LECTURER', 'STUDENT'),
  getDepartments
)
router.post('/departments', requireRole('ADMIN'), addDepartment)
router.put(
  '/departments/:id',
  requireRole('ADMIN'),
  editAcademicRecord('department')
)
router.delete(
  '/departments/:id',
  requireRole('ADMIN'),
  removeAcademicRecord('department')
)
router.get(
  '/programmes',
  requireRole('ADMIN', 'LECTURER', 'STUDENT'),
  getProgrammes
)
router.post('/programmes', requireRole('ADMIN'), addProgramme)
router.put(
  '/programmes/:id',
  requireRole('ADMIN'),
  editAcademicRecord('programme')
)
router.delete(
  '/programmes/:id',
  requireRole('ADMIN'),
  removeAcademicRecord('programme')
)
router.get(
  '/academic-years',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  getAcademicYears
)
router.post('/academic-years', requireRole('ADMIN'), addAcademicYear)
router.put(
  '/academic-years/:id',
  requireRole('ADMIN'),
  editAcademicRecord('academicYear')
)
router.delete(
  '/academic-years/:id',
  requireRole('ADMIN'),
  removeAcademicRecord('academicYear')
)
router.get(
  '/semesters',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  getSemesters
)
router.post('/semesters', requireRole('ADMIN'), addSemester)
router.put(
  '/semesters/:id',
  requireRole('ADMIN'),
  editAcademicRecord('semester')
)
router.delete(
  '/semesters/:id',
  requireRole('ADMIN'),
  removeAcademicRecord('semester')
)
router.get(
  '/cohorts',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  getCohorts
)
router.post('/cohorts', requireRole('ADMIN'), addCohort)
router.put('/cohorts/:id', requireRole('ADMIN'), editCohort)
router.delete('/cohorts/:id', requireRole('ADMIN'), removeCohort)
router.get(
  '/students',
  requireRole('ADMIN', 'LECTURER', 'STUDENT'),
  getStudents
)
router.post('/students', requireRole('ADMIN'), addStudent)
router.delete('/students/:id', requireRole('ADMIN'), removeStudent)
router.get(
  '/lecturers',
  requireRole('ADMIN', 'LECTURER', 'STUDENT'),
  getLecturers
)
router.get(
  '/lecturers/:id/academic-details',
  requireRole('ADMIN'),
  getLecturerAcademicDetails
)
router.put(
  '/lecturers/:id/academic-details',
  requireRole('ADMIN'),
  editLecturerAcademicDetails
)
router.delete('/lecturers/:id', requireRole('ADMIN'), removeLecturer)
router.get(
  '/courses',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  getCourses
)
router.post('/courses', requireRole('ADMIN'), addCourse)
router.put('/courses/:id', requireRole('ADMIN'), editCourse)
router.delete('/courses/:id', requireRole('ADMIN'), removeCourse)
router.get(
  '/venue-types',
  requireRole('ADMIN', 'LECTURER', 'STUDENT'),
  getVenueTypes
)
router.post('/venue-types', requireRole('ADMIN'), addVenueType)
router.get(
  '/venues',
  requireRole('ADMIN', 'LECTURER', 'STUDENT', 'CLASS_REP'),
  getVenues
)
router.post('/venues', requireRole('ADMIN'), addVenue)
router.delete('/venues/:id', requireRole('ADMIN'), removeVenue)

export default router
