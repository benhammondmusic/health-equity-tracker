import { useState } from 'react'
import type { DropdownVarId } from '../data/config/DropDownIds'
import { METRIC_CONFIG } from '../data/config/MetricConfig'
import type { DataTypeConfig } from '../data/config/MetricConfigTypes'
import { Fips } from '../data/utils/Fips'
import HetTextArrowLink from '../styles/HetComponents/HetTextArrowLink'
import type { ScrollableHashId } from '../utils/hooks/useStepObserver'
import {
  DATA_CATALOG_PAGE_LINK,
  RACES_AND_ETHNICITIES_LINK,
} from '../utils/internalRoutes'
import {
  getMadLibPhraseText,
  getMadLibWithUpdatedValue,
  getPhraseValue,
  type MadLib,
} from '../utils/MadLibs'
import CompareReport from './CompareReport'
import { Report } from './Report'
import CHLPMapsBanner from './ui/CHLPMapsBanner'
import DefinitionsList from './ui/DefinitionsList'
import IncarceratedChildrenLongAlert from './ui/IncarceratedChildrenLongAlert'
import LifelineAlert from './ui/LifelineAlert'
import { RaceRelabelingsList } from './ui/RaceRelabelingsList'
import VoteDotOrgBanner from './ui/VoteDotOrgBanner'
import WhatDataAreMissing from './WhatDataAreMissing'

interface ReportProviderProps {
  isSingleColumn: boolean
  madLib: MadLib
  handleModeChange: any
  selectedConditions: DataTypeConfig[]
  showLifeLineAlert: boolean
  setMadLib: (madLib: MadLib) => void
  showIncarceratedChildrenAlert: boolean
  showVoteDotOrgBanner: boolean
  showCHLPMapsBanner: boolean
  isScrolledToTop: boolean
  headerScrollMargin: number
  isMobile: boolean
}

