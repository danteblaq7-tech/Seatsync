const isExam = event =>
  String(event?.event_type ?? event?.eventType ?? '').toUpperCase() ===
    'EXAM' || String(event?.id || '').startsWith('exam-')

export const canCompareVenueConflict = (first, second) => {
  const firstIsExam = isExam(first)
  const secondIsExam = isExam(second)
  if (firstIsExam !== secondIsExam) return false

  if (
    firstIsExam &&
    String(first.exam_date ?? first.examDate ?? '').slice(0, 10) !==
      String(second.exam_date ?? second.examDate ?? '').slice(0, 10)
  ) {
    return false
  }

  const firstSitting =
    first.sitting_group_id ?? first.sittingGroupId ?? null
  const secondSitting =
    second.sitting_group_id ?? second.sittingGroupId ?? null
  return !(
    firstIsExam &&
    firstSitting &&
    secondSitting &&
    String(firstSitting) === String(secondSitting)
  )
}
