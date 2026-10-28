import { getDashboardSummary } from '../services/dashboard/dashboardService.js'

export const dashboardSummaryController = async (req, res) => {
  try {
    const summary = await getDashboardSummary(req.user)
    res.json({ data: summary })
  } catch (error) {
    console.error('[DASHBOARD_SUMMARY_ERROR]', error)
    res.status(500).json({ message: 'Unable to load dashboard summary.' })
  }
}
