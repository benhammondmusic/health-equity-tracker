import os
import pandas as pd  # type: ignore
from pandas._testing import assert_frame_equal  # type: ignore

import ingestion.standardized_columns as std_col  # type: ignore
import datasources.cdc_restricted_local as cdc  # type: ignore

# TO UPDATE THE GOLDEN DATA FOR THIS TEST PLEASE RUN THE FOLLOWING:
# python cdc_restricted_local.py --dir="../tests/data/cdc_restricted_local" \
#       --prefix="COVID_Cases_Restricted_Detailed_04302021"

# Current working directory.
THIS_DIR = os.path.dirname(os.path.abspath(__file__))

# The raw test data in the data/ directory is available for easier updating in
# spreadsheet form here:
# https://docs.google.com/spreadsheets/d/1idct5vIDleqqQdXZxoyDfr5ymbxr91wRJ0oUBIx2XPU/edit?usp=sharing&resourcekey=0-BkvgsgfjcC8eEYE2tc8WVA
TEST_DIR = os.path.join(THIS_DIR, os.pardir, "data", "cdc_restricted_local")
TEST_DATA = [
    "COVID_Cases_Restricted_Detailed_04302021_Part_1.csv",
    "COVID_Cases_Restricted_Detailed_04302021_Part_2.csv",
]

# Map from geography and demographic to the golden data file.
GOLDEN_DATA = {
    ("state", "race"): os.path.join(TEST_DIR, "cdc_restricted_by_race_state.csv"),
    ("county", "race"): os.path.join(TEST_DIR, "cdc_restricted_by_race_county.csv"),
    ("state", "race_and_age"): os.path.join(TEST_DIR, "cdc_restricted_by_race_and_age_state.csv"),
    ("state", "age"): os.path.join(TEST_DIR, "cdc_restricted_by_age_state.csv"),
    ("county", "age"): os.path.join(TEST_DIR, "cdc_restricted_by_age_county.csv"),
    ("state", "sex"): os.path.join(TEST_DIR, "cdc_restricted_by_sex_state.csv"),
    ("county", "sex"): os.path.join(TEST_DIR, "cdc_restricted_by_sex_county.csv"),
}


GOLDEN_DATA_NATIONAL = os.path.join(TEST_DIR, "cdc_restricted_by_race_and_age_national.csv")


def testKeyMap():
    # Test that the maps' keys are the same.
    dfs = cdc.process_data(TEST_DIR, TEST_DATA)
    expected_dfs = {}
    for key, val in GOLDEN_DATA.items():
        # Set keep_default_na=False so that empty strings are not read as NaN.
        expected_dfs[key] = pd.read_csv(val, dtype=str, keep_default_na=False)

    keys = sorted(list(dfs.keys()))
    expected_keys = sorted(list(expected_dfs.keys()))
    assert keys == expected_keys


def run_test(key):
    dfs = cdc.process_data(TEST_DIR, TEST_DATA)
    expected_df = pd.read_csv(GOLDEN_DATA[key], dtype=str, keep_default_na=False)

    expected_df = expected_df.replace({"nan": ""})

    assert set(dfs[key].columns) == set(expected_df.columns)
    sortby_cols = list(dfs[key].columns)
    assert_frame_equal(
        dfs[key].sort_values(by=sortby_cols).reset_index(drop=True),
        expected_df.sort_values(by=sortby_cols).reset_index(drop=True),
        check_like=True,
    )


def testStateRace():
    key = ("state", "race")
    run_test(key)


def testCountyRace():
    key = ("county", "race")
    run_test(key)


def testStateRaceAndAge():
    key = ("state", "race_and_age")
    run_test(key)


def testStateAge():
    key = ("state", "age")
    run_test(key)


def testCountyAge():
    key = ("county", "age")
    run_test(key)


def testStateSex():
    key = ("state", "sex")
    run_test(key)


def testCountySex():
    key = ("county", "sex")
    run_test(key)


def testGenerateNationalDataset():
    race_age_state = GOLDEN_DATA[("state", "race_and_age")]
    race_age_state_df = pd.read_csv(race_age_state, keep_default_na=False)

    groupby_cols = [std_col.RACE_CATEGORY_ID_COL, std_col.AGE_COL]
    national_df = cdc.generate_national_dataset(race_age_state_df, groupby_cols)
    expected_df = pd.read_csv(
        GOLDEN_DATA_NATIONAL,
        dtype={
            std_col.STATE_FIPS_COL: str,
            std_col.COVID_CASES: int,
        },
        keep_default_na=False,
    )

    national_df = national_df.replace({"nan": ""})

    assert_frame_equal(expected_df, national_df, check_like=True)
