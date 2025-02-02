# TODO: Rename our airflow/ as it tries to import from that and not the pip airflow
# pylint: disable=no-name-in-module
from airflow import DAG  # type: ignore
from airflow.utils.dates import days_ago  # type: ignore
from datetime import timedelta

import util

_CENSUS_POP_ESTIMATES_WORKFLOW_ID = "CENSUS_POP_ESTIMATES"
_CENSUS_POP_ESTIMATES_DATASET_NAME = "census_pop_estimates"

default_args = {
    "start_date": days_ago(0),
    "execution_timeout": timedelta(minutes=15),
}

data_ingestion_dag = DAG(
    "census_pop_estimates_ingestion_dag",
    default_args=default_args,
    schedule_interval=None,
    description="Ingestion configuration for Census Population Estimates",
)

census_pop_estimates_bq_payload = util.generate_bq_payload(
    _CENSUS_POP_ESTIMATES_WORKFLOW_ID, _CENSUS_POP_ESTIMATES_DATASET_NAME
)
census_pop_estimates_bq_operator = util.create_bq_ingest_operator(
    "census_pop_estimates_to_bq", census_pop_estimates_bq_payload, data_ingestion_dag
)

census_pop_estimates_exporter_payload_race = {"dataset_name": _CENSUS_POP_ESTIMATES_DATASET_NAME, "demographic": "race"}
census_pop_estimates_exporter_operator_race = util.create_exporter_operator(
    "census_pop_estimates_exporter_race", census_pop_estimates_exporter_payload_race, data_ingestion_dag
)

# Ingestion DAG
(census_pop_estimates_bq_operator >> census_pop_estimates_exporter_operator_race)
