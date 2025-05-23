#!/bin/bash
# shellcheck disable=SC2317

set -eu
set -o pipefail

PROGDIR=""
PROGDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TRACKERDIR=""
TRACKERDIR="$(cd "${PROGDIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${PROGDIR}/.util/print.sh"

function main() {
  local bucket_name
  local data_file
  local data_set
  local all_files
  local tmp_dir
  local option_count=0

  # Parse command line arguments
  while [[ "${#}" -gt 0 ]]; do
    case "${1}" in
      --help|-h)
        usage
        exit 0
        ;;

      --data-file|-f)
        if [[ -z "${2:-}" ]]; then
          util::print::error "you must pass in an argument for --data-file flag"
          usage
          exit 1
        fi
        data_file="${2}"
        ((option_count++))
        shift 2
        ;;

      --data-set|-d)
        if [[ -z "${2:-}" ]]; then
          util::print::error "you must pass in an argument for --data-set flag"
          usage
          exit 1
        fi
        data_set="${2}"
        ((option_count++))
        shift 2
        ;;

      --all|-a)
        all_files="true"
        ((option_count++))
        shift 1
        ;;

      *)
        util::print::error "unknown argument \"${1}\""
        usage
        exit 1
        ;;
    esac
  done

  # Validate that exactly one option is provided
  if [[ "${option_count}" -eq 0 ]]; then
    util::print::error "you must specify --data-file, --data-set, or --all flag"
    usage
    exit 1
  fi

  if [[ "${option_count}" -gt 1 ]]; then
    util::print::error "only one of --data-file, --data-set, or --all flags should be used at a time"
    usage
    exit 1
  fi

  bucket_name=$(gcloud config get-value project | cut -d - -f1)-dev-export

  if [[ "${bucket_name}" == "het-dev-export" ]]; then
    bucket_name="het-data-tables"
  fi

  util::print::info "Setting bucket name to ${bucket_name}"

  tmp_dir=$(mktemp -d)

  if [[ -n "${all_files:-}" ]]; then
    all_files::download "${bucket_name}" "${tmp_dir}"
    tmp_dir::convert "${tmp_dir}"

  elif [[ -n "${data_set:-}" ]]; then
    dataset::download "${bucket_name}" "${data_set}" "${tmp_dir}"
    tmp_dir::convert "${tmp_dir}"

  else
    file::download "${bucket_name}" "${data_file}" "${tmp_dir}"
    file::convert "${tmp_dir}/${data_file}.json"
  fi

  dev_file::edit

  trap 'rm -rf "${tmp_dir}"' EXIT

  util::print::success "Success !!"
}

function usage() {
  cat <<-USAGE
download_data_file [OPTIONS]
Downloads data file(s) from your GCP export bucket into frontend/tmp and updates .env.development for local dev
OPTIONS
  --help            -h  prints the command usage
  --data-file       -f  name of the data file you want to download, without the .json
  --data-set        -d  name of dataset to download all files from (ex 'cdc_restricted_data')
  --all             -a  downloads every file in the export bucket

Note: Only one of --data-file, --data-set, or --all flags should be used at a time.
USAGE
}

function tmp_dir::convert() {
  local tmp_dir
  tmp_dir="${1}"

  for file_path in "${tmp_dir}"/*.json
  do
    file::convert "${file_path}"
  done
}

function file::download() {
  local bucket_name file tmp_dir
  bucket_name="${1}"
  file="${2}"
  tmp_dir="${3}"

  util::print::info "Downloading file from s3"
  gsutil cp "gs://${bucket_name}/${file}.json" "${tmp_dir}/${file}.json"
}

function all_files::download() {
  local bucket_name tmp_dir
  bucket_name="${1}"
  tmp_dir="${2}"

  util::print::info "Downloading file from s3"
  gsutil cp "gs://${bucket_name}/*.json" "${tmp_dir}"
}

function dataset::download() {
  local bucket_name dataset tmp_dir
  bucket_name="${1}"
  dataset="${2}"
  tmp_dir="${3}"

  util::print::info "Downloading all files from dataset: ${dataset}"
  gsutil cp "gs://${bucket_name}/${dataset}-*.json" "${tmp_dir}"
}

function file::convert() {
  local file_path
  file_path="${1}"

  file_name=${file_path##*/}

  util::print::info "Converting ${file_name} from ndjson to normal json"
  sed '1 s/^/[/ ; 2,$ s/^/,/; $ s/$/]/' "${file_path}" > "${TRACKERDIR}/frontend/public/tmp/${file_name}"
}

function dev_file::edit() {
  local file_path file_name dev_string
  dev_string=""
  for file_path in "${TRACKERDIR}"/frontend/public/tmp/*.json
    do
      file_name=${file_path##*/}
      dev_string="${file_name},${dev_string}"
    done
  echo -e "\n\n\n" >> "${TRACKERDIR}/frontend/.env.development"
  echo "VITE_FORCE_STATIC=${dev_string}" >> "${TRACKERDIR}/frontend/.env.development"
}

main "${@:-}"