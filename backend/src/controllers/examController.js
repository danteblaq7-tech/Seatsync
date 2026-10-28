import { normalizeDateValue, query } from '../repositories/sqlRepository.js'
import { deleteExam } from '../services/exams/examService.js'
import { emitSocketEvent } from '../socket/socketEvents.js'

export const deleteExamController = async (req, res) => {
  try {
    const deleted = await deleteExam(req.params.id, req.user)
    if (!deleted) return res.status(404).json({ message: 'Exam not found.' })
    emitSocketEvent('timetable:changed', {
      action: 'exam-deleted',
      ids: [deleted.id]
    })
    emitSocketEvent('audit:changed', {
      action: 'DELETE',
      entityType: 'exam',
      entityId: deleted.id
    })
    return res.json({ success: true, data: deleted })
  } catch (error) {
    console.error('[EXAM][DELETE_FAILED]', error.message)
    return res
      .status(409)
      .json({ message: error.message || 'Unable to delete exam.' })
  }
}

export const listExamsController = async (req, res) => {
  const rows = await query(`
    SELECT e.*, e.unit_id AS course_id,
      DATE_FORMAT(e.exam_date, '%Y-%m-%d') AS exam_date_iso,
      u.code AS unit_code,
      u.name AS unit_name,
      GROUP_CONCAT(DISTINCT p.name SEPARATOR ', ') AS programme_names,
      GROUP_CONCAT(DISTINCT CONCAT(ec.cohort_id, ':', COALESCE(c.name, 'Cohort'), ':', ec.student_count) SEPARATOR '|') AS cohort_details,
      GROUP_CONCAT(DISTINCT CONCAT(eva.venue_id, ':', COALESCE(v.name, 'Venue'), ':', eva.allocated_capacity, ':', COALESCE(v.capacity, 0)) SEPARATOR '|') AS venue_details
    FROM exams e
    LEFT JOIN units u ON u.id = e.unit_id
    LEFT JOIN unit_programmes up ON up.unit_id = u.id
    LEFT JOIN programmes p ON p.id = up.programme_id
    LEFT JOIN exam_cohorts ec ON ec.exam_id = e.id
    LEFT JOIN cohorts c ON c.id = ec.cohort_id
    LEFT JOIN exam_venue_allocations eva ON eva.exam_id = e.id
    LEFT JOIN venues v ON v.id = eva.venue_id
    GROUP BY e.id
    ORDER BY e.exam_date, e.start_time, e.id
  `)

  const data = rows.map(row => ({
    ...row,
    exam_date: row.exam_date_iso || normalizeDateValue(row.exam_date),
    unitCode: row.unit_code,
    unitName: row.unit_name,
    programmes: row.programme_names,
    cohortDetails: row.cohort_details
      ? String(row.cohort_details)
          .split('|')
          .map(value => {
            const [id, name, studentCount] = value.split(':')
            return { id: Number(id), name, studentCount: Number(studentCount) }
          })
      : [],
    venueDetails: row.venue_details
      ? String(row.venue_details)
          .split('|')
          .map(value => {
            const [id, name, allocatedCapacity, venueCapacity] =
              value.split(':')
            return {
              id: Number(id),
              name,
              capacity: Number(allocatedCapacity),
              venueCapacity: Number(venueCapacity)
            }
          })
      : []
  }))
  res.json({ data })
}