function ReportProvider(props: ReportProviderProps) {
  const [reportStepHashIds, setReportStepHashIds] = useState<
    ScrollableHashId[]
  >([])

  // only show determinants that have definitions
  const definedConditions = props.selectedConditions?.filter(
    (condition) => condition?.definition?.text,
  )

  // create a subset of MetricConfig (with top level string + datatype array)
  // that matches only the selected, defined conditions
  const metricConfigSubset = Object.entries(METRIC_CONFIG).filter(
    (dataTypeArray) =>
      dataTypeArray[1].some((dataType) =>
        definedConditions?.includes(dataType),
      ),
  ) as Array<[DropdownVarId, DataTypeConfig[]]>

  let fips1: Fips = new Fips('00')
  let fips2: Fips | null = null

  if (props.madLib.id === 'disparity')
    fips1 = new Fips(getPhraseValue(props.madLib, 3))
  else if (props.madLib.id === 'comparevars')
    fips1 = new Fips(getPhraseValue(props.madLib, 5))
  else if (props.madLib.id === 'comparegeos') {
    fips1 = new Fips(getPhraseValue(props.madLib, 3))
    fips2 = new Fips(getPhraseValue(props.madLib, 5))
  }

  function getReport() {
    const reportTitle = getMadLibPhraseText(props.madLib)
    // Each report has a unique key based on its props so it will create a
    // new instance and reset its state when the provided props change.
    switch (props.madLib.id) {
      case 'disparity': {
        const dropdownOption = getPhraseValue(props.madLib, 1) as DropdownVarId
        return (
          <>
            <Report
              key={dropdownOption}
              dropdownVarId={dropdownOption}
              fips={fips1}
              updateFipsCallback={(fips: Fips) => {
                props.setMadLib(
                  getMadLibWithUpdatedValue(props.madLib, 3, fips.code),
                )
              }}
              isScrolledToTop={props.isScrolledToTop}
              reportStepHashIds={reportStepHashIds}
              setReportStepHashIds={setReportStepHashIds}
              headerScrollMargin={props.headerScrollMargin}
              reportTitle={reportTitle}
              isMobile={props.isMobile}
              trackerMode={props.madLib.id}
              setTrackerMode={props.handleModeChange}
              dataTypesToDefine={metricConfigSubset}
            />
          </>
        )
      }
      case 'comparegeos': {
        const dropdownOption = getPhraseValue(props.madLib, 1) as DropdownVarId
        return (
          fips2 && (
            <CompareReport
              key={dropdownOption + fips1.code + fips2?.code}
              dropdownVarId1={dropdownOption}
              dropdownVarId2={dropdownOption}
              fips1={fips1}
              fips2={fips2}
              updateFips1Callback={(fips: Fips) => {
                props.setMadLib(
                  getMadLibWithUpdatedValue(props.madLib, 3, fips.code),
                )
              }}
              updateFips2Callback={(fips: Fips) => {
                props.setMadLib(
                  getMadLibWithUpdatedValue(props.madLib, 5, fips.code),
                )
              }}
              isScrolledToTop={props.isScrolledToTop}
              reportStepHashIds={reportStepHashIds}
              setReportStepHashIds={setReportStepHashIds}
              headerScrollMargin={props.headerScrollMargin}
              reportTitle={reportTitle}
              isMobile={props.isMobile}
              trackerMode={props.madLib.id}
              setTrackerMode={props.handleModeChange}
            />
          )
        )
      }
      case 'comparevars': {
        const dropdownOption1 = getPhraseValue(props.madLib, 1) as DropdownVarId
        const dropdownOption2 = getPhraseValue(props.madLib, 3) as DropdownVarId
        const updateFips = (fips: Fips) => {
          props.setMadLib(getMadLibWithUpdatedValue(props.madLib, 5, fips.code))
        }
        return (
          <CompareReport
            key={dropdownOption1 + dropdownOption2 + fips1.code}
            dropdownVarId1={dropdownOption1}
            dropdownVarId2={dropdownOption2}
            fips1={fips1}
            fips2={fips2 ?? fips1}
            updateFips1Callback={updateFips}
            updateFips2Callback={updateFips}
            isScrolledToTop={props.isScrolledToTop}
            reportStepHashIds={reportStepHashIds}
            setReportStepHashIds={setReportStepHashIds}
            headerScrollMargin={props.headerScrollMargin}
            reportTitle={reportTitle}
            isMobile={props.isMobile}
            trackerMode={props.madLib.id}
            setTrackerMode={props.handleModeChange}
          />
        )
      }
      default: {
        return <p>Report not found</p>
      }
    }
  }

  return (
    <>
      <div
        className={`mx-auto my-0 w-full ${
          props.isSingleColumn
            ? ' max-w-explore-data-page'
            : 'max-w-explore-data-two-column-page'
        }`}
      >
        {props.showLifeLineAlert && <LifelineAlert />}
        {props.showVoteDotOrgBanner && <VoteDotOrgBanner />}
        {import.meta.env.VITE_CHLP_GRAPHS && props.showCHLPMapsBanner && (
          <CHLPMapsBanner />
        )}
        {props.showIncarceratedChildrenAlert && false && (
          <IncarceratedChildrenLongAlert />
        )}

        {getReport()}
      </div>

      <div className='mt-20 flex min-h-preload-article w-full justify-center bg-white'>
        <aside className='m-8 max-w-explore-data-page text-left sm:m-16 '>
          {/* Display condition definition(s) based on the tracker madlib settings */}
          {definedConditions?.length > 0 && (
            <div className='mb-5'>
              <h2
                id='definitions-missing-data'
                className='scroll-m-0 text-header first-of-type:mt-0 md:scroll-mt-24 '
              >
                Definitions:
              </h2>
              <DefinitionsList dataTypesToDefine={metricConfigSubset} />
              <RaceRelabelingsList />

              <HetTextArrowLink
                link={RACES_AND_ETHNICITIES_LINK}
                linkText='See our methodology'
                containerClassName='w-auto ml-8'
                linkClassName='text-alt-green'
              />
            </div>
          )}

          <h2 className='mt-12 mb-0 text-header '>What data are missing?</h2>

          <p>Unfortunately there are crucial data missing in our sources.</p>
          <HetTextArrowLink
            link={DATA_CATALOG_PAGE_LINK}
            linkText='See our data sources'
            containerClassName='w-auto ml-8'
            linkClassName='text-alt-green'
          />
          <WhatDataAreMissing
            metricConfigSubset={metricConfigSubset}
            fips1={fips1}
            fips2={fips2 ?? undefined}
          />
        </aside>
      </div>
    </>
  )
}

export default ReportProvider
