import { beforeEach, describe, expect, test } from 'vitest'
import type FakeDataFetcher from '../../testing/FakeDataFetcher'
import {
  autoInitGlobals,
  getDataFetcher,
  resetCacheDebug,
} from '../../utils/globals'
import { type DatasetId, DatasetMetadataMap } from '../config/DatasetMetadata'
import type { MetricId } from '../config/MetricConfigTypes'
import {
  Breakdowns,
  type DemographicType,
  type TimeView,
} from '../query/Breakdowns'
import { MetricQuery, MetricQueryResponse } from '../query/MetricQuery'
import { RACE } from '../utils/Constants'
import { appendFipsIfNeeded } from '../utils/datasetutils'
import { Fips } from '../utils/Fips'
import MaternalMortalityProvider from './MaternalMortalityProvider'

async function ensureCorrectDatasetsDownloaded(
  MaternalMortalityDatasetId: DatasetId,
  baseBreakdown: Breakdowns,
  demographicType: DemographicType,
  timeView: TimeView,
  acsDatasetIds?: DatasetId[],
  metricIds?: MetricId[],
) {
  // if these aren't sent as args, default to []
  metricIds = metricIds || []
  acsDatasetIds = acsDatasetIds || []

  const maternalMortalityProvider = new MaternalMortalityProvider()
  const specificDatasetId = appendFipsIfNeeded(
    MaternalMortalityDatasetId,
    baseBreakdown,
  )
  dataFetcher.setFakeDatasetLoaded(specificDatasetId, [])

  // Evaluate the response with requesting "All" field
  const responseIncludingAll = await maternalMortalityProvider.getData(
    new MetricQuery(
      metricIds,
      baseBreakdown.addBreakdown(demographicType),
      undefined,
      timeView,
    ),
  )

  expect(dataFetcher.getNumLoadDatasetCalls()).toBe(1)

  const consumedDatasetIds = [MaternalMortalityDatasetId]
  consumedDatasetIds.push(...acsDatasetIds)

  expect(responseIncludingAll).toEqual(
    new MetricQueryResponse([], consumedDatasetIds),
  )
}

autoInitGlobals()
const dataFetcher = getDataFetcher() as FakeDataFetcher

describe('MaternalMortalityProvider', () => {
  beforeEach(() => {
    resetCacheDebug()
    dataFetcher.resetState()
    dataFetcher.setFakeMetadataLoaded(DatasetMetadataMap)
  })

  test('National Current and Race Breakdown', async () => {
    await ensureCorrectDatasetsDownloaded(
      'maternal_mortality_data-race_and_ethnicity_national_current',
      Breakdowns.forFips(new Fips('00')),
      RACE,
      'current',
    )
  })

  test('National Historical and Race Breakdown', async () => {
    await ensureCorrectDatasetsDownloaded(
      'maternal_mortality_data-race_and_ethnicity_national_historical',
      Breakdowns.forFips(new Fips('00')),
      RACE,
      'historical',
    )
  })

  test('State Current and Race Breakdown', async () => {
    await ensureCorrectDatasetsDownloaded(
      'maternal_mortality_data-race_and_ethnicity_state_current',
      Breakdowns.forFips(new Fips('08')),
      RACE,
      'current',
    )
  })

  test('State Historical and Race Breakdown', async () => {
    await ensureCorrectDatasetsDownloaded(
      'maternal_mortality_data-race_and_ethnicity_state_historical',
      Breakdowns.forFips(new Fips('08')),
      RACE,
      'historical',
    )
  })
})
