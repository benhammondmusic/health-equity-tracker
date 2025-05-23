import type { IDataFrame } from 'data-forge'
import type { TimeSeries, TrendsData } from '../../charts/trendsChart/types'
import type { MetricConfig, MetricId } from '../config/MetricConfigTypes'
import type { DemographicType } from '../query/Breakdowns'
import {
  type DemographicGroup,
  TIME_PERIOD,
  TIME_PERIOD_LABEL,
} from './Constants'
import type { HetRow } from './DatasetTypes'
import { groupIsAll } from './datasetutils'

const MONTHLY_LENGTH = 7
const YEARLY_LENGTH = 4

const MONTHS: Record<string, string> = {
  '01': 'Jan',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Apr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Aug',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dec',
}

/*

Nesting table data into time-series data needed by D3:

Currently BigQuery data is stored in json "rows" where every "column" name is present as a key to that location's value

D3 requires the data in a different format, as a series of nested arrays, per demographic group, per time_period

Before (Table) Example:

[
  {
    "sex": "male",
    "jail_per_100k": 3000,
    "time_period": "2020"
  },
  {
    "sex": "male",
    "jail_per_100k": 2000,
    "time_period": "2021"
  },
  {
    "sex": "female",
    "jail_per_100k": 300,
    "time_period": "2020"
  },
  {
    "sex": "female",
    "jail_per_100k": 200,
    "time_period": "2021"
  }
]

After (Time-Series / D3) Example:

[
  ["male", [["2020", 3000],["2021", 2000]]],
  ["female", [["2020", 300],["2021", 200]]]
]

*/

export function generateConsecutivePeriods(data: HetRow[]): string[] {
  // scan dataset for earliest and latest time_period
  const shippedTimePeriods = data.map((row) => row.time_period).sort()
  const minPeriod = shippedTimePeriods[0]
  const maxPeriod = shippedTimePeriods[shippedTimePeriods.length - 1]
  const consecutivePeriods = []

  // can only plot based on the least specific time periods.
  // However, all "time_periods" should already be same TimeUnit from backend
  const leastPeriodChars = Math.min(
    ...(shippedTimePeriods.map((period) => period.length) as number[]),
  )

  if (leastPeriodChars === MONTHLY_LENGTH) {
    let currentPeriod = minPeriod
    while (currentPeriod <= maxPeriod) {
      consecutivePeriods.push(currentPeriod)
      let [yyyy, mm]: string[] = currentPeriod.split('-')
      const nextMonth: number = +mm + 1
      if (+nextMonth === 13) {
        yyyy = (+yyyy + 1).toString()
        mm = '01'
      } else mm = nextMonth.toString().padStart(2, '0')
      currentPeriod = `${yyyy}-${mm}`
    }
  } else if (leastPeriodChars === YEARLY_LENGTH) {
    let currentPeriod = minPeriod
    while (currentPeriod <= maxPeriod) {
      consecutivePeriods.push(currentPeriod)
      currentPeriod = (+currentPeriod + 1).toString()
    }
  }

  return consecutivePeriods
}

// Some datasets are missing data points at certain time periods
// This function rebuilds the dataset ensuring a row for every time period
// between the earliest and latest date, interpolating nulls as needed
// At this point, data has already been filtered to a single demographic group in a single Fips location and those fields are irrelevant
export function interpolateTimePeriods(data: HetRow[]) {
  const consecutivePeriods = generateConsecutivePeriods(data)
  const interpolatedData = []

  for (const timePeriod of consecutivePeriods) {
    const shippedRow = data.find((row) => row.time_period === timePeriod)

    if (shippedRow) interpolatedData.push(shippedRow)
    else interpolatedData.push({ time_period: timePeriod })
  }

  return interpolatedData
}

/*
Accepts fetched, "known" data, along with all expected groups, the current demographic breakdown type, and a target metric, and restructures the data into the nested array format required by d3 for the time-series charts
*/
export function getNestedData(
  data: HetRow[],
  demographicGroups: DemographicGroup[],
  demographicType: DemographicType,
  metricId: MetricId,
  keepOnlyElectionYears?: boolean,
): TrendsData {
  if (!data.some((row) => row[TIME_PERIOD])) return []

  const nestedRates = demographicGroups.map((group) => {
    let groupRows = data.filter((row) => row[demographicType] === group)
    groupRows = interpolateTimePeriods(groupRows)

    if (keepOnlyElectionYears) {
      groupRows = getElectionYearData(groupRows)
    }

    const groupTimeSeries = groupRows.map((row) => [
      row[TIME_PERIOD],
      row[metricId] != null ? row[metricId] : null,
    ])
    return [group, groupTimeSeries]
  })

  return nestedRates as TrendsData
}

/*
Accepts fetched, prefiltered data that only contains rows with unknown pct_share data, and a target metric, and restructures the data into the nested array format required by d3 for the time-series "unknown bubbles" at the bottom of the charts
*/
export function getNestedUnknowns(
  unknownsData?: HetRow[],
  metricId?: MetricId,
): TimeSeries {
  if (!metricId || !unknownsData) return []
  if (!unknownsData.some((row) => row[TIME_PERIOD])) return []
  unknownsData = interpolateTimePeriods(unknownsData)
  return unknownsData.map((row) => [row[TIME_PERIOD], row[metricId]])
}

