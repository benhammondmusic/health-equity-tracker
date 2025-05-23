import FaqGroup from './FaqGroup'
import {
  dataFaqGroup,
  definitionsFaqGroup,
  methodsFaqGroup,
} from './FaqsPageData'

export default function FaqsPage() {
  return (
    <>
      <title>Frequently Asked Questions - Health Equity Tracker</title>

      <section
        id='main-content'
        aria-labelledby='main-content'
        tabIndex={-1}
        className='mx-auto flex w-svw max-w-lgXl flex-col justify-center px-8 py-16'
      >
        <h1
          id='main'
          className='font-bold font-sansTitle text-altGreen text-bigHeader leading-lhNormal'
        >
          Frequently Asked Questions
        </h1>
        <FaqGroup title='Methods' faqs={methodsFaqGroup} />
        <FaqGroup title='Data Collection' faqs={dataFaqGroup} />
        <FaqGroup title='Definitions' faqs={definitionsFaqGroup} />
      </section>
    </>
  )
}
