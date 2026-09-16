import os
from google.cloud import storage
import vertexai
from vertexai.tuning import sft
from google.oauth2 import service_account

# GCP Details
PROJECT_ID = "mod-trg-1260712-01"
REGION = "us-central1"
BUCKET_NAME = "floorplanner-training-1260712"
LOCAL_DATASET = r"C:\Users\Muhammad Naqi Ejaz\Documents\Temp 23\Archi26\01. Codes\02. Working Codes\260630_0055\ml\auto_plan\tuning_dataset_100.jsonl"
GCS_DESTINATION = "dataset/tuning_dataset_100.jsonl"
KEY_PATH = r"C:\Users\Muhammad Naqi Ejaz\Documents\Temp 23\Archi26\01. Codes\02. Working Codes\260630_0055\ml\auto_plan\gcp_key.json"

def get_credentials():
    if not os.path.exists(KEY_PATH):
        raise FileNotFoundError(f"Service account key not found at {KEY_PATH}")
    return service_account.Credentials.from_service_account_file(KEY_PATH)

def upload_to_gcs(credentials):
    print(f"Initializing Storage Client with service account key for project: {PROJECT_ID}...")
    storage_client = storage.Client(project=PROJECT_ID, credentials=credentials)
    
    # Direct upload (skips bucket metadata checks to bypass project-level storage.buckets.get limits)
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(GCS_DESTINATION)
    print(f"Uploading local dataset {LOCAL_DATASET} to gs://{BUCKET_NAME}/{GCS_DESTINATION}...")
    blob.upload_from_filename(LOCAL_DATASET)
    print("Upload complete!")
    return f"gs://{BUCKET_NAME}/{GCS_DESTINATION}"

def trigger_vertex_tuning(gcs_uri, credentials):
    print(f"Initializing Vertex AI SDK with service account credentials...")
    vertexai.init(project=PROJECT_ID, location=REGION, credentials=credentials)
    
    # Trigger Supervised Fine-Tuning Job using Gemini 3.1 Flash-Lite
    print("Submitting Supervised Fine-Tuning job for gemini-3.1-flash-lite...")
    tuning_job = sft.train(
        source_model="gemini-3.1-flash-lite",
        train_dataset=gcs_uri,
        epochs=3
    )
    print("Job submitted successfully!")
    print(f"Tuning Job ID: {tuning_job.name}")
    print(f"View job status here: https://console.cloud.google.com/vertex-ai/training/tuning-jobs?project={PROJECT_ID}")
    return tuning_job

def main():
    if not os.path.exists(LOCAL_DATASET):
        print(f"Dataset not found at {LOCAL_DATASET}. Make sure preprocess_rplan.py runs successfully first.")
        return
        
    try:
        credentials = get_credentials()
        gcs_uri = upload_to_gcs(credentials)
        trigger_vertex_tuning(gcs_uri, credentials)
    except Exception as e:
        print("Error during execution:", e)

if __name__ == "__main__":
    main()
