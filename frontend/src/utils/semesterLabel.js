export const semesterLabel = (semester, academicYears = []) => {
  const academicYearId = semester.academic_year_id ?? semester.academicYearId
  const academicYear = academicYears.find(
    year => String(year.id) === String(academicYearId)
  )
  const academicYearName =
    academicYear?.name ??
    semester.academicYearName ??
    semester.academic_year_name

  return academicYearName
    ? `${semester.name || 'Semester'} (${academicYearName})`
    : semester.name || 'Semester'
}
