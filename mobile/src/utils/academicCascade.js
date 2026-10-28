/**
 * Shared "uncheck a parent -> prune its children" logic used by the lecturer profile screen
 * and the profile-completion modal (identical in the web app).
 *
 * state  = { facultyIds, departmentIds, programmeIds, unitIds }  (string ids)
 * data   = { departments, programmes, units }
 */
const keep = (state, data) => {
  const departmentIds = state.departmentIds.filter(id => {
    const department = data.departments.find(item => String(item.id) === id)
    return (
      department &&
      state.facultyIds.includes(String(department.faculty_id ?? department.facultyId))
    )
  })
  const programmeIds = state.programmeIds.filter(id => {
    const programme = data.programmes.find(item => String(item.id) === id)
    return (
      programme &&
      departmentIds.includes(String(programme.department_id ?? programme.departmentId))
    )
  })
  const unitIds = state.unitIds.filter(id => {
    const unit = data.units.find(item => String(item.id) === id)
    return unit && (unit.programmeIds || unit.programme_ids || []).some(pid => programmeIds.includes(String(pid)))
  })
  return { ...state, departmentIds, programmeIds, unitIds }
}

const toggleIn = (list, id, checked) =>
  checked ? [...new Set([...list, String(id)])] : list.filter(value => value !== String(id))

export const toggleFaculty = (state, data, id, checked) =>
  keep({ ...state, facultyIds: toggleIn(state.facultyIds, id, checked) }, data)

export const toggleDepartment = (state, data, id, checked) => {
  const next = { ...state, departmentIds: toggleIn(state.departmentIds, id, checked) }
  const programmeIds = next.programmeIds.filter(pid => {
    const programme = data.programmes.find(item => String(item.id) === pid)
    return programme && next.departmentIds.includes(String(programme.department_id ?? programme.departmentId))
  })
  const unitIds = next.unitIds.filter(uid => {
    const unit = data.units.find(item => String(item.id) === uid)
    return unit && (unit.programmeIds || unit.programme_ids || []).some(p => programmeIds.includes(String(p)))
  })
  return { ...next, programmeIds, unitIds }
}

export const toggleProgramme = (state, data, id, checked) => {
  const programmeIds = toggleIn(state.programmeIds, id, checked)
  const unitIds = state.unitIds.filter(uid => {
    const unit = data.units.find(item => String(item.id) === uid)
    return unit && (unit.programmeIds || unit.programme_ids || []).some(p => programmeIds.includes(String(p)))
  })
  return { ...state, programmeIds, unitIds }
}

export const toggleUnit = (state, id, checked) => ({
  ...state,
  unitIds: toggleIn(state.unitIds, id, checked)
})