/*
To present the data from the visual charts in a more accessible manner (including but not restricted to screen reader users) we need to once again recstructure the data so that each rows represents a time_period, and the columns can present the available demographic groups, along with the "unknown_pct_share" context we present visually in the blue bubbles
*/
export function makeA11yTableData(
  knownsData: HetRow[],
  unknownsData: HetRow[],
  demographicType: DemographicType,
  knownMetric: MetricConfig,
  unknownMetric: MetricConfig | undefined,
  selectedGroups: DemographicGroup[],
  hasUnknowns: boolean,
): HetRow[] {
  const allTimePeriods = Array.from(
    new Set(knownsData.map((row) => row[TIME_PERIOD])),
  ).sort((a, b) => b.localeCompare(a))

  const allDemographicGroups = Array.from(
    new Set(knownsData.map((row) => row[demographicType])),
  )

  const filteredDemographicGroups =
    selectedGroups.length > 0
      ? allDemographicGroups.filter((group) => selectedGroups.includes(group))
      : allDemographicGroups

  const a11yData = allTimePeriods.map((timePeriod) => {
    // each a11y table row is by time_period
    const a11yRow: any = { [TIME_PERIOD_LABEL]: getPrettyDate(timePeriod) }

    // and shows value per demographic group
    for (const group of filteredDemographicGroups) {
      const rowForGroupTimePeriod = knownsData.find(
        (row) =>
          row[demographicType] === group && row[TIME_PERIOD] === timePeriod,
      )
      a11yRow[group] = rowForGroupTimePeriod?.[knownMetric.metricId]
    }

    // along with the unknown pct_share
    if (hasUnknowns && unknownMetric) {
      a11yRow[`${unknownMetric.shortLabel} with unknown ${demographicType}`] =
        unknownsData.find((row) => row[TIME_PERIOD] === timePeriod)?.[
          unknownMetric.metricId
        ]
    }

    return a11yRow
  })

  return a11yData
}

/*
Convert time_period style date YYYY-MM (e.g. "2020-01") to human readable Month Year (e.g. "January 2020"). Strings not matching this format are simply passed through.
*/
export function getPrettyDate(timePeriod: string): string {
  if (!timePeriod) return ''

  // if it's YYYY-MM
  if (timePeriod.length === MONTHLY_LENGTH && timePeriod[4] === '-') {
    const [year, monthNum] = timePeriod?.split('-') || ['', '']

    // skip if non-numerical input
    if (
      Number.isNaN(Number.parseInt(year)) ||
      Number.isNaN(Number.parseInt(monthNum))
    )
      return timePeriod

    return `${MONTHS[monthNum]} ${year}`
  }

  return timePeriod
}

/* Calculate an array of demographic groups who have either the highest or lowest historical averages.  */
export function getMinMaxGroups(data: TrendsData): DemographicGroup[] {
  const groupAveragesOverTime = data.map((groupData) => {
    // exclude ALLs (should only be for CAWP?) from being a Highest or Lowest group
    if (groupIsAll(groupData[0])) {
      return [groupData[0], null]
    }

    const nonNullGroupData = groupData[1].filter(
      (dataPoint) => dataPoint[1] != null,
    )

    const nonNullGroupValues = nonNullGroupData.map((dataPoint) => dataPoint[1])

    const sumOfGroupValues = nonNullGroupValues.reduce((a, b) => a + b, 0)
    const numberOfGroupValues = nonNullGroupValues.length
    const groupAverage =
      Math.round((sumOfGroupValues / numberOfGroupValues) * 10) / 10

    return [groupData[0], groupAverage]
  })

  const values: number[] = groupAveragesOverTime
    .map((row: any) => row[1] as number)
    .filter((value) => value != null)

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)

  const groupsWithHighestAverage = groupAveragesOverTime
    .filter((groupItem: any) => groupItem[1] === maxValue)
    .map((groupItem: any) => groupItem[0])
  const groupsWithLowestAverage = groupAveragesOverTime
    .filter((groupItem: any) => groupItem[1] === minValue)
    .map((groupItem: any) => groupItem[0])

  // The groups are returned in a single array as we don't need to differentiate between which extreme they are to default them on ShareTrends
  const lowestAndHighestGroups = [
    ...groupsWithLowestAverage,
    ...groupsWithHighestAverage,
  ]

  return lowestAndHighestGroups
}

export function getElectionYearData(data: HetRow[]): HetRow[] {
  // this works because the first presidential election year happened to be evenly divisible by 4,
  // and presidential election years have been held every 4 years since
  data = data.filter((row: HetRow) => row[TIME_PERIOD] % 4 === 0)
  return data
}

export function dropRecentPartialMonth(df: IDataFrame): IDataFrame {
  const partialMonth = getMostRecentMonth(df)
  return df.where((row) => row.time_period !== partialMonth)
}

function getMostRecentMonth(df: IDataFrame): string {
  // Convert YYYY-MM strings to Date objects
  const dates = df
    .getSeries('time_period')
    .toArray()
    .map((period) => new Date(`${period}-01`).getTime()) // Get timestamp

  // Find the maximum date
  const maxTimestamp = Math.max(...dates)
  const maxDate = new Date(maxTimestamp)

  // Convert the maximum date back to YYYY-MM format
  const year = maxDate.getUTCFullYear()
  const month = String(maxDate.getUTCMonth() + 1).padStart(2, '0') // getUTCMonth is zero-indexed
  return `${year}-${month}`
}
